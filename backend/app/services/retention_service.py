# app/services/retention_service.py
"""
Nettoyage RGPD périodique.

FIX P0 : suppression des fichiers dans Cloudflare R2 (plus os.remove sur disque).
FIX P1 : activé par défaut via ENABLE_RETENTION_WORKER=true en prod.
"""

import asyncio
import json
import logging
import os
from datetime import datetime, timedelta

from app.database.database import SessionLocal
from app.database.models import (
    Agency, AppSettings, EmailAnalysis, FileAnalysis, TenantFile
)
from app.services.storage_service import delete_file as r2_delete

log = logging.getLogger(__name__)

DEFAULT_RETENTION_CONFIG = {
    "emails_days": 365,
    "tenant_files_days_after_closure": 365 * 5,
    "file_analyses_days": 365,
}


def get_retention_config(db, agency_id: int) -> dict:
    cfg = DEFAULT_RETENTION_CONFIG.copy()
    s = db.query(AppSettings).filter(AppSettings.agency_id == agency_id).first()
    if s and s.retention_config_json:
        try:
            stored = (
                json.loads(s.retention_config_json)
                if isinstance(s.retention_config_json, str)
                else s.retention_config_json
            )
            if isinstance(stored, dict):
                cfg.update(stored)
        except Exception as e:
            log.warning(f"[retention] Config JSON invalide agency={agency_id}: {e}")
    return cfg


def run_retention_cleanup(db) -> None:
    now = datetime.utcnow()

    for agency in db.query(Agency).all():
        cfg = get_retention_config(db, agency.id)

        # ── Emails ────────────────────────────────────────────────────────────
        cutoff = now - timedelta(days=int(cfg["emails_days"]))
        deleted_emails = (
            db.query(EmailAnalysis)
            .filter(
                EmailAnalysis.agency_id == agency.id,
                EmailAnalysis.created_at < cutoff,
            )
            .delete(synchronize_session=False)
        )
        if deleted_emails:
            log.info(f"[retention] agency={agency.id} : {deleted_emails} emails supprimés")

        # ── FileAnalysis + fichiers R2 ─────────────────────────────────────────
        cutoff = now - timedelta(days=int(cfg["file_analyses_days"]))
        old_files = (
            db.query(FileAnalysis)
            .filter(
                FileAnalysis.agency_id == agency.id,
                FileAnalysis.created_at < cutoff,
            )
            .all()
        )

        for f in old_files:
            # FIX P0 : suppression dans R2 (plus os.remove)
            if f.filename:
                try:
                    r2_delete(f.filename)
                    log.info(f"[retention] Fichier supprimé de R2 : {f.filename}")
                except Exception as e:
                    log.warning(f"[retention] R2 delete échoué ({f.filename}) : {e}")
            db.delete(f)

        if old_files:
            log.info(f"[retention] agency={agency.id} : {len(old_files)} fichiers supprimés")

        # ── Anonymisation dossiers fermés ──────────────────────────────────────
        cutoff = now - timedelta(days=int(cfg["tenant_files_days_after_closure"]))
        anonymized = 0
        for tf in (
            db.query(TenantFile)
            .filter(
                TenantFile.agency_id == agency.id,
                TenantFile.is_closed == True,
                TenantFile.closed_at < cutoff,
            )
            .all()
        ):
            tf.candidate_email = None
            tf.candidate_name = None
            tf.risk_level = None
            anonymized += 1

        if anonymized:
            log.info(f"[retention] agency={agency.id} : {anonymized} dossiers anonymisés")

    db.commit()
    log.info("[retention] Cleanup RGPD terminé")


async def retention_worker() -> None:
    """Tourne en tâche de fond toutes les 6 heures."""
    while True:
        db = SessionLocal()
        try:
            log.info("[retention] Lancement cleanup…")
            run_retention_cleanup(db)
        except Exception as e:
            log.error(f"[retention] Erreur : {e}")
        finally:
            db.close()
        await asyncio.sleep(6 * 60 * 60)
