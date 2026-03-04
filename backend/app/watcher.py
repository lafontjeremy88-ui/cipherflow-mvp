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
import re
import threading
import time
from datetime import datetime, timedelta, timezone
from email.header import decode_header
from email.utils import parseaddr
from enum import Enum

import requests
from mistralai import Mistral
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
MICROSOFT_CLIENT_ID      = os.getenv("MICROSOFT_CLIENT_ID", "")
MICROSOFT_CLIENT_SECRET  = os.getenv("MICROSOFT_CLIENT_SECRET", "")
MISTRAL_API_KEY          = os.getenv("MISTRAL_API_KEY", "")
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

WEBHOOK_URL              = f"{BACKEND_URL}/webhook/email"
CONFIGS_URL              = f"{BACKEND_URL}/watcher/configs"
TOKEN_UPDATE_URL         = f"{BACKEND_URL}/watcher/update-token"
OUTLOOK_UPDATE_URL       = f"{BACKEND_URL}/watcher/update-outlook-token"
CHECK_SENDER_URL         = f"{BACKEND_URL}/watcher/check-sender"

GOOGLE_TOKEN_REFRESH_URL  = "https://oauth2.googleapis.com/token"
MS_TOKEN_URL              = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
MS_GRAPH_MESSAGES_URL     = "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages"

SCOPES = [
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.send",
]


# ============================================================
# 🤖 CLASSIFICATION IA (Mistral)
# ============================================================

def mistral_is_relevant(sender: str, subject: str, body: str) -> bool:
    """
    Classification rapide via Mistral small.
    Retourne True si l'email est pertinent pour une agence immobilière.
    Fail open : retourne True en cas d'erreur ou si MISTRAL_API_KEY absent.
    """
    if not MISTRAL_API_KEY:
        return True

    prompt = (
        "Tu es un filtre pour une agence immobilière française.\n"
        "Est-ce que cet email est une demande de location, "
        "candidature locataire, demande de visite, ou envoi "
        "de documents locatifs ?\n"
        "Réponds uniquement OUI ou NON.\n"
        f"Expéditeur: {sender}\n"
        f"Sujet: {subject}\n"
        f"Corps: {body[:500]}"
    )

    try:
        client = Mistral(api_key=MISTRAL_API_KEY)
        response = client.chat.complete(
            model="mistral-small-latest",
            messages=[{"role": "user", "content": prompt}],
        )
        answer = (response.choices[0].message.content or "").strip().upper()
        is_relevant = answer.startswith("OUI")
        log.info(f"[ia] Mistral réponse={answer!r} → {'✅ OUI' if is_relevant else '❌ NON'}")
        return is_relevant
    except Exception as e:
        log.warning(f"[ia] Erreur Mistral (fail open) : {e}")
        return True


# ============================================================
# 🧠 NOUVELLE STRATÉGIE DE FILTRAGE MÉTIER
# ============================================================

class FilterDecision(str, Enum):
    PROCESS_FULL  = "process_full"
    PROCESS_LIGHT = "process_light"
    IGNORE        = "ignore"


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
    # Microsoft système — ignorés avant toute recherche de mots-clés
    "@microsoft.com",
    "@accountprotection.microsoft.com",
    "@emailnotifications.microsoft.com",
    "no-reply@microsoft.com",
]

# ── Mots-clés immobiliers (sujet OU corps) ───────────────────────────────────
IMMOBILIER_KEYWORDS = [
    "candidature", "dossier", "locataire", "location", "louer", "bail", "garant",
    "appartement", "studio", "t2", "t3", "t4", "t5", "maison", "logement", "pièces",
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
    Fait une requête au backend avec normalisation Gmail.
    """
    try:
        log.info(f"[filter] Vérification expéditeur connu : {sender_email}")
        resp = requests.get(
            CHECK_SENDER_URL,
            params={
                "email": sender_email,
                "agency_id": agency_id,
            },
            headers={"x-watcher-secret": WATCHER_SECRET},
            timeout=3,
        )
        if resp.status_code == 200:
            is_known = resp.json().get("is_known", False)
            log.info(f"[filter] Résultat: is_known={is_known}")
            return is_known
        else:
            log.warning(f"[filter] Backend retourné {resp.status_code}")
    except requests.exceptions.MissingSchema as e:
        log.error(f"[filter] CHECK_SENDER_URL malformée — vérifiez BACKEND_URL : {e}")
    except requests.exceptions.RequestException as e:
        log.warning(f"[filter] Erreur réseau vérification expéditeur : {e}")
    except Exception as e:
        log.warning(f"[filter] Erreur vérification expéditeur : {e}")
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

    msg_data = service.users().messages().get(
        userId="me",
        id=message_id,
        format="full",
    ).execute()

    payload = msg_data.get("payload", {})
    headers = payload.get("headers", [])

    if _get_header(headers, "X-CipherFlow-Origin"):
        log.info(f"[watcher] Email CipherFlow ignoré (anti-boucle) id={message_id}")
        _mark_as_read(service, message_id)
        return

    sender  = _get_header(headers, "From")
    subject = _decode_mime_header(_get_header(headers, "Subject"))
    body, att_meta = _extract_body_and_attachments(payload)
    body = body or ""

    log.info(f"📧 Email reçu — De: {sender} | Sujet: {subject[:50]}")

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

    # ── CLASSIFICATION IA (Mistral) ────────────────────────────────────────────
    if not mistral_is_relevant(sender, subject, body):
        log.info(f"❌ IGNORE (IA) — {subject[:50]}")
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
# 🔐 GESTION TOKENS OUTLOOK (Microsoft Graph)
# ============================================================

def refresh_outlook_token_if_needed(config: dict) -> dict | None:
    """
    Rafraîchit le token Outlook si l'expiry est dans moins de 5 minutes.
    Met à jour config en place et notifie le backend.
    Retourne le config mis à jour, ou None si le refresh échoue.
    """
    agency_id = config["agency_id"]
    expiry_str = config.get("outlook_token_expiry")

    needs_refresh = True
    if expiry_str:
        try:
            expiry = datetime.fromisoformat(expiry_str.replace("Z", "+00:00"))
            if expiry.tzinfo is None:
                expiry = expiry.replace(tzinfo=timezone.utc)
            needs_refresh = (expiry - datetime.now(timezone.utc)) < timedelta(minutes=5)
        except Exception:
            pass

    if not needs_refresh:
        return config

    log.info(f"[outlook] Token expiré/proche, rafraîchissement agency={agency_id}")

    if not MICROSOFT_CLIENT_ID or not MICROSOFT_CLIENT_SECRET:
        log.error("[outlook] MICROSOFT_CLIENT_ID ou MICROSOFT_CLIENT_SECRET manquant")
        return None

    try:
        resp = requests.post(
            MS_TOKEN_URL,
            data={
                "grant_type":    "refresh_token",
                "refresh_token": config["outlook_refresh_token"],
                "client_id":     MICROSOFT_CLIENT_ID,
                "client_secret": MICROSOFT_CLIENT_SECRET,
                "scope":         "Mail.Read Mail.Send offline_access",
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=15,
        )

        if not resp.ok:
            log.error(
                f"[outlook] Refresh token HTTP {resp.status_code} agency={agency_id} "
                f"— {resp.text[:300]}"
            )
            return None

        tokens = resp.json()
        new_access_token = tokens.get("access_token")
        if not new_access_token:
            log.error(f"[outlook] Pas d'access_token dans la réponse agency={agency_id}")
            return None

        expires_in = tokens.get("expires_in", 3600)
        new_expiry = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
        new_expiry_iso = new_expiry.isoformat()

        # Mettre à jour config local
        config["outlook_access_token"] = new_access_token
        config["outlook_token_expiry"] = new_expiry_iso

        # Notifier le backend pour MAJ en base
        try:
            requests.post(
                OUTLOOK_UPDATE_URL,
                json={
                    "agency_id":            agency_id,
                    "outlook_access_token": new_access_token,
                    "outlook_token_expiry": new_expiry_iso,
                },
                headers={"x-watcher-secret": WATCHER_SECRET},
                timeout=10,
            )
        except Exception as e:
            log.warning(f"[outlook] MAJ token backend échouée (non bloquant) : {e}")

        log.info(f"[outlook] Token rafraîchi agency={agency_id}")
        return config

    except Exception as e:
        log.error(f"[outlook] Refresh token exception agency={agency_id} : {e}")
        return None


# ============================================================
# 📧 PARSING EMAIL OUTLOOK (Microsoft Graph)
# ============================================================

def _outlook_headers(access_token: str) -> dict:
    return {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }


def _mark_outlook_read(message_id: str, access_token: str):
    """Marque un email Outlook comme lu via Graph API."""
    try:
        url = f"https://graph.microsoft.com/v1.0/me/messages/{message_id}"
        resp = requests.patch(
            url,
            json={"isRead": True},
            headers=_outlook_headers(access_token),
            timeout=10,
        )
        if resp.ok:
            log.info(f"[outlook] ✅ marqué lu id={message_id}")
        else:
            log.warning(f"[outlook] Impossible de marquer comme lu {message_id} — HTTP {resp.status_code} : {resp.text[:200]}")
    except Exception as e:
        log.warning(f"[outlook] Impossible de marquer comme lu {message_id} : {e}")


def _get_outlook_body(message: dict) -> str:
    """Extrait le corps texte depuis un message Graph API (prefer text/plain)."""
    body = message.get("body", {})
    content_type = body.get("contentType", "").lower()
    content = body.get("content", "")

    if content_type == "html":
        # Strip HTML tags simplement
        content = re.sub(r"<[^>]+>", " ", content)
        content = re.sub(r"&nbsp;", " ", content)
        content = re.sub(r"&amp;", "&", content)
        content = re.sub(r"&lt;", "<", content)
        content = re.sub(r"&gt;", ">", content)
        content = re.sub(r"\s{2,}", " ", content)

    return content.strip()


def _get_internet_message_headers(message_id: str, access_token: str) -> list:
    """
    Récupère les internetMessageHeaders d'un message Outlook via un appel séparé.
    Nécessaire car ce champ n'est pas disponible dans la requête de liste ($select).
    Utilisé pour l'anti-boucle CipherFlow (header X-CipherFlow-Origin).
    """
    try:
        url = f"https://graph.microsoft.com/v1.0/me/messages/{message_id}"
        resp = requests.get(
            url,
            params={"$select": "internetMessageHeaders"},
            headers=_outlook_headers(access_token),
            timeout=10,
        )
        if resp.ok:
            return resp.json().get("internetMessageHeaders", [])
        log.warning(
            f"[outlook] Impossible de récupérer les headers id={message_id} "
            f"HTTP {resp.status_code}"
        )
    except Exception as e:
        log.warning(f"[outlook] Erreur récupération headers message={message_id} : {e}")
    return []


def _get_outlook_attachments(message_id: str, access_token: str, has_attachments: bool) -> list:
    """
    Récupère les pièces jointes d'un message Outlook via Graph API.
    Graph retourne contentBytes en base64 directement.
    """
    if not has_attachments:
        return []

    attachments = []
    try:
        url = f"https://graph.microsoft.com/v1.0/me/messages/{message_id}/attachments"
        resp = requests.get(url, headers=_outlook_headers(access_token), timeout=20)
        if not resp.ok:
            log.warning(f"[outlook] Attachments HTTP {resp.status_code} — {resp.text[:200]}")
            return []

        for att in resp.json().get("value", []):
            # On ne traite que les fileAttachments (pas les itemAttachments = emails imbriqués)
            if att.get("@odata.type") != "#microsoft.graph.fileAttachment":
                continue

            content_bytes_b64 = att.get("contentBytes", "")
            if not content_bytes_b64:
                continue

            filename = att.get("name", "attachment")
            content_type = att.get("contentType", "application/octet-stream")
            size = att.get("size", 0)

            attachments.append({
                "filename":       filename,
                "content_type":   content_type,
                "content_base64": content_bytes_b64,
            })
            log.info(f"   ✅ PJ Outlook : {filename} ({size} bytes)")

    except Exception as e:
        log.error(f"[outlook] Erreur récupération PJ message={message_id} : {e}")

    return attachments


# ============================================================
# 🚀 TRAITEMENT D'UN EMAIL OUTLOOK
# ============================================================

def process_one_outlook_message(
    message: dict,
    agency_id: int,
    outlook_email: str,
    access_token: str,
):
    """Traite un email Outlook (Graph API) et l'envoie au webhook backend."""
    message_id = message.get("id", "")

    # Anti-boucle : appel séparé pour récupérer les internetMessageHeaders
    # (non disponible dans la requête de liste)
    internet_headers = _get_internet_message_headers(message_id, access_token)
    for h in internet_headers:
        if h.get("name", "").lower() == "x-cipherflow-origin":
            log.info(f"[outlook] Email CipherFlow ignoré (anti-boucle) id={message_id}")
            _mark_outlook_read(message_id, access_token)
            return

    sender_obj = message.get("from", {}).get("emailAddress", {})
    sender_name  = sender_obj.get("name", "")
    sender_email = sender_obj.get("address", "")
    sender       = f"{sender_name} <{sender_email}>" if sender_name else sender_email

    subject = message.get("subject", "")
    body    = _get_outlook_body(message)
    has_att = message.get("hasAttachments", False)

    log.info(f"📧 Outlook reçu — De: {sender} | Sujet: {subject[:50]}")

    attachments = _get_outlook_attachments(message_id, access_token, has_att)

    # ── Filtrage métier (même logique que Gmail) ───────────────────────────────
    decision, reasons = decide_filter(sender, subject, body, attachments, agency_id)
    log.info(f"🧠 Outlook Décision={decision.value} | Raisons={reasons} | agency={agency_id}")

    if decision == FilterDecision.IGNORE:
        _mark_outlook_read(message_id, access_token)
        return

    # ── CLASSIFICATION IA (Mistral) ────────────────────────────────────────────
    if not mistral_is_relevant(sender, subject, body):
        log.info(f"❌ IGNORE (IA) Outlook — {subject[:50]}")
        _mark_outlook_read(message_id, access_token)
        return

    webhook_payload = {
        "from_email":      sender_email or sender,
        "to_email":        outlook_email,
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
            log.info(f"✅ Outlook transmis au backend agency={agency_id}")
            _mark_outlook_read(message_id, access_token)
        else:
            log.warning(f"⚠️ Backend {resp.status_code} — {resp.text[:200]}")
    except Exception as e:
        log.error(f"❌ Erreur envoi backend Outlook : {e}")


# ============================================================
# 👀 BOUCLE OUTLOOK PAR AGENCE
# ============================================================

def watch_agency_outlook(config: dict, stop_event: threading.Event):
    """Thread de surveillance Outlook pour une agence."""
    agency_id     = config["agency_id"]
    outlook_email = config.get("outlook_email", "")

    log.info(f"👀 Watcher Outlook démarré — agency={agency_id} email={outlook_email}")

    while not stop_event.is_set():
        try:
            # Refresh token si nécessaire
            updated_config = refresh_outlook_token_if_needed(config)
            if updated_config is None:
                log.error(f"[outlook] Refresh impossible — pause agency={agency_id}")
                stop_event.wait(POLL_INTERVAL_SEC)
                continue
            config = updated_config

            access_token = config.get("outlook_access_token", "")
            if not access_token:
                log.error(f"[outlook] Pas d'access_token agency={agency_id}")
                stop_event.wait(POLL_INTERVAL_SEC)
                continue

            # Récupère les messages non lus de l'inbox
            resp = requests.get(
                MS_GRAPH_MESSAGES_URL,
                params={
                    "$filter":  "isRead eq false",
                    "$top":     str(MAX_EMAILS_PER_LOOP),
                    "$select":  "id,subject,from,body,hasAttachments,isRead",
                },
                headers=_outlook_headers(access_token),
                timeout=20,
            )

            if resp.status_code == 401:
                log.warning(f"[outlook] 401 — forçage refresh token agency={agency_id}")
                config["outlook_token_expiry"] = None
                stop_event.wait(5)
                continue

            if resp.status_code == 429:
                retry_after = int(resp.headers.get("Retry-After", 60))
                retry_after = min(retry_after, 300)  # cap à 5 minutes
                log.warning(
                    f"[outlook] 429 Rate limit — attente {retry_after}s agency={agency_id}"
                )
                stop_event.wait(retry_after)
                continue

            if not resp.ok:
                log.warning(f"⚠️ Graph API {resp.status_code} agency={agency_id} — {resp.text[:200]}")
                stop_event.wait(POLL_INTERVAL_SEC)
                continue

            messages = resp.json().get("value", [])
            log.info(f"[outlook] {len(messages)} email(s) non lus — agency={agency_id}")

            for message in messages:
                if stop_event.is_set():
                    break
                try:
                    process_one_outlook_message(message, agency_id, outlook_email, access_token)
                except Exception as e:
                    log.error(f"[outlook] Erreur traitement message {message.get('id')} : {e}")

                time.sleep(PAUSE_BETWEEN_EMAILS_SEC)

        except Exception as e:
            log.warning(f"⚠️ Erreur boucle Outlook agency={agency_id} : {e}")

        stop_event.wait(POLL_INTERVAL_SEC)

    log.info(f"🛑 Watcher Outlook arrêté — agency={agency_id}")


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
    """Récupère toutes les configs actives (Gmail OU Outlook connecté)."""
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
    """Boucle principale multi-tenant — démarre/arrête les threads Gmail ET Outlook par agence."""
    log.info("🚀 Watcher multi-tenant (Gmail + Outlook) démarré")

    gmail_watchers:   dict = {}  # agency_id -> (thread, stop_event)
    outlook_watchers: dict = {}  # agency_id -> (thread, stop_event)

    while True:
        configs = fetch_configs()

        # Agences avec Gmail connecté
        gmail_configs   = [c for c in configs if c.get("gmail_refresh_token")]
        # Agences avec Outlook connecté
        outlook_configs = [c for c in configs if c.get("outlook_refresh_token")]

        gmail_ids   = {c["agency_id"] for c in gmail_configs}
        outlook_ids = {c["agency_id"] for c in outlook_configs}

        # ── Arrêt des watchers Gmail obsolètes ────────────────────────────────
        for agency_id in list(gmail_watchers.keys()):
            if agency_id not in gmail_ids:
                log.info(f"🛑 Désactivation watcher Gmail agency={agency_id}")
                stop_event = gmail_watchers[agency_id][1]
                stop_event.set()
                gmail_watchers[agency_id][0].join(timeout=5)
                del gmail_watchers[agency_id]

        # ── Arrêt des watchers Outlook obsolètes ─────────────────────────────
        for agency_id in list(outlook_watchers.keys()):
            if agency_id not in outlook_ids:
                log.info(f"🛑 Désactivation watcher Outlook agency={agency_id}")
                stop_event = outlook_watchers[agency_id][1]
                stop_event.set()
                outlook_watchers[agency_id][0].join(timeout=5)
                del outlook_watchers[agency_id]

        # ── Démarrage des nouveaux watchers Gmail ─────────────────────────────
        for config in gmail_configs:
            agency_id = config["agency_id"]
            if agency_id not in gmail_watchers:
                stop_event = threading.Event()
                t = threading.Thread(
                    target=watch_agency_gmail,
                    args=(config, stop_event),
                    daemon=True,
                    name=f"watcher-gmail-{agency_id}",
                )
                t.start()
                gmail_watchers[agency_id] = (t, stop_event)
                log.info(f"▶️ Watcher Gmail démarré agency={agency_id}")

        # ── Démarrage des nouveaux watchers Outlook ───────────────────────────
        for config in outlook_configs:
            agency_id = config["agency_id"]
            if agency_id not in outlook_watchers:
                stop_event = threading.Event()
                t = threading.Thread(
                    target=watch_agency_outlook,
                    args=(config, stop_event),
                    daemon=True,
                    name=f"watcher-outlook-{agency_id}",
                )
                t.start()
                outlook_watchers[agency_id] = (t, stop_event)
                log.info(f"▶️ Watcher Outlook démarré agency={agency_id}")

        time.sleep(CONFIG_REFRESH_INTERVAL)


if __name__ == "__main__":
    run_multi_tenant_watcher()