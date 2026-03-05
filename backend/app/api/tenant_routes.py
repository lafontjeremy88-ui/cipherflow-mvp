# app/api/tenant_routes.py
"""
Routes dossiers locataires : CRUD + upload document + détachement.

FIX P0: upload_document_for_tenant écrit désormais dans Cloudflare R2
        au lieu du disque local (cohérence avec le pipeline email).
"""

import hashlib
import io
import json
import logging
import time
import zipfile
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_db
from app.database.database import get_db
from app.database.models import (
    DocQuality, EmailAnalysis, FileAnalysis, TenantDocumentLink,
    TenantEmailLink, TenantFile, TenantFileStatus, User,
)
from app.services.storage_service import download_file, upload_file as r2_upload

log = logging.getLogger(__name__)
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


@router.post("/from-email/{email_id}", response_model=TenantFileDetail)
async def create_tenant_file_from_email(
    email_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_db),
):
    """
    Crée ou retrouve le dossier locataire associé à un email analysé.
    - Si un dossier ouvert existe déjà pour cet expéditeur → le réutilise.
    - Sinon → crée un nouveau dossier.
    - Crée le lien email ↔ dossier s'il n'existe pas encore.
    """
    # 1. Vérifie que l'email appartient à l'agence courante
    email = db.query(EmailAnalysis).filter(
        EmailAnalysis.id == email_id,
        EmailAnalysis.agency_id == current_user.agency_id,
    ).first()
    if not email:
        raise HTTPException(404, "Email introuvable")

    sender = (email.sender_email or "").strip().lower() or None

    # 2. Cherche un dossier ouvert existant pour cet expéditeur
    tf = None
    if sender:
        tf = db.query(TenantFile).filter(
            TenantFile.agency_id == current_user.agency_id,
            TenantFile.candidate_email == sender,
            TenantFile.is_closed == False,
        ).first()

    if not tf:
        tf = TenantFile(
            agency_id=current_user.agency_id,
            candidate_email=sender,
            status=TenantFileStatus.NEW,
        )
        db.add(tf)
        db.commit()
        db.refresh(tf)

    # 3. Crée le lien email ↔ dossier si inexistant
    existing_link = db.query(TenantEmailLink).filter(
        TenantEmailLink.tenant_file_id == tf.id,
        TenantEmailLink.email_analysis_id == email_id,
    ).first()
    if not existing_link:
        db.add(TenantEmailLink(tenant_file_id=tf.id, email_analysis_id=email_id))
        db.commit()
        db.refresh(tf)

    email_ids = [l.email_analysis_id for l in tf.email_links]
    file_ids  = [l.file_analysis_id  for l in tf.document_links]

    return TenantFileDetail(
        id=tf.id, status=_tf_status(tf),
        candidate_email=tf.candidate_email, candidate_name=tf.candidate_name,
        checklist_json=tf.checklist_json, risk_level=tf.risk_level,
        created_at=tf.created_at, updated_at=tf.updated_at,
        email_ids=email_ids, file_ids=file_ids,
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


def _generate_summary_pdf(tf, emails_data: list, documents: list) -> bytes:
    """Génère un PDF de synthèse du dossier locataire."""
    from fpdf import FPDF

    pdf = FPDF()
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=15)

    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, "Dossier locataire - Resume", ln=True)
    pdf.set_font("Helvetica", size=11)
    pdf.ln(4)

    candidate = tf.candidate_name or tf.candidate_email or f"#{tf.id}"
    status_val = tf.status.value if hasattr(tf.status, "value") else str(tf.status)

    for label, value in [
        ("Candidat", candidate),
        ("Email", tf.candidate_email or "-"),
        ("Statut", status_val),
        ("Exporte le", datetime.utcnow().strftime("%d/%m/%Y %H:%M") + " UTC"),
    ]:
        pdf.cell(40, 8, f"{label} :", ln=False)
        pdf.cell(0, 8, str(value), ln=True)

    pdf.ln(6)
    pdf.set_font("Helvetica", "B", 13)
    pdf.cell(0, 8, f"Emails ({len(emails_data)})", ln=True)
    pdf.set_font("Helvetica", size=10)
    for e in emails_data:
        subj = (e.get("subject") or "(sans sujet)")[:80]
        sender = e.get("sender_email") or ""
        pdf.cell(0, 6, f"  - {subj} ({sender})", ln=True)
        if e.get("summary"):
            truncated = (e["summary"] or "")[:200]
            pdf.set_font("Helvetica", "I", 9)
            pdf.multi_cell(0, 5, f"    {truncated}")
            pdf.set_font("Helvetica", size=10)

    pdf.ln(4)
    pdf.set_font("Helvetica", "B", 13)
    pdf.cell(0, 8, f"Documents ({len(documents)})", ln=True)
    pdf.set_font("Helvetica", size=10)
    for d in documents:
        doc_type = d.file_type or "Document"
        pdf.cell(0, 6, f"  - {doc_type} — {d.filename}", ln=True)
        if d.summary:
            truncated = (d.summary or "")[:200]
            pdf.set_font("Helvetica", "I", 9)
            pdf.multi_cell(0, 5, f"    {truncated}")
            pdf.set_font("Helvetica", size=10)

    return pdf.output()


@router.get("/{tenant_id}/export")
async def export_tenant_file(
    tenant_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_db),
):
    """Export complet du dossier locataire en ZIP (emails.json + documents/ + summary.pdf)."""
    aid = current_user.agency_id
    tf = db.query(TenantFile).filter(
        TenantFile.id == tenant_id,
        TenantFile.agency_id == aid,
    ).first()
    if not tf:
        raise HTTPException(404, "Dossier introuvable")

    # 1. Emails liés
    emails_data = []
    for link in tf.email_links:
        ea = db.query(EmailAnalysis).filter(EmailAnalysis.id == link.email_analysis_id).first()
        if ea:
            emails_data.append({
                "id": ea.id,
                "sender_email": ea.sender_email,
                "subject": ea.subject,
                "category": ea.category,
                "urgency": ea.urgency,
                "summary": ea.summary,
                "received_at": ea.created_at.isoformat() if ea.created_at else None,
            })

    # 2. Documents liés
    file_analyses = []
    for link in tf.document_links:
        fa = db.query(FileAnalysis).filter(FileAnalysis.id == link.file_analysis_id).first()
        if fa:
            file_analyses.append(fa)

    # 3. Construction ZIP en mémoire
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("emails.json", json.dumps(emails_data, ensure_ascii=False, indent=2))

        for fa in file_analyses:
            try:
                file_bytes = download_file(fa.filename)
                ext = Path(fa.filename).suffix or ""
                safe_name = f"{fa.file_type or 'document'}_{fa.id}{ext}"
                zf.writestr(f"documents/{safe_name}", file_bytes)
            except Exception as e:
                log.warning(f"[export] Impossible de télécharger {fa.filename}: {e}")

        try:
            summary_pdf = _generate_summary_pdf(tf, emails_data, file_analyses)
            zf.writestr("summary.pdf", summary_pdf)
        except Exception as e:
            log.warning(f"[export] Erreur génération PDF summary: {e}")

    buf.seek(0)

    candidate = tf.candidate_name or tf.candidate_email or f"dossier_{tenant_id}"
    safe_candidate = "".join(c if c.isalnum() or c in "-_" else "_" for c in candidate)
    filename = f"dossier_{safe_candidate}.zip"

    log.info(f"[export] Dossier #{tenant_id} exporté par user={current_user.id} agency={aid}")

    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


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
