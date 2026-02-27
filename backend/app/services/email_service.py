# app/services/email_service.py

import json
import logging
from dataclasses import dataclass
from typing import Optional, List

from app.core.config import settings
from app.services.mistral_service import analyze_with_mistral

log = logging.getLogger(__name__)


@dataclass
class EmailAnalysisResult:
    category: str = "autre"
    urgency: str = "normal"
    is_devis: bool = False
    summary: str = ""
    suggested_title: str = ""
    raw_ai_text: str = ""
    candidate_name: Optional[str] = None


@dataclass
class EmailReplyResult:
    reply: str = ""
    raw_ai_text: str = ""


# ── Analyse email ──────────────────────────────────────────────────────────────

async def analyze_email(
    from_email: str,
    subject: str,
    content: str,
    company_name: str = "Agence",
    attachment_summary: str = "",
) -> EmailAnalysisResult:

    attachments_block = (
        f"\n\nPièces jointes reçues :\n{attachment_summary}"
        if attachment_summary else ""
    )

    prompt = f"""
Tu es un assistant IA pour une agence immobilière nommée "{company_name}".
Analyse cet email et réponds UNIQUEMENT en JSON valide, sans markdown.

Email reçu :
- De : {from_email}
- Sujet : {subject}
- Contenu : {content}{attachments_block}

Réponds avec ce JSON exact :
{{
  "category": "dossier_locataire | devis | reclamation | information | autre",
  "urgency": "urgent | normal | faible",
  "is_devis": false,
  "summary": "Résumé en 2-3 phrases",
  "suggested_title": "Titre court pour l'interface",
  "candidate_name": "Prénom Nom du candidat si détecté, sinon null"
}}

Règles :
- category = "dossier_locataire" si l'email concerne une candidature locative ou envoie des documents
- is_devis = true uniquement si c'est une demande de devis commerciale
- candidate_name : cherche le nom dans la signature ou le contenu
"""

    try:
        result = await analyze_with_mistral(
            prompt=prompt,
            model="mistral-small-latest",
        )
        
        if not result.success:
            raise Exception(result.error)
        
        raw = result.text
        clean = raw.replace("```json", "").replace("```", "").strip()
        data = json.loads(clean)

        return EmailAnalysisResult(
            category=data.get("category", "autre"),
            urgency=data.get("urgency", "normal"),
            is_devis=bool(data.get("is_devis", False)),
            summary=data.get("summary", ""),
            suggested_title=data.get("suggested_title", subject),
            candidate_name=data.get("candidate_name"),
            raw_ai_text=raw,
        )

    except json.JSONDecodeError as e:
        log.error(f"[email_service] JSON invalide Mistral : {e}")
        return EmailAnalysisResult(
            summary="Analyse IA indisponible (JSON invalide)",
            suggested_title=subject,
            raw_ai_text="",
        )
    except Exception as e:
        log.error(f"[email_service] Erreur Mistral : {e}")
        return EmailAnalysisResult(
            summary="Analyse IA indisponible",
            suggested_title=subject,
        )


# ── Génération de réponse ──────────────────────────────────────────────────────

_DOC_LABELS = {
    "id": "pièce d'identité",
    "payslip": "fiche de paie",
    "tax": "avis d'imposition",
    "work_contract": "contrat de travail",
    "address_proof": "justificatif de domicile",
    "bank": "RIB",
}


async def generate_reply(
    from_email: str,
    subject: str,
    content: str,
    summary: str,
    category: str,
    urgency: str,
    company_name: str = "Agence",
    tone: str = "pro",
    signature: str = "L'équipe",
    received_docs: Optional[List[str]] = None,
    missing_docs: Optional[List[str]] = None,
    payslip_required: int = 3,
    payslip_received: int = 0,
) -> EmailReplyResult:

    tone_map = {
        "pro": "professionnel et courtois",
        "friendly": "chaleureux et accessible",
        "formal": "formel et soutenu",
    }
    tone_label = tone_map.get(tone, "professionnel et courtois")

    dossier_block = ""
    if category == "dossier_locataire":
        received_docs = received_docs or []
        missing_docs = missing_docs or []

        def _summarize_received(docs: List[str], ps_received: int, ps_required: int) -> str:
            counts: dict = {}
            for d in docs:
                counts[d] = counts.get(d, 0) + 1
            parts = []
            for doc_type, count in counts.items():
                label = _DOC_LABELS.get(doc_type, doc_type)
                if doc_type == "payslip":
                    parts.append(f"{count}/{ps_required} fiche(s) de paie")
                else:
                    parts.append(label)
            return ", ".join(parts) if parts else "aucun"

        def _summarize_missing(docs: List[str], ps_missing_count: int) -> str:
            unique_missing = []
            seen = set()
            for d in docs:
                if d not in seen:
                    seen.add(d)
                    if d == "payslip":
                        unique_missing.append(f"{ps_missing_count} fiche(s) de paie manquante(s)")
                    else:
                        unique_missing.append(_DOC_LABELS.get(d, d))
            return ", ".join(unique_missing) if unique_missing else "aucun"

        payslip_missing_count = payslip_required - payslip_received

        if not missing_docs:
            received_str = _summarize_received(received_docs, payslip_received, payslip_required)
            dossier_block = (
                f"\nContexte du dossier locataire :\n"
                f"Le dossier est COMPLET. Documents reçus : {received_str}.\n\n"
                f"Rédige un email naturel et fluide (3 paragraphes) qui :\n"
                f"1. Remercie chaleureusement pour l'envoi et confirme que le dossier est complet\n"
                f"2. Mentionne naturellement dans une phrase les documents reçus ({received_str})\n"
                f"3. Indique que l'agence va étudier le dossier et reviendra sous peu\n"
                f"N'écris AUCUN label technique (pas de 'STATUT', 'DOCUMENTS REÇUS', etc.)."
            )
        elif received_docs:
            received_str = _summarize_received(received_docs, payslip_received, payslip_required)
            missing_str = _summarize_missing(missing_docs, payslip_missing_count)
            dossier_block = (
                f"\nContexte du dossier locataire :\n"
                f"Documents déjà reçus : {received_str}.\n"
                f"Documents encore manquants : {missing_str}.\n\n"
                f"Rédige un email naturel et fluide (3 paragraphes) qui :\n"
                f"1. Remercie pour les documents envoyés et confirme leur bonne réception\n"
                f"2. Mentionne naturellement les documents reçus ({received_str})\n"
                f"3. Explique poliment qu'il manque encore {missing_str} pour compléter le dossier, "
                f"et demande de les envoyer dès que possible\n"
                f"N'écris AUCUN label technique (pas de 'STATUT', 'DOCUMENTS REÇUS', etc.).\n"
                f"NE redemande PAS les documents déjà reçus."
            )
        else:
            all_labels = (
                "une pièce d'identité, 3 fiches de paie, "
                "un avis d'imposition, un contrat de travail "
                "et un justificatif de domicile"
            )
            dossier_block = (
                f"\nContexte du dossier locataire :\n"
                f"Aucun document valide n'a été reçu pour ce dossier.\n\n"
                f"Rédige un email naturel et fluide (3 paragraphes) qui :\n"
                f"1. Accuse réception de l'email\n"
                f"2. Explique poliment qu'aucun document valide n'a pu être traité\n"
                f"3. Demande d'envoyer les pièces nécessaires : {all_labels}\n"
                f"N'écris AUCUN label technique (pas de 'STATUT', 'DOCUMENTS REÇUS', etc.)."
            )

    prompt = f"""
Tu es l'assistant de "{company_name}", une agence immobilière.
Rédige une réponse email en français, ton {tone_label}.

Contexte de l'email reçu :
- De : {from_email}
- Sujet : {subject}
- Catégorie : {category}
- Urgence : {urgency}
- Résumé : {summary}
- Contenu original : {content[:1000]}
{dossier_block}

Instructions générales :
- Réponds UNIQUEMENT avec le corps de l'email (pas de JSON, pas de markdown, pas de labels techniques)
- Ne mets pas d'objet / subject
- Termine par : {signature}
- Style naturel et fluide, en paragraphes, sans listes à puces
- 3 paragraphes maximum
- Si un contexte de dossier est fourni ci-dessus, suis-le à la lettre sans en reprendre les labels
"""

    try:
        result = await analyze_with_mistral(
            prompt=prompt,
            model="mistral-small-latest",
        )
        
        if not result.success:
            raise Exception(result.error)
        
        return EmailReplyResult(reply=result.text, raw_ai_text=result.text)

    except Exception as e:
        log.error(f"[email_service] Erreur génération réponse : {e}")
        return EmailReplyResult(
            reply=(
                f"Bonjour,\n\nNous avons bien reçu votre email et reviendrons "
                f"vers vous rapidement.\n\n{signature}"
            )
        )