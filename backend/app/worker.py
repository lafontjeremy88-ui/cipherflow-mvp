import os
import sys

# worker.py est dans /app/app/ sur Railway
# on remonte d'un niveau pour atteindre /app/ et pouvoir importer "app.tasks"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import app.tasks  # noqa: F401 — pré-import requis pour que RQ resolve app.tasks.process_email_job

from redis import Redis
from rq import Worker

redis_url = os.getenv("REDIS_URL")
if not redis_url:
    raise RuntimeError("REDIS_URL not set")

redis_conn = Redis.from_url(redis_url)

if __name__ == "__main__":
    print("🚀 RQ Worker started — listening on 'emails'")
    worker = Worker(["emails"], connection=redis_conn)
    worker.work()





















