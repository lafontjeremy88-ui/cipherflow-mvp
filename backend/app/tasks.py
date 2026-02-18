# app/tasks.py  (ou app/workers/tasks.py selon ton arbo)
"""
Point d'entrée des jobs RQ.
Ne contient aucune logique métier — délègue au pipeline.
"""

import asyncio
import logging
from typing import Any, Dict

log = logging.getLogger(__name__)


def process_email_job(payload: Dict[str, Any]) -> None:
    """
    Job RQ exécuté par le worker.
    Lance le pipeline email de façon synchrone (RQ n'est pas async).
    """
    from app.services.email_pipeline import run_email_pipeline

    log.info(f"[tasks] Job démarré — from={payload.get('from_email')} agency={payload.get('agency_id')}")

    try:
        asyncio.run(run_email_pipeline(payload))
    except Exception as e:
        log.error(f"[tasks] Job échoué : {e}", exc_info=True)
        raise  # RQ marque le job comme failed → visible dans le dashboard
