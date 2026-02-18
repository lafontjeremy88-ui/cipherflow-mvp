# app/main.py
"""
Point d'entrée FastAPI — CipherFlow SaaS
Contient UNIQUEMENT :
- Création de l'app
- Middlewares
- Inclusion des routers
- Webhook email (enqueue uniquement)
- Startup hooks

Aucune logique métier ici.
"""

import asyncio
import logging
import os
import secrets

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from redis import Redis
from rq import Queue
from sqlalchemy.orm import Session
from starlette.middleware.sessions import SessionMiddleware

from app.database.database import get_db, engine
from app.database import models
from app.database.models import Agency, AppSettings, User, UserRole
from app.core.config import settings
from app.security import get_password_hash
from app.tasks import process_email_job
from app.google_oauth import router as google_oauth_router

# ── Routers ────────────────────────────────────────────────────────────────────
from app.api import auth_routes, email_routes, tenant_routes
from app.api import file_routes, settings_routes, invoice_routes

log = logging.getLogger("cipherflow")

# ── Redis / RQ ─────────────────────────────────────────────────────────────────

redis_conn = Redis.from_url(settings.REDIS_URL)
email_queue = Queue("emails", connection=redis_conn)

# ── App ────────────────────────────────────────────────────────────────────────

app = FastAPI(title="CipherFlow SaaS")

# ── Middlewares ────────────────────────────────────────────────────────────────

app.add_middleware(
    SessionMiddleware,
    secret_key=settings.OAUTH_STATE_SECRET,
    same_site="lax",
    https_only=(settings.ENV in ("prod", "production")),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ────────────────────────────────────────────────────────────────────

app.include_router(google_oauth_router, tags=["Google OAuth"])
app.include_router(auth_routes.router)
app.include_router(email_routes.router)
app.include_router(tenant_routes.router)
app.include_router(file_routes.router)
app.include_router(settings_routes.router)
app.include_router(invoice_routes.router)


# ── Startup ────────────────────────────────────────────────────────────────────

@app.on_event("startup")
def on_startup():
    is_prod = settings.ENV in ("prod", "production")

    if not is_prod:
        models.Base.metadata.create_all(bind=engine)

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

    # Création admin par défaut en dev
    if not is_prod:
        from app.database.database import SessionLocal
        db = SessionLocal()
        try:
            if not db.query(User).filter(User.email == "admin@cipherflow.com").first():
                agency = Agency(name="CipherFlow HQ", email_alias="admin")
                db.add(agency)
                db.commit()
                db.refresh(agency)
                db.add(User(
                    email="admin@cipherflow.com",
                    hashed_password=get_password_hash("admin123"),
                    role=UserRole.SUPER_ADMIN,
                    agency_id=agency.id,
                ))
                db.commit()
        finally:
            db.close()


@app.on_event("startup")
async def start_retention_worker():
    """Lance le worker RGPD si activé."""
    if os.getenv("ENABLE_RETENTION_WORKER", "false").lower() != "true":
        return

    from app.services.retention_service import retention_worker
    asyncio.create_task(retention_worker())


# ── Webhook email ──────────────────────────────────────────────────────────────

@app.post("/webhook/email")
async def webhook_email(
    payload: dict,
    db: Session = Depends(get_db),
    x_watcher_secret: str = Header(None),
):
    """
    Reçoit un email du watcher et l'enqueue pour traitement.
    Ne fait aucune logique métier — délègue au pipeline via RQ.
    """
    if not x_watcher_secret or not secrets.compare_digest(
        x_watcher_secret, settings.WATCHER_SECRET
    ):
        raise HTTPException(status_code=401, detail="Invalid Secret")

    # Résolution agence (multi-tenant)
    recipient = payload.get("to_email", "").lower().strip()
    target_agency = None

    if "+" in recipient:
        alias = recipient.split("+")[1].split("@")[0]
        target_agency = db.query(Agency).filter(Agency.email_alias == alias).first()

    if not target_agency:
        target_agency = db.query(Agency).order_by(Agency.id.asc()).first()

    if not target_agency:
        raise HTTPException(status_code=500, detail="No agency configured")

    agency_settings = (
        db.query(AppSettings)
        .filter(AppSettings.agency_id == target_agency.id)
        .first()
    )

    email_queue.enqueue(
        process_email_job,
        {
            "agency_id": target_agency.id,
            "company_name": agency_settings.company_name if agency_settings else target_agency.name,
            "tone": agency_settings.tone if agency_settings else "pro",
            "signature": agency_settings.signature if agency_settings else "L'équipe",
            **payload,
        },
        job_timeout=600,
    )

    return {"status": "queued"}


# ── Health check ───────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "env": settings.ENV}
