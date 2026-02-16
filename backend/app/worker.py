import os
from redis import Redis
from rq import Worker, Queue, Connection

# Connexion Redis
redis_url = os.getenv("REDIS_URL")
if not redis_url:
    raise RuntimeError("REDIS_URL not set")

redis_conn = Redis.from_url(redis_url)

if __name__ == "__main__":
    with Connection(redis_conn):
        worker = Worker(["emails"])
        print("🚀 RQ Worker started — listening on 'emails'")
        worker.work()