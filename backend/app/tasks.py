# app/tasks.py  (ou app/workers/tasks.py selon ton arbo)
"""
Point d'entrée des jobs RQ.
Ne contient aucune logique métier — délègue au pipeline.
"""

import asyncio
import logging
from datetime import timedelta
from typing import Any, Dict

log = logging.getLogger(__name__)

MAX_429_REENQUEUES = 5
REENQUEUE_DELAY_SECONDS = 60


def process_email_job(payload: Dict[str, Any], retries_429: int = 0) -> None:
    """
    Job RQ exécuté par le worker.
    Lance le pipeline email de façon synchrone (RQ n'est pas async).

    Args:
        payload: Données de l'email à traiter
        retries_429: Nombre de re-enqueues déjà effectués suite à des 429 Mistral
    """
    from app.services.email_pipeline import run_email_pipeline
    from app.services.mistral_service import MistralRateLimitError

    log.info(
        f"[tasks] Job démarré — from={payload.get('from_email')} "
        f"agency={payload.get('agency_id')} retries_429={retries_429}"
    )

    try:
        asyncio.run(run_email_pipeline(payload))

    except MistralRateLimitError as e:
        if retries_429 >= MAX_429_REENQUEUES:
            log.error(
                f"[tasks] ❌ Abandon définitif après {MAX_429_REENQUEUES} re-enqueues "
                f"(429 Mistral persistant) — from={payload.get('from_email')} "
                f"agency={payload.get('agency_id')} — le document sera classé 'other'"
            )
            return  # Job terminé proprement, pas de FAILED dans RQ

        next_retry = retries_429 + 1
        log.warning(
            f"[tasks] ⚠️ 429 Mistral persistant — re-enqueue #{next_retry}/{MAX_429_REENQUEUES} "
            f"dans {REENQUEUE_DELAY_SECONDS}s — from={payload.get('from_email')}"
        )
        try:
            import redis
            from rq import Queue
            from app.core.config import settings

            conn = redis.from_url(settings.REDIS_URL)
            q = Queue("emails", connection=conn)
            q.enqueue_in(
                timedelta(seconds=REENQUEUE_DELAY_SECONDS),
                process_email_job,
                payload,
                retries_429=next_retry,
            )
            log.info(f"[tasks] Job re-enqueué avec succès (retry #{next_retry})")
        except Exception as enqueue_err:
            log.error(f"[tasks] Impossible de re-enqueuer le job : {enqueue_err}", exc_info=True)

    except Exception as e:
        log.error(f"[tasks] Job échoué : {e}", exc_info=True)
        raise  # RQ marque le job comme failed → visible dans le dashboard
