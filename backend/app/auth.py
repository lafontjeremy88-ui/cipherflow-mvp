from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
import os

# --- CONFIGURATION DE SÉCURITÉ ---
# Dans un vrai projet, mettez ces valeurs dans le fichier .env !
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "").strip()
ENV = os.getenv("ENV", "dev").lower()

if ENV in ("prod", "production") and not SECRET_KEY:
    raise RuntimeError("JWT_SECRET_KEY manquant en production")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # Le badge est valide 24 heures

# Le gestionnaire de mot de passe (Cryptage)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password, hashed_password):
    """Vérifie si le mot de passe fourni correspond au hash."""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    """Transforme un mot de passe clair en bouillie cryptographique."""
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Fabrique le badge d'accès (Token JWT)."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    
    # On inscrit la date d'expiration dans le badge
    to_encode.update({"exp": expire})
    
    # On signe le badge avec notre clé secrète
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt