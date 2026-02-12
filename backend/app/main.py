import os
import json
import logging
import base64
import io
import shutil
import secrets
import time
import re  # ✅ Ajout pour nettoyer l'alias
import hashlib
from cryptography.fernet import Fernet, InvalidToken
from typing import Optional, List
from datetime import datetime, timedelta
from pathlib import Path
from enum import Enum
from fastapi.security import OAuth2PasswordRequestForm
import mimetypes
from PIL import Image
import resend
from jose import jwt, JWTError
from sqlalchemy import text as sql_text, func
from sqlalchemy.orm import Session
from fastapi import (
    FastAPI,
    HTTPException,
    Depends,
    status,
    Response,
    Header,
    UploadFile,
    File,
    Form,
    Cookie,
    Query,
)
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from dotenv import load_dotenv
from starlette.middleware.sessions import SessionMiddleware
from fastapi import Request
from fastapi.responses import StreamingResponse 
from google import genai

# Imports internes
from app.security import get_current_user as get_current_user_token
from app.google_oauth import router as google_oauth_router
from app.database.database import get_db, engine, Base
from app.database import models
import asyncio
from app.database.database import SessionLocal

# On importe les nouveaux modèles SaaS
from app.database.models import (
    EmailAnalysis,
    AppSettings,
    User,
    Invoice,
    FileAnalysis,
    Agency,
    UserRole,
    TenantFile,
    TenantEmailLink,
    TenantDocumentLink,
    TenantFileStatus,
    TenantDocType,
    DocQuality,
    RefreshToken,  # ✅ NEW
)
from app.auth import get_password_hash, verify_password, create_access_token
from app.pdf_service import generate_pdf_bytes

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
ENV_PATH = os.path.join(BASE_DIR, ".env")
load_dotenv(ENV_PATH)
ENV = os.getenv("ENV", "dev").lower()

def _is_prod() -> bool:
    return ENV in ("prod", "production")


TOKEN_ENCRYPTION_KEY = os.getenv("TOKEN_ENCRYPTION_KEY", "").strip()

FERNET = Fernet(TOKEN_ENCRYPTION_KEY.encode()) if TOKEN_ENCRYPTION_KEY else None

if _is_prod() and not TOKEN_ENCRYPTION_KEY:
    raise RuntimeError("TOKEN_ENCRYPTION_KEY manquante en production")


def encrypt_bytes(data: bytes) -> bytes:
    """
    Chiffre des bytes pour stockage sur disque.
    Si pas de clé configurée, on renvoie les données telles quelles.
    """
    if not FERNET:
        return data
    return FERNET.encrypt(data)


def decrypt_bytes(data: bytes) -> bytes:
    """
    Déchiffre des bytes lues depuis le disque.
    Si pas de clé ou erreur, on renvoie les données telles quelles
    (pour ne pas tout casser en prod).
    """
    if not FERNET:
        return data
    try:
        return FERNET.decrypt(data)
    except InvalidToken:
        return data

DEFAULT_RETENTION_CONFIG = {
    "emails_days": 365,  # 1 an
    "tenant_files_days_after_closure": 365 * 5,  # 5 ans après clôture
    "file_analyses_days": 365,  # 1 an pour les analyses de fichiers
}


def create_default_settings_for_agency(db: Session, agency: Agency) -> AppSettings:
    """
    Crée les AppSettings par défaut pour une agence,
    avec une config de rétention RGPD par défaut.
    """
    settings = AppSettings(
        agency_id=agency.id,
        company_name=agency.name or "Ma Société",
        agent_name="Assistant IA",
        tone="pro",
        retention_config_json=json.dumps(DEFAULT_RETENTION_CONFIG),
    )
    db.add(settings)
    db.commit()
    db.refresh(settings)
    return settings

def get_retention_config(db: Session, agency_id: Optional[int] = None) -> dict:
    """
    Récupère la config de rétention pour une agence.
    Si rien n'est configuré → applique DEFAULT_RETENTION_CONFIG.
    """
    cfg = DEFAULT_RETENTION_CONFIG.copy()

    if agency_id is None:
        return cfg

    s = (
        db.query(AppSettings)
        .filter(AppSettings.agency_id == agency_id)
        .first()
    )
    if not s or not getattr(s, "retention_config_json", None):
        return cfg

    try:
        stored = s.retention_config_json
        if isinstance(stored, str):
            stored = json.loads(stored)
        if isinstance(stored, dict):
            cfg.update(stored)
    except Exception as e:
        print("⚠️ retention_config_json invalide:", e)

    return cfg

def run_retention_cleanup(db: Session):
    """
    Nettoyage périodique RGPD :
    - supprime les vieux emails
    - supprime les vieilles analyses de fichiers
    - anonymise les dossiers locataires fermés depuis longtemps
    - supprime les fichiers temporaires en clair (tmp_*) trop anciens
    """
    now = datetime.utcnow()

    # 🔹 0) Nettoyage des fichiers temporaires en clair (sécurité ++)
    uploads_dir = Path("uploads")
    if uploads_dir.exists():
        for p in uploads_dir.glob("tmp_*"):
            try:
                # âge du fichier
                age = now - datetime.utcfromtimestamp(p.stat().st_mtime)
                # ici : on supprime les tmp_ plus vieux d'1 heure
                if age > timedelta(hours=1):
                    p.unlink()
            except Exception:
                # on ne bloque pas le cleanup pour ça
                pass

    # 🔹 1) On parcourt les agences, car la rétention peut être différente par agence
    agencies = db.query(Agency).all()
    for ag in agencies:
        cfg = get_retention_config(db, ag.id)

        # 1) Emails
        emails_days = int(cfg.get("emails_days", DEFAULT_RETENTION_CONFIG["emails_days"]))
        cutoff_emails = now - timedelta(days=emails_days)

        db.query(EmailAnalysis).filter(
            EmailAnalysis.agency_id == ag.id,
            EmailAnalysis.created_at != None,
            EmailAnalysis.created_at < cutoff_emails,
        ).delete(synchronize_session=False)

        # 2) Analyses de fichiers
        fa_days = int(cfg.get("file_analyses_days", DEFAULT_RETENTION_CONFIG["file_analyses_days"]))
        cutoff_files = now - timedelta(days=fa_days)

        old_files = (
            db.query(FileAnalysis)
            .filter(
                FileAnalysis.agency_id == ag.id,
                FileAnalysis.created_at != None,
                FileAnalysis.created_at < cutoff_files,
            )
            .all()
        )

        for f in old_files:
            file_path = os.path.join("uploads", f.filename)
            if os.path.exists(file_path):
                try:
                    os.remove(file_path)
                except OSError:
                    pass
            db.delete(f)

        # 3) Dossiers locataires fermés → anonymisation
        tf_days = int(
            cfg.get(
                "tenant_files_days_after_closure",
                DEFAULT_RETENTION_CONFIG["tenant_files_days_after_closure"],
            )
        )
        cutoff_tf = now - timedelta(days=tf_days)

        closed_old = (
            db.query(TenantFile)
            .filter(
                TenantFile.agency_id == ag.id,
                TenantFile.is_closed == True,
                TenantFile.closed_at != None,
                TenantFile.closed_at < cutoff_tf,
            )
            .all()
        )

        for tf in closed_old:
            tf.candidate_email = None
            tf.candidate_name = None
            tf.risk_level = None
            # tf.checklist_json = None  # si tu veux anonymiser à 100 %

    db.commit()



async def retention_worker():
    """
    Worker asynchrone qui lance run_retention_cleanup toutes les 6 heures.
    """
    while True:
        try:
            db = SessionLocal()
            logger.info("[RGPD] Lancement du cleanup de rétention…")
            run_retention_cleanup(db)
            logger.info("[RGPD] Cleanup terminé.")
        except Exception as e:
            logger.error(f"[RGPD] Erreur dans le cleanup: {e}")
        finally:
            db.close()

        # Attente 6h avant le prochain passage
        await asyncio.sleep(6 * 60 * 60)



# --- CONFIGURATION IA ---
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
client = None

try:
    if GEMINI_API_KEY:
        client = genai.Client(api_key=GEMINI_API_KEY, http_options={"api_version": "v1beta"})
except Exception as e:
    print(f"Erreur Config Gemini: {e}")

MODEL_NAME = "gemini-2.0-flash"

RESEND_API_KEY = os.getenv("RESEND_API_KEY")
if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY

FRONTEND_URL = os.getenv("FRONTEND_URL", "https://cipherflow-mvp.vercel.app").rstrip("/")
RESEND_FROM = os.getenv("RESEND_FROM", "CipherFlow <onboarding@resend.dev>")
EMAIL_VERIFY_EXPIRE_HOURS = int(os.getenv("EMAIL_VERIFY_EXPIRE_HOURS", "24"))
RESET_PASSWORD_EXPIRE_MINUTES = int(os.getenv("RESET_PASSWORD_EXPIRE_MINUTES", "30"))


# ============================================================
# LIMITES SÉCURITÉ (anti-abus / RGPD / infra)
# ============================================================
MAX_EMAIL_CONTENT_SIZE = 50_000        # ~50 KB texte
MAX_ATTACHMENT_SIZE = 8 * 1024 * 1024  # 8 Mo par pièce jointe
MAX_ATTACHMENTS_PER_EMAIL = 5

# --- ENV & MODE RUNTIME ---
# --- LOGGING CENTRALISÉ ---
logger = logging.getLogger("cipherflow")
logger.setLevel(logging.INFO)

# En dev, on log dans la console
if not _is_prod():
    handler = logging.StreamHandler()
    formatter = logging.Formatter(
        "%(asctime)s [%(levelname)s] %(message)s"
    )
    handler.setFormatter(formatter)

    # Pour éviter de doubler les logs si FastAPI configure déjà le logging
    if not logger.handlers:
        logger.addHandler(handler)

# Flag pour activer/désactiver le worker de rétention RGPD
ENABLE_RETENTION_WORKER = os.getenv("ENABLE_RETENTION_WORKER", "false").lower() == "true"

WATCHER_SECRET = os.getenv("WATCHER_SECRET", "").strip()
OAUTH_STATE_SECRET = os.getenv("OAUTH_STATE_SECRET", "secret_dev_key").strip()
ADMIN_BYPASS_EMAIL = os.getenv("ADMIN_BYPASS_EMAIL", "").strip().lower()

if not _is_prod():
    print("[ADMIN_BYPASS_EMAIL]", repr(ADMIN_BYPASS_EMAIL))


# ============================================================
# ✅ AUTH PRO (ACCESS + REFRESH)
# ============================================================
ACCESS_TOKEN_MINUTES = 15
REFRESH_TOKEN_DAYS = 30

def create_refresh_token() -> str:
    # token opaque (random, long)
    return secrets.token_urlsafe(48)

def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()

def check_password_policy(password: str) -> None:
    if not password or len(password) < 8:
        raise HTTPException(status_code=400, detail="Mot de passe trop faible (min 8 caractères).")
    if not re.search(r"[a-z]", password):
        raise HTTPException(status_code=400, detail="Mot de passe trop faible (1 minuscule requis).")
    if not re.search(r"[A-Z]", password):
        raise HTTPException(status_code=400, detail="Mot de passe trop faible (1 majuscule requise).")
    if not re.search(r"[0-9]", password):
        raise HTTPException(status_code=400, detail="Mot de passe trop faible (1 chiffre requis).")
    if not re.search(r"[^A-Za-z0-9]", password):
        raise HTTPException(status_code=400, detail="Mot de passe trop faible (1 caractère spécial requis).")
    
def create_email_verify_token() -> str:
    return secrets.token_urlsafe(32)

def send_verification_email(to_email: str, token: str):
    if not RESEND_API_KEY:
        raise HTTPException(status_code=500, detail="RESEND_API_KEY manquant côté serveur")

    verify_link = f"{FRONTEND_URL}/verify-email?token={token}"

    html_content = f"""
    <h2>Bienvenue sur CipherFlow 👋</h2>
    <p>Pour vérifier ton email, clique ici :</p>
    <p><a href="{verify_link}">{verify_link}</a></p>
    <p>Si tu n'es pas à l'origine de cette demande, ignore ce message.</p>
    """

    resend.Emails.send({
    "from": "CipherFlow <no-reply@cipherflow.company>",
    "to": [to_email],
    "subject": "Vérifie ton email",
    "html": html_content,
    "headers": {
        "X-CipherFlow-Origin": "system-email",
    },
})

def send_reset_password_email(to_email: str, token: str):
    if not RESEND_API_KEY:
        raise HTTPException(status_code=500, detail="RESEND_API_KEY manquant côté serveur")

    reset_link = f"{FRONTEND_URL}/reset-password?token={token}"

    html_content = f"""
    <h2>Réinitialisation de mot de passe</h2>
    <p>Tu as demandé à réinitialiser ton mot de passe CipherFlow.</p>
    <p>Clique ici (valable {RESET_PASSWORD_EXPIRE_MINUTES} minutes) :</p>
    <p><a href="{reset_link}">{reset_link}</a></p>
    <p>Si tu n'es pas à l'origine de cette demande, ignore ce message.</p>
    """

    resend.Emails.send({
    "from": RESEND_FROM,
    "to": [to_email],
    "subject": "Réinitialise ton mot de passe",
    "html": html_content,
    "headers": {
        "X-CipherFlow-Origin": "system-email",
    },
})




def set_refresh_cookie(response: Response, refresh_token: str):
    """
    En prod (Vercel -> Railway):
    - SameSite=None obligatoire
    - Secure obligatoire
    """
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=_is_prod(),
        samesite="none" if _is_prod() else "lax",
        max_age=REFRESH_TOKEN_DAYS * 24 * 60 * 60,
        path="/",
    )

def clear_refresh_cookie(response: Response):
    response.delete_cookie(key="refresh_token", path="/")

# --- DEPENDANCES SAAS ---
async def get_current_user_db(
    token_payload: dict = Depends(get_current_user_token),
    db: Session = Depends(get_db),
) -> User:
    email = token_payload.get("sub") or token_payload.get("email")
    if not email:
        raise HTTPException(status_code=401, detail="Token invalide")

    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=401, detail="Utilisateur introuvable")

    return user

# --- FONCTIONS UTILITAIRES ---
def send_email_via_resend(to_email: str, subject: str, body: str):
    if not RESEND_API_KEY:
        print("Resend API Key manquant")
        return
    try:
        resend.Emails.send(
            {
                "from": RESEND_FROM,
                "to": [to_email],
                "subject": subject,
                "html": body.replace("\n", "<br>"),
                # 🧠 Tag spécial pour dire "email généré par CipherFlow"
                "headers": {
                    "X-CipherFlow-Origin": "auto-reply",
                },
            }
        )
    except Exception as e:
        logger.error(f"Erreur envoi email: {e}")


async def call_gemini(prompt: str) -> str:
    if not client:
        return "{}"
    try:
        response = client.models.generate_content(model=MODEL_NAME, contents=[prompt])
        return response.text
    except Exception as e:
        logger.error(f"Erreur IA: {e}")
        return "{}"


def extract_json_from_text(text: str):
    if not text:
        return None
    raw = text.strip()
    if "```" in raw:
        first, last = raw.find("```"), raw.rfind("```")
        if first != -1 and last > first:
            raw = raw[first + 3 : last].strip()
        if raw.lower().startswith("json"):
            raw = raw[4:].lstrip()
    start, end = raw.find("{"), raw.rfind("}")
    if start != -1 and end != -1:
        raw = raw[start : end + 1]
    try:
        return json.loads(raw)
    except:
        return None

# ============================================================
# 🟦 HELPERS GESTION LOCATIVE (NOUVEAU)
# ============================================================

class DocType(str, Enum):
    PAYSLIP = "payslip"
    TAX = "tax"
    ID = "id"
    OTHER = "other"


def map_doc_type(raw: str) -> str:
    if not raw:
        return DocType.OTHER.value

    txt = raw.lower()
    txt = txt.replace("_", " ").strip()

    # --- Fiche de paie / bulletin de salaire ---
    if (
        "fiche de paie" in txt
        or "fiche de paye" in txt
        or "bulletin de paie" in txt
        or "bulletin de paye" in txt
        or ("bulletin" in txt and "paie" in txt)
        or "paye" in txt
    ):
        return DocType.PAYSLIP.value

    # --- Avis d'impôt / avis d'imposition ---
    if (
        "avis d'imposition" in txt
        or "avis d imposition" in txt
        or "avis d'impot" in txt
        or "avis d impôt" in txt
        or "avis d impot" in txt
        or "avis d’impôt" in txt
        or ("avis" in txt and ("impot" in txt or "impôt" in txt or "imposition" in txt))
    ):
        return DocType.TAX.value

    # --- Pièce d'identité / CNI / passeport ---
    if (
        "pièce d'identité" in txt
        or "piece d'identite" in txt
        or "piece d identite" in txt
        or "carte d'identité" in txt
        or "carte nationale d'identité" in txt
        or "cni" in txt
        or "passeport" in txt
        or "identité" in txt
        or "identite" in txt
    ):
        return DocType.ID.value

    return DocType.OTHER.value

def is_relevant_for_tenant_file(doc_type: str) -> bool:
    """
    Décide si un document peut être rattaché à un dossier locataire.
    """
    return doc_type in {
        DocType.ID.value,
        DocType.PAYSLIP.value,
        DocType.TAX.value,
        
    }
def should_attach_to_tenant_file(analyse, attachment_file_ids: List[int]) -> bool:
    """
    Règle métier centrale :
    - soit l'email est une candidature
    - soit il contient des pièces locatives exploitables
    """
    # Cas 1 : on a des pièces locatives exploitables
    if attachment_file_ids:
        return True

    # Cas 2 : l'IA classe explicitement en candidature
    if analyse.category == "Candidature":
        return True

    return False


def guess_label_from_filename(filename: str) -> str:
    """
    Fallback quand l'IA doc plante :
    On regarde le nom du fichier et on renvoie un libellé propre pour file_type.
    """
    if not filename:
        return "Autre"

    normalized = map_doc_type(filename)

    if normalized == DocType.PAYSLIP.value:
        return "Bulletin de paie"
    if normalized == DocType.TAX.value:
        return "Avis d'imposition"
    if normalized == DocType.ID.value:
        return "Pièce d'identité"
    return "Autre"


def compute_checklist(doc_types: List[TenantDocType]) -> dict:
    """
    Calcule la checklist à partir des types de docs :
    - required : ordre fixe [ID, PAYSLIP, TAX]
    - received : sous-ensemble présent dans doc_types
    - missing  : required - received
    """
    required_list = [TenantDocType.ID, TenantDocType.PAYSLIP, TenantDocType.TAX]
    required_set = set(required_list)

    # On ne garde que les types "utiles" (ID / PAYSLIP / TAX)
    received_set = {dt for dt in doc_types if dt in required_set}
    missing_set = required_set - received_set

    # Ordre stable : ID -> PAYSLIP -> TAX
    order = {
        TenantDocType.ID: 0,
        TenantDocType.PAYSLIP: 1,
        TenantDocType.TAX: 2,
    }

    def sort_key(dt: TenantDocType) -> int:
        return order.get(dt, 99)

    received = [dt.value for dt in sorted(received_set, key=sort_key)]
    missing = [dt.value for dt in sorted(missing_set, key=sort_key)]
    required = [dt.value for dt in required_list]

    return {
        "required": required,
        "received": received,
        "missing": missing,
    }

def is_doc_type_in_tenant_file(
    db: Session, tenant_file_id: int, doc_type: str
) -> bool:
    """
    Retourne True si ce type de document est déjà présent
    dans le dossier locataire donné.
    """
    if not doc_type:
        return False

    exists = (
        db.query(TenantDocumentLink)
        .filter(
            TenantDocumentLink.tenant_file_id == tenant_file_id,
            TenantDocumentLink.doc_type == doc_type,
        )
        .first()
    )
    return exists is not None


def recompute_tenant_file_status(db: Session, tf: TenantFile) -> dict:
    """
    Recalcule checklist + statut pour un TenantFile,
    et renvoie la checklist (pour le front / la réponse email).
    """
    links = (
        db.query(TenantDocumentLink)
        .filter(TenantDocumentLink.tenant_file_id == tf.id)
        .all()
    )
    doc_types = [l.doc_type for l in links]
    checklist = compute_checklist(doc_types)

    tf.checklist_json = json.dumps(checklist)
    tf.status = (
        TenantFileStatus.TO_VALIDATE
        if not checklist["missing"]
        else TenantFileStatus.INCOMPLETE
    )
    db.commit()

    return checklist

# ============================================================
# 🟦 HELPERS DOSSIER LOCATAIRE / EMAIL
# ============================================================

def normalize_email_str(raw: Optional[str]) -> Optional[str]:
    """
    Normalise un email :
    - strip
    - lower
    - retourne None si vide
    """
    if not raw:
        return None
    cleaned = raw.strip().lower()
    return cleaned or None


def ensure_tenant_file_for_email(
    db: Session,
    agency_id: int,
    email_address: Optional[str],
    candidate_name: Optional[str] = None,
) -> Optional[TenantFile]:
    """
    Retourne un TenantFile pour (agency_id + email) en évitant les doublons :
    - si un dossier existe déjà pour cet email → on le réutilise
    - sinon on en crée un
    """
    email_norm = normalize_email_str(email_address)
    if not email_norm:
        # pas d'email => pas de dossier auto
        return None

    # On cherche en mode case-insensitive
    tf = (
        db.query(TenantFile)
        .filter(
            TenantFile.agency_id == agency_id,
            func.lower(TenantFile.candidate_email) == email_norm,
        )
        .order_by(TenantFile.id.asc())
        .first()
    )

    if tf:
        # Petit bonus : si on reçoit un nom et que le dossier n'en a pas encore
        if candidate_name and not tf.candidate_name:
            tf.candidate_name = candidate_name.strip()
            db.commit()
            db.refresh(tf)
        return tf

    # Aucun dossier : on en crée un seul
    tf = TenantFile(
        agency_id=agency_id,
        candidate_email=email_norm,
        candidate_name=candidate_name.strip() if candidate_name else None,
        status=TenantFileStatus.NEW,
        checklist_json=None,
        risk_level=None,
    )
    db.add(tf)
    db.commit()
    db.refresh(tf)
    return tf


def ensure_email_link(
    db: Session,
    tenant_file_id: int,
    email_analysis_id: int,
) -> None:
    """
    Crée un TenantEmailLink si inexistant.
    """
    exists = (
        db.query(TenantEmailLink)
        .filter(
            TenantEmailLink.tenant_file_id == tenant_file_id,
            TenantEmailLink.email_analysis_id == email_analysis_id,
        )
        .first()
    )
    if not exists:
        db.add(
            TenantEmailLink(
                tenant_file_id=tenant_file_id,
                email_analysis_id=email_analysis_id,
            )
        )
        db.commit()


def attach_files_to_tenant_file(
    db: Session,
    tenant_file: TenantFile,
    file_ids: List[int],
) -> dict:
    """
    Attache une liste de FileAnalysis à un TenantFile en évitant les doublons.
    
    - Pas de doublon par (tenant_file_id, file_id)
    - Pas de doublon de type de document (doc_type) dans un même dossier
    - Recalcule la checklist + status

    Retourne :
    {
        "added_doc_types": [...],
        "duplicate_doc_types": [...],
        "checklist": { ... }
    }
    """
    if not tenant_file or not file_ids:
        return {"added_doc_types": [], "duplicate_doc_types": [], "checklist": {}}

    tf_id = tenant_file.id
    added_types: List[str] = []
    duplicate_types: List[str] = []

    for fid in file_ids:
        # déjà lié à ce dossier → on ignore (sécurité)
        already_linked = (
            db.query(TenantDocumentLink)
            .filter(
                TenantDocumentLink.tenant_file_id == tf_id,
                TenantDocumentLink.file_analysis_id == fid,
            )
            .first()
        )
        if already_linked:
            continue

        fa = db.query(FileAnalysis).filter(FileAnalysis.id == fid).first()
        if not fa:
            continue

        # type fonctionnel (payslip / tax / id / other)
        doc_type_code = map_doc_type(getattr(fa, "file_type", "") or "")

        # 🔍 anti-doublon de type de document
        if is_doc_type_in_tenant_file(db, tf_id, doc_type_code):
            duplicate_types.append(doc_type_code)
            continue

        # lien OK
        db.add(
            TenantDocumentLink(
                tenant_file_id=tf_id,
                file_analysis_id=fid,
                doc_type=doc_type_code,
                quality=DocQuality.OK,
            )
        )
        added_types.append(doc_type_code)

    db.commit()

    # Recalcule checklist + statut avec le helper commun
    checklist = recompute_tenant_file_status(db, tenant_file)

    return {
        "added_doc_types": added_types,
        "duplicate_doc_types": duplicate_types,
        "checklist": checklist,
    }

def detect_file_kind(filename: str, content_type: str | None = None) -> str:
    """
    Retourne : 'pdf' | 'image' | 'unsupported'
    """
    name = (filename or "").lower()

    if name.endswith(".pdf"):
        return "pdf"

    if name.endswith((".jpg", ".jpeg", ".png", ".webp")):
        return "image"

    # fallback MIME si fourni
    if content_type:
        ct = content_type.lower()
        if ct == "application/pdf":
            return "pdf"
        if ct.startswith("image/"):
            return "image"

    return "unsupported"


# --- IA LOGIQUE ---
async def analyze_document_logic(file_path: str, filename: str):
    if not client:
        return {"summary": "IA non configurée"}
    try:
        uploaded_file = client.files.upload(file=file_path)
        while uploaded_file.state.name == "PROCESSING":
            time.sleep(1)
            uploaded_file = client.files.get(name=uploaded_file.name)

        if uploaded_file.state.name == "FAILED":
            raise ValueError("L'IA n'a pas réussi à traiter le fichier.")

        prompt = (
            "Tu es un expert en vérification de dossiers locataires. "
            "Analyse ce document et retourne un JSON strict :\n"
            "- type: 'Bulletin de paie', 'Avis d'imposition', 'Pièce d'identité', 'Quittance', 'Facture', 'Autre'.\n"
            "- sender: Emetteur (ex: Entreprise, DGFIP).\n"
            "- date: DD/MM/YYYY.\n"
            "- amount: Montant principal ou '0'.\n"
            "- summary: Synthèse courte."
        )

        res = client.models.generate_content(model=MODEL_NAME, contents=[uploaded_file, prompt])
        return extract_json_from_text(res.text)

    except Exception as e:
        print(f"Erreur analyse doc: {e}")
        # ✅ Fallback : on se base sur le nom du fichier
        guessed_type_label = guess_label_from_filename(filename)

        return {
            "summary": "Analyse indisponible (erreur IA)",
            "type": guessed_type_label,
            "sender": "",
            "date": "",
            "amount": "0",
        }

async def analyze_email_logic(
    req,
    company_name: str,
    db: Session,
    agency_id: int,
    attachment_summary: str = "",
):
    """
    Analyse IA d'un email pour une agence immobilière :
    - prend en compte le texte de l'email
    - + le contexte des dernières pièces analysées
    - + les pièces jointes spécifiques à cet email (attachment_summary)
    """

    # 1) On récupère quelques documents récents de l'agence
    last_files = (
        db.query(FileAnalysis)
        .filter(FileAnalysis.agency_id == agency_id)
        .order_by(FileAnalysis.id.desc())
        .limit(5)
        .all()
    )

    files_context = ""
    if last_files:
        files_context += "CONTEXTE DOCUMENTS (exemples récents de l'agence) :\n"
        for f in last_files:
            files_context += (
                f"- Fichier: {f.filename} | Type: {f.file_type} | Montant: {f.amount}\n"
            )

    # 2) Contexte spécifique à cet email : pièces jointes
    if attachment_summary:
        files_context += (
            "\nPIÈCES JOINTES REÇUES AVEC CET EMAIL :\n"
            f"{attachment_summary}\n"
        )

    # 3) Prompt orienté immobilier + exploitation des PJ
    prompt = (
        f"Tu es l'assistant spécialisé en gestion locative de l'agence immobilière {company_name}.\n"
        f"Tu dois classifier les emails entrants de façon fiable, en t'appuyant à la fois sur le TEXTE "
        f"de l'email et sur le CONTENU DES PIÈCES JOINTES.\n\n"
        f"{files_context}\n"
        f"EMAIL À ANALYSER :\n"
        f"- De: {req.from_email}\n"
        f"- Sujet: {req.subject}\n"
        f"- Contenu:\n{req.content}\n\n"
        f"RÔLE DES PIÈCES JOINTES (très important) :\n"
        f"- Si tu vois des documents de type 'fiche de paie', 'bulletin de salaire', 'avis d'impôt', "
        f"  'pièce d'identité', etc., il s'agit très probablement d'une Candidature ou d'un dossier locataire.\n"
        f"- Si tu vois des factures, devis, contrats de travaux, photos de dégâts : c'est plutôt un Incident "
        f"ou un sujet Administratif / Travaux.\n"
        f"- Si tu ne vois aucune pièce jointe significative, base-toi sur le texte.\n\n"
        f"Tu dois retourner un JSON STRICT avec les champs suivants :\n"
        f"- is_devis: booléen (true/false) -> true si l'email représente une opportunité commerciale "
        f"  (prospect, demande de visite, demande d'estimation, devis, etc.).\n"
        f"- category: une des valeurs SUIVANTES uniquement :\n"
        f"  'Candidature', 'Incident', 'Paiement', 'Administratif', 'Autre'.\n"
        f"    * 'Candidature' : dossier locataire, envoi de pièces du dossier, compléments de dossier,\n"
        f"      demande de location, candidature à un bien, etc.\n"
        f"    * 'Incident' : panne, dégâts, fuite, problème dans le logement, travaux urgents, etc.\n"
        f"    * 'Paiement' : loyer, régularisation, retard de paiement, quittance, virement, etc.\n"
        f"    * 'Administratif' : changement d'adresse, attestation, questions générales, résiliation,\n"
        f"      signature de bail, documents administratifs divers.\n"
        f"    * 'Autre' : tout ce qui ne rentre pas clairement dans les autres catégories.\n"
        f"- urgency: une des valeurs SUIVANTES uniquement : 'Haute', 'Moyenne', 'Faible'.\n"
        f"    * 'Haute' : problème bloquant (fuite d'eau, coupure de chauffage en hiver, urgence juridique,\n"
        f"      échéance très proche, risque de perte d'opportunité, etc.).\n"
        f"    * 'Moyenne' : sujet important mais pas critique dans les heures (complément de dossier,\n"
        f"      question sur un contrat, document manquant, demande de visite, etc.).\n"
        f"    * 'Faible' : simple information, remerciement, spam probable, newsletter, etc.\n"
        f"- summary: un résumé court (2-3 phrases maximum) qui décrit la situation en tenant compte\n"
        f"  du texte de l'email ET des pièces jointes.\n"
        f"- suggested_title: un titre très court, réutilisable comme étiquette ou sujet amélioré.\n\n"
        f"Réponds UNIQUEMENT avec un JSON valide, sans texte avant ni après."
    )

    raw = await call_gemini(prompt)
    data = extract_json_from_text(raw) or {}

    return EmailAnalyseResponse(
        is_devis=bool(data.get("is_devis", False)),
        category=str(data.get("category", "Autre")),
        urgency=str(data.get("urgency", "Moyenne")),
        summary=str(data.get("summary", "Analyse non disponible")),
        suggested_title=str(data.get("suggested_title", "Nouvel Email")),
        raw_ai_text=raw,
    )

    
async def generate_reply_logic(req, company_name: str, tone: str, signature: str):
    """
    Génère la réponse email en tenant compte :
    - du contenu de l'email
    - du résumé IA / catégorie / urgence
    - du statut du dossier locataire (Enum propre)
    - des pièces manquantes
    - des doublons éventuels
    """

    # ============================================================
    # 0️⃣ CONVERSION STATUT -> ENUM PROPRE
    # ============================================================

    tenant_status_enum = None

    if req.tenant_status:
        try:
            tenant_status_enum = TenantFileStatus(req.tenant_status)
        except Exception:
            tenant_status_enum = None

    missing = [d for d in (req.missing_docs or []) if d]
    duplicates = [d for d in (req.duplicate_docs or []) if d]

    has_dossier_info = (
        tenant_status_enum is not None
        or len(missing) > 0
        or len(duplicates) > 0
    )

    # ============================================================
    # 1️⃣ LOGIQUE MÉTIER PRIORITAIRE (SANS IA)
    # ============================================================

    if has_dossier_info:

        # ----------------------------
        # CAS DOSSIER INCOMPLET
        # ----------------------------
        if tenant_status_enum == TenantFileStatus.INCOMPLETE:

            missing_lines = "\n".join(f"- {d}" for d in missing)

            dup_block = ""
            if duplicates:
                dup_list = "\n".join(f"- {d}" for d in duplicates)
                dup_block = (
                    "\n\nLes documents suivants que vous venez d'envoyer "
                    "étaient déjà présents dans votre dossier :\n"
                    f"{dup_list}\n"
                    "Ils ont bien été reçus, mais ne complètent pas les pièces manquantes."
                )

            reply_text = (
                "Bonjour,\n\n"
                "Nous vous confirmons la bonne réception de vos documents.\n\n"
                "Cependant, votre dossier est encore incomplet.\n\n"
                "Il nous manque encore les pièces suivantes :\n"
                f"{missing_lines}"
                f"{dup_block}\n\n"
                "Merci de nous transmettre ces éléments afin de finaliser votre dossier.\n\n"
                f"{signature}"
            )

            return EmailReplyResponse(
                reply=reply_text,
                subject=f"Re: {req.subject}",
                raw_ai_text=None,
            )

        # ----------------------------
        # CAS DOSSIER COMPLET (à valider)
        # ----------------------------
        if tenant_status_enum == TenantFileStatus.TO_VALIDATE:

            dup_block = ""
            if duplicates:
                dup_list = "\n".join(f"- {d}" for d in duplicates)
                dup_block = (
                    "\n\nLes documents suivants que vous venez d'envoyer "
                    "étaient déjà présents dans votre dossier :\n"
                    f"{dup_list}\n"
                    "Ils ont bien été reçus, mais ne modifient pas l'état de votre dossier."
                )

            reply_text = (
                "Bonjour,\n\n"
                "Nous vous confirmons la bonne réception de vos documents.\n\n"
                "Votre dossier est désormais complet et va être étudié par notre équipe."
                f"{dup_block}\n\n"
                "Vous serez recontacté(e) dès qu'une décision sera prise.\n\n"
                f"{signature}"
            )

            return EmailReplyResponse(
                reply=reply_text,
                subject=f"Re: {req.subject}",
                raw_ai_text=None,
            )

        # ----------------------------
        # CAS DOSSIER VALIDÉ
        # ----------------------------
        if tenant_status_enum == TenantFileStatus.VALIDATED:

            reply_text = (
                "Bonjour,\n\n"
                "Votre dossier a déjà été validé par notre équipe.\n\n"
                "Nous restons à votre disposition pour toute question complémentaire.\n\n"
                f"{signature}"
            )

            return EmailReplyResponse(
                reply=reply_text,
                subject=f"Re: {req.subject}",
                raw_ai_text=None,
            )

    # ============================================================
    # 2️⃣ SINON -> LOGIQUE IA CLASSIQUE
    # ============================================================

    dossier_context = ""
    if tenant_status_enum:
        dossier_context += f"\nStatut dossier : {tenant_status_enum.value}\n"

    if missing:
        dossier_context += "Pièces manquantes :\n"
        for doc in missing:
            dossier_context += f"- {doc}\n"

    if duplicates:
        dossier_context += "Pièces en doublon :\n"
        for doc in duplicates:
            dossier_context += f"- {doc}\n"

    prompt = (
        f"Tu es l'assistant de l'agence immobilière {company_name}.\n"
        f"Ton ton d'écriture : {tone}.\n"
        f"Signature à utiliser :\n{signature}\n\n"
        f"Sujet : {req.subject}\n"
        f"Catégorie : {req.category}\n"
        f"Urgence : {req.urgency}\n"
        f"Résumé : {req.summary}\n"
        f"Contenu :\n{req.content}\n\n"
        f"{dossier_context}\n\n"
        "Retourne UNIQUEMENT un JSON valide :\n"
        '{ "reply": "...", "subject": "..." }'
    )

    raw = await call_gemini(prompt)
    data = extract_json_from_text(raw) or {}

    if not data:
        fallback_reply = (
            "Bonjour,\n\n"
            "Nous avons bien reçu votre email.\n\n"
            "Nous reviendrons vers vous dans les plus brefs délais.\n\n"
            f"{signature}"
        )

        return EmailReplyResponse(
            reply=fallback_reply,
            subject=f"Re: {req.subject}",
            raw_ai_text=raw,
        )

    return EmailReplyResponse(
        reply=data.get("reply", raw),
        subject=data.get("subject", f"Re: {req.subject}"),
        raw_ai_text=raw,
    )

# --- CONFIG FASTAPI ---
app = FastAPI(title="CipherFlow SaaS Multi-Agence")

app.add_middleware(
    SessionMiddleware,
    secret_key=OAUTH_STATE_SECRET,
    same_site="lax",
    https_only=(ENV in ("prod", "production")),
)

app.include_router(google_oauth_router, tags=["Google OAuth"])

origins = [
    "http://localhost:5173",
    "https://cipherflow-mvp.vercel.app",
    "https://cipherflow.company",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex="https://.*\\.vercel\\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- MODELS Pydantic ---
class LoginRequest(BaseModel):
    email: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user_email: str
class RegisterResponse(BaseModel):
    message: str

class ResendVerificationRequest(BaseModel):
    email: EmailStr

class EmailAnalyseRequest(BaseModel):
    from_email: EmailStr
    subject: str
    content: str

class EmailAnalyseResponse(BaseModel):
    is_devis: bool
    category: str
    urgency: str
    summary: str
    suggested_title: str
    raw_ai_text: Optional[str] = None

class EmailReplyRequest(BaseModel):
    from_email: EmailStr
    subject: str
    content: str
    summary: Optional[str] = None
    category: Optional[str] = None
    urgency: Optional[str] = None

    tenant_status: Optional[str] = None
    missing_docs: Optional[List[str]] = None

    # 👇 NOUVEAU : pièces envoyées mais déjà présentes dans le dossier
    duplicate_docs: Optional[List[str]] = None

class EmailReplyResponse(BaseModel):
    reply: str
    subject: str
    raw_ai_text: Optional[str] = None

class AttachmentModel(BaseModel):
    filename: str
    content_base64: str
    content_type: str

class EmailProcessRequest(BaseModel):
    from_email: EmailStr
    to_email: Optional[str] = None
    subject: str
    content: str
    send_email: bool = False
    attachments: List[AttachmentModel] = []
     # 🧠 Filtrage métier (venant du watcher)
    filter_score: Optional[int] = None
    filter_decision: Optional[str] = None
    filter_reasons: Optional[List[str]] = None

class EmailProcessResponse(BaseModel):
    analyse: EmailAnalyseResponse
    reponse: EmailReplyResponse
    send_status: str
    email_id: Optional[int] = None
    error: Optional[str] = None

class SendEmailRequest(BaseModel):
    to_email: str
    subject: str
    body: str
    email_id: Optional[int] = None

class SettingsRequest(BaseModel):
    company_name: str
    agent_name: str
    tone: str
    signature: str
    logo: Optional[str] = None

class LogoUploadRequest(BaseModel):
    logo_base64: str

class EmailHistoryItem(BaseModel):
    id: int
    created_at: Optional[datetime] = None
    sender_email: str
    subject: str
    summary: str
    category: str
    urgency: str
    is_devis: bool
    raw_email_text: str
    suggested_response_text: str
    reply_sent: bool = False
    reply_sent_at: Optional[datetime] = None

    # 🔹 nouveau champ : premier dossier locataire lié (si existe)
    tenant_file_id: Optional[int] = None

    class Config:
        from_attributes = True



class EmailDetailResponse(BaseModel):
    id: int
    created_at: Optional[datetime] = None
    sender_email: str
    subject: str
    raw_email_text: str
    summary: str
    category: str
    urgency: str
    is_devis: bool
    suggested_response_text: str
    reply_sent: bool = False
    reply_sent_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class InvoiceItem(BaseModel):
    desc: str
    price: float

class InvoiceRequest(BaseModel):
    client_name: str
    invoice_number: str
    amount: float
    date: str
    items: List[InvoiceItem]

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

class AccountMeResponse(BaseModel):
    email: EmailStr
    first_name: Optional[str] = None
    last_name: Optional[str] = None

    agency_name: Optional[str] = None
    role: Optional[str] = None

    created_at: Optional[datetime] = None
    account_status: Optional[str] = None

    preferred_language: str = "fr"
    ui_prefs: Optional[dict] = None

class AccountUpdateRequest(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    preferred_language: Optional[str] = None
    ui_prefs: Optional[dict] = None

    # ✅ Nom d'agence modifiable uniquement si admin
    agency_name: Optional[str] = None



# ============================================================
# 🟦 DOSSIERS LOCATAIRES (GESTION LOCATIVE) — Pydantic
# ============================================================
class TenantFileListItem(BaseModel):
    id: int
    status: str
    candidate_email: Optional[str] = None
    candidate_name: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class TenantFileCreate(BaseModel):
    candidate_email: Optional[EmailStr] = None
    candidate_name: Optional[str] = None

class TenantFileUpdate(BaseModel):
    candidate_email: Optional[str] = None
    candidate_name: Optional[str] = None


class TenantFileDetail(BaseModel):
    id: int
    status: str
    candidate_email: Optional[str] = None
    candidate_name: Optional[str] = None
    checklist_json: Optional[str] = None
    risk_level: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    email_ids: List[int] = []
    file_ids: List[int] = []

    class Config:
        from_attributes = True

# --- STARTUP ---
# --- STARTUP ---
@app.on_event("startup")
def on_startup():
    if not _is_prod():
        # ✅ En DEV uniquement : création auto des tables
        models.Base.metadata.create_all(bind=engine)

    if not os.path.exists("uploads"):
        os.makedirs("uploads")

    # Création Super Admin par défaut (DEV / FIRST RUN)
    if not _is_prod():
        db = next(get_db())
        try:
            if not db.query(User).filter(User.email == "admin@cipherflow.com").first():
                default_agency = Agency(name="CipherFlow HQ", email_alias="admin")
                db.add(default_agency)
                db.commit()
                db.refresh(default_agency)

                admin = User(
                    email="admin@cipherflow.com",
                    hashed_password=get_password_hash("admin123"),
                    role=UserRole.SUPER_ADMIN,
                    agency_id=default_agency.id,
                )
                db.add(admin)
                db.commit()
        finally:
            db.close()


@app.on_event("startup")
async def start_retention_worker():
    if not ENABLE_RETENTION_WORKER:
        return
    asyncio.create_task(retention_worker())



# ============================================================
# ✅ ROUTES AUTH PRO
# ============================================================

@app.post("/auth/register", response_model=RegisterResponse)
async def register(
    req: LoginRequest,
    response: Response,
    db: Session = Depends(get_db)
):
    # 1️⃣ Email unique
    if db.query(User).filter(User.email == req.email).first():
        raise HTTPException(status_code=400, detail="Email déjà utilisé")

    # 2️⃣ Mot de passe fort ✅
    check_password_policy(req.password)

    # 3️⃣ SAAS AUTO-ONBOARDING
    agency_name = f"Agence de {req.email.split('@')[0]}"

    # ✅ GÉNÉRATION ALIAS AUTOMATIQUE
    clean_alias = re.sub(r"[^a-zA-Z0-9]", "", req.email.split("@")[0]).lower()

    # éviter collisions sur l'alias email
    if db.query(Agency).filter(Agency.email_alias == clean_alias).first():
        clean_alias = f"{clean_alias}{int(time.time())}"

    # éviter collisions sur le nom d'agence
    if db.query(Agency).filter(Agency.name == agency_name).first():
        agency_name = f"{agency_name} ({int(time.time())})"

    # ✅ Création de l'agence
    new_agency = Agency(name=agency_name, email_alias=clean_alias)
    db.add(new_agency)
    db.commit()
    db.refresh(new_agency)

    # ✅ Création de l'utilisateur admin agence
    new_user = User(
        email=req.email,
        hashed_password=get_password_hash(req.password),
        agency_id=new_agency.id,
        role=UserRole.AGENCY_ADMIN,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # ✅ RGPD : AppSettings avec config de rétention par défaut
    create_default_settings_for_agency(db, new_agency)

    # ✅ Email verification (standard) - PAS de login tant que non vérifié
    raw_token = create_email_verify_token()

    new_user.email_verified = False
    new_user.email_verification_token_hash = hash_token(raw_token)
    new_user.email_verification_expires_at = datetime.utcnow() + timedelta(hours=EMAIL_VERIFY_EXPIRE_HOURS)
    db.commit()

    # ✅ Envoi email Resend
    try:
        send_verification_email(new_user.email, raw_token)
    except Exception as e:
        print("EMAIL VERIFICATION FAILED:", e)

    return {
        "message": "Inscription enregistrée. Vérifie ton email pour activer ton compte."
    }


@app.get("/auth/verify-email")
def verify_email(token: str, db: Session = Depends(get_db)):
    token_hash = hash_token(token)

    user = db.query(User).filter(User.email_verification_token_hash == token_hash).first()
    if not user:
        raise HTTPException(status_code=400, detail="Lien invalide ou expiré.")

    if user.email_verified:
        return {"message": "Email déjà confirmé."}

    if not user.email_verification_expires_at or user.email_verification_expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Lien expiré. Demande un nouvel email de confirmation.")

    user.email_verified = True
    user.email_verification_token_hash = None
    user.email_verification_expires_at = None
    db.commit()

    return {"message": "✅ Email confirmé. Tu peux maintenant te connecter."}

@app.post("/auth/verify-email")
def verify_email_post(
    token: str = Query(...),
    db: Session = Depends(get_db),
):
    # on réutilise exactement la logique du GET
    return verify_email(token=token, db=db)


@app.post("/auth/resend-verification")
def resend_verification(
    payload: ResendVerificationRequest,
    db: Session = Depends(get_db),
):
    email = payload.email.strip().lower()

    user = db.query(models.User).filter(models.User.email == email).first()

    # Réponse neutre (évite de révéler si un email existe)
    ok_msg = {"message": "Si un compte existe et n’est pas vérifié, un email de confirmation a été renvoyé."}

    if not user:
        return ok_msg

    if getattr(user, "email_verified", False):
        return ok_msg

    raw_token = secrets.token_urlsafe(32)
    user.email_verification_token_hash = hash_token(raw_token)
    user.email_verification_expires_at = datetime.utcnow() + timedelta(hours=EMAIL_VERIFY_EXPIRE_HOURS)

    db.add(user)
    db.commit()

    # IMPORTANT : ne jamais faire crasher l'inscription / resend si Resend a un souci
    try:
        send_verification_email(user.email, raw_token)
    except Exception as e:
        # tu peux logger e si tu veux, mais on renvoie OK quand même
        return {"message": "Compte créé/MAJ. Email temporairement indisponible, réessaie dans quelques minutes."}

    return ok_msg

@app.post("/auth/forgot-password")
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()

    # ✅ réponse neutre (anti user-enum)
    ok_msg = {"message": "Si un compte existe, tu recevras un email de réinitialisation."}

    user = db.query(User).filter(User.email == email).first()
    if not user:
        return ok_msg

    # (optionnel) tu peux exiger email_verified=True, mais en général on autorise
    raw_token = secrets.token_urlsafe(32)
    user.reset_password_token_hash = hash_token(raw_token)
    user.reset_password_expires_at = datetime.utcnow() + timedelta(minutes=RESET_PASSWORD_EXPIRE_MINUTES)
    user.reset_password_used_at = None
    db.commit()

    try:
        send_reset_password_email(user.email, raw_token)
    except Exception as e:
        # ne jamais leak / ne jamais planter
        logging.exception("RESET PASSWORD EMAIL FAILED")
        return ok_msg

    return ok_msg


@app.post("/auth/reset-password")
def reset_password(payload: ResetPasswordRequest, response: Response, db: Session = Depends(get_db)):
    bad_msg = "Lien invalide ou expiré."

    token = (payload.token or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail=bad_msg)

    token_hash = hash_token(token)

    user = db.query(User).filter(User.reset_password_token_hash == token_hash).first()
    if (not user) or (user.reset_password_used_at is not None):
        raise HTTPException(status_code=400, detail=bad_msg)

    if (not user.reset_password_expires_at) or (user.reset_password_expires_at < datetime.utcnow()):
        raise HTTPException(status_code=400, detail=bad_msg)

    check_password_policy(payload.new_password)

    if verify_password(payload.new_password, user.hashed_password):
        raise HTTPException(
            status_code=400,
            detail="Le nouveau mot de passe doit être différent de l'ancien."
    )

    user.hashed_password = get_password_hash(payload.new_password)
    user.reset_password_used_at = datetime.utcnow()
    user.reset_password_token_hash = None
    user.reset_password_expires_at = None

    db.query(RefreshToken).filter(
        RefreshToken.user_id == user.id,
        RefreshToken.revoked_at.is_(None),
    ).update({"revoked_at": datetime.utcnow()})

    db.commit()

    clear_refresh_cookie(response)

    return {"message": "Mot de passe réinitialisé. Tu peux maintenant te connecter."}



@app.post("/auth/login", response_model=TokenResponse)
async def login(req: LoginRequest, response: Response, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if not user:
        raise HTTPException(status_code=400, detail="Identifiants incorrects")
    
    if not verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Identifiants incorrects")
    
    if not _is_prod():
        print(
            "LOGIN DEBUG",
            "verified=", user.email_verified,
            "user_id=", user.id
        )
    if not user.email_verified:
      if ADMIN_BYPASS_EMAIL and user.email.strip().lower() == ADMIN_BYPASS_EMAIL.strip().lower():
        # ✅ Bypass dev uniquement pour le super admin
        pass
      else:
        raise HTTPException(status_code=403, detail="Email non confirmé. Vérifie ta boîte mail.")



    access = create_access_token(
        {"sub": user.email},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_MINUTES),
    )

    refresh = create_refresh_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_token(refresh),
            created_at=datetime.utcnow(),
            expires_at=datetime.utcnow() + timedelta(days=REFRESH_TOKEN_DAYS),
        )
    )
    db.commit()

    set_refresh_cookie(response, refresh)

    return {"access_token": access, "token_type": "bearer", "user_email": user.email}

@app.post("/auth/token", response_model=TokenResponse)
async def token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Identifiants invalides")

    # ✅ Bloquer login tant que l’email n’est pas confirmé
    if not getattr(user, "email_verified", False):
        raise HTTPException(status_code=403, detail="Email non confirmé. Vérifie ta boîte mail.")

    access = create_access_token(
        {"sub": user.email},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_MINUTES),
    )

    refresh = create_refresh_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_token(refresh),
            created_at=datetime.utcnow(),
            expires_at=datetime.utcnow() + timedelta(days=REFRESH_TOKEN_DAYS),
        )
    )
    db.commit()

    # ✅ Cookie refresh + JSON
    r = Response(
        content=json.dumps({"access_token": access, "token_type": "bearer", "user_email": user.email}),
        media_type="application/json",
    )
    set_refresh_cookie(r, refresh)
    return r



@app.post("/auth/refresh", response_model=TokenResponse)
async def refresh_access_token(
    response: Response,
    db: Session = Depends(get_db),
    refresh_token: Optional[str] = Cookie(default=None),
):
    if not refresh_token:
        raise HTTPException(status_code=401, detail="Missing refresh token")

    token_hash = hash_token(refresh_token)
    rt = db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).first()
    if not rt or rt.revoked_at is not None:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    if rt.expires_at < datetime.utcnow():
        raise HTTPException(status_code=401, detail="Refresh token expired")

    user = db.query(User).filter(User.id == rt.user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    # ✅ rotation refresh (pro)
    new_refresh = create_refresh_token()
    rt.token_hash = hash_token(new_refresh)
    rt.last_used_at = datetime.utcnow()
    rt.expires_at = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_DAYS)
    db.commit()

    new_access = create_access_token(
        {"sub": user.email},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_MINUTES),
    )

    set_refresh_cookie(response, new_refresh)

    return {"access_token": new_access, "token_type": "bearer", "user_email": user.email}

@app.post("/auth/logout")
async def logout(
    response: Response,
    db: Session = Depends(get_db),
    refresh_token: Optional[str] = Cookie(default=None),
):
    if refresh_token:
        token_hash = hash_token(refresh_token)
        rt = db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).first()
        if rt and rt.revoked_at is None:
            rt.revoked_at = datetime.utcnow()
            db.commit()

    clear_refresh_cookie(response)
    return {"ok": True}

# ============================================================
# --- WEBHOOK EMAIL (ROUTAGE MULTI-AGENCE) ---
# (le reste de ton fichier est inchangé)
# ============================================================

@app.post("/webhook/email", response_model=EmailProcessResponse)
async def webhook_process_email(
    req: EmailProcessRequest,
    db: Session = Depends(get_db),
    x_watcher_secret: str = Header(None),
):
    # ============================================================
    # 0) SÉCURITÉ – le webhook ne doit pas être appelable par n’importe qui
    # ============================================================
    if (not x_watcher_secret) or not secrets.compare_digest(
        x_watcher_secret, WATCHER_SECRET
    ):
        raise HTTPException(status_code=401, detail="Invalid Secret")

    # Limitation taille email (sécurité / perf)
    if req.content and len(req.content.encode("utf-8")) > MAX_EMAIL_CONTENT_SIZE:
        logger.warning("[SECURITY] Email content too large, truncated")
        req.content = req.content[:MAX_EMAIL_CONTENT_SIZE]

    # ============================================================
    # 1) INITIALISATION DES VARIABLES CRITIQUES (OBLIGATOIRE)
    # ============================================================
    # La réponse existe TOUJOURS, même si l’IA plante
    reponse = EmailReplyResponse(
        reply="",
        subject=req.subject,
    )

    # ============================================================
    # 2) ROUTAGE MULTI-AGENCE
    # ============================================================
    recipient = req.to_email.lower().strip() if req.to_email else ""
    target_agency = None

    if "+" in recipient:
        try:
            alias_part = recipient.split("+")[1].split("@")[0]
            target_agency = (
                db.query(Agency)
                .filter(Agency.email_alias == alias_part)
                .first()
            )
        except Exception as e:
            logger.error(f"[ALIAS] Error: {e}")

    if not target_agency:
        logger.warning("⚠️ Pas d'alias détecté, fallback agence par défaut")
        target_agency = db.query(Agency).order_by(Agency.id.asc()).first()

    if not target_agency:
        raise HTTPException(status_code=500, detail="Aucune agence configurée")

    agency_id = target_agency.id
    settings = (
        db.query(AppSettings)
        .filter(AppSettings.agency_id == agency_id)
        .first()
    )
    comp_name = settings.company_name if settings else target_agency.name

    # ============================================================
    # 3) FILTRAGE MÉTIER SIMPLE
    # ============================================================
    if req.filter_decision in ("ignore", "process_light"):
        new_email = EmailAnalysis(
            agency_id=agency_id,
            sender_email=req.from_email,
            subject=req.subject,
            raw_email_text=req.content,
            summary="Email ignoré ou traité en mode léger",
            category="Autre",
            urgency="Faible",
            is_devis=False,
            filter_score=req.filter_score,
            filter_decision=req.filter_decision,
            filter_reasons=json.dumps(req.filter_reasons or []),
        )
        db.add(new_email)
        db.commit()
        db.refresh(new_email)

        return EmailProcessResponse(
            analyse=EmailAnalyseResponse(
                is_devis=False,
                category="Autre",
                urgency="Faible",
                summary=new_email.summary,
                suggested_title=req.subject,
            ),
            reponse=reponse,
            send_status=req.filter_decision,
            email_id=new_email.id,
        )

    # ============================================================
    # 4) TRAITEMENT & STOCKAGE DES PIÈCES JOINTES (IA = best effort)
    # ============================================================
    attachment_summary_text = ""
    attachment_file_ids: List[int] = []

    if req.attachments:
        uploads_dir = Path("uploads")
        uploads_dir.mkdir(exist_ok=True)

        for att in req.attachments[:MAX_ATTACHMENTS_PER_EMAIL]:
            try:
                file_data = base64.b64decode(att.content_base64)
                file_hash = hashlib.sha256(file_data).hexdigest()

                # Déduplication stricte
                existing_file = (
                    db.query(FileAnalysis)
                    .filter(
                        FileAnalysis.agency_id == agency_id,
                        FileAnalysis.file_hash == file_hash,
                    )
                    .first()
                )

                if existing_file:
                    doc_type_code = map_doc_type(existing_file.file_type or "")
                    if is_relevant_for_tenant_file(doc_type_code):
                        attachment_file_ids.append(existing_file.id)
                        attachment_summary_text += f"- PJ: {att.filename}\n"
                    continue

                safe_filename = f"{agency_id}_{int(time.time())}_{att.filename}"
                tmp_path = uploads_dir / f"tmp_{safe_filename}"

                with open(tmp_path, "wb") as f:
                    f.write(file_data)

                # Analyse IA document → best effort
                try:
                    doc_analysis = await analyze_document_logic(
                        str(tmp_path), safe_filename
                    )
                except Exception as e:
                    logger.error(f"[DOC-IA] Analyse échouée: {e}")
                    doc_analysis = {
                        "type": "Document",
                        "summary": "Analyse différée (quota ou erreur IA)",
                        "date": "",
                        "amount": "0",
                    }

                encrypted_bytes = encrypt_bytes(file_data)
                final_path = uploads_dir / safe_filename
                with open(final_path, "wb") as f:
                    f.write(encrypted_bytes)

                os.remove(tmp_path)

                new_file = FileAnalysis(
                    filename=safe_filename,
                    file_type=doc_analysis.get("type", "Autre"),
                    sender=req.from_email,
                    extracted_date=str(doc_analysis.get("date", "")),
                    amount=str(doc_analysis.get("amount", "0")),
                    summary=str(doc_analysis.get("summary", "")),
                    agency_id=agency_id,
                    file_hash=file_hash,
                )

                db.add(new_file)
                db.commit()
                db.refresh(new_file)

                if is_relevant_for_tenant_file(map_doc_type(new_file.file_type)):
                    attachment_file_ids.append(new_file.id)
                    attachment_summary_text += f"- PJ: {att.filename}\n"

            except Exception as e:
                logger.error(f"[PJ] Erreur traitement PJ : {e}")

    # ============================================================
    # 5) ANALYSE IA DE L’EMAIL (best effort)
    # ============================================================
    try:
        analyse = await analyze_email_logic(
            EmailAnalyseRequest(
                from_email=req.from_email,
                subject=req.subject,
                content=req.content,
            ),
            comp_name,
            db,
            agency_id,
            attachment_summary=attachment_summary_text,
        )
    except Exception as e:
        logger.error(f"[EMAIL-IA] Analyse échouée: {e}")
        analyse = EmailAnalyseResponse(
            is_devis=False,
            category="Autre",
            urgency="Normale",
            summary="Email reçu",
            suggested_title=req.subject,
            raw_ai_text="",
        )

    # ============================================================
    # 6) GÉNÉRATION DE LA RÉPONSE IA (OBLIGATOIRE + BACKUP)
    # ============================================================
    try:
        reponse = await generate_reply_logic(
            EmailReplyRequest(
                from_email=req.from_email,
                subject=req.subject,
                content=req.content,
                summary=analyse.summary,
                category=analyse.category,
                urgency=analyse.urgency,
                tenant_status=None,
                missing_docs=[],
                duplicate_docs=[],
            ),
            comp_name,
            settings.tone if settings else "pro",
            settings.signature if settings else "Team",
        )
    except Exception as e:
        logger.error(f"[REPLY-IA] Échec génération réponse : {e}")
        reponse = EmailReplyResponse(
            subject=req.subject,
            reply=(
                "Bonjour,\n\n"
                "Nous avons bien reçu votre message et revenons vers vous rapidement.\n\n"
                "Cordialement."
            ),
        )

    # ============================================================
    # 7) ENREGISTREMENT FINAL DE L’EMAIL (TOUJOURS)
    # ============================================================
    new_email = EmailAnalysis(
        agency_id=agency_id,
        sender_email=req.from_email,
        subject=req.subject,
        raw_email_text=req.content,
        is_devis=analyse.is_devis,
        category=analyse.category,
        urgency=analyse.urgency,
        summary=analyse.summary,
        suggested_title=analyse.suggested_title,
        suggested_response_text=reponse.reply,
        raw_ai_output=analyse.raw_ai_text,
        filter_score=req.filter_score,
        filter_decision=req.filter_decision,
        filter_reasons=json.dumps(req.filter_reasons or []),
    )
    db.add(new_email)
    db.commit()
    db.refresh(new_email)

    # ============================================================
    # 8) DOSSIER LOCATAIRE & LIENS (best effort)
    # ============================================================
    if should_attach_to_tenant_file(analyse, attachment_file_ids):
        try:
            tf = ensure_tenant_file_for_email(
                db=db,
                agency_id=agency_id,
                email_address=req.from_email.lower(),
            )
            if tf:
                ensure_email_link(
                    db=db,
                    tenant_file_id=tf.id,
                    email_analysis_id=new_email.id,
                )
                if attachment_file_ids:
                    attach_files_to_tenant_file(db, tf, attachment_file_ids)
        except Exception as e:
            logger.error(f"[TENANT] Erreur rattachement dossier : {e}")

    # ============================================================
    # 9) ENVOI EMAIL SI DEMANDÉ
    # ============================================================
    if req.send_email:
        send_email_via_resend(req.from_email, reponse.subject, reponse.reply)

    return EmailProcessResponse(
        analyse=analyse,
        reponse=reponse,
        send_status="sent" if req.send_email else "not_sent",
        email_id=new_email.id,
    )


# ============================================================
# --- ROUTES DASHBOARD & DATA (PROTEGEES PAR AGENCE) ---
# (reste inchangé)
# ============================================================

@app.get("/dashboard/stats")
async def get_stats(db: Session = Depends(get_db), current_user: User = Depends(get_current_user_db)):
    aid = current_user.agency_id

    total = db.query(EmailAnalysis).filter(EmailAnalysis.agency_id == aid).count()

    high = (
        db.query(EmailAnalysis)
        .filter(
            EmailAnalysis.agency_id == aid,
            (func.lower(EmailAnalysis.urgency).contains("haut")) | (func.lower(EmailAnalysis.urgency).contains("urg")),
        )
        .count()
    )

    inv = db.query(Invoice).filter(Invoice.agency_id == aid).count()

    cat_stats = (
        db.query(EmailAnalysis.category, func.count(EmailAnalysis.id))
        .filter(EmailAnalysis.agency_id == aid)
        .group_by(EmailAnalysis.category)
        .all()
    )
    dist = [{"name": c[0], "value": c[1]} for c in cat_stats]

    recents = (
        db.query(EmailAnalysis)
        .filter(EmailAnalysis.agency_id == aid)
        .order_by(EmailAnalysis.id.desc())
        .limit(5)
        .all()
    )
    rec_act = [
        {
            "id": r.id,
            "subject": r.subject,
            "category": r.category,
            "urgency": r.urgency,
            "date": r.created_at.strftime("%d/%m %H:%M") if r.created_at else "",
        }
        for r in recents
    ]

    return {"kpis": {"total_emails": total, "high_urgency": high, "invoices": inv}, "charts": {"distribution": dist}, "recents": rec_act}

@app.get("/email/history", response_model=List[EmailHistoryItem])
async def get_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_db),
):
    # 1) On récupère les emails de l'agence
    emails = (
        db.query(EmailAnalysis)
        .filter(EmailAnalysis.agency_id == current_user.agency_id)
        .order_by(EmailAnalysis.id.desc())
        .all()
    )

    if not emails:
        return []

    email_ids = [e.id for e in emails]

    # 2) On regarde s'ils ont un lien avec un dossier locataire
    links = (
        db.query(TenantEmailLink)
        .filter(TenantEmailLink.email_analysis_id.in_(email_ids))
        .all()
    )

    # on garde le "premier" dossier lié pour chaque email
    email_to_tenant = {}
    for link in links:
        if link.email_analysis_id not in email_to_tenant:
            email_to_tenant[link.email_analysis_id] = link.tenant_file_id

    # 3) On ajoute un attribut dynamique sur chaque EmailAnalysis
    for e in emails:
        setattr(e, "tenant_file_id", email_to_tenant.get(e.id))

    return emails

@app.get("/email/{email_id}", response_model=EmailDetailResponse)
async def get_email_detail(
    email_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_db),
):
    email = (
        db.query(EmailAnalysis)
        .filter(
            EmailAnalysis.id == email_id,
            EmailAnalysis.agency_id == current_user.agency_id
        )
        .first()
    )

    if not email:
        raise HTTPException(status_code=404, detail="Email introuvable")

    return email


# --- (le reste de tes routes: tenant-files, settings, upload, files, invoices, etc.) ---
# ⚠️ IMPORTANT : garde la suite de ton fichier identique à ton original.


# ============================================================
# 🟦 DOSSIERS LOCATAIRES (GESTION LOCATIVE) — API
# ============================================================

@app.post("/tenant-files", response_model=TenantFileDetail)
async def create_tenant_file(
    payload: TenantFileCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_db),
):
    aid = current_user.agency_id

    email = (payload.candidate_email or "").strip() or None
    name = (payload.candidate_name or "").strip() or None

    tf = TenantFile(
        agency_id=aid,
        candidate_email=email,
        candidate_name=name,
        status=TenantFileStatus.NEW,
        checklist_json=None,
        risk_level=None,
    )
    db.add(tf)
    db.commit()
    db.refresh(tf)

    return TenantFileDetail(
        id=tf.id,
        status=tf.status.value if hasattr(tf.status, "value") else str(tf.status),
        candidate_email=tf.candidate_email,
        candidate_name=tf.candidate_name,
        checklist_json=tf.checklist_json,
        risk_level=tf.risk_level,
        created_at=tf.created_at,
        updated_at=tf.updated_at,
        email_ids=[],
        file_ids=[],
    )


@app.get("/tenant-files", response_model=List[TenantFileListItem])
async def list_tenant_files(db: Session = Depends(get_db), current_user: User = Depends(get_current_user_db)):
    aid = current_user.agency_id
    return (
        db.query(TenantFile)
        .filter(TenantFile.agency_id == aid)
        .order_by(TenantFile.id.desc())
        .all()
    )


@app.get("/tenant-files/{tenant_id}", response_model=TenantFileDetail)
async def get_tenant_file(tenant_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_db)):
    aid = current_user.agency_id
    tf = db.query(TenantFile).filter(TenantFile.id == tenant_id, TenantFile.agency_id == aid).first()
    if not tf:
        raise HTTPException(status_code=404, detail="Dossier introuvable")

    email_ids = [l.email_analysis_id for l in tf.email_links]
    file_ids = [l.file_analysis_id for l in tf.document_links]

    # 🩹 Auto-fix des anciens dossiers incohérents :
    # - 0 documents liés
    # - mais un statut / checklist restés bloqués
    if len(file_ids) == 0 and tf.checklist_json:
        tf.checklist_json = None
        tf.status = TenantFileStatus.NEW
        db.commit()

    return TenantFileDetail(
        id=tf.id,
        status=tf.status.value if hasattr(tf.status, "value") else str(tf.status),
        candidate_email=tf.candidate_email,
        candidate_name=tf.candidate_name,
        checklist_json=tf.checklist_json,
        risk_level=tf.risk_level,
        created_at=tf.created_at,
        updated_at=tf.updated_at,
        email_ids=email_ids,
        file_ids=file_ids
    )

@app.put("/tenant-files/{tenant_id}", response_model=TenantFileDetail)
async def update_tenant_file(
    tenant_id: int,
    payload: TenantFileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_db),
):
    aid = current_user.agency_id
    tf = (
        db.query(TenantFile)
        .filter(TenantFile.id == tenant_id, TenantFile.agency_id == aid)
        .first()
    )
    if not tf:
        raise HTTPException(status_code=404, detail="Dossier introuvable")

    updated = False

    if payload.candidate_email is not None:
        tf.candidate_email = (payload.candidate_email or "").strip() or None
        updated = True

    if payload.candidate_name is not None:
        tf.candidate_name = (payload.candidate_name or "").strip() or None
        updated = True

    if updated:
        tf.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(tf)

    # On réutilise la logique existante pour formater la réponse
    return await get_tenant_file(tenant_id=tenant_id, db=db, current_user=current_user)


@app.delete("/tenant-files/{tenant_id}")
async def delete_tenant_file(
    tenant_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_db),
):
    """
    Supprime un dossier locataire pour l'agence courante.
    ⚠️ Les documents (FileAnalysis) NE sont PAS supprimés,
    seules les liaisons (TenantDocumentLink / TenantEmailLink) le sont via les relations.
    """
    aid = current_user.agency_id

    tf = (
        db.query(TenantFile)
        .filter(TenantFile.id == tenant_id, TenantFile.agency_id == aid)
        .first()
    )
    if not tf:
        raise HTTPException(status_code=404, detail="Dossier locataire introuvable")

    db.delete(tf)
    db.commit()

    return {"status": "deleted"}


@app.post("/tenant-files/from-email/{email_id}", response_model=TenantFileDetail)
async def create_or_link_tenant_from_email(
    email_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_db),
):
    aid = current_user.agency_id

    # 1) On récupère l'email
    email = (
        db.query(EmailAnalysis)
        .filter(
            EmailAnalysis.id == email_id,
            EmailAnalysis.agency_id == aid,
        )
        .first()
    )
    if not email:
        raise HTTPException(status_code=404, detail="Email introuvable")

    # 2) On passe OBLIGATOIREMENT par ensure_tenant_file_for_email (anti-doublon)
    tf = ensure_tenant_file_for_email(
        db=db,
        agency_id=aid,
        email_address=email.sender_email,
    )
    if not tf:
        raise HTTPException(
            status_code=400,
            detail="Impossible de créer/associer un dossier pour cet email.",
        )

    # 3) Lien email ↔ dossier (sans doublon)
    ensure_email_link(
        db=db,
        tenant_file_id=tf.id,
        email_analysis_id=email.id,
    )

    # 4) On recharge le dossier pour avoir les relations à jour
    tf = db.query(TenantFile).filter(TenantFile.id == tf.id).first()
    email_ids = [l.email_analysis_id for l in tf.email_links]
    file_ids = [l.file_analysis_id for l in tf.document_links]

    return TenantFileDetail(
        id=tf.id,
        status=tf.status.value if hasattr(tf.status, "value") else str(tf.status),
        candidate_email=tf.candidate_email,
        candidate_name=tf.candidate_name,
        checklist_json=tf.checklist_json,
        risk_level=tf.risk_level,
        created_at=tf.created_at,
        updated_at=tf.updated_at,
        email_ids=email_ids,
        file_ids=file_ids,
    )



@app.post("/tenant-files/{tenant_id}/attach-document/{file_id}")
async def attach_document_to_tenant(tenant_id: int, file_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_db)):
    aid = current_user.agency_id

    tf = db.query(TenantFile).filter(TenantFile.id == tenant_id, TenantFile.agency_id == aid).first()
    if not tf:
        raise HTTPException(status_code=404, detail="Dossier introuvable")

    fa = db.query(FileAnalysis).filter(FileAnalysis.id == file_id, FileAnalysis.agency_id == aid).first()
    if not fa:
        raise HTTPException(status_code=404, detail="Document introuvable")

    if not db.query(TenantDocumentLink).filter(
        TenantDocumentLink.tenant_file_id == tf.id,
        TenantDocumentLink.file_analysis_id == fa.id
    ).first():
        dt = map_doc_type(f"{getattr(fa, 'file_type', '')} {getattr(fa, 'filename', '')}".strip())
        db.add(TenantDocumentLink(
            tenant_file_id=tf.id,
            file_analysis_id=fa.id,
            doc_type=dt,
            quality=DocQuality.OK
        ))
        db.commit()

    # Recalcul checklist
    links = db.query(TenantDocumentLink).filter(TenantDocumentLink.tenant_file_id == tf.id).all()
    doc_types = [l.doc_type for l in links]
    checklist = compute_checklist(doc_types)

    tf.checklist_json = json.dumps(checklist)
    tf.status = TenantFileStatus.TO_VALIDATE if len(checklist["missing"]) == 0 else TenantFileStatus.INCOMPLETE
    db.commit()

    return {"status": "linked", "tenant_id": tf.id, "file_id": fa.id}

@app.post("/tenant-files/{tenant_id}/upload-document")
async def upload_document_for_tenant(
    tenant_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_db),
):
    aid = current_user.agency_id

    tf = (
        db.query(TenantFile)
        .filter(
            TenantFile.id == tenant_id,
            TenantFile.agency_id == aid,
        )
        .first()
    )
    if not tf:
        raise HTTPException(status_code=404, detail="Dossier locataire introuvable")

    uploads_dir = Path("uploads")
    uploads_dir.mkdir(exist_ok=True)

    safe_name = f"{aid}_{int(time.time())}_{Path(file.filename).name}"

    # Labels pour l'UX
    DOC_LABELS = {
        "id": "Pièce d'identité",
        "payslip": "Bulletin de paie",
        "tax": "Avis d'imposition",
    }

    # 1) on lit le fichier uploadé
    file_bytes = await file.read()

    # 🔍 Empreinte pour éviter les doublons de fichier
    file_hash = hashlib.sha256(file_bytes).hexdigest()

    # 🔁 Si un document identique existe déjà pour cette agence, on le réutilise
    existing_file = (
        db.query(FileAnalysis)
        .filter(
            FileAnalysis.agency_id == aid,
            FileAnalysis.file_hash == file_hash,
        )
        .first()
    )
    if existing_file:
        # On passe quand même par le helper pour gérer les doublons de type dans le dossier
        attach_result = attach_files_to_tenant_file(
            db=db,
            tenant_file=tf,
            file_ids=[existing_file.id],
        )

        checklist = attach_result.get("checklist") or {}
        missing_codes = checklist.get("missing") or []
        duplicate_codes = attach_result.get("duplicate_doc_types") or []

        missing_docs = [DOC_LABELS.get(c, c) for c in missing_codes]
        duplicate_docs = [DOC_LABELS.get(c, c) for c in duplicate_codes]

        return {
            "status": "uploaded",
            "file_id": existing_file.id,
            "tenant_id": tf.id,
            "tenant_status": "complete" if not missing_docs else "incomplete",
            "missing_docs": missing_docs,
            "duplicate_docs": duplicate_docs,
            "from_cache": True,
        }

    # 2) temporaire clair pour l'IA
    tmp_path = uploads_dir / f"tmp_{safe_name}"
    with open(tmp_path, "wb") as f:
        f.write(file_bytes)

    try:
        # 3) analyse IA
        data = await analyze_document_logic(str(tmp_path), safe_name) or {}

        raw_type = str(data.get("type", "Document") or "").strip()
        if not raw_type or raw_type.lower().startswith("erreur"):
            raw_type = "Document"

        # 4) on chiffre et on stocke la version persistée
        encrypted_bytes = encrypt_bytes(file_bytes)
        final_path = uploads_dir / safe_name
        with open(final_path, "wb") as f:
            f.write(encrypted_bytes)

    finally:
        # 5) suppression du temporaire clair
        try:
            os.remove(tmp_path)
        except FileNotFoundError:
            pass

    # 6) création FileAnalysis
    new_file = FileAnalysis(
        filename=safe_name,
        file_type=raw_type,
        sender=tf.candidate_email or "",
        extracted_date=str(data.get("date", "")),
        amount=str(data.get("amount", "0")),
        summary=str(data.get("summary", "Reçu via l'espace locataire")),
        owner_id=None,
        agency_id=aid,
        file_hash=file_hash,
    )
    db.add(new_file)
    db.commit()
    db.refresh(new_file)

    # 7) Lier le document au dossier locataire (anti-doublon + checklist)
    attach_result = attach_files_to_tenant_file(
        db=db,
        tenant_file=tf,
        file_ids=[new_file.id],
    )

    checklist = attach_result.get("checklist") or {}
    missing_codes = checklist.get("missing") or []
    duplicate_codes = attach_result.get("duplicate_doc_types") or []

    missing_docs = [DOC_LABELS.get(c, c) for c in missing_codes]
    duplicate_docs = [DOC_LABELS.get(c, c) for c in duplicate_codes]

    return {
        "status": "uploaded",
        "file_id": new_file.id,
        "tenant_id": tf.id,
        "tenant_status": "complete" if not missing_docs else "incomplete",
        "missing_docs": missing_docs,
        "duplicate_docs": duplicate_docs,
        "from_cache": False,
    }

    # Mapping codes -> labels lisibles
    DOC_LABELS = {
        "id": "Pièce d'identité",
        "payslip": "Bulletin de paie",
        "tax": "Avis d'imposition",
    }

    checklist = attach_result.get("checklist") or {}
    missing_codes = checklist.get("missing") or []
    duplicate_codes = attach_result.get("duplicate_doc_types") or []

    missing_docs = [DOC_LABELS.get(c, c) for c in missing_codes]
    duplicate_docs = [DOC_LABELS.get(c, c) for c in duplicate_codes]

    return {
        "status": "uploaded",
        "file_id": new_file.id,
        "tenant_id": tf.id,
        "tenant_status": (
            tf.status.value if hasattr(tf.status, "value") else str(tf.status)
        ),
        "missing_docs": missing_docs,
        "duplicate_docs": duplicate_docs,
        "checklist": checklist,
    }


@app.delete("/tenant-files/{tenant_id}/documents/{file_id}")
async def detach_document_from_tenant(
    tenant_id: int,
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_db),
):
    aid = current_user.agency_id

    # 1) Vérifier le dossier appartient bien à l'agence
    tf = (
        db.query(TenantFile)
        .filter(TenantFile.id == tenant_id, TenantFile.agency_id == aid)
        .first()
    )
    if not tf:
        raise HTTPException(status_code=404, detail="Dossier introuvable")

    # 2) (Optionnel mais propre) Vérifier que le document appartient à l'agence
    fa = (
        db.query(FileAnalysis)
        .filter(FileAnalysis.id == file_id, FileAnalysis.agency_id == aid)
        .first()
    )
    if not fa:
        raise HTTPException(status_code=404, detail="Document introuvable")

    # 3) Récupérer le lien dossier <-> document
    link = (
        db.query(TenantDocumentLink)
        .filter(
            TenantDocumentLink.tenant_file_id == tf.id,
            TenantDocumentLink.file_analysis_id == fa.id,
        )
        .first()
    )
    if not link:
        raise HTTPException(
            status_code=404,
            detail="Lien document/dossier introuvable",
        )

    # 4) Supprimer UNIQUEMENT ce lien
    db.delete(link)
    db.commit()

    # 5) Recalculer la checklist et le statut du dossier
    remaining_links = (
        db.query(TenantDocumentLink)
        .filter(TenantDocumentLink.tenant_file_id == tf.id)
        .all()
    )

    if not remaining_links:
        # Plus aucun document: on remet le dossier à l'état "nouveau"
        tf.checklist_json = None
        tf.status = TenantFileStatus.NEW
    else:
        doc_types = [l.doc_type for l in remaining_links]
        checklist = compute_checklist(doc_types)

        tf.checklist_json = json.dumps(checklist)
        tf.status = (
            TenantFileStatus.TO_VALIDATE
            if len(checklist["missing"]) == 0
            else TenantFileStatus.INCOMPLETE
        )

    db.commit()

    # 6) Réponse pour le frontend
    resp_checklist = None
    if tf.checklist_json:
        try:
            resp_checklist = json.loads(tf.checklist_json)
        except Exception:
            resp_checklist = None

    return {
        "status": "unlinked",
        "tenant_id": tf.id,
        "file_id": fa.id,
        "new_status": tf.status.value if hasattr(tf.status, "value") else str(tf.status),
        "checklist": resp_checklist,
    }



@app.delete("/email/history/{email_id}")
async def delete_history(
    email_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_db),
):
    """
    Supprime un email d'historique + ses liens locataire (tenant_email_links)
    pour l'agence courante.
    """

    # 1) Vérifier que l'email appartient bien à l'agence
    item = (
        db.query(EmailAnalysis)
        .filter(
            EmailAnalysis.id == email_id,
            EmailAnalysis.agency_id == current_user.agency_id,
        )
        .first()
    )

    if not item:
        raise HTTPException(
            status_code=404,
            detail="Introuvable ou accès refusé",
        )

    # 2) Supprimer d'abord les liens enfants (tenant_email_links)
    db.query(TenantEmailLink).filter(
        TenantEmailLink.email_analysis_id == email_id
    ).delete(synchronize_session=False)

    # 3) Puis supprimer l'email lui-même
    db.delete(item)
    db.commit()

    return {"status": "deleted"}



@app.get("/settings")
async def get_settings_route(db: Session = Depends(get_db), current_user: User = Depends(get_current_user_db)):
    s = db.query(AppSettings).filter(AppSettings.agency_id == current_user.agency_id).first()
    if not s:
        s = AppSettings(agency_id=current_user.agency_id, company_name="Mon Agence")
        db.add(s)
        db.commit()
        db.refresh(s)
    return s

@app.post("/settings")
async def update_settings(req: SettingsRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_db)):
    s = db.query(AppSettings).filter(AppSettings.agency_id == current_user.agency_id).first()
    if not s:
        s = AppSettings(agency_id=current_user.agency_id)
        db.add(s)
    
    s.company_name = req.company_name
    s.agent_name = req.agent_name
    s.tone = req.tone
    s.signature = req.signature
    if req.logo:
        s.logo = req.logo
    
    db.commit()
    return {"status": "updated"}

@app.post("/settings/upload-logo")
async def upload_logo(req: LogoUploadRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_db)):
    try:
        img_str = req.logo_base64
        if "," in img_str:
            header, encoded = img_str.split(",", 1)
        else:
            encoded = img_str
        
        img = Image.open(io.BytesIO(base64.b64decode(encoded)))
        if img.width > 800:
            ratio = 800 / float(img.width)
            img = img.resize((800, int(float(img.height) * ratio)), Image.Resampling.LANCZOS)
        buffer = io.BytesIO()
        fmt = img.format if img.format else "PNG"
        img.save(buffer, format=fmt, optimize=True)
        final = f"data:image/{'jpeg' if fmt.lower() in ['jpg','jpeg'] else 'png'};base64,{base64.b64encode(buffer.getvalue()).decode('utf-8')}"
        
        s = db.query(AppSettings).filter(AppSettings.agency_id == current_user.agency_id).first()
        if not s:
            s = AppSettings(agency_id=current_user.agency_id)
            db.add(s)
        s.logo = final
        db.commit()
        return {"status": "logo_updated"}
    except Exception as e:
        raise HTTPException(500, detail=f"Erreur image: {str(e)}")
    
@app.get("/account/me", response_model=AccountMeResponse)
async def get_my_account(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_db),
):
    agency_name = None
    if current_user.agency_id:
        ag = db.query(Agency).filter(Agency.id == current_user.agency_id).first()
        agency_name = ag.name if ag else None

    ui_prefs = None
    try:
        if getattr(current_user, "ui_prefs_json", None):
            ui_prefs = json.loads(current_user.ui_prefs_json)
    except Exception:
        ui_prefs = None

    return AccountMeResponse(
        email=current_user.email,
        first_name=getattr(current_user, "first_name", None),
        last_name=getattr(current_user, "last_name", None),
        agency_name=agency_name,
        role=str(current_user.role) if current_user.role is not None else None,
        created_at=getattr(current_user, "created_at", None),
        account_status=getattr(current_user, "account_status", None),
        preferred_language=getattr(current_user, "preferred_language", "fr") or "fr",
        ui_prefs=ui_prefs,
    )


@app.patch("/account/me", response_model=AccountMeResponse)
async def update_my_account(
    payload: AccountUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_db),
):
    # ✅ champs user
    if payload.first_name is not None:
        current_user.first_name = payload.first_name.strip() or None

    if payload.last_name is not None:
        current_user.last_name = payload.last_name.strip() or None

    if payload.preferred_language is not None:
        lang = payload.preferred_language.lower().strip()
        if lang in ("fr", "en"):
            current_user.preferred_language = lang

    if payload.ui_prefs is not None:
        current_user.ui_prefs_json = json.dumps(payload.ui_prefs)

    # ✅ agence modifiable seulement si admin agence / super admin
    if payload.agency_name is not None:
        role = (str(current_user.role) or "").lower()
        is_admin = ("agency_admin" in role) or ("super_admin" in role)
        if is_admin and current_user.agency_id:
            new_name = payload.agency_name.strip()
            if new_name:
                ag = db.query(Agency).filter(Agency.id == current_user.agency_id).first()
                if ag:
                    ag.name = new_name

    db.commit()

    # On renvoie la vue à jour
    return await get_my_account(db=db, current_user=current_user)

@app.delete("/account/me")
async def delete_my_account(
    mode: str = Query(default="purge", pattern="^(account|purge)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_db),
):
    agency_id = current_user.agency_id

    # 🔐 Sécurité : limiter taille du contenu email
    if req.content and len(req.content.encode("utf-8")) > MAX_EMAIL_CONTENT_SIZE:
        logger.warning("[SECURITY] Email content too large, truncated")
        req.content = req.content[:MAX_EMAIL_CONTENT_SIZE]


    # --- suppression simple : utilisateur uniquement ---
    if mode == "account" or not agency_id:
        db.query(RefreshToken).filter(
            RefreshToken.user_id == current_user.id
        ).delete(synchronize_session=False)

        db.delete(current_user)
        db.commit()
        return {"success": True, "deleted": "user"}

    # --- vérifier s'il reste d'autres users dans l'agence ---
    users_count = (
        db.query(func.count(User.id))
        .filter(User.agency_id == agency_id)
        .scalar()
        or 0
    )

    if users_count > 1:
        # on supprime uniquement l'utilisateur courant
        db.query(RefreshToken).filter(
            RefreshToken.user_id == current_user.id
        ).delete(synchronize_session=False)

        db.delete(current_user)
        db.commit()

        return {
            "success": True,
            "deleted": "user",
            "note": "agency_not_purged_other_users_exist",
        }

    # --- purge totale : dernier user de l'agence ---

    # 🧹 RGPD — suppression des fichiers physiques chiffrés de l'agence
    files = (
        db.query(FileAnalysis.filename)
        .filter(FileAnalysis.agency_id == agency_id)
        .all()
    )
    for (filename,) in files:
        path = os.path.join("uploads", filename)
        if os.path.exists(path):
            try:
                os.remove(path)
            except OSError:
                # On ne bloque pas la purge si un fichier disque pose problème
                pass

    db.query(AppSettings).filter(
        AppSettings.agency_id == agency_id
    ).delete(synchronize_session=False)

    db.query(EmailAnalysis).filter(
        EmailAnalysis.agency_id == agency_id
    ).delete(synchronize_session=False)

    db.query(FileAnalysis).filter(
        FileAnalysis.agency_id == agency_id
    ).delete(synchronize_session=False)

    db.query(Invoice).filter(
        Invoice.agency_id == agency_id
    ).delete(synchronize_session=False)

    # ✅ Tenant links n'ont PAS agency_id => on filtre via une requête "IN (SELECT ...)"
    tenant_file_ids_q = db.query(TenantFile.id).filter(TenantFile.agency_id == agency_id)

    db.query(TenantEmailLink).filter(
        TenantEmailLink.tenant_file_id.in_(tenant_file_ids_q)
    ).delete(synchronize_session=False)

    db.query(TenantDocumentLink).filter(
        TenantDocumentLink.tenant_file_id.in_(tenant_file_ids_q)
    ).delete(synchronize_session=False)

    db.query(TenantFile).filter(
        TenantFile.agency_id == agency_id
    ).delete(synchronize_session=False)

    # refresh tokens du user
    db.query(RefreshToken).filter(
        RefreshToken.user_id == current_user.id
    ).delete(synchronize_session=False)

    # user
    db.delete(current_user)

    # agency
    ag = db.query(Agency).filter(Agency.id == agency_id).first()
    if ag:
        db.delete(ag)

    db.commit()
    return {"success": True, "deleted": "user+agency"}
# ===============================
# AUTO-LINK EMAIL → DOSSIER LOCATAIRE
# ===============================

def auto_link_email_to_tenant_file(db: Session, email):
    try:
        if not email or not email.agency_id:
            return

        tf = (
            db.query(TenantFile)
            .filter(
                TenantFile.agency_id == email.agency_id,
                func.lower(TenantFile.candidate_email) == email.sender_email.lower(),
            )
            .first()
        )

        if not tf:
            return  # ❗️ pas de création ici

        ensure_email_link(
            db=db,
            tenant_file_id=tf.id,
            email_analysis_id=email.id,
        )

    except Exception as e:
        logger.error(f"[auto_link_email_to_tenant_file] {e}")




# --- PROCESS MANUEL / UPLOAD ---
@app.post("/email/process", response_model=EmailProcessResponse)
async def process_manual(
    req: EmailProcessRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_db),
):
    """
    Traitement manuel d'un email (depuis l’UI) avec la même pipeline que le webhook :
    - analyse des pièces jointes
    - analyse IA de l’email
    - génération de la réponse
    - création EmailAnalysis
    - auto-création / liaison dossier locataire + pièces + checklist
    """
    agency_id = current_user.agency_id

    # 0) Settings agence
    s = (
        db.query(AppSettings)
        .filter(AppSettings.agency_id == agency_id)
        .first()
    )
    comp_name = s.company_name if s else "Mon Agence"

    # 1) TRAITEMENT DES PIÈCES JOINTES (ALIGNÉ WEBHOOK)
    attachment_summary_text = ""
    attachment_file_ids: List[int] = []

    uploads_dir = Path("uploads")
    uploads_dir.mkdir(exist_ok=True)



    if req.attachments:
        for att in req.attachments:
            try:
                # bytes brutes
                file_data = base64.b64decode(att.content_base64)

                # 🔍 Empreinte pour éviter les doublons
                file_hash = hashlib.sha256(file_data).hexdigest()

                existing_file = (
                    db.query(FileAnalysis)
                    .filter(
                        FileAnalysis.agency_id == agency_id,
                        FileAnalysis.file_hash == file_hash,
                    )
                    .first()
                )
                if existing_file:
                    doc_type_code = map_doc_type(existing_file.file_type or "")

                    if is_relevant_for_tenant_file(doc_type_code):
                        attachment_file_ids.append(existing_file.id)
                        attachment_summary_text += (
                            f"- PJ: {att.filename} ({existing_file.file_type or 'Document'})\n"
                        )
                    else:
                        logger.info(
                            f"[FILTER][MANUAL] PJ ignorée pour dossier locataire (déjà existante): "
                            f"{att.filename} (type={doc_type_code})"
                        )

                    continue


                safe_filename = f"{agency_id}_{int(time.time())}_{att.filename}"


                # temporaire clair pour IA
                tmp_path = uploads_dir / f"tmp_{safe_filename}"
                with open(tmp_path, "wb") as f:
                    f.write(file_data)

                file_kind = detect_file_kind(att.filename, att.content_type)

                if file_kind == "unsupported":
                    logger.warning(f"[ATTACHMENT] Format ignoré: {att.filename}")
                    continue

                doc_analysis = None

                if file_kind == "pdf":
                    doc_analysis = await analyze_document_logic(
                        str(tmp_path), safe_filename
                    )

                elif file_kind == "image":
                    # OCR image (texte brut, pas analyse métier)
                    try:
                        doc_analysis = {
                            "type": "Document",
                            "summary": "Image reçue (OCR en cours)",
                            "date": "",
                            "amount": "0",
                        }
                    except Exception as e:
                        logger.warning(f"OCR image failed {att.filename}: {e}")
                        continue


                # stockage chiffré
                encrypted_bytes = encrypt_bytes(file_data)
                final_path = uploads_dir / safe_filename
                with open(final_path, "wb") as f:
                    f.write(encrypted_bytes)

                # nettoyage clair
                try:
                    os.remove(tmp_path)
                except FileNotFoundError:
                    pass

                # création FileAnalysis
                raw_type = str(doc_analysis.get("type", "Document") or "").strip()
                if not raw_type or raw_type.lower().startswith("erreur"):
                    raw_type = "Document"

                new_file = FileAnalysis(
                    filename=safe_filename,
                    file_type=raw_type,
                    sender=req.from_email,
                    extracted_date=str(doc_analysis.get("date", "")),
                    amount=str(doc_analysis.get("amount", "0")),
                    summary=str(doc_analysis.get("summary", "Reçu manuellement")),
                    owner_id=current_user.id,
                    agency_id=agency_id,
                    file_hash=file_hash,
                )
                db.add(new_file)
                db.commit()
                db.refresh(new_file)

                doc_type_code = map_doc_type(new_file.file_type or "")

                if is_relevant_for_tenant_file(doc_type_code):
                    attachment_file_ids.append(new_file.id)
                    attachment_summary_text += (
                        f"- PJ: {att.filename} ({new_file.file_type})\n"
                    )
                else:
                    logger.info(
                        f"[FILTER][MANUAL] PJ ignorée pour dossier locataire: "
                        f"{att.filename} (type={doc_type_code})"
                    )


            except Exception as e:
                logger.error(f"Erreur PJ manual: {e}")

    # 2) ANALYSE EMAIL (avec contexte PJ)
    analyse = await analyze_email_logic(
        EmailAnalyseRequest(
            from_email=req.from_email,
            subject=req.subject,
            content=req.content,
        ),
        comp_name,
        db,
        agency_id,
        attachment_summary=attachment_summary_text,
    )

    # 3) CONTEXTE DOSSIER LOCATAIRE (COMME WEBHOOK)
    tenant_status_for_reply: Optional[str] = None
    missing_docs_for_reply: List[str] = []
    duplicate_docs_for_reply: List[str] = []

    try:
        candidate_email = (req.from_email or "").strip().lower()

        tf = ensure_tenant_file_for_email(
            db=db,
            agency_id=agency_id,
            email_address=candidate_email,
        )

        checklist: Optional[dict] = None
        duplicate_codes: List[str] = []

        if tf:
            if attachment_file_ids:
                attach_result = attach_files_to_tenant_file(
                    db=db,
                    tenant_file=tf,
                    file_ids=attachment_file_ids,
                )
                checklist = attach_result.get("checklist") or {}
                duplicate_codes = attach_result.get("duplicate_doc_types") or []
            else:
                checklist = recompute_tenant_file_status(db, tf)
                duplicate_codes = []

            DOC_LABELS = {
                "id": "Pièce d'identité",
                "payslip": "Bulletin de paie",
                "tax": "Avis d'imposition",
            }

            missing_codes = checklist.get("missing") if checklist else []
            missing_docs_for_reply = [
                DOC_LABELS.get(code, code) for code in missing_codes
            ]

            duplicate_docs_for_reply = [
                DOC_LABELS.get(code, code) for code in duplicate_codes
            ]

            # Statut lisible pour l'email
            raw_status = (tf.status.value if hasattr(tf.status, "value") else str(tf.status)).lower()
            if "new" in raw_status:
                tenant_status_for_reply = "Nouveau dossier (aucun document enregistré)."
            elif "incomplete" in raw_status:
                tenant_status_for_reply = "Dossier incomplet."
            elif "to_validate" in raw_status:
                tenant_status_for_reply = "Dossier complet, en attente de validation."
            elif "complete" in raw_status:
                tenant_status_for_reply = "Dossier complet et validé."
            else:
                tenant_status_for_reply = tf.status.value if hasattr(tf.status, "value") else str(tf.status)

    except Exception as e:
        logger.error(f"⚠️ Contexte dossier locataire manual: {e}")

    # 4) GÉNÉRATION DE LA RÉPONSE (AVEC missing_docs / duplicate_docs)
    reponse = await generate_reply_logic(
        EmailReplyRequest(
            from_email=req.from_email,
            subject=req.subject,
            content=req.content,
            summary=analyse.summary,
            category=analyse.category,
            urgency=analyse.urgency,
            tenant_status=tenant_status_for_reply,
            missing_docs=missing_docs_for_reply,
            duplicate_docs=duplicate_docs_for_reply,
        ),
        comp_name,
        s.tone if s else "pro",
        s.signature if s else "Team",
    )

    # 5) ENREGISTRER L’EMAIL EN BDD
    new_email = EmailAnalysis(
        agency_id=agency_id,
        sender_email=req.from_email,
        subject=req.subject,
        raw_email_text=req.content,
        is_devis=analyse.is_devis,
        category=analyse.category,
        urgency=analyse.urgency,
        summary=analyse.summary,
        suggested_title=analyse.suggested_title,
        suggested_response_text=reponse.reply,
        raw_ai_output=analyse.raw_ai_text,
    )
    db.add(new_email)
    db.commit()
    db.refresh(new_email)

    # 6) AUTO-LIAISON EMAIL → DOSSIER LOCATAIRE
    auto_link_email_to_tenant_file(db, new_email)

    # 7) ENVOI EFFECTIF (optionnel)
    sent = "sent" if req.send_email else "not_sent"
    if req.send_email:
        send_email_via_resend(req.from_email, reponse.subject, reponse.reply)

    # 8) RÉPONSE API
    return EmailProcessResponse(
        analyse=analyse,
        reponse=reponse,
        send_status=sent,
        email_id=new_email.id,
        error=None,
    )
     


@app.post("/api/analyze-file")
async def analyze_file(
    current_user: User = Depends(get_current_user_db),
    db: Session = Depends(get_db),
    file: UploadFile = File(...),
):
    safe_name = f"{current_user.agency_id}_{int(time.time())}_{Path(file.filename).name}"
    uploads_dir = Path("uploads")
    uploads_dir.mkdir(parents=True, exist_ok=True)

    # 🔐 Fichier chiffré final + fichier temporaire en clair (pour l’IA)
    encrypted_path = uploads_dir / safe_name
    tmp_plain_path = uploads_dir / f"tmp_plain_{safe_name}"

    try:
            # 1) Lire tout le contenu envoyé par l’utilisateur
        raw_bytes = await file.read()

        # 🔍 Empreinte pour éviter les doublons (même fichier, même agence)
        file_hash = hashlib.sha256(raw_bytes).hexdigest()

        # Si un document identique existe déjà pour cette agence, on le réutilise
        existing = (
            db.query(FileAnalysis)
            .filter(
                FileAnalysis.agency_id == current_user.agency_id,
                FileAnalysis.file_hash == file_hash,
            )
            .first()
        )
        if existing:
            # On renvoie un JSON cohérent avec ce que l'IA retournerait
            return {
                "type": existing.file_type or "Document",
                "sender": existing.sender or "",
                "date": existing.extracted_date or "",
                "amount": existing.amount or "0",
                "summary": existing.summary or "Document déjà analysé",
                "file_analysis_id": existing.id,
                "from_cache": True,
            }

        # 2) Sauvegarder une copie TEMPORAIRE en clair pour l’IA
        with open(tmp_plain_path, "wb") as f:
            f.write(raw_bytes)


        # 3) Sauvegarder la version CHIFFRÉE sur le disque
        encrypted = encrypt_bytes(raw_bytes)
        with open(encrypted_path, "wb") as f:
            f.write(encrypted)

        # 4) Analyse IA du document (avec le chemin du fichier temporaire en clair)
        data = await analyze_document_logic(str(tmp_plain_path), safe_name)

        if not data:
            return {"extracted": False, "summary": "Erreur lecture JSON"}

        # 5) Enregistrer l’analyse en base
        new_analysis = FileAnalysis(
            filename=safe_name,
            file_type=str(data.get("type", "Inconnu")),
            sender=str(data.get("sender", "Inconnu")),
            extracted_date=str(data.get("date", "")),
            amount=str(data.get("amount", "0")),
            summary=str(data.get("summary", "Pas de résumé")),
            owner_id=current_user.id,
            agency_id=current_user.agency_id,
            file_hash=file_hash,
        )
        db.add(new_analysis)
        db.commit()
        db.refresh(new_analysis)  # ✅ pour avoir new_analysis.id

        # 6) Injecter l'id dans la réponse JSON
        if isinstance(data, dict):
            data["file_analysis_id"] = new_analysis.id

        return data

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        # Toujours fermer le fichier UploadFile
        await file.close()

        # 🧹 Nettoyage : supprimer le fichier temporaire en clair s’il existe
        try:
            if tmp_plain_path.exists():
                tmp_plain_path.unlink()
        except Exception:
            # On ne casse pas la requête juste pour un problème de nettoyage
            pass

@app.get("/api/files/history")
async def get_file_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_db),
):
    return (
        db.query(FileAnalysis)
        .filter(FileAnalysis.agency_id == current_user.agency_id)
        .order_by(FileAnalysis.id.desc())
        .all()
    )


@app.options("/api/files/{file_id}")
async def options_files(file_id: int, request: Request):
    """
    Répond au preflight CORS pour DELETE /api/files/{file_id}.
    """
    origin = request.headers.get("origin", "")

    resp = Response(status_code=204)
    if origin:
        resp.headers["Access-Control-Allow-Origin"] = origin

    resp.headers["Access-Control-Allow-Credentials"] = "true"
    resp.headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,DELETE,OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "Authorization,Content-Type"
    return resp

@app.delete("/api/files/{file_id}")
async def delete_file(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_db),
):
    f = (
        db.query(FileAnalysis)
        .filter(
            FileAnalysis.id == file_id,
            FileAnalysis.agency_id == current_user.agency_id,
        )
        .first()
    )
    if not f:
        raise HTTPException(status_code=404, detail="Introuvable")

    # 1) Récupérer les dossiers locataires impactés par ce fichier
    tenant_ids = [
        row[0]
        for row in db.query(TenantDocumentLink.tenant_file_id)
        .filter(TenantDocumentLink.file_analysis_id == f.id)
        .all()
    ]

    # 2) Supprimer les liens vers les dossiers locataires (évite FK violation)
    db.query(TenantDocumentLink).filter(
        TenantDocumentLink.file_analysis_id == f.id
    ).delete(synchronize_session=False)

    # 3) Recalculer statut + checklist pour chaque dossier impacté
    for tid in tenant_ids:
        tf = db.query(TenantFile).filter(TenantFile.id == tid).first()
        if not tf:
            continue

        remaining_links = (
            db.query(TenantDocumentLink)
            .filter(TenantDocumentLink.tenant_file_id == tf.id)
            .all()
        )

        if not remaining_links:
            # Plus aucun document lié => dossier "nouveau"
            tf.checklist_json = None
            tf.status = TenantFileStatus.NEW
        else:
            doc_types = [l.doc_type for l in remaining_links]
            checklist = compute_checklist(doc_types)

            tf.checklist_json = json.dumps(checklist)
            tf.status = (
                TenantFileStatus.TO_VALIDATE
                if len(checklist.get("missing", [])) == 0
                else TenantFileStatus.INCOMPLETE
            )

    # 4) Supprimer le fichier physique (si présent)
    path = os.path.join("uploads", f.filename)
    if os.path.exists(path):
        try:
            os.remove(path)
        except OSError:
            # on n'empêche pas la suppression DB si le fichier disque pose souci
            pass

    # 5) Supprimer la ligne FileAnalysis
    db.delete(f)
    db.commit()

    return {"status": "deleted"}



# --- INVOICES (MULTI-AGENCE) ---
@app.post("/api/generate-invoice")
async def gen_inv(req: InvoiceRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_db)):
    aid = current_user.agency_id
    s = db.query(AppSettings).filter(AppSettings.agency_id == aid).first()
    
    data = req.dict()
    default_logo = "[https://cdn-icons-png.flaticon.com/512/3135/3135715.png](https://cdn-icons-png.flaticon.com/512/3135/3135715.png)"
    data.update({
        "company_name_header": s.company_name if s else "Agence",
        "logo_url": s.logo if (s and s.logo) else default_logo
    })
    
    db.add(Invoice(
        agency_id=aid,
        owner_id=current_user.id,
        reference=req.invoice_number,
        client_name=req.client_name,
        amount_total=req.amount,
        items_json=json.dumps([i.dict() for i in req.items])
    ))
    db.commit()
    
    pdf_bytes = generate_pdf_bytes(data)
    return Response(content=pdf_bytes, media_type="application/pdf", headers={"Content-Disposition": f"inline; filename=facture_{req.invoice_number}.pdf"})

@app.get("/api/invoices")
async def list_inv(db: Session = Depends(get_db), current_user: User = Depends(get_current_user_db)):
    return db.query(Invoice).filter(Invoice.agency_id == current_user.agency_id).order_by(Invoice.id.desc()).all()
    
@app.delete("/api/invoices/{invoice_id}")
async def delete_invoice(invoice_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_db)):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id, Invoice.agency_id == current_user.agency_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Quittance introuvable ou accès refusé")
    db.delete(inv)
    db.commit()
    return {"status": "deleted"}

@app.get("/api/files/view/{file_id}")
def view_file(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_db),
):
    file = (
        db.query(FileAnalysis)
        .filter(
            FileAnalysis.id == file_id,
            FileAnalysis.agency_id == current_user.agency_id,
        )

        .first()
    )

    if not file:
        raise HTTPException(status_code=404, detail="Fichier introuvable")

    file_path = Path("uploads") / file.filename

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Fichier manquant sur le disque")

    try:
        encrypted_bytes = file_path.read_bytes()
        decrypted_bytes = decrypt_bytes(encrypted_bytes)
    except Exception as e:
        logger.error(f"[FILES] Erreur déchiffrement fichier {file_id}: {e}")
        raise HTTPException(status_code=500, detail="Erreur lecture fichier")

# Détermination du MIME type à partir du nom du fichier
    mime_type, _ = mimetypes.guess_type(file.filename)
    if not mime_type:
        mime_type = "application/octet-stream"

    return Response(
        content=decrypted_bytes,
        media_type=mime_type,
        headers={
            "Content-Disposition": f'inline; filename="{file.filename}"'
        },
    )





@app.get("/api/files/download/{file_id}")
async def download_file(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_db),
):
    f = (
        db.query(FileAnalysis)
        .filter(
            FileAnalysis.id == file_id,
            FileAnalysis.agency_id == current_user.agency_id,
        )
        .first()
    )

    if not f:
        raise HTTPException(404, detail="Fichier introuvable ou accès refusé")

    path = f"uploads/{f.filename}"
    if not os.path.exists(path):
        raise HTTPException(404, detail="Fichier introuvable")

    with open(path, "rb") as fh:
        encrypted = fh.read()

    decrypted = decrypt_bytes(encrypted)

    return Response(
        content=decrypted,  # ✅ BONNE variable
        media_type="application/pdf",  # OK pour l’instant
        headers={
            "Content-Disposition": f'attachment; filename="{f.filename}"'
        },
    )



@app.post("/email/send")
async def send_mail_ep(
    req: SendEmailRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_db),
):
    email = None

    # 🛡️ Si on a un email_id, on vérifie droits + double envoi
    if req.email_id is not None:
        email = (
            db.query(EmailAnalysis)
            .filter(
                EmailAnalysis.id == req.email_id,
                EmailAnalysis.agency_id == current_user.agency_id,
            )
            .first()
        )

        if not email:
            raise HTTPException(
                status_code=404,
                detail="Email introuvable ou accès refusé",
            )

        if email.reply_sent:
            raise HTTPException(
                status_code=409,
                detail="Une réponse a déjà été envoyée pour cet email.",
            )

    # 📤 Envoi réel de l'email
    send_email_via_resend(req.to_email, req.subject, req.body)

    # 📝 Marquer comme répondu si on a bien un email lié
    if email is not None:
        email.reply_sent = True
        email.reply_sent_at = datetime.utcnow()
        db.commit()

    return {"status": "sent"}
#essai 