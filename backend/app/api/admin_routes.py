# app/api/admin_routes.py
"""
Routes d'administration protégées par x-watcher-secret.
Usage unique : migrations RGPD et opérations one-shot en production.

- POST /admin/run-migration   → vide raw_email_text (RGPD)
  S'auto-désactive : retourne "already_done" si aucune ligne n'est concernée.
"""

import hmac
import logging

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.database.database import get_db

log = logging.getLogger(__name__)
router = APIRouter(prefix="/admin", tags=["Admin"])


def _verify_secret(x_watcher_secret: str = Header(...)):
    if not settings.WATCHER_SECRET or not hmac.compare_digest(
        x_watcher_secret, settings.WATCHER_SECRET
    ):
        raise HTTPException(status_code=403, detail="Secret invalide")


# ── POST /admin/run-migration ──────────────────────────────────────────────────

@router.post("/run-migration")
async def run_raw_email_text_migration(
    x_watcher_secret: str = Header(...),
    db: Session = Depends(get_db),
):
    """
    Migration RGPD : vide raw_email_text pour toutes les lignes existantes.

    - Protégé par x-watcher-secret.
    - Idempotent / auto-désactivé : si aucune ligne n'est concernée,
      retourne {"status": "already_done"}.
    - Retourne le nombre de lignes vidées et le nombre restant (doit être 0).
    """
    _verify_secret(x_watcher_secret)

    # Vérification préalable : y a-t-il encore des lignes à migrer ?
    pending: int = db.execute(
        text("SELECT COUNT(*) FROM email_analyses WHERE raw_email_text IS NOT NULL")
    ).scalar() or 0

    if pending == 0:
        log.info("[admin/run-migration] Déjà migré — aucune ligne à vider")
        return {"status": "already_done", "rows_nulled": 0, "remaining": 0}

    # Exécution de la migration
    result = db.execute(
        text(
            "UPDATE email_analyses "
            "SET raw_email_text = NULL "
            "WHERE raw_email_text IS NOT NULL"
        )
    )
    db.commit()
    rows_nulled: int = result.rowcount

    # Vérification post-migration
    remaining: int = db.execute(
        text("SELECT COUNT(*) FROM email_analyses WHERE raw_email_text IS NOT NULL")
    ).scalar() or 0

    status = "done" if remaining == 0 else "partial"
    log.info(
        "[admin/run-migration] %s — %d ligne(s) vidée(s), %d restante(s)",
        status, rows_nulled, remaining,
    )

    return {"status": status, "rows_nulled": rows_nulled, "remaining": remaining}


# ── GET /admin/check-migration ─────────────────────────────────────────────────

@router.get("/check-migration")
async def check_raw_email_text_migration(
    x_watcher_secret: str = Header(...),
    db: Session = Depends(get_db),
):
    """
    Vérifie l'état de la migration raw_email_text sans rien modifier.
    Retourne le nombre de lignes encore non-NULL.
    """
    _verify_secret(x_watcher_secret)

    remaining: int = db.execute(
        text("SELECT COUNT(*) FROM email_analyses WHERE raw_email_text IS NOT NULL")
    ).scalar() or 0

    log.info("[admin/check-migration] remaining=%d", remaining)
    return {
        "status": "clean" if remaining == 0 else "pending",
        "remaining": remaining,
    }
