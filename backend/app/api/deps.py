# app/api/deps.py
"""
Dépendances FastAPI partagées entre tous les routers.
Import unique ici, pas de duplication dans chaque fichier.
"""

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.database import get_db
from app.database.models import User
from app.security import get_current_user as get_current_user_token


async def get_current_user_db(
    token_payload: dict = Depends(get_current_user_token),
    db: Session = Depends(get_db),
) -> User:
    """
    Résout le token JWT → User en base.
    Utilisé comme dépendance dans toutes les routes protégées.
    
    FIX : Cherche d'abord 'email', puis 'sub' pour compatibilité avec :
    - JWT Google OAuth : {"sub": google_id, "email": "user@gmail.com"}
    - JWT classique : {"sub": "user@email.com"}
    """
    # Essayer d'abord 'email' (Google OAuth), puis 'sub' (JWT classique)
    email = token_payload.get("email") or token_payload.get("sub")
    
    if not email:
        raise HTTPException(status_code=401, detail="Token invalide")

    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=401, detail="Utilisateur introuvable")

    return user