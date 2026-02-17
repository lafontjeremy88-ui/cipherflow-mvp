import asyncio
from typing import Dict, Any
from sqlalchemy.orm import Session

from app.database import models
from app.database import SessionLocal


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
        )

        agency_id = payload["agency_id"]
        from_email = payload["from_email"]
        subject = payload["subject"]
        content = payload["content"]
        attachments = payload.get("attachments", [])

        # =====================================================
        # 1️⃣ ANALYSE EMAIL (IA)
        # =====================================================
        analyse = asyncio.run(
            analyze_email_logic(
                payload,
                payload.get("company_name"),
                db,
                agency_id,
                attachment_summary="",
            )
        )

        # =====================================================
        # 2️⃣ SAVE EMAIL
        # =====================================================
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

        file_analyses = []

        # =====================================================
        # 3️⃣ ANALYSE DES PIÈCES
        # =====================================================
        for attachment in attachments:

            file_analysis = asyncio.run(
                analyze_document_logic(
                    attachment,
                    db,
                    agency_id,
                    email.id
                )
            )

            if file_analysis:
                file_analyses.append(file_analysis)

        # =====================================================
        # 4️⃣ DÉCISION DOSSIER LOCATAIRE
        # =====================================================
        tenant_file = ensure_tenant_file_for_email(db, email)

        if tenant_file:

            # =====================================================
            # 5️⃣ LIER EMAIL ↔ DOSSIER
            # =====================================================
            ensure_email_link(
                db=db,
                tenant_file_id=tenant_file.id,
                email_analysis_id=email.id,
            )

            # =====================================================
            # 6️⃣ ATTACHER DOCUMENTS
            # =====================================================
            for file_analysis in file_analyses:
                if should_attach_to_tenant_file(file_analysis):
                    attach_files_to_tenant_file(
                        db=db,
                        tenant_file_id=tenant_file.id,
                        file_analysis_id=file_analysis.id,
                    )

            # =====================================================
            # 7️⃣ RECALCUL CHECKLIST
            # =====================================================
            recompute_tenant_file_status(db, tenant_file.id)

        # =====================================================
        # 8️⃣ GÉNÉRATION RÉPONSE
        # =====================================================
        response = asyncio.run(
            generate_reply_logic(
                payload,
                payload.get("company_name"),
                payload.get("tone", "pro"),
                payload.get("signature", "Team"),
            )
        )

        email.suggested_response_text = response.reply
        db.commit()

        print(f"✅ Pipeline terminé pour email {email.id}")

    except Exception as e:
        db.rollback()
        print(f"❌ PIPELINE ERROR: {e}")

    finally:
        db.close()