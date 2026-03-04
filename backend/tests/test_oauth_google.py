# backend/tests/test_oauth_google.py
"""
Tests OAuth Google : login redirect, callback état invalide, exchange-token.

Note : les appels réels vers Google sont mockés.
"""
import pytest


class TestGoogleLogin:
    """GET /auth/google/login"""

    def test_retourne_redirect_vers_google(self, client):
        # Ne pas suivre les redirects pour vérifier la destination
        resp = client.get("/auth/google/login", follow_redirects=False)
        # Soit 302 redirect, soit 200 avec auth_url dans le body
        assert resp.status_code in (200, 302, 307)
        if resp.status_code == 200:
            body = resp.json()
            assert "auth_url" in body or "url" in body
        else:
            location = resp.headers.get("location", "")
            assert "google" in location.lower() or "accounts" in location.lower()


class TestGoogleCallback:
    """GET /auth/google/callback"""

    def test_sans_code_retourne_erreur(self, client):
        resp = client.get("/auth/google/callback", follow_redirects=False)
        # Doit rejeter la requête sans paramètres valides
        assert resp.status_code in (400, 302, 307, 422)

    def test_state_invalide_retourne_erreur(self, client):
        resp = client.get(
            "/auth/google/callback",
            params={"code": "fake_code", "state": "tampered_state"},
            follow_redirects=False,
        )
        # État HMAC invalide → erreur
        assert resp.status_code in (400, 302, 307, 422)


class TestGoogleExchangeToken:
    """GET /auth/google/exchange-token"""

    def test_sans_cookie_retourne_401_ou_redirect(self, client):
        resp = client.get("/auth/google/exchange-token", follow_redirects=False)
        # Aucun oauth_token cookie → erreur ou redirect login
        assert resp.status_code in (401, 403, 302, 307, 422)
