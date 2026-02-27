# app/services/document_service.py

import io
import json
import logging
from dataclasses import dataclass
from typing import Optional

from app.core.config import settings
from app.database.models import TenantDocType, DocQuality
from app.services.mistral_service import analyze_with_mistral

log = logging.getLogger(__name__)

SUPPORTED_MIME_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
}

_EXT_TO_MIME = {
    ".pdf":  "application/pdf",
    ".jpg":  "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png":  "image/png",
    ".webp": "image/webp",
    ".heic": "image/heic",
    ".heif": "image/heif",
}


def _resolve_mime(content_type: str, filename: str) -> str:
    mime = (content_type or "").lower().strip()
    if mime not in ("application/octet-stream", "application/binary",
                    "binary/octet-stream", ""):
        return mime
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    resolved = _EXT_TO_MIME.get(ext)
    if resolved:
        log.info(
            f"[document_service] MIME générique ({content_type!r}) → "
            f"résolu en {resolved!r} via extension ({filename})"
        )
        return resolved
    return mime


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

    mime = _resolve_mime(content_type, filename)

    if mime not in SUPPORTED_MIME_TYPES:
        log.warning(f"[document_service] Type non supporté : {mime} ({filename})")
        return DocumentAnalysisResult(
            summary=f"Format non supporté : {mime}",
            success=False,
            error=f"MIME type {mime} not supported",
        )

    prompt = """
Tu es un assistant IA spécialisé dans l'analyse de documents immobiliers.
Analyse ce document et réponds UNIQUEMENT en JSON valide, sans markdown.

Réponds avec ce JSON exact :
{
  "doc_type": "id | payslip | tax | work_contract | address_proof | bank | other",
  "quality": "ok | unclear | invalid",
  "summary": "Description courte du document (2-3 phrases)",
  "extracted_date": "Date du document au format YYYY-MM ou YYYY-MM-DD si trouvée, sinon vide",
  "amount": "Montant principal en euros si présent (ex: 2500), sinon vide",
  "candidate_name": "Prénom Nom du titulaire du document si détecté, sinon null"
}

Règles doc_type :
- id : carte d'identité, passeport, titre de séjour
- payslip : bulletin de salaire, fiche de paie
- tax : avis d'imposition, déclaration de revenus
- work_contract : contrat de travail, promesse d'embauche, attestation employeur
- address_proof : justificatif de domicile (quittance de loyer, facture EDF/eau/gaz/téléphone, attestation d'hébergement)
- bank : RIB, relevé bancaire, relevé de compte
- other : tout le reste (photo, dessin, document non reconnu, facture commerciale, etc.)
"""

    def _reencode_image(data_bytes: bytes) -> tuple[bytes, str]:
        """Re-encode l'image via PIL pour réparer les fichiers corrompus."""
        from PIL import Image

        header = data_bytes[:12].hex() if len(data_bytes) >= 12 else data_bytes.hex()
        log.info(f"[document_service] Diagnostic image header ({filename}): {header}")

        buf_in = io.BytesIO(data_bytes)

        # Tentative 1 : PIL standard
        try:
            buf_in.seek(0)
            img = Image.open(buf_in).convert("RGB")
            img.thumbnail((2048, 2048), Image.LANCZOS)
            buf_out = io.BytesIO()
            img.save(buf_out, format="PNG", optimize=True)
            buf_out.seek(0)
            log.info(f"[document_service] PIL standard OK pour {filename}")
            return buf_out.getvalue(), "image/png"
        except Exception as pil_err:
            log.warning(f"[document_service] PIL standard échoué ({filename}): {pil_err}")

        # Tentative 2 : pillow-heif pour HEIC/HEIF
        try:
            import pillow_heif
            pillow_heif.register_heif_opener()
            buf_in.seek(0)
            img = Image.open(buf_in).convert("RGB")
            img.thumbnail((2048, 2048), Image.LANCZOS)
            buf_out = io.BytesIO()
            img.save(buf_out, format="PNG", optimize=True)
            buf_out.seek(0)
            log.info(f"[document_service] PIL HEIF OK pour {filename}")
            return buf_out.getvalue(), "image/png"
        except ImportError:
            log.warning(f"[document_service] pillow-heif non installé")
        except Exception as heif_err:
            log.warning(f"[document_service] PIL HEIF échoué ({filename}): {heif_err}")

        log.warning(f"[document_service] Toutes tentatives PIL échouées pour {filename}")
        return data_bytes, mime

    def _parse_response(raw: str) -> DocumentAnalysisResult:
        """Parse le JSON Mistral."""
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

    # ── Appel Mistral ──────────────────────────────────────────────────────────
    
    # Pour les PDFs : Mistral Small (texte)
    # Pour les images : Pixtral (vision)
    model = "mistral-small-latest"
    image_data = None
    
    if mime.startswith("image/"):
        model = "pixtral-12b-2409"
        image_data = file_bytes
    
    try:
        result = await analyze_with_mistral(
            prompt=prompt,
            image_bytes=image_data,
            model=model,
        )
        
        if not result.success:
            raise Exception(result.error)
        
        return _parse_response(result.text)

    except Exception as first_err:
        err_str = str(first_err)
        is_image = mime.startswith("image/")

        # Retry : re-encodage PIL si image corrompue
        if is_image:
            log.warning(
                f"[document_service] Erreur sur {filename}, "
                f"tentative re-encodage PIL…"
            )
            try:
                clean_bytes, _ = _reencode_image(file_bytes)
                result = await analyze_with_mistral(
                    prompt=prompt,
                    image_bytes=clean_bytes,
                    model="pixtral-12b-2409",
                )
                if result.success:
                    log.info(f"[document_service] Re-encodage PIL réussi pour {filename}")
                    return _parse_response(result.text)
                else:
                    raise Exception(result.error)
            except json.JSONDecodeError as je:
                log.error(f"[document_service] JSON invalide après retry : {je}")
                return DocumentAnalysisResult(
                    summary="Analyse indisponible (réponse IA invalide)",
                    success=False,
                    error=str(je),
                )
            except Exception as retry_err:
                log.error(f"[document_service] Erreur après retry PIL : {retry_err}")
                return DocumentAnalysisResult(
                    summary="L'analyse de la pièce jointe n'est pas disponible.",
                    success=False,
                    error=str(retry_err),
                )

        if isinstance(first_err, json.JSONDecodeError):
            log.error(f"[document_service] JSON invalide : {first_err}")
            return DocumentAnalysisResult(
                summary="Analyse indisponible (réponse IA invalide)",
                success=False,
                error=str(first_err),
            )

        log.error(f"[document_service] Erreur Mistral : {first_err}")
        return DocumentAnalysisResult(
            summary="Analyse indisponible",
            success=False,
            error=str(first_err),
        )