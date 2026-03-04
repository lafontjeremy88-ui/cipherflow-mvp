# backend/tests/test_webhook.py
"""
Tests du webhook email : authentification + résolution d'alias.

POST /webhook/email
  - Secret valide  → job enqueued (Redis mocké)
  - Secret invalide → 403
  - Secret vide    → 403
  - Alias inconnu  → 422
"""
import os
import pytest
from unittest.mock import patch, MagicMock

# Lu depuis l'env pour correspondre exactement à ce qu'a chargé app.main
WATCHER_SECRET = os.environ.get("WATCHER_SECRET", "test-secret-ci")

BASE_PAYLOAD = {
    "from_email": "candidat@test.com",
    "to_email": "inbox+testagency@cipherflow.io",
    "subject": "Candidature location",
    "content": "Bonjour, je candidate pour l'appartement.",
    "send_email": False,
    "attachments": [],
    "agency_id": None,
}


def _post_webhook(client, payload, secret=WATCHER_SECRET):
    return client.post(
        "/webhook/email",
        json=payload,
        headers={"X-Watcher-Secret": secret},
    )


def _mock_redis_queue():
    """Context managers pour mocker Redis + RQ (importés inline dans main.py)."""
    mock_job = MagicMock()
    mock_job.id = "test-job-123"
    mock_q = MagicMock()
    mock_q.enqueue.return_value = mock_job
    return (
        patch("redis.from_url", return_value=MagicMock()),
        patch("rq.Queue", return_value=mock_q),
    )


# ══════════════════════════════════════════════════════════════════════════════
# 🔒 Authentification
# ══════════════════════════════════════════════════════════════════════════════

class TestWebhookAuthentification:

    def test_secret_invalide_retourne_403(self, client):
        resp = _post_webhook(client, BASE_PAYLOAD, secret="mauvais_secret")
        assert resp.status_code == 403

    def test_secret_vide_retourne_403(self, client):
        resp = _post_webhook(client, BASE_PAYLOAD, secret="")
        assert resp.status_code == 403

    def test_sans_header_secret_retourne_403(self, client):
        resp = client.post("/webhook/email", json=BASE_PAYLOAD)
        assert resp.status_code == 403


# ══════════════════════════════════════════════════════════════════════════════
# 🏢 Résolution d'agence
# ══════════════════════════════════════════════════════════════════════════════

class TestWebhookResolutionAgence:

    def test_alias_inconnu_retourne_422(self, client, db_session):
        """Alias non résolu → 422 (nécessite la DB de test via patch SessionLocal)."""
        payload = {**BASE_PAYLOAD, "to_email": "inbox+aliasbidonxyz@cipherflow.io"}

        # Le handler importe SessionLocal inline : on patche à la source
        with patch(
            "app.database.database.SessionLocal",
            side_effect=lambda: db_session,
        ):
            resp = _post_webhook(client, payload)

        assert resp.status_code == 422

    def test_agency_id_explicit_bypasse_resolution(self, client):
        """agency_id fourni → pas de lookup DB, job enqueued."""
        payload = {**BASE_PAYLOAD, "agency_id": 1}

        p_redis, p_queue = _mock_redis_queue()
        with p_redis, p_queue:
            resp = _post_webhook(client, payload)

        assert resp.status_code == 200
        assert resp.json()["status"] == "queued"

    def test_secret_valide_avec_alias_résolu(self, client, db_session, test_agency):
        """Alias correspondant à test_agency → job enqueued."""
        payload = {
            **BASE_PAYLOAD,
            "to_email": f"inbox+{test_agency.email_alias}@cipherflow.io",
            "agency_id": None,
        }

        p_redis, p_queue = _mock_redis_queue()
        with patch(
            "app.database.database.SessionLocal",
            side_effect=lambda: db_session,
        ):
            with p_redis, p_queue:
                resp = _post_webhook(client, payload)

        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "queued"
        assert "job_id" in data
