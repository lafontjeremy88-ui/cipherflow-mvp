# app/services/mistral_service.py
"""
Service Mistral AI - Remplacement RGPD-compliant de Gemini.
Endpoint EU : https://api.mistral.ai (données traitées en Europe)
"""

import asyncio
import base64
import logging
import random
from dataclasses import dataclass
from typing import Optional

from mistralai import Mistral

from app.core.config import settings

log = logging.getLogger(__name__)

# Client Mistral singleton
_client = None

# Paramètres de backoff pour les 429
_BACKOFF_ATTEMPTS = 3          # tentatives immédiates avant re-enqueue
_BACKOFF_BASE_DELAY = 2.0      # secondes (doublé à chaque retry : 2s, 4s, 8s)
_BACKOFF_JITTER_MAX = 1.0      # jitter aléatoire max en secondes


class MistralRateLimitError(Exception):
    """Levée quand Mistral répond 429 après tous les retries immédiats.
    Propagée jusqu'au worker RQ pour déclencher un re-enqueue avec délai."""
    pass


def _is_rate_limit(exc: Exception) -> bool:
    """Détecte les erreurs 429 / rate limit du SDK Mistral."""
    s = str(exc).lower()
    return "429" in s or "rate limit" in s or "too many requests" in s or "rate_limit" in s


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
    Appel générique à Mistral AI avec exponential backoff sur 429.

    Sur 429 : attend 2s, 4s, 8s (+ jitter) entre les tentatives.
    Après _BACKOFF_ATTEMPTS tentatives échouées, lève MistralRateLimitError
    pour que le worker RQ re-enqueue le job avec un délai.

    Args:
        prompt: Instructions textuelles
        image_bytes: Image optionnelle (pour vision)
        model: "mistral-small-latest" (défaut) ou "pixtral-12b-2409" (vision)

    Returns:
        MistralResponse avec le texte de réponse

    Raises:
        MistralRateLimitError: si le 429 persiste après tous les backoffs
    """
    client = _get_client()

    messages = []
    if image_bytes:
        b64_image = base64.b64encode(image_bytes).decode("utf-8")
        messages.append({
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": f"data:image/jpeg;base64,{b64_image}"},
            ],
        })
        if model == "mistral-small-latest":
            model = "pixtral-12b-2409"
    else:
        messages.append({"role": "user", "content": prompt})

    last_exc: Optional[Exception] = None

    for attempt in range(_BACKOFF_ATTEMPTS):
        try:
            response = client.chat.complete(model=model, messages=messages)
            text = response.choices[0].message.content.strip()
            log.info(f"[mistral] Réponse OK model={model} len={len(text)} attempt={attempt + 1}")
            return MistralResponse(text=text, success=True)

        except Exception as exc:
            if _is_rate_limit(exc):
                last_exc = exc
                if attempt < _BACKOFF_ATTEMPTS - 1:
                    delay = _BACKOFF_BASE_DELAY * (2 ** attempt) + random.uniform(0, _BACKOFF_JITTER_MAX)
                    log.warning(
                        f"[mistral] 429 rate limit (tentative {attempt + 1}/{_BACKOFF_ATTEMPTS}) "
                        f"model={model} — backoff {delay:.2f}s"
                    )
                    await asyncio.sleep(delay)
                    continue
                # Dernière tentative épuisée
                log.error(
                    f"[mistral] 429 persistant après {_BACKOFF_ATTEMPTS} tentatives "
                    f"model={model} — abandon, re-enqueue nécessaire"
                )
                raise MistralRateLimitError(
                    f"Mistral rate limit persistant après {_BACKOFF_ATTEMPTS} tentatives"
                ) from exc
            else:
                # Erreur non-429 : on ne re-tente pas, on retourne proprement
                log.error(f"[mistral] Erreur API (non-429) : {exc}")
                return MistralResponse(text="", success=False, error=str(exc))

    # Cas théoriquement inatteignable (boucle épuisée sans exception)
    return MistralResponse(text="", success=False, error=str(last_exc))