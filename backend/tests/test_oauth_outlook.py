# backend/tests/test_oauth_outlook.py
"""
Tests OAuth Outlook : connect, status, disconnect, callback.

Note : les appels réels vers Microsoft Graph sont mockés.
"""
import pytest
from app.database.models import AgencyEmailConfig
from app.core.security_utils import fernet_encrypt_str


class TestOutlookConnect:
    """GET /outlook/connect"""

    def test_sans_auth_retourne_401(self, client):
        resp = client.get("/outlook/connect")
        assert resp.status_code == 401

    def test_avec_auth_retourne_auth_url(self, client, auth_headers, test_user):
        resp = client.get("/outlook/connect", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "auth_url" in data
        assert "microsoftonline.com" in data["auth_url"]


class TestOutlookStatus:
    """GET /outlook/status"""

    def test_non_connecté_retourne_connected_false(self, client, auth_headers, test_user):
        resp = client.get("/outlook/status", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["connected"] is False

    def test_connecté_retourne_connected_true(self, client, db_session, auth_headers, test_user):
        # Simuler une config Outlook existante
        config = AgencyEmailConfig(
            agency_id=test_user.agency_id,
            outlook_email="agency@outlook.com",
            outlook_access_token=fernet_encrypt_str("fake_access_token"),
            outlook_refresh_token=fernet_encrypt_str("fake_refresh_token"),
        )
        db_session.add(config)
        db_session.commit()

        resp = client.get("/outlook/status", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["connected"] is True
        assert data["email"] == "agency@outlook.com"


class TestOutlookDisconnect:
    """POST /outlook/disconnect"""

    def test_sans_auth_retourne_401(self, client):
        resp = client.post("/outlook/disconnect")
        assert resp.status_code == 401

    def test_déconnexion_supprime_tokens(self, client, db_session, auth_headers, test_user):
        config = AgencyEmailConfig(
            agency_id=test_user.agency_id,
            outlook_email="agency@outlook.com",
            outlook_access_token=fernet_encrypt_str("fake_access_token"),
            outlook_refresh_token=fernet_encrypt_str("fake_refresh_token"),
        )
        db_session.add(config)
        db_session.commit()

        resp = client.post("/outlook/disconnect", headers=auth_headers)
        assert resp.status_code == 200

        db_session.refresh(config)
        assert config.outlook_access_token is None
        assert config.outlook_refresh_token is None
        assert config.outlook_email is None


class TestOutlookCallback:
    """GET /outlook/callback"""

    def test_state_manquant_retourne_erreur(self, client):
        resp = client.get(
            "/outlook/callback",
            params={"code": "fake_code"},
            follow_redirects=False,
        )
        assert resp.status_code in (400, 302, 307, 422)

    def test_state_invalide_retourne_erreur(self, client):
        resp = client.get(
            "/outlook/callback",
            params={"code": "fake_code", "state": "invalid_state_value"},
            follow_redirects=False,
        )
        assert resp.status_code in (400, 302, 307, 422)
