# app/api/file_routes.py

import json
import mimetypes
import os
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_db
from app.services.storage_service import download_file as r2_download, delete_file as r2_delete
from app.database.database import get_db
from app.database.models import FileAnalysis, TenantDocumentLink, TenantFile, TenantFileStatus, TenantDocType, User

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


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.get("/api/files/history", response_model=List[FileHistoryItem])
async def get_files_history(
    exclude_other: bool = Query(
        default=True,
        description="Si true (défaut), masque les documents non reconnus (type OTHER)"
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_db),
):
    """
    Retourne l'historique des documents analysés.
    Par défaut, les documents de type OTHER (non reconnus, formats non supportés)
    sont masqués car ils n'apportent pas de valeur dans l'interface.
    Passer exclude_other=false pour les afficher (debug).
    """
    query = db.query(FileAnalysis).filter(
        FileAnalysis.agency_id == current_user.agency_id
    )

    if exclude_other:
        query = query.filter(FileAnalysis.file_type != TenantDocType.OTHER.value)

    files = query.order_by(FileAnalysis.id.desc()).all()
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
        raw_bytes = r2_download(f.filename)
    except Exception:
        raise HTTPException(404, "Fichier introuvable dans le stockage")

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
        raw_bytes = r2_download(f.filename)
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

    # Récupère les dossiers liés avant suppression
    tenant_ids = [
        row[0] for row in
        db.query(TenantDocumentLink.tenant_file_id)
        .filter(TenantDocumentLink.file_analysis_id == f.id).all()
    ]

    # Supprime le lien document ↔ dossier
    db.query(TenantDocumentLink).filter(
        TenantDocumentLink.file_analysis_id == f.id
    ).delete(synchronize_session=False)

    # Recalcule la checklist de chaque dossier affecté
    # en utilisant recompute_checklist (supporte la nouvelle checklist à 5 types)
    from app.services.tenant_service import recompute_checklist
    for tid in tenant_ids:
        tf = db.query(TenantFile).filter(TenantFile.id == tid).first()
        if not tf:
            continue
        remaining = db.query(TenantDocumentLink).filter(
            TenantDocumentLink.tenant_file_id == tf.id
        ).all()
        if not remaining:
            tf.checklist_json = None
            tf.status = TenantFileStatus.NEW
            db.commit()
        else:
            recompute_checklist(db, tf)

    # Supprime le fichier de R2
    try:
        r2_delete(f.filename)
    except Exception:
        pass  # fichier déjà absent de R2, on continue

    db.delete(f)
    db.commit()
    return {"status": "deleted"}