# backend/tests/test_blacklist.py
"""
Tests de la blacklist personnalisée par agence.

- CRUD via API : ajout, liste, suppression
- Vérification GET /watcher/configs inclut agency_blacklist
- Unit test de is_agency_blacklisted()
"""
import pytest
from app.database.models import AgencyBlacklist
from app.watcher import is_agency_blacklisted


# ══════════════════════════════════════════════════════════════════════════════
# 🚫 CRUD API /settings/blacklist
# ══════════════════════════════════════════════════════════════════════════════

class TestBlacklistCRUD:

    def test_liste_vide_par_défaut(self, client, auth_headers, test_user):
        resp = client.get("/settings/blacklist", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json() == []

    def test_ajout_pattern(self, client, auth_headers, test_user):
        resp = client.post(
            "/settings/blacklist",
            json={"pattern": "@spam.com"},
            headers=auth_headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["pattern"] == "@spam.com"
        assert "id" in data

    def test_liste_après_ajout(self, client, auth_headers, test_user):
        client.post(
            "/settings/blacklist",
            json={"pattern": "@newsletter.io"},
            headers=auth_headers,
        )
        resp = client.get("/settings/blacklist", headers=auth_headers)
        assert resp.status_code == 200
        patterns = [item["pattern"] for item in resp.json()]
        assert "@newsletter.io" in patterns

    def test_suppression_pattern(self, client, db_session, auth_headers, test_user):
        # Ajouter
        add_resp = client.post(
            "/settings/blacklist",
            json={"pattern": "@delete-me.com"},
            headers=auth_headers,
        )
        assert add_resp.status_code == 201
        entry_id = add_resp.json()["id"]

        # Supprimer
        del_resp = client.delete(
            f"/settings/blacklist/{entry_id}",
            headers=auth_headers,
        )
        assert del_resp.status_code == 200

        # Vérifier suppression
        remaining = db_session.query(AgencyBlacklist).filter(
            AgencyBlacklist.id == entry_id
        ).first()
        assert remaining is None

    def test_suppression_entrée_autre_agence_retourne_404(
        self, client, db_session, auth_headers, test_user
    ):
        from app.database.models import Agency
        # Créer une agence tierce et lui ajouter un pattern
        other_agency = Agency(name="Autre", email_alias="autre2")
        db_session.add(other_agency)
        db_session.commit()

        entry = AgencyBlacklist(
            agency_id=other_agency.id,
            pattern="@evil.com",
        )
        db_session.add(entry)
        db_session.commit()

        resp = client.delete(
            f"/settings/blacklist/{entry.id}",
            headers=auth_headers,
        )
        assert resp.status_code == 404

    def test_sans_auth_retourne_401(self, client):
        resp = client.get("/settings/blacklist")
        assert resp.status_code == 401


# ══════════════════════════════════════════════════════════════════════════════
# 🔍 Watcher configs inclut la blacklist
# ══════════════════════════════════════════════════════════════════════════════

class TestWatcherConfigs:

    def test_configs_inclut_agency_blacklist(
        self, client, db_session, test_user
    ):
        from app.database.models import AgencyEmailConfig
        from app.core.security_utils import fernet_encrypt_str

        # Connexion Gmail simulée
        config = AgencyEmailConfig(
            agency_id=test_user.agency_id,
            gmail_email="test@gmail.com",
            gmail_access_token=fernet_encrypt_str("fake"),
            gmail_refresh_token=fernet_encrypt_str("fake_refresh"),
        )
        db_session.add(config)

        # Pattern blacklist
        bl = AgencyBlacklist(
            agency_id=test_user.agency_id,
            pattern="@blockedomain.com",
        )
        db_session.add(bl)
        db_session.commit()

        resp = client.get(
            "/watcher/configs",
            params={"secret": "test-watcher-secret"},
        )
        assert resp.status_code == 200
        configs = resp.json()
        assert len(configs) >= 1

        found = next(
            (c for c in configs if c["agency_id"] == test_user.agency_id), None
        )
        assert found is not None
        assert "@blockedomain.com" in found["agency_blacklist"]


# ══════════════════════════════════════════════════════════════════════════════
# ⚡ Unit test is_agency_blacklisted()
# ══════════════════════════════════════════════════════════════════════════════

class TestIsAgencyBlacklisted:

    def test_domaine_blacklisté_retourne_true(self):
        assert is_agency_blacklisted(
            "candidat@spam.com",
            ["@spam.com", "@junk.io"]
        ) is True

    def test_domaine_non_blacklisté_retourne_false(self):
        assert is_agency_blacklisted(
            "candidat@test.com",
            ["@spam.com", "@junk.io"]
        ) is False

    def test_liste_vide_retourne_false(self):
        assert is_agency_blacklisted("anyone@anywhere.com", []) is False

    def test_casse_insensible(self):
        assert is_agency_blacklisted(
            "user@SPAM.COM",
            ["@spam.com"]
        ) is True

    def test_pattern_partiel(self):
        """Un pattern '@domain' matche n'importe quel sous-domaine."""
        assert is_agency_blacklisted(
            "user@mail.spam.com",
            ["spam.com"]
        ) is True
