# app/services/email_pipeline.py
"""
Orchestrateur du pipeline email CipherFlow.

Ordre d'exécution :
  1. Analyse pièces jointes (indépendantes, erreur isolée)
  2. Analyse email (Gemini)
  3. Sauvegarde EmailAnalysis
  4. Création / récupération dossier locataire
  5. Lien email ↔ dossier
  6. Attachement documents ↔ dossier
  7. Recalcul checklist
  8. Génération réponse
  9. Sauvegarde réponse + envoi éventuel

Principes :
- Chaque étape est wrappée individuellement
- Une PJ qui échoue ne tue pas le pipeline
- Session DB ouverte ici, fermée dans finally
- Aucun import depuis main.py
"""

import asyncio
import base64
import hashlib
import logging
import os
import time
from pathlib import Path
from typing import List, Optional

from app.core.config import settings
from app.database.database import SessionLocal
from app.database import models
from app.database.models import TenantDocType
from app.services.email_service import analyze_email, generate_reply
from app.services.document_service import analyze_document
from app.services.tenant_service import (
    ensure_tenant_file,
    ensure_email_link,
    attach_files_to_tenant_file,
    recompute_checklist,
)

log = logging.getLogger(__name__)

UPLOAD_DIR = Path(settings.UPLOAD_DIR)
UPLOAD_DIR.mkdir(exist_ok=True)


# ── Entrée principale ──────────────────────────────────────────────────────────

async def run_email_pipeline(payload: dict) -> None:
    """
    Point d'entrée du pipeline.
    Appelé par le worker RQ via asyncio.run().
    """

    db = SessionLocal()

    try:
        # ── Extraction payload ─────────────────────────────────────────────────
        agency_id: int = payload["agency_id"]
        from_email: str = payload.get("from_email", "").strip()
        subject: str = payload.get("subject", "(sans objet)")
        content: str = payload.get("content", "")
        attachments: list = payload.get("attachments", [])
        company_name: str = payload.get("company_name", "Agence")
        tone: str = payload.get("tone", "pro")
        signature: str = payload.get("signature", "L'équipe")
        send_email: bool = payload.get("send_email", False)

        log.info(
            f"[pipeline] START agency={agency_id} from={from_email} "
            f"subject={subject!r} pj={len(attachments)}"
        )

        # ── ÉTAPE 1 : Analyse pièces jointes ──────────────────────────────────
        attachment_ids: List[int] = []
        attachment_summary: str = ""
        candidate_name_from_docs: Optional[str] = None

        for att in attachments:
            try:
                attachment_id, summary_line, doc_candidate_name = await _process_attachment(
                    db=db,
                    att=att,
                    agency_id=agency_id,
                    from_email=from_email,
                )
                if attachment_id:
                    attachment_ids.append(attachment_id)
                    attachment_summary += f"- {summary_line}\n"
                    if doc_candidate_name and not candidate_name_from_docs:
                        candidate_name_from_docs = doc_candidate_name

            except Exception as e:
                # Une PJ qui échoue n'arrête pas le pipeline
                log.error(f"[pipeline] PJ échouée ({att.get('filename', '?')}) : {e}")

        # ── ÉTAPE 2 : Analyse email ────────────────────────────────────────────
        log.info("[pipeline] Étape 2 : analyse email")
        email_result = await analyze_email(
            from_email=from_email,
            subject=subject,
            content=content,
            company_name=company_name,
            attachment_summary=attachment_summary,
        )

        # ── ÉTAPE 3 : Sauvegarde EmailAnalysis ────────────────────────────────
        log.info("[pipeline] Étape 3 : sauvegarde email")
        new_email = models.EmailAnalysis(
            agency_id=agency_id,
            sender_email=from_email,
            subject=subject,
            raw_email_text=content,
            is_devis=email_result.is_devis,
            category=email_result.category,
            urgency=email_result.urgency,
            summary=email_result.summary,
            suggested_title=email_result.suggested_title,
            raw_ai_output=email_result.raw_ai_text,
            suggested_response_text="",
            filter_decision=payload.get("filter_decision"),
            filter_score=payload.get("filter_score"),
            filter_reasons=str(payload.get("filter_reasons", "")),
        )
        db.add(new_email)
        db.commit()
        db.refresh(new_email)
        log.info(f"[pipeline] EmailAnalysis créé id={new_email.id}")

        # ── ÉTAPE 4 : Dossier locataire ────────────────────────────────────────
        log.info("[pipeline] Étape 4 : dossier locataire")
        candidate_name = (
            email_result.candidate_name
            or candidate_name_from_docs
        )

        tenant_file = None
        try:
            tenant_file = ensure_tenant_file(
                db=db,
                agency_id=agency_id,
                candidate_email=from_email,
                candidate_name=candidate_name,
            )
        except Exception as e:
            log.error(f"[pipeline] Erreur création dossier : {e}")

        # ── ÉTAPES 5-7 : Liens et checklist ───────────────────────────────────
        if tenant_file:

            # Étape 5 : Lien email ↔ dossier
            try:
                ensure_email_link(db, tenant_file.id, new_email.id)
            except Exception as e:
                log.error(f"[pipeline] Erreur lien email : {e}")

            # Étape 6 : Attachement documents
            if attachment_ids:
                try:
                    attach_files_to_tenant_file(db, tenant_file, attachment_ids)
                except Exception as e:
                    log.error(f"[pipeline] Erreur attachement docs : {e}")

            # Étape 7 : Recalcul checklist
            try:
                db.refresh(tenant_file)
                recompute_checklist(db, tenant_file)
            except Exception as e:
                log.error(f"[pipeline] Erreur recalcul checklist : {e}")

        # ── ÉTAPE 8 : Génération réponse ───────────────────────────────────────
        log.info("[pipeline] Étape 8 : génération réponse")
        reply_result = await generate_reply(
            from_email=from_email,
            subject=subject,
            content=content,
            summary=email_result.summary,
            category=email_result.category,
            urgency=email_result.urgency,
            company_name=company_name,
            tone=tone,
            signature=signature,
        )

        # ── ÉTAPE 9 : Sauvegarde réponse ──────────────────────────────────────
        log.info("[pipeline] Étape 9 : sauvegarde réponse")
        new_email.suggested_response_text = reply_result.reply
        db.commit()

        # Envoi éventuel (Resend)
        if send_email and reply_result.reply:
            try:
                await _send_reply(
                    to_email=from_email,
                    subject=f"Re: {subject}",
                    body=reply_result.reply,
                )
                new_email.reply_sent = True
                from datetime import datetime
                new_email.reply_sent_at = datetime.utcnow()
                db.commit()
            except Exception as e:
                log.error(f"[pipeline] Erreur envoi email : {e}")

        log.info(
            f"[pipeline] ✅ SUCCESS email_id={new_email.id} "
            f"dossier_id={tenant_file.id if tenant_file else 'N/A'} "
            f"docs={len(attachment_ids)}"
        )

    except Exception as e:
        db.rollback()
        log.error(f"[pipeline] ❌ FATAL ERROR : {e}", exc_info=True)
        raise

    finally:
        db.close()


# ── Traitement d'une pièce jointe ──────────────────────────────────────────────

async def _process_attachment(
    db,
    att: dict,
    agency_id: int,
    from_email: str,
) -> tuple[Optional[int], str, Optional[str]]:
    """
    Traite une pièce jointe :
    - Décode le base64
    - Vérifie le hash (doublon)
    - Appelle analyze_document
    - Crée FileAnalysis en DB

    Retourne (file_analysis_id, summary_line, candidate_name)
    """

    if not att.get("content_base64"):
        return None, "", None

    raw_bytes = base64.b64decode(att["content_base64"])
    filename = att.get("filename", "document")
    content_type = att.get("content_type", "application/pdf")

    # Anti-doublon par hash SHA256
    file_hash = hashlib.sha256(raw_bytes).hexdigest()
    existing = (
        db.query(models.FileAnalysis)
        .filter(
            models.FileAnalysis.agency_id == agency_id,
            models.FileAnalysis.file_hash == file_hash,
        )
        .first()
    )

    if existing:
        log.info(f"[pipeline] Doublon détecté ({filename}), réutilisation id={existing.id}")
        return existing.id, existing.filename, None

    # Analyse via Gemini
    doc_result = await analyze_document(
        file_bytes=raw_bytes,
        filename=filename,
        content_type=content_type,
    )

    # Sauvegarde FileAnalysis
    safe_name = f"{agency_id}_{int(time.time())}_{filename}"
    new_file = models.FileAnalysis(
        agency_id=agency_id,
        filename=safe_name,
        file_hash=file_hash,
        file_type=doc_result.doc_type,
        summary=doc_result.summary,
        sender=from_email,
        extracted_date=doc_result.extracted_date,
        amount=doc_result.amount,
    )
    db.add(new_file)
    db.commit()
    db.refresh(new_file)

    summary_line = f"{filename} ({doc_result.doc_type}) — {doc_result.summary[:80]}"
    log.info(f"[pipeline] PJ traitée : {filename} → type={doc_result.doc_type} id={new_file.id}")

    return new_file.id, summary_line, doc_result.candidate_name


# ── Envoi email via Resend ─────────────────────────────────────────────────────

async def _send_reply(to_email: str, subject: str, body: str) -> None:
    """
    Envoie un email via Resend.
    Ajoute le header X-CipherFlow-Origin pour l'anti-boucle du watcher.
    """
    import resend

    resend.api_key = settings.RESEND_API_KEY

    resend.Emails.send({
        "from": settings.RESEND_FROM_EMAIL,
        "to": [to_email],
        "subject": subject,
        "text": body,
        "headers": {
            "X-CipherFlow-Origin": "true",
        },
    })
    log.info(f"[pipeline] Email envoyé à {to_email}")
