# app/api/settings_routes.py
"""
Routes paramètres agence, compte utilisateur et suppression RGPD.

FIX P0 : delete_my_account en mode purge supprime désormais les fichiers
         depuis Cloudflare R2 (plus os.remove sur disque — fuite RGPD corrigée).
"""

import json
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_db
from app.core.security_utils import clear_refresh_cookie
from app.database.database import get_db
from app.database.models import (
    Agency, AppSettings, EmailAnalysis, FileAnalysis,
    Invoice, RefreshToken, TenantDocumentLink, TenantEmailLink,
    TenantFile, User, UserRole,
)
from app.services.storage_service import delete_file as r2_delete

router = APIRouter(tags=["Settings"])
log = logging.getLogger(__name__)


# ── Schemas ────────────────────────────────────────────────────────────────────

class AccountMeResponse(BaseModel):
    email: str
    role: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    agency_name: Optional[str] = None
    preferred_language: Optional[str] = "fr"
    account_status: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AccountMeUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    agency_name: Optional[str] = None
    preferred_language: Optional[str] = None


class AgencySettingsUpdate(BaseModel):
    company_name: Optional[str] = None
    tone: Optional[str] = None
    signature: Optional[str] = None
    send_email: Optional[bool] = None
    retention_config_json: Optional[str] = None


# ── Compte utilisateur ─────────────────────────────────────────────────────────

@router.get("/account/me", response_model=AccountMeResponse)
async def get_me(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_db),
):
    agency = db.query(Agency).filter(Agency.id == current_user.agency_id).first()
    return AccountMeResponse(
        email=current_user.email,
        role=current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role),
        first_name=current_user.first_name,
        last_name=current_user.last_name,
        agency_name=agency.name if agency else None,
        preferred_language=getattr(current_user, "preferred_language", "fr"),
        account_status="active" if current_user.email_verified else "pending",
        created_at=current_user.created_at,
    )


@router.patch("/account/me", response_model=AccountMeResponse)
async def update_me(
    payload: AccountMeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_db),
):
    if payload.first_name is not None:
        current_user.first_name = payload.first_name.strip() or None
    if payload.last_name is not None:
        current_user.last_name = payload.last_name.strip() or None
    if payload.preferred_language is not None:
        current_user.preferred_language = payload.preferred_language.strip().lower()

    # Modification du nom de l'agence — réservée aux admins
    if payload.agency_name is not None:
        is_admin = current_user.role in (UserRole.AGENCY_ADMIN, UserRole.SUPER_ADMIN)
        if not is_admin:
            raise HTTPException(403, "Seul un admin peut modifier le nom de l'agence.")
        agency = db.query(Agency).filter(Agency.id == current_user.agency_id).first()
        if agency:
            agency.name = payload.agency_name.strip()

    db.commit()
    db.refresh(current_user)

    agency = db.query(Agency).filter(Agency.id == current_user.agency_id).first()
    return AccountMeResponse(
        email=current_user.email,
        role=current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role),
        first_name=current_user.first_name,
        last_name=current_user.last_name,
        agency_name=agency.name if agency else None,
        preferred_language=getattr(current_user, "preferred_language", "fr"),
        account_status="active" if current_user.email_verified else "pending",
        created_at=current_user.created_at,
    )


@router.delete("/account/me")
async def delete_my_account(
    mode: str = Query(default="soft"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_db),
):
    """
    Suppression de compte.

    - mode=soft  : désactivation + anonymisation
    - mode=purge : suppression complète des données RGPD

    FIX P0 : le mode purge supprime maintenant les fichiers depuis R2.
    """
    aid = current_user.agency_id

    if mode == "purge":
        # ── Fichiers R2 ────────────────────────────────────────────────────────
        files = db.query(FileAnalysis).filter(FileAnalysis.agency_id == aid).all()
        deleted_r2 = 0
        for f in files:
            if f.filename:
                try:
                    r2_delete(f.filename)
                    deleted_r2 += 1
                except Exception as e:
                    log.warning(f"[delete_account] R2 delete échoué ({f.filename}) : {e}")
        log.info(f"[delete_account] agency={aid} : {deleted_r2} fichiers supprimés de R2")

        # ── Cascade DB ─────────────────────────────────────────────────────────
        db.query(TenantDocumentLink).filter(
            TenantDocumentLink.tenant_file_id.in_(
                db.query(TenantFile.id).filter(TenantFile.agency_id == aid)
            )
        ).delete(synchronize_session=False)

        db.query(TenantEmailLink).filter(
            TenantEmailLink.tenant_file_id.in_(
                db.query(TenantFile.id).filter(TenantFile.agency_id == aid)
            )
        ).delete(synchronize_session=False)

        db.query(TenantFile).filter(TenantFile.agency_id == aid).delete(synchronize_session=False)
        db.query(FileAnalysis).filter(FileAnalysis.agency_id == aid).delete(synchronize_session=False)
        db.query(EmailAnalysis).filter(EmailAnalysis.agency_id == aid).delete(synchronize_session=False)
        db.query(Invoice).filter(Invoice.agency_id == aid).delete(synchronize_session=False)
        db.query(AppSettings).filter(AppSettings.agency_id == aid).delete(synchronize_session=False)
        db.query(RefreshToken).filter(RefreshToken.user_id == current_user.id).delete(synchronize_session=False)
        db.query(User).filter(User.agency_id == aid).delete(synchronize_session=False)
        db.query(Agency).filter(Agency.id == aid).delete(synchronize_session=False)
        db.commit()

        return {"status": "purged", "r2_files_deleted": deleted_r2}

    else:
        # soft : désactivation + anonymisation du compte
        current_user.email = f"deleted_{current_user.id}@cipherflow.invalid"
        current_user.hashed_password = ""
        current_user.first_name = None
        current_user.last_name = None
        current_user.email_verified = False
        db.query(RefreshToken).filter(RefreshToken.user_id == current_user.id).update(
            {"revoked_at": datetime.utcnow()}
        )
        db.commit()
        return {"status": "soft_deleted"}


# ── Paramètres agence ──────────────────────────────────────────────────────────

@router.get("/settings")
async def get_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_db),
):
    s = db.query(AppSettings).filter(AppSettings.agency_id == current_user.agency_id).first()
    if not s:
        raise HTTPException(404, "Paramètres agence introuvables.")

    retention = {}
    if s.retention_config_json:
        try:
            retention = (
                json.loads(s.retention_config_json)
                if isinstance(s.retention_config_json, str)
                else s.retention_config_json
            )
        except Exception:
            retention = {}

    return {
        "company_name": s.company_name,
        "tone": s.tone,
        "signature": s.signature,
        "send_email": s.send_email,
        "retention_config": retention,
    }


@router.patch("/settings")
async def update_settings(
    payload: AgencySettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_db),
):
    is_admin = current_user.role in (UserRole.AGENCY_ADMIN, UserRole.SUPER_ADMIN)
    if not is_admin:
        raise HTTPException(403, "Réservé aux admins.")

    s = db.query(AppSettings).filter(AppSettings.agency_id == current_user.agency_id).first()
    if not s:
        raise HTTPException(404, "Paramètres agence introuvables.")

    if payload.company_name is not None:
        s.company_name = payload.company_name.strip()
    if payload.tone is not None:
        s.tone = payload.tone.strip()
    if payload.signature is not None:
        s.signature = payload.signature.strip()
    if payload.send_email is not None:
        s.send_email = payload.send_email
    if payload.retention_config_json is not None:
        # Validation JSON avant stockage
        try:
            parsed = json.loads(payload.retention_config_json)
            s.retention_config_json = json.dumps(parsed)
        except Exception:
            raise HTTPException(400, "retention_config_json invalide.")

    db.commit()
    return {"status": "updated"}
