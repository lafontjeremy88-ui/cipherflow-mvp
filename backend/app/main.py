import os
import json
import logging
import base64
import io
import shutil
import secrets
import time
import re  # ✅ Ajout pour nettoyer l'alias
from typing import Optional, List
from datetime import datetime
from pathlib import Path

from PIL import Image
import resend
from jose import jwt, JWTError

from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session
from starlette.middleware.sessions import SessionMiddleware

from google import genai
from google.genai import types

# Imports internes
from app.security import get_current_user as get_current_user_token
from app.google_oauth import router as google_oauth_router
from app.database.database import get_db, engine, Base
from app.database import models

# ✅ IMPORTS DB (ajout tenant-files)
from app.database.models import (
    EmailAnalysis, AppSettings, User, Invoice, FileAnalysis, Agency, UserRole,
    TenantFile, TenantEmailLink, TenantDocumentLink,
    TenantFileStatus, TenantDocType, DocQuality
)

from app.auth import get_password_hash, verify_password, create_access_token
from app.pdf_service import generate_pdf_bytes

BASE_DIR = os.path.dirname(os.path.dirname(__file__))

# --- LOGGING ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- ENV ---
ENV = os.getenv("ENV", "dev")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "CHANGE_ME")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "60"))

OAUTH_STATE_SECRET = os.getenv("OAUTH_STATE_SECRET", secrets.token_urlsafe(32))

# --- GEMINI CLIENT ---
client = None
try:
    if GEMINI_API_KEY:
        client = genai.Client(
            api_key=GEMINI_API_KEY,
            http_options={'api_version': 'v1beta'}
        )
except Exception as e:
    print(f"Erreur Config Gemini: {e}")

MODEL_NAME = "gemini-2.0-flash"

# --- RESEND ---
RESEND_API_KEY = os.getenv("RESEND_API_KEY")
if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY

# --- FASTAPI APP ---
app = FastAPI()

app.add_middleware(
    SessionMiddleware,
    secret_key=OAUTH_STATE_SECRET,
    same_site="lax",
    https_only=(ENV in ("prod", "production"))
)

app.include_router(google_oauth_router, tags=["Google OAuth"])

# ✅ CORS (corrigé : URLs brutes, pas des liens markdown)
origins = [
    "http://localhost:5173",
    "https://cipherflow-mvp.vercel.app",
    "https://cipherflow.company"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex="https://.*\\.vercel\\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
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
    subject: str
    body: str
    sender: str

class EmailAnalyseResponse(BaseModel):
    category: str
    urgency: str
    summary: str
    suggested_response: str

class EmailReplyRequest(BaseModel):
    email_id: int

class EmailReplyResponse(BaseModel):
    suggested_response: str

class AttachmentModel(BaseModel):
    filename: str
    mimeType: str
    data: str  # base64

class EmailProcessRequest(BaseModel):
    subject: str
    body: str
    from_email: str
    to_email: str
    attachments: Optional[List[AttachmentModel]] = []

class EmailProcessResponse(BaseModel):
    status: str
    analysis_id: int

class SendEmailRequest(BaseModel):
    to_email: str
    subject: str
    body: str

class SettingsRequest(BaseModel):
    company_name: str
    agent_name: str
    tone: str
    signature: str

class LogoUploadRequest(BaseModel):
    logo_base64: str

class EmailHistoryItem(BaseModel):
    id: int
    subject: str
    category: str
    urgency: str
    summary: str
    created_at: datetime

    class Config:
        from_attributes = True

class InvoiceItem(BaseModel):
    label: str
    quantity: int
    unit_price: float

class InvoiceRequest(BaseModel):
    client_name: str
    invoice_number: str
    amount: float
    date: str
    items: List[InvoiceItem]

# ============================
# 🔹 DOSSIERS LOCATAIRES (API)
# ============================

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

class TenantStatusUpdate(BaseModel):
    status: str  # new / incomplete / to_validate / validated / rejected


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
        db.refresh(default_agency)

        admin_user = User(
            email="admin@cipherflow.com",
            hashed_password=get_password_hash("admin123"),
            role=UserRole.SUPER_ADMIN,
            agency_id=default_agency.id
        )
        db.add(admin_user)
        db.commit()
        logger.info("✅ Super Admin créé (admin@cipherflow.com / admin123)")

# --- AUTH HELPERS ---
def get_current_user_db(
    current_user_token=Depends(get_current_user_token),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.email == current_user_token["sub"]).first()
    if not user:
        raise HTTPException(status_code=401, detail="Utilisateur introuvable")
    return user

def require_super_admin(user: User):
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Accès réservé au super admin")

# --- IA HELPERS ---
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
            raw = raw[first+3:last].strip()
        if raw.lower().startswith("json"):
            raw = raw[4:].lstrip()
    start, end = raw.find("{"), raw.rfind("}")
    if start != -1 and end != -1:
        raw = raw[start:end+1]
    try:
        return json.loads(raw)
    except:
        return None


# ✅ HELPERS GESTION LOCATIVE (NOUVEAU)
def map_doc_type(file_type: str) -> TenantDocType:
    """Convertit un type texte (issu IA / filename) en type normalisé dossier locataire."""
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
    """Checklist MVP FR (gestion locative) : ID + PAYSLIP + TAX requis."""
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
            time.sleep(0.2)
            uploaded_file = client.files.get(name=uploaded_file.name)

        prompt = f"""
Tu es un assistant spécialisé dans l'analyse de documents immobiliers et administratifs.
Analyse le document "{filename}" et renvoie un JSON strict avec ces champs :
{{
  "file_type": "...",
  "sender": "...",
  "date": "...",
  "amount": "...",
  "summary": "..."
}}
"""
        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=[prompt, uploaded_file]
        )
        parsed = extract_json_from_text(response.text) or {}
        return {
            "file_type": parsed.get("file_type", "Autre"),
            "sender": parsed.get("sender", ""),
            "date": parsed.get("date", ""),
            "amount": parsed.get("amount", ""),
            "summary": parsed.get("summary", response.text[:500] if response.text else "")
        }
    except Exception as e:
        print(f"Erreur analyse document: {e}")
        return {"summary": "Erreur analyse document"}

async def analyze_email_logic(subject: str, body: str, sender_email: str, settings: AppSettings):
    if not client:
        return {
            "category": "Autre",
            "urgency": "faible",
            "summary": "IA non configurée",
            "suggested_title": subject or "Email",
            "suggested_response": "IA non configurée",
            "raw_ai_output": ""
        }

    prompt = f"""
Tu es un assistant IA de gestion immobilière pour une agence.
Entreprise: {settings.company_name}
Agent: {settings.agent_name}
Ton: {settings.tone}
Signature: {settings.signature}

Analyse cet email et renvoie un JSON strict :
{{
 "category": "...",
 "urgency": "...",
 "summary": "...",
 "suggested_title": "...",
 "suggested_response": "..."
}}
Email:
- From: {sender_email}
- Subject: {subject}
- Body: {body}
"""
    raw = await call_gemini(prompt)
    parsed = extract_json_from_text(raw) or {}

    return {
        "category": parsed.get("category", "Autre"),
        "urgency": parsed.get("urgency", "faible"),
        "summary": parsed.get("summary", ""),
        "suggested_title": parsed.get("suggested_title", subject),
        "suggested_response": parsed.get("suggested_response", ""),
        "raw_ai_output": raw
    }

# ============================================================
# 🟩 ROUTES AUTH
# ============================================================

@app.post("/auth/login", response_model=TokenResponse)
async def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Identifiants invalides")
    token = create_access_token({"sub": user.email})
    return TokenResponse(access_token=token, token_type="bearer", user_email=user.email)

# ============================================================
# 🟩 WEBHOOK WATCHER
# ============================================================

@app.post("/webhook/email", response_model=EmailProcessResponse)
async def webhook_email(req: EmailProcessRequest, db: Session = Depends(get_db)):
    """
    Reçoit un email du watcher (IMAP/Gmail).
    Router via +alias ou via une logique existante, puis analyse IA.
    """
    # 1) ROUTAGE AGENCE via to_email (format: watcher+alias@gmail.com)
    to_email = (req.to_email or "").strip().lower()
    alias = None
    if "+" in to_email:
        try:
            alias = to_email.split("+")[1].split("@")[0]
            alias = re.sub(r"[^a-zA-Z0-9_-]", "", alias)
        except:
            alias = None

    agency = None
    if alias:
        agency = db.query(Agency).filter(Agency.email_alias == alias).first()

    if not agency:
        # fallback : agence 1
        agency = db.query(Agency).order_by(Agency.id.asc()).first()
        if not agency:
            raise HTTPException(status_code=400, detail="Aucune agence configurée")

    agency_id = agency.id

    # 2) SETTINGS
    settings = db.query(AppSettings).filter(AppSettings.agency_id == agency_id).first()
    if not settings:
        settings = AppSettings(agency_id=agency_id)
        db.add(settings)
        db.commit()
        db.refresh(settings)

    # 3) ATTACHMENTS (sauvegarde + analyse)
    attachment_file_ids: List[int] = []

    if req.attachments:
        for att in req.attachments:
            try:
                decoded = base64.b64decode(att.data)
                filename = att.filename or f"file_{int(time.time())}"
                path = os.path.join("uploads", filename)
                with open(path, "wb") as f:
                    f.write(decoded)

                analysis = await analyze_document_logic(path, filename)

                fa = FileAnalysis(
                    agency_id=agency_id,
                    owner_id=1,  # MVP
                    filename=filename,
                    file_type=analysis.get("file_type", "Autre"),
                    sender=analysis.get("sender", ""),
                    extracted_date=analysis.get("date", ""),
                    amount=analysis.get("amount", ""),
                    summary=analysis.get("summary", "")
                )
                db.add(fa)
                db.commit()
                db.refresh(fa)

                attachment_file_ids.append(fa.id)

            except Exception as e:
                print(f"Erreur attachment: {e}")

    # 4) ANALYSE EMAIL
    analyse = await analyze_email_logic(req.subject, req.body, req.from_email, settings)

    new_email = EmailAnalysis(
        agency_id=agency_id,
        sender_email=req.from_email,
        subject=req.subject,
        raw_email_text=req.body,
        is_devis=False,
        category=analyse.get("category", "Autre"),
        urgency=analyse.get("urgency", "faible"),
        summary=analyse.get("summary", ""),
        suggested_title=analyse.get("suggested_title", req.subject),
        suggested_response_text=analyse.get("suggested_response", ""),
        raw_ai_output=analyse.get("raw_ai_output", "")
    )
    db.add(new_email)
    db.commit()
    db.refresh(new_email)

    # ✅ (OPTIONNEL mais utile) : créer/relier un dossier locataire automatiquement
    # Pour le MVP : on crée un dossier si category ressemble à "candidature" / "location"
    try:
        cat = (new_email.category or "").lower().strip()
        if "candid" in cat or "locat" in cat or "dossier" in cat:
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

            # lien email
            if not db.query(TenantEmailLink).filter(
                TenantEmailLink.tenant_file_id == tf.id,
                TenantEmailLink.email_analysis_id == new_email.id
            ).first():
                db.add(TenantEmailLink(tenant_file_id=tf.id, email_analysis_id=new_email.id))
                db.commit()

            # lien documents (ceux de ce mail)
            for fid in attachment_file_ids:
                if not db.query(TenantDocumentLink).filter(
                    TenantDocumentLink.tenant_file_id == tf.id,
                    TenantDocumentLink.file_analysis_id == fid
                ).first():
                    fa = db.query(FileAnalysis).filter(FileAnalysis.id == fid).first()
                    dt = map_doc_type(getattr(fa, "file_type", "") if fa else "")
                    db.add(TenantDocumentLink(
                        tenant_file_id=tf.id,
                        file_analysis_id=fid,
                        doc_type=dt,
                        quality=DocQuality.OK
                    ))
            db.commit()

            # recalcul checklist
            links = db.query(TenantDocumentLink).filter(TenantDocumentLink.tenant_file_id == tf.id).all()
            doc_types = [l.doc_type for l in links]
            checklist = compute_checklist(doc_types)

            tf.checklist_json = json.dumps(checklist)
            tf.status = TenantFileStatus.TO_VALIDATE if len(checklist["missing"]) == 0 else TenantFileStatus.INCOMPLETE
            db.commit()

    except Exception as e:
        print(f"⚠️ Auto dossier locataire: {e}")

    return EmailProcessResponse(status="ok", analysis_id=new_email.id)

# ============================================================
# 🟩 EMAILS / HISTORY / DASHBOARD
# ============================================================

@app.get("/email/history", response_model=List[EmailHistoryItem])
async def get_history(db: Session = Depends(get_db), current_user: User = Depends(get_current_user_db)):
    return (
        db.query(EmailAnalysis)
        .filter(EmailAnalysis.agency_id == current_user.agency_id)
        .order_by(EmailAnalysis.id.desc())
        .all()
    )

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

    # lien email
    exists = db.query(TenantEmailLink).filter(
        TenantEmailLink.tenant_file_id == tf.id,
        TenantEmailLink.email_analysis_id == email.id
    ).first()
    if not exists:
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

    exists = db.query(TenantDocumentLink).filter(
        TenantDocumentLink.tenant_file_id == tf.id,
        TenantDocumentLink.file_analysis_id == fa.id
    ).first()
    if not exists:
        dt = map_doc_type(getattr(fa, "file_type", "") or "")
        db.add(TenantDocumentLink(
            tenant_file_id=tf.id,
            file_analysis_id=fa.id,
            doc_type=dt,
            quality=DocQuality.OK
        ))
        db.commit()

    # recalcul checklist
    links = db.query(TenantDocumentLink).filter(TenantDocumentLink.tenant_file_id == tf.id).all()
    doc_types = [l.doc_type for l in links]
    checklist = compute_checklist(doc_types)

    tf.checklist_json = json.dumps(checklist)
    tf.status = TenantFileStatus.TO_VALIDATE if len(checklist["missing"]) == 0 else TenantFileStatus.INCOMPLETE
    db.commit()

    return {"status": "linked", "tenant_id": tf.id, "file_id": fa.id}
