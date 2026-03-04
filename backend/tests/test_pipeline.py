# backend/tests/test_pipeline.py
"""
Tests complémentaires du pipeline email.

Complète test_pipeline_e2e.py en testant :
  - auto_reply_enabled=True + filter_decision=accept  → _send_reply appelé
  - auto_reply_enabled=True + filter_decision=ignore  → _send_reply non appelé
  - auto_reply_enabled=False                          → _send_reply non appelé

Note : test_pipeline_e2e.py couvre la création EmailAnalysis / TenantFile.
"""
import asyncio
import os
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("JWT_SECRET_KEY", "test-jwt-secret-key-for-testing-only-32c")
os.environ.setdefault("OAUTH_STATE_SECRET", "test-oauth-state-secret-key-for-hmac")
os.environ.setdefault("FERNET_KEY", "RrdcRxBr2IIxHpfU6EBYxNPAp0Hk_j0-z-9nEaFWJgo=")
os.environ.setdefault("WATCHER_SECRET", "test-watcher-secret")
os.environ.setdefault("MISTRAL_API_KEY", "test-mistral-api-key")
os.environ.setdefault("RESEND_API_KEY", "test-resend-api-key")
os.environ.setdefault("RESEND_FROM_EMAIL", "noreply@test.com")
os.environ.setdefault("GOOGLE_OAUTH_CLIENT_ID", "test-google-client-id")
os.environ.setdefault("GOOGLE_OAUTH_CLIENT_SECRET", "test-google-client-secret")
os.environ.setdefault("FRONTEND_URL", "http://localhost:5173")
os.environ.setdefault("BACKEND_URL", "http://localhost:8000")

from app.database.models import Base, AppSettings
from app.services.email_pipeline import run_email_pipeline
from app.services.email_service import EmailAnalysisResult, EmailReplyResult

MOCK_EMAIL_RESULT = EmailAnalysisResult(
    category="dossier_locataire",
    urgency="normal",
    is_devis=False,
    summary="Candidature.",
    suggested_title="Candidature",
    raw_ai_text="{}",
    candidate_name="Test User",
)

MOCK_REPLY_RESULT = EmailReplyResult(
    reply="Bonjour, nous avons bien reçu votre candidature.",
    raw_ai_text="{}",
)

BASE_PAYLOAD = {
    "agency_id": 1,
    "from_email": "candidat@example.com",
    "subject": "Candidature location",
    "content": "Bonjour, je souhaite louer votre appartement.",
    "attachments": [],
    "send_email": False,
}


def _make_engine_with_auto_reply(enabled: bool):
    """Crée une DB SQLite in-memory avec AppSettings (agency_id=1)."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = Session()
    session.add(AppSettings(
        agency_id=1,
        company_name="Test",
        tone="professionnel",
        signature="",
        auto_reply_enabled=enabled,
        auto_reply_delay_minutes=0,
    ))
    session.commit()
    session.close()
    return engine, Session


def _run_pipeline_with_send_mock(TestSession, payload) -> MagicMock:
    """Exécute le pipeline et retourne le mock de _send_reply."""
    mock_send = MagicMock()
    with (
        patch("app.services.email_pipeline.SessionLocal", TestSession),
        patch("app.services.email_pipeline.analyze_email", return_value=MOCK_EMAIL_RESULT),
        patch("app.services.email_pipeline.generate_reply", return_value=MOCK_REPLY_RESULT),
        patch("app.services.email_pipeline.upload_file"),
        patch("app.services.email_pipeline._send_reply", mock_send),
        patch("app.services.email_pipeline._notify_agent_new_dossier"),
    ):
        asyncio.run(run_email_pipeline(payload))
    return mock_send


class TestAutoReply:
    """Tests de la logique auto_reply_enabled."""

    def test_auto_reply_envoyé_quand_activé_et_accept(self):
        """auto_reply_enabled=True + filter_decision=accept → _send_reply appelé."""
        _, TestSession = _make_engine_with_auto_reply(enabled=True)
        payload = {**BASE_PAYLOAD, "filter_decision": "accept"}

        mock_send = _run_pipeline_with_send_mock(TestSession, payload)

        mock_send.assert_called_once()

    def test_auto_reply_non_envoyé_quand_filter_ignore(self):
        """auto_reply_enabled=True + filter_decision=ignore → _send_reply non appelé."""
        _, TestSession = _make_engine_with_auto_reply(enabled=True)
        payload = {**BASE_PAYLOAD, "filter_decision": "ignore"}

        mock_send = _run_pipeline_with_send_mock(TestSession, payload)

        mock_send.assert_not_called()

    def test_auto_reply_non_envoyé_quand_désactivé(self):
        """auto_reply_enabled=False → _send_reply non appelé même si filter=accept."""
        _, TestSession = _make_engine_with_auto_reply(enabled=False)
        payload = {**BASE_PAYLOAD, "filter_decision": "accept"}

        mock_send = _run_pipeline_with_send_mock(TestSession, payload)

        mock_send.assert_not_called()
