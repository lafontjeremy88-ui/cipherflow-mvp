import os
from typing import List, Optional
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models import *
from app.main import (
    analyze_email_logic,
    analyze_document_logic,
    generate_reply_logic,
    ensure_tenant_file_for_email,
    ensure_email_link,
    attach_files_to_tenant_file,
    recompute_tenant_file_status,
    should_attach_to_tenant_file,
)
import base64
import hashlib
import time
from pathlib import Path


def process_email_job(payload: dict):
    db: Session = SessionLocal()

    try:
        # On retransforme le dict en objet simple
        req = payload

        agency_id = req["agency_id"]
        from_email = req["from_email"]
        subject = req["subject"]
        content = req["content"]
        attachments = req.get("attachments", [])
        send_email = req.get("send_email", False)

        # =============================
        # 1) ANALYSE EMAIL
        # =============================
        analyse = analyze_email_logic(
            req,
            req.get("company_name"),
            db,
            agency_id,
            attachment_summary=""
        )

        # =============================
        # 2) SAVE EMAIL
        # =============================
        new_email = EmailAnalysis(
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
        # 3) GENERATE REPLY
        # =============================
        reponse = generate_reply_logic(
            req,
            req.get("company_name"),
            req.get("tone", "pro"),
            req.get("signature", "Team"),
        )

        new_email.suggested_response_text = reponse.reply
        db.commit()

    except Exception as e:
        print(f"[WORKER ERROR] {e}")

    finally:
        db.close()