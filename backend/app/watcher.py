"""
WATCHER MULTI-TENANT — CipherFlow
==================================
- Interroge le backend toutes les X secondes pour récupérer les configs actives
- Surveille chaque boîte email dans un thread dédié
- Chaque agence peut activer/désactiver son watcher depuis l'interface
"""

import base64
import email
import imaplib
import logging
import os
import threading
import time
from email.header import decode_header
from email.utils import parseaddr
from enum import Enum

import requests

print("WATCHER STARTING")

logging.basicConfig(level=logging.INFO, format="[WATCHER] %(message)s")
log = logging.getLogger("watcher")

BACKEND_URL = os.getenv("BACKEND_URL", "").rstrip("/")
WATCHER_SECRET = os.getenv("WATCHER_SECRET", "")
AUTO_SEND = os.getenv("AUTO_SEND", "true").lower() == "true"
MAX_EMAILS_PER_LOOP = int(os.getenv("MAX_EMAILS_PER_LOOP", "3"))
PAUSE_BETWEEN_EMAILS_SEC = float(os.getenv("PAUSE_BETWEEN_EMAILS_SEC", "2"))
POLL_INTERVAL_SEC = float(os.getenv("POLL_INTERVAL_SEC", "30"))
CONFIG_REFRESH_INTERVAL = float(os.getenv("CONFIG_REFRESH_INTERVAL", "60"))

missing = []
if not BACKEND_URL:
    missing.append("BACKEND_URL")
if not WATCHER_SECRET:
    missing.append("WATCHER_SECRET")
if missing:
    raise RuntimeError(f"Variables manquantes: {', '.join(missing)}")

WEBHOOK_URL = f"{BACKEND_URL}/webhook/email"
CONFIGS_URL = f"{BACKEND_URL}/watcher/configs"


# ============================================================
# 🧠 DÉCISION MÉTIER
# ============================================================

class FilterDecision(str, Enum):
    PROCESS_FULL = "process_full"
    PROCESS_LIGHT = "process_light"
    IGNORE = "ignore"


BLACKLIST = [
    "railway", "google", "postmaster", "mailer-daemon", "daemon",
    "notification", "resend", "no-reply", "noreply", "newsletter",
    "unsubscribe", "se désabonner", "se desabonner", "mailchimp",
    "sendinblue", "sg-mkt", "emailing",
]


def is_cipherflow_email(msg):
    return bool(msg.get("X-CipherFlow-Origin"))


def decode_mime_header(value: str) -> str:
    if not value:
        return ""
    decoded_list = decode_header(value)
    out = ""
    for decoded_bytes, charset in decoded_list:
        if isinstance(decoded_bytes, bytes):
            try:
                out += decoded_bytes.decode(charset or "utf-8")
            except Exception:
                out += decoded_bytes.decode("latin-1", errors="ignore")
        else:
            out += str(decoded_bytes)
    return out.strip()


def get_plain_text_body(msg) -> str:
    if msg.is_multipart():
        for part in msg.walk():
            if (
                part.get_content_type() == "text/plain"
                and "attachment" not in str(part.get("Content-Disposition", "")).lower()
            ):
                payload = part.get_payload(decode=True) or b""
                return payload.decode(part.get_content_charset() or "utf-8", errors="ignore")
    else:
        payload = msg.get_payload(decode=True) or b""
        return payload.decode(msg.get_content_charset() or "utf-8", errors="ignore")
    return ""


def get_attachments(msg):
    attachments = []
    for part in msg.walk():
        if part.get_content_maintype() == "multipart":
            continue
        if "attachment" in str(part.get("Content-Disposition", "")).lower() or part.get_filename():
            filename = decode_mime_header(part.get_filename() or "")
            if not filename:
                continue
            payload = part.get_payload(decode=True)
            if payload:
                attachments.append({
                    "filename": filename,
                    "content_base64": base64.b64encode(payload).decode("utf-8"),
                    "content_type": part.get_content_type(),
                })
                log.info(f"   📎 PJ trouvée : {filename}")
    return attachments


def is_blacklisted(sender, subject, body) -> bool:
    text = f"{sender} {subject} {body}".lower()
    return any(word in text for word in BLACKLIST)


def compute_score(sender, subject, body, attachments):
    score = 0
    reasons = []
    text = f"{sender} {subject} {body}".lower()

    if attachments:
        score += 40
        reasons.append("attachments_present")

    keywords = ["dossier", "location", "locataire", "bulletin", "fiche de paie",
                "avis", "impôt", "imposition", "pièce", "identité"]
    for kw in keywords:
        if kw in text:
            score += 10
            reasons.append(f"keyword:{kw}")
            break

    for kw in ["promo", "offre", "réduction", "newsletter"]:
        if kw in text:
            score -= 30
            reasons.append(f"marketing:{kw}")

    if len(body.strip()) < 40 and not attachments:
        score -= 15
        reasons.append("short_body_no_attachment")

    return score, reasons


def decide(score: int) -> FilterDecision:
    if score >= 40:
        return FilterDecision.PROCESS_FULL
    if score >= 15:
        return FilterDecision.PROCESS_LIGHT
    return FilterDecision.IGNORE


# ============================================================
# 🚀 TRAITEMENT D'UN EMAIL
# ============================================================

def process_one_email(msg, agency_id: int, to_email: str = ""):
    if is_cipherflow_email(msg):
        return

    subject = decode_mime_header(msg.get("Subject", ""))
    sender = msg.get("From", "") or ""
    body = get_plain_text_body(msg).strip() or "Pas de contenu texte"

    if is_blacklisted(sender, subject, body):
        log.info(f"🚫 Ignoré (Blacklist) agency={agency_id} — {subject}")
        return

    attachments = get_attachments(msg)
    score, reasons = compute_score(sender, subject, body, attachments)
    decision = decide(score)

    log.info(f"🧠 Score={score} | Décision={decision} | agency={agency_id} | Raisons={reasons}")

    if decision == FilterDecision.IGNORE:
        return

    _, sender_email = parseaddr(sender)
    recipient = to_email or decode_mime_header(msg.get("Delivered-To") or msg.get("To") or "")

    payload = {
        "from_email": sender_email or sender,
        "to_email": recipient,
        "subject": subject,
        "content": body,
        "send_email": AUTO_SEND,
        "attachments": attachments,
        "agency_id": agency_id,
        "filter_score": score,
        "filter_decision": decision.value,
        "filter_reasons": reasons,
    }

    try:
        resp = requests.post(
            WEBHOOK_URL,
            json=payload,
            headers={"x-watcher-secret": WATCHER_SECRET},
            timeout=60,
        )
        if resp.status_code == 200:
            log.info(f"✅ Transmis au backend agency={agency_id}")
        else:
            log.warning(f"⚠️ Backend {resp.status_code} — {resp.text[:200]}")
    except Exception as e:
        log.error(f"❌ Erreur envoi backend : {e}")


# ============================================================
# 👀 BOUCLE IMAP PAR AGENCE
# ============================================================

def watch_agency(config: dict, stop_event: threading.Event):
    agency_id = config["agency_id"]
    imap_host = config["imap_host"]
    imap_port = config.get("imap_port", 993)
    imap_user = config["imap_user"]
    imap_password = config["imap_password"]
    to_email = config.get("from_email", imap_user)

    log.info(f"👀 Watcher démarré — agency={agency_id} user={imap_user}")

    while not stop_event.is_set():
        try:
            mail = imaplib.IMAP4_SSL(imap_host, imap_port)
            mail.login(imap_user, imap_password)
            mail.select("inbox")

            status, messages = mail.search(None, "UNSEEN")
            email_ids = messages[0].split()[-MAX_EMAILS_PER_LOOP:] if status == "OK" else []

            for e_id in email_ids:
                res, msg_data = mail.fetch(e_id, "(RFC822)")
                if res == "OK":
                    for part in msg_data:
                        if isinstance(part, tuple):
                            process_one_email(
                                email.message_from_bytes(part[1]),
                                agency_id=agency_id,
                                to_email=to_email,
                            )
                time.sleep(PAUSE_BETWEEN_EMAILS_SEC)

            mail.logout()

        except Exception as e:
            log.warning(f"⚠️ Erreur IMAP agency={agency_id}: {e}")

        stop_event.wait(POLL_INTERVAL_SEC)

    log.info(f"🛑 Watcher arrêté — agency={agency_id}")


# ============================================================
# 🔄 GESTIONNAIRE MULTI-TENANT
# ============================================================

def fetch_configs() -> list:
    """Récupère la liste des configs actives depuis le backend."""
    try:
        resp = requests.get(
            CONFIGS_URL,
            params={"secret": WATCHER_SECRET},
            timeout=10,
        )
        if resp.status_code == 200:
            return resp.json()
        log.warning(f"⚠️ Impossible de récupérer les configs : {resp.status_code}")
    except Exception as e:
        log.error(f"❌ Erreur fetch configs : {e}")
    return []


def run_multi_tenant_watcher():
    """
    Boucle principale : toutes les CONFIG_REFRESH_INTERVAL secondes,
    compare les configs actives avec les threads en cours et
    démarre/arrête les watchers par agence.
    """
    log.info("🚀 Watcher multi-tenant démarré")

    # agency_id → (thread, stop_event)
    active_watchers: dict = {}

    while True:
        configs = fetch_configs()
        active_ids = {c["agency_id"] for c in configs}

        # Arrêter les watchers dont la config a été désactivée
        for agency_id in list(active_watchers.keys()):
            if agency_id not in active_ids:
                log.info(f"🛑 Désactivation watcher agency={agency_id}")
                stop_event = active_watchers[agency_id][1]
                stop_event.set()
                active_watchers[agency_id][0].join(timeout=5)
                del active_watchers[agency_id]

        # Démarrer les nouveaux watchers
        for config in configs:
            agency_id = config["agency_id"]
            if agency_id not in active_watchers:
                if not config.get("imap_host") or not config.get("imap_user") or not config.get("imap_password"):
                    log.warning(f"⚠️ Config incomplète agency={agency_id} — skipping")
                    continue

                stop_event = threading.Event()
                t = threading.Thread(
                    target=watch_agency,
                    args=(config, stop_event),
                    daemon=True,
                    name=f"watcher-{agency_id}",
                )
                t.start()
                active_watchers[agency_id] = (t, stop_event)
                log.info(f"▶️ Watcher démarré agency={agency_id}")

        time.sleep(CONFIG_REFRESH_INTERVAL)


if __name__ == "__main__":
    run_multi_tenant_watcher()