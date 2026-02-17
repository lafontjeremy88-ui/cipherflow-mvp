# app/services/email_pipeline.py

import asyncio
import base64
import hashlib
import os
import time
from pathlib import Path
from typing import List

from app.database import models
from app.database.database import SessionLocal
from app.main import (
    analyze_email_logic,
    analyze_document_logic,
    generate_reply_logic,
    EmailAnalyseRequest,
    EmailReplyRequest,
    ensure_tenant_file_for_email,
    ensure_email_link,
    attach_files_to_tenant_file,
    recompute_tenant_file_status,
    map_doc_type,
    is_relevant_for_tenant_file,
)

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)


async def run_email_pipeline(payload: dict):

    db = SessionLocal()

    try:
        agency_id = payload["agency_id"]
        from_email = payload["from_email"]
        subject = payload["subject"]
        content = payload["content"]
        attachments = payload.get("attachments", [])
        company_name = payload.get("company_name", "Agence")
        tone = payload.get("tone", "pro")
        signature = payload.get("signature", "Team")

        attachment_file_ids: List[int] = []
        attachment_summary = ""

        # =============================
        # 1️⃣ Traitement des pièces jointes
        # =============================
        for att in attachments:

            raw_bytes = base64.b64decode(att["content_base64"])
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
                doc_code = map_doc_type(existing.file_type or "")
                if is_relevant_for_tenant_file(doc_code):
                    attachment_file_ids.append(existing.id)
                    attachment_summary += f"- {existing.filename}\n"
                continue

            safe_name = f"{agency_id}_{int(time.time())}_{att['filename']}"
            tmp_path = UPLOAD_DIR / f"tmp_{safe_name}"

            with open(tmp_path, "wb") as f:
                f.write(raw_bytes)

            doc_analysis = await analyze_document_logic(
                str(tmp_path),
                safe_name,
                db,
                agency_id,
            )

            os.remove(tmp_path)

            new_file = models.FileAnalysis(
                filename=safe_name,
                file_type=doc_analysis.get("type", "Document"),
                sender=from_email,
                extracted_date=doc_analysis.get("date", ""),
                amount=doc_analysis.get("amount", "0"),
                summary=doc_analysis.get("summary", ""),
                agency_id=agency_id,
                file_hash=file_hash,
            )

            db.add(new_file)
            db.commit()
            db.refresh(new_file)

            doc_code = map_doc_type(new_file.file_type or "")
            if is_relevant_for_tenant_file(doc_code):
                attachment_file_ids.append(new_file.id)
                attachment_summary += f"- {new_file.filename}\n"

        # =============================
        # 2️⃣ Analyse email
        # =============================
        analyse = await analyze_email_logic(
            EmailAnalyseRequest(
                from_email=from_email,
                subject=subject,
                content=content,
            ),
            company_name,
            db,
            agency_id,
            attachment_summary=attachment_summary,
        )

        # =============================
        # 3️⃣ Sauvegarde email
        # =============================
        new_email = models.EmailAnalysis(
            agency_id=agency_id,
            sender_email=from_email,
            subject=subject,
            raw_email_text=content,
            is_devis=analyse.is_devis,
            category=analyse.category,
            urgency=analyse.urgency,
            summary=analyse.summary,
            suggested_title=analyse.suggested_title,
            raw_ai_output=analyse.raw_ai_text,
        )

        db.add(new_email)
        db.commit()
        db.refresh(new_email)

        # =============================
        # 4️⃣ Gestion dossier locataire
        # =============================
        tf = ensure_tenant_file_for_email(
            db=db,
            agency_id=agency_id,
            email_address=from_email,
        )

        missing_docs = []
        duplicate_docs = []
        tenant_status = None

        if tf:
            attach_result = attach_files_to_tenant_file(
                db=db,
                tenant_file=tf,
                file_ids=attachment_file_ids,
            )

            checklist = attach_result.get("checklist") or {}
            duplicate_docs = attach_result.get("duplicate_doc_types") or []

            missing_docs = checklist.get("missing") or []

            tenant_status = (
                tf.status.value if hasattr(tf.status, "value") else str(tf.status)
            )

            ensure_email_link(db, tf.id, new_email.id)

        # =============================
        # 5️⃣ Génération réponse
        # =============================
        reply = await generate_reply_logic(
            EmailReplyRequest(
                from_email=from_email,
                subject=subject,
                content=content,
                summary=analyse.summary,
                category=analyse.category,
                urgency=analyse.urgency,
                tenant_status=tenant_status,
                missing_docs=missing_docs,
                duplicate_docs=duplicate_docs,
            ),
            company_name,
            tone,
            signature,
        )

        new_email.suggested_response_text = reply.reply
        db.commit()

        print(f"✅ PIPELINE OK email_id={new_email.id}")

    except Exception as e:
        db.rollback()
        print("❌ PIPELINE ERROR:", e)
        raise

    finally:
        db.close()