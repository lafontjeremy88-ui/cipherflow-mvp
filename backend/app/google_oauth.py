import os
import secrets
from urllib.parse import urlencode

import httpx
from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from .database import get_db
from app.database.models import User
from .auth import create_access_token, get_password_hash

router = APIRouter()

GOOGLE_OAUTH_CLIENT_ID = os.getenv("GOOGLE_OAUTH_CLIENT_ID", "").strip()
GOOGLE_OAUTH_CLIENT_SECRET = os.getenv("GOOGLE_OAUTH_CLIENT_SECRET", "").strip()
GOOGLE_OAUTH_REDIRECT_URL = os.getenv("GOOGLE_OAUTH_REDIRECT_URL", "").strip()
FRONTEND_URL = os.getenv("FRONTEND_URL", "").strip()  # ex: https://cipherflow.company

# Optionnel : si ton front a une route différente
FRONTEND_OAUTH_CALLBACK_PATH = os.getenv("FRONTEND_OAUTH_CALLBACK_PATH", "/oauth/callback").strip()

ENV = os.getenv("ENV", "dev").lower()
if ENV in ("prod", "production"):
    missing = []
    if not GOOGLE_OAUTH_CLIENT_ID:
        missing.append("GOOGLE_OAUTH_CLIENT_ID")
    if not GOOGLE_OAUTH_CLIENT_SECRET:
        missing.append("GOOGLE_OAUTH_CLIENT_SECRET")
    if not GOOGLE_OAUTH_REDIRECT_URL:
        missing.append("GOOGLE_OAUTH_REDIRECT_URL")
    if not FRONTEND_URL:
        missing.append("FRONTEND_URL")
    if missing:
        raise RuntimeError(f"Variables Google OAuth manquantes: {', '.join(missing)}")

oauth = OAuth()
oauth.register(
    name="google",
    client_id=GOOGLE_OAUTH_CLIENT_ID,
    client_secret=GOOGLE_OAUTH_CLIENT_SECRET,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)

def _frontend_callback_url_with_fragment(token: str, email: str) -> str:
    """
    On met le token dans le fragment (#) pour éviter qu'il soit envoyé au serveur
    via Referer / logs / proxies.
    Exemple final:
      https://front.tld/oauth/callback#token=...&email=...
    """
    base = FRONTEND_URL.rstrip("/") + FRONTEND_OAUTH_CALLBACK_PATH
    frag = urlencode({"token": token, "email": email})
    return f"{base}#{frag}"

@router.get("/auth/google/login")
async def google_login(request: Request):
    # IMPORTANT : nécessite SessionMiddleware dans main.py
    # Redirige l'utilisateur vers Google (consent screen)
    if not GOOGLE_OAUTH_REDIRECT_URL:
        raise HTTPException(status_code=500, detail="GOOGLE_OAUTH_REDIRECT_URL not configured")
    return await oauth.google.authorize_redirect(request, redirect_uri=GOOGLE_OAUTH_REDIRECT_URL)

@router.get("/auth/google/callback")
async def google_callback(request: Request, db: Session = Depends(get_db)):
    """
    1) Google renvoie ici avec ?code=...
    2) On échange le code contre un access token
    3) On récupère le userinfo (email)
    4) Upsert en base
    5) On génère ton JWT interne
    6) Redirection vers le front avec JWT (dans #)
    """
    try:
        token = await oauth.google.authorize_access_token(request)
    except Exception as e:
        # Authlib lève souvent une erreur si state/code invalides
        raise HTTPException(status_code=400, detail=f"Google OAuth failed: {str(e)}")

    # userinfo peut être déjà présent selon la config du provider
    userinfo = token.get("userinfo")

    if not userinfo:
        # fallback standard OIDC userinfo endpoint
        access_token = token.get("access_token")
        if not access_token:
            raise HTTPException(status_code=400, detail="No access_token returned by Google")

        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://openidconnect.googleapis.com/v1/userinfo",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            if resp.status_code != 200:
                raise HTTPException(status_code=400, detail="Failed to fetch Google userinfo")
            userinfo = resp.json()

    email = (userinfo or {}).get("email")
    if not email:
        raise HTTPException(status_code=400, detail="Google account email not found")

    # Upsert user
    user = db.query(User).filter(User.email == email).first()
    if not user:
        random_pw = secrets.token_urlsafe(24)
        user = User(email=email, hashed_password=get_password_hash(random_pw))
        db.add(user)
        db.commit()
        db.refresh(user)

    # JWT interne
    jwt_token = create_access_token({"sub": user.email})

    if not FRONTEND_URL:
        raise HTTPException(status_code=500, detail="FRONTEND_URL not configured")

    redirect_url = _frontend_callback_url_with_fragment(jwt_token, email)

    response = RedirectResponse(url=redirect_url, status_code=302)
    # Bonnes pratiques OAuth/JWT
    response.headers["Cache-Control"] = "no-store"
    response.headers["Pragma"] = "no-cache"
    return response
