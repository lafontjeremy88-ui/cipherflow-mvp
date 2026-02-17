from app.services.email_pipeline import run_email_pipeline

def process_email_job(payload: Dict[str, Any]):
    import asyncio
    asyncio.run(run_email_pipeline(payload))