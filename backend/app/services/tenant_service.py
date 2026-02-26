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

# ── Documents obligatoires pour un dossier complet ────────────────────────────
# Le type "payslip" apparaît 3 fois : 3 fiches de paie sont requises.
REQUIRED_DOC_TYPES = [
    TenantDocType.ID.value,
    TenantDocType.PAYSLIP.value,
    TenantDocType.PAYSLIP.value,
    TenantDocType.PAYSLIP.value,
    TenantDocType.TAX.value,
    TenantDocType.WORK_CONTRACT.value,
    TenantDocType.ADDRESS_PROOF.value,
]

# Nombre de fiches de paie requises
PAYSLIP_REQUIRED_COUNT = 3

# Types pour lesquels on n'accepte qu'un seul exemplaire
UNIQUE_DOC_TYPES = {
    TenantDocType.ID.value,
    TenantDocType.TAX.value,
    TenantDocType.WORK_CONTRACT.value,
    TenantDocType.ADDRESS_PROOF.value,
    TenantDocType.BANK.value,
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
        if candidate_name and not tenant_file.candidate_name:
            tenant_file.candidate_name = candidate_name
            db.commit()
        log.info(f"[tenant_service] Dossier existant id={tenant_file.id}")
        return tenant_file

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
        log.info(
            f"[tenant_service] Email lié : email_id={email_analysis_id} "
            f"→ dossier_id={tenant_file_id}"
        )


# ── Attachement documents ──────────────────────────────────────────────────────

def attach_files_to_tenant_file(
    db: Session,
    tenant_file: TenantFile,
    file_ids: List[int],
) -> None:
    if not file_ids:
        return

    existing_file_ids = {
        link.file_analysis_id
        for link in tenant_file.document_links
    }

    # Compte les fiches de paie déjà présentes
    existing_payslip_count = sum(
        1 for link in tenant_file.document_links
        if link.doc_type.value == TenantDocType.PAYSLIP.value
    )

    # Types uniques déjà présents (hors payslip)
    existing_unique_types = {
        link.doc_type.value
        for link in tenant_file.document_links
        if link.doc_type.value in UNIQUE_DOC_TYPES
    }

    for file_id in file_ids:
        # Doublon exact (même fichier)
        if file_id in existing_file_ids:
            log.info(f"[tenant_service] Doublon ignoré : file_id={file_id}")
            continue

        file_analysis = db.query(FileAnalysis).get(file_id)
        if not file_analysis:
            log.warning(f"[tenant_service] FileAnalysis introuvable : id={file_id}")
            continue

        doc_type = file_analysis.file_type or TenantDocType.OTHER.value

        valid_types = {e.value for e in TenantDocType}
        if doc_type not in valid_types:
            doc_type = TenantDocType.OTHER.value

        # FIX Bug #1 : les documents OTHER ne sont jamais attachés au dossier
        # (format non supporté, image non pertinente, etc.)
        if doc_type == TenantDocType.OTHER.value:
            log.info(
                f"[tenant_service] Document OTHER ignoré (non attaché au dossier) : "
                f"file_id={file_id} filename={file_analysis.filename}"
            )
            continue

        # Fiches de paie : on en accepte jusqu'à 3
        if doc_type == TenantDocType.PAYSLIP.value:
            if existing_payslip_count >= PAYSLIP_REQUIRED_COUNT:
                log.info(
                    f"[tenant_service] 3 fiches de paie déjà présentes, "
                    f"document ignoré : file_id={file_id}"
                )
                continue
            existing_payslip_count += 1

        # Types uniques : on n'accepte qu'un seul exemplaire
        elif doc_type in UNIQUE_DOC_TYPES:
            if doc_type in existing_unique_types:
                log.info(
                    f"[tenant_service] Type unique déjà présent ({doc_type}), "
                    f"ignoré : file_id={file_id}"
                )
                continue
            existing_unique_types.add(doc_type)

        link = TenantDocumentLink(
            tenant_file_id=tenant_file.id,
            file_analysis_id=file_id,
            doc_type=doc_type,
            quality=DocQuality.OK,
        )
        db.add(link)
        existing_file_ids.add(file_id)
        log.info(
            f"[tenant_service] Document attaché : file_id={file_id} type={doc_type}"
        )

    db.commit()


# ── Checklist & statut ─────────────────────────────────────────────────────────

def _empty_checklist() -> dict:
    """
    Format unifié attendu par le frontend :
    {
      required: [...],   # liste avec payslip répété 3 fois
      received: [],
      missing: [...],
      payslip_required: 3,
      payslip_received: 0,
    }
    """
    return {
        "required": REQUIRED_DOC_TYPES,
        "received": [],
        "missing": REQUIRED_DOC_TYPES[:],
        "payslip_required": PAYSLIP_REQUIRED_COUNT,
        "payslip_received": 0,
    }


def recompute_checklist(db: Session, tenant_file: TenantFile) -> None:
    """
    Recalcule la checklist et le statut du dossier.

    Gère le cas spécial des fiches de paie (3 requises).
    Format de sortie :
    {
      "required": ["id", "payslip", "payslip", "payslip", "tax", "work_contract", "address_proof"],
      "received": ["id", "payslip", "payslip"],
      "missing": ["payslip", "tax", "work_contract", "address_proof"],
      "payslip_required": 3,
      "payslip_received": 2,
    }
    """
    all_links = tenant_file.document_links

    # Compte des fiches de paie reçues
    payslip_count = sum(
        1 for link in all_links
        if link.doc_type.value == TenantDocType.PAYSLIP.value
    )
    payslip_received = min(payslip_count, PAYSLIP_REQUIRED_COUNT)

    # Types uniques reçus (parmi ceux requis, hors payslip)
    unique_required = [
        TenantDocType.ID.value,
        TenantDocType.TAX.value,
        TenantDocType.WORK_CONTRACT.value,
        TenantDocType.ADDRESS_PROOF.value,
    ]
    received_unique = [
        dt for dt in unique_required
        if any(link.doc_type.value == dt for link in all_links)
    ]

    # Construction de la liste "received" (avec payslip répété N fois)
    received = received_unique + [TenantDocType.PAYSLIP.value] * payslip_received

    # Construction de la liste "missing"
    # On part de REQUIRED_DOC_TYPES et on enlève les reçus un par un
    missing = list(REQUIRED_DOC_TYPES)
    for r in received:
        if r in missing:
            missing.remove(r)

    checklist = {
        "required": REQUIRED_DOC_TYPES,
        "received": received,
        "missing": missing,
        "payslip_required": PAYSLIP_REQUIRED_COUNT,
        "payslip_received": payslip_received,
    }

    tenant_file.checklist_json = json.dumps(checklist)

    # ── Calcul statut ──────────────────────────────────────────────────────────
    if tenant_file.status == TenantFileStatus.VALIDATED:
        pass  # Ne pas rétrograder un dossier validé
    elif not missing:
        tenant_file.status = TenantFileStatus.TO_VALIDATE
    elif received:
        tenant_file.status = TenantFileStatus.INCOMPLETE
    else:
        tenant_file.status = TenantFileStatus.NEW

    db.commit()
    log.info(
        f"[tenant_service] Checklist recalculée dossier_id={tenant_file.id} "
        f"statut={tenant_file.status.value} "
        f"reçus={received} manquants={missing}"
    )