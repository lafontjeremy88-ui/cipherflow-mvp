# app/api/tenant_routes.py
"""
Routes dossiers locataires : CRUD + upload document + détachement.

FIX P0: upload_document_for_tenant écrit désormais dans Cloudflare R2
        au lieu du disque local (cohérence avec le pipeline email).
"""

import hashlib
import json
import time
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_db
from app.database.database import get_db
from app.database.models import (
    DocQuality, FileAnalysis, TenantDocumentLink,
    TenantEmailLink, TenantFile, TenantFileStatus, User,
)
from app.services.storage_service import upload_file as r2_upload
from app.services.tenant_service import (
    attach_files_to_tenant_file,
    recompute_checklist,
)

router = APIRouter(prefix="/tenant-files", tags=["Dossiers locataires"])

DOC_LABELS = {
    "id": "Pièce d'identité",
    "payslip": "Bulletin de paie",
    "tax": "Avis d'imposition",
}


# ── Schemas ────────────────────────────────────────────────────────────────────

class TenantFileListItem(BaseModel):
    id: int
    status: str
    candidate_email: Optional[str] = None
    candidate_name: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class TenantFileCreate(BaseModel):
    candidate_email: Optional[EmailStr] = None
    candidate_name: Optional[str] = None


class TenantFileUpdate(BaseModel):
    candidate_email: Optional[str] = None
    candidate_name: Optional[str] = None


class TenantFileDetail(BaseModel):
    id: int
    status: str
    candidate_email: Optional[str] = None
    candidate_name: Optional[str] = None
    checklist_json: Optional[str] = None
    risk_level: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    email_ids: List[int] = []
    file_ids: List[int] = []

    class Config:
        from_attributes = True


def _tf_status(tf: TenantFile) -> str:
    return tf.status.value if hasattr(tf.status, "value") else str(tf.status)


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.post("", response_model=TenantFileDetail)
async def create_tenant_file(
    payload: TenantFileCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_db),
):
    tf = TenantFile(
        agency_id=current_user.agency_id,
        candidate_email=(payload.candidate_email or "").strip() or None,
        candidate_name=(payload.candidate_name or "").strip() or None,
        status=TenantFileStatus.NEW,
    )
    db.add(tf)
    db.commit()
    db.refresh(tf)
    return TenantFileDetail(
        id=tf.id, status=_tf_status(tf),
        candidate_email=tf.candidate_email, candidate_name=tf.candidate_name,
        checklist_json=tf.checklist_json, risk_level=tf.risk_level,
        created_at=tf.created_at, updated_at=tf.updated_at,
        email_ids=[], file_ids=[],
    )


@router.get("", response_model=List[TenantFileListItem])
async def list_tenant_files(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_db),
):
    return (
        db.query(TenantFile)
        .filter(TenantFile.agency_id == current_user.agency_id)
        .order_by(TenantFile.id.desc())
        .all()
    )


@router.get("/{tenant_id}", response_model=TenantFileDetail)
async def get_tenant_file(
    tenant_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_db),
):
    tf = db.query(TenantFile).filter(
        TenantFile.id == tenant_id,
        TenantFile.agency_id == current_user.agency_id,
    ).first()
    if not tf:
        raise HTTPException(404, "Dossier introuvable")

    email_ids = [l.email_analysis_id for l in tf.email_links]
    file_ids = [l.file_analysis_id for l in tf.document_links]

    # Auto-fix dossiers incohérents
    if len(file_ids) == 0 and tf.checklist_json:
        tf.checklist_json = None
        tf.status = TenantFileStatus.NEW
        db.commit()

    return TenantFileDetail(
        id=tf.id, status=_tf_status(tf),
        candidate_email=tf.candidate_email, candidate_name=tf.candidate_name,
        checklist_json=tf.checklist_json, risk_level=tf.risk_level,
        created_at=tf.created_at, updated_at=tf.updated_at,
        email_ids=email_ids, file_ids=file_ids,
    )


@router.put("/{tenant_id}", response_model=TenantFileDetail)
async def update_tenant_file(
    tenant_id: int,
    payload: TenantFileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_db),
):
    tf = db.query(TenantFile).filter(
        TenantFile.id == tenant_id,
        TenantFile.agency_id == current_user.agency_id,
    ).first()
    if not tf:
        raise HTTPException(404, "Dossier introuvable")

    if payload.candidate_email is not None:
        tf.candidate_email = (payload.candidate_email or "").strip() or None
    if payload.candidate_name is not None:
        tf.candidate_name = (payload.candidate_name or "").strip() or None
    tf.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(tf)

    return TenantFileDetail(
        id=tf.id, status=_tf_status(tf),
        candidate_email=tf.candidate_email, candidate_name=tf.candidate_name,
        checklist_json=tf.checklist_json, risk_level=tf.risk_level,
        created_at=tf.created_at, updated_at=tf.updated_at,
        email_ids=[l.email_analysis_id for l in tf.email_links],
        file_ids=[l.file_analysis_id for l in tf.document_links],
    )


@router.delete("/{tenant_id}")
async def delete_tenant_file(
    tenant_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_db),
):
    tf = db.query(TenantFile).filter(
        TenantFile.id == tenant_id,
        TenantFile.agency_id == current_user.agency_id,
    ).first()
    if not tf:
        raise HTTPException(404, "Dossier introuvable")
    db.query(TenantEmailLink).filter(TenantEmailLink.tenant_file_id == tenant_id).delete(synchronize_session=False)
    db.query(TenantDocumentLink).filter(TenantDocumentLink.tenant_file_id == tenant_id).delete(synchronize_session=False)
    db.delete(tf)
    db.commit()
    return {"status": "deleted"}


@router.post("/{tenant_id}/upload-document")
async def upload_document_for_tenant(
    tenant_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_db),
):
    """
    Upload un document pour un dossier locataire.
    FIX P0 : stockage dans Cloudflare R2 (plus de disque local).
    """
    aid = current_user.agency_id
    tf = db.query(TenantFile).filter(
        TenantFile.id == tenant_id, TenantFile.agency_id == aid,
    ).first()
    if not tf:
        raise HTTPException(404, "Dossier locataire introuvable")

    file_bytes = await file.read()
    file_hash = hashlib.sha256(file_bytes).hexdigest()

    # Anti-doublon par hash
    existing = db.query(FileAnalysis).filter(
        FileAnalysis.agency_id == aid,
        FileAnalysis.file_hash == file_hash,
    ).first()

    if existing:
        attach_files_to_tenant_file(db=db, tenant_file=tf, file_ids=[existing.id])
        db.refresh(tf)
        recompute_checklist(db, tf)
        checklist = json.loads(tf.checklist_json) if tf.checklist_json else {}
        missing = [DOC_LABELS.get(c, c) for c in checklist.get("missing", [])]
        return {
            "status": "uploaded",
            "file_id": existing.id,
            "tenant_id": tf.id,
            "missing_docs": missing,
            "from_cache": True,
        }

    # Analyse IA
    from app.services.document_service import analyze_document
    doc_result = await analyze_document(
        file_bytes=file_bytes,
        filename=file.filename,
        content_type=file.content_type or "application/pdf",
    )

    # ── FIX P0 : Upload vers R2 (plus de disque local) ─────────────────────
    safe_name = f"{aid}_{int(time.time())}_{Path(file.filename).name}"
    content_type = file.content_type or "application/octet-stream"
    r2_upload(file_bytes, safe_name, content_type)

    new_file = FileAnalysis(
        filename=safe_name,
        file_type=doc_result.doc_type,
        sender=tf.candidate_email or "",
        extracted_date=doc_result.extracted_date,
        amount=doc_result.amount,
        summary=doc_result.summary,
        agency_id=aid,
        file_hash=file_hash,
    )
    db.add(new_file)
    db.commit()
    db.refresh(new_file)

    attach_files_to_tenant_file(db=db, tenant_file=tf, file_ids=[new_file.id])
    db.refresh(tf)
    recompute_checklist(db, tf)

    checklist = json.loads(tf.checklist_json) if tf.checklist_json else {}
    missing = [DOC_LABELS.get(c, c) for c in checklist.get("missing", [])]

    return {
        "status": "uploaded",
        "file_id": new_file.id,
        "tenant_id": tf.id,
        "missing_docs": missing,
        "from_cache": False,
    }


@router.post("/{tenant_id}/attach-document/{file_id}")
async def attach_document_to_tenant(
    tenant_id: int,
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_db),
):
    aid = current_user.agency_id

    tf = db.query(TenantFile).filter(
        TenantFile.id == tenant_id,
        TenantFile.agency_id == aid,
    ).first()
    if not tf:
        raise HTTPException(404, "Dossier introuvable")

    fa = db.query(FileAnalysis).filter(
        FileAnalysis.id == file_id,
        FileAnalysis.agency_id == aid,
    ).first()
    if not fa:
        raise HTTPException(404, "Document introuvable")

    # Vérifie si le lien existe déjà
    existing = db.query(TenantDocumentLink).filter(
        TenantDocumentLink.tenant_file_id == tf.id,
        TenantDocumentLink.file_analysis_id == fa.id,
    ).first()
    if existing:
        return {"status": "already_linked", "tenant_id": tf.id, "file_id": fa.id}

    attach_files_to_tenant_file(db=db, tenant_file=tf, file_ids=[fa.id])
    db.refresh(tf)
    recompute_checklist(db, tf)

    checklist = json.loads(tf.checklist_json) if tf.checklist_json else None
    return {
        "status": "linked",
        "tenant_id": tf.id,
        "file_id": fa.id,
        "new_status": _tf_status(tf),
        "checklist": checklist,
    }

@router.delete("/{tenant_id}/documents/{file_id}")
async def detach_document_from_tenant(
    tenant_id: int,
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_db),
):
    aid = current_user.agency_id
    tf = db.query(TenantFile).filter(TenantFile.id == tenant_id, TenantFile.agency_id == aid).first()
    if not tf:
        raise HTTPException(404, "Dossier introuvable")

    fa = db.query(FileAnalysis).filter(FileAnalysis.id == file_id, FileAnalysis.agency_id == aid).first()
    if not fa:
        raise HTTPException(404, "Document introuvable")

    link = db.query(TenantDocumentLink).filter(
        TenantDocumentLink.tenant_file_id == tf.id,
        TenantDocumentLink.file_analysis_id == fa.id,
    ).first()
    if not link:
        raise HTTPException(404, "Lien document/dossier introuvable")

    db.delete(link)
    db.commit()
    db.refresh(tf)
    recompute_checklist(db, tf)

    checklist = json.loads(tf.checklist_json) if tf.checklist_json else None
    return {
        "status": "unlinked",
        "tenant_id": tf.id,
        "file_id": fa.id,
        "new_status": _tf_status(tf),
        "checklist": checklist,
    }
