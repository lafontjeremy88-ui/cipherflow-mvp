# app/services/storage_service.py
"""
Service de stockage Cloudflare R2 via minio-py.

P1 : client Minio singleton (stable, pas de breaking changes comme boto3).
P2 : chiffrement Fernet avant upload, déchiffrement après download.
     Les fichiers au repos dans R2 sont illisibles sans la clé FERNET_KEY.
"""

import logging
import threading
from io import BytesIO

from minio import Minio

from app.core.config import settings

log = logging.getLogger(__name__)

# ── Singleton Minio ────────────────────────────────────────────────────────────
_client_lock = threading.Lock()
_minio_client = None

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


def _get_client() -> Minio:
    """Retourne le client Minio singleton."""
    global _minio_client
    if _minio_client is not None:
        return _minio_client

    with _client_lock:
        if _minio_client is not None:
            return _minio_client

        # R2_ENDPOINT_URL format : "https://<account>.r2.cloudflarestorage.com"
        # Minio attend uniquement le host sans https://
        endpoint = settings.R2_ENDPOINT_URL.strip()
        if endpoint.startswith("https://"):
            endpoint = endpoint[len("https://"):]
            secure = True
        elif endpoint.startswith("http://"):
            endpoint = endpoint[len("http://"):]
            secure = False
        else:
            secure = True

        log.info(
            f"[storage] Init client Minio endpoint={endpoint} "
            f"bucket={settings.R2_BUCKET_NAME.strip()}"
        )

        _minio_client = Minio(
            endpoint=endpoint,
            access_key=settings.R2_ACCESS_KEY_ID.strip(),
            secret_key=settings.R2_SECRET_ACCESS_KEY.strip(),
            secure=secure,
        )

    return _minio_client


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
    bucket = settings.R2_BUCKET_NAME.strip()

    client.put_object(
        bucket_name=bucket,
        object_name=filename,
        data=BytesIO(data),
        length=len(data),
        content_type=content_type,
        metadata={"encrypted": encrypted_flag},
    )

    log.info(f"[storage] Upload R2 : {filename} (chiffré={encrypted_flag == '1'})")
    return filename


def download_file(filename: str) -> bytes:
    """
    Télécharge depuis R2 et déchiffre si le fichier était chiffré.
    Rétro-compatible avec les fichiers uploadés avant activation de Fernet.
    """
    client = _get_client()
    bucket = settings.R2_BUCKET_NAME.strip()

    # Récupérer les métadonnées pour savoir si le fichier est chiffré
    try:
        stat = client.stat_object(bucket_name=bucket, object_name=filename)
        metadata = stat.metadata or {}
        # Minio normalise les metadata keys en lowercase avec préfixe x-amz-meta-
        is_encrypted = metadata.get("x-amz-meta-encrypted", "0") == "1"
    except Exception:
        is_encrypted = False

    response = client.get_object(bucket_name=bucket, object_name=filename)
    try:
        raw = response.read()
    finally:
        response.close()
        response.release_conn()

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
    client.remove_object(
        bucket_name=settings.R2_BUCKET_NAME.strip(),
        object_name=filename,
    )
    log.info(f"[storage] Supprimé de R2 : {filename}")