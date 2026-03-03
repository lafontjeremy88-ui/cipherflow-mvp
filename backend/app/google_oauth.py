# app/google_oauth.py
"""
P2 : token JWT transmis via cookie HttpOnly + Secure
     au lieu d'un query param dans l'URL (évite la fuite dans les logs/historique).
P2+ : validation cryptographique du token ID Google avec google-auth
"""
import os
from datetime import datetime, timedelta
from typing import Optional

from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse
from jose import jwt
from starlette.middleware.sessions import SessionMiddleware
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

from app.core.config import settings

router = APIRouter(prefix="/auth/google", tags=["auth-google"])

GOOGLE_OAUTH_CLIENT_ID = os.getenv("GOOGLE_OAUTH_CLIENT_ID", "")
GOOGLE_OAUTH_CLIENT_SECRET = os.getenv("GOOGLE_OAUTH_CLIENT_SECRET", "")
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://cipherflow-mvp.vercel.app").rstrip("/")

SCOPES = "openid email profile"
IS_PROD = settings.ENV in ("prod", "production")

oauth = OAuth()
oauth.register(
    name="google",
    client_id=GOOGLE_OAUTH_CLIENT_ID,
    client_secret=GOOGLE_OAUTH_CLIENT_SECRET,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": SCOPES},
)


def attach_oauth(app):
    app.add_middleware(
        SessionMiddleware,
        secret_key=settings.OAUTH_STATE_SECRET,
        same_site="lax",
        https_only=IS_PROD,
    )


def verify_google_id_token(token_string: str) -> dict:
    """
    VALIDATION CRYPTOGRAPHIQUE SÉCURISÉE du token ID Google.
    
    Vérifie:
    - Signature cryptographique (que c'est vraiment Google qui a signé)
    - Audience (que le token est bien pour notre client_id)
    - Issuer (que ça vient bien de accounts.google.com)
    - Expiration (que le token n'est pas expiré)
    
    Sans cette validation, quelqu'un pourrait créer un faux token
    et prétendre être n'importe qui.
    
    Returns:
        dict: Claims validés du token (email, sub, name, picture)
    Raises:
        ValueError: Si le token est invalide ou falsifié
    """
    try:
        # Validation complète avec la librairie officielle Google
        idinfo = id_token.verify_oauth2_token(
            token_string,
            google_requests.Request(),
            GOOGLE_OAUTH_CLIENT_ID
        )

        # Vérifications supplémentaires de sécurité
        if idinfo['iss'] not in ['accounts.google.com', 'https://accounts.google.com']:
            raise ValueError('Wrong issuer - le token ne vient pas de Google')
        
        if idinfo['aud'] != GOOGLE_OAUTH_CLIENT_ID:
            raise ValueError('Wrong audience - le token est pour une autre application')

        return idinfo

    except ValueError as e:
        raise ValueError(f"Token Google invalide: {str(e)}")


def create_jwt(
    email: str,
    sub: str,
    name: Optional[str] = None,
    picture: Optional[str] = None,
) -> str:
    """Utilise settings.JWT_SECRET_KEY — source unique de vérité."""
    if not settings.JWT_SECRET_KEY:
        raise RuntimeError("JWT_SECRET_KEY manquant côté backend")

    now = datetime.utcnow()
    payload = {
        "sub": sub,
        "email": email,
        "name": name,
        "picture": picture,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=7)).timestamp()),
        "iss": "cipherflow",
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm="HS256")


@router.get("/login")
async def google_login(request: Request):
    backend_base = str(request.base_url).rstrip("/")
    redirect_uri = f"{backend_base}/auth/google/callback"
    return await oauth.google.authorize_redirect(request, redirect_uri)


@router.get("/callback")
async def google_callback(request: Request):
    """
    Callback OAuth Google - VERSION SÉCURISÉE
    
    Modifications P2+ :
    1. Récupère le token depuis Google via Authlib
    2. VALIDE CRYPTOGRAPHIQUEMENT le token ID avec google-auth
    3. Crée un JWT CipherFlow uniquement si la validation réussit
    4. Retourne le token dans un cookie HttpOnly sécurisé
    """
    try:
        # Étape 1: Récupération du token OAuth via Authlib
        token_response = await oauth.google.authorize_access_token(request)
        
        # Étape 2: VALIDATION CRYPTOGRAPHIQUE SÉCURISÉE du token ID
        # C'est ici qu'on vérifie que le token vient VRAIMENT de Google
        id_token_str = token_response.get("id_token")
        if not id_token_str:
            raise HTTPException(status_code=400, detail="ID token manquant dans la réponse Google")
        
        # Validation complète : signature, audience, issuer, expiration
        try:
            userinfo = verify_google_id_token(id_token_str)
        except ValueError as e:
            # Token invalide - quelqu'un essaie peut-être de nous tromper
            print(f"⚠️ TENTATIVE D'AUTHENTIFICATION AVEC TOKEN INVALIDE: {str(e)}")
            raise HTTPException(status_code=401, detail=f"Token Google invalide: {str(e)}")

        # Étape 3: Extraction des infos utilisateur VALIDÉES
        email = userinfo.get("email")
        sub = userinfo.get("sub")
        name = userinfo.get("name")
        picture = userinfo.get("picture")

        if not email or not sub:
            raise HTTPException(status_code=400, detail="Google userinfo incomplet")

      # Étape 4: RESTRICTION D'ACCÈS BETA - Liste blanche d'emails/domaines
        # ── Personnalisez cette liste avec vos beta testeurs ──────────────────

        # Liste des emails autorisés individuellement
        ALLOWED_EMAILS = [
            'lafontjeremy88@gmail.com',  # Votre email admin
            'zamithdoriane@gmail.com'
            'cipherflow.service@gmail.com',   # L'email de test
            # Ajoutez ici les emails de vos beta testeurs :
            # 'testeur1@gmail.com',
            # 'marie@example.com',
]
        # Étape 5: Création du JWT CipherFlow
        cf_token = create_jwt(email=email, sub=sub, name=name, picture=picture)

        # Étape 6: Retour avec cookie sécurisé HttpOnly
        redirect_url = f"{FRONTEND_URL}/oauth/callback"
        response = RedirectResponse(url=redirect_url, status_code=302)
        response.set_cookie(
            key="oauth_token",
            value=cf_token,
            httponly=True,  # JavaScript ne peut pas lire ce cookie (protection XSS)
            secure=IS_PROD,  # Envoyé uniquement en HTTPS en production
            samesite="lax",
            max_age=120,    # 2 minutes pour lire le cookie puis il expire
            domain=None,
        )
        return response

    except HTTPException:
        # Re-raise les HTTPException (erreurs de validation)
        raise
    except Exception as e:
        # Toute autre erreur → redirection vers frontend avec erreur
        print(f"❌ Erreur OAuth callback: {str(e)}")
        return RedirectResponse(url=f"{FRONTEND_URL}/?oauth_error=1", status_code=302)