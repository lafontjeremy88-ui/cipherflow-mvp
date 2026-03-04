# backend/tests/test_auth.py
"""
Tests d'authentification : register, login, refresh, logout.

Happy path + cas d'erreur critiques.
"""
import pytest
from app.database.models import User, RefreshToken


class TestRegister:
    """POST /auth/register"""

    def test_success_crée_user_et_agence(self, client, db_session):
        resp = client.post("/auth/register", json={
            "email": "nouveau@test.com",
            "password": "TestPass123!",
        })
        assert resp.status_code == 200
        assert "message" in resp.json()

        user = db_session.query(User).filter(User.email == "nouveau@test.com").first()
        assert user is not None
        # role peut être un str ou un enum selon le driver DB
        role_val = user.role.value if hasattr(user.role, "value") else user.role
        assert role_val == "agency_admin"
        assert user.email_verified is False  # doit vérifier son email

    def test_email_dupliqué_retourne_400(self, client, test_user):
        resp = client.post("/auth/register", json={
            "email": test_user.email,
            "password": "TestPass123!",
        })
        assert resp.status_code == 400

    def test_mot_de_passe_faible_retourne_400(self, client):
        resp = client.post("/auth/register", json={
            "email": "weak@test.com",
            "password": "123",
        })
        assert resp.status_code == 400


class TestLogin:
    """POST /auth/login"""

    def test_success_retourne_access_token(self, client, test_user):
        resp = client.post("/auth/login", json={
            "email": test_user.email,
            "password": "TestPass123!",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data["user_email"] == test_user.email

    def test_mauvais_mot_de_passe_retourne_400(self, client, test_user):
        resp = client.post("/auth/login", json={
            "email": test_user.email,
            "password": "WrongPass999!",
        })
        assert resp.status_code == 400

    def test_email_inexistant_retourne_400(self, client):
        resp = client.post("/auth/login", json={
            "email": "inexistant@test.com",
            "password": "TestPass123!",
        })
        assert resp.status_code == 400

    def test_email_non_verifie_retourne_403(self, client, db_session, test_agency):
        from app.security import get_password_hash
        from app.database.models import UserRole

        unverified = User(
            email="unverified@test.com",
            hashed_password=get_password_hash("TestPass123!"),
            agency_id=test_agency.id,
            role=UserRole.AGENT,
            email_verified=False,
        )
        db_session.add(unverified)
        db_session.commit()

        resp = client.post("/auth/login", json={
            "email": "unverified@test.com",
            "password": "TestPass123!",
        })
        assert resp.status_code == 403


class TestRefresh:
    """POST /auth/refresh"""

    def test_refresh_retourne_nouveau_token(self, client, test_user):
        # Login pour obtenir le cookie refresh_token
        login_resp = client.post("/auth/login", json={
            "email": test_user.email,
            "password": "TestPass123!",
        })
        assert login_resp.status_code == 200

        # Refresh via le cookie
        refresh_resp = client.post("/auth/refresh")
        assert refresh_resp.status_code == 200
        data = refresh_resp.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data["user_email"] == test_user.email

    def test_refresh_sans_cookie_retourne_401(self, client, test_user):
        # Aucun cookie refresh_token présent
        resp = client.post("/auth/refresh", cookies={})
        assert resp.status_code == 401


class TestLogout:
    """POST /auth/logout"""

    def test_logout_révoque_refresh_token(self, client, db_session, test_user):
        # Login
        client.post("/auth/login", json={
            "email": test_user.email,
            "password": "TestPass123!",
        })

        # Logout
        resp = client.post("/auth/logout")
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

        # Vérifier que le refresh_token est révoqué en base
        rt = db_session.query(RefreshToken).filter(
            RefreshToken.user_id == test_user.id
        ).first()
        if rt:
            assert rt.revoked_at is not None
