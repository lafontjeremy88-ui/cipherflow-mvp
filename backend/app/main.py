import os
import json
import logging
import sys
from typing import Optional, List
from datetime import datetime
import smtplib
from email.message import EmailMessage

from fastapi import FastAPI, HTTPException, Depends, status, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from dotenv import load_dotenv
import google.generativeai as genai

# Imports locaux
from app.database.database import create_tables, get_db
from app.database.models import EmailAnalysis, AppSettings, User
from app.auth import get_password_hash, verify_password, create_access_token
from app.pdf_service import generate_pdf_bytes 

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
ENV_PATH = os.path.join(BASE_DIR, ".env")
load_dotenv(ENV_PATH)

logger = logging.getLogger("inbox-ia-pro")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(message)s")

# --- CONFIGURATION IA ---
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()

# Variable globale pour stocker le modèle VRAIMENT fonctionnel
ACTIVE_MODEL_NAME = "gemini-1.5-flash" 

try:
    genai.configure(api_key=GEMINI_API_KEY)
except Exception as e:
    print(f"Erreur Config Gemini: {e}")

# Config Email
SMTP_HOST = os.getenv("SMTP_HOST")
SMTP_USERNAME = os.getenv("SMTP_USERNAME")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SMTP_FROM = os.getenv("SMTP_FROM")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

def get_current_user(token: str = Depends(oauth2_scheme)):
    if not token:
        raise HTTPException(status_code=401, detail="Token invalide")
    return token

# --- MODÈLES ---
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

# --- APP ---
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
    global ACTIVE_MODEL_NAME
    print(f"🛑 VERSION LIBRAIRIE : {genai.__version__}")
    
    # --- DIAGNOSTIC: TEST DE QUOTA EN DIRECT ---
    print("🔍 TEST DES QUOTAS (TIR RÉEL)...")
    
    candidates = [
        "gemini-2.0-flash-exp", 
        "gemini-1.5-flash",     
        "gemini-1.5-flash-8b",  
        "gemini-2.0-flash",     
        "gemini-pro"            
    ]
    
    found_working = False
    
    for model_name in candidates:
        print(f"   👉 Test de : {model_name} ...")
        try:
            m = genai.GenerativeModel(model_name)
            response = m.generate_content("Test")
            print(f"   ✅ SUCCÈS ! {model_name} répond (Quota OK).")
            ACTIVE_MODEL_NAME = model_name
            found_working = True
            break 
            
        except Exception as e:
            print(f"   ❌ Échec sur {model_name} : {e}")
    
    if found_working:
        print(f"🚀 DÉMARRAGE SUR LE CHAMPION : {ACTIVE_MODEL_NAME} 🚀")
    else:
        print("⚠️ ATTENTION : Aucun modèle n'a répondu. Vérifiez la facturation Google Cloud.")

    create_tables()
    db = next(get_db())
    if not db.query(User).filter(User.email == "admin@cipherflow.com").first():
        hashed = get_password_hash("admin123")
        db.add(User(email="admin@cipherflow.com", hashed_password=hashed))
        db.commit()
        print("✅ Admin créé.")

# --- LOGIQUE INTELLIGENTE ---
async def call_gemini(prompt: str) -> str:
    if not GEMINI_API_KEY: raise RuntimeError("Clé API manquante")
    
    try:
        model = genai.GenerativeModel(ACTIVE_MODEL_NAME)
        response = await model.generate_content_async(prompt)
        return response.text
    except Exception as e:
        print(f"❌ ERREUR IA ({ACTIVE_MODEL_NAME}): {e}")
        if "429" in str(e):
            raise HTTPException(status_code=429, detail="Quota dépassé momentanément.")
        raise HTTPException(status_code=500, detail=f"Erreur IA : {str(e)}")

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

# --- FONCTION D'ENVOI D'EMAIL "BLINDÉE" ---
def send_email_smtp(to_email: str, subject: str, body: str):
    if not all([SMTP_HOST, SMTP_USERNAME, SMTP_PASSWORD, SMTP_FROM]): 
        print("❌ Erreur: Configuration SMTP incomplète dans Railway.")
        return

    msg = EmailMessage()
    msg["From"] = SMTP_FROM
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.set_content(body)

    # Stratégie : On essaie le port 465 (SSL), et si ça rate, le port 587 (TLS)
    ports = [(465, True), (587, False)]
    
    success = False
    for port, use_ssl in ports:
        try:
            print(f"🔌 Tentative connexion SMTP sur le port {port} (SSL={use_ssl})...")
            if use_ssl:
                with smtplib.SMTP_SSL(SMTP_HOST, port, timeout=10) as server:
                    server.login(SMTP_USERNAME, SMTP_PASSWORD)
                    server.send_message(msg)
            else:
                with smtplib.SMTP(SMTP_HOST, port, timeout=10) as server:
                    server.starttls()
                    server.login(SMTP_USERNAME, SMTP_PASSWORD)
                    server.send_message(msg)
            
            print(f"✅ SUCCÈS ! Email envoyé via le port {port}.")
            success = True
            break # On sort de la boucle si ça marche
        except Exception as e:
            print(f"⚠️ Échec sur le port {port}: {e}")

    if not success:
        print("❌ ECHEC TOTAL SMTP : Impossible d'envoyer l'email sur aucun port.")

# --- ROUTES ---
@app.post("/auth/login", response_model=TokenResponse)
async def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Email ou mot de passe incorrect")
    access_token = create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/dashboard/stats")
async def get_dashboard_stats(db: Session = Depends(get_db), current_user: str = Depends(get_current_user)):
    total = db.query(EmailAnalysis).count()
    high = db.query(EmailAnalysis).filter(EmailAnalysis.urgency == "haute").count()
    devis = db.query(EmailAnalysis).filter(EmailAnalysis.category == "demande_devis").count()
    return {"total_processed": total, "high_urgency": high, "devis_requests": devis, "last_update": datetime.now().strftime("%H:%M")}

@app.get("/email/history", response_model=List[EmailHistoryItem])
async def get_history(db: Session = Depends(get_db), current_user: str = Depends(get_current_user)):
    return db.query(EmailAnalysis).order_by(EmailAnalysis.id.desc()).all()

@app.get("/settings")
async def get_settings(db: Session = Depends(get_db), current_user: str = Depends(get_current_user)):
    settings = db.query(AppSettings).first()
    if not settings:
        settings = AppSettings(company_name="CipherFlow", agent_name="Bot", tone="pro", signature="Team")
        db.add(settings); db.commit(); db.refresh(settings)
    return settings

@app.post("/settings")
async def update_settings(req: SettingsRequest, db: Session = Depends(get_db), current_user: str = Depends(get_current_user)):
    settings = db.query(AppSettings).first() or AppSettings()
    if not settings.id: db.add(settings)
    settings.company_name = req.company_name
    settings.agent_name = req.agent_name
    settings.tone = req.tone
    settings.signature = req.signature
    db.commit()
    return {"status": "updated"}

@app.post("/email/process", response_model=EmailProcessResponse)
async def process_email(req: EmailProcessRequest, db: Session = Depends(get_db), current_user: str = Depends(get_current_user)):
    settings = db.query(AppSettings).first()
    comp = settings.company_name if settings else "CipherFlow"
    tone = settings.tone if settings else "pro"
    sign = settings.signature if settings else "Team"
    
    analyse = await analyze_email_logic(EmailAnalyseRequest(from_email=req.from_email, subject=req.subject, content=req.content), comp)
    reponse = await generate_reply_logic(EmailReplyRequest(from_email=req.from_email, subject=req.subject, content=req.content, summary=analyse.summary, category=analyse.category, urgency=analyse.urgency), comp, tone, sign)
    
    sent, err = "not_sent", None
    
    try:
        new = EmailAnalysis(sender_email=req.from_email, subject=req.subject, raw_email_text=req.content, is_devis=analyse.is_devis, category=analyse.category, urgency=analyse.urgency, summary=analyse.summary, suggested_title=analyse.suggested_title, suggested_response_text=reponse.reply, raw_ai_output=analyse.raw_ai_text)
        db.add(new); db.commit(); db.refresh(new)
    except Exception as e: print(f"BDD Error: {e}")
    
    if req.send_email:
        # On ne lance pas d'exception pour ne pas casser la réponse API
        try: 
            send_email_smtp(req.from_email, reponse.subject, reponse.reply)
            sent = "sent"
        except Exception as e:
            sent = "error"
            err = str(e)
            
    return EmailProcessResponse(analyse=analyse, reponse=reponse, send_status=sent, error=err)

@app.post("/email/send")
async def send_email_endpoint(req: SendEmailRequest, current_user: str = Depends(get_current_user)):
    # Ici, on veut savoir si ça plante, donc on laisse send_email_smtp afficher les logs
    send_email_smtp(req.to_email, req.subject, req.body)
    return {"status": "attempted"}

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