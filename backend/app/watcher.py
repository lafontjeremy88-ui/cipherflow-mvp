"""
WATCHER GMAIL API — CipherFlow
================================
Watcher multi-tenant avec filtrage intelligent pour emails immobiliers.

NOUVELLE STRATÉGIE DE FILTRAGE :
- Règles séquentielles (OR) : si UN critère match → ACCEPT
- Priorité métier : PJ > Mots-clés > Expéditeur connu
- Plus permissif pour candidatures légitimes
- Logs détaillés pour debugging
"""

import base64
import email
import logging
import os
import threading
import time
from datetime import datetime, timedelta, timezone
from email.header import decode_header
from email.utils import parseaddr
from enum import Enum

import requests
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

print("WATCHER GMAIL STARTING")

logging.basicConfig(level=logging.INFO, format="[WATCHER] %(message)s")
log = logging.getLogger("watcher")

# ── Configuration ──────────────────────────────────────────────────────────────

BACKEND_URL              = os.getenv("BACKEND_URL", "").rstrip("/")
WATCHER_SECRET           = os.getenv("WATCHER_SECRET", "")
GOOGLE_CLIENT_ID         = os.getenv("GOOGLE_OAUTH_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET     = os.getenv("GOOGLE_OAUTH_CLIENT_SECRET", "")
AUTO_SEND                = os.getenv("AUTO_SEND", "true").lower() == "true"
MAX_EMAILS_PER_LOOP      = int(os.getenv("MAX_EMAILS_PER_LOOP", "5"))
PAUSE_BETWEEN_EMAILS_SEC = float(os.getenv("PAUSE_BETWEEN_EMAILS_SEC", "2"))
POLL_INTERVAL_SEC        = float(os.getenv("POLL_INTERVAL_SEC", "30"))
CONFIG_REFRESH_INTERVAL  = float(os.getenv("CONFIG_REFRESH_INTERVAL", "60"))

missing = []
if not BACKEND_URL:        missing.append("BACKEND_URL")
if not WATCHER_SECRET:     missing.append("WATCHER_SECRET")
if not GOOGLE_CLIENT_ID:   missing.append("GOOGLE_OAUTH_CLIENT_ID")
if not GOOGLE_CLIENT_SECRET: missing.append("GOOGLE_OAUTH_CLIENT_SECRET")
if missing:
    raise RuntimeError(f"Variables manquantes: {', '.join(missing)}")

WEBHOOK_URL = f"{BACKEND_URL}/webhook/email"
CONFIGS_URL = f"{BACKEND_URL}/watcher/configs"
TOKEN_UPDATE_URL = f"{BACKEND_URL}/watcher/update-token"

GOOGLE_TOKEN_REFRESH_URL = "https://oauth2.googleapis.com/token"

SCOPES = [
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.send",
]


# ============================================================
# 🧠 NOUVELLE STRATÉGIE DE FILTRAGE MÉTIER
# ============================================================

class FilterDecision(str, Enum):
    PROCESS_FULL  = "process_full"   # Traitement complet avec IA
    PROCESS_LIGHT = "process_light"  # Traitement léger
    IGNORE        = "ignore"         # Ignorer


# ── Blacklist système (bots, notifications techniques) ────────────────────────
SYSTEM_BLACKLIST = [
    "railway.app",
    "mailer-daemon",
    "postmaster@",
    "daemon@",
    "noreply@github",
    "noreply@gitlab",
    "notification@",
    "notifications@",
]

# ── Mots-clés immobiliers (sujet OU corps) ───────────────────────────────────
IMMOBILIER_KEYWORDS = [
    # Candidatures
    "candidature", "dossier", "locataire", "location", "louer", "bail", "garant",
    
    # Types de biens
    "appartement", "studio", "t2", "t3", "t4", "t5", "maison", "logement", "pièces",
    
    # Documents
    "visite", "documents", "justificatifs", "pièce d'identité", "identité",
    "bulletin de salaire", "fiche de paie", "salaire", "avis d'imposition",
    "imposition", "contrat de travail", "rib", "relevé", "quittance",
]

# ── Mots-clés spam (bloque même si mot-clé immo présent) ─────────────────────
SPAM_KEYWORDS = [
    "viagra", "casino", "lottery", "loterie", "bitcoin", "crypto",
    "investment opportunity", "make money fast", "gagner de l'argent",
    "promo exclusive", "offre limitée", "cliquez ici", "click here",
]


def is_system_blacklisted(sender: str) -> bool:
    """Vérifie si c'est un email système/bot à ignorer."""
    sender_lower = sender.lower()
    return any(pattern in sender_lower for pattern in SYSTEM_BLACKLIST)


def is_known_sender(sender_email: str, agency_id: int) -> bool:
    """
    Vérifie si l'expéditeur est déjà connu en base (candidat existant).
    Fait une requête rapide au backend.
    """
    try:
        resp = requests.get(
            f"{BACKEND_URL}/watcher/check-sender",
            params={
                "email": sender_email,
                "agency_id": agency_id,
            },
            headers={"x-watcher-secret": WATCHER_SECRET},
            timeout=3,
        )
        if resp.status_code == 200:
            return resp.json().get("is_known", False)
    except Exception as e:
        log.warning(f"[filter] Impossible de vérifier expéditeur connu : {e}")
    return False


def decide_filter(sender: str, subject: str, body: str, attachments: list, agency_id: int) -> tuple[FilterDecision, list]:
    """
    NOUVELLE STRATÉGIE : Règles séquentielles (OR logic).
    Retourne (decision, reasons)
    
    Priorité :
    1. Blacklist système → IGNORE
    2. A des pièces jointes → ACCEPT
    3. Mots-clés immobiliers → ACCEPT (sauf si spam)
    4. Expéditeur connu → ACCEPT
    5. Sinon → IGNORE
    """
    reasons = []
    
    # ── 1️⃣ BLACKLIST SYSTÈME ──────────────────────────────────────────────────
    if is_system_blacklisted(sender):
        reasons.append("system_blacklist")
        log.info(f"❌ IGNORE (blacklist système) — {sender}")
        return FilterDecision.IGNORE, reasons
    
    # ── 2️⃣ A DES PIÈCES JOINTES ───────────────────────────────────────────────
    if attachments:
        reasons.append("has_attachments")
        log.info(f"✅ ACCEPT (pièces jointes: {len(attachments)}) — agency={agency_id}")
        return FilterDecision.PROCESS_FULL, reasons
    
    # ── 3️⃣ MOTS-CLÉS IMMOBILIERS ──────────────────────────────────────────────
    text = f"{subject} {body}".lower()
    
    # Vérification spam d'abord
    has_spam = any(spam_word in text for spam_word in SPAM_KEYWORDS)
    if has_spam:
        reasons.append("spam_keywords")
        log.info(f"❌ IGNORE (spam détecté) — {subject}")
        return FilterDecision.IGNORE, reasons
    
    # Vérification mots-clés immobiliers
    matched_keywords = [kw for kw in IMMOBILIER_KEYWORDS if kw in text]
    if matched_keywords:
        reasons.append(f"immo_keywords:{','.join(matched_keywords[:3])}")
        log.info(f"✅ ACCEPT (mots-clés: {matched_keywords[:3]}) — agency={agency_id}")
        return FilterDecision.PROCESS_FULL, reasons
    
    # ── 4️⃣ EXPÉDITEUR CONNU ───────────────────────────────────────────────────
    _, sender_email = parseaddr(sender)
    if is_known_sender(sender_email, agency_id):
        reasons.append("known_sender")
        log.info(f"✅ ACCEPT (expéditeur connu: {sender_email}) — agency={agency_id}")
        return FilterDecision.PROCESS_LIGHT, reasons
    
    # ── 5️⃣ AUCUN CRITÈRE → IGNORE ─────────────────────────────────────────────
    reasons.append("no_criteria_matched")
    log.info(f"❌ IGNORE (aucun critère) — {subject[:50]}")
    return FilterDecision.IGNORE, reasons


# ============================================================
# 🔐 GESTION TOKENS OAUTH
# ============================================================

def build_credentials(config: dict) -> Credentials:
    """Construit un objet Credentials Google depuis la config agence."""
    expiry = config.get("gmail_token_expiry")
    if isinstance(expiry, str):
        expiry = datetime.fromisoformat(expiry.replace("Z", "+00:00"))

    creds = Credentials(
        token=config["gmail_access_token"],
        refresh_token=config["gmail_refresh_token"],
        token_uri=GOOGLE_TOKEN_REFRESH_URL,
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
        scopes=SCOPES,
        expiry=expiry,
    )
    return creds


def refresh_if_needed(creds: Credentials, agency_id: int) -> Credentials:
    """
    Rafraîchit le token si expiré et notifie le backend pour MAJ en base.
    """
    if creds.expired or not creds.valid:
        log.info(f"[oauth] Token expiré, rafraîchissement agency={agency_id}")
        try:
            creds.refresh(GoogleRequest())
            try:
                requests.post(
                    TOKEN_UPDATE_URL,
                    json={
                        "agency_id":          agency_id,
                        "gmail_access_token": creds.token,
                        "gmail_token_expiry": creds.expiry.isoformat() if creds.expiry else None,
                    },
                    headers={"x-watcher-secret": WATCHER_SECRET},
                    timeout=10,
                )
            except Exception as e:
                log.warning(f"[oauth] MAJ token backend échouée (non bloquant) : {e}")
        except Exception as e:
            log.error(f"[oauth] Rafraîchissement échoué agency={agency_id} : {e}")
            raise
    return creds


# ============================================================
# 📧 PARSING EMAIL GMAIL API
# ============================================================

def _decode_mime_header(value: str) -> str:
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


def _get_header(headers: list, name: str) -> str:
    """Extrait un header Gmail API par nom (case-insensitive)."""
    for h in headers:
        if h["name"].lower() == name.lower():
            return h["value"]
    return ""


def _decode_body(part: dict) -> str:
    """Décode le corps d'un message Gmail API (base64url)."""
    data = part.get("body", {}).get("data", "")
    if not data:
        return ""
    try:
        return base64.urlsafe_b64decode(data + "==").decode("utf-8", errors="ignore")
    except Exception:
        return ""


def _extract_body_and_attachments(payload: dict):
    """
    Extrait le corps texte et les pièces jointes depuis le payload Gmail API.
    Retourne (body_text, attachments_list)
    """
    body_text = ""
    attachments = []
    mime_type = payload.get("mimeType", "")

    def walk_parts(parts):
        nonlocal body_text
        for part in parts:
            part_mime = part.get("mimeType", "")
            filename = part.get("filename", "")

            if filename:
                attachment_id = part.get("body", {}).get("attachmentId")
                if attachment_id:
                    attachments.append({
                        "filename":       filename,
                        "content_type":   part_mime,
                        "attachment_id":  attachment_id,
                    })
                    log.info(f"   📎 PJ détectée : {filename}")

            elif part_mime == "text/plain" and not body_text:
                body_text = _decode_body(part)

            elif part_mime.startswith("multipart/"):
                walk_parts(part.get("parts", []))

    if mime_type == "text/plain":
        body_text = _decode_body(payload)
    elif mime_type.startswith("multipart/"):
        walk_parts(payload.get("parts", []))

    return body_text.strip(), attachments


def download_attachment(service, user_id: str, message_id: str, attachment_id: str) -> bytes:
    """Télécharge le contenu d'une pièce jointe via Gmail API."""
    att = service.users().messages().attachments().get(
        userId=user_id,
        messageId=message_id,
        id=attachment_id,
    ).execute()
    data = att.get("data", "")
    return base64.urlsafe_b64decode(data + "==")


# ============================================================
# 🚀 TRAITEMENT D'UN EMAIL
# ============================================================

def process_one_message(service, message_id: str, agency_id: int, gmail_email: str):
    """Traite un email Gmail API et l'envoie au webhook backend."""

    # Récupération du message complet
    msg_data = service.users().messages().get(
        userId="me",
        id=message_id,
        format="full",
    ).execute()

    payload = msg_data.get("payload", {})
    headers = payload.get("headers", [])

    # Anti-boucle : on ignore nos propres emails
    if _get_header(headers, "X-CipherFlow-Origin"):
        log.info(f"[watcher] Email CipherFlow ignoré (anti-boucle) id={message_id}")
        _mark_as_read(service, message_id)
        return

    sender  = _get_header(headers, "From")
    subject = _decode_mime_header(_get_header(headers, "Subject"))
    body, att_meta = _extract_body_and_attachments(payload)
    body = body or ""

    log.info(f"📧 Email reçu — De: {sender} | Sujet: {subject[:50]}")

    # Téléchargement des pièces jointes
    attachments = []
    for att in att_meta:
        try:
            raw_bytes = download_attachment(service, "me", message_id, att["attachment_id"])
            attachments.append({
                "filename":       att["filename"],
                "content_type":   att["content_type"],
                "content_base64": base64.b64encode(raw_bytes).decode("utf-8"),
            })
            log.info(f"   ✅ PJ téléchargée : {att['filename']} ({len(raw_bytes)} bytes)")
        except Exception as e:
            log.error(f"   ❌ Erreur téléchargement PJ {att['filename']} : {e}")

    # ── NOUVELLE STRATÉGIE DE FILTRAGE ────────────────────────────────────────
    decision, reasons = decide_filter(sender, subject, body, attachments, agency_id)
    
    log.info(f"🧠 Décision={decision.value} | Raisons={reasons} | agency={agency_id}")

    if decision == FilterDecision.IGNORE:
        _mark_as_read(service, message_id)
        return

    _, sender_email = parseaddr(sender)

    webhook_payload = {
        "from_email":      sender_email or sender,
        "to_email":        gmail_email,
        "subject":         subject,
        "content":         body,
        "send_email":      AUTO_SEND,
        "attachments":     attachments,
        "agency_id":       agency_id,
        "filter_decision": decision.value,
        "filter_reasons":  reasons,
    }

    try:
        resp = requests.post(
            WEBHOOK_URL,
            json=webhook_payload,
            headers={"x-watcher-secret": WATCHER_SECRET},
            timeout=60,
        )
        if resp.status_code == 200:
            log.info(f"✅ Transmis au backend agency={agency_id}")
            _mark_as_read(service, message_id)
        else:
            log.warning(f"⚠️ Backend {resp.status_code} — {resp.text[:200]}")
    except Exception as e:
        log.error(f"❌ Erreur envoi backend : {e}")


def _mark_as_read(service, message_id: str):
    """Marque un email comme lu pour éviter de le retraiter."""
    try:
        service.users().messages().modify(
            userId="me",
            id=message_id,
            body={"removeLabelIds": ["UNREAD"]},
        ).execute()
    except Exception as e:
        log.warning(f"[watcher] Impossible de marquer comme lu {message_id} : {e}")


# ============================================================
# 👀 BOUCLE GMAIL PAR AGENCE
# ============================================================

def watch_agency_gmail(config: dict, stop_event: threading.Event):
    """Thread de surveillance Gmail pour une agence."""
    agency_id   = config["agency_id"]
    gmail_email = config.get("gmail_email", "me")

    log.info(f"👀 Watcher Gmail démarré — agency={agency_id} email={gmail_email}")

    while not stop_event.is_set():
        try:
            creds = build_credentials(config)
            creds = refresh_if_needed(creds, agency_id)

            if creds.token != config.get("gmail_access_token"):
                config["gmail_access_token"] = creds.token
            if creds.expiry:
                config["gmail_token_expiry"] = creds.expiry.isoformat()

            service = build("gmail", "v1", credentials=creds)

            result = service.users().messages().list(
                userId="me",
                q="is:unread in:inbox",
                maxResults=MAX_EMAILS_PER_LOOP,
            ).execute()

            messages = result.get("messages", [])
            log.info(f"[watcher] {len(messages)} email(s) non lus — agency={agency_id}")

            for msg in messages:
                if stop_event.is_set():
                    break
                try:
                    process_one_message(service, msg["id"], agency_id, gmail_email)
                except HttpError as e:
                    log.error(f"[watcher] Erreur Gmail API message {msg['id']} : {e}")
                except Exception as e:
                    log.error(f"[watcher] Erreur traitement message {msg['id']} : {e}")

                time.sleep(PAUSE_BETWEEN_EMAILS_SEC)

        except Exception as e:
            log.warning(f"⚠️ Erreur boucle Gmail agency={agency_id} : {e}")

        stop_event.wait(POLL_INTERVAL_SEC)

    log.info(f"🛑 Watcher arrêté — agency={agency_id}")


# ============================================================
# 🔄 GESTIONNAIRE MULTI-TENANT
# ============================================================

def fetch_configs() -> list:
    """Récupère les configs actives depuis le backend (agences avec Gmail connecté)."""
    try:
        resp = requests.get(
            CONFIGS_URL,
            params={"secret": WATCHER_SECRET},
            timeout=10,
        )
        if resp.status_code == 200:
            return [
                c for c in resp.json()
                if c.get("gmail_refresh_token")
            ]
        log.warning(f"⚠️ Impossible de récupérer les configs : {resp.status_code}")
    except Exception as e:
        log.error(f"❌ Erreur fetch configs : {e}")
    return []


def run_multi_tenant_watcher():
    """Boucle principale multi-tenant — démarre/arrête les threads par agence."""
    log.info("🚀 Watcher Gmail multi-tenant démarré")

    active_watchers: dict = {}

    while True:
        configs = fetch_configs()
        active_ids = {c["agency_id"] for c in configs}

        for agency_id in list(active_watchers.keys()):
            if agency_id not in active_ids:
                log.info(f"🛑 Désactivation watcher agency={agency_id}")
                stop_event = active_watchers[agency_id][1]
                stop_event.set()
                active_watchers[agency_id][0].join(timeout=5)
                del active_watchers[agency_id]

        for config in configs:
            agency_id = config["agency_id"]
            if agency_id not in active_watchers:
                stop_event = threading.Event()
                t = threading.Thread(
                    target=watch_agency_gmail,
                    args=(config, stop_event),
                    daemon=True,
                    name=f"watcher-gmail-{agency_id}",
                )
                t.start()
                active_watchers[agency_id] = (t, stop_event)
                log.info(f"▶️ Watcher Gmail démarré agency={agency_id}")

        time.sleep(CONFIG_REFRESH_INTERVAL)


if __name__ == "__main__":
    run_multi_tenant_watcher()