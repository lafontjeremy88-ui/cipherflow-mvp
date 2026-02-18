# app/services/tenant_service.py
"""
Logique métier des dossiers locataires.
- Création / récupération d'un dossier
- Lien email ↔ dossier
- Attachement documents ↔ dossier (sans doublons)
- Recalcul checklist et statut

Toutes les fonctions prennent une session DB en paramètre.
Ce service est synchrone (compatible RQ worker).
"""

import json
import logging
from typing import List, Optional

from sqlalchemy.orm import Session

from app.database import models
from app.database.models import (
    TenantFile,
    TenantFileStatus,
    TenantDocType,
    TenantEmailLink,
    TenantDocumentLink,
    FileAnalysis,
    DocQuality,
)

log = logging.getLogger(__name__)

# Documents obligatoires pour un dossier complet
REQUIRED_DOC_TYPES = {
    TenantDocType.ID.value,
    TenantDocType.PAYSLIP.value,
    TenantDocType.TAX.value,
}


# ── Normalisation email ────────────────────────────────────────────────────────

def normalize_email(email: str) -> str:
    return (email or "").strip().lower()


# ── Dossier locataire ──────────────────────────────────────────────────────────

def ensure_tenant_file(
    db: Session,
    agency_id: int,
    candidate_email: str,
    candidate_name: Optional[str] = None,
) -> Optional[TenantFile]:
    """
    Récupère ou crée un dossier locataire.
    Identifié de façon unique par : agency_id + candidate_email normalisé.
    """
    email = normalize_email(candidate_email)

    if not email:
        log.warning("[tenant_service] email vide — dossier non créé")
        return None

    # Recherche dossier existant
    tenant_file = (
        db.query(TenantFile)
        .filter(
            TenantFile.agency_id == agency_id,
            TenantFile.candidate_email == email,
            TenantFile.is_closed == False,
        )
        .first()
    )

    if tenant_file:
        # Mise à jour du nom si on l'a maintenant
        if candidate_name and not tenant_file.candidate_name:
            tenant_file.candidate_name = candidate_name
            db.commit()
        log.info(f"[tenant_service] Dossier existant id={tenant_file.id}")
        return tenant_file

    # Création nouveau dossier
    tenant_file = TenantFile(
        agency_id=agency_id,
        candidate_email=email,
        candidate_name=candidate_name,
        status=TenantFileStatus.NEW,
        checklist_json=json.dumps(_empty_checklist()),
    )
    db.add(tenant_file)
    db.commit()
    db.refresh(tenant_file)
    log.info(f"[tenant_service] Nouveau dossier créé id={tenant_file.id} email={email}")
    return tenant_file


# ── Lien email ↔ dossier ───────────────────────────────────────────────────────

def ensure_email_link(
    db: Session,
    tenant_file_id: int,
    email_analysis_id: int,
) -> None:
    """
    Crée le lien email ↔ dossier si inexistant.
    Idempotent.
    """
    existing = (
        db.query(TenantEmailLink)
        .filter(
            TenantEmailLink.tenant_file_id == tenant_file_id,
            TenantEmailLink.email_analysis_id == email_analysis_id,
        )
        .first()
    )

    if not existing:
        link = TenantEmailLink(
            tenant_file_id=tenant_file_id,
            email_analysis_id=email_analysis_id,
        )
        db.add(link)
        db.commit()
        log.info(f"[tenant_service] Email lié : email_id={email_analysis_id} → dossier_id={tenant_file_id}")


# ── Attachement documents ──────────────────────────────────────────────────────

def attach_files_to_tenant_file(
    db: Session,
    tenant_file: TenantFile,
    file_ids: List[int],
) -> None:
    """
    Attache des FileAnalysis à un dossier locataire.
    Règles :
    - Un doc_type ne peut exister qu'une fois dans un dossier
    - Les doublons (file_analysis_id déjà lié) sont ignorés
    """
    if not file_ids:
        return

    # Types déjà présents dans le dossier
    existing_types = {
        link.doc_type.value
        for link in tenant_file.document_links
    }

    # IDs déjà liés
    existing_file_ids = {
        link.file_analysis_id
        for link in tenant_file.document_links
    }

    for file_id in file_ids:
        if file_id in existing_file_ids:
            log.info(f"[tenant_service] Doublon ignoré : file_id={file_id}")
            continue

        file_analysis = db.query(FileAnalysis).get(file_id)
        if not file_analysis:
            log.warning(f"[tenant_service] FileAnalysis introuvable : id={file_id}")
            continue

        doc_type = file_analysis.file_type or TenantDocType.OTHER.value

        # Normalisation : si file_type ne correspond pas à un TenantDocType valide
        valid_types = {e.value for e in TenantDocType}
        if doc_type not in valid_types:
            doc_type = TenantDocType.OTHER.value

        # Un seul doc par type (sauf OTHER qui peut être multiple)
        if doc_type != TenantDocType.OTHER.value and doc_type in existing_types:
            log.info(f"[tenant_service] Type déjà présent ({doc_type}), ignoré : file_id={file_id}")
            continue

        link = TenantDocumentLink(
            tenant_file_id=tenant_file.id,
            file_analysis_id=file_id,
            doc_type=doc_type,
            quality=DocQuality.OK,
        )
        db.add(link)
        existing_types.add(doc_type)
        existing_file_ids.add(file_id)
        log.info(f"[tenant_service] Document attaché : file_id={file_id} type={doc_type}")

    db.commit()


# ── Checklist & statut ─────────────────────────────────────────────────────────

def _empty_checklist() -> dict:
    return {
        doc_type: {"received": False, "file_id": None}
        for doc_type in REQUIRED_DOC_TYPES
    }


def recompute_checklist(db: Session, tenant_file: TenantFile) -> None:
    """
    Recalcule la checklist et le statut du dossier.
    Appelé après chaque attachement de document.
    """
    # Types reçus dans le dossier
    received_types = {
        link.doc_type.value: link.file_analysis_id
        for link in tenant_file.document_links
        if link.doc_type.value in REQUIRED_DOC_TYPES
    }

    checklist = {}
    for doc_type in REQUIRED_DOC_TYPES:
        file_id = received_types.get(doc_type)
        checklist[doc_type] = {
            "received": file_id is not None,
            "file_id": file_id,
        }

    tenant_file.checklist_json = json.dumps(checklist)

    # Calcul statut
    all_received = all(v["received"] for v in checklist.values())

    if tenant_file.status == TenantFileStatus.VALIDATED:
        pass  # Ne pas rétrograder un dossier validé
    elif all_received:
        tenant_file.status = TenantFileStatus.TO_VALIDATE
    elif any(v["received"] for v in checklist.values()):
        tenant_file.status = TenantFileStatus.INCOMPLETE
    else:
        tenant_file.status = TenantFileStatus.NEW

    db.commit()
    log.info(
        f"[tenant_service] Checklist recalculée dossier_id={tenant_file.id} "
        f"statut={tenant_file.status.value} reçus={list(received_types.keys())}"
    )
