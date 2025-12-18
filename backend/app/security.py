import os
from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

ALGORITHM = "HS256"
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

def create_access_token(data: dict, expires_minutes: int = 60 * 24 * 7):
    if not JWT_SECRET_KEY:
        raise RuntimeError("JWT_SECRET_KEY is missing in environment variables")

    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=expires_minutes)
    to_encode.update({"exp": expire})

    return jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str):
    if not JWT_SECRET_KEY:
        raise RuntimeError("JWT_SECRET_KEY is missing in environment variables")

    try:
        payload = jwt.decode(
            token,
            JWT_SECRET_KEY,
            algorithms=[ALGORITHM],
            options={"verify_aud": False},  # ✅ évite le bug 'audience'
        )
        return payload
    except JWTError as e:
        # Log utile Railway
        print("❌ JWT decode error:", str(e))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )

def get_current_user(token: str = Depends(oauth2_scheme)):
    payload = decode_token(token)

    # adapte selon ton payload (user_id, sub, email etc.)
    user_id = payload.get("user_id") or payload.get("sub")
    email = payload.get("email")

    if not user_id and not email:
        raise HTTPException(status_code=401, detail="Token missing user identity")

    return payload
