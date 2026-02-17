from typing import Dict, Any

from app.services.email_pipeline import run_email_pipeline


def process_email_job(payload: Dict[str, Any]):
    """
    RQ Worker entry point.
    Ne contient AUCUNE logique métier.
    Délègue entièrement au pipeline.
    """

    try:
        run_email_pipeline(payload)
    except Exception as e:
        print(f"❌ WORKER FATAL ERROR: {e}")