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
from typing import Optional, List
from datetime import datetime, timedelta
from pathlib import Path

from fastapi.security import OAuth2PasswordRequestForm

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
)
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from dotenv import load_dotenv
from starlette.middleware.sessions import SessionMiddleware

from google import genai

# Imports internes
from app.security import get_current_user as get_current_user_token
from app.google_oauth import router as google_oauth_router
from app.database.database import get_db, engine, Base
from app.database import models

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

WATCHER_SECRET = os.getenv("WATCHER_SECRET", "").strip()
ENV = os.getenv("ENV", "dev").lower()
OAUTH_STATE_SECRET = os.getenv("OAUTH_STATE_SECRET", "secret_dev_key").strip()

# ============================================================
# ✅ AUTH PRO (ACCESS + REFRESH)
# ============================================================
ACCESS_TOKEN_MINUTES = 15
REFRESH_TOKEN_DAYS = 30

def _is_prod() -> bool:
    return ENV in ("prod", "production")

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
                "from": "contact@cipherflow.company",
                "to": [to_email],
                "subject": subject,
                "html": body.replace("\n", "<br>"),
            }
        )
    except Exception as e:
        print(f"Erreur envoi email: {e}")

async def call_gemini(prompt: str) -> str:
    if not client:
        return "{}"
    try:
        response = client.models.generate_content(model=MODEL_NAME, contents=[prompt])
        return response.text
    except Exception as e:
        print(f"Erreur IA: {e}")
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

def map_doc_type(file_type: str) -> TenantDocType:
    """Mappe un type texte (IA / filename) vers un type normalisé."""
    ft = (file_type or "").lower()
    if "ident" in ft or "cni" in ft or "passeport" in ft:
        return TenantDocType.ID
    if "paie" in ft or "payslip" in ft or "bulletin" in ft:
        return TenantDocType.PAYSLIP
    if "impot" in ft or "imposition" in ft or "tax" in ft or "dgfip" in ft:
        return TenantDocType.TAX
    if "contrat" in ft or "work" in ft:
        return TenantDocType.WORK_CONTRACT
    if "rib" in ft or "banque" in ft or "bank" in ft:
        return TenantDocType.BANK
    return TenantDocType.OTHER

def compute_checklist(doc_types: List[TenantDocType]) -> dict:
    """Checklist MVP FR: ID + PAYSLIP + TAX requis."""
    required = {TenantDocType.ID, TenantDocType.PAYSLIP, TenantDocType.TAX}
    received = set(doc_types)
    missing = list(required - received)
    return {
        "required": [d.value for d in required],
        "received": [d.value for d in received],
        "missing": [d.value for d in missing],
    }

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
        return {"summary": "Erreur analyse", "type": "Erreur"}

async def analyze_email_logic(req, company_name, db: Session, agency_id: int, attachment_summary=""):
    last_files = (
        db.query(FileAnalysis)
        .filter(FileAnalysis.agency_id == agency_id)
        .order_by(FileAnalysis.id.desc())
        .limit(5)
        .all()
    )

    files_context = ""
    if last_files:
        files_context = "CONTEXTE DOCUMENTS (Dossiers récents de l'agence) :\n"
        for f in last_files:
            files_context += f"- Fichier: {f.filename} | Type: {f.file_type} | Montant: {f.amount}\n"

    if attachment_summary:
        files_context += f"\nNOUVELLES PIÈCES JOINTES : {attachment_summary}\n"

    prompt = (
        f"Tu es l'assistant de l'agence immobilière {company_name}. "
        f"{files_context}\n"
        f"Analyse cet email :\n"
        f"De: {req.from_email}\n"
        f"Sujet: {req.subject}\n"
        f"Contenu: {req.content}\n\n"
        f"Retourne un JSON strict :\n"
        f"- is_devis: 'true' si opportunité commerciale/location.\n"
        f"- category: 'Candidature', 'Incident', 'Paiement', 'Administratif', 'Autre'.\n"
        f"- urgency: 'Haute', 'Moyenne', 'Faible'.\n"
        f"- summary: Résumé court.\n"
        f"- suggested_title: Titre court."
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

async def generate_reply_logic(req, company_name, tone, signature):
    prompt = (
        f"Tu es l'assistant de {company_name}. Ton: {tone}. Signature: {signature}.\n"
        f"Sujet:{req.subject}\nCat:{req.category}\nRésumé:{req.summary}\nMsg:{req.content}\n"
        f"Retourne JSON strict: reply, subject."
    )
    raw = await call_gemini(prompt)
    data = extract_json_from_text(raw) or {}
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
@app.on_event("startup")
def on_startup():
    models.Base.metadata.create_all(bind=engine)
    if not os.path.exists("uploads"):
        os.makedirs("uploads")

    # Création Super Admin par défaut
    db = next(get_db())
    if not db.query(User).filter(User.email == "admin@cipherflow.com").first():
        # Créer Agence par défaut (Admin)
        default_agency = Agency(name="CipherFlow HQ", email_alias="admin")
        db.add(default_agency)
        db.commit()

        hashed = get_password_hash("admin123")
        admin = User(
            email="admin@cipherflow.com",
            hashed_password=hashed,
            role=UserRole.SUPER_ADMIN,
            agency_id=default_agency.id,
        )
        db.add(admin)
        db.commit()

# ============================================================
# ✅ ROUTES AUTH PRO
# ============================================================

@app.post("/auth/register", response_model=TokenResponse)
async def register(req: LoginRequest, response: Response, db: Session = Depends(get_db)):

    # 1️⃣ Email unique
    if db.query(User).filter(User.email == req.email).first():
        raise HTTPException(status_code=400, detail="Email déjà utilisé")

    # 2️⃣ Mot de passe fort ✅ ICI
    check_password_policy(req.password)

    # 3️⃣ SAAS AUTO-ONBOARDING
    agency_name = f"Agence de {req.email.split('@')[0]}"


    # ✅ GÉNÉRATION ALIAS AUTOMATIQUE
    clean_alias = re.sub(r"[^a-zA-Z0-9]", "", req.email.split("@")[0]).lower()

    if db.query(Agency).filter(Agency.email_alias == clean_alias).first():
        clean_alias = f"{clean_alias}{int(time.time())}"

    if db.query(Agency).filter(Agency.name == agency_name).first():
        agency_name = f"{agency_name} ({int(time.time())})"

    new_agency = Agency(name=agency_name, email_alias=clean_alias)
    db.add(new_agency)
    db.commit()
    db.refresh(new_agency)

    new_user = User(
        email=req.email,
        hashed_password=get_password_hash(req.password),
        agency_id=new_agency.id,
        role=UserRole.AGENCY_ADMIN,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    default_settings = AppSettings(
        agency_id=new_agency.id,
        company_name=agency_name,
        agent_name="Assistant IA",
        tone="pro",
    )
    db.add(default_settings)
    db.commit()

    # ✅ Access token (court)
    access = create_access_token(
        {"sub": new_user.email},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_MINUTES),
    )

    # ✅ Refresh token (long) stocké hashé en DB + cookie HttpOnly
    refresh = create_refresh_token()
    db.add(
        RefreshToken(
            user_id=new_user.id,
            token_hash=hash_token(refresh),
            created_at=datetime.utcnow(),
            expires_at=datetime.utcnow() + timedelta(days=REFRESH_TOKEN_DAYS),
        )
    )
    db.commit()

    set_refresh_cookie(response, refresh)

    return {"access_token": access, "token_type": "bearer", "user_email": new_user.email}

@app.post("/auth/login", response_model=TokenResponse)
async def login(req: LoginRequest, response: Response, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if not user:
        raise HTTPException(status_code=400, detail="Identifiants incorrects")
    
    if not verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Identifiants incorrects")

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
    response: Response = None,
    db: Session = Depends(get_db),
):
    # FastAPI peut injecter Response si on le met sans Depends
    # MAIS comme tu es en prod, le plus simple: on renvoie nous-même une Response JSON
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Identifiants invalides")

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

    # ✅ on fabrique une réponse HTTP propre (cookie + JSON)
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
async def webhook_process_email(req: EmailProcessRequest, db: Session = Depends(get_db), x_watcher_secret: str = Header(None)):
    if (not x_watcher_secret) or (not secrets.compare_digest(x_watcher_secret, WATCHER_SECRET)):
        raise HTTPException(status_code=401, detail="Invalid Secret")

    # 1. IDENTIFIER L'AGENCE DESTINATAIRE (ROUTAGE INTELLIGENT)
    target_agency = None

    recipient = req.to_email.lower().strip() if req.to_email else ""
    print(f"📨 Routage pour le destinataire : {recipient}")

    if "+" in recipient:
        try:
            alias_part = recipient.split("+")[1].split("@")[0]
            print(f"🔎 Recherche de l'alias : {alias_part}")
            target_agency = db.query(Agency).filter(Agency.email_alias == alias_part).first()
        except:
            pass

    if not target_agency:
        print("⚠️ Pas d'alias détecté, routage vers l'agence par défaut (Fallback)")
        target_agency = db.query(Agency).order_by(Agency.id.asc()).first()

    if not target_agency:
        raise HTTPException(500, "Aucune agence configurée.")

    agency_id = target_agency.id

    s = db.query(AppSettings).filter(AppSettings.agency_id == agency_id).first()
    comp_name = s.company_name if s else target_agency.name

    # 2. TRAITEMENT PJ
    attachment_summary_text = ""
    attachment_file_ids: List[int] = []
    if req.attachments:
        for att in req.attachments:
            try:
                file_data = base64.b64decode(att.content_base64)
                safe_filename = f"{agency_id}_{int(time.time())}_{att.filename}"
                file_path = os.path.join("uploads", safe_filename)

                with open(file_path, "wb") as f:
                    f.write(file_data)

                doc_analysis = await analyze_document_logic(file_path, safe_filename)

                if doc_analysis:
                    new_file = FileAnalysis(
                        filename=safe_filename,
                        file_type=str(doc_analysis.get("type", "Autre")),
                        sender=str(doc_analysis.get("sender", req.from_email)),
                        extracted_date=str(doc_analysis.get("date", "")),
                        amount=str(doc_analysis.get("amount", "0")),
                        summary=str(doc_analysis.get("summary", "Reçu par email")),
                        owner_id=None,
                        agency_id=agency_id,
                    )
                    db.add(new_file)
                    db.commit()
                    db.refresh(new_file)
                    attachment_file_ids.append(new_file.id)
                    attachment_summary_text += f"- PJ: {att.filename} ({doc_analysis.get('type')})\n"
            except Exception as e:
                print(f"Erreur PJ: {e}")

    # 3. ANALYSE EMAIL
    analyse = await analyze_email_logic(
        EmailAnalyseRequest(from_email=req.from_email, subject=req.subject, content=req.content),
        comp_name,
        db,
        agency_id,
        attachment_summary=attachment_summary_text,
    )

    reponse = await generate_reply_logic(
        EmailReplyRequest(
            from_email=req.from_email,
            subject=req.subject,
            content=req.content,
            summary=analyse.summary,
            category=analyse.category,
            urgency=analyse.urgency,
        ),
        comp_name,
        s.tone if s else "pro",
        s.signature if s else "Team",
    )

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

    # ✅ GESTION LOCATIVE AUTO
    try:
        cat = (analyse.category or "").lower().strip() if hasattr(analyse, "category") else (new_email.category or "").lower().strip()
        if ("candid" in cat) or ("locat" in cat) or ("dossier" in cat):
            candidate_email = (req.from_email or "").lower().strip()

            tf = None
            if candidate_email:
                tf = (
                    db.query(TenantFile)
                    .filter(TenantFile.agency_id == agency_id, TenantFile.candidate_email == candidate_email)
                    .order_by(TenantFile.id.desc())
                    .first()
                )

            if not tf:
                tf = TenantFile(agency_id=agency_id, candidate_email=candidate_email, status=TenantFileStatus.NEW)
                db.add(tf)
                db.commit()
                db.refresh(tf)

            if not db.query(TenantEmailLink).filter(
                TenantEmailLink.tenant_file_id == tf.id,
                TenantEmailLink.email_analysis_id == new_email.id,
            ).first():
                db.add(TenantEmailLink(tenant_file_id=tf.id, email_analysis_id=new_email.id))
                db.commit()

            for fid in attachment_file_ids:
                if not db.query(TenantDocumentLink).filter(
                    TenantDocumentLink.tenant_file_id == tf.id,
                    TenantDocumentLink.file_analysis_id == fid,
                ).first():
                    fa = db.query(FileAnalysis).filter(FileAnalysis.id == fid).first()
                    dt = map_doc_type(getattr(fa, "file_type", "") if fa else "")
                    db.add(
                        TenantDocumentLink(
                            tenant_file_id=tf.id,
                            file_analysis_id=fid,
                            doc_type=dt,
                            quality=DocQuality.OK,
                        )
                    )
            db.commit()

            links = db.query(TenantDocumentLink).filter(TenantDocumentLink.tenant_file_id == tf.id).all()
            doc_types = [l.doc_type for l in links]
            checklist = compute_checklist(doc_types)

            tf.checklist_json = json.dumps(checklist)
            tf.status = TenantFileStatus.TO_VALIDATE if len(checklist["missing"]) == 0 else TenantFileStatus.INCOMPLETE
            db.commit()

    except Exception as e:
        print(f"⚠️ Auto dossier locataire: {e}")

    sent = "sent" if req.send_email else "not_sent"
    if req.send_email:
        send_email_via_resend(req.from_email, reponse.subject, reponse.reply)

    return EmailProcessResponse(analyse=analyse, reponse=reponse, send_status=sent)

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
async def get_history(db: Session = Depends(get_db), current_user: User = Depends(get_current_user_db)):
    return (
        db.query(EmailAnalysis)
        .filter(EmailAnalysis.agency_id == current_user.agency_id)
        .order_by(EmailAnalysis.id.desc())
        .all()
    )

# --- (le reste de tes routes: tenant-files, settings, upload, files, invoices, etc.) ---
# ⚠️ IMPORTANT : garde la suite de ton fichier identique à ton original.


# ============================================================
# 🟦 DOSSIERS LOCATAIRES (GESTION LOCATIVE) — API
# ============================================================

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


@app.post("/tenant-files/from-email/{email_id}", response_model=TenantFileDetail)
async def create_or_link_tenant_from_email(email_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_db)):
    aid = current_user.agency_id
    email = db.query(EmailAnalysis).filter(EmailAnalysis.id == email_id, EmailAnalysis.agency_id == aid).first()
    if not email:
        raise HTTPException(status_code=404, detail="Email introuvable")

    candidate_email = (email.sender_email or "").lower().strip()

    tf = None
    if candidate_email:
        tf = (
            db.query(TenantFile)
            .filter(TenantFile.agency_id == aid, TenantFile.candidate_email == candidate_email)
            .order_by(TenantFile.id.desc())
            .first()
        )

    if not tf:
        tf = TenantFile(agency_id=aid, candidate_email=candidate_email, status=TenantFileStatus.NEW)
        db.add(tf)
        db.commit()
        db.refresh(tf)

    # Lier l'email si pas déjà lié
    if not db.query(TenantEmailLink).filter(
        TenantEmailLink.tenant_file_id == tf.id,
        TenantEmailLink.email_analysis_id == email.id
    ).first():
        db.add(TenantEmailLink(tenant_file_id=tf.id, email_analysis_id=email.id))
        db.commit()

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
        file_ids=file_ids
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
        dt = map_doc_type(getattr(fa, "file_type", "") or "")
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



@app.delete("/email/history/{email_id}")
async def delete_history(email_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_db)):
    item = db.query(EmailAnalysis).filter(EmailAnalysis.id == email_id, EmailAnalysis.agency_id == current_user.agency_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Introuvable ou accès refusé")
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

# --- PROCESS MANUEL / UPLOAD ---
@app.post("/email/process", response_model=EmailProcessResponse)
async def process_manual(req: EmailProcessRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_db)):
    aid = current_user.agency_id
    s = db.query(AppSettings).filter(AppSettings.agency_id == aid).first()
    comp = s.company_name if s else "Mon Agence"
    
    analyse = await analyze_email_logic(
        EmailAnalyseRequest(from_email=req.from_email, subject=req.subject, content=req.content), 
        comp, 
        db,
        aid
    )
    reponse = await generate_reply_logic(EmailReplyRequest(from_email=req.from_email, subject=req.subject, content=req.content, summary=analyse.summary, category=analyse.category, urgency=analyse.urgency), comp, s.tone if s else "pro", s.signature if s else "Team")
    
    new_email = EmailAnalysis(
        agency_id=aid,
        sender_email=req.from_email,
        subject=req.subject,
        raw_email_text=req.content,
        is_devis=analyse.is_devis,
        category=analyse.category,
        urgency=analyse.urgency,
        summary=analyse.summary,
        suggested_title=analyse.suggested_title,
        suggested_response_text=reponse.reply,
        raw_ai_output=analyse.raw_ai_text
    )
    db.add(new_email)
    db.commit()
    
    sent = "sent" if req.send_email else "not_sent"
    if req.send_email:
        send_email_via_resend(req.from_email, reponse.subject, reponse.reply)
    
    return EmailProcessResponse(analyse=analyse, reponse=reponse, send_status=sent, email_id=new_email.id)

@app.post("/api/analyze-file")
async def analyze_file(
    current_user: User = Depends(get_current_user_db),
    db: Session = Depends(get_db),
    file: UploadFile = File(...),
):
    safe_name = f"{current_user.agency_id}_{int(time.time())}_{Path(file.filename).name}"
    uploads_dir = Path("uploads")
    uploads_dir.mkdir(parents=True, exist_ok=True)
    file_path = uploads_dir / safe_name

    try:
        with open(file_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        data = await analyze_document_logic(str(file_path), safe_name)
        
        if not data:
            return {"extracted": False, "summary": "Erreur lecture JSON"}

        new_analysis = FileAnalysis(
            filename=safe_name,
            file_type=str(data.get("type", "Inconnu")),
            sender=str(data.get("sender", "Inconnu")),
            extracted_date=str(data.get("date", "")),
            amount=str(data.get("amount", "0")),
            summary=str(data.get("summary", "Pas de résumé")),
            owner_id=current_user.id,
            agency_id=current_user.agency_id
        )
        db.add(new_analysis)
        db.commit()

        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        await file.close()

@app.get("/api/files/history")
async def get_file_history(db: Session = Depends(get_db), current_user: User = Depends(get_current_user_db)):
    return db.query(FileAnalysis).filter(FileAnalysis.agency_id == current_user.agency_id).order_by(FileAnalysis.id.desc()).all()

@app.delete("/api/files/{file_id}")
async def delete_file(file_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_db)):
    f = db.query(FileAnalysis).filter(FileAnalysis.id == file_id, FileAnalysis.agency_id == current_user.agency_id).first()
    if not f:
        raise HTTPException(404, detail="Introuvable")
    
    path = os.path.join("uploads", f.filename)
    if os.path.exists(path):
        os.remove(path)
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
async def view_file(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_db),
):
    f = (
        db.query(FileAnalysis)
        .filter(
            FileAnalysis.id == file_id,
            FileAnalysis.agency_id == current_user.agency_id
        )
        .first()
    )

    if not f:
        raise HTTPException(404, detail="Fichier introuvable ou accès refusé")

    path = f"uploads/{f.filename}"
    if not os.path.exists(path):
        raise HTTPException(404, detail="Fichier introuvable")

    return FileResponse(path=path, filename=f.filename, content_disposition_type="inline")


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
            FileAnalysis.agency_id == current_user.agency_id
        )
        .first()
    )

    if not f:
        raise HTTPException(404, detail="Fichier introuvable ou accès refusé")

    path = f"uploads/{f.filename}"
    if not os.path.exists(path):
        raise HTTPException(404, detail="Fichier introuvable")

    return FileResponse(path=path, filename=f.filename, content_disposition_type="attachment")


@app.post("/email/send")
async def send_mail_ep(req: SendEmailRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_db)):
    send_email_via_resend(req.to_email, req.subject, req.body)
    return {"status": "sent"}