import asyncio
from typing import Dict, Any
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.database import models


def process_email_job(payload: Dict[str, Any]):
    """
    Job RQ qui traite un email complet :
    - Analyse IA (async)
    - Création EmailAnalysis
    - Génération réponse (async)
    """

    db: Session = SessionLocal()

    try:
        # 🔁 Import local pour éviter circular import
        from app.main import (
            analyze_email_logic,
            generate_reply_logic,
        )

        agency_id = payload["agency_id"]
        from_email = payload["from_email"]
        subject = payload["subject"]
        content = payload["content"]
        attachments = payload.get("attachments", [])
        send_email = payload.get("send_email", False)

        # =============================
        # 1️⃣ ANALYSE EMAIL (ASYNC)
        # =============================
        analyse = asyncio.run(
            analyze_email_logic(
                payload,
                payload.get("company_name"),
                db,
                agency_id,
                attachment_summary="",
            )
        )

        # =============================
        # 2️⃣ SAVE EMAIL EN BASE
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
        # 3️⃣ GENERATE REPLY (ASYNC)
        # =============================
        response = asyncio.run(
            generate_reply_logic(
                payload,
                payload.get("company_name"),
                payload.get("tone", "pro"),
                payload.get("signature", "Team"),
            )
        )

        new_email.suggested_response_text = response.reply
        db.commit()

        print(f"✅ Email {new_email.id} processed successfully")

    except Exception as e:
        print(f"[WORKER ERROR] {e}")
        db.rollback()

    finally:
        db.close()