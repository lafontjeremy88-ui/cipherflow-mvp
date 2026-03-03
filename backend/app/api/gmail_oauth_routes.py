# app/api/gmail_oauth_routes.py
"""
OAuth Gmail — Connexion boîte email d'une agence.

Flow complet :
  1. GET  /gmail/connect          → redirige vers Google OAuth (avec state sécurisé)
  2. GET  /gmail/callback          → Google rappelle ici, on sauvegarde les tokens
  3. GET  /gmail/status            → retourne le statut de connexion de l'agence
  4. POST /gmail/disconnect        → révoque et supprime les tokens

Scopes demandés :
  - gmail.readonly  → lecture des emails entrants (watcher)
  - gmail.send      → envoi des réponses (optionnel, pour les réponses auto)
"""

import json
import logging
import os
from datetime import datetime, timedelta
from urllib.parse import urlencode

import requests
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_db
from app.core.config import settings
from app.core.security_utils import fernet_encrypt_str, fernet_decrypt_str
from app.database.database import get_db
from app.database import models

log = logging.getLogger(__name__)
router = APIRouter(prefix="/gmail", tags=["Gmail OAuth"])

# ── Constantes Google OAuth ────────────────────────────────────────────────────

GOOGLE_AUTH_URL   = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL  = "https://oauth2.googleapis.com/token"
GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke"
GOOGLE_USERINFO   = "https://www.googleapis.com/oauth2/v2/userinfo"

SCOPES = [
    "https://www.googleapis.com/auth/gmail.modify",  # inclut readonly + marquer comme lu
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/userinfo.email",
    "openid",
]

# ── Helpers ────────────────────────────────────────────────────────────────────

def _get_or_create_email_config(db: Session, agency_id: int) -> models.AgencyEmailConfig:
    config = (
        db.query(models.AgencyEmailConfig)
        .filter(models.AgencyEmailConfig.agency_id == agency_id)
        .first()
    )
    if not config:
        config = models.AgencyEmailConfig(agency_id=agency_id, enabled=False)
        db.add(config)
        db.commit()
        db.refresh(config)
    return config


def _build_state(agency_id: int) -> str:
    """
    Encode un state sécurisé pour le callback OAuth.
    Contient l'agency_id + un secret pour éviter les CSRF.
    """
    import hmac, hashlib, base64
    payload = f"{agency_id}"
    sig = hmac.new(
        settings.OAUTH_STATE_SECRET.encode(),
        payload.encode(),
        hashlib.sha256,
    ).hexdigest()[:16]
    raw = f"{payload}:{sig}"
    return base64.urlsafe_b64encode(raw.encode()).decode()


def _verify_state(state: str) -> int:
    """Vérifie le state et retourne l'agency_id. Lève ValueError si invalide."""
    import hmac, hashlib, base64
    try:
        raw = base64.urlsafe_b64decode(state.encode()).decode()
        payload, sig = raw.rsplit(":", 1)
        expected = hmac.new(
            settings.OAUTH_STATE_SECRET.encode(),
            payload.encode(),
            hashlib.sha256,
        ).hexdigest()[:16]
        if not hmac.compare_digest(sig, expected):
            raise ValueError("Signature invalide")
        return int(payload)
    except Exception as e:
        raise ValueError(f"State OAuth invalide : {e}")


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.get("/connect")
async def gmail_connect(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user_db),
):
    """
    Démarre le flow OAuth Gmail.
    Redirige l'utilisateur vers Google pour autoriser l'accès à sa boîte.
    """
    agency_id = current_user.agency_id
    if not agency_id:
        raise HTTPException(status_code=400, detail="Utilisateur sans agence")

    state = _build_state(agency_id)

    params = {
        "client_id":     settings.GOOGLE_OAUTH_CLIENT_ID,
        "redirect_uri":  settings.GOOGLE_OAUTH_REDIRECT_URL,
        "response_type": "code",
        "scope":         " ".join(SCOPES),
        "access_type":   "offline",      # pour obtenir un refresh_token
        "prompt":        "consent",      # force le refresh_token à chaque fois
        "state":         state,
    }

    url = f"{GOOGLE_AUTH_URL}?{urlencode(params)}"
    log.info(f"[gmail_oauth] Redirection OAuth agency={agency_id}")
    # Retourne l'URL pour que le frontend redirige lui-même
    # (évite le problème d'auth header perdu lors d'une RedirectResponse)
    return {"auth_url": url}


@router.get("/callback")
async def gmail_callback(
    code:  str = Query(...),
    state: str = Query(...),
    db:    Session = Depends(get_db),
):
    """
    Callback Google OAuth.
    Échange le code contre des tokens et les sauvegarde en base.
    Redirige vers le frontend avec le résultat.
    """
    # 1. Vérification du state
    try:
        agency_id = _verify_state(state)
    except ValueError as e:
        log.error(f"[gmail_oauth] State invalide : {e}")
        return RedirectResponse(f"{settings.FRONTEND_URL}/settings?gmail=error&reason=invalid_state")

    # 2. Échange code → tokens
    try:
        token_resp = requests.post(
            GOOGLE_TOKEN_URL,
            data={
                "code":          code,
                "client_id":     settings.GOOGLE_OAUTH_CLIENT_ID,
                "client_secret": settings.GOOGLE_OAUTH_CLIENT_SECRET,
                "redirect_uri":  settings.GOOGLE_OAUTH_REDIRECT_URL,
                "grant_type":    "authorization_code",
            },
            timeout=15,
        )
        token_resp.raise_for_status()
        tokens = token_resp.json()
    except Exception as e:
        log.error(f"[gmail_oauth] Échange token échoué : {e}")
        return RedirectResponse(f"{settings.FRONTEND_URL}/settings?gmail=error&reason=token_exchange")

    access_token  = tokens.get("access_token")
    refresh_token = tokens.get("refresh_token")
    expires_in    = tokens.get("expires_in", 3600)

    if not access_token or not refresh_token:
        log.error(f"[gmail_oauth] Tokens manquants dans la réponse Google")
        return RedirectResponse(f"{settings.FRONTEND_URL}/settings?gmail=error&reason=missing_tokens")

    # 3. Récupération de l'adresse Gmail connectée
    try:
        userinfo_resp = requests.get(
            GOOGLE_USERINFO,
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10,
        )
        userinfo_resp.raise_for_status()
        gmail_email = userinfo_resp.json().get("email", "")
    except Exception as e:
        log.warning(f"[gmail_oauth] Impossible de récupérer l'email : {e}")
        gmail_email = ""

    # ═══════════════════════════════════════════════════════════════════════════
    # 🔒 FIX : VÉRIFICATION DOUBLON GMAIL
    # ═══════════════════════════════════════════════════════════════════════════
    
    # Vérifie si ce Gmail est déjà connecté à UNE AUTRE agence
    if gmail_email:
        existing = db.query(models.AgencyEmailConfig).filter(
            models.AgencyEmailConfig.gmail_email == gmail_email,
            models.AgencyEmailConfig.agency_id != agency_id,
            models.AgencyEmailConfig.gmail_refresh_token.isnot(None),
        ).first()

        if existing:
            log.warning(
                f"[gmail_oauth] Gmail {gmail_email} déjà connecté à agency={existing.agency_id}"
            )
            return RedirectResponse(
                f"{settings.FRONTEND_URL}/settings?gmail=error&reason=already_connected"
            )
    
    # ═══════════════════════════════════════════════════════════════════════════

    # 4. Sauvegarde en base (tokens chiffrés avec Fernet)
    try:
        config = _get_or_create_email_config(db, agency_id)
        config.gmail_access_token  = fernet_encrypt_str(access_token)
        config.gmail_refresh_token = fernet_encrypt_str(refresh_token)
        config.gmail_token_expiry  = datetime.utcnow() + timedelta(seconds=expires_in)
        config.gmail_email         = gmail_email
        config.enabled             = True
        db.commit()
        log.info(f"[gmail_oauth] ✅ Tokens sauvegardés agency={agency_id} email={gmail_email}")
    except Exception as e:
        log.error(f"[gmail_oauth] Erreur sauvegarde DB : {e}")
        return RedirectResponse(f"{settings.FRONTEND_URL}/settings?gmail=error&reason=db_error")

    return RedirectResponse(f"{settings.FRONTEND_URL}/settings?gmail=success&email={gmail_email}")


@router.get("/status")
async def gmail_status(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user_db),
):
    """Retourne le statut de connexion Gmail de l'agence."""
    config = (
        db.query(models.AgencyEmailConfig)
        .filter(models.AgencyEmailConfig.agency_id == current_user.agency_id)
        .first()
    )

    if not config or not config.gmail_refresh_token:
        return {"connected": False, "email": None}

    return {
        "connected": True,
        "email":     config.gmail_email,
        "enabled":   config.enabled,
    }


@router.post("/disconnect")
async def gmail_disconnect(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user_db),
):
    """Révoque les tokens Gmail et désactive le watcher."""
    config = (
        db.query(models.AgencyEmailConfig)
        .filter(models.AgencyEmailConfig.agency_id == current_user.agency_id)
        .first()
    )

    if not config or not config.gmail_refresh_token:
        raise HTTPException(status_code=404, detail="Aucune connexion Gmail active")

    # Révocation côté Google (best effort — déchiffrement du token avant envoi)
    try:
        requests.post(
            GOOGLE_REVOKE_URL,
            params={"token": fernet_decrypt_str(config.gmail_refresh_token)},
            timeout=10,
        )
    except Exception as e:
        log.warning(f"[gmail_oauth] Révocation Google échouée (non bloquant) : {e}")

    # Nettoyage en base
    config.gmail_access_token  = None
    config.gmail_refresh_token = None
    config.gmail_token_expiry  = None
    config.gmail_email         = None
    config.enabled             = False
    db.commit()

    log.info(f"[gmail_oauth] Déconnexion agency={current_user.agency_id}")
    return {"success": True}