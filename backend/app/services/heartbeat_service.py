# app/services/heartbeat_service.py
"""
Moniteur heartbeat watcher.

Toutes les 10 minutes, vérifie que chaque agence avec un email connecté
(Gmail OU Outlook) a reçu un heartbeat récent depuis son watcher.
Si le dernier heartbeat date de plus de 10 minutes → alerte email à ADMIN_EMAIL.
"""

import asyncio
import logging
from datetime import datetime, timedelta

from sqlalchemy import or_

from app.core.config import settings
from app.database.database import SessionLocal
from app.database.models import Agency, AgencyEmailConfig

log = logging.getLogger(__name__)

HEARTBEAT_TIMEOUT_MINUTES = 10
CHECK_INTERVAL_SECONDS = 10 * 60  # toutes les 10 minutes


def _send_alert(agency_name: str, agency_id: int, minutes_ago: int | None) -> None:
    """Envoie un email d'alerte à ADMIN_EMAIL via Resend."""
    if not settings.ADMIN_EMAIL or not settings.RESEND_API_KEY:
        log.warning(
            f"[heartbeat] Watcher inactif agency={agency_id} — "
            "ADMIN_EMAIL ou RESEND_API_KEY non configuré, alerte non envoyée"
        )
        return

    delay_str = f"{minutes_ago} minutes" if minutes_ago is not None else "jamais démarré"

    try:
        import resend
        resend.api_key = settings.RESEND_API_KEY
        resend.Emails.send({
            "from": settings.RESEND_FROM_EMAIL,
            "to": [settings.ADMIN_EMAIL],
            "subject": f"⚠️ Watcher inactif — {agency_name}",
            "html": (
                f"<h2>⚠️ Alerte watcher CipherFlow</h2>"
                f"<p>Le watcher est <b>inactif depuis {delay_str}</b> "
                f"pour l'agence <b>{agency_name}</b> (id={agency_id}).</p>"
                f"<p>Actions recommandées :"
                f"<ol>"
                f"<li>Vérifier les logs Railway du service <code>watcher</code></li>"
                f"<li>Vérifier les tokens OAuth (expirés ?)</li>"
                f"<li><code>railway restart --service watcher</code></li>"
                f"</ol></p>"
            ),
            "headers": {"X-CipherFlow-Origin": "heartbeat-monitor"},
        })
        log.warning(
            f"[heartbeat] Alerte envoyée à {settings.ADMIN_EMAIL} "
            f"— agency={agency_id} ({agency_name}) inactif depuis {delay_str}"
        )
    except Exception as e:
        log.error(f"[heartbeat] Erreur envoi alerte agency={agency_id} : {e}")


def check_heartbeats(db) -> None:
    """Vérifie les heartbeats de toutes les agences avec email connecté."""
    now = datetime.utcnow()
    threshold = now - timedelta(minutes=HEARTBEAT_TIMEOUT_MINUTES)

    # Seules les agences avec Gmail ou Outlook connecté sont surveillées
    active_configs = (
        db.query(AgencyEmailConfig)
        .filter(
            or_(
                AgencyEmailConfig.gmail_refresh_token.isnot(None),
                AgencyEmailConfig.outlook_refresh_token.isnot(None),
            )
        )
        .all()
    )

    for config in active_configs:
        agency = db.query(Agency).filter(Agency.id == config.agency_id).first()
        if not agency:
            continue

        hb = agency.last_watcher_heartbeat

        # Alerte uniquement si le heartbeat a déjà été reçu au moins une fois
        # (évite les faux positifs au démarrage)
        if hb is not None and hb < threshold:
            minutes_ago = int((now - hb).total_seconds() / 60)
            log.warning(
                f"[heartbeat] Watcher inactif agency={agency.id} "
                f"({agency.name}) — dernier heartbeat il y a {minutes_ago} min"
            )
            _send_alert(agency.name, agency.id, minutes_ago)

    log.info(f"[heartbeat] Check terminé — {len(active_configs)} agence(s) surveillée(s)")


async def heartbeat_monitor() -> None:
    """Tourne en tâche de fond toutes les 10 minutes."""
    while True:
        await asyncio.sleep(CHECK_INTERVAL_SECONDS)
        db = SessionLocal()
        try:
            check_heartbeats(db)
        except Exception as e:
            log.error(f"[heartbeat] Erreur monitor : {e}")
        finally:
            db.close()
