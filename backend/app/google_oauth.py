# app/google_oauth.py
"""
P2 : token JWT transmis via cookie HttpOnly + Secure
     au lieu d'un query param dans l'URL (évite la fuite dans les logs/historique).
"""
import os
from datetime import datetime, timedelta
from typing import Optional

from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse
from jose import jwt
from starlette.middleware.sessions import SessionMiddleware

from app.core.config import settings

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
async def google_callback(request: Request):
    try:
        token = await oauth.google.authorize_access_token(request)
        userinfo = token.get("userinfo")
        if not userinfo:
            userinfo = await oauth.google.userinfo(token=token)

        email = userinfo.get("email")
        sub = userinfo.get("sub")
        name = userinfo.get("name")
        picture = userinfo.get("picture")

        if not email or not sub:
            raise HTTPException(status_code=400, detail="Google userinfo incomplet")

        cf_token = create_jwt(email=email, sub=sub, name=name, picture=picture)

        # ── P2 : cookie HttpOnly + Secure au lieu de query param ──────────────
        # Le frontend lit le cookie 'oauth_token' sur /oauth/callback
        # puis le stocke en mémoire et supprime le cookie.
        redirect_url = f"{FRONTEND_URL}/oauth/callback"
        response = RedirectResponse(url=redirect_url, status_code=302)
        response.set_cookie(
            key="oauth_token",
            value=cf_token,
            httponly=True,
            secure=IS_PROD,
            samesite="lax",
            max_age=120,          # 2 minutes — largement suffisant pour le redirect
            domain=None,          # laisse le navigateur gérer
        )
        return response

    except Exception:
        return RedirectResponse(url=f"{FRONTEND_URL}/?oauth_error=1", status_code=302)