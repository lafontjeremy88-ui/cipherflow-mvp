# app/api/watcher_routes.py
"""
Routes internes utilisées par le watcher (non exposées aux utilisateurs).
Authentification par x-watcher-secret header.

- GET  /watcher/configs        → liste des agences avec Gmail connecté
- POST /watcher/update-token   → MAJ access_token après refresh OAuth
"""

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.config import settings
from app.database.database import get_db
from app.database import models

log = logging.getLogger(__name__)
router = APIRouter(prefix="/watcher", tags=["Watcher Internal"])


def _check_secret(x_watcher_secret: str = Header(...)):
    if x_watcher_secret != settings.WATCHER_SECRET:
        raise HTTPException(status_code=403, detail="Secret invalide")


# ── GET /watcher/configs ───────────────────────────────────────────────────────

@router.get("/configs")
async def get_watcher_configs(
    secret: str,
    db: Session = Depends(get_db),
):
    """
    Retourne la liste des configs actives avec tokens Gmail.
    Appelé par le watcher toutes les CONFIG_REFRESH_INTERVAL secondes.
    """
    if secret != settings.WATCHER_SECRET:
        raise HTTPException(status_code=403, detail="Secret invalide")

    configs = (
        db.query(models.AgencyEmailConfig)
        .filter(
            # Le watcher Gmail s'active dès qu'un token existe
            # Le champ enabled ne contrôle que le watcher IMAP
            models.AgencyEmailConfig.gmail_refresh_token.isnot(None),
        )
        .all()
    )

    result = []
    for c in configs:
        result.append({
            "agency_id":           c.agency_id,
            "gmail_access_token":  c.gmail_access_token,
            "gmail_refresh_token": c.gmail_refresh_token,
            "gmail_token_expiry":  c.gmail_token_expiry.isoformat() if c.gmail_token_expiry else None,
            "gmail_email":         c.gmail_email,
            "enabled":             c.enabled,
        })

    log.info(f"[watcher/configs] {len(result)} agence(s) active(s)")
    return result


# ── POST /watcher/update-token ─────────────────────────────────────────────────

class TokenUpdatePayload(BaseModel):
    agency_id:          int
    gmail_access_token: str
    gmail_token_expiry: str | None = None


@router.post("/update-token")
async def update_token(
    payload: TokenUpdatePayload,
    x_watcher_secret: str = Header(...),
    db: Session = Depends(get_db),
):
    """
    Mis à jour du access_token après un refresh OAuth par le watcher.
    Le refresh_token ne change pas, seul l'access_token est mis à jour.
    """
    if x_watcher_secret != settings.WATCHER_SECRET:
        raise HTTPException(status_code=403, detail="Secret invalide")

    config = (
        db.query(models.AgencyEmailConfig)
        .filter(models.AgencyEmailConfig.agency_id == payload.agency_id)
        .first()
    )

    if not config:
        raise HTTPException(status_code=404, detail="Config agence introuvable")

    config.gmail_access_token = payload.gmail_access_token
    if payload.gmail_token_expiry:
        config.gmail_token_expiry = datetime.fromisoformat(
            payload.gmail_token_expiry.replace("Z", "+00:00")
        )

    db.commit()
    log.info(f"[watcher/update-token] Token mis à jour agency={payload.agency_id}")
    return {"success": True}