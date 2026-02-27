# app/api/email_routes.py

import base64
import hashlib
import json
import logging
import time
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_db
from app.core.security_utils import send_email_via_resend
from app.database.database import get_db
from app.database.models import (
    AppSettings, EmailAnalysis, FileAnalysis,
    TenantEmailLink, User,
)

router = APIRouter(tags=["Emails"])
log = logging.getLogger(__name__)


# ── Schemas ────────────────────────────────────────────────────────────────────

class EmailHistoryItem(BaseModel):
    id: int
    created_at: Optional[datetime] = None
    sender_email: str
    subject: str
    summary: str
    category: str
    urgency: str
    is_devis: bool
    raw_email_text: str
    suggested_response_text: Optional[str] = None
    reply_sent: bool = False
    reply_sent_at: Optional[datetime] = None
    tenant_file_id: Optional[int] = None

    class Config:
        from_attributes = True


class EmailDetailResponse(BaseModel):
    id: int
    created_at: Optional[datetime] = None
    sender_email: str
    subject: str
    raw_email_text: str
    summary: str
    category: str
    urgency: str
    is_devis: bool
    suggested_response_text: Optional[str] = None
    reply_sent: bool = False
    reply_sent_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SendEmailRequest(BaseModel):
    to_email: str
    subject: str
    body: str
    email_id: Optional[int] = None


class ProcessEmailRequest(BaseModel):
    from_email: str
    to_email: str = ""
    subject: str
    content: str
    send_email: bool = False
    attachments: list = []


# ── Dashboard stats ────────────────────────────────────────────────────────────

@router.get("/dashboard/stats")
async def get_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_db),
):
    aid = current_user.agency_id
    total = db.query(EmailAnalysis).filter(EmailAnalysis.agency_id == aid).count()
    high = db.query(EmailAnalysis).filter(
        EmailAnalysis.agency_id == aid,
        (func.lower(EmailAnalysis.urgency).contains("haut")) |
        (func.lower(EmailAnalysis.urgency).contains("urg")),
    ).count()

    from app.database.models import TenantFile
    tenant_count = db.query(TenantFile).filter(TenantFile.agency_id == aid).count()

    cat_stats = (
        db.query(EmailAnalysis.category, func.count(EmailAnalysis.id))
        .filter(EmailAnalysis.agency_id == aid)
        .group_by(EmailAnalysis.category)
        .all()
    )
    recents = (
        db.query(EmailAnalysis)
        .filter(EmailAnalysis.agency_id == aid)
        .order_by(EmailAnalysis.id.desc())
        .limit(5).all()
    )
    return {
        "kpis": {
            "total_emails": total,
            "high_urgency": high,
            "tenant_files": tenant_count,
        },
        "charts": {"distribution": [{"name": c[0], "value": c[1]} for c in cat_stats]},
        "recents": [
            {
                "id": r.id, "subject": r.subject, "category": r.category,
                "urgency": r.urgency,
                "date": r.created_at.strftime("%d/%m %H:%M") if r.created_at else "",
            }
            for r in recents
        ],
    }


# ── Historique ─────────────────────────────────────────────────────────────────

@router.get("/email/history", response_model=List[EmailHistoryItem])
async def get_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_db),
):
    emails = (
        db.query(EmailAnalysis)
        .filter(EmailAnalysis.agency_id == current_user.agency_id)
        .order_by(EmailAnalysis.id.desc())
        .all()
    )
    if not emails:
        return []

    email_ids = [e.id for e in emails]
    links = db.query(TenantEmailLink).filter(
        TenantEmailLink.email_analysis_id.in_(email_ids)
    ).all()
    email_to_tenant = {}
    for link in links:
        if link.email_analysis_id not in email_to_tenant:
            email_to_tenant[link.email_analysis_id] = link.tenant_file_id

    for e in emails:
        setattr(e, "tenant_file_id", email_to_tenant.get(e.id))

    return emails


@router.get("/email/{email_id}", response_model=EmailDetailResponse)
async def get_email_detail(
    email_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_db),
):
    email = db.query(EmailAnalysis).filter(
        EmailAnalysis.id == email_id,
        EmailAnalysis.agency_id == current_user.agency_id,
    ).first()
    if not email:
        raise HTTPException(404, "Email introuvable")
    return email


@router.delete("/email/history/{email_id}")
async def delete_history(
    email_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_db),
):
    item = db.query(EmailAnalysis).filter(
        EmailAnalysis.id == email_id,
        EmailAnalysis.agency_id == current_user.agency_id,
    ).first()
    if not item:
        raise HTTPException(404, "Introuvable ou accès refusé")

    db.query(TenantEmailLink).filter(
        TenantEmailLink.email_analysis_id == email_id
    ).delete(synchronize_session=False)
    db.delete(item)
    db.commit()
    return {"status": "deleted"}


# ── Envoi email ────────────────────────────────────────────────────────────────

@router.post("/email/send")
async def send_mail_ep(
    req: SendEmailRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_db),
):
    email = None
    if req.email_id is not None:
        email = db.query(EmailAnalysis).filter(
            EmailAnalysis.id == req.email_id,
            EmailAnalysis.agency_id == current_user.agency_id,
        ).first()
        if not email:
            raise HTTPException(404, "Email introuvable ou accès refusé")
        if email.reply_sent:
            raise HTTPException(409, "Une réponse a déjà été envoyée.")

    send_email_via_resend(req.to_email, req.subject, req.body)

    if email is not None:
        email.reply_sent = True
        email.reply_sent_at = datetime.utcnow()
        db.commit()

    return {"status": "sent"}


# ── Analyse manuelle — pipeline complet inline ────────────────────────────────

@router.post("/email/process")
async def process_email_manual(
    req: ProcessEmailRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_db),
):
    """
    Pipeline complet inline — identique au watcher automatique :
    1. Analyse IA pièces jointes + upload R2
    2. Analyse email (catégorie, urgence, résumé)
    3. Sauvegarde EmailAnalysis (sans réponse)
    4. Création/récupération dossier locataire
    5. Attachement documents + recalcul checklist
    6. Génération réponse (avec état réel du dossier)
    7. Mise à jour réponse dans EmailAnalysis
    8. Envoi email si activé
    """
    from app.services.document_service import analyze_document
    from app.services.email_service import analyze_email, generate_reply
    from app.services.storage_service import upload_file as r2_upload
    from app.services.tenant_service import (
        ensure_tenant_file, ensure_email_link,
        attach_files_to_tenant_file, recompute_checklist,
    )

    aid = current_user.agency_id

    # Paramètres agence
    agency_settings = db.query(AppSettings).filter(AppSettings.agency_id == aid).first()
    company_name = getattr(agency_settings, "company_name", None) or "Agence"
    tone = getattr(agency_settings, "tone", None) or "pro"
    signature = getattr(agency_settings, "signature", None) or "L'équipe"
    send_email_flag = req.send_email and getattr(agency_settings, "send_email", False)

    # ── 1. Pièces jointes ──────────────────────────────────────────────────────
    attachment_summary = ""
    saved_file_ids = []

    for att in req.attachments[:10]:
        try:
            raw_bytes = base64.b64decode(att.get("content_base64", ""))
            if not raw_bytes:
                continue

            filename = att.get("filename", "document")
            content_type = att.get("content_type", "application/octet-stream")

            doc_result = await analyze_document(
                file_bytes=raw_bytes,
                filename=filename,
                content_type=content_type,
            )
            attachment_summary += (
                f"- {filename} ({doc_result.doc_type}) : {doc_result.summary[:120]}\n"
            )

            file_hash = hashlib.sha256(raw_bytes).hexdigest()
            existing = db.query(FileAnalysis).filter(
                FileAnalysis.agency_id == aid,
                FileAnalysis.file_hash == file_hash,
            ).first()

            if existing:
                saved_file_ids.append(existing.id)
                continue

            safe_name = f"{aid}_{int(time.time())}_{Path(filename).name}"
            r2_upload(raw_bytes, safe_name, content_type)

            new_file = FileAnalysis(
                filename=safe_name,
                file_type=doc_result.doc_type,
                sender=req.from_email,
                extracted_date=doc_result.extracted_date,
                amount=doc_result.amount,
                summary=doc_result.summary,
                agency_id=aid,
                file_hash=file_hash,
            )
            db.add(new_file)
            db.commit()
            db.refresh(new_file)
            saved_file_ids.append(new_file.id)

        except Exception as e:
            log.error(f"[email_routes] Erreur PJ ({att.get('filename', '?')}) : {e}")
            attachment_summary += f"- {att.get('filename', '?')} : erreur ({e})\n"

    # ── 2. Analyse email ───────────────────────────────────────────────────────
    email_result = await analyze_email(
        from_email=req.from_email,
        subject=req.subject,
        content=req.content,
        company_name=company_name,
        attachment_summary=attachment_summary,
    )

    # ── 3. Sauvegarde EmailAnalysis (sans réponse pour l'instant) ─────────────
    email_record = EmailAnalysis(
        agency_id=aid,
        sender_email=req.from_email,
        subject=req.subject,
        raw_email_text=req.content,
        summary=email_result.summary,
        category=email_result.category,
        urgency=email_result.urgency,
        is_devis=email_result.is_devis,
        suggested_response_text="",  # Sera mis à jour après
        reply_sent=False,
    )
    db.add(email_record)
    db.commit()
    db.refresh(email_record)

    # ── 4. Dossier locataire ───────────────────────────────────────────────────
    tenant_file = None
    tenant_file_id = None
    checklist = None

    is_tenant_email = email_result.category in (
        "dossier_locataire", "candidature", "document", "piece_jointe"
    )

    if is_tenant_email and req.from_email:
        tenant_file = ensure_tenant_file(
            db=db,
            agency_id=aid,
            candidate_email=req.from_email,
            candidate_name=getattr(email_result, "candidate_name", None),
        )
        if tenant_file:
            ensure_email_link(db, tenant_file.id, email_record.id)

            # ── 5. Attachement documents + recalcul checklist ──────────────────
            if saved_file_ids:
                attach_files_to_tenant_file(db, tenant_file, saved_file_ids)
                db.refresh(tenant_file)
                recompute_checklist(db, tenant_file)
                checklist = (
                    json.loads(tenant_file.checklist_json)
                    if tenant_file.checklist_json else None
                )

            tenant_file_id = tenant_file.id

    # ── 6. Génération réponse (APRÈS checklist) ────────────────────────────────
    # FIX BUG : On récupère l'état réel du dossier AVANT de générer la réponse
    received_docs = []
    missing_docs = []
    payslip_required = 3
    payslip_received = 0

    if tenant_file and checklist:
        try:
            received_docs = checklist.get("received", [])
            missing_docs = checklist.get("missing", [])
            payslip_required = checklist.get("payslip_required", 3)
            payslip_received = checklist.get("payslip_received", 0)
            log.info(
                f"[email_routes] Dossier id={tenant_file.id} : "
                f"reçus={len(received_docs)} manquants={len(missing_docs)}"
            )
        except Exception as e:
            log.warning(f"[email_routes] Impossible de lire la checklist : {e}")

    reply_result = await generate_reply(
        from_email=req.from_email,
        subject=req.subject,
        content=req.content,
        summary=email_result.summary,
        category=email_result.category,
        urgency=email_result.urgency,
        company_name=company_name,
        tone=tone,
        signature=signature,
        received_docs=received_docs,
        missing_docs=missing_docs,
        payslip_required=payslip_required,
        payslip_received=payslip_received,
    )

    # ── 7. Mise à jour de la réponse ───────────────────────────────────────────
    email_record.suggested_response_text = reply_result.reply
    db.commit()

    # ── 8. Envoi email si activé ───────────────────────────────────────────────
    if send_email_flag and reply_result.reply:
        try:
            send_email_via_resend(
                req.from_email,
                f"Re: {req.subject}",
                reply_result.reply,
            )
            email_record.reply_sent = True
            email_record.reply_sent_at = datetime.utcnow()
            db.commit()
        except Exception as e:
            log.error(f"[email_routes] Erreur envoi email : {e}")

    return {
        "analyse": {
            "category": email_result.category,
            "urgency": email_result.urgency,
            "is_devis": email_result.is_devis,
            "summary": email_result.summary,
            "suggested_title": getattr(email_result, "suggested_title", None),
            "candidate_name": getattr(email_result, "candidate_name", None),
        },
        "reponse": {
            "subject": f"Re: {req.subject}",
            "reply": reply_result.reply,
        },
        "email_id": email_record.id,
        "tenant_file_id": tenant_file_id,
        "files_saved": saved_file_ids,
        "checklist": checklist,
        "attachments_summary": attachment_summary or None,
    }