# app/core/security_utils.py
"""
Utilitaires sécurité CipherFlow :
- Chiffrement Fernet (fichiers sur disque)
- Hash tokens (refresh, verify email)
- Politique mot de passe
- Cookies refresh token
- Envoi emails système (verification, reset)
"""

import hashlib
import logging
import os
import re
import secrets
from datetime import datetime, timedelta

import resend
from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException, Response

log = logging.getLogger(__name__)

# ── Fernet (chiffrement fichiers) ──────────────────────────────────────────────

TOKEN_ENCRYPTION_KEY = os.getenv("TOKEN_ENCRYPTION_KEY", "").strip()
FERNET = Fernet(TOKEN_ENCRYPTION_KEY.encode()) if TOKEN_ENCRYPTION_KEY else None

ENV = os.getenv("ENV", "dev").lower()
if ENV in ("prod", "production") and not TOKEN_ENCRYPTION_KEY:
    raise RuntimeError("TOKEN_ENCRYPTION_KEY manquante en production")


def encrypt_bytes(data: bytes) -> bytes:
    if not FERNET:
        return data
    return FERNET.encrypt(data)


def decrypt_bytes(data: bytes) -> bytes:
    if not FERNET:
        return data
    try:
        return FERNET.decrypt(data)
    except InvalidToken:
        return data


# ── Fernet (chiffrement tokens DB) ────────────────────────────────────────────

def fernet_encrypt_str(value: str) -> str:
    """Chiffre une chaîne avec FERNET_KEY (stockage tokens en DB).
    Retourne la valeur en clair si la clé n'est pas configurée (dev).
    """
    from app.core.config import settings as app_settings
    key = (app_settings.FERNET_KEY or "").strip()
    if not key:
        return value
    f = Fernet(key.encode() if isinstance(key, str) else key)
    return f.encrypt(value.encode()).decode()


def fernet_decrypt_str(encrypted: str) -> str:
    """Déchiffre une chaîne chiffrée avec FERNET_KEY.
    Retourne la valeur telle quelle si la clé n'est pas configurée (dev).
    Retourne une chaîne vide si le déchiffrement échoue.
    """
    from app.core.config import settings as app_settings
    key = (app_settings.FERNET_KEY or "").strip()
    if not key:
        return encrypted
    try:
        f = Fernet(key.encode() if isinstance(key, str) else key)
        return f.decrypt(encrypted.encode()).decode()
    except Exception:
        return ""


# ── Tokens ─────────────────────────────────────────────────────────────────────

REFRESH_TOKEN_DAYS = 30
ACCESS_TOKEN_MINUTES = 15


def create_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_email_verify_token() -> str:
    return secrets.token_urlsafe(32)


# ── Politique mot de passe ─────────────────────────────────────────────────────

def check_password_policy(password: str) -> None:
    if not password or len(password) < 8:
        raise HTTPException(400, "Mot de passe trop faible (min 8 caractères).")
    if not re.search(r"[a-z]", password):
        raise HTTPException(400, "Mot de passe trop faible (1 minuscule requis).")
    if not re.search(r"[A-Z]", password):
        raise HTTPException(400, "Mot de passe trop faible (1 majuscule requise).")
    if not re.search(r"[0-9]", password):
        raise HTTPException(400, "Mot de passe trop faible (1 chiffre requis).")
    if not re.search(r"[^A-Za-z0-9]", password):
        raise HTTPException(400, "Mot de passe trop faible (1 caractère spécial requis).")


# ── Cookies ────────────────────────────────────────────────────────────────────

def set_refresh_cookie(response: Response, refresh_token: str) -> None:
    is_prod = ENV in ("prod", "production")
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=is_prod,
        samesite="none" if is_prod else "lax",
        max_age=REFRESH_TOKEN_DAYS * 24 * 60 * 60,
        path="/",
    )


def clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(key="refresh_token", path="/")


# ── Emails système (Resend) ────────────────────────────────────────────────────

RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
RESEND_FROM = os.getenv("RESEND_FROM", "CipherFlow <no-reply@cipherflow.company>")
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://cipherflow-mvp.vercel.app").rstrip("/")
EMAIL_VERIFY_EXPIRE_HOURS = int(os.getenv("EMAIL_VERIFY_EXPIRE_HOURS", "24"))
RESET_PASSWORD_EXPIRE_MINUTES = int(os.getenv("RESET_PASSWORD_EXPIRE_MINUTES", "30"))

if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY


def send_verification_email(to_email: str, token: str) -> None:
    if not RESEND_API_KEY:
        raise HTTPException(500, "RESEND_API_KEY manquant")
    verify_link = f"{FRONTEND_URL}/verify-email?token={token}"
    resend.Emails.send({
        "from": "CipherFlow <no-reply@cipherflow.company>",
        "to": [to_email],
        "subject": "Vérifie ton email",
        "html": f"""
            <h2>Bienvenue sur CipherFlow 👋</h2>
            <p>Pour vérifier ton email, clique ici :</p>
            <p><a href="{verify_link}">{verify_link}</a></p>
        """,
        "headers": {"X-CipherFlow-Origin": "system-email"},
    })


def send_reset_password_email(to_email: str, token: str) -> None:
    if not RESEND_API_KEY:
        raise HTTPException(500, "RESEND_API_KEY manquant")
    reset_link = f"{FRONTEND_URL}/reset-password?token={token}"
    resend.Emails.send({
        "from": RESEND_FROM,
        "to": [to_email],
        "subject": "Réinitialise ton mot de passe",
        "html": f"""
            <h2>Réinitialisation de mot de passe</h2>
            <p>Clique ici (valable {RESET_PASSWORD_EXPIRE_MINUTES} min) :</p>
            <p><a href="{reset_link}">{reset_link}</a></p>
        """,
        "headers": {"X-CipherFlow-Origin": "system-email"},
    })


def send_email_via_resend(to_email: str, subject: str, body: str) -> None:
    if not RESEND_API_KEY:
        log.warning("RESEND_API_KEY manquant — email non envoyé")
        return
    try:
        resend.Emails.send({
            "from": RESEND_FROM,
            "to": [to_email],
            "subject": subject,
            "html": body.replace("\n", "<br>"),
            "headers": {"X-CipherFlow-Origin": "auto-reply"},
        })
    except Exception as e:
        log.error(f"Erreur envoi email : {e}")
