# app/api/email_routes.py
"""
Routes emails : historique, détail, suppression, envoi manuel.

FIX P0 : ajout de POST /email/process pour EmailProcessor.jsx
         Lance le pipeline complet (analyse + réponse suggérée) sans passer
         par la file RQ — résultat retourné directement en JSON.
"""

import json
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_db
from app.core.security_utils import send_email_via_resend
from app.database.database import get_db
from app.database.models import (
    AppSettings, EmailAnalysis, FileAnalysis, Invoice,
    TenantEmailLink, User,
)

router = APIRouter(tags=["Emails"])


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
    """Payload pour l'analyse manuelle d'un email depuis l'interface."""
    from_email: str
    subject: str
    content: str
    send_email: bool = False
    attachments: list = []


# ── Routes ─────────────────────────────────────────────────────────────────────

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
            "tenant_files": tenant_count,  # FIX: renommé de "invoices" → "tenant_files"
        },
        "charts": {"distribution": [{"name": c[0], "value": c[1]} for c in cat_stats]},
        "recents": [
            {"id": r.id, "subject": r.subject, "category": r.category,
             "urgency": r.urgency, "date": r.created_at.strftime("%d/%m %H:%M") if r.created_at else ""}
            for r in recents
        ],
    }


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
    links = db.query(TenantEmailLink).filter(TenantEmailLink.email_analysis_id.in_(email_ids)).all()
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


@router.post("/email/process")
async def process_email_manual(
    req: ProcessEmailRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_db),
):
    """
    FIX P0 : Route manquante pour EmailProcessor.jsx.

    Lance le pipeline complet directement (sans RQ) et retourne
    l'analyse + la réponse suggérée en JSON.
    Permet à l'agent de tester le traitement d'un email depuis l'interface.
    """
    from app.database.models import AppSettings
    from app.services.email_service import analyze_email, generate_reply

    aid = current_user.agency_id

    # Récupère les paramètres de l'agence
    agency_settings = db.query(AppSettings).filter(AppSettings.agency_id == aid).first()
    company_name = agency_settings.company_name if agency_settings else "Agence"
    tone = agency_settings.tone if agency_settings else "pro"
    signature = agency_settings.signature if agency_settings else "L'équipe"

    # ── Analyse des pièces jointes ─────────────────────────────────────────────
    attachment_summary = ""
    if req.attachments:
        import base64
        from app.services.document_service import analyze_document

        for att in req.attachments[:5]:  # max 5 PJ en mode manuel
            try:
                raw_bytes = base64.b64decode(att.get("content_base64", ""))
                if not raw_bytes:
                    continue
                doc_result = await analyze_document(
                    file_bytes=raw_bytes,
                    filename=att.get("filename", "document"),
                    content_type=att.get("content_type", "application/pdf"),
                )
                attachment_summary += f"- {att.get('filename')} ({doc_result.doc_type}) : {doc_result.summary[:100]}\n"
            except Exception as e:
                attachment_summary += f"- {att.get('filename', '?')} : erreur analyse ({e})\n"

    # ── Analyse email ──────────────────────────────────────────────────────────
    email_result = await analyze_email(
        from_email=req.from_email,
        subject=req.subject,
        content=req.content,
        company_name=company_name,
        attachment_summary=attachment_summary,
    )

    # ── Génération réponse ─────────────────────────────────────────────────────
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
    )

    return {
        "analyse": {
            "category": email_result.category,
            "urgency": email_result.urgency,
            "is_devis": email_result.is_devis,
            "summary": email_result.summary,
            "suggested_title": email_result.suggested_title,
            "candidate_name": email_result.candidate_name,
        },
        "reponse": {
            "subject": f"Re: {req.subject}",
            "reply": reply_result.reply,
        },
        "attachments_summary": attachment_summary or None,
    }
