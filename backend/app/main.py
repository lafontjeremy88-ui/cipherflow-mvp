import os
import json
import logging
from typing import Optional, List
from datetime import datetime

import resend 
from jose import jwt, JWTError # Pour décoder le token et savoir qui est connecté

from fastapi import FastAPI, HTTPException, Depends, status, Response, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from dotenv import load_dotenv
import google.generativeai as genai

# Imports locaux
from app.database.database import create_tables, get_db
from app.database.models import EmailAnalysis, AppSettings, User, Invoice
from app.auth import get_password_hash, verify_password, create_access_token, ALGORITHM, SECRET_KEY 
# Assure-toi que ALGORITHM et SECRET_KEY sont bien dans app.auth, sinon on les mettra ici

from app.pdf_service import generate_pdf_bytes 

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
ENV_PATH = os.path.join(BASE_DIR, ".env")
load_dotenv(ENV_PATH)

logger = logging.getLogger("inbox-ia-pro")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(message)s")

# --- 1. CONFIGURATION ---
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
try:
    genai.configure(api_key=GEMINI_API_KEY)
except Exception as e:
    print(f"Erreur Config Gemini: {e}")

MODEL_NAME = "gemini-flash-latest"

RESEND_API_KEY = os.getenv("RESEND_API_KEY")
if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY
else:
    print("⚠️ ATTENTION: Variable RESEND_API_KEY manquante sur Railway !")

WATCHER_SECRET = "CLE_SECRETE_WATCHER_123"

# --- 2. FONCTIONS UTILES ---
def send_email_via_resend(to_email: str, subject: str, body: str):
    print(f"📧 ENVOI RESEND vers {to_email}...")
    if not RESEND_API_KEY:
        raise HTTPException(status_code=500, detail="Clé API Resend manquante.")
    try:
        params = {
            "from": "contact@cipherflow.company",
            "to": [to_email],
            "subject": subject,
            "html": body.replace("\n", "<br>"),
        }
        email = resend.Emails.send(params)
        print(f"✅ EMAIL ENVOYÉ ! ID: {email}")
        return email
    except Exception as e:
        print(f"❌ ERREUR RESEND : {e}")
        raise HTTPException(status_code=500, detail=f"Erreur Resend: {str(e)}")

async def call_gemini(prompt: str) -> str:
    if not GEMINI_API_KEY: raise RuntimeError("Clé API manquante")
    try:
        model = genai.GenerativeModel(MODEL_NAME)
        response = await model.generate_content_async(prompt)
        return response.text
    except Exception as e:
        print(f"ERREUR GEMINI ({MODEL_NAME}): {e}")
        if "404" in str(e) or "429" in str(e):
             try:
                fallback = genai.GenerativeModel("gemini-pro")
                resp = await fallback.generate_content_async(prompt)
                return resp.text
             except: pass
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
    struct = extract_json_from_text(raw) or {}
    data = struct if isinstance(struct, dict) else (struct[0] if isinstance(struct, list) and struct else {})
    return EmailAnalyseResponse(
        is_devis=bool(data.get("is_devis", False)), category=str(data.get("category", "autre")),
        urgency=str(data.get("urgency", "moyenne")), summary=str(data.get("summary", req.content[:100])),
        suggested_title=str(data.get("suggested_title", "Analyse")), raw_ai_text=raw
    )

async def generate_reply_logic(req: 'EmailReplyRequest', company_name: str, tone: str, signature: str) -> 'EmailReplyResponse':
    prompt = f"Tu es l'assistant de {company_name}. Ton: {tone}. Signature: {signature}.\nSujet:{req.subject}\nCat:{req.category}\nRésumé:{req.summary}\nMsg:{req.content}\nRetourne JSON strict: reply, subject."
    raw = await call_gemini(prompt)
    struct = extract_json_from_text(raw) or {}
    data = struct if isinstance(struct, dict) else (struct[0] if isinstance(struct, list) and struct else {})
    return EmailReplyResponse(reply=data.get("reply", raw), subject=data.get("subject", f"Re: {req.subject}"), raw_ai_text=raw)

# --- 3. CONFIG APP & MODELES ---
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

# --- NOUVELLE FONCTION CRITIQUE : RECUPERER LE VRAI UTILISATEUR ---
def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Impossible de valider les identifiants",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        # On décode le token pour trouver l'email
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    # On cherche l'utilisateur dans la BDD
    user = db.query(User).filter(User.email == email).first()
    if user is None:
        raise credentials_exception
    return user # On retourne l'objet User complet (avec son ID !)

class LoginRequest(BaseModel):
    email: str; password: str
class TokenResponse(BaseModel):
    access_token: str; token_type: str
class EmailAnalyseRequest(BaseModel):
    from_email: EmailStr; subject: str; content: str
class EmailAnalyseResponse(BaseModel):
    is_devis: bool; category: str; urgency: str; summary: str; suggested_title: str; raw_ai_text: Optional[str] = None
class EmailReplyRequest(BaseModel):
    from_email: EmailStr; subject: str; content: str; summary: Optional[str] = None; category: Optional[str] = None; urgency: Optional[str] = None
class EmailReplyResponse(BaseModel):
    reply: str; subject: str; raw_ai_text: Optional[str] = None
class EmailProcessRequest(BaseModel):
    from_email: EmailStr; subject: str; content: str; send_email: bool = False
class EmailProcessResponse(BaseModel):
    analyse: EmailAnalyseResponse; reponse: EmailReplyResponse; send_status: str; error: Optional[str] = None
class SendEmailRequest(BaseModel):
    to_email: str; subject: str; body: str
class SettingsRequest(BaseModel):
    company_name: str; agent_name: str; tone: str; signature: str
class EmailHistoryItem(BaseModel):
    id: int; created_at: Optional[datetime] = None; sender_email: str; subject: str; summary: str; category: str; urgency: str; is_devis: bool; raw_email_text: str; suggested_response_text: str
    class Config: from_attributes = True
class InvoiceItem(BaseModel):
    desc: str; price: str
class InvoiceRequest(BaseModel):
    client_name: str; invoice_number: str; amount: str; date: str; items: List[InvoiceItem]

app = FastAPI(title="CipherFlow Inbox IA Pro")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

@app.on_event("startup")
def on_startup():
    print("🚀 DÉMARRAGE - MIGRATION DB AUTO 🚀")
    create_tables() # Cela va recréer la table invoices si elle a été supprimée
    db = next(get_db())
    if not db.query(User).filter(User.email == "admin@cipherflow.com").first():
        hashed = get_password_hash("admin123")
        db.add(User(email="admin@cipherflow.com", hashed_password=hashed))
        db.commit()
        print("✅ Admin créé.")

# --- 4. ROUTES ---

@app.post("/webhook/email", response_model=EmailProcessResponse)
async def webhook_process_email(req: EmailProcessRequest, db: Session = Depends(get_db), x_watcher_secret: str = Header(None)):
    if x_watcher_secret != WATCHER_SECRET:
        print(f"⚠️ Tentative accès non autorisé: {x_watcher_secret}")
        raise HTTPException(status_code=401, detail="Clé Watcher invalide")
    settings = db.query(AppSettings).first()
    comp = settings.company_name if settings else "CipherFlow"
    tone = settings.tone if settings else "pro"
    sign = settings.signature if settings else "Team"
    analyse = await analyze_email_logic(EmailAnalyseRequest(from_email=req.from_email, subject=req.subject, content=req.content), comp)
    reponse = await generate_reply_logic(EmailReplyRequest(from_email=req.from_email, subject=req.subject, content=req.content, summary=analyse.summary, category=analyse.category, urgency=analyse.urgency), comp, tone, sign)
    try:
        new = EmailAnalysis(sender_email=req.from_email, subject=req.subject, raw_email_text=req.content, is_devis=analyse.is_devis, category=analyse.category, urgency=analyse.urgency, summary=analyse.summary, suggested_title=analyse.suggested_title, suggested_response_text=reponse.reply, raw_ai_output=analyse.raw_ai_text)
        db.add(new); db.commit(); db.refresh(new)
    except Exception as e: print(f"BDD Error: {e}")
    sent, err = "not_sent", None
    if req.send_email:
        try: 
            send_email_via_resend(req.from_email, reponse.subject, reponse.reply)
            sent = "sent"
        except Exception as e: sent = "error"; err = str(e)
    return EmailProcessResponse(analyse=analyse, reponse=reponse, send_status=sent, error=err)
@app.post("/auth/register", response_model=TokenResponse)
async def register(req: LoginRequest, db: Session = Depends(get_db)):
    # 1. On vérifie si l'email existe déjà
    existing_user = db.query(User).filter(User.email == req.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Cet email est déjà utilisé.")
    
    # 2. On crée le nouvel utilisateur
    hashed_password = get_password_hash(req.password)
    new_user = User(email=req.email, hashed_password=hashed_password)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    # 3. On le connecte directement (on lui donne un jeton)
    access_token = create_access_token(data={"sub": new_user.email})
    return {"access_token": access_token, "token_type": "bearer"}
@app.post("/auth/login", response_model=TokenResponse)
async def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Email ou mot de passe incorrect")
    access_token = create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/dashboard/stats")
async def get_dashboard_stats(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    total = db.query(EmailAnalysis).count()
    high = db.query(EmailAnalysis).filter(EmailAnalysis.urgency == "haute").count()
    devis = db.query(EmailAnalysis).filter(EmailAnalysis.category == "demande_devis").count()
    return {"total_processed": total, "high_urgency": high, "devis_requests": devis, "last_update": datetime.now().strftime("%H:%M")}

@app.get("/email/history", response_model=List[EmailHistoryItem])
async def get_history(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(EmailAnalysis).order_by(EmailAnalysis.id.desc()).all()

@app.get("/settings")
async def get_settings(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    settings = db.query(AppSettings).first()
    if not settings:
        settings = AppSettings(company_name="CipherFlow", agent_name="Bot", tone="pro", signature="Team")
        db.add(settings); db.commit(); db.refresh(settings)
    return settings

@app.post("/settings")
async def update_settings(req: SettingsRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    settings = db.query(AppSettings).first() or AppSettings()
    if not settings.id: db.add(settings)
    settings.company_name = req.company_name
    settings.agent_name = req.agent_name
    settings.tone = req.tone
    settings.signature = req.signature
    db.commit()
    return {"status": "updated"}

@app.post("/email/process", response_model=EmailProcessResponse)
async def process_email(req: EmailProcessRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    settings = db.query(AppSettings).first()
    comp = settings.company_name if settings else "CipherFlow"
    tone = settings.tone if settings else "pro"
    sign = settings.signature if settings else "Team"
    analyse = await analyze_email_logic(EmailAnalyseRequest(from_email=req.from_email, subject=req.subject, content=req.content), comp)
    reponse = await generate_reply_logic(EmailReplyRequest(from_email=req.from_email, subject=req.subject, content=req.content, summary=analyse.summary, category=analyse.category, urgency=analyse.urgency), comp, tone, sign)
    try:
        new = EmailAnalysis(sender_email=req.from_email, subject=req.subject, raw_email_text=req.content, is_devis=analyse.is_devis, category=analyse.category, urgency=analyse.urgency, summary=analyse.summary, suggested_title=analyse.suggested_title, suggested_response_text=reponse.reply, raw_ai_output=analyse.raw_ai_text)
        db.add(new); db.commit(); db.refresh(new)
    except Exception as e: print(f"BDD Error: {e}")
    sent, err = "not_sent", None
    if req.send_email:
        try: 
            send_email_via_resend(req.from_email, reponse.subject, reponse.reply)
            sent = "sent"
        except Exception as e: sent = "error"; err = str(e)
    return EmailProcessResponse(analyse=analyse, reponse=reponse, send_status=sent, error=err)

@app.post("/email/send")
async def send_email_endpoint(req: SendEmailRequest, current_user: User = Depends(get_current_user)):
    send_email_via_resend(req.to_email, req.subject, req.body)
    return {"status": "sent"}

# --- PARTIE FACTURATION SÉCURISÉE (BRIQUE C) ---

@app.post("/api/generate-invoice")
async def generate_invoice(invoice_data: InvoiceRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        settings = db.query(AppSettings).first()
        company_name = settings.company_name if settings else "Mon Entreprise"
        
        data_dict = invoice_data.dict()
        data_dict['company_name_header'] = company_name
        data_dict['logo_url'] = "[https://cdn-icons-png.flaticon.com/512/3135/3135715.png](https://cdn-icons-png.flaticon.com/512/3135/3135715.png)"
        
        # SÉCURITÉ : On vérifie si la facture existe ET si elle appartient bien à l'utilisateur
        existing = db.query(Invoice).filter(
            Invoice.reference == invoice_data.invoice_number,
            Invoice.owner_id == current_user.id # <--- SEUL LE PROPRIO PEUT MODIFIER
        ).first()
        
        if existing:
            existing.amount_total = invoice_data.amount
            db.commit()
        else:
            items_str = json.dumps([item.dict() for item in invoice_data.items])
            new_invoice = Invoice(
                reference=invoice_data.invoice_number,
                client_name=invoice_data.client_name,
                amount_total=invoice_data.amount,
                status="émise",
                items_json=items_str,
                owner_id=current_user.id # <--- ON GRAVE LE NOM DU PROPRIO DESSUS
            )
            db.add(new_invoice); db.commit(); db.refresh(new_invoice)

        pdf_bytes = generate_pdf_bytes(data_dict)
        filename = f"facture_{invoice_data.invoice_number}.pdf"
        
        return Response(content=pdf_bytes, media_type="application/pdf", headers={"Content-Disposition": f"inline; filename={filename}"})

    except Exception as e:
        print(f"❌ Erreur Facture: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/invoices")
async def get_invoices(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # FILTRAGE : On ne retourne QUE les factures de l'utilisateur connecté
    return db.query(Invoice).filter(Invoice.owner_id == current_user.id).order_by(Invoice.id.desc()).all()

@app.get("/api/invoices/{reference}/pdf")
async def get_invoice_pdf_reprint(reference: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # SÉCURITÉ : On vérifie le proprio ici aussi
    invoice = db.query(Invoice).filter(
        Invoice.reference == reference,
        Invoice.owner_id == current_user.id # <--- INTERDIT DE VOIR LA FACTURE DU VOISIN
    ).first()
    
    if not invoice:
        raise HTTPException(status_code=404, detail="Facture introuvable ou accès refusé")

    settings = db.query(AppSettings).first()
    company_name = settings.company_name if settings else "Mon Entreprise"

    try: items = json.loads(invoice.items_json)
    except: items = []

    data_dict = {
        "client_name": invoice.client_name,
        "invoice_number": invoice.reference,
        "amount": invoice.amount_total,
        "date": invoice.date_issued.strftime("%d/%m/%Y"),
        "items": items,
        "company_name_header": company_name,
        "logo_url": "[https://cdn-icons-png.flaticon.com/512/3135/3135715.png](https://cdn-icons-png.flaticon.com/512/3135/3135715.png)"
    }

    pdf_bytes = generate_pdf_bytes(data_dict)
    filename = f"facture_{reference}.pdf"
    
    return Response(content=pdf_bytes, media_type="application/pdf", headers={"Content-Disposition": f"inline; filename={filename}"})