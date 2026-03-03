# app/google_oauth.py
"""
P2 : token JWT transmis via cookie HttpOnly + Secure
     au lieu d'un query param dans l'URL (évite la fuite dans les logs/historique).
P2+ : validation cryptographique du token ID Google avec google-auth
P2++ : endpoint d'échange sécurisé pour protéger contre XSS
P2+++ : cookie cross-domain avec SameSite=None pour Vercel → Railway
FIX : Création automatique du user et de l'agence si non existant
"""
import os
import re
import time
from datetime import datetime, timedelta
from typing import Optional

from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, HTTPException, Request, Depends
from fastapi.responses import RedirectResponse, JSONResponse
from jose import jwt
from sqlalchemy.orm import Session
from starlette.middleware.sessions import SessionMiddleware
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

from app.core.config import settings
from app.database.database import get_db
from app.database.models import Agency, User, UserRole
from app.utils.settings_factory import create_default_settings_for_agency

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


def get_or_create_user_from_google(
    db: Session,
    email: str,
    google_sub: str,
    name: Optional[str] = None,
) -> User:
    """
    🔧 FIX : Cherche ou crée l'utilisateur depuis Google OAuth.
    
    Si l'utilisateur existe → le retourne
    Si l'utilisateur n'existe pas → crée user + agence automatiquement
    
    Args:
        db: Session de base de données
        email: Email Google vérifié
        google_sub: Google subject ID (identifiant unique)
        name: Nom complet de l'utilisateur (optionnel)
    
    Returns:
        User: L'utilisateur existant ou nouvellement créé
    """
    # 1. Chercher l'utilisateur existant
    user = db.query(User).filter(User.email == email).first()
    
    if user:
        print(f"✅ Utilisateur existant trouvé: {email} (user_id={user.id})")
        return user
    
    # 2. Créer une nouvelle agence pour ce nouvel utilisateur
    print(f"🆕 Création d'un nouveau compte pour {email}")
    
    # Nom de l'agence basé sur l'email
    agency_name = f"Agence de {email.split('@')[0]}"
    
    # Alias unique pour l'agence
    clean_alias = re.sub(r"[^a-zA-Z0-9]", "", email.split("@")[0]).lower()
    
    # Vérifier l'unicité de l'alias
    if db.query(Agency).filter(Agency.email_alias == clean_alias).first():
        clean_alias = f"{clean_alias}{int(time.time())}"
    
    # Vérifier l'unicité du nom
    if db.query(Agency).filter(Agency.name == agency_name).first():
        agency_name = f"{agency_name} ({int(time.time())})"
    
    # Créer l'agence
    new_agency = Agency(
        name=agency_name,
        email_alias=clean_alias,
    )
    db.add(new_agency)
    db.commit()
    db.refresh(new_agency)
    print(f"✅ Agence créée: {agency_name} (agency_id={new_agency.id})")
    
    # 3. Créer l'utilisateur
    # Extraire prénom/nom depuis le name Google si disponible
    first_name = ""
    last_name = ""
    if name:
        parts = name.split(" ", 1)
        first_name = parts[0] if len(parts) > 0 else ""
        last_name = parts[1] if len(parts) > 1 else ""
    
    new_user = User(
        email=email,
        hashed_password=None,  # Pas de mot de passe pour les comptes Google OAuth
        agency_id=new_agency.id,
        role=UserRole.AGENCY_ADMIN,
        email_verified=True,  # Google a déjà vérifié l'email
        first_name=first_name,
        last_name=last_name,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    print(f"✅ Utilisateur créé: {email} (user_id={new_user.id})")
    
    # 4. Créer les settings par défaut pour l'agence
    try:
        create_default_settings_for_agency(db, new_agency)
        print(f"✅ Settings créés pour agency_id={new_agency.id}")
    except Exception as e:
        print(f"⚠️ Erreur création settings (non bloquant): {e}")
    
    return new_user


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
async def google_callback(request: Request, db: Session = Depends(get_db)):
    """
    Callback OAuth Google - VERSION SÉCURISÉE + FIX CRÉATION USER
    
    Modifications :
    1. Récupère le token depuis Google via Authlib
    2. VALIDE CRYPTOGRAPHIQUEMENT le token ID avec google-auth
    3. 🔧 FIX : Cherche ou crée l'utilisateur dans la base de données
    4. Crée un JWT CipherFlow uniquement si la validation réussit
    5. Retourne le token dans un cookie HttpOnly sécurisé
    """
    try:
        # Étape 1: Récupération du token OAuth via Authlib
        token_response = await oauth.google.authorize_access_token(request)
        
        # Étape 2: VALIDATION CRYPTOGRAPHIQUE SÉCURISÉE du token ID
        id_token_str = token_response.get("id_token")
        if not id_token_str:
            raise HTTPException(status_code=400, detail="ID token manquant dans la réponse Google")
        
        # Validation complète : signature, audience, issuer, expiration
        try:
            userinfo = verify_google_id_token(id_token_str)
        except ValueError as e:
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
        ALLOWED_EMAILS = [
            'lafontjeremy88@gmail.com',
            'zamithdoriane@gmail.com',
            'cipherflow.service@gmail.com',
        ]
        
        ALLOWED_DOMAINS = []
        
        domain = email.split('@')[1] if '@' in email else ''
        
        if email not in ALLOWED_EMAILS and domain not in ALLOWED_DOMAINS:
            print(f"🚫 Accès refusé pour {email} (domaine: {domain})")
            raise HTTPException(
                status_code=403, 
                detail="Accès refusé. CipherFlow est actuellement en beta privée. "
                       "Contactez l'équipe CipherFlow pour obtenir un accès."
            )
        
        print(f"✅ Accès autorisé pour {email}")

        # 🔧 FIX : Étape 5 - CHERCHER OU CRÉER L'UTILISATEUR DANS LA BDD
        user = get_or_create_user_from_google(
            db=db,
            email=email,
            google_sub=sub,
            name=name,
        )
        
        print(f"✅ Utilisateur authentifié: {user.email} (user_id={user.id}, agency_id={user.agency_id})")

        # Étape 6: Création du JWT CipherFlow
        cf_token = create_jwt(email=email, sub=sub, name=name, picture=picture)

        # Étape 7: Cookie cross-domain avec SameSite=None
        redirect_url = f"{FRONTEND_URL}/oauth/callback"
        response = RedirectResponse(url=redirect_url, status_code=302)
        response.set_cookie(
            key="oauth_token",
            value=cf_token,
            httponly=True,
            secure=True,
            samesite="none",
            max_age=120,
            path="/",
        )
        return response

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Erreur OAuth callback: {str(e)}")
        import traceback
        traceback.print_exc()
        return RedirectResponse(url=f"{FRONTEND_URL}/?oauth_error=1", status_code=302)


@router.get("/exchange-token")
async def exchange_token(request: Request):
    """
    Endpoint sécurisé d'échange de cookie HttpOnly contre un token JSON.
    """
    token = request.cookies.get("oauth_token")
    
    if not token:
        print("⚠️ exchange-token: Aucun cookie oauth_token trouvé")
        raise HTTPException(
            status_code=401, 
            detail="No OAuth token found. Please authenticate again."
        )
    
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=["HS256"])
        email = payload.get("email")
    except Exception as e:
        print(f"⚠️ exchange-token: Erreur décodage JWT: {e}")
        email = None
    
    response = JSONResponse({
        "token": token,
        "email": email,
        "message": "Token échangé avec succès"
    })
    
    response.delete_cookie(
        key="oauth_token",
        path="/",
        samesite="none",
        secure=True,
    )
    
    print(f"🔄 Token échangé pour {email}")
    
    return response