# app/services/storage_service.py
"""
Service de stockage Cloudflare R2 (compatible S3).
"""

import logging
import boto3
from botocore.client import Config
from app.core.config import settings

log = logging.getLogger(__name__)


def _get_client():
    """Crée un client S3 compatible Cloudflare R2."""
    key_id = settings.R2_ACCESS_KEY_ID.strip()
    endpoint = settings.R2_ENDPOINT_URL.strip()
    bucket = settings.R2_BUCKET_NAME.strip()
    log.info(f"[storage] R2 key_id={key_id[:8]}... endpoint={endpoint[:50]} bucket={bucket}")
    
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=key_id,
        aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY.strip(),
        config=Config(
            signature_version="s3v4",
            s3={"payload_signing_enabled": False},
            request_checksum_calculation="when_required",
            response_checksum_validation="when_required",
        ),
        region_name="auto",
    )


def upload_file(file_bytes: bytes, filename: str, content_type: str = "application/octet-stream") -> str:
    client = _get_client()
    client.put_object(
        Bucket=settings.R2_BUCKET_NAME.strip(),
        Key=filename,
        Body=file_bytes,
        ContentType=content_type,
        ContentLength=len(file_bytes),
    )
    log.info(f"[storage] ✅ Fichier uploadé dans R2 : {filename}")
    return filename


def download_file(filename: str) -> bytes:
    client = _get_client()
    response = client.get_object(
        Bucket=settings.R2_BUCKET_NAME.strip(),
        Key=filename,
    )
    file_bytes = response["Body"].read()
    log.info(f"[storage] ✅ Fichier téléchargé depuis R2 : {filename}")
    return file_bytes


def delete_file(filename: str) -> None:
    client = _get_client()
    client.delete_object(
        Bucket=settings.R2_BUCKET_NAME.strip(),
        Key=filename,
    )
    log.info(f"[storage] Fichier supprimé de R2 : {filename}")