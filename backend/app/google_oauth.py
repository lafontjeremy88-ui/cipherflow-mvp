# app/google_oauth.py
"""
P2 : token JWT transmis via cookie HttpOnly + Secure
     au lieu d'un query param dans l'URL (évite la fuite dans les logs/historique).
P2+ : validation cryptographique du token ID Google avec google-auth
P2++ : endpoint d'échange sécurisé pour protéger contre XSS
P2+++ : cookie cross-domain avec SameSite=None pour Vercel → Railway
FIX : Création automatique du user et de l'agence si non existant
"""
import logging
import os
import re
import time
from datetime import datetime, timedelta
from typing import Optional

from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, HTTPException, Request, Depends
from fastapi.responses import RedirectResponse, JSONResponse
from jose import jwt
from sqlalchemy.orm import Session
from starlette.middleware.sessions import SessionMiddleware
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

from app.core.config import settings
from app.database.database import get_db
from app.database.models import Agency, User, UserRole
from app.utils.settings_factory import create_default_settings_for_agency

log = logging.getLogger(__name__)

router = APIRouter(prefix="/auth/google", tags=["auth-google"])

GOOGLE_OAUTH_CLIENT_ID = os.getenv("GOOGLE_OAUTH_CLIENT_ID", "")
GOOGLE_OAUTH_CLIENT_SECRET = os.getenv("GOOGLE_OAUTH_CLIENT_SECRET", "")
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://cipherflow-mvp.vercel.app").rstrip("/")

SCOPES = "openid email profile"
IS_PROD = settings.ENV in ("prod", "production")

oauth = OAuth()
oauth.register(
    name="google",
    client_id=GOOGLE_OAUTH_CLIENT_ID,
    client_secret=GOOGLE_OAUTH_CLIENT_SECRET,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": SCOPES},
)


def attach_oauth(app):
    app.add_middleware(
        SessionMiddleware,
        secret_key=settings.OAUTH_STATE_SECRET,
        same_site="lax",
        https_only=IS_PROD,
    )


def verify_google_id_token(token_string: str) -> dict:
    """
    VALIDATION CRYPTOGRAPHIQUE SÉCURISÉE du token ID Google.
    Vérifie signature, audience, issuer et expiration.
    """
    try:
        idinfo = id_token.verify_oauth2_token(
            token_string,
            google_requests.Request(),
            GOOGLE_OAUTH_CLIENT_ID
        )

        if idinfo['iss'] not in ['accounts.google.com', 'https://accounts.google.com']:
            raise ValueError('Wrong issuer - le token ne vient pas de Google')

        if idinfo['aud'] != GOOGLE_OAUTH_CLIENT_ID:
            raise ValueError('Wrong audience - le token est pour une autre application')

        return idinfo

    except ValueError as e:
        raise ValueError(f"Token Google invalide: {str(e)}")


def get_or_create_user_from_google(
    db: Session,
    email: str,
    google_sub: str,
    name: Optional[str] = None,
) -> User:
    """
    Cherche ou crée l'utilisateur depuis Google OAuth.
    Si l'utilisateur existe → le retourne.
    Si l'utilisateur n'existe pas → crée user + agence automatiquement.
    """
    # 1. Chercher l'utilisateur existant
    user = db.query(User).filter(User.email == email).first()

    if user:
        log.info("[google_oauth] Utilisateur existant trouvé agency_id=%s", user.agency_id)
        return user

    # 2. Créer une nouvelle agence pour ce nouvel utilisateur
    log.info("[google_oauth] Création d'un nouveau compte Google OAuth")

    agency_name = f"Agence de {email.split('@')[0]}"
    clean_alias = re.sub(r"[^a-zA-Z0-9]", "", email.split("@")[0]).lower()

    if db.query(Agency).filter(Agency.email_alias == clean_alias).first():
        clean_alias = f"{clean_alias}{int(time.time())}"

    if db.query(Agency).filter(Agency.name == agency_name).first():
        agency_name = f"{agency_name} ({int(time.time())})"

    new_agency = Agency(
        name=agency_name,
        email_alias=clean_alias,
    )
    db.add(new_agency)
    db.commit()
    db.refresh(new_agency)
    log.info("[google_oauth] Agence créée agency_id=%s", new_agency.id)

    # 3. Créer l'utilisateur
    first_name = ""
    last_name = ""
    if name:
        parts = name.split(" ", 1)
        first_name = parts[0] if len(parts) > 0 else ""
        last_name = parts[1] if len(parts) > 1 else ""

    new_user = User(
        email=email,
        hashed_password=None,
        agency_id=new_agency.id,
        role=UserRole.AGENCY_ADMIN,
        email_verified=True,
        first_name=first_name,
        last_name=last_name,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    log.info("[google_oauth] Utilisateur créé user_id=%s", new_user.id)

    # 4. Créer les settings par défaut
    try:
        create_default_settings_for_agency(db, new_agency)
        log.info("[google_oauth] Settings créés agency_id=%s", new_agency.id)
    except Exception as e:
        log.warning("[google_oauth] Erreur création settings (non bloquant): %s", e)

    return new_user


def create_jwt(
    email: str,
    sub: str,
    name: Optional[str] = None,
    picture: Optional[str] = None,
) -> str:
    """Utilise settings.JWT_SECRET_KEY — source unique de vérité."""
    if not settings.JWT_SECRET_KEY:
        raise RuntimeError("JWT_SECRET_KEY manquant côté backend")

    now = datetime.utcnow()
    payload = {
        "sub": sub,
        "email": email,
        "name": name,
        "picture": picture,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=7)).timestamp()),
        "iss": "cipherflow",
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm="HS256")


@router.get("/login")
async def google_login(request: Request):
    backend_base = str(request.base_url).rstrip("/")
    redirect_uri = f"{backend_base}/auth/google/callback"
    return await oauth.google.authorize_redirect(request, redirect_uri)


@router.get("/callback")
async def google_callback(request: Request, db: Session = Depends(get_db)):
    """
    Callback OAuth Google — VERSION SÉCURISÉE.
    1. Récupère le token depuis Google via Authlib
    2. Valide cryptographiquement le token ID avec google-auth
    3. Cherche ou crée l'utilisateur
    4. Crée un JWT CipherFlow
    5. Retourne le token dans un cookie HttpOnly sécurisé
    """
    try:
        token_response = await oauth.google.authorize_access_token(request)

        id_token_str = token_response.get("id_token")
        if not id_token_str:
            raise HTTPException(status_code=400, detail="ID token manquant dans la réponse Google")

        try:
            userinfo = verify_google_id_token(id_token_str)
        except ValueError as e:
            log.warning("[google_oauth] Tentative avec token invalide : %s", e)
            raise HTTPException(status_code=401, detail=f"Token Google invalide: {str(e)}")

        email = userinfo.get("email")
        sub = userinfo.get("sub")
        name = userinfo.get("name")
        picture = userinfo.get("picture")

        if not email or not sub:
            raise HTTPException(status_code=400, detail="Google userinfo incomplet")

        user = get_or_create_user_from_google(
            db=db,
            email=email,
            google_sub=sub,
            name=name,
        )

        log.info("[google_oauth] Utilisateur authentifié user_id=%s agency_id=%s", user.id, user.agency_id)

        cf_token = create_jwt(email=email, sub=sub, name=name, picture=picture)

        redirect_url = f"{FRONTEND_URL}/oauth/callback"
        response = RedirectResponse(url=redirect_url, status_code=302)
        response.set_cookie(
            key="oauth_token",
            value=cf_token,
            httponly=True,
            secure=True,
            samesite="none",
            max_age=120,
            path="/",
        )
        return response

    except HTTPException:
        raise
    except Exception as e:
        log.error("[google_oauth] Erreur OAuth callback : %s", e, exc_info=True)
        return RedirectResponse(url=f"{FRONTEND_URL}/?oauth_error=1", status_code=302)


@router.get("/exchange-token")
async def exchange_token(request: Request):
    """
    Endpoint sécurisé d'échange de cookie HttpOnly contre un token JSON.
    """
    token = request.cookies.get("oauth_token")

    if not token:
        log.warning("[google_oauth] exchange-token : aucun cookie oauth_token trouvé")
        raise HTTPException(
            status_code=401,
            detail="No OAuth token found. Please authenticate again."
        )

    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=["HS256"])
        email = payload.get("email")
    except Exception as e:
        log.warning("[google_oauth] exchange-token : erreur décodage JWT : %s", e)
        email = None

    response = JSONResponse({
        "token": token,
        "email": email,
        "message": "Token échangé avec succès"
    })

    response.delete_cookie(
        key="oauth_token",
        path="/",
        samesite="none",
        secure=True,
    )

    log.info("[google_oauth] Token échangé (exchange-token)")

    return response
