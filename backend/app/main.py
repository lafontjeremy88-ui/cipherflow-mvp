# app/main.py
"""
Point d'entrée FastAPI — CipherFlow.

FIX P1 : CORS restreint (suppression du wildcard *.vercel.app).
FIX P1 : Retention worker activé par défaut (ENABLE_RETENTION_WORKER=true).
FIX P1 : Intégration slowapi pour rate limiting (login, forgot-password).
FIX P0 : CSS debug retiré → voir src/index.css.
"""

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.auth_routes import router as auth_router
from app.api.email_routes import router as email_router
from app.api.file_routes import router as file_router
from app.api.invoice_routes import router as invoice_router
from app.api.settings_routes import router as settings_router
from app.api.tenant_routes import router as tenant_router
from app.core.config import settings as app_settings
from app.google_oauth import router as google_oauth_router, attach_oauth
from app.services.retention_service import retention_worker

log = logging.getLogger(__name__)

ENABLE_RETENTION = os.getenv("ENABLE_RETENTION_WORKER", "true").strip().lower() == "true"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Tâches de démarrage / arrêt."""
    if ENABLE_RETENTION:
        import asyncio
        task = asyncio.create_task(retention_worker())
        log.info("[startup] Retention worker RGPD démarré ✅")
    else:
        log.warning("[startup] Retention worker RGPD désactivé (ENABLE_RETENTION_WORKER=false)")

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
    from slowapi.util import get_remote_address
    from slowapi.errors import RateLimitExceeded
    from slowapi.middleware import SlowAPIMiddleware

    limiter = Limiter(key_func=get_remote_address)
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.add_middleware(SlowAPIMiddleware)
    log.info("[startup] Rate limiting slowapi activé ✅")
except ImportError:
    log.warning("[startup] slowapi non installé — rate limiting désactivé")

# ── CORS ───────────────────────────────────────────────────────────────────────
# FIX P1 : liste explicite, plus de wildcard *.vercel.app
ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:3000",
    "https://cipherflow-mvp.vercel.app",         # frontend prod
    "https://cipherflow-mvp-git-main-your-name.vercel.app",  # ← adapter à ton URL Vercel exacte
    "https://cipherflow.company",
]

# Permet d'ajouter des origines supplémentaires via variable d'environnement
extra_origins = os.getenv("EXTRA_ALLOWED_ORIGINS", "")
if extra_origins:
    ALLOWED_ORIGINS.extend([o.strip() for o in extra_origins.split(",") if o.strip()])

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# ── OAuth Google ───────────────────────────────────────────────────────────────
attach_oauth(app)

# ── Webhook email (watcher → backend) ─────────────────────────────────────────
WATCHER_SECRET = os.getenv("WATCHER_SECRET", "")


@app.post("/webhook/email")
async def email_webhook(request: Request):
    import hmac
    import secrets

    auth = request.headers.get("X-Watcher-Secret", "")
    if WATCHER_SECRET and not hmac.compare_digest(auth, WATCHER_SECRET):
        raise HTTPException(403, "Webhook non autorisé")

    payload = await request.json()

    from app.tasks import process_email_job
    from app.database.database import SessionLocal
    from rq import Queue
    import redis

    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
    r = redis.from_url(redis_url)
    q = Queue(connection=r)
    job = q.enqueue(process_email_job, payload)

    log.info(f"[webhook] Job RQ enqueued : {job.id}")
    return {"status": "queued", "job_id": job.id}


# ── Routers ────────────────────────────────────────────────────────────────────
app.include_router(auth_router)
app.include_router(google_oauth_router)
app.include_router(email_router)
app.include_router(file_router)
app.include_router(tenant_router)
app.include_router(invoice_router)
app.include_router(settings_router)


@app.get("/health")
def health():
    return {"status": "ok"}
