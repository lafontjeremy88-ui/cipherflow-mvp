# app/services/email_service.py

import json
import logging
from dataclasses import dataclass
from typing import Optional

from google import genai

from app.core.config import settings

log = logging.getLogger(__name__)

# ── Configuration Gemini ───────────────────────────────────────────────────────

_client = genai.Client(api_key=settings.GEMINI_API_KEY)
_MODEL = settings.GEMINI_MODEL


# ── Résultats typés ────────────────────────────────────────────────────────────

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

    raw = ""
    try:
        response = _client.models.generate_content(
            model=_MODEL,
            contents=[prompt],
        )
        raw = response.text.strip()
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
        log.error(f"[email_service] JSON invalide Gemini : {e} — raw={raw[:200]}")
        return EmailAnalysisResult(
            summary="Analyse IA indisponible (JSON invalide)",
            suggested_title=subject,
            raw_ai_text=raw,
        )
    except Exception as e:
        log.error(f"[email_service] Erreur Gemini : {e}")
        return EmailAnalysisResult(
            summary="Analyse IA indisponible",
            suggested_title=subject,
        )


# ── Génération de réponse ──────────────────────────────────────────────────────

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
) -> EmailReplyResult:

    tone_map = {
        "pro": "professionnel et courtois",
        "friendly": "chaleureux et accessible",
        "formal": "formel et soutenu",
    }
    tone_label = tone_map.get(tone, "professionnel et courtois")

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

Instructions :
- Réponds UNIQUEMENT avec le corps de l'email (pas de JSON, pas de markdown)
- Ne mets pas d'objet / subject
- Termine par : {signature}
- Si c'est un dossier locataire avec des documents, confirme la réception
- Si des documents manquent, rappelle lesquels (pièce d'identité, fiches de paie, avis d'imposition)
- Sois concis (5-8 lignes max)
"""

    try:
        response = _client.models.generate_content(
            model=_MODEL,
            contents=[prompt],
        )
        raw = response.text.strip()
        return EmailReplyResult(reply=raw, raw_ai_text=raw)

    except Exception as e:
        log.error(f"[email_service] Erreur génération réponse : {e}")
        return EmailReplyResult(
            reply=f"Bonjour,\n\nNous avons bien reçu votre email et reviendrons vers vous rapidement.\n\n{signature}"
        )