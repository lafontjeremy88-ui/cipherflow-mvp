# app/app/google_oauth.py
"""
FIX P2 : JWT_SECRET_KEY et JWT_ALGO lus depuis config.py (source unique de vérité)
         au lieu de os.getenv() dupliqué.
"""
import os
from datetime import datetime, timedelta
from typing import Optional
from urllib.parse import urlencode

from jose import jwt
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import RedirectResponse
from authlib.integrations.starlette_client import OAuth
from starlette.middleware.sessions import SessionMiddleware

from app.core.config import settings

router = APIRouter(prefix="/auth/google", tags=["auth-google"])

GOOGLE_OAUTH_CLIENT_ID = os.getenv("GOOGLE_OAUTH_CLIENT_ID", "")
GOOGLE_OAUTH_CLIENT_SECRET = os.getenv("GOOGLE_OAUTH_CLIENT_SECRET", "")
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://cipherflow-mvp.vercel.app").rstrip("/")

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
    app.add_middleware(
        SessionMiddleware,
        secret_key=settings.OAUTH_STATE_SECRET,
        same_site="lax",
        https_only=True,
    )


def create_jwt(email: str, sub: str, name: Optional[str] = None, picture: Optional[str] = None) -> str:
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

        redirect_to = f"{FRONTEND_URL}/oauth/callback?{urlencode({'token': cf_token})}"
        return RedirectResponse(url=redirect_to, status_code=302)

    except Exception as e:
        err_url = f"{FRONTEND_URL}/?oauth_error=1"
        return RedirectResponse(url=err_url, status_code=302)
