import time
import imaplib
import email
from email.header import decode_header
from email.utils import parseaddr
import requests
import os
import logging

# ============================================================
# WATCHER — CipherFlow
# - Surveille Gmail en IMAP (UNSEEN)
# - Envoie les emails au webhook backend (/webhook/email)
# - Les secrets sont lus depuis Railway Variables (pas dans le code)
# ============================================================

logging.basicConfig(level=logging.INFO, format="[WATCHER] %(message)s")
log = logging.getLogger("watcher")

# ----------------------------
# CONFIG via variables Railway
# (On s'adapte à TES noms actuels)
# ----------------------------
IMAP_SERVER = os.getenv("IMAP_HOST", "imap.gmail.com")
EMAIL_USER = os.getenv("IMAP_USER", "")
EMAIL_PASS = os.getenv("IMAP_PASSWORD", "")

BACKEND_URL = os.getenv("BACKEND_URL", "").rstrip("/")
API_URL = f"{BACKEND_URL}/webhook/email"

WATCHER_SECRET = os.getenv("WATCHER_SECRET", "")

# AUTO_SEND=true => le backend envoie automatiquement la réponse IA
# AUTO_SEND=false => le backend prépare mais n'envoie pas (si ton backend gère ce mode)
AUTO_SEND = os.getenv("AUTO_SEND", "true").lower() == "true"

# Nombre d'emails max par boucle (évite embouteillage)
MAX_EMAILS_PER_LOOP = int(os.getenv("MAX_EMAILS_PER_LOOP", "3"))

# Pause entre chaque email traité (évite spam / surcharge)
PAUSE_BETWEEN_EMAILS_SEC = float(os.getenv("PAUSE_BETWEEN_EMAILS_SEC", "2"))

# Pause entre deux scans de la boîte mail
POLL_INTERVAL_SEC = float(os.getenv("POLL_INTERVAL_SEC", "10"))

# Liste noire expéditeurs / sujets à ignorer (anti-robot)
BLACKLIST = [
    "railway", "google", "no-reply", "noreply", "postmaster",
    "mailer-daemon", "resend", "daemon", "notification"
]

# Vérification config (échoue vite si variable manquante)
missing = []
if not EMAIL_USER: missing.append("IMAP_USER")
if not EMAIL_PASS: missing.append("IMAP_PASSWORD")
if not BACKEND_URL: missing.append("BACKEND_URL")
if not WATCHER_SECRET: missing.append("WATCHER_SECRET")

if missing:
    raise RuntimeError(f"Variables manquantes: {', '.join(missing)}")


def decode_mime_header(value: str) -> str:
    """Décode proprement un header MIME (ex: Subject) en texte lisible."""
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


def get_plain_text_body(msg: email.message.Message) -> str:
    """Récupère la partie text/plain d'un email, sans les pièces jointes."""
    if msg.is_multipart():
        for part in msg.walk():
            content_type = part.get_content_type()
            content_disposition = str(part.get("Content-Disposition", ""))
            if content_type == "text/plain" and "attachment" not in content_disposition.lower():
                payload = part.get_payload(decode=True) or b""
                try:
                    return payload.decode(part.get_content_charset() or "utf-8", errors="ignore")
                except Exception:
                    return payload.decode("utf-8", errors="ignore")
    else:
        payload = msg.get_payload(decode=True) or b""
        try:
            return payload.decode(msg.get_content_charset() or "utf-8", errors="ignore")
        except Exception:
            return payload.decode("utf-8", errors="ignore")
    return ""


def is_blacklisted(sender: str, subject: str) -> bool:
    s = (sender or "").lower()
    sub = (subject or "").lower()
    for blocked in BLACKLIST:
        if blocked in s or blocked in sub:
            return True
    return False


def process_one_email(msg: email.message.Message) -> None:
    subject = decode_mime_header(msg.get("Subject", ""))
    real_sender = msg.get("From", "") or ""

    if is_blacklisted(real_sender, subject):
        log.info(f"🚫 Ignoré (Blacklist) — {subject}")
        return

    # Nettoie l'adresse expéditeur : "Nom <mail@...>" -> "mail@..."
    _, sender_email = parseaddr(real_sender)
    if not sender_email:
        # fallback : on envoie quand même la string brute si parseaddr échoue
        sender_email = real_sender

    body = get_plain_text_body(msg).strip()
    if not body:
        body = "Pas de contenu texte"

    log.info(f"👉 Traitement : {subject}")
    log.info(f"   📨 De : {sender_email}")

    payload = {
        "from_email": sender_email,
        "subject": subject,
        # ton backend attend "body" (EmailProcessRequest) → on envoie body
        "body": body,
        "send_email": AUTO_SEND
    }

    headers = {"x-watcher-secret": WATCHER_SECRET}

    try:
        resp = requests.post(API_URL, json=payload, headers=headers, timeout=30)
        if resp.status_code == 200:
            log.info("   ✅ OK — envoyé au backend")
        else:
            log.info(f"   ⚠️ Backend erreur {resp.status_code} — {resp.text[:200]}")
    except Exception as e:
        log.info(f"   ❌ Erreur requête backend: {e}")


def watch_emails():
    log.info("👀 WATCHER DÉMARRÉ — surveillance IMAP (UNSEEN)")

    while True:
        try:
            mail = imaplib.IMAP4_SSL(IMAP_SERVER)
            mail.login(EMAIL_USER, EMAIL_PASS)
            mail.select("inbox")

            status, messages = mail.search(None, "UNSEEN")
            if status != "OK" or not messages or messages[0] is None:
                email_ids = []
            else:
                all_ids = messages[0].split()
                email_ids = all_ids[-MAX_EMAILS_PER_LOOP:]

            if email_ids:
                log.info(f"📬 {len(email_ids)} email(s) détecté(s)")

            for e_id in email_ids:
                try:
                    res, msg_data = mail.fetch(e_id, "(RFC822)")
                    if res != "OK":
                        continue

                    for response_part in msg_data:
                        if isinstance(response_part, tuple):
                            msg = email.message_from_bytes(response_part[1])
                            process_one_email(msg)

                    time.sleep(PAUSE_BETWEEN_EMAILS_SEC)

                except Exception as e_loop:
                    log.info(f"❌ Erreur mail: {e_loop}")

            try:
                mail.close()
                mail.logout()
            except Exception:
                pass

        except Exception as e:
            log.info(f"⚠️ Erreur globale watcher: {e}")

        time.sleep(POLL_INTERVAL_SEC)


if __name__ == "__main__":
    watch_emails()
