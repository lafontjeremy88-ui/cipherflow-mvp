# app/api/file_routes.py
"""
Routes fichiers : view, download, delete.
"""

import mimetypes
import os
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_db
from app.core.security_utils import decrypt_bytes
from app.database.database import get_db
from app.database.models import FileAnalysis, TenantDocumentLink, TenantFile, TenantFileStatus, User

router = APIRouter(tags=["Fichiers"])


def _compute_checklist_simple(doc_types: list) -> dict:
    """Version simplifiée pour le recalcul après suppression."""
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

    file_path = Path("uploads") / f.filename
    if not file_path.exists():
        raise HTTPException(404, "Fichier manquant sur le disque")

    try:
        decrypted = decrypt_bytes(file_path.read_bytes())
    except Exception:
        raise HTTPException(500, "Erreur lecture fichier")

    mime_type, _ = mimetypes.guess_type(f.filename)
    return Response(
        content=decrypted,
        media_type=mime_type or "application/octet-stream",
        headers={"Content-Disposition": f'inline; filename="{f.filename}"'},
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

    path = Path("uploads") / f.filename
    if not path.exists():
        raise HTTPException(404, "Fichier introuvable")

    decrypted = decrypt_bytes(path.read_bytes())
    return Response(
        content=decrypted,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{f.filename}"'},
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

    # Dossiers impactés
    tenant_ids = [
        row[0] for row in
        db.query(TenantDocumentLink.tenant_file_id)
        .filter(TenantDocumentLink.file_analysis_id == f.id).all()
    ]
    db.query(TenantDocumentLink).filter(
        TenantDocumentLink.file_analysis_id == f.id
    ).delete(synchronize_session=False)

    # Recalcul checklist pour chaque dossier impacté
    for tid in tenant_ids:
        tf = db.query(TenantFile).filter(TenantFile.id == tid).first()
        if not tf:
            continue
        remaining = db.query(TenantDocumentLink).filter(TenantDocumentLink.tenant_file_id == tf.id).all()
        if not remaining:
            tf.checklist_json = None
            tf.status = TenantFileStatus.NEW
        else:
            import json
            checklist = _compute_checklist_simple([l.doc_type for l in remaining])
            tf.checklist_json = json.dumps(checklist)
            tf.status = TenantFileStatus.TO_VALIDATE if not checklist["missing"] else TenantFileStatus.INCOMPLETE

    path = os.path.join("uploads", f.filename)
    if os.path.exists(path):
        try:
            os.remove(path)
        except OSError:
            pass

    db.delete(f)
    db.commit()
    return {"status": "deleted"}
