import time
import imaplib
import email
from email.header import decode_header
from email.utils import parseaddr
import requests
import os
import logging
import base64  # ✅ NÉCESSAIRE POUR LES PJ

# ============================================================
# WATCHER — CipherFlow V2 (Support des Pièces Jointes)
# ============================================================

logging.basicConfig(level=logging.INFO, format="[WATCHER] %(message)s")
log = logging.getLogger("watcher")

# ----------------------------
# CONFIG via variables Railway
# ----------------------------
IMAP_SERVER = os.getenv("IMAP_HOST", "imap.gmail.com")
EMAIL_USER = os.getenv("IMAP_USER", "")
EMAIL_PASS = os.getenv("IMAP_PASSWORD", "")

BACKEND_URL = os.getenv("BACKEND_URL", "").rstrip("/")
API_URL = f"{BACKEND_URL}/webhook/email"

WATCHER_SECRET = os.getenv("WATCHER_SECRET", "")

AUTO_SEND = os.getenv("AUTO_SEND", "true").lower() == "true"
MAX_EMAILS_PER_LOOP = int(os.getenv("MAX_EMAILS_PER_LOOP", "3"))
PAUSE_BETWEEN_EMAILS_SEC = float(os.getenv("PAUSE_BETWEEN_EMAILS_SEC", "2"))
POLL_INTERVAL_SEC = float(os.getenv("POLL_INTERVAL_SEC", "10"))

BLACKLIST = [
    "railway", "google", "no-reply", "noreply", "postmaster",
    "mailer-daemon", "resend", "daemon", "notification"
]

# Vérification config
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
    """Récupère le texte de l'email."""
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


# ✅ NOUVELLE FONCTION : EXTRACTION DES PIÈCES JOINTES
def get_attachments_for_api(msg):
    attachments_list = []
    for part in msg.walk():
        # On ignore les conteneurs multipart
        if part.get_content_maintype() == 'multipart':
            continue
        
        # On vérifie si c'est une pièce jointe
        content_disposition = str(part.get("Content-Disposition", ""))
        
        # Si c'est un fichier attaché ou une image inline
        if 'attachment' in content_disposition or part.get_filename():
            filename = part.get_filename()
            if filename:
                # Décodage du nom de fichier
                filename = decode_mime_header(filename)
                
                # Lecture du contenu binaire
                payload = part.get_payload(decode=True)
                if payload:
                    # Encodage en Base64 pour l'envoi JSON
                    b64_content = base64.b64encode(payload).decode('utf-8')
                    content_type = part.get_content_type()
                    
                    attachments_list.append({
                        "filename": filename,
                        "content_base64": b64_content,
                        "content_type": content_type
                    })
                    log.info(f"   📎 PJ trouvée : {filename} ({content_type})")
    
    return attachments_list


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

    _, sender_email = parseaddr(real_sender)
    if not sender_email:
        sender_email = real_sender

    # ✅ MODIFICATION ICI : On récupère le destinataire pour le routage Multi-Agence
    recipient = decode_mime_header(msg.get("Delivered-To") or msg.get("To") or "")

    body = get_plain_text_body(msg).strip()
    if not body:
        body = "Pas de contenu texte"

    log.info(f"👉 Traitement : {subject}")
    log.info(f"   📨 De : {sender_email} | Vers : {recipient}")

    # Récupération des PJ
    attachments = get_attachments_for_api(msg)

    payload = {
        "from_email": sender_email,
        "to_email": recipient,  # ✅ On envoie ça au backend
        "subject": subject,
        "content": body,
        "send_email": AUTO_SEND,
        "attachments": attachments
    }

    headers = {"x-watcher-secret": WATCHER_SECRET}

    try:
        resp = requests.post(API_URL, json=payload, headers=headers, timeout=60)
        
        if resp.status_code == 200:
            log.info("   ✅ OK — Analyse terminée par l'IA !")
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
                # On traite les plus récents en dernier
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
