# app/main.py

import logging
import os
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.api.auth_routes import router as auth_router
from app.api.email_routes import router as email_router
from app.api.file_routes import router as file_router
from app.api.invoice_routes import router as invoice_router
from app.api.settings_routes import router as settings_router
from app.api.tenant_routes import router as tenant_router
from app.google_oauth import router as google_oauth_router, attach_oauth
from app.api.gmail_oauth_routes import router as gmail_router
from app.api.outlook_oauth_routes import router as outlook_router
from app.api.watcher_routes import router as watcher_router
from app.api.admin_routes import router as admin_router
from app.services.retention_service import retention_worker

log = logging.getLogger(__name__)

ENABLE_RETENTION = os.getenv("ENABLE_RETENTION_WORKER", "true").strip().lower() == "true"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Vérification des secrets critiques au démarrage ───────────────────────
    if not os.getenv("WATCHER_SECRET"):
        raise RuntimeError(
            "WATCHER_SECRET non configuré — démarrage refusé. "
            "Définissez la variable d'environnement WATCHER_SECRET."
        )
    if not os.getenv("FERNET_KEY"):
        raise RuntimeError(
            "FERNET_KEY non configuré — démarrage refusé. "
            "Définissez la variable d'environnement FERNET_KEY."
        )
    log.info("[startup] Secrets critiques vérifiés ✅")

    if ENABLE_RETENTION:
        import asyncio
        asyncio.create_task(retention_worker())
        log.info("[startup] Retention worker RGPD démarré ✅")
    else:
        log.warning("[startup] Retention worker RGPD désactivé")
    yield


app = FastAPI(
    title="CipherFlow API",
    description="API de gestion locative assistée par IA",
    version="1.0.0",
    lifespan=lifespan,
)

# ── Rate limiting (slowapi) ────────────────────────────────────────────────────
try:
    from slowapi import Limiter, _rate_limit_exceeded_handler
    from slowapi.errors import RateLimitExceeded
    from slowapi.middleware import SlowAPIMiddleware
    from slowapi.util import get_remote_address

    limiter = Limiter(key_func=get_remote_address)
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.add_middleware(SlowAPIMiddleware)
    log.info("[startup] Rate limiting slowapi activé ✅")
except ImportError:
    log.warning("[startup] slowapi non installé — rate limiting désactivé")

# ── CORS ───────────────────────────────────────────────────────────────────────
ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:3000",
    "https://cipherflow-mvp.vercel.app",
    "https://cipherflow.company",
]

extra = os.getenv("EXTRA_ALLOWED_ORIGINS", "")
if extra:
    ALLOWED_ORIGINS.extend([o.strip() for o in extra.split(",") if o.strip()])

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Watcher-Secret"],
)

# ── OAuth Google ───────────────────────────────────────────────────────────────
attach_oauth(app)

# ── Webhook email (watcher → backend) ─────────────────────────────────────────
WATCHER_SECRET = os.getenv("WATCHER_SECRET", "")


class WebhookAttachment(BaseModel):
    filename: str
    content_type: str
    content_base64: str


class WebhookEmailPayload(BaseModel):
    from_email: str
    to_email: str
    subject: str = ""
    content: str = ""
    send_email: bool = True
    attachments: List[WebhookAttachment] = []
    agency_id: Optional[int] = None
    filter_decision: Optional[str] = None
    filter_reasons: Optional[List[str]] = None
    filter_score: Optional[int] = None


@app.post("/webhook/email")
async def email_webhook(request: Request):
    import hmac
    import redis
    from rq import Queue
    from app.database.database import SessionLocal
    from app.database.models import Agency

    auth = request.headers.get("X-Watcher-Secret", "")
    if not hmac.compare_digest(auth, WATCHER_SECRET):
        raise HTTPException(403, "Webhook non autorisé")

    try:
        raw = await request.json()
        payload_model = WebhookEmailPayload(**raw)
    except Exception as e:
        raise HTTPException(422, f"Payload webhook invalide : {e}")

    payload: Dict[str, Any] = payload_model.model_dump()

    # ── Résolution agency_id depuis to_email ──────────────────────────────────
    if payload.get("agency_id") is None:
        db = SessionLocal()
        try:
            to_email = payload.get("to_email", "")
            alias = to_email.split("@")[0].split("+")[-1] if to_email else ""
            agency = None
            if alias:
                agency = db.query(Agency).filter(Agency.email_alias == alias).first()
            if not agency:
                log.warning(f"[webhook] Alias '{alias}' non résolu (to_email='{to_email}') — rejeté")
                raise HTTPException(
                    status_code=422,
                    detail=f"Alias email inconnu : '{alias}'. Vérifiez email_alias de l'agence.",
                )
            payload["agency_id"] = agency.id
            log.info(f"[webhook] agency_id résolu : {payload['agency_id']} (alias='{alias}')")
        except HTTPException:
            raise
        except Exception as e:
            log.error(f"[webhook] Erreur résolution agency_id : {e}")
            raise HTTPException(status_code=500, detail="Erreur interne lors de la résolution de l'agence.")
        finally:
            db.close()

    from app.tasks import process_email_job

    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
    r = redis.from_url(redis_url)
    q = Queue("emails", connection=r)
    job = q.enqueue(process_email_job, payload)

    log.info(f"[webhook] Job enqueued sur queue 'emails' : {job.id} | agency_id={payload.get('agency_id')}")
    return {"status": "queued", "job_id": job.id}


# ── Routers ────────────────────────────────────────────────────────────────────
app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(google_oauth_router)
app.include_router(gmail_router)
app.include_router(outlook_router)
app.include_router(watcher_router)
app.include_router(email_router)
app.include_router(file_router)
app.include_router(tenant_router)
app.include_router(invoice_router)
app.include_router(settings_router)


@app.get("/health")
def health():
    return {"status": "ok"}
