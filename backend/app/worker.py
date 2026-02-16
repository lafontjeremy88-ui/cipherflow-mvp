import os
from redis import Redis
from rq import Worker, Queue

redis_url = os.getenv("REDIS_URL")
if not redis_url:
    raise RuntimeError("REDIS_URL not set")

redis_conn = Redis.from_url(redis_url)

if __name__ == "__main__":
    print("🧹 Clearing old jobs...")
    queue = Queue("emails", connection=redis_conn)
    queue.empty()

    print("🚀 RQ Worker started — listening on 'emails'")
    worker = Worker(["emails"], connection=redis_conn)
    worker.work()