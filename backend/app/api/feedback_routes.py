# app/api/feedback_routes.py
"""
Feedback utilisateur — signalement d'un email mal classifié.

POST /feedback/email/{email_id}
  body: {reason: "non_immobilier" | "agence" | "mauvaise_classification" | "autre"}

  - Crée un enregistrement EmailFeedback
  - Si reason == "agence" → auto-blackliste le domaine de l'expéditeur
  - Retourne : {id, auto_blacklisted}

Accès : agency_admin ou agent de l'agence propriétaire de l'email.
"""

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_db
from app.database.database import get_db
from app.database.models import (
    AgencyBlacklist,
    EmailAnalysis,
    EmailFeedback,
    User,
)

log = logging.getLogger(__name__)
router = APIRouter(prefix="/feedback", tags=["Feedback"])

VALID_REASONS = {"non_immobilier", "agence", "mauvaise_classification", "autre"}


class FeedbackPayload(BaseModel):
    reason: str


@router.post("/email/{email_id}", status_code=201)
async def report_email(
    email_id: int,
    payload: FeedbackPayload,
    current_user: User = Depends(get_current_user_db),
    db: Session = Depends(get_db),
):
    """
    Signale un email comme mal traité.

    reason :
      - non_immobilier         → email hors-sujet (pas une candidature)
      - agence                 → email de l'agence elle-même (boucle interne)
      - mauvaise_classification → classification IA incorrecte
      - autre                  → autre raison
    """
    if payload.reason not in VALID_REASONS:
        raise HTTPException(
            status_code=422,
            detail=f"Raison invalide. Valeurs acceptées : {', '.join(sorted(VALID_REASONS))}",
        )

    # Vérifier que l'email appartient à l'agence de l'utilisateur
    email = (
        db.query(EmailAnalysis)
        .filter(
            EmailAnalysis.id == email_id,
            EmailAnalysis.agency_id == current_user.agency_id,
        )
        .first()
    )
    if not email:
        raise HTTPException(status_code=404, detail="Email introuvable")

    # Créer le feedback
    feedback = EmailFeedback(
        email_analysis_id=email_id,
        agency_id=current_user.agency_id,
        reported_by=current_user.id,
        reason=payload.reason,
        auto_blacklisted=False,
    )

    # ── Auto-blacklist si email de l'agence elle-même ─────────────────────
    if payload.reason == "agence" and email.sender_email and "@" in email.sender_email:
        domain = email.sender_email.split("@")[-1].lower()
        if domain:
            pattern = f"@{domain}"
            already_exists = (
                db.query(AgencyBlacklist)
                .filter(
                    AgencyBlacklist.agency_id == current_user.agency_id,
                    AgencyBlacklist.pattern == pattern,
                )
                .first()
            )
            if not already_exists:
                db.add(AgencyBlacklist(
                    agency_id=current_user.agency_id,
                    pattern=pattern,
                    created_by=current_user.id,
                ))
                feedback.auto_blacklisted = True
                log.info(
                    f"[feedback] Auto-blacklist pattern='{pattern}' "
                    f"agency={current_user.agency_id} email_id={email_id}"
                )

    db.add(feedback)
    db.commit()
    db.refresh(feedback)

    log.info(
        f"[feedback] Signalement email_id={email_id} reason={payload.reason} "
        f"auto_blacklisted={feedback.auto_blacklisted} agency={current_user.agency_id}"
    )
    return {"id": feedback.id, "auto_blacklisted": feedback.auto_blacklisted}
