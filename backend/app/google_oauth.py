# backend/app/google_oauth.py
import os
import secrets
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from authlib.integrations.starlette_client import OAuth
import httpx
from sqlalchemy.orm import Session

from .database import get_db
from .models import User
from .auth import create_access_token, get_password_hash

router = APIRouter()

GOOGLE_OAUTH_CLIENT_ID = os.getenv("GOOGLE_OAUTH_CLIENT_ID", "").strip()
GOOGLE_OAUTH_CLIENT_SECRET = os.getenv("GOOGLE_OAUTH_CLIENT_SECRET", "").strip()
GOOGLE_OAUTH_REDIRECT_URL = os.getenv("GOOGLE_OAUTH_REDIRECT_URL", "").strip()
FRONTEND_URL = os.getenv("FRONTEND_URL", "").strip()  # ex: https://cipherflow-mvp.vercel.app

# Fail fast en prod si mal configuré
ENV = os.getenv("ENV", "dev").lower()
if ENV in ("prod", "production"):
    missing = []
    if not GOOGLE_OAUTH_CLIENT_ID: missing.append("GOOGLE_OAUTH_CLIENT_ID")
    if not GOOGLE_OAUTH_CLIENT_SECRET: missing.append("GOOGLE_OAUTH_CLIENT_SECRET")
    if not GOOGLE_OAUTH_REDIRECT_URL: missing.append("GOOGLE_OAUTH_REDIRECT_URL")
    if not FRONTEND_URL: missing.append("FRONTEND_URL")
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

@router.get("/auth/google/login")
async def google_login(request: Request):
    # Redirige l'utilisateur vers Google (consent screen)
    return await oauth.google.authorize_redirect(request, redirect_uri=GOOGLE_OAUTH_REDIRECT_URL)

@router.get("/auth/google/callback")
async def google_callback(request: Request, db: Session = Depends(get_db)):
    # Échange le code Google contre un token
    token = await oauth.google.authorize_access_token(request)

    # Récupère userinfo (email, profile)
    userinfo = token.get("userinfo")
    if not userinfo:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://openidconnect.googleapis.com/v1/userinfo",
                headers={"Authorization": f"Bearer {token['access_token']}"},
            )
            userinfo = resp.json()

    email = (userinfo or {}).get("email")
    if not email:
        raise HTTPException(status_code=400, detail="Google account email not found")

    # Upsert user en base
    user = db.query(User).filter(User.email == email).first()
    if not user:
        # crée un compte sans mot de passe “humain”
        random_pw = secrets.token_urlsafe(24)
        user = User(email=email, hashed_password=get_password_hash(random_pw))
        db.add(user)
        db.commit()
        db.refresh(user)

    # JWT interne (même système que ton login)
    jwt_token = create_access_token({"sub": user.email})

    # Redirige vers le frontend avec le token
    return RedirectResponse(url=f"{FRONTEND_URL}/oauth/callback?token={jwt_token}&email={email}")
