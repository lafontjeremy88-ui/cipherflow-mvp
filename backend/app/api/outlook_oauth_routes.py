# app/api/outlook_oauth_routes.py
"""
OAuth Outlook — Connexion boîte email d'une agence via Microsoft Graph.

Flow complet :
  1. GET  /outlook/connect      → retourne l'URL Microsoft OAuth (avec state sécurisé)
  2. GET  /outlook/callback     → Microsoft rappelle ici, on sauvegarde les tokens
  3. GET  /outlook/status       → retourne le statut de connexion de l'agence
  4. POST /outlook/disconnect   → supprime les tokens localement

Scopes demandés :
  - Mail.Read     → lecture des emails entrants (watcher)
  - Mail.Send     → envoi des réponses
  - offline_access → pour obtenir un refresh_token
  - openid, email  → identification de l'utilisateur
"""

import logging
from datetime import datetime, timedelta
from typing import Optional
from urllib.parse import urlencode

import requests
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_db
from app.core.config import settings
from app.core.security_utils import fernet_decrypt_str, fernet_encrypt_str
from app.database import models
from app.database.database import get_db

log = logging.getLogger(__name__)
router = APIRouter(prefix="/outlook", tags=["Outlook OAuth"])

# ── Constantes Microsoft OAuth ─────────────────────────────────────────────────

MS_AUTH_URL  = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
MS_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
MS_USERINFO  = "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName"

SCOPES = [
    "Mail.Read",
    "Mail.Send",
    "offline_access",
    "openid",
    "email",
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
    Préfixé "outlook:" pour éviter la réutilisation du state Gmail.
    """
    import base64
    import hashlib
    import hmac

    payload = f"outlook:{agency_id}"
    sig = hmac.new(
        settings.OAUTH_STATE_SECRET.encode(),
        payload.encode(),
        hashlib.sha256,
    ).hexdigest()[:16]
    raw = f"{payload}:{sig}"
    return base64.urlsafe_b64encode(raw.encode()).decode()


def _verify_state(state: str) -> int:
    """Vérifie le state et retourne l'agency_id. Lève ValueError si invalide."""
    import base64
    import hashlib
    import hmac

    try:
        raw = base64.urlsafe_b64decode(state.encode()).decode()
        # raw = "outlook:{agency_id}:{sig}"  (rsplit sur le dernier ":")
        payload, sig = raw.rsplit(":", 1)
        expected = hmac.new(
            settings.OAUTH_STATE_SECRET.encode(),
            payload.encode(),
            hashlib.sha256,
        ).hexdigest()[:16]
        if not hmac.compare_digest(sig, expected):
            raise ValueError("Signature invalide")
        # payload = "outlook:{agency_id}"
        _, agency_id_str = payload.split(":", 1)
        return int(agency_id_str)
    except Exception as e:
        raise ValueError(f"State OAuth invalide : {e}")


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.get("/connect")
async def outlook_connect(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user_db),
):
    """Démarre le flow OAuth Outlook. Retourne l'URL d'autorisation Microsoft."""
    agency_id = current_user.agency_id
    if not agency_id:
        raise HTTPException(status_code=400, detail="Utilisateur sans agence")

    state = _build_state(agency_id)

    params = {
        "client_id":     settings.MICROSOFT_CLIENT_ID,
        "redirect_uri":  settings.MICROSOFT_REDIRECT_URL,
        "response_type": "code",
        "scope":         " ".join(SCOPES),
        "prompt":        "consent",   # force le consentement pour obtenir un refresh_token
        "state":         state,
        "response_mode": "query",
    }

    url = f"{MS_AUTH_URL}?{urlencode(params)}"
    log.info(f"[outlook_oauth] Redirection OAuth agency={agency_id}")
    return {"auth_url": url}


@router.get("/callback")
async def outlook_callback(
    code:              Optional[str] = Query(None),
    state:             Optional[str] = Query(None),
    error:             Optional[str] = Query(None),
    error_description: Optional[str] = Query(None),
    db:                Session = Depends(get_db),
):
    """
    Callback Microsoft OAuth.
    Microsoft peut rappeler avec ?code=...&state=... (succès)
    ou avec ?error=...&state=... (erreur côté Microsoft).
    """
    # 0-a. Erreur renvoyée directement par Microsoft
    if error:
        log.warning(
            f"[outlook_oauth] Erreur Microsoft dans le callback : {error}"
            + (f" — {error_description}" if error_description else "")
        )
        return RedirectResponse(
            f"{settings.FRONTEND_URL}/settings?outlook=error&reason={error}"
        )

    # 0-b. Paramètres obligatoires manquants
    if not code:
        log.error("[outlook_oauth] Callback reçu sans code ni error — requête invalide")
        return RedirectResponse(
            f"{settings.FRONTEND_URL}/settings?outlook=error&reason=no_code"
        )

    if not state:
        log.error("[outlook_oauth] Callback reçu sans state")
        return RedirectResponse(
            f"{settings.FRONTEND_URL}/settings?outlook=error&reason=invalid_state"
        )

    # Vérification que les credentials Microsoft sont configurés
    if not settings.MICROSOFT_CLIENT_ID or not settings.MICROSOFT_CLIENT_SECRET:
        log.error(
            "[outlook_oauth] MICROSOFT_CLIENT_ID ou MICROSOFT_CLIENT_SECRET "
            "non configuré — ajoutez ces variables d'environnement"
        )
        return RedirectResponse(
            f"{settings.FRONTEND_URL}/settings?outlook=error&reason=missing_config"
        )

    if not settings.MICROSOFT_REDIRECT_URL:
        log.error("[outlook_oauth] MICROSOFT_REDIRECT_URL non configuré")
        return RedirectResponse(
            f"{settings.FRONTEND_URL}/settings?outlook=error&reason=missing_config"
        )

    # 1. Vérification du state
    try:
        agency_id = _verify_state(state)
    except ValueError as e:
        log.error(f"[outlook_oauth] State invalide : {e}")
        return RedirectResponse(
            f"{settings.FRONTEND_URL}/settings?outlook=error&reason=invalid_state"
        )

    # 2. Échange code → tokens
    try:
        token_resp = requests.post(
            MS_TOKEN_URL,
            data={
                "code":          code,
                "client_id":     settings.MICROSOFT_CLIENT_ID,
                "client_secret": settings.MICROSOFT_CLIENT_SECRET,
                "redirect_uri":  settings.MICROSOFT_REDIRECT_URL,
                "grant_type":    "authorization_code",
                "scope":         " ".join(SCOPES),
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=15,
        )

        # Log le corps brut AVANT raise_for_status pour voir l'erreur Microsoft exacte
        if not token_resp.ok:
            log.error(
                f"[outlook_oauth] Token exchange HTTP {token_resp.status_code} — "
                f"réponse Microsoft : {token_resp.text}"
            )
            return RedirectResponse(
                f"{settings.FRONTEND_URL}/settings?outlook=error&reason=token_exchange"
            )

        tokens = token_resp.json()
    except Exception as e:
        log.error(f"[outlook_oauth] Token exchange exception inattendue : {e}")
        return RedirectResponse(
            f"{settings.FRONTEND_URL}/settings?outlook=error&reason=token_exchange"
        )

    access_token  = tokens.get("access_token")
    refresh_token = tokens.get("refresh_token")
    expires_in    = tokens.get("expires_in", 3600)

    if not access_token or not refresh_token:
        log.error("[outlook_oauth] Tokens manquants dans la réponse Microsoft")
        return RedirectResponse(
            f"{settings.FRONTEND_URL}/settings?outlook=error&reason=missing_tokens"
        )

    # 3. Récupération de l'adresse Outlook connectée
    try:
        userinfo_resp = requests.get(
            MS_USERINFO,
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10,
        )
        userinfo_resp.raise_for_status()
        data = userinfo_resp.json()
        # "mail" peut être null pour les comptes perso — fallback sur userPrincipalName
        outlook_email = data.get("mail") or data.get("userPrincipalName") or ""
    except Exception as e:
        log.warning(f"[outlook_oauth] Impossible de récupérer l'email : {e}")
        outlook_email = ""

    # 4. Vérification doublon Outlook (même email, autre agence)
    if outlook_email:
        existing = db.query(models.AgencyEmailConfig).filter(
            models.AgencyEmailConfig.outlook_email == outlook_email,
            models.AgencyEmailConfig.agency_id != agency_id,
            models.AgencyEmailConfig.outlook_refresh_token.isnot(None),
        ).first()
        if existing:
            log.warning(
                f"[outlook_oauth] Outlook {outlook_email} déjà connecté"
                f" à agency={existing.agency_id}"
            )
            return RedirectResponse(
                f"{settings.FRONTEND_URL}/settings?outlook=error&reason=already_connected"
            )

    # 5. Sauvegarde en base (tokens chiffrés avec Fernet)
    try:
        config = _get_or_create_email_config(db, agency_id)
        config.outlook_access_token  = fernet_encrypt_str(access_token)
        config.outlook_refresh_token = fernet_encrypt_str(refresh_token)
        config.outlook_token_expiry  = datetime.utcnow() + timedelta(seconds=expires_in)
        config.outlook_email         = outlook_email
        db.commit()
        log.info(
            f"[outlook_oauth] ✅ Tokens sauvegardés agency={agency_id}"
            f" email={outlook_email}"
        )
    except Exception as e:
        log.error(f"[outlook_oauth] Erreur sauvegarde DB : {e}")
        return RedirectResponse(
            f"{settings.FRONTEND_URL}/settings?outlook=error&reason=db_error"
        )

    return RedirectResponse(
        f"{settings.FRONTEND_URL}/settings?outlook=success&email={outlook_email}"
    )


@router.get("/status")
async def outlook_status(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user_db),
):
    """Retourne le statut de connexion Outlook de l'agence."""
    config = (
        db.query(models.AgencyEmailConfig)
        .filter(models.AgencyEmailConfig.agency_id == current_user.agency_id)
        .first()
    )

    if not config or not config.outlook_refresh_token:
        return {"connected": False, "email": None}

    return {
        "connected": True,
        "email":     config.outlook_email,
    }


@router.post("/disconnect")
async def outlook_disconnect(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user_db),
):
    """Supprime les tokens Outlook (Microsoft n'a pas d'endpoint de révocation unifié)."""
    config = (
        db.query(models.AgencyEmailConfig)
        .filter(models.AgencyEmailConfig.agency_id == current_user.agency_id)
        .first()
    )

    if not config or not config.outlook_refresh_token:
        raise HTTPException(status_code=404, detail="Aucune connexion Outlook active")

    config.outlook_access_token  = None
    config.outlook_refresh_token = None
    config.outlook_token_expiry  = None
    config.outlook_email         = None
    db.commit()

    log.info(f"[outlook_oauth] Déconnexion agency={current_user.agency_id}")
    return {"success": True}
