import os
import json
import logging
from typing import Optional, List
from datetime import datetime, timedelta
import smtplib
from email.message import EmailMessage

# Framework & BDD
from fastapi import FastAPI, HTTPException, Depends, status, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from dotenv import load_dotenv

# --- NOUVEL IMPORT : La bibliothèque officielle Google ---
import google.generativeai as genai

# Imports locaux
from app.database.database import create_tables, get_db
from app.database.models import EmailAnalysis, AppSettings, User
from app.auth import get_password_hash, verify_password, create_access_token
from app.pdf_service import generate_pdf_bytes 

# -----------------------------------------------------------------------------
# 1. CONFIGURATION INITIALE
# -----------------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.dirname(__file__))
ENV_PATH = os.path.join(BASE_DIR, ".env")
load_dotenv(ENV_PATH)

logger = logging.getLogger("inbox-ia-pro")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(message)s")

# Configuration de l'IA (Nettoyage de la clé)
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()

# On configure la bibliothèque officielle
try:
    genai.configure(api_key=GEMINI_API_KEY)
except Exception as e:
    print(f"Erreur config Gemini: {e}")

# On force le modèle stable
MODEL_NAME = "gemini-1.5-flash"

SMTP_HOST = os.getenv("SMTP_HOST")
try:
    SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
except ValueError:
    SMTP_PORT = 587
    
SMTP_USERNAME = os.getenv("SMTP_USERNAME")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SMTP_FROM = os.getenv("SMTP_FROM")

# -----------------------------------------------------------------------------
# 2. SÉCURITÉ (DEPENDENCIES)
# -----------------------------------------------------------------------------
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

def get_current_user(token: str = Depends(oauth2_scheme)):
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalide ou manquant",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return token

# -----------------------------------------------------------------------------
# 3. MODÈLES DE DONNÉES
# -----------------------------------------------------------------------------
class LoginRequest(BaseModel):
    email: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str

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

class EmailProcessRequest(BaseModel):
    from_email: EmailStr
    subject: str
    content: str
    send_email: bool = False

class EmailProcessResponse(BaseModel):
    analyse: EmailAnalyseResponse
    reponse: EmailReplyResponse
    send_status: str
    error: Optional[str] = None

class SendEmailRequest(BaseModel):
    to_email: str
    subject: str
    body: str

class SettingsRequest(BaseModel):
    company_name: str
    agent_name: str
    tone: str
    signature: str

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
    price: str

class InvoiceRequest(BaseModel):
    client_name: str
    invoice_number: str
    amount: str
    date: str
    items: List[InvoiceItem]

# -----------------------------------------------------------------------------
# 4. APP & STARTUP
# -----------------------------------------------------------------------------
app = FastAPI(title="CipherFlow Inbox IA Pro")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    print("Initialisation de la base de données...")
    create_tables()
    db = next(get_db())
    admin_email = "admin@cipherflow.com"
    existing_user = db.query(User).filter(User.email == admin_email).first()
    if not existing_user:
        hashed = get_password_hash("admin123")
        admin_user = User(email=admin_email, hashed_password=hashed)
        db.add(admin_user)
        db.commit()
        print(f"✅ Compte Admin créé : {admin_email}")
    else:
        print("👤 Compte administrateur déjà présent.")

# -----------------------------------------------------------------------------
# 5. HELPERS (NOUVELLE VERSION VIA SDK GOOGLE)
# -----------------------------------------------------------------------------
async def call_gemini(prompt: str) -> str:
    """Appelle Gemini via le SDK officiel (Plus robuste)."""
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY non configurée")
    
    try:
        # On instancie le modèle
        model = genai.GenerativeModel(MODEL_NAME)
        # On lance la génération (en asynchrone pour ne pas bloquer le serveur)
        response = await model.generate_content_async(prompt)
        return response.text
    except Exception as e:
        print(f"ERREUR SDK GEMINI: {e}")
        # En cas d'erreur de modèle introuvable, on tente le modèle générique
        if "404" in str(e):
            print("Tentative de repli sur 'gemini-pro'...")
            try:
                fallback_model = genai.GenerativeModel("gemini-pro")
                response = await fallback_model.generate_content_async(prompt)
                return response.text
            except Exception as e2:
                raise HTTPException(status_code=500, detail=f"Gemini Error (Repli échoué): {e2}")
        raise HTTPException(status_code=500, detail=f"Gemini Error: {e}")

def extract_json_from_text(text: str):
    raw = text.strip()
    if "```" in raw:
        first, last = raw.find("```"), raw.rfind("```")
        if first != -1 and last > first: raw = raw[first+3:last].strip()
        if raw.lower().startswith("json"): raw = raw[4:].lstrip()
    start, end = raw.find("{"), raw.rfind("}")
    if start != -1 and end != -1: raw = raw[start:end+1]
    try: return json.loads(raw)
    except: return None

async def analyze_email_logic(req: EmailAnalyseRequest, company_name: str) -> EmailAnalyseResponse:
    prompt = f"Tu es l'IA de {company_name}. Analyse:\nDe:{req.from_email}\nSujet:{req.subject}\n{req.content}\nRetourne JSON strict: is_devis(bool), category, urgency, summary, suggested_title."
    raw = await call_gemini(prompt)
    struct = extract_json_from_text(raw) or {}
    data = struct if isinstance(struct, dict) else (struct[0] if isinstance(struct, list) and struct else {})
    return EmailAnalyseResponse(
        is_devis=bool(data.get("is_devis", False)), category=str(data.get("category", "autre")),
        urgency=str(data.get("urgency", "moyenne")), summary=str(data.get("summary", req.content[:100])),
        suggested_title=str(data.get("suggested_title", "Analyse")), raw_ai_text=raw
    )

async def generate_reply_logic(req: EmailReplyRequest, company_name: str, tone: str, signature: str) -> EmailReplyResponse:
    prompt = f"Tu es l'assistant de {company_name}. Ton: {tone}. Signature: {signature}.\nSujet:{req.subject}\nCat:{req.category}\nRésumé:{req.summary}\nMsg:{req.content}\nRetourne JSON strict: reply, subject."
    raw = await call_gemini(prompt)
    struct = extract_json_from_text(raw) or {}
    data = struct if isinstance(struct, dict) else (struct[0] if isinstance(struct, list) and struct else {})
    return EmailReplyResponse(reply=data.get("reply", raw), subject=data.get("subject", f"Re: {req.subject}"), raw_ai_text=raw)

def send_email_smtp(to_email: str, subject: str, body: str):
    if not all([SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD, SMTP_FROM]): 
        print("Erreur: Configuration SMTP incomplète.")
        raise RuntimeError("SMTP incomplet")
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = SMTP_FROM, to_email, subject
    msg.set_content(body)
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
        server.starttls(); server.login(SMTP_USERNAME, SMTP_PASSWORD); server.send_message(msg)

# -----------------------------------------------------------------------------
# 6. ROUTES PRINCIPALES
# -----------------------------------------------------------------------------
@app.post("/email/process", response_model=EmailProcessResponse)
async def process_email(req: EmailProcessRequest, db: Session = Depends(get_db), current_user: str = Depends(get_current_user)):
    settings = db.query(AppSettings).first()
    comp = settings.company_name if settings else "CipherFlow"
    tone = settings.tone if settings else "pro"
    sign = settings.signature if settings else "Team"
    
    # 1. Analyse
    analyse = await analyze_email_logic(EmailAnalyseRequest(from_email=req.from_email, subject=req.subject, content=req.content), comp)
    
    # 2. Réponse
    reponse = await generate_reply_logic(EmailReplyRequest(from_email=req.from_email, subject=req.subject, content=req.content, summary=analyse.summary, category=analyse.category, urgency=analyse.urgency), comp, tone, sign)
    
    try:
        new = EmailAnalysis(sender_email=req.from_email, subject=req.subject, raw_email_text=req.content, is_devis=analyse.is_devis, category=analyse.category, urgency=analyse.urgency, summary=analyse.summary, suggested_title=analyse.suggested_title, suggested_response_text=reponse.reply, raw_ai_output=analyse.raw_ai_text)
        db.add(new); db.commit(); db.refresh(new)
    except Exception as e: print(f"BDD Error: {e}")
    
    sent, err = "not_sent", None
    if req.send_email:
        try: send_email_smtp(req.from_email, reponse.subject, reponse.reply); sent = "sent"
        except Exception as e: 
            print(f"Erreur Envoi Email: {e}")
            sent = "error"; err = str(e)
            
    return EmailProcessResponse(analyse=analyse, reponse=reponse, send_status=sent, error=err)

@app.post("/email/send")
async def send_email_endpoint(req: SendEmailRequest, current_user: str = Depends(get_current_user)):
    try: send_email_smtp(req.to_email, req.subject, req.body); return {"status": "sent"}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/generate-invoice")
async def generate_invoice(invoice_data: InvoiceRequest, current_user: str = Depends(get_current_user)):
    try:
        data_dict = invoice_data.dict()
        pdf_bytes = generate_pdf_bytes(data_dict)
        filename = f"facture_{invoice_data.invoice_number}.pdf"
        return Response(content=pdf_bytes, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename={filename}"})
    except Exception as e:
        print(f"Erreur PDF: {e}")
        raise HTTPException(status_code=500, detail=str(e))