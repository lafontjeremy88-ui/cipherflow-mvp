import os
import sys
from pathlib import Path

# 🔥 Ajoute le backend au PYTHONPATH
BASE_DIR = Path(__file__).resolve().parent
BACKEND_DIR = BASE_DIR.parent  # remonte d’un niveau si besoin

sys.path.append(str(BACKEND_DIR))

from redis import Redis
from rq import Worker, Queue

redis_url = os.getenv("REDIS_URL")
if not redis_url:
    raise RuntimeError("REDIS_URL not set")

redis_conn = Redis.from_url(redis_url)

if __name__ == "__main__":
    print("🚀 RQ Worker started — listening on 'emails'")
    worker = Worker(["emails"], connection=redis_conn)
    worker.work()