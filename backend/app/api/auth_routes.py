# app/api/auth_routes.py
"""
Routes d'authentification CipherFlow.
register / verify-email / login / token / refresh / logout / forgot-reset password

FIX P1 : rate limiting sur /auth/login et /auth/forgot-password via slowapi.
"""

import json
import re
import secrets
import time
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Cookie, Depends, HTTPException, Query, Request, Response
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_db
from app.core.security_utils import (
    EMAIL_VERIFY_EXPIRE_HOURS,
    RESET_PASSWORD_EXPIRE_MINUTES,
    check_password_policy,
    clear_refresh_cookie,
    create_email_verify_token,
    create_refresh_token,
    hash_token,
    set_refresh_cookie,
    send_reset_password_email,
    send_verification_email,
)
from app.database.database import get_db
from app.database.models import Agency, AppSettings, RefreshToken, User, UserRole
from app.security import create_access_token, get_password_hash, verify_password
from app.utils.settings_factory import create_default_settings_for_agency
import os

router = APIRouter(prefix="/auth", tags=["Auth"])

ADMIN_BYPASS_EMAIL = os.getenv("ADMIN_BYPASS_EMAIL", "").strip().lower()
ACCESS_TOKEN_MINUTES = 15
REFRESH_TOKEN_DAYS = 30


# ── Rate limiting (slowapi) ────────────────────────────────────────────────────
# Installation : pip install slowapi
# En cas d'absence de slowapi, les routes fonctionnent sans limitation.

try:
    from slowapi import Limiter
    from slowapi.util import get_remote_address
    from slowapi.errors import RateLimitExceeded

    _limiter = Limiter(key_func=get_remote_address)

    def rate_limit(limit_string: str):
        """Décorateur de rate limit si slowapi est disponible."""
        return _limiter.limit(limit_string)

    SLOWAPI_AVAILABLE = True
except ImportError:
    SLOWAPI_AVAILABLE = False

    def rate_limit(limit_string: str):
        """No-op si slowapi n'est pas installé."""
        def decorator(func):
            return func
        return decorator


# ── Schemas ────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: str
    password: str
    terms_accepted: bool = False

class RegisterResponse(BaseModel):
    message: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user_email: str

class ResendVerificationRequest(BaseModel):
    email: EmailStr

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.post("/register", response_model=RegisterResponse)
async def register(req: LoginRequest, db: Session = Depends(get_db)):
    if not req.terms_accepted:
        raise HTTPException(status_code=422, detail="Vous devez accepter les CGU pour vous inscrire.")
    if db.query(User).filter(User.email == req.email).first():
        raise HTTPException(status_code=400, detail="Email déjà utilisé")

    check_password_policy(req.password)

    agency_name = f"Agence de {req.email.split('@')[0]}"
    clean_alias = re.sub(r"[^a-zA-Z0-9]", "", req.email.split("@")[0]).lower()

    if db.query(Agency).filter(Agency.email_alias == clean_alias).first():
        clean_alias = f"{clean_alias}{int(time.time())}"
    if db.query(Agency).filter(Agency.name == agency_name).first():
        agency_name = f"{agency_name} ({int(time.time())})"

    new_agency = Agency(name=agency_name, email_alias=clean_alias)
    db.add(new_agency)
    db.commit()
    db.refresh(new_agency)

    new_user = User(
        email=req.email,
        hashed_password=get_password_hash(req.password),
        agency_id=new_agency.id,
        role=UserRole.AGENCY_ADMIN,
        email_verified=False,
        terms_accepted_at=datetime.utcnow(),
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    create_default_settings_for_agency(db, new_agency)

    raw_token = create_email_verify_token()
    new_user.email_verification_token_hash = hash_token(raw_token)
    new_user.email_verification_expires_at = datetime.utcnow() + timedelta(hours=EMAIL_VERIFY_EXPIRE_HOURS)
    db.commit()

    try:
        send_verification_email(new_user.email, raw_token)
    except Exception as e:
        print("EMAIL VERIFICATION FAILED:", e)

    return {"message": "Inscription enregistrée. Vérifie ton email pour activer ton compte."}


@router.get("/verify-email")
def verify_email(token: str, db: Session = Depends(get_db)):
    token_hash = hash_token(token)
    user = db.query(User).filter(User.email_verification_token_hash == token_hash).first()
    if not user:
        raise HTTPException(status_code=400, detail="Lien invalide ou expiré.")
    if user.email_verified:
        return {"message": "Email déjà confirmé."}
    if not user.email_verification_expires_at or user.email_verification_expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Lien expiré. Demande un nouvel email de confirmation.")

    user.email_verified = True
    user.email_verification_token_hash = None
    user.email_verification_expires_at = None
    db.commit()
    return {"message": "✅ Email confirmé. Tu peux maintenant te connecter."}


@router.post("/verify-email")
def verify_email_post(token: str = Query(...), db: Session = Depends(get_db)):
    return verify_email(token=token, db=db)


@router.post("/resend-verification")
def resend_verification(payload: ResendVerificationRequest, db: Session = Depends(get_db)):
    ok_msg = {"message": "Si un compte existe et n'est pas vérifié, un email de confirmation a été renvoyé."}
    user = db.query(User).filter(User.email == payload.email.strip().lower()).first()
    if not user or getattr(user, "email_verified", False):
        return ok_msg

    raw_token = secrets.token_urlsafe(32)
    user.email_verification_token_hash = hash_token(raw_token)
    user.email_verification_expires_at = datetime.utcnow() + timedelta(hours=EMAIL_VERIFY_EXPIRE_HOURS)
    db.commit()

    try:
        send_verification_email(user.email, raw_token)
    except Exception:
        return {"message": "Email temporairement indisponible, réessaie dans quelques minutes."}
    return ok_msg


@router.post("/forgot-password")
@rate_limit("5/minute")
def forgot_password(request: Request, payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """FIX P1 : limité à 5 requêtes/minute par IP."""
    ok_msg = {"message": "Si un compte existe, tu recevras un email de réinitialisation."}
    user = db.query(User).filter(User.email == payload.email.strip().lower()).first()
    if not user:
        return ok_msg

    raw_token = secrets.token_urlsafe(32)
    user.reset_password_token_hash = hash_token(raw_token)
    user.reset_password_expires_at = datetime.utcnow() + timedelta(minutes=RESET_PASSWORD_EXPIRE_MINUTES)
    user.reset_password_used_at = None
    db.commit()

    try:
        send_reset_password_email(user.email, raw_token)
    except Exception:
        return ok_msg
    return ok_msg


@router.post("/reset-password")
def reset_password(payload: ResetPasswordRequest, response: Response, db: Session = Depends(get_db)):
    bad = "Lien invalide ou expiré."
    token = (payload.token or "").strip()
    if not token:
        raise HTTPException(400, bad)

    user = db.query(User).filter(User.reset_password_token_hash == hash_token(token)).first()
    if not user or user.reset_password_used_at is not None:
        raise HTTPException(400, bad)
    if not user.reset_password_expires_at or user.reset_password_expires_at < datetime.utcnow():
        raise HTTPException(400, bad)

    check_password_policy(payload.new_password)
    if verify_password(payload.new_password, user.hashed_password):
        raise HTTPException(400, "Le nouveau mot de passe doit être différent de l'ancien.")

    user.hashed_password = get_password_hash(payload.new_password)
    user.reset_password_used_at = datetime.utcnow()
    user.reset_password_token_hash = None
    user.reset_password_expires_at = None

    db.query(RefreshToken).filter(
        RefreshToken.user_id == user.id,
        RefreshToken.revoked_at.is_(None),
    ).update({"revoked_at": datetime.utcnow()})
    db.commit()

    clear_refresh_cookie(response)
    return {"message": "Mot de passe réinitialisé."}


@router.post("/login", response_model=TokenResponse)
@rate_limit("10/minute")
async def login(request: Request, req: LoginRequest, response: Response, db: Session = Depends(get_db)):
    """FIX P1 : limité à 10 requêtes/minute par IP."""
    user = db.query(User).filter(User.email == req.email).first()
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(400, "Identifiants incorrects")

    if not user.email_verified:
        if not (ADMIN_BYPASS_EMAIL and user.email.strip().lower() == ADMIN_BYPASS_EMAIL):
            raise HTTPException(403, "Email non confirmé. Vérifie ta boîte mail.")

    access = create_access_token({"sub": user.email}, expires_delta=timedelta(minutes=ACCESS_TOKEN_MINUTES))
    refresh = create_refresh_token()
    db.add(RefreshToken(
        user_id=user.id,
        token_hash=hash_token(refresh),
        created_at=datetime.utcnow(),
        expires_at=datetime.utcnow() + timedelta(days=REFRESH_TOKEN_DAYS),
    ))
    db.commit()
    set_refresh_cookie(response, refresh)
    return {"access_token": access, "token_type": "bearer", "user_email": user.email}


@router.post("/token", response_model=TokenResponse)
async def token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(401, "Identifiants invalides")
    if not getattr(user, "email_verified", False):
        raise HTTPException(403, "Email non confirmé.")

    access = create_access_token({"sub": user.email}, expires_delta=timedelta(minutes=ACCESS_TOKEN_MINUTES))
    refresh = create_refresh_token()
    db.add(RefreshToken(
        user_id=user.id,
        token_hash=hash_token(refresh),
        created_at=datetime.utcnow(),
        expires_at=datetime.utcnow() + timedelta(days=REFRESH_TOKEN_DAYS),
    ))
    db.commit()

    r = Response(
        content=json.dumps({"access_token": access, "token_type": "bearer", "user_email": user.email}),
        media_type="application/json",
    )
    set_refresh_cookie(r, refresh)
    return r


@router.post("/refresh", response_model=TokenResponse)
async def refresh_access_token(
    response: Response,
    db: Session = Depends(get_db),
    refresh_token: Optional[str] = Cookie(default=None),
):
    if not refresh_token:
        raise HTTPException(401, "Missing refresh token")

    rt = db.query(RefreshToken).filter(RefreshToken.token_hash == hash_token(refresh_token)).first()
    if not rt or rt.revoked_at is not None:
        raise HTTPException(401, "Invalid refresh token")
    if rt.expires_at < datetime.utcnow():
        raise HTTPException(401, "Refresh token expired")

    user = db.query(User).filter(User.id == rt.user_id).first()
    if not user:
        raise HTTPException(401, "User not found")

    new_refresh = create_refresh_token()
    rt.token_hash = hash_token(new_refresh)
    rt.last_used_at = datetime.utcnow()
    rt.expires_at = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_DAYS)
    db.commit()

    access = create_access_token({"sub": user.email}, expires_delta=timedelta(minutes=ACCESS_TOKEN_MINUTES))
    set_refresh_cookie(response, new_refresh)
    return {"access_token": access, "token_type": "bearer", "user_email": user.email}


@router.post("/logout")
async def logout(
    response: Response,
    db: Session = Depends(get_db),
    refresh_token: Optional[str] = Cookie(default=None),
):
    if refresh_token:
        rt = db.query(RefreshToken).filter(RefreshToken.token_hash == hash_token(refresh_token)).first()
        if rt and rt.revoked_at is None:
            rt.revoked_at = datetime.utcnow()
            db.commit()
    clear_refresh_cookie(response)
    return {"ok": True}
