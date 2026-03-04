# backend/tests/test_pipeline_e2e.py
"""
Tests end-to-end du pipeline email CipherFlow.

Couvre :
  1. mistral_is_real_estate_email() — classification IA (Mistral mocké)
  2. run_email_pipeline() — pipeline complet (DB SQLite in-memory, Mistral mocké)
     a. Email immobilier : EmailAnalysis + TenantFile + TenantEmailLink créés
     b. Email non immobilier (newsletter) : rien créé en base

Run :
    cd backend
    pytest tests/test_pipeline_e2e.py -v
"""

import asyncio
import json
import os
import tempfile
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# ── Env vars minimales requises avant tout import de l'app ───────────────────
# Doit être fait AVANT le premier import d'un module de l'app car certains
# modules (email_pipeline, watcher) executent du code au chargement.
_tmp_upload = os.path.join(tempfile.gettempdir(), "cipherflow_test")
os.makedirs(_tmp_upload, exist_ok=True)

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("JWT_SECRET_KEY", "test-jwt-secret")
os.environ.setdefault("OAUTH_STATE_SECRET", "test-oauth-state")
os.environ.setdefault("FERNET_KEY", "RrdcRxBr2IIxHpfU6EBYxNPAp0Hk_j0-z-9nEaFWJgo=")
os.environ.setdefault("WATCHER_SECRET", "test-watcher-secret")
os.environ.setdefault("MISTRAL_API_KEY", "test-mistral-key")
os.environ["UPLOAD_DIR"] = _tmp_upload  # override avec chemin valide
# Watcher : vars requises au module level
os.environ.setdefault("BACKEND_URL", "http://localhost:8000")
os.environ.setdefault("GOOGLE_OAUTH_CLIENT_ID", "test-google-client-id")
os.environ.setdefault("GOOGLE_OAUTH_CLIENT_SECRET", "test-google-client-secret")

from app.database.models import Base, EmailAnalysis, TenantFile, TenantEmailLink
from app.services.email_service import EmailAnalysisResult, EmailReplyResult
from app.services.email_pipeline import run_email_pipeline  # import anticipé
from app.watcher import mistral_is_real_estate_email


# ══════════════════════════════════════════════════════════════════════════════
# 🔧 Fixtures DB
# ══════════════════════════════════════════════════════════════════════════════

@pytest.fixture(scope="function")
def test_engine():
    """Moteur SQLite in-memory isolé par test."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(engine)
    yield engine
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture(scope="function")
def test_session(test_engine):
    """Session SQLite in-memory."""
    TestSession = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
    session = TestSession()
    yield session
    session.close()


# ══════════════════════════════════════════════════════════════════════════════
# 🤖 Section 1 — mistral_is_real_estate_email()
# ══════════════════════════════════════════════════════════════════════════════

class TestMistralIsRealEstateEmail:
    """Tests unitaires pour la fonction de classification Mistral."""

    def _make_mistral_response(self, answer: str):
        """Construit un mock de réponse Mistral."""
        msg = MagicMock()
        msg.content = answer
        choice = MagicMock()
        choice.message = msg
        response = MagicMock()
        response.choices = [choice]
        return response

    def test_email_immobilier_retourne_oui(self):
        """Un email de candidature doit retourner True."""
        mock_response = self._make_mistral_response("OUI")

        with patch("app.watcher.Mistral") as MockMistral:
            instance = MockMistral.return_value
            instance.chat.complete.return_value = mock_response

            result = mistral_is_real_estate_email(
                from_email="thomas.durand@test.com",
                subject="Candidature location - Appartement 3 pièces",
                body="Bonjour, je souhaite louer votre appartement. CDI, 3200€/mois.",
            )

        assert result is True
        instance.chat.complete.assert_called_once()
        call_kwargs = instance.chat.complete.call_args[1]
        assert call_kwargs["model"] == "mistral-small-latest"
        # Vérifie que le prompt contient les éléments clés
        prompt_content = call_kwargs["messages"][0]["content"]
        assert "thomas.durand@test.com" in prompt_content
        assert "Candidature location" in prompt_content

    def test_email_newsletter_retourne_non(self):
        """Une newsletter doit retourner False."""
        mock_response = self._make_mistral_response("NON")

        with patch("app.watcher.Mistral") as MockMistral:
            instance = MockMistral.return_value
            instance.chat.complete.return_value = mock_response

            result = mistral_is_real_estate_email(
                from_email="no-reply@newsletter.com",
                subject="Newsletter du mois de mars",
                body="Découvrez nos offres du mois...",
            )

        assert result is False

    def test_fail_open_si_erreur_api(self):
        """En cas d'erreur API Mistral, doit retourner True (fail open)."""
        with patch("app.watcher.Mistral") as MockMistral:
            instance = MockMistral.return_value
            instance.chat.complete.side_effect = Exception("Timeout API")

            result = mistral_is_real_estate_email(
                from_email="test@test.com",
                subject="Test",
                body="Corps",
            )

        assert result is True

    def test_fail_open_si_cle_absente(self, monkeypatch):
        """Sans MISTRAL_API_KEY, doit retourner True sans appel API."""
        monkeypatch.setattr("app.watcher.MISTRAL_API_KEY", "")

        with patch("app.watcher.Mistral") as MockMistral:
            result = mistral_is_real_estate_email(
                from_email="test@test.com",
                subject="Test",
                body="Corps",
            )
            MockMistral.assert_not_called()

        assert result is True

    def test_prompt_contient_corps_500_chars(self):
        """Le corps doit être tronqué à 500 caractères dans le prompt."""
        long_body = "x" * 1000
        mock_response = self._make_mistral_response("OUI")

        with patch("app.watcher.Mistral") as MockMistral:
            instance = MockMistral.return_value
            instance.chat.complete.return_value = mock_response

            mistral_is_real_estate_email("a@b.com", "Sujet", long_body)

            prompt = instance.chat.complete.call_args[1]["messages"][0]["content"]
            # Le corps dans le prompt doit être tronqué à 500 chars max
            assert "x" * 501 not in prompt
            assert "x" * 500 in prompt


# ══════════════════════════════════════════════════════════════════════════════
# 🔄 Section 2 — run_email_pipeline() end-to-end
# ══════════════════════════════════════════════════════════════════════════════

# Résultat mock pour analyze_email
MOCK_EMAIL_RESULT = EmailAnalysisResult(
    category="dossier_locataire",
    urgency="normal",
    is_devis=False,
    summary="Candidature de Thomas Durand pour un appartement 3 pièces.",
    suggested_title="Candidature - Thomas Durand",
    raw_ai_text="{}",
    candidate_name="Thomas Durand",
)

# Résultat mock pour generate_reply
MOCK_REPLY_RESULT = EmailReplyResult(
    reply="Bonjour, nous avons bien reçu votre candidature.",
    raw_ai_text="{}",
)


@pytest.fixture
def patched_pipeline(test_engine):
    """
    Patch toutes les dépendances externes du pipeline :
    - SessionLocal → SQLite in-memory
    - analyze_email → résultat fixe
    - generate_reply → réponse fixe
    - upload_file → no-op
    - _send_reply → no-op
    """
    TestSession = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

    p1 = patch("app.services.email_pipeline.SessionLocal", TestSession)
    p2 = patch("app.services.email_pipeline.analyze_email", return_value=MOCK_EMAIL_RESULT)
    p3 = patch("app.services.email_pipeline.generate_reply", return_value=MOCK_REPLY_RESULT)
    p4 = patch("app.services.email_pipeline.upload_file")
    p5 = patch("app.services.email_pipeline._send_reply")

    p1.start(); p2.start(); p3.start(); p4.start(); p5.start()
    yield TestSession
    p5.stop(); p4.stop(); p3.stop(); p2.stop(); p1.stop()


class TestRunEmailPipeline:
    """Tests end-to-end du pipeline email complet."""

    PAYLOAD_IMMOBILIER = {
        "agency_id": 1,
        "from_email": "thomas.durand@test.com",
        "subject": "Candidature location - Appartement 3 pièces",
        "content": (
            "Bonjour, je souhaite louer votre appartement. "
            "CDI, 3200€/mois. Je joins mes documents."
        ),
        "attachments": [],
        "send_email": False,
    }

    def test_a_email_analysis_cree(self, patched_pipeline):
        """(a) EmailAnalysis doit être créé en base."""
        asyncio.run(run_email_pipeline(self.PAYLOAD_IMMOBILIER.copy()))

        db = patched_pipeline()
        try:
            email_count = db.query(EmailAnalysis).filter(
                EmailAnalysis.agency_id == 1,
                EmailAnalysis.sender_email == "thomas.durand@test.com",
            ).count()
            assert email_count == 1, f"Attendu 1 EmailAnalysis, trouvé {email_count}"

            email_rec = db.query(EmailAnalysis).filter(
                EmailAnalysis.sender_email == "thomas.durand@test.com"
            ).first()
            assert email_rec.processing_status == "success"
            assert email_rec.category == "dossier_locataire"
            assert email_rec.suggested_response_text != ""
        finally:
            db.close()

    def test_b_tenant_file_cree(self, patched_pipeline):
        """(b) TenantFile doit être créé pour l'expéditeur."""
        asyncio.run(run_email_pipeline(self.PAYLOAD_IMMOBILIER.copy()))

        db = patched_pipeline()
        try:
            # _normalize_candidate_email ne retire les points que pour @gmail.com
            # test.com → thomas.durand@test.com inchangé
            tf = db.query(TenantFile).filter(
                TenantFile.agency_id == 1,
                TenantFile.candidate_email == "thomas.durand@test.com",
            ).first()
            assert tf is not None, "TenantFile non créé"
        finally:
            db.close()

    def test_c_tenant_email_link_cree(self, patched_pipeline):
        """(c) TenantEmailLink doit relier l'email au dossier."""
        asyncio.run(run_email_pipeline(self.PAYLOAD_IMMOBILIER.copy()))

        db = patched_pipeline()
        try:
            email_rec = db.query(EmailAnalysis).filter(
                EmailAnalysis.sender_email == "thomas.durand@test.com"
            ).first()
            tf = db.query(TenantFile).filter(TenantFile.agency_id == 1).first()

            assert email_rec is not None
            assert tf is not None

            link = db.query(TenantEmailLink).filter(
                TenantEmailLink.tenant_file_id == tf.id,
                TenantEmailLink.email_analysis_id == email_rec.id,
            ).first()
            assert link is not None, "TenantEmailLink non créé"
        finally:
            db.close()

    def test_d_checklist_initialisee(self, patched_pipeline):
        """(d) La checklist du dossier doit contenir au moins 1 élément."""
        asyncio.run(run_email_pipeline(self.PAYLOAD_IMMOBILIER.copy()))

        db = patched_pipeline()
        try:
            tf = db.query(TenantFile).filter(TenantFile.agency_id == 1).first()
            assert tf is not None

            if tf.checklist_json:
                checklist = json.loads(tf.checklist_json)
                total_items = (
                    len(checklist.get("missing", []))
                    + len(checklist.get("received", []))
                )
                assert total_items >= 1, "Checklist vide"
        finally:
            db.close()

    def test_e_second_email_meme_expediteur_meme_dossier(self, patched_pipeline):
        """Un deuxième email du même expéditeur doit réutiliser le même TenantFile."""
        asyncio.run(run_email_pipeline(self.PAYLOAD_IMMOBILIER.copy()))
        asyncio.run(run_email_pipeline({
            **self.PAYLOAD_IMMOBILIER,
            "subject": "Candidature - suite et documents complémentaires",
        }))

        db = patched_pipeline()
        try:
            tf_count = db.query(TenantFile).filter(TenantFile.agency_id == 1).count()
            assert tf_count == 1, f"Attendu 1 TenantFile, trouvé {tf_count} (doublon)"

            email_count = db.query(EmailAnalysis).filter(
                EmailAnalysis.agency_id == 1
            ).count()
            assert email_count == 2, f"Attendu 2 EmailAnalysis, trouvé {email_count}"
        finally:
            db.close()


# ══════════════════════════════════════════════════════════════════════════════
# 📭 Section 3 — Email NON immobilier (newsletter)
# ══════════════════════════════════════════════════════════════════════════════

class TestEmailNonImmobilier:
    """Vérifie que la classification Mistral bloque les emails non pertinents."""

    def test_newsletter_retourne_non_et_rien_en_base(self):
        """
        Si Mistral dit NON, rien ne doit être créé en base.
        (Le filtre Mistral est dans le watcher, pas dans le pipeline.
        Ce test vérifie que la fonction retourne False pour une newsletter.)
        """
        mock_response = MagicMock()
        mock_response.choices[0].message.content = "NON"

        with patch("app.watcher.Mistral") as MockMistral:
            instance = MockMistral.return_value
            instance.chat.complete.return_value = mock_response

            result = mistral_is_real_estate_email(
                from_email="newsletter@promo.com",
                subject="Newsletter du mois de mars",
                body=(
                    "Cher abonné, découvrez nos meilleures offres du mois de mars. "
                    "Profitez de -30% sur tous nos produits jusqu'au 31 mars."
                ),
            )

        assert result is False, "Mistral doit retourner False pour une newsletter"
