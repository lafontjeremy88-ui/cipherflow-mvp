# app/api/file_routes.py

import json
import mimetypes
import os
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_db
from app.services.storage_service import download_file, delete_file as r2_delete
from app.database.database import get_db
from app.database.models import FileAnalysis, TenantDocumentLink, TenantFile, TenantFileStatus, User

router = APIRouter(tags=["Fichiers"])


# ── Schemas ────────────────────────────────────────────────────────────────────

class FileHistoryItem(BaseModel):
    id: int
    filename: str
    file_type: Optional[str] = None
    sender: Optional[str] = None
    extracted_date: Optional[str] = None
    amount: Optional[str] = None
    summary: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ── Helpers ────────────────────────────────────────────────────────────────────

def _compute_checklist_simple(doc_types: list) -> dict:
    from app.database.models import TenantDocType
    required = [TenantDocType.ID, TenantDocType.PAYSLIP, TenantDocType.TAX]
    required_set = set(required)
    received_set = {dt for dt in doc_types if dt in required_set}
    missing_set = required_set - received_set
    order = {TenantDocType.ID: 0, TenantDocType.PAYSLIP: 1, TenantDocType.TAX: 2}
    return {
        "required": [dt.value for dt in required],
        "received": [dt.value for dt in sorted(received_set, key=lambda d: order.get(d, 99))],
        "missing": [dt.value for dt in sorted(missing_set, key=lambda d: order.get(d, 99))],
    }


@router.get("/api/files/history", response_model=List[FileHistoryItem])
async def get_files_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_db),
):
    files = (
        db.query(FileAnalysis)
        .filter(FileAnalysis.agency_id == current_user.agency_id)
        .order_by(FileAnalysis.id.desc())
        .all()
    )
    return files


@router.get("/api/files/view/{file_id}")
def view_file(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_db),
):
    f = db.query(FileAnalysis).filter(
        FileAnalysis.id == file_id,
        FileAnalysis.agency_id == current_user.agency_id,
    ).first()
    if not f:
        raise HTTPException(404, "Fichier introuvable")

    try:
        raw_bytes = download_file(f.filename)
    except Exception:
        raise HTTPException(404, "Fichier introuvable dans le stockage")

    # Détection du vrai type MIME depuis le nom original (sans le préfixe agence_timestamp_)
    original_name = "_".join(f.filename.split("_")[2:]) if f.filename.count("_") >= 2 else f.filename
    mime_type, _ = mimetypes.guess_type(original_name)
    mime_type = mime_type or "application/octet-stream"

    return Response(
        content=raw_bytes,
        media_type=mime_type,
        headers={"Content-Disposition": f'inline; filename="{original_name}"'},
    )


@router.get("/api/files/download/{file_id}")
async def download_file(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_db),
):
    f = db.query(FileAnalysis).filter(
        FileAnalysis.id == file_id,
        FileAnalysis.agency_id == current_user.agency_id,
    ).first()
    if not f:
        raise HTTPException(404, "Fichier introuvable ou accès refusé")

    try:
        raw_bytes = download_file(f.filename)
    except Exception:
        raise HTTPException(404, "Fichier introuvable dans le stockage")

    original_name = "_".join(f.filename.split("_")[2:]) if f.filename.count("_") >= 2 else f.filename
    mime_type, _ = mimetypes.guess_type(original_name)
    mime_type = mime_type or "application/octet-stream"

    return Response(
        content=raw_bytes,
        media_type=mime_type,
        headers={"Content-Disposition": f'attachment; filename="{original_name}"'},
    )


@router.options("/api/files/{file_id}")
async def options_file(request: Request):
    origin = request.headers.get("origin", "")
    resp = Response(status_code=204)
    if origin:
        resp.headers["Access-Control-Allow-Origin"] = origin
    resp.headers["Access-Control-Allow-Credentials"] = "true"
    resp.headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,DELETE,OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "Authorization,Content-Type"
    return resp


@router.delete("/api/files/{file_id}")
async def delete_file(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_db),
):
    f = db.query(FileAnalysis).filter(
        FileAnalysis.id == file_id,
        FileAnalysis.agency_id == current_user.agency_id,
    ).first()
    if not f:
        raise HTTPException(404, "Introuvable")

    tenant_ids = [
        row[0] for row in
        db.query(TenantDocumentLink.tenant_file_id)
        .filter(TenantDocumentLink.file_analysis_id == f.id).all()
    ]
    db.query(TenantDocumentLink).filter(
        TenantDocumentLink.file_analysis_id == f.id
    ).delete(synchronize_session=False)

    for tid in tenant_ids:
        tf = db.query(TenantFile).filter(TenantFile.id == tid).first()
        if not tf:
            continue
        remaining = db.query(TenantDocumentLink).filter(TenantDocumentLink.tenant_file_id == tf.id).all()
        if not remaining:
            tf.checklist_json = None
            tf.status = TenantFileStatus.NEW
        else:
            checklist = _compute_checklist_simple([l.doc_type for l in remaining])
            tf.checklist_json = json.dumps(checklist)
            tf.status = TenantFileStatus.TO_VALIDATE if not checklist["missing"] else TenantFileStatus.INCOMPLETE

    try:
        r2_delete(f.filename)
    except Exception:
        pass  # fichier déjà absent de R2, on continue

    db.delete(f)
    db.commit()
    return {"status": "deleted"}