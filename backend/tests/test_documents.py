# backend/tests/test_documents.py
"""
Tests isolation des documents entre agences.

- GET /api/files/history : requiert auth, filtre par agency_id
- GET /api/files/view/{id} : 404 si autre agence (isolation multi-tenant)
"""
import pytest
from unittest.mock import patch

from app.database.models import (
    Agency, User, UserRole, FileAnalysis, TenantDocType
)
from app.security import get_password_hash


# ── Fixtures secondaire agence ─────────────────────────────────────────────────

@pytest.fixture
def other_agency(db_session) -> Agency:
    agency = Agency(name="Autre Agence", email_alias="autreagence")
    db_session.add(agency)
    db_session.commit()
    db_session.refresh(agency)
    return agency


@pytest.fixture
def other_user(db_session, other_agency) -> User:
    user = User(
        email="autre@test.com",
        hashed_password=get_password_hash("TestPass123!"),
        agency_id=other_agency.id,
        role=UserRole.AGENCY_ADMIN,
        email_verified=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def own_file(db_session, test_user) -> FileAnalysis:
    """Document appartenant à l'agence courante."""
    f = FileAnalysis(
        agency_id=test_user.agency_id,
        filename="r2/test-doc.pdf",
        file_type=TenantDocType.PAYSLIP.value,
        file_hash="aabbcc001122",
        summary="Fiche de paie.",
    )
    db_session.add(f)
    db_session.commit()
    db_session.refresh(f)
    return f


@pytest.fixture
def other_file(db_session, other_agency) -> FileAnalysis:
    """Document appartenant à une autre agence."""
    f = FileAnalysis(
        agency_id=other_agency.id,
        filename="r2/other-doc.pdf",
        file_type=TenantDocType.ID.value,
        file_hash="ddeeff334455",
        summary="Pièce d'identité.",
    )
    db_session.add(f)
    db_session.commit()
    db_session.refresh(f)
    return f


# ══════════════════════════════════════════════════════════════════════════════
# 🔒 Authentification requise
# ══════════════════════════════════════════════════════════════════════════════

class TestAuthRequired:
    def test_historique_sans_auth_retourne_401(self, client):
        resp = client.get("/api/files/history")
        assert resp.status_code == 401

    def test_view_sans_auth_retourne_401(self, client):
        resp = client.get("/api/files/view/1")
        assert resp.status_code == 401


# ══════════════════════════════════════════════════════════════════════════════
# 📄 Isolation par agence
# ══════════════════════════════════════════════════════════════════════════════

class TestIsolationAgence:
    def test_historique_retourne_seulement_ses_documents(
        self, client, auth_headers, own_file, other_file
    ):
        resp = client.get("/api/files/history", headers=auth_headers)
        assert resp.status_code == 200
        ids = [item["id"] for item in resp.json()]
        assert own_file.id in ids
        assert other_file.id not in ids

    def test_view_propre_fichier_retourne_contenu(
        self, client, auth_headers, own_file
    ):
        with patch("app.api.file_routes.r2_download", return_value=b"%PDF-fake"):
            resp = client.get(
                f"/api/files/view/{own_file.id}", headers=auth_headers
            )
        assert resp.status_code == 200

    def test_view_fichier_autre_agence_retourne_404(
        self, client, auth_headers, other_file
    ):
        resp = client.get(
            f"/api/files/view/{other_file.id}", headers=auth_headers
        )
        assert resp.status_code == 404

    def test_view_fichier_inexistant_retourne_404(self, client, auth_headers):
        resp = client.get("/api/files/view/999999", headers=auth_headers)
        assert resp.status_code == 404
