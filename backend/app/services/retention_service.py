# app/services/retention_service.py
"""
Nettoyage RGPD périodique.
Extrait de main.py — ne doit pas y retourner.
"""

import asyncio
import json
import logging
import os
from datetime import datetime, timedelta
from pathlib import Path

from app.database.database import SessionLocal
from app.database.models import (
    Agency, AppSettings, EmailAnalysis, FileAnalysis, TenantFile
)

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
            stored = json.loads(s.retention_config_json) if isinstance(s.retention_config_json, str) else s.retention_config_json
            if isinstance(stored, dict):
                cfg.update(stored)
        except Exception as e:
            log.warning(f"[retention] Config JSON invalide agency={agency_id}: {e}")
    return cfg


def run_retention_cleanup(db) -> None:
    now = datetime.utcnow()

    # Nettoyage fichiers tmp
    uploads_dir = Path("uploads")
    if uploads_dir.exists():
        for p in uploads_dir.glob("tmp_*"):
            try:
                if (now - datetime.utcfromtimestamp(p.stat().st_mtime)) > timedelta(hours=1):
                    p.unlink()
            except Exception:
                pass

    for agency in db.query(Agency).all():
        cfg = get_retention_config(db, agency.id)

        # Emails
        cutoff = now - timedelta(days=int(cfg["emails_days"]))
        db.query(EmailAnalysis).filter(
            EmailAnalysis.agency_id == agency.id,
            EmailAnalysis.created_at < cutoff,
        ).delete(synchronize_session=False)

        # FileAnalysis
        cutoff = now - timedelta(days=int(cfg["file_analyses_days"]))
        old_files = db.query(FileAnalysis).filter(
            FileAnalysis.agency_id == agency.id,
            FileAnalysis.created_at < cutoff,
        ).all()
        for f in old_files:
            path = os.path.join("uploads", f.filename)
            if os.path.exists(path):
                try:
                    os.remove(path)
                except OSError:
                    pass
            db.delete(f)

        # Anonymisation dossiers fermés
        cutoff = now - timedelta(days=int(cfg["tenant_files_days_after_closure"]))
        for tf in db.query(TenantFile).filter(
            TenantFile.agency_id == agency.id,
            TenantFile.is_closed == True,
            TenantFile.closed_at < cutoff,
        ).all():
            tf.candidate_email = None
            tf.candidate_name = None
            tf.risk_level = None

    db.commit()
    log.info("[retention] Cleanup RGPD terminé")


async def retention_worker() -> None:
    """Tourne en tâche de fond, toutes les 6 heures."""
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
