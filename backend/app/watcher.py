"""
WATCHER — CipherFlow
====================

Rôle :
- Surveille une boîte email via IMAP
- Filtre intelligemment les emails AVANT l’IA
- Envoie uniquement les emails à forte valeur métier au backend

Principe clé :
❌ Pas d’IA ici
❌ Pas de logique métier complexe côté backend
✅ Barrière métier explicable, déterministe et robuste
"""

import time
import imaplib
import email
from email.header import decode_header
from email.utils import parseaddr
import requests
import os
import logging
import base64
from enum import Enum


# ============================================================
# 🛡️ ANTI-BOUCLE — éviter de retraiter les emails CipherFlow
# ============================================================

def is_cipherflow_email(msg):
    """
    Détecte les emails envoyés par CipherFlow lui-même.
    Le backend ajoute un header X-CipherFlow-Origin à ses emails.
    """
    return bool(msg.get("X-CipherFlow-Origin"))


# ============================================================
# 🧠 DÉCISION MÉTIER — résultat final du watcher
# ============================================================

class FilterDecision(str, Enum):
    """
    Décision finale prise par le watcher AVANT toute IA.
    """
    PROCESS_FULL = "process_full"     # pipeline complet
    PROCESS_LIGHT = "process_light"   # réservé pour évolution future
    IGNORE = "ignore"                 # email ignoré (audit only)


# ============================================================
# ⚙️ CONFIGURATION GLOBALE
# ============================================================

logging.basicConfig(level=logging.INFO, format="[WATCHER] %(message)s")
log = logging.getLogger("watcher")

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


# ============================================================
# 🔇 BLACKLIST TECHNIQUE (niveau 0)
# ============================================================

BLACKLIST = [
    # Technique / infra
    "railway", "google", "postmaster",
    "mailer-daemon", "daemon", "notification",
    "resend",

    # No-reply
    "no-reply", "noreply",

    # Newsletters / marketing
    "newsletter",
    "unsubscribe",
    "se désabonner",
    "se desabonner",
    "mailchimp",
    "sendinblue",
    "sg-mkt",
    "emailing",
]

# Vérification stricte de la configuration au démarrage
missing = []
if not EMAIL_USER:
    missing.append("IMAP_USER")
if not EMAIL_PASS:
    missing.append("IMAP_PASSWORD")
if not BACKEND_URL:
    missing.append("BACKEND_URL")
if not WATCHER_SECRET:
    missing.append("WATCHER_SECRET")

if missing:
    raise RuntimeError(f"Variables manquantes: {', '.join(missing)}")


# ============================================================
# 🔧 HELPERS TECHNIQUES
# ============================================================

def decode_mime_header(value: str) -> str:
    """
    Décode proprement un header MIME (Subject, To, etc.)
    pour éviter les caractères encodés illisibles.
    """
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
    """
    Extrait uniquement le texte lisible (text/plain).
    Ignore HTML et pièces jointes.
    """
    if msg.is_multipart():
        for part in msg.walk():
            if (
                part.get_content_type() == "text/plain"
                and "attachment" not in str(part.get("Content-Disposition", "")).lower()
            ):
                payload = part.get_payload(decode=True) or b""
                return payload.decode(
                    part.get_content_charset() or "utf-8",
                    errors="ignore",
                )
    else:
        payload = msg.get_payload(decode=True) or b""
        return payload.decode(
            msg.get_content_charset() or "utf-8",
            errors="ignore",
        )

    return ""


def get_attachments_for_api(msg):
    """
    Extrait les pièces jointes et les prépare pour l’API backend :
    - filename
    - content_base64
    - content_type
    """
    attachments = []

    for part in msg.walk():
        if part.get_content_maintype() == "multipart":
            continue

        if (
            "attachment" in str(part.get("Content-Disposition", "")).lower()
            or part.get_filename()
        ):
            filename = part.get_filename()
            if not filename:
                continue

            filename = decode_mime_header(filename)
            payload = part.get_payload(decode=True)

            if payload:
                attachments.append({
                    "filename": filename,
                    "content_base64": base64.b64encode(payload).decode("utf-8"),
                    "content_type": part.get_content_type(),
                })
                log.info(f"   📎 PJ trouvée : {filename}")

    return attachments


def is_blacklisted(sender: str, subject: str, body: str) -> bool:
    """
    Filtre technique niveau 0.
    Rejette immédiatement newsletters, no-reply, emails infra.
    """
    s = (sender or "").lower()
    sub = (subject or "").lower()
    b = (body or "").lower()

    for word in BLACKLIST:
        if word in s or word in sub or word in b:
            return True

    return False


# ============================================================
# 🧠 BARRIÈRE MÉTIER — SCORE EXPLICABLE
# ============================================================

def compute_business_score(sender: str, subject: str, body: str, attachments: list):
    """
    Calcule un score métier explicable (0–100).
    Plus le score est élevé, plus l’email est pertinent.
    """
    score = 0
    reasons = []

    text = f"{sender} {subject} {body}".lower()

    # 📎 Pièces jointes = signal fort
    if attachments:
        score += 40
        reasons.append("attachments_present")

    # 🏠 Mots-clés métier immobilier
    keywords = [
        "dossier", "location", "locataire",
        "bulletin", "fiche de paie",
        "avis", "impôt", "imposition",
        "pièce", "identité",
    ]
    for kw in keywords:
        if kw in text:
            score += 10
            reasons.append(f"keyword:{kw}")
            break

    # ❌ Marketing
    marketing = ["promo", "offre", "réduction", "newsletter"]
    for kw in marketing:
        if kw in text:
            score -= 30
            reasons.append(f"marketing:{kw}")

    # 📭 Email très court sans PJ
    if len(body.strip()) < 40 and not attachments:
        score -= 15
        reasons.append("short_body_no_attachment")

    return score, reasons


def decide_email_action(score: int) -> FilterDecision:
    """
    Traduit le score en décision métier claire.
    """
    if score >= 40:
        return FilterDecision.PROCESS_FULL
    if score >= 15:
        return FilterDecision.PROCESS_LIGHT
    return FilterDecision.IGNORE


# ============================================================
# 🚀 PIPELINE PRINCIPAL — UN EMAIL
# ============================================================

def process_one_email(msg):
    """
    Pipeline complet pour un email :
    - anti-boucle
    - blacklist technique
    - scoring métier
    - décision
    - envoi au backend si pertinent
    """

    # 🛡️ Anti-boucle
    if is_cipherflow_email(msg):
        log.info("🔁 Ignoré (email CipherFlow)")
        return

    subject = decode_mime_header(msg.get("Subject", ""))
    real_sender = msg.get("From", "") or ""
    body = get_plain_text_body(msg).strip() or "Pas de contenu texte"

    # 🔇 Blacklist technique
    if is_blacklisted(real_sender, subject, body):
        log.info(f"🚫 Ignoré (Blacklist) — {subject}")
        return

    # 📎 Pièces jointes
    attachments = get_attachments_for_api(msg)

    # 🧠 Score métier
    score, reasons = compute_business_score(
        sender=real_sender,
        subject=subject,
        body=body,
        attachments=attachments,
    )

    decision = decide_email_action(score)
    log.info(f"🧠 Score={score} | Décision={decision} | Raisons={reasons}")

    if decision == FilterDecision.IGNORE:
        log.info("🚫 Ignoré (faible valeur métier)")
        return

    # 📬 Préparation payload backend
    _, sender_email = parseaddr(real_sender)
    recipient = decode_mime_header(msg.get("Delivered-To") or msg.get("To") or "")

    payload = {
        "from_email": sender_email or real_sender,
        "to_email": recipient,
        "subject": subject,
        "content": body,
        "send_email": AUTO_SEND,
        "attachments": attachments,

        # 🧠 Décision métier explicite
        "filter_score": score,
        "filter_decision": decision.value,
        "filter_reasons": reasons,
    }

    headers = {"x-watcher-secret": WATCHER_SECRET}

    try:
        resp = requests.post(API_URL, json=payload, headers=headers, timeout=60)
        if resp.status_code == 200:
            log.info("✅ Transmis au backend")
        else:
            log.info(f"⚠️ Backend erreur {resp.status_code} — {resp.text[:200]}")
    except Exception as e:
        log.info(f"❌ Erreur requête backend: {e}")


# ============================================================
# 👀 BOUCLE IMAP — SURVEILLANCE CONTINUE
# ============================================================

def watch_emails():
    log.info("👀 WATCHER DÉMARRÉ — IMAP (UNSEEN)")

    while True:
        try:
            mail = imaplib.IMAP4_SSL(IMAP_SERVER)
            mail.login(EMAIL_USER, EMAIL_PASS)
            mail.select("inbox")

            status, messages = mail.search(None, "UNSEEN")
            email_ids = messages[0].split()[-MAX_EMAILS_PER_LOOP:] if status == "OK" else []

            for e_id in email_ids:
                res, msg_data = mail.fetch(e_id, "(RFC822)")
                if res == "OK":
                    for part in msg_data:
                        if isinstance(part, tuple):
                            process_one_email(email.message_from_bytes(part[1]))
                time.sleep(PAUSE_BETWEEN_EMAILS_SEC)

            mail.logout()

        except Exception as e:
            log.info(f"⚠️ Erreur watcher: {e}")

        time.sleep(POLL_INTERVAL_SEC)


if __name__ == "__main__":
    watch_emails()
