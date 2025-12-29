import os
import json
import logging
import base64
import io
import shutil
import secrets
import time
from typing import Optional, List
from datetime import datetime
from pathlib import Path

from PIL import Image
import resend
from jose import jwt, JWTError
from sqlalchemy import text as sql_text, func
from sqlalchemy.orm import Session
from fastapi import FastAPI, HTTPException, Depends, status, Response, Header, UploadFile, File, Form
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, EmailStr
from dotenv import load_dotenv
from starlette.middleware.sessions import SessionMiddleware

# --- LIBRAIRIE IA ---
from google import genai
from google.genai import types

from app.security import get_current_user
from app.google_oauth import router as google_oauth_router
from app.database.database import get_db, engine, Base
from app.database import models
from app.database.models import EmailAnalysis, AppSettings, User, Invoice, FileAnalysis
from app.auth import get_password_hash, verify_password, create_access_token
from app.pdf_service import generate_pdf_bytes

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
ENV_PATH = os.path.join(BASE_DIR, ".env")
load_dotenv(ENV_PATH)

# --- CONFIGURATION ---
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
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

RESEND_API_KEY = os.getenv("RESEND_API_KEY")
if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY

WATCHER_SECRET = os.getenv("WATCHER_SECRET", "").strip()
ENV = os.getenv("ENV", "dev").lower()
OAUTH_STATE_SECRET = os.getenv("OAUTH_STATE_SECRET", "secret_dev_key").strip()

# --- FONCTIONS UTILITAIRES ---
def send_email_via_resend(to_email: str, subject: str, body: str):
    if not RESEND_API_KEY:
        print("Resend API Key manquant")
        return
    try:
        resend.Emails.send({
            "from": "contact@cipherflow.company",
            "to": [to_email],
            "subject": subject,
            "html": body.replace("\n", "<br>")
        })
    except Exception as e:
        print(f"Erreur envoi email: {e}")

async def call_gemini(prompt: str) -> str:
    if not client:
        return "{}"
    try:
        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=[prompt]
        )
        return response.text
    except Exception as e:
        print(f"Erreur IA (call_gemini): {e}")
        return "{}" 

def extract_json_from_text(text: str):
    if not text: return None
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

# --- 🧠 CERVEAU ANALYSE EMAIL + RAG (DOCUMENTS) ---
async def analyze_email_logic(req, company_name, db: Session):
    
    # 1. RAG : Récupérer les 5 derniers documents analysés pour donner du contexte
    last_files = db.query(FileAnalysis).order_by(FileAnalysis.id.desc()).limit(5).all()
    files_context = ""
    if last_files:
        files_context = "CONTEXTE DOCUMENTS (Pièces jointes reçues récemment) :\n"
        for f in last_files:
            files_context += f"- Fichier: {f.filename} | Type: {f.file_type} | Montant: {f.amount} | Résumé: {f.summary}\n"
    
    # 2. PROMPT ENRICHI
    prompt = (
        f"Tu es l'assistant IA de l'agence immobilière {company_name}. "
        f"Ton rôle est de trier les emails entrants pour un gestionnaire locatif.\n\n"
        f"{files_context}\n"
        f"Analyse cet email :\n"
        f"De: {req.from_email}\n"
        f"Sujet: {req.subject}\n"
        f"Contenu: {req.content}\n\n"
        f"INSTRUCTION IMPORTANTE : Si l'email parle de pièces jointes ou de dossier, vérifie dans le 'CONTEXTE DOCUMENTS' ci-dessus si on a reçu des fichiers correspondants (bulletin de paie, avis d'impôt...) et mentionne-le dans le résumé.\n\n"
        f"Retourne un JSON strict (sans markdown) avec ces champs :\n"
        f"- is_devis: Mets 'true' si c'est une demande de location ou un envoi de dossier.\n"
        f"- category: Choisis PARMI : 'Candidature', 'Incident Technique', 'Paiement/Loyer', 'Administratif', 'Autre'.\n"
        f"- urgency: 'Haute' (Fuite, Panne, Sécurité), 'Moyenne' (Dossier, Loyer), 'Faible' (Pub, Info).\n"
        f"- summary: Résumé court (ex: 'Dossier complet reçu avec fiche de paie de 1700€').\n"
        f"- suggested_title: Titre pour le dashboard."
    )
    
    raw = await call_gemini(prompt)
    data = extract_json_from_text(raw) or {}
    
    return EmailAnalyseResponse(
        is_devis=bool(data.get("is_devis", False)),
        category=str(data.get("category", "Autre")),
        urgency=str(data.get("urgency", "Moyenne")),
        summary=str(data.get("summary", "Analyse non disponible")),
        suggested_title=str(data.get("suggested_title", "Nouvel Email")),
        raw_ai_text=raw
    )

async def generate_reply_logic(req, company_name, tone, signature):
    prompt = f"Tu es l'assistant de {company_name}. Ton: {tone}. Signature: {signature}.\nSujet:{req.subject}\nCat:{req.category}\nRésumé:{req.summary}\nMsg:{req.content}\nRetourne JSON strict: reply, subject."
    raw = await call_gemini(prompt)
    data = extract_json_from_text(raw) or {}
    return EmailReplyResponse(
        reply=data.get("reply", raw),
        subject=data.get("subject", f"Re: {req.subject}"),
        raw_ai_text=raw
    )

# --- SETUP FASTAPI ---
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

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

class EmailProcessRequest(BaseModel):
    from_email: EmailStr
    subject: str
    content: str
    send_email: bool = False

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

class FileUploadRequest(BaseModel):
    file_base64: str
    filename: str

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

app = FastAPI(title="CipherFlow Inbox IA Pro")

app.add_middleware(
    SessionMiddleware,
    secret_key=OAUTH_STATE_SECRET,
    same_site="lax",
    https_only=(ENV in ("prod", "production"))
)

app.include_router(google_oauth_router, tags=["Google OAuth"])

origins = [
    "http://localhost:5173",
    "[https://cipherflow-mvp.vercel.app](https://cipherflow-mvp.vercel.app)",
    "[https://cipherflow.company](https://cipherflow.company)"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex="https://.*\\.vercel\\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

def get_user_id(user):
    if hasattr(user, 'id'): return user.id
    if isinstance(user, dict): return user.get('id')
    return None

@app.on_event("startup")
def on_startup():
    models.Base.metadata.create_all(bind=engine)
    if not os.path.exists("uploads"):
        os.makedirs("uploads")
    db = next(get_db())
    if not db.query(User).filter(User.email == "admin@cipherflow.com").first():
        hashed = get_password_hash("admin123")
        db.add(User(email="admin@cipherflow.com", hashed_password=hashed))
        db.commit()

# --- WEBHOOK MODIFIÉ (PASSE LA DB) ---
@app.post("/webhook/email", response_model=EmailProcessResponse)
async def webhook_process_email(req: EmailProcessRequest, db: Session = Depends(get_db), x_watcher_secret: str = Header(None)):
    if (not x_watcher_secret) or (not secrets.compare_digest(x_watcher_secret, WATCHER_SECRET)):
        raise HTTPException(status_code=401, detail="Invalid Secret")
    
    s = db.query(AppSettings).first()
    comp = s.company_name if s else "CipherFlow"
    
    # On passe db à l'analyseur
    analyse = await analyze_email_logic(EmailAnalyseRequest(from_email=req.from_email, subject=req.subject, content=req.content), comp, db)
    reponse = await generate_reply_logic(EmailReplyRequest(from_email=req.from_email, subject=req.subject, content=req.content, summary=analyse.summary, category=analyse.category, urgency=analyse.urgency), comp, s.tone if s else "pro", s.signature if s else "Team")
    
    new_email = EmailAnalysis(
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
    
    return EmailProcessResponse(analyse=analyse, reponse=reponse, send_status=sent)

@app.post("/auth/register", response_model=TokenResponse)
async def register(req: LoginRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == req.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    new_user = User(email=req.email, hashed_password=get_password_hash(req.password))
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {"access_token": create_access_token({"sub": new_user.email}), "token_type": "bearer", "user_email": new_user.email}

@app.post("/auth/login", response_model=TokenResponse)
async def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Invalid credentials")
    return {"access_token": create_access_token({"sub": user.email}), "token_type": "bearer", "user_email": user.email}

@app.get("/dashboard/stats")
async def get_stats(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    user_id = get_user_id(current_user)
    total = db.query(EmailAnalysis).count()
    high = db.query(EmailAnalysis).filter(EmailAnalysis.urgency == "haute").count()
    inv = db.query(Invoice).filter(Invoice.owner_id == user_id).count()
    
    cat_stats = db.query(EmailAnalysis.category, func.count(EmailAnalysis.id)).group_by(EmailAnalysis.category).all()
    dist = [{"name": c[0], "value": c[1]} for c in cat_stats]
    
    recents = db.query(EmailAnalysis).order_by(EmailAnalysis.id.desc()).limit(5).all()
    rec_act = [{
        "id": r.id, 
        "subject": r.subject, 
        "category": r.category, 
        "urgency": r.urgency, 
        "date": r.created_at.strftime("%d/%m %H:%M") if r.created_at else ""
    } for r in recents]
    
    return {"kpis": {"total_emails": total, "high_urgency": high, "invoices": inv}, "charts": {"distribution": dist}, "recents": rec_act}

@app.get("/email/history", response_model=List[EmailHistoryItem])
async def get_history(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(EmailAnalysis).order_by(EmailAnalysis.id.desc()).all()

@app.delete("/email/history/{email_id}")
async def delete_history(email_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item = db.query(EmailAnalysis).filter(EmailAnalysis.id == email_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Introuvable")
    db.delete(item)
    db.commit()
    return {"status": "deleted"}

@app.get("/settings")
async def get_settings_route(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    s = db.query(AppSettings).first()
    if not s:
        s = AppSettings()
        db.add(s)
        db.commit()
        db.refresh(s)
    return s

@app.post("/settings")
async def update_settings(req: SettingsRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    s = db.query(AppSettings).first()
    if not s:
        s = AppSettings()
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
async def upload_logo(req: LogoUploadRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
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
        
        s = db.query(AppSettings).first()
        if not s:
            s = AppSettings()
            db.add(s)
        s.logo = final
        db.commit()
        return {"status": "logo_updated"}
    except Exception as e:
        raise HTTPException(500, detail=f"Erreur image: {str(e)}")

# --- PROCESS MANUAL MODIFIÉ (PASSE LA DB) ---
@app.post("/email/process", response_model=EmailProcessResponse)
async def process_manual(req: EmailProcessRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    s = db.query(AppSettings).first()
    comp = s.company_name if s else "CipherFlow"
    
    # On passe db à l'analyseur
    analyse = await analyze_email_logic(EmailAnalyseRequest(from_email=req.from_email, subject=req.subject, content=req.content), comp, db)
    reponse = await generate_reply_logic(EmailReplyRequest(from_email=req.from_email, subject=req.subject, content=req.content, summary=analyse.summary, category=analyse.category, urgency=analyse.urgency), comp, s.tone if s else "pro", s.signature if s else "Team")
    
    new_email = EmailAnalysis(
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

@app.post("/email/send")
async def send_mail_ep(req: SendEmailRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    send_email_via_resend(req.to_email, req.subject, req.body)
    if req.email_id:
        email = db.query(EmailAnalysis).filter(EmailAnalysis.id == req.email_id).first()
        if email:
            email.send_status = "sent"
            db.commit()
    return {"status": "sent"}

@app.post("/api/analyze-file")
async def analyze_file(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    file: UploadFile = File(...),
):
    if not client:
        raise HTTPException(status_code=500, detail="Configuration IA manquante")

    safe_name = Path(file.filename).name if file and file.filename else "document.pdf"
    uploads_dir = Path("uploads")
    uploads_dir.mkdir(parents=True, exist_ok=True)
    file_path = uploads_dir / safe_name

    try:
        with open(file_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        uploaded_file = client.files.upload(file=str(file_path))

        while uploaded_file.state.name == "PROCESSING":
            time.sleep(1)
            uploaded_file = client.files.get(name=uploaded_file.name)

        if uploaded_file.state.name == "FAILED":
             raise ValueError("L'IA n'a pas réussi à traiter le fichier.")

        prompt = (
            "Tu es un expert en vérification de dossiers locataires pour une agence immobilière. "
            "Analyse ce document et retourne un JSON strict (sans markdown ```json) avec les champs suivants :\n"
            "- type: Choisis EXACTEMENT une de ces valeurs : 'Bulletin de paie', 'Avis d'imposition', 'Pièce d'identité', 'Quittance de loyer', 'Facture', 'Autre'.\n"
            "- sender: Nom de l'employeur, de l'organisme (ex: DGFIP) ou de l'émetteur.\n"
            "- date: Date du document (format DD/MM/YYYY).\n"
            "- amount: Montant clé (ex: Net à payer pour une paie, Revenu fiscal pour un avis d'impôt). Mets '0' si non applicable (ex: CNI).\n"
            "- summary: Une phrase de synthèse (ex: 'Bulletin de paie Janvier 2023 - CDI confirmé')."
        )

        res = client.models.generate_content(
            model=MODEL_NAME,
            contents=[uploaded_file, prompt]
        )
        
        data = extract_json_from_text(res.text)
        if not data:
            return {"extracted": False, "raw_text": res.text, "summary": "Erreur lecture JSON"}

        new_analysis = FileAnalysis(
            filename=safe_name,
            file_type=str(data.get("type", "Inconnu")),
            sender=str(data.get("sender", "Inconnu")),
            extracted_date=str(data.get("date", "")),
            amount=str(data.get("amount", "0")),
            summary=str(data.get("summary", "Pas de résumé")),
            owner_id=get_user_id(current_user),
        )
        db.add(new_analysis)
        db.commit()

        return data

    except Exception as e:
        print(f"ERREUR DOC: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        await file.close()

@app.get("/api/files/history")
async def get_file_history(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        files = db.query(FileAnalysis).filter(FileAnalysis.owner_id == get_user_id(current_user)).order_by(FileAnalysis.id.desc()).all()
        return files
    except Exception as e:
        print(f"Erreur historique files: {e}")
        return []

@app.get("/api/files/view/{file_id}")
async def view_file(file_id: int, db: Session = Depends(get_db)):
    f = db.query(models.FileAnalysis).filter(models.FileAnalysis.id == file_id).first()
    if not f or not os.path.exists(f"uploads/{f.filename}"):
        raise HTTPException(404, detail="Fichier introuvable")
    return FileResponse(path=f"uploads/{f.filename}", filename=f.filename, content_disposition_type="inline")

@app.get("/api/files/download/{file_id}")
async def download_file(file_id: int, db: Session = Depends(get_db)):
    f = db.query(models.FileAnalysis).filter(models.FileAnalysis.id == file_id).first()
    if not f or not os.path.exists(f"uploads/{f.filename}"):
        raise HTTPException(404, detail="Fichier introuvable")
    return FileResponse(path=f"uploads/{f.filename}", filename=f.filename, content_disposition_type="attachment")

@app.delete("/api/files/{file_id}")
async def delete_file(file_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    file_record = db.query(FileAnalysis).filter(FileAnalysis.id == file_id, FileAnalysis.owner_id == get_user_id(current_user)).first()
    if not file_record:
        raise HTTPException(status_code=404, detail="Fichier introuvable")
    
    file_path = os.path.join("uploads", file_record.filename)
    if os.path.exists(file_path):
        try:
            os.remove(file_path)
        except Exception as e:
            print(f"Erreur suppression fichier physique: {e}")

    db.delete(file_record)
    db.commit()
    
    return {"status": "deleted"}

@app.post("/api/generate-invoice")
async def gen_inv(req: InvoiceRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    s = db.query(AppSettings).first()
    data = req.dict()
    default_logo = "https://cdn-icons-png.flaticon.com/512/3135/3135715.png"
    
    data.update({
        "company_name_header": s.company_name if s else "Mon Entreprise",
        "logo_url": s.logo if (s and s.logo) else default_logo
    })
    
    db.add(Invoice(
        reference=req.invoice_number,
        client_name=req.client_name,
        amount_total=req.amount,
        items_json=json.dumps([i.dict() for i in req.items]),
        owner_id=get_user_id(current_user)
    ))
    db.commit()
    
    pdf_bytes = generate_pdf_bytes(data)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename=facture_{req.invoice_number}.pdf"}
    )

@app.get("/api/invoices")
async def list_inv(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Invoice).filter(Invoice.owner_id == get_user_id(current_user)).order_by(Invoice.id.desc()).all()

@app.get("/api/invoices/{ref}/pdf")
async def reprint_inv(ref: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    inv = db.query(Invoice).filter(Invoice.reference == ref, Invoice.owner_id == get_user_id(current_user)).first()
    if not inv:
        raise HTTPException(404, detail="Facture introuvable")
    
    s = db.query(AppSettings).first()
    default_logo = "https://cdn-icons-png.flaticon.com/512/3135/3135715.png"
    
    data = {
        "client_name": inv.client_name,
        "invoice_number": inv.reference,
        "amount": inv.amount_total,
        "date": inv.date_issued.strftime("%d/%m/%Y"),
        "items": json.loads(inv.items_json),
        "company_name_header": s.company_name if s else "Mon Entreprise",
        "logo_url": s.logo if (s and s.logo) else default_logo
    }
    
    return Response(
        content=generate_pdf_bytes(data),
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename={ref}.pdf"}
    )