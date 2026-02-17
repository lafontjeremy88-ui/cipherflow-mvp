import asyncio
from typing import Dict, Any
from sqlalchemy.orm import Session

from app.database import models, SessionLocal


def run_email_pipeline(payload: Dict[str, Any]):

    db: Session = SessionLocal()

    try:
        from app.main import (
            analyze_email_logic,
            generate_reply_logic,
            analyze_document_logic,
            ensure_tenant_file_for_email,
            ensure_email_link,
            attach_files_to_tenant_file,
            recompute_tenant_file_status,
            should_attach_to_tenant_file,
            EmailAnalyseRequest,
            EmailReplyRequest,
        )

        agency_id = payload["agency_id"]
        from_email = payload["from_email"]
        subject = payload["subject"]
        content = payload["content"]
        attachments = payload.get("attachments", [])

        # ===============================
        # 1️⃣ ANALYSE EMAIL
        # ===============================

        analyse_request = EmailAnalyseRequest(
            from_email=from_email,
            subject=subject,
            content=content,
        )

        analyse = asyncio.run(
            analyze_email_logic(
                analyse_request,
                payload.get("company_name"),
                db,
                agency_id,
                attachment_summary="",
            )
        )

        # ===============================
        # 2️⃣ SAVE EMAIL
        # ===============================

        email = models.EmailAnalysis(
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

        db.add(email)
        db.commit()
        db.refresh(email)

        attachment_file_ids = []

        # ===============================
        # 3️⃣ ANALYSE DES PIÈCES
        # ===============================

        for att in attachments:

            file_path = att.get("file_path")
            filename = att.get("filename")

            if not file_path or not filename:
                continue

            doc_analysis = asyncio.run(
                analyze_document_logic(file_path, filename)
            )

            new_file = models.FileAnalysis(
                filename=filename,
                file_type=doc_analysis.get("type", "Autre"),
                sender=from_email,
                extracted_date=doc_analysis.get("date", ""),
                amount=doc_analysis.get("amount", "0"),
                summary=doc_analysis.get("summary", ""),
                agency_id=agency_id,
            )

            db.add(new_file)
            db.commit()
            db.refresh(new_file)

            attachment_file_ids.append(new_file.id)

        # ===============================
        # 4️⃣ DOSSIER LOCATAIRE
        # ===============================

        if should_attach_to_tenant_file(analyse, attachment_file_ids):

            tf = ensure_tenant_file_for_email(
                db=db,
                agency_id=agency_id,
                email_address=from_email.lower(),
            )

            if tf:

                ensure_email_link(db, tf.id, email.id)

                if attachment_file_ids:
                    attach_files_to_tenant_file(
                        db=db,
                        tenant_file_id=tf.id,
                        file_ids=attachment_file_ids,
                    )

                recompute_tenant_file_status(db, tf.id)

        # ===============================
        # 5️⃣ GÉNÉRATION RÉPONSE
        # ===============================

        reply_request = EmailReplyRequest(
            from_email=from_email,
            subject=subject,
            content=content,
            summary=analyse.summary,
            category=analyse.category,
            urgency=analyse.urgency,
        )

        response = asyncio.run(
            generate_reply_logic(
                reply_request,
                payload.get("company_name"),
                payload.get("tone", "pro"),
                payload.get("signature", "Team"),
            )
        )

        email.suggested_response_text = response.reply or ""
        db.commit()

        print(f"✅ Pipeline terminé pour email {email.id}")

    except Exception as e:
        db.rollback()
        print(f"❌ PIPELINE ERROR: {e}")

    finally:
        db.close()