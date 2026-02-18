# app/api/settings_routes.py
"""
Routes paramètres agence + compte utilisateur.
"""

import base64
import io
import json
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from PIL import Image
from pydantic import BaseModel, EmailStr
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_db
from app.database.database import get_db
from app.database.models import (
    Agency, AppSettings, EmailAnalysis, FileAnalysis,
    Invoice, RefreshToken, TenantDocumentLink, TenantEmailLink,
    TenantFile, User,
)

router = APIRouter(tags=["Settings"])


# ── Schemas ────────────────────────────────────────────────────────────────────

class SettingsRequest(BaseModel):
    company_name: str
    agent_name: str
    tone: str
    signature: str
    logo: Optional[str] = None

class LogoUploadRequest(BaseModel):
    logo_base64: str

class AccountMeResponse(BaseModel):
    email: EmailStr
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    agency_name: Optional[str] = None
    role: Optional[str] = None
    created_at: Optional[datetime] = None
    account_status: Optional[str] = None
    preferred_language: str = "fr"
    ui_prefs: Optional[dict] = None

class AccountUpdateRequest(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    preferred_language: Optional[str] = None
    ui_prefs: Optional[dict] = None
    agency_name: Optional[str] = None


# ── Routes settings ────────────────────────────────────────────────────────────

@router.get("/settings")
async def get_settings_route(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_db),
):
    s = db.query(AppSettings).filter(AppSettings.agency_id == current_user.agency_id).first()
    if not s:
        s = AppSettings(agency_id=current_user.agency_id, company_name="Mon Agence")
        db.add(s)
        db.commit()
        db.refresh(s)
    return s


@router.post("/settings")
async def update_settings(
    req: SettingsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_db),
):
    s = db.query(AppSettings).filter(AppSettings.agency_id == current_user.agency_id).first()
    if not s:
        s = AppSettings(agency_id=current_user.agency_id)
        db.add(s)
    s.company_name = req.company_name
    s.agent_name = req.agent_name
    s.tone = req.tone
    s.signature = req.signature
    if req.logo:
        s.logo = req.logo
    db.commit()
    return {"status": "updated"}


@router.post("/settings/upload-logo")
async def upload_logo(
    req: LogoUploadRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_db),
):
    try:
        img_str = req.logo_base64
        encoded = img_str.split(",", 1)[1] if "," in img_str else img_str
        img = Image.open(io.BytesIO(base64.b64decode(encoded)))
        if img.width > 800:
            ratio = 800 / float(img.width)
            img = img.resize((800, int(float(img.height) * ratio)), Image.Resampling.LANCZOS)
        buffer = io.BytesIO()
        fmt = img.format or "PNG"
        img.save(buffer, format=fmt, optimize=True)
        prefix = "jpeg" if fmt.lower() in ["jpg", "jpeg"] else "png"
        final = f"data:image/{prefix};base64,{base64.b64encode(buffer.getvalue()).decode()}"

        s = db.query(AppSettings).filter(AppSettings.agency_id == current_user.agency_id).first()
        if not s:
            s = AppSettings(agency_id=current_user.agency_id)
            db.add(s)
        s.logo = final
        db.commit()
        return {"status": "logo_updated"}
    except Exception as e:
        raise HTTPException(500, detail=f"Erreur image: {str(e)}")


# ── Routes compte ──────────────────────────────────────────────────────────────

@router.get("/account/me", response_model=AccountMeResponse)
async def get_my_account(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_db),
):
    agency_name = None
    if current_user.agency_id:
        ag = db.query(Agency).filter(Agency.id == current_user.agency_id).first()
        agency_name = ag.name if ag else None

    ui_prefs = None
    try:
        if getattr(current_user, "ui_prefs_json", None):
            ui_prefs = json.loads(current_user.ui_prefs_json)
    except Exception:
        pass

    return AccountMeResponse(
        email=current_user.email,
        first_name=getattr(current_user, "first_name", None),
        last_name=getattr(current_user, "last_name", None),
        agency_name=agency_name,
        role=str(current_user.role) if current_user.role else None,
        created_at=getattr(current_user, "created_at", None),
        account_status=getattr(current_user, "account_status", None),
        preferred_language=getattr(current_user, "preferred_language", "fr") or "fr",
        ui_prefs=ui_prefs,
    )


@router.patch("/account/me", response_model=AccountMeResponse)
async def update_my_account(
    payload: AccountUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_db),
):
    if payload.first_name is not None:
        current_user.first_name = payload.first_name.strip() or None
    if payload.last_name is not None:
        current_user.last_name = payload.last_name.strip() or None
    if payload.preferred_language is not None:
        lang = payload.preferred_language.lower().strip()
        if lang in ("fr", "en"):
            current_user.preferred_language = lang
    if payload.ui_prefs is not None:
        current_user.ui_prefs_json = json.dumps(payload.ui_prefs)
    if payload.agency_name is not None:
        role = (str(current_user.role) or "").lower()
        if ("agency_admin" in role or "super_admin" in role) and current_user.agency_id:
            new_name = payload.agency_name.strip()
            if new_name:
                ag = db.query(Agency).filter(Agency.id == current_user.agency_id).first()
                if ag:
                    ag.name = new_name
    db.commit()
    return await get_my_account(db=db, current_user=current_user)


@router.delete("/account/me")
async def delete_my_account(
    mode: str = Query(default="purge", pattern="^(account|purge)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_db),
):
    import os
    agency_id = current_user.agency_id

    if mode == "account" or not agency_id:
        db.query(RefreshToken).filter(RefreshToken.user_id == current_user.id).delete(synchronize_session=False)
        db.delete(current_user)
        db.commit()
        return {"success": True, "deleted": "user"}

    users_count = db.query(func.count(User.id)).filter(User.agency_id == agency_id).scalar() or 0
    if users_count > 1:
        db.query(RefreshToken).filter(RefreshToken.user_id == current_user.id).delete(synchronize_session=False)
        db.delete(current_user)
        db.commit()
        return {"success": True, "deleted": "user", "note": "agency_not_purged"}

    # Purge totale
    for (fname,) in db.query(FileAnalysis.filename).filter(FileAnalysis.agency_id == agency_id).all():
        path = os.path.join("uploads", fname)
        if os.path.exists(path):
            try:
                os.remove(path)
            except OSError:
                pass

    tids = db.query(TenantFile.id).filter(TenantFile.agency_id == agency_id)
    db.query(TenantEmailLink).filter(TenantEmailLink.tenant_file_id.in_(tids)).delete(synchronize_session=False)
    db.query(TenantDocumentLink).filter(TenantDocumentLink.tenant_file_id.in_(tids)).delete(synchronize_session=False)
    for model in [AppSettings, EmailAnalysis, FileAnalysis, Invoice, TenantFile]:
        db.query(model).filter(model.agency_id == agency_id).delete(synchronize_session=False)
    db.query(RefreshToken).filter(RefreshToken.user_id == current_user.id).delete(synchronize_session=False)
    db.delete(current_user)
    ag = db.query(Agency).filter(Agency.id == agency_id).first()
    if ag:
        db.delete(ag)
    db.commit()
    return {"success": True, "deleted": "user+agency"}
