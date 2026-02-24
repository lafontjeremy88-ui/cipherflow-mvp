# app/core/config.py
"""
Configuration centralisée CipherFlow.
Toutes les variables d'environnement passent par ici.
Plus aucun os.getenv() dispersé dans le code.
"""

import os
from functools import lru_cache


class Settings:
    # ── Environnement ──────────────────────────────────────
    ENV: str = os.getenv("ENV", "dev").lower()

    # ── Sécurité ───────────────────────────────────────────
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "")
    OAUTH_STATE_SECRET: str = os.getenv("OAUTH_STATE_SECRET", "dev_secret")
    WATCHER_SECRET: str = os.getenv("WATCHER_SECRET", "").strip()
    FERNET_KEY: str = os.getenv("FERNET_KEY", "")

    # ── Base de données ────────────────────────────────────
    DATABASE_URL: str = os.getenv("DATABASE_URL", "")

    # ── Redis / RQ ─────────────────────────────────────────
    REDIS_URL: str = os.getenv("REDIS_URL", "")

    # ── IA (Gemini) ────────────────────────────────────────
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")

    # ── Email sortant (Resend) ─────────────────────────────
    RESEND_API_KEY: str = os.getenv("RESEND_API_KEY", "")
    RESEND_FROM_EMAIL: str = os.getenv("RESEND_FROM_EMAIL", "noreply@cipherflow.company")

    # ── CORS ───────────────────────────────────────────────
    ALLOWED_ORIGINS: list = [
        "http://localhost:5173",
        "https://cipherflow-mvp.vercel.app",
        "https://cipherflow.company",
    ]

    # ── Uploads ────────────────────────────────────────────
    UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", "uploads")

    # ── Google OAuth (Gmail) ──────────────────────────────
    GOOGLE_OAUTH_CLIENT_ID: str = os.getenv("GOOGLE_OAUTH_CLIENT_ID", "")
    GOOGLE_OAUTH_CLIENT_SECRET: str = os.getenv("GOOGLE_OAUTH_CLIENT_SECRET", "")
    GOOGLE_OAUTH_REDIRECT_URL: str = os.getenv("GOOGLE_OAUTH_REDIRECT_URL", "")
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "https://cipherflow-mvp.vercel.app")

    # ── Cloudflare R2 (stockage fichiers) ─────────────────
    R2_ACCOUNT_ID: str = os.getenv("R2_ACCOUNT_ID", "")
    R2_ACCESS_KEY_ID: str = os.getenv("R2_ACCESS_KEY_ID", "")
    R2_SECRET_ACCESS_KEY: str = os.getenv("R2_SECRET_ACCESS_KEY", "")
    R2_BUCKET_NAME: str = os.getenv("R2_BUCKET_NAME", "cipherflow-uploads")
    R2_ENDPOINT_URL: str = os.getenv("R2_ENDPOINT_URL", "")

    # ── Validation prod ────────────────────────────────────
    def validate(self):
        if self.ENV in ("prod", "production"):
            required = {
                "JWT_SECRET_KEY": self.JWT_SECRET_KEY,
                "WATCHER_SECRET": self.WATCHER_SECRET,
                "DATABASE_URL": self.DATABASE_URL,
                "REDIS_URL": self.REDIS_URL,
                "GEMINI_API_KEY": self.GEMINI_API_KEY,
                "R2_ACCESS_KEY_ID": self.R2_ACCESS_KEY_ID,
                "R2_SECRET_ACCESS_KEY": self.R2_SECRET_ACCESS_KEY,
                "R2_ENDPOINT_URL": self.R2_ENDPOINT_URL,
            }
            missing = [k for k, v in required.items() if not v]
            if missing:
                raise RuntimeError(
                    f"Variables manquantes en production : {', '.join(missing)}"
                )


@lru_cache()
def get_settings() -> Settings:
    s = Settings()
    s.validate()
    return s


# Singleton importable directement
settings = get_settings()