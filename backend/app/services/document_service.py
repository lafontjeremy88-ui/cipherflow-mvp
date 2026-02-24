# app/services/document_service.py

import base64
import json
import logging
from dataclasses import dataclass
from typing import Optional

from google import genai
from google.genai import types

from app.core.config import settings
from app.database.models import TenantDocType, DocQuality

log = logging.getLogger(__name__)

_client = genai.Client(api_key=settings.GEMINI_API_KEY)
_MODEL = settings.GEMINI_MODEL

SUPPORTED_MIME_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
}


@dataclass
class DocumentAnalysisResult:
    doc_type: str = TenantDocType.OTHER.value
    quality: str = DocQuality.OK.value
    summary: str = ""
    extracted_date: str = ""
    amount: str = ""
    candidate_name: Optional[str] = None
    raw_ai_text: str = ""
    success: bool = True
    error: Optional[str] = None


async def analyze_document(
    file_bytes: bytes,
    filename: str,
    content_type: str = "application/pdf",
) -> DocumentAnalysisResult:

    mime = content_type.lower()
    if mime not in SUPPORTED_MIME_TYPES:
        log.warning(f"[document_service] Type non supporté : {mime} ({filename})")
        return DocumentAnalysisResult(
            summary=f"Format non supporté : {mime}",
            success=False,
            error=f"MIME type {mime} not supported",
        )

    # Indice basé sur le nom de fichier pour aider Gemini
    filename_lower = filename.lower()
    filename_hint = ""
    if any(k in filename_lower for k in ["cni", "carte", "identite", "identity", "passeport", "passport", "sejour", "titre"]):
        filename_hint = "INDICE IMPORTANT : Le nom du fichier indique une pièce d'identité (CNI/passeport/titre de séjour). Utilise doc_type=id sauf contradiction évidente.\n"
    elif any(k in filename_lower for k in ["paie", "salaire", "payslip", "bulletin", "fiche"]):
        filename_hint = "INDICE IMPORTANT : Le nom du fichier indique un bulletin de salaire. Utilise doc_type=payslip sauf contradiction évidente.\n"
    elif any(k in filename_lower for k in ["impot", "tax", "fiscal", "avis", "dgfip"]):
        filename_hint = "INDICE IMPORTANT : Le nom du fichier indique un avis d'imposition. Utilise doc_type=tax sauf contradiction évidente.\n"
    elif any(k in filename_lower for k in ["contrat", "contract", "travail", "embauche", "cdi", "cdd"]):
        filename_hint = "INDICE IMPORTANT : Le nom du fichier indique un contrat de travail. Utilise doc_type=work_contract sauf contradiction évidente.\n"
    elif any(k in filename_lower for k in ["rib", "releve", "bancaire", "bank", "iban"]):
        filename_hint = "INDICE IMPORTANT : Le nom du fichier indique un document bancaire. Utilise doc_type=bank sauf contradiction évidente.\n"

    prompt = (
        "Tu es un assistant IA spécialisé dans l'analyse de documents immobiliers.\n"
        "Analyse ce document et réponds UNIQUEMENT en JSON valide, sans markdown.\n"
        + filename_hint +
        """
Réponds avec ce JSON exact :
{
  "doc_type": "id | payslip | tax | work_contract | bank | other",
  "quality": "ok | unclear | invalid",
  "summary": "Description courte du document (2-3 phrases)",
  "extracted_date": "Date du document au format YYYY-MM ou YYYY-MM-DD si trouvée, sinon vide",
  "amount": "Montant principal en euros si présent (ex: 2500), sinon vide",
  "candidate_name": "Prénom Nom du titulaire du document si détecté, sinon null"
}

Règles doc_type (sois généreux dans la classification) :
- id : carte nationale d'identité (CNI), passeport, titre de séjour, permis de conduire avec photo
- payslip : bulletin de salaire, fiche de paie, attestation de salaire
- tax : avis d'imposition, déclaration de revenus, avis de non-imposition
- work_contract : contrat de travail, promesse d'embauche, attestation employeur, CDI, CDD
- bank : RIB, relevé bancaire, IBAN
- other : tout le reste

En cas de doute, privilégie toujours la catégorie la plus spécifique plutôt que 'other'.
"""
    )

    raw = ""
    try:
        b64 = base64.b64encode(file_bytes).decode("utf-8")

        response = _client.models.generate_content(
            model=_MODEL,
            contents=[
                types.Part.from_bytes(data=file_bytes, mime_type=mime),
                prompt,
            ],
        )

        raw = response.text.strip()
        clean = raw.replace("```json", "").replace("```", "").strip()
        data = json.loads(clean)

        valid_types = {e.value for e in TenantDocType}
        doc_type = data.get("doc_type", "other")
        if doc_type not in valid_types:
            doc_type = TenantDocType.OTHER.value

        valid_qualities = {e.value for e in DocQuality}
        quality = data.get("quality", "ok")
        if quality not in valid_qualities:
            quality = DocQuality.OK.value

        return DocumentAnalysisResult(
            doc_type=doc_type,
            quality=quality,
            summary=data.get("summary", ""),
            extracted_date=data.get("extracted_date", ""),
            amount=str(data.get("amount", "")),
            candidate_name=data.get("candidate_name"),
            raw_ai_text=raw,
            success=True,
        )

    except json.JSONDecodeError as e:
        log.error(f"[document_service] JSON invalide : {e} ({filename})")
        return DocumentAnalysisResult(
            summary="Analyse indisponible (réponse IA invalide)",
            success=False,
            error=str(e),
        )
    except Exception as e:
        log.error(f"[document_service] Erreur Gemini ({filename}) : {e}")
        return DocumentAnalysisResult(
            summary="Analyse indisponible",
            success=False,
            error=str(e),
        )