# app/api/watcher_routes.py
"""
Routes internes utilisées par le watcher (non exposées aux utilisateurs).
Authentification par x-watcher-secret header.

- GET  /watcher/configs        → liste des agences avec Gmail connecté
- POST /watcher/update-token   → MAJ access_token après refresh OAuth
- GET  /watcher/check-sender   → vérifie si un email est connu (candidat existant)
"""

import hmac
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.config import settings
from app.database.database import get_db
from app.database import models

log = logging.getLogger(__name__)
router = APIRouter(prefix="/watcher", tags=["Watcher Internal"])


def _check_secret(x_watcher_secret: str = Header(...)):
    if x_watcher_secret != settings.WATCHER_SECRET:
        raise HTTPException(status_code=403, detail="Secret invalide")


# ══════════════════════════════════════════════════════════════════════════════
# 📧 NORMALISATION EMAILS (Gmail, Outlook, etc.)
# ══════════════════════════════════════════════════════════════════════════════

def normalize_email(email: str) -> tuple[str, str]:
    """
    Normalise un email selon les règles du provider.
    
    Retourne (normalized_email, canonical_email) :
    - normalized_email : version normalisée (sans points Gmail, etc.)
    - canonical_email : version canonique (sans alias +)
    
    Règles par provider :
    - Gmail / Googlemail :
      - Ignore les points : user.name@gmail.com = username@gmail.com
      - Ignore les alias + : user+test@gmail.com = user@gmail.com
    - Outlook / Hotmail / Live :
      - Garde les alias + : user+test@outlook.com ≠ user@outlook.com
    - Autres (Yahoo, ProtonMail, etc.) :
      - Pas de normalisation spéciale
    
    Tous :
    - Case-insensitive : User@Gmail.com = user@gmail.com
    """
    if not email or "@" not in email:
        return email.lower() if email else "", ""
    
    local, domain = email.rsplit("@", 1)
    local = local.lower()
    domain = domain.lower()
    
    # ── Gmail / Googlemail : ignore points + alias ───────────────────────────
    if domain in ["gmail.com", "googlemail.com"]:
        # Version normalisée : sans points
        local_normalized = local.replace(".", "")
        
        # Version canonique : sans points ET sans alias
        local_canonical = local_normalized.split("+")[0]
        
        return (
            f"{local_normalized}@{domain}",
            f"{local_canonical}@{domain}",
        )
    
    # ── Outlook / Hotmail / Live : garde tout ─────────────────────────────────
    elif domain in ["outlook.com", "outlook.fr", "hotmail.com", "hotmail.fr", "live.com", "live.fr"]:
        # Pas de normalisation spéciale
        # Les alias + sont DISTINCTS chez Outlook
        return f"{local}@{domain}", f"{local}@{domain}"
    
    # ── Autres providers (Yahoo, ProtonMail, custom domains) ─────────────────
    else:
        # Pas de normalisation
        return f"{local}@{domain}", f"{local}@{domain}"


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


# ── GET /watcher/check-sender ─────────────────────────────────────────────────

@router.get("/watcher/check-sender")
async def check_known_sender(
    email: str,
    agency_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Vérifie si un email est déjà connu (candidat existant dans les dossiers).
    Gère la normalisation Gmail (points + alias ignorés).
    
    Appelé par le watcher pour décider si un email sans PJ/mots-clés doit être accepté.
    
    Retourne : {"is_known": true/false}
    """
    # Vérification du secret
    auth = request.headers.get("x-watcher-secret", "")
    if not settings.WATCHER_SECRET or not hmac.compare_digest(auth, settings.WATCHER_SECRET):
        raise HTTPException(status_code=403, detail="Secret invalide")
    
    # Normalisation email
    normalized, canonical = normalize_email(email)
    
    # Liste des variantes à chercher
    variants = list(set([email.lower(), normalized, canonical]))
    
    log.debug(f"[watcher/check-sender] Recherche email={email} variants={variants}")
    
    # Recherche en base avec toutes les variantes
    exists = db.query(models.TenantFile).filter(
        models.TenantFile.agency_id == agency_id,
        or_(*[
            models.TenantFile.candidate_email == variant
            for variant in variants
        ])
    ).first() is not None
    
    log.info(f"[watcher/check-sender] email={email} agency={agency_id} is_known={exists}")
    
    return {"is_known": exists}