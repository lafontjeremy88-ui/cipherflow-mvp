#!/usr/bin/env python3
"""
Migration one-shot : chiffre les tokens Gmail en clair dans agency_email_configs.

Détecte automatiquement si un token est déjà chiffré (Fernet token valide)
et ignore les lignes déjà migrées — idempotent, sans risque de double chiffrement.

Usage :
    cd backend
    FERNET_KEY=<clé> DATABASE_URL=<url> python scripts/migrate_encrypt_gmail_tokens.py

En production Railway :
    railway run python scripts/migrate_encrypt_gmail_tokens.py
"""

import os
import sys

DATABASE_URL = os.getenv("DATABASE_URL", "")
FERNET_KEY   = os.getenv("FERNET_KEY", "").strip()

if not DATABASE_URL:
    print("❌  DATABASE_URL manquant — arrêt.")
    sys.exit(1)

if not FERNET_KEY:
    print("⚠️   FERNET_KEY absent — aucun chiffrement configuré (dev sans clé).")
    print("     Rien à faire.")
    sys.exit(0)

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import create_engine, text

engine = create_engine(DATABASE_URL)
fernet = Fernet(FERNET_KEY.encode())


def _is_encrypted(value: str) -> bool:
    """
    Retourne True si la valeur est déjà un token Fernet valide.
    Un token Fernet commence toujours par 'gAAAAA' (base64url de 0x80).
    On tente un déchiffrement pour être sûr.
    """
    try:
        fernet.decrypt(value.encode())
        return True
    except (InvalidToken, Exception):
        return False


def _encrypt(value: str) -> str:
    return fernet.encrypt(value.encode()).decode()


def main() -> None:
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT id, agency_id, gmail_access_token, gmail_refresh_token "
                "FROM agency_email_configs "
                "WHERE gmail_access_token IS NOT NULL "
                "   OR gmail_refresh_token IS NOT NULL"
            )
        ).fetchall()

    if not rows:
        print("✅  Aucune ligne avec des tokens Gmail — rien à faire.")
        return

    print(f"🔍  {len(rows)} ligne(s) trouvée(s) avec des tokens Gmail.\n")

    updated = 0
    skipped = 0

    with engine.begin() as conn:
        for row in rows:
            config_id     = row[0]
            agency_id     = row[1]
            access_token  = row[2]
            refresh_token = row[3]

            updates = {}

            # ── access_token ──────────────────────────────────────────────────
            if access_token:
                if _is_encrypted(access_token):
                    print(f"  ⏭️   config #{config_id} (agency={agency_id}) : access_token déjà chiffré")
                    skipped += 1
                else:
                    updates["access"] = _encrypt(access_token)
                    print(f"  🔐  config #{config_id} (agency={agency_id}) : access_token → chiffré")

            # ── refresh_token ─────────────────────────────────────────────────
            if refresh_token:
                if _is_encrypted(refresh_token):
                    print(f"  ⏭️   config #{config_id} (agency={agency_id}) : refresh_token déjà chiffré")
                    if "access" not in updates:
                        skipped += 1
                else:
                    updates["refresh"] = _encrypt(refresh_token)
                    print(f"  🔐  config #{config_id} (agency={agency_id}) : refresh_token → chiffré")

            if not updates:
                continue

            set_clauses = []
            params: dict = {"id": config_id}

            if "access" in updates:
                set_clauses.append("gmail_access_token = :access")
                params["access"] = updates["access"]
            if "refresh" in updates:
                set_clauses.append("gmail_refresh_token = :refresh")
                params["refresh"] = updates["refresh"]

            conn.execute(
                text(
                    f"UPDATE agency_email_configs SET {', '.join(set_clauses)} "
                    "WHERE id = :id"
                ),
                params,
            )
            updated += 1

    print(f"\n✅  Migration terminée.")
    print(f"    Lignes mises à jour   : {updated}")
    print(f"    Lignes déjà chiffrées : {skipped}")


if __name__ == "__main__":
    main()
