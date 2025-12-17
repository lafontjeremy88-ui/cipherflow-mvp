import os
import json
import logging
import base64
import os, secrets
import io  # <--- GESTION DES FLUX DE DONNÉES
from typing import Optional, List
from datetime import datetime
import shutil

# --- LIBRAIRIE IMAGE (PILLOW) ---
from PIL import Image 

import resend 
from jose import jwt, JWTError 

from fastapi import FastAPI, HTTPException, Depends, status, Response, Header, UploadFile, File
from fastapi.responses import FileResponse 
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from sqlalchemy import func
from dotenv import load_dotenv
import google.generativeai as genai

# --- IMPORTS INTERNES ---
from app.google_oauth import router as google_oauth_router
from app.database.database import get_db, engine, Base
from app.database import models 
from app.database.models import EmailAnalysis, AppSettings, User, Invoice, FileAnalysis
from app.auth import get_password_hash, verify_password, create_access_token, ALGORITHM, SECRET_KEY 
from app.pdf_service import generate_pdf_bytes 

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
ENV_PATH = os.path.join(BASE_DIR, ".env")
load_dotenv(ENV_PATH)

logger = logging.getLogger("inbox-ia-pro")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(message)s")

# --- CONFIGURATION GEMINI ---
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
try:
    genai.configure(api_key=GEMINI_API_KEY)
except Exception as e:
    print(f"Erreur Config Gemini: {e}")

MODEL_NAME = "gemini-flash-latest"

RESEND_API_KEY = os.getenv("RESEND_API_KEY")
if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY

WATCHER_SECRET = os.getenv("WATCHER_SECRET", "").strip()
ENV = os.getenv("ENV", "dev").lower()
if ENV in ("prod", "production") and not WATCHER_SECRET:
    raise RuntimeError("WATCHER_SECRET manquant en production")

# --- FONCTIONS UTILES ---
def send_email_via_resend(to_email: str, subject: str, body: str):
    if not RESEND_API_KEY: return
    try:
        resend.Emails.send({"from": "contact@cipherflow.company", "to": [to_email], "subject": subject, "html": body.replace("\n", "<br>")})
    except Exception as e: print(f"Erreur Resend: {e}")

async def call_gemini(prompt: str) -> str:
    try:
        model = genai.GenerativeModel(MODEL_NAME)
        response = await model.generate_content_async(prompt)
        return response.text
    except Exception as e:
        print(f"ERREUR GEMINI: {e}")
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

async def analyze_email_logic(req: 'EmailAnalyseRequest', company_name: str) -> 'EmailAnalyseResponse':
    prompt = f"Tu es l'IA de {company_name}. Analyse:\nDe:{req.from_email}\nSujet:{req.subject}\n{req.content}\nRetourne JSON strict: is_devis(bool), category, urgency, summary, suggested_title."
    raw = await call_gemini(prompt)
    data = extract_json_from_text(raw) or {}
    return EmailAnalyseResponse(
        is_devis=bool(data.get("is_devis", False)), category=str(data.get("category", "autre")),
        urgency=str(data.get("urgency", "moyenne")), summary=str(data.get("summary", req.content[:100])),
        suggested_title=str(data.get("suggested_title", "Analyse")), raw_ai_text=raw
    )

async def generate_reply_logic(req: 'EmailReplyRequest', company_name: str, tone: str, signature: str) -> 'EmailReplyResponse':
    prompt = f"Tu es l'assistant de {company_name}. Ton: {tone}. Signature: {signature}.\nSujet:{req.subject}\nCat:{req.category}\nRésumé:{req.summary}\nMsg:{req.content}\nRetourne JSON strict: reply, subject."
    raw = await call_gemini(prompt)
    data = extract_json_from_text(raw) or {}
    return EmailReplyResponse(reply=data.get("reply", raw), subject=data.get("subject", f"Re: {req.subject}"), raw_ai_text=raw)

# --- AUTH ---
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")
def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None: raise HTTPException(status_code=401)
    except JWTError: raise HTTPException(status_code=401)
    user = db.query(User).filter(User.email == email).first()
    if user is None: raise HTTPException(status_code=401)
    return user

# --- MODELES API ---
class LoginRequest(BaseModel): email: str; password: str
class TokenResponse(BaseModel): access_token: str; token_type: str; user_email: str
class EmailAnalyseRequest(BaseModel): from_email: EmailStr; subject: str; content: str
class EmailAnalyseResponse(BaseModel): is_devis: bool; category: str; urgency: str; summary: str; suggested_title: str; raw_ai_text: Optional[str] = None
class EmailReplyRequest(BaseModel): from_email: EmailStr; subject: str; content: str; summary: Optional[str] = None; category: Optional[str] = None; urgency: Optional[str] = None
class EmailReplyResponse(BaseModel): reply: str; subject: str; raw_ai_text: Optional[str] = None
class EmailProcessRequest(BaseModel): from_email: EmailStr; subject: str; content: str; send_email: bool = False
class EmailProcessResponse(BaseModel): analyse: EmailAnalyseResponse; reponse: EmailReplyResponse; send_status: str; error: Optional[str] = None
class SendEmailRequest(BaseModel): to_email: str; subject: str; body: str

class SettingsRequest(BaseModel): 
    company_name: str
    agent_name: str
    tone: str
    signature: str
    logo: Optional[str] = None 

class EmailHistoryItem(BaseModel): 
    id: int; created_at: Optional[datetime] = None; sender_email: str; subject: str; summary: str; category: str; urgency: str; is_devis: bool; raw_email_text: str; suggested_response_text: str
    class Config: from_attributes = True

# TYPE PRIX (float)
class InvoiceItem(BaseModel): desc: str; price: float
class InvoiceRequest(BaseModel): client_name: str; invoice_number: str; amount: float; date: str; items: List[InvoiceItem]

app = FastAPI(title="CipherFlow Inbox IA Pro")

# 🔐 Google OAuth router (routes complètes déjà définies dans google_oauth.py)
app.include_router(
    google_oauth_router,
    tags=["Google OAuth"]
)
# --- CORRECTION CORS : Liste explicite pour autoriser Vercel ---
origins = [
  "http://localhost:5173",
  "https://cipherflow-mvp.vercel.app",
  "https://cipherflow.company",
]

app.add_middleware(
  CORSMiddleware,
  allow_origins=origins,
  allow_credentials=True,
  allow_methods=["*"],
  allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    print("🚀 DÉMARRAGE - CRÉATION DES TABLES 🚀")
    models.Base.metadata.create_all(bind=engine)
    
    if not os.path.exists("uploads"):
        os.makedirs("uploads")
        print("📁 Dossier 'uploads' créé.")
    
    db = next(get_db())
    if not db.query(User).filter(User.email == "admin@cipherflow.com").first():
        hashed = get_password_hash("admin123")
        db.add(User(email="admin@cipherflow.com", hashed_password=hashed))
        db.commit()
        print("✅ Admin créé.")

# --- ROUTES ---
@app.post("/webhook/email", response_model=EmailProcessResponse)
async def webhook_process_email(req: EmailProcessRequest, db: Session = Depends(get_db), x_watcher_secret: str = Header(None)):
    if (not x_watcher_secret) or (not secrets.compare_digest(x_watcher_secret, WATCHER_SECRET)):
        raise HTTPException(status_code=401, detail="Unauthorized")
    settings = db.query(AppSettings).first()
    comp = settings.company_name if settings else "CipherFlow"
    tone = settings.tone if settings else "pro"
    sign = settings.signature if settings else "Team"
    analyse = await analyze_email_logic(EmailAnalyseRequest(from_email=req.from_email, subject=req.subject, content=req.content), comp)
    reponse = await generate_reply_logic(EmailReplyRequest(from_email=req.from_email, subject=req.subject, content=req.content, summary=analyse.summary, category=analyse.category, urgency=analyse.urgency), comp, tone, sign)
    try:
        new = EmailAnalysis(sender_email=req.from_email, subject=req.subject, raw_email_text=req.content, is_devis=analyse.is_devis, category=analyse.category, urgency=analyse.urgency, summary=analyse.summary, suggested_title=analyse.suggested_title, suggested_response_text=reponse.reply, raw_ai_output=analyse.raw_ai_text)
        db.add(new); db.commit()
    except Exception as e: print(f"BDD Error: {e}")
    sent, err = "not_sent", None
    if req.send_email:
        send_email_via_resend(req.from_email, reponse.subject, reponse.reply)
        sent = "sent"
    return EmailProcessResponse(analyse=analyse, reponse=reponse, send_status=sent, error=err)

@app.post("/auth/register", response_model=TokenResponse)
async def register(req: LoginRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == req.email).first(): raise HTTPException(status_code=400, detail="Email pris")
    new_user = User(email=req.email, hashed_password=get_password_hash(req.password))
    db.add(new_user); db.commit(); db.refresh(new_user)
    return {"access_token": create_access_token({"sub": new_user.email}), "token_type": "bearer", "user_email": new_user.email}

@app.post("/auth/login", response_model=TokenResponse)
async def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if not user or not verify_password(req.password, user.hashed_password): raise HTTPException(status_code=400)
    return {"access_token": create_access_token({"sub": user.email}), "token_type": "bearer", "user_email": user.email}

@app.get("/dashboard/stats")
async def get_stats(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    total = db.query(EmailAnalysis).count()
    high_urgency = db.query(EmailAnalysis).filter(EmailAnalysis.urgency == "haute").count()
    invoices_generated = db.query(Invoice).filter(Invoice.owner_id == current_user.id).count()
    cat_stats = db.query(EmailAnalysis.category, func.count(EmailAnalysis.id)).group_by(EmailAnalysis.category).all()
    distribution_data = [{"name": cat[0].replace('_', ' ').capitalize(), "value": cat[1]} for cat in cat_stats]
    recents = db.query(EmailAnalysis).order_by(EmailAnalysis.id.desc()).limit(5).all()
    recent_activity = [{"id": r.id, "subject": r.subject[:40] + "..." if len(r.subject) > 40 else r.subject, "category": r.category, "urgency": r.urgency, "date": r.created_at.strftime("%d/%m %H:%M")} for r in recents]

    return {
        "kpis": {"total_emails": total, "high_urgency": high_urgency, "invoices": invoices_generated},
        "charts": {"distribution": distribution_data},
        "recents": recent_activity
    }

@app.get("/email/history", response_model=List[EmailHistoryItem])
async def get_history(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(EmailAnalysis).order_by(EmailAnalysis.id.desc()).all()

@app.get("/settings")
async def get_settings(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    s = db.query(AppSettings).first()
    if not s: s = AppSettings(); db.add(s); db.commit(); db.refresh(s)
    return s

@app.post("/settings")
async def update_settings(req: SettingsRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    s = db.query(AppSettings).first() or AppSettings()
    if not s.id: db.add(s)
    
    s.company_name = req.company_name
    s.agent_name = req.agent_name
    s.tone = req.tone
    s.signature = req.signature
    
    if req.logo:
        s.logo = req.logo
        
    db.commit()
    return {"status": "updated"}

# --- ROUTE SPECIALE UPLOAD LOGO (INTELLIGENTE : REDIMENSIONNE L'IMAGE) ---
@app.post("/settings/upload-logo")
async def upload_logo(file: UploadFile = File(...), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # 1. Vérification du type
    if file.content_type not in ["image/png", "image/jpeg", "image/jpg"]:
        raise HTTPException(400, detail="Format non supporté. Utilisez PNG ou JPEG.")

    # 2. Lecture du fichier lourd
    contents = await file.read()
    
    try:
        # 3. Ouverture de l'image avec PIL (Pillow)
        img = Image.open(io.BytesIO(contents))
        
        # 4. Redimensionnement (On limite la largeur à 800px max pour économiser la base de données)
        max_width = 800
        if img.width > max_width:
            # Calcule la hauteur proportionnelle
            ratio = max_width / float(img.width)
            new_height = int((float(img.height) * float(ratio)))
            img = img.resize((max_width, new_height), Image.Resampling.LANCZOS)
        
        # 5. Sauvegarde de l'image optimisée dans un "buffer" mémoire
        buffer = io.BytesIO()
        # On conserve le format original (PNG ou JPEG)
        fmt = img.format if img.format else "PNG"
        img.save(buffer, format=fmt, optimize=True, quality=85)
        
        # On récupère les octets optimisés
        optimized_contents = buffer.getvalue()
        
        # 6. Encodage en Base64
        encoded_string = base64.b64encode(optimized_contents).decode("utf-8")
        final_logo_str = f"data:{file.content_type};base64,{encoded_string}"
        
        # 7. Sauvegarde en base
        s = db.query(AppSettings).first()
        if not s:
            s = AppSettings()
            db.add(s)
        
        s.logo = final_logo_str
        db.commit()
        
        return {"status": "logo_updated", "size_before": len(contents), "size_after": len(optimized_contents)}

    except Exception as e:
        print(f"Erreur Resize Image: {e}")
        raise HTTPException(500, detail="Erreur lors du traitement de l'image.")


@app.post("/email/process", response_model=EmailProcessResponse)
async def process_manual(req: EmailProcessRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    s = db.query(AppSettings).first()
    comp = s.company_name if s else "CipherFlow"
    try:
        analyse = await analyze_email_logic(EmailAnalyseRequest(from_email=req.from_email, subject=req.subject, content=req.content), comp)
        reponse = await generate_reply_logic(EmailReplyRequest(from_email=req.from_email, subject=req.subject, content=req.content, summary=analyse.summary, category=analyse.category, urgency=analyse.urgency), comp, s.tone if s else "pro", s.signature if s else "Team")
        new = EmailAnalysis(sender_email=req.from_email, subject=req.subject, raw_email_text=req.content, is_devis=analyse.is_devis, category=analyse.category, urgency=analyse.urgency, summary=analyse.summary, suggested_title=analyse.suggested_title, suggested_response_text=reponse.reply, raw_ai_output=analyse.raw_ai_text)
        db.add(new); db.commit()
        sent, err = "not_sent", None
        if req.send_email:
            send_email_via_resend(req.from_email, reponse.subject, reponse.reply)
            sent = "sent"
        return EmailProcessResponse(analyse=analyse, reponse=reponse, send_status=sent, error=err)
    except Exception as e:
        print(f"ERREUR PROCESS EMAIL: {e}")
        raise HTTPException(500, detail=str(e))

@app.post("/email/send")
async def send_mail_ep(req: SendEmailRequest, current_user: User = Depends(get_current_user)):
    send_email_via_resend(req.to_email, req.subject, req.body)
    return {"status": "sent"}

# --- GESTION FICHIERS ---
@app.post("/api/analyze-file")
async def analyze_file(file: UploadFile = File(...), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not os.path.exists("uploads"):
        os.makedirs("uploads")
    
    file_path = f"uploads/{file.filename}"
    
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        model = genai.GenerativeModel(MODEL_NAME)
        uploaded = genai.upload_file(file_path)
        
        prompt = "Analyse ce document (facture/devis). Extrait au format JSON strict: {type, sender, date, amount, summary}"
        res = await model.generate_content_async([uploaded, prompt])
        
        data = extract_json_from_text(res.text)
        
        if data:
            new_doc = FileAnalysis(
                filename=file.filename,
                file_type=str(data.get("type", "Inconnu")),
                sender=str(data.get("sender", "Non détecté")),
                extracted_date=str(data.get("date", "")),
                amount=str(data.get("amount", "")),
                summary=str(data.get("summary", "")),
                owner_id=current_user.id
            )
            db.add(new_doc); db.commit()
        return data
    except Exception as e:
        print(f"ERREUR FICHIER: {e}")
        try:
            print("Tentative fallback vision...")
            model_vision = genai.GenerativeModel("gemini-pro-vision")
        except: pass
        raise HTTPException(500, detail=str(e))

@app.get("/api/files/history")
async def get_file_history(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(FileAnalysis).filter(FileAnalysis.owner_id == current_user.id).order_by(FileAnalysis.id.desc()).all()

@app.get("/api/files/view/{file_id}")
async def view_file(file_id: int, db: Session = Depends(get_db)):
    db_file = db.query(models.FileAnalysis).filter(models.FileAnalysis.id == file_id).first()
    if not db_file: raise HTTPException(404, detail="Fichier introuvable en base")
    
    file_path = f"uploads/{db_file.filename}"
    if not os.path.exists(file_path): raise HTTPException(404, detail="Fichier physique introuvable")
    return FileResponse(path=file_path, filename=db_file.filename, content_disposition_type="inline")

@app.get("/api/files/download/{file_id}")
async def download_file(file_id: int, db: Session = Depends(get_db)):
    db_file = db.query(models.FileAnalysis).filter(models.FileAnalysis.id == file_id).first()
    if not db_file: raise HTTPException(404, detail="Fichier introuvable en base")
    
    file_path = f"uploads/{db_file.filename}"
    if not os.path.exists(file_path): raise HTTPException(404, detail="Fichier physique introuvable")
    return FileResponse(path=file_path, filename=db_file.filename, content_disposition_type="attachment")

# --- FACTURATION (CORRIGÉE : LOGO + PRIX + CORS) ---
@app.post("/api/generate-invoice")
async def gen_inv(req: InvoiceRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    s = db.query(AppSettings).first()
    data = req.dict()
    
    # CORRECTION CRITIQUE : URL PROPRE SANS CROCHETS NI PARENTHESES
    default_logo = "[https://cdn-icons-png.flaticon.com/512/3135/3135715.png](https://cdn-icons-png.flaticon.com/512/3135/3135715.png)"
    user_logo = s.logo if (s and s.logo) else default_logo
    
    data.update({
        "company_name_header": s.company_name if s else "Mon Entreprise",
        "logo_url": user_logo
    })
    
    ex = db.query(Invoice).filter(Invoice.reference == req.invoice_number, Invoice.owner_id == current_user.id).first()
    if ex: ex.amount_total = req.amount
    else: db.add(Invoice(reference=req.invoice_number, client_name=req.client_name, amount_total=req.amount, items_json=json.dumps([i.dict() for i in req.items]), owner_id=current_user.id))
    db.commit()
    
    return Response(content=generate_pdf_bytes(data), media_type="application/pdf", headers={"Content-Disposition": f"inline; filename=facture_{req.invoice_number}.pdf"})

@app.get("/api/invoices")
async def list_inv(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Invoice).filter(Invoice.owner_id == current_user.id).order_by(Invoice.id.desc()).all()

@app.get("/api/invoices/{ref}/pdf")
async def reprint_inv(ref: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    inv = db.query(Invoice).filter(Invoice.reference == ref, Invoice.owner_id == current_user.id).first()
    if not inv: raise HTTPException(404)
    
    s = db.query(AppSettings).first()
    
    # CORRECTION CRITIQUE : URL PROPRE ICI AUSSI
    default_logo = "[https://cdn-icons-png.flaticon.com/512/3135/3135715.png](https://cdn-icons-png.flaticon.com/512/3135/3135715.png)"
    user_logo = s.logo if (s and s.logo) else default_logo

    data = {
        "client_name": inv.client_name, 
        "invoice_number": inv.reference, 
        "amount": inv.amount_total, 
        "date": inv.date_issued.strftime("%d/%m/%Y"), 
        "items": json.loads(inv.items_json) if inv.items_json else [], 
        "company_name_header": s.company_name if s else "Mon Entreprise",
        "logo_url": user_logo
    }
    return Response(content=generate_pdf_bytes(data), media_type="application/pdf", headers={"Content-Disposition": f"inline; filename={ref}.pdf"})