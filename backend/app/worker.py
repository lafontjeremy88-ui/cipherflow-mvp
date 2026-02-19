import os
import sys

# ── Path setup ─────────────────────────────────────────────────────────────────
# Ajoute le dossier racine au path pour que "app.tasks" soit importable
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# ── Pré-import obligatoire ─────────────────────────────────────────────────────
# RQ sérialise la fonction comme "app.tasks.process_email_job" dans Redis.
# Sans ce pré-import, le worker ne sait pas résoudre ce chemin.
import app.tasks  # noqa: F401

from redis import Redis
from rq import Worker

# ── Redis ──────────────────────────────────────────────────────────────────────
redis_url = os.getenv("REDIS_URL")
if not redis_url:
    raise RuntimeError("REDIS_URL not set")

redis_conn = Redis.from_url(redis_url)

if __name__ == "__main__":
    print("🚀 RQ Worker started — listening on 'emails'")
    worker = Worker(["emails"], connection=redis_conn)
    worker.work()




































