# app/services/storage_service.py
"""
Service de stockage Cloudflare R2.

P1 : client boto3 singleton.
P2 : chiffrement Fernet avant upload, déchiffrement après download.
     Les fichiers au repos dans R2 sont illisibles sans la clé FERNET_KEY.
"""

import logging
import threading

import boto3
from botocore.client import Config

from app.core.config import settings

log = logging.getLogger(__name__)

# ── Singleton R2 ───────────────────────────────────────────────────────────────
_client_lock = threading.Lock()
_r2_client = None

# ── Singleton Fernet ───────────────────────────────────────────────────────────
_fernet_lock = threading.Lock()
_fernet_instance = None
_fernet_checked = False


def _get_fernet():
    """
    Retourne l'instance Fernet (singleton).
    Si FERNET_KEY est absent ou invalide → None (pas de chiffrement).
    Compatible avec les anciens fichiers non chiffrés.
    """
    global _fernet_instance, _fernet_checked
    if _fernet_checked:
        return _fernet_instance

    with _fernet_lock:
        if _fernet_checked:
            return _fernet_instance

        key = (settings.FERNET_KEY or "").strip()
        if not key:
            log.warning("[storage] FERNET_KEY absent — stockage sans chiffrement")
        else:
            try:
                from cryptography.fernet import Fernet
                _fernet_instance = Fernet(
                    key.encode() if isinstance(key, str) else key
                )
                log.info("[storage] Chiffrement Fernet activé ✅")
            except Exception as e:
                log.error(f"[storage] FERNET_KEY invalide ({e}) — stockage sans chiffrement")

        _fernet_checked = True
    return _fernet_instance


def _get_client():
    global _r2_client
    if _r2_client is not None:
        return _r2_client

    with _client_lock:
        if _r2_client is not None:
            return _r2_client

        key_id = settings.R2_ACCESS_KEY_ID.strip()
        endpoint = settings.R2_ENDPOINT_URL.strip()
        bucket = settings.R2_BUCKET_NAME.strip()
        log.info(
            f"[storage] Init client R2 key={key_id[:8]}... "
            f"endpoint={endpoint[:50]} bucket={bucket}"
        )
        _r2_client = boto3.client(
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
    return _r2_client


def upload_file(
    file_bytes: bytes,
    filename: str,
    content_type: str = "application/octet-stream",
) -> str:
    """
    Chiffre les données avec Fernet (si FERNET_KEY configuré) puis upload R2.
    Stocke un metadata 'encrypted=1' pour que download_file sache déchiffrer.
    """
    fernet = _get_fernet()
    if fernet:
        data = fernet.encrypt(file_bytes)
        encrypted_flag = "1"
    else:
        data = file_bytes
        encrypted_flag = "0"

    client = _get_client()
    client.put_object(
        Bucket=settings.R2_BUCKET_NAME.strip(),
        Key=filename,
        Body=data,
        ContentType=content_type,
        ContentLength=len(data),
        Metadata={"encrypted": encrypted_flag},
    )
    log.info(f"[storage] Upload R2 : {filename} (chiffré={encrypted_flag == '1'})")
    return filename


def download_file(filename: str) -> bytes:
    """
    Télécharge depuis R2 et déchiffre si le fichier était chiffré.
    Rétro-compatible avec les fichiers uploadés avant activation de Fernet.
    """
    client = _get_client()
    response = client.get_object(
        Bucket=settings.R2_BUCKET_NAME.strip(),
        Key=filename,
    )
    raw = response["Body"].read()

    metadata = response.get("Metadata", {})
    is_encrypted = metadata.get("encrypted", "0") == "1"

    if is_encrypted:
        fernet = _get_fernet()
        if not fernet:
            raise RuntimeError(
                f"Fichier '{filename}' chiffré mais FERNET_KEY absent"
            )
        raw = fernet.decrypt(raw)
        log.info(f"[storage] Download R2 (déchiffré) : {filename}")
    else:
        log.info(f"[storage] Download R2 (clair) : {filename}")

    return raw


def delete_file(filename: str) -> None:
    client = _get_client()
    client.delete_object(
        Bucket=settings.R2_BUCKET_NAME.strip(),
        Key=filename,
    )
    log.info(f"[storage] Supprimé de R2 : {filename}")