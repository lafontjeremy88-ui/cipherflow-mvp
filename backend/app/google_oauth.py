# app/app/google_oauth.py
import os
from datetime import datetime, timedelta
from typing import Optional
from urllib.parse import urlencode

from jose import jwt
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import RedirectResponse, JSONResponse
from authlib.integrations.starlette_client import OAuth
from starlette.middleware.sessions import SessionMiddleware

router = APIRouter(prefix="/auth/google", tags=["auth-google"])

GOOGLE_OAUTH_CLIENT_ID = os.getenv("GOOGLE_OAUTH_CLIENT_ID", "")
GOOGLE_OAUTH_CLIENT_SECRET = os.getenv("GOOGLE_OAUTH_CLIENT_SECRET", "")
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://cipherflow-mvp.vercel.app").rstrip("/")
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "")
JWT_ALGO = os.getenv("JWT_ALGO", "HS256")
OAUTH_STATE_SECRET = os.getenv("OAUTH_STATE_SECRET", "change-me")  # doit être rempli en prod

# Scopes minimum
SCOPES = "openid email profile"

oauth = OAuth()
oauth.register(
    name="google",
    client_id=GOOGLE_OAUTH_CLIENT_ID,
    client_secret=GOOGLE_OAUTH_CLIENT_SECRET,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": SCOPES},
)


def attach_oauth(app):
    """
    A appeler dans main.py:
      from app.google_oauth import router, attach_oauth
      attach_oauth(app)
      app.include_router(router)
    """
    # Obligatoire pour stocker l'état OAuth (anti-CSRF)
    # IMPORTANT: mets une valeur stable en env: OAUTH_STATE_SECRET
    app.add_middleware(
        SessionMiddleware,
        secret_key=OAUTH_STATE_SECRET,
        same_site="lax",
        https_only=True,
    )


def create_jwt(email: str, sub: str, name: Optional[str] = None, picture: Optional[str] = None) -> str:
    if not JWT_SECRET_KEY:
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
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGO)


@router.get("/login")
async def google_login(request: Request):
    # IMPORTANT: l'URL de callback doit être celle côté Railway (celle déclarée dans Google Console)
    backend_base = str(request.base_url).rstrip("/")
    redirect_uri = f"{backend_base}/auth/google/callback"

    # Force une page Google “propre” quand nécessaire (optionnel)
    # params = {"prompt": "select_account"}
    # return await oauth.google.authorize_redirect(request, redirect_uri, **params)

    return await oauth.google.authorize_redirect(request, redirect_uri)


@router.get("/callback")
async def google_callback(request: Request):
    try:
        token = await oauth.google.authorize_access_token(request)
        userinfo = token.get("userinfo")

        # Fallback si userinfo pas présent
        if not userinfo:
            userinfo = await oauth.google.userinfo(token=token)

        email = userinfo.get("email")
        sub = userinfo.get("sub")
        name = userinfo.get("name")
        picture = userinfo.get("picture")

        if not email or not sub:
            raise HTTPException(status_code=400, detail="Google userinfo incomplet")

        cf_token = create_jwt(email=email, sub=sub, name=name, picture=picture)

        # ✅ REDIRECTION PRO : route dédiée callback côté front
        # -> ton front lit token=... puis stocke et redirige vers /dashboard
        redirect_to = f"{FRONTEND_URL}/oauth/callback?{urlencode({'token': cf_token})}"
        return RedirectResponse(url=redirect_to, status_code=302)

    except Exception as e:
        # En cas d'erreur, renvoie vers login avec un flag
        err_url = f"{FRONTEND_URL}/?oauth_error=1"
        return RedirectResponse(url=err_url, status_code=302)
