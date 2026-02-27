# app/services/mistral_service.py
"""
Service Mistral AI - Remplacement RGPD-compliant de Gemini.
Endpoint EU : https://api.mistral.ai (données traitées en Europe)
"""

import base64
import json
import logging
from dataclasses import dataclass
from typing import Optional

from mistralai import Mistral

from app.core.config import settings

log = logging.getLogger(__name__)

# Client Mistral singleton
_client = None


def _get_client() -> Mistral:
    global _client
    if _client is None:
        if not settings.MISTRAL_API_KEY:
            raise RuntimeError("MISTRAL_API_KEY manquant")
        _client = Mistral(api_key=settings.MISTRAL_API_KEY)
    return _client


@dataclass
class MistralResponse:
    text: str
    success: bool = True
    error: Optional[str] = None


async def analyze_with_mistral(
    prompt: str,
    image_bytes: Optional[bytes] = None,
    model: str = "mistral-small-latest",
) -> MistralResponse:
    """
    Appel générique à Mistral AI.
    
    Args:
        prompt: Instructions textuelles
        image_bytes: Image optionnelle (pour vision)
        model: "mistral-small-latest" (défaut) ou "pixtral-12b-2409" (vision)
    
    Returns:
        MistralResponse avec le texte de réponse
    """
    try:
        client = _get_client()
        
        messages = []
        
        if image_bytes:
            # Vision : encode l'image en base64
            b64_image = base64.b64encode(image_bytes).decode('utf-8')
            messages.append({
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": f"data:image/jpeg;base64,{b64_image}"
                    }
                ]
            })
            # Force le modèle vision si une image est fournie
            if model == "mistral-small-latest":
                model = "pixtral-12b-2409"
        else:
            # Texte seulement
            messages.append({
                "role": "user",
                "content": prompt
            })
        
        response = client.chat.complete(
            model=model,
            messages=messages,
        )
        
        text = response.choices[0].message.content.strip()
        log.info(f"[mistral] Réponse OK model={model} len={len(text)}")
        
        return MistralResponse(text=text, success=True)
        
    except Exception as e:
        log.error(f"[mistral] Erreur API : {e}")
        return MistralResponse(
            text="",
            success=False,
            error=str(e)
        )