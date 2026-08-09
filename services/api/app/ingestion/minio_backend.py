"""MinIO (S3-compatible) StorageBackend implementation.

Implements the ``StorageBackend`` Protocol using ``boto3`` against a
MinIO endpoint (or any S3-compatible API).  The API surface is identical
to ``LocalFileSystemBackend`` so all callers are completely unaware of
which backend is active.

Design notes
------------
- ``save_stream``: Collects all chunks into a single ``io.BytesIO`` buffer
  (chunks are guaranteed ≤ ``settings.max_upload_size_bytes`` by the
  pre-screen in ``IngestionService``), then issues a single ``put_object``
  call.  This avoids the multi-part upload complexity while staying within
  memory constraints (max 50 MB buffer per upload).
- ``download_to_temp``: Downloads the object to a local ``NamedTemporaryFile``
  so that existing code that needs a local file path (e.g. the profiling
  stage in ``ingestion_task.py``) can continue to use ``open()`` without
  modification to anything else.
- ``resolve_path``: Returns the S3-style object key
  ``{dataset_id}_{filename}`` — consistent with the Local backend convention.
- Bucket creation is idempotent — called once in ``__init__`` and silent
  if the bucket already exists.
- All MinIO/boto3 exceptions are mapped to ``StorageError`` so callers
  receive a typed, backend-agnostic exception.

Thread safety
-------------
``boto3.client`` instances are NOT thread-safe.  A new client is created
inside each method call so that Celery workers (multi-process) and FastAPI
request handlers (async) cannot share a stale connection.
"""

from __future__ import annotations

import io
import logging
import tempfile
import os
from typing import Iterable

from app.config import settings
from app.ingestion.storage_backend import StorageError, StorageLocation

logger = logging.getLogger("apex_ingestion.minio_backend")


class MinIOStorageBackend:
    """Concrete StorageBackend that persists dataset files to a MinIO bucket.

    Satisfies the ``StorageBackend`` Protocol via structural subtyping.

    Args:
        endpoint_url:  MinIO endpoint (default: ``settings.s3_endpoint_url``).
        access_key:    MinIO access key (default: ``settings.s3_access_key``).
        secret_key:    MinIO secret key (default: ``settings.s3_secret_key``).
        bucket_name:   Target bucket name (default: ``settings.s3_bucket_name``).
    """

    def __init__(
        self,
        endpoint_url: str | None = None,
        access_key: str | None = None,
        secret_key: str | None = None,
        bucket_name: str | None = None,
    ) -> None:
        self._endpoint_url: str = endpoint_url or settings.s3_endpoint_url
        self._access_key: str = access_key or settings.s3_access_key.get_secret_value()
        self._secret_key: str = secret_key or settings.s3_secret_key.get_secret_value()
        self._bucket: str = bucket_name or settings.s3_bucket_name

        logger.info(
            "MinIOStorageBackend initialising — endpoint=%s bucket=%s",
            self._endpoint_url,
            self._bucket,
        )

        # Ensure the bucket exists at startup — idempotent.
        try:
            client = self._make_client()
            try:
                client.head_bucket(Bucket=self._bucket)
                logger.info(
                    "MinIOStorageBackend: bucket '%s' verified at %s.",
                    self._bucket,
                    self._endpoint_url,
                )
            except client.exceptions.ClientError:
                client.create_bucket(Bucket=self._bucket)
                logger.info(
                    "MinIOStorageBackend: created bucket '%s' at %s.",
                    self._bucket,
                    self._endpoint_url,
                )
        except Exception as exc:
            # Log at ERROR so operators know MinIO is unreachable at startup.
            # This is non-fatal (MinIO may start after the API) but every
            # subsequent upload attempt will fail loudly via save_stream().
            logger.error(
                "MinIOStorageBackend: STARTUP FAILURE — cannot reach MinIO "
                "at %s (bucket='%s'): %s: %s",
                self._endpoint_url,
                self._bucket,
                type(exc).__name__,
                exc,
                exc_info=True,
            )

    # ------------------------------------------------------------------
    # StorageBackend interface
    # ------------------------------------------------------------------

    def save_stream(
        self,
        chunks: Iterable[bytes],
        dataset_id: str,
        filename: str,
        organisation_id: str | None = None,
    ) -> StorageLocation:
        """Buffer all chunks and upload as a single object to MinIO.

        The total data is bounded by ``settings.max_upload_size_bytes``
        (pre-screened by ``IngestionService``) so the in-memory buffer
        never exceeds the configured limit (default 50 MB).

        Args:
            chunks:          Iterator of raw byte chunks.
            dataset_id:      UUID string used as the object key prefix.
            filename:        Sanitised original filename.
            organisation_id: Optional organisation UUID string.

        Returns:
            ``StorageLocation`` with ``backend="minio"`` and
            ``path=object_key``.

        Raises:
            StorageError: On any boto3 / MinIO error.
        """
        object_key = self._build_key(dataset_id, filename, organisation_id)
        buffer = io.BytesIO()
        written = 0

        for chunk in chunks:
            buffer.write(chunk)
            written += len(chunk)

        buffer.seek(0)

        try:
            client = self._make_client()
            client.put_object(
                Bucket=self._bucket,
                Key=object_key,
                Body=buffer,
                ContentLength=written,
                ContentType="text/csv",
            )
        except Exception as exc:
            raise StorageError(
                f"MinIOStorageBackend: failed uploading '{object_key}' "
                f"to bucket '{self._bucket}': {exc}"
            ) from exc

        logger.info(
            "MinIOStorageBackend: uploaded object '%s' (%d bytes).",
            object_key,
            written,
        )

        return StorageLocation(
            backend="minio",
            path=object_key,
            size_bytes=written,
            dataset_id=dataset_id,
            filename=filename,
            organisation_id=organisation_id,
        )

    def resolve_path(
        self,
        dataset_id: str,
        filename: str,
        organisation_id: str | None = None,
    ) -> str:
        """Return the object key for ``(dataset_id, filename)``."""
        return self._build_key(dataset_id, filename, organisation_id)

    def exists(
        self,
        dataset_id: str,
        filename: str,
        organisation_id: str | None = None,
    ) -> bool:
        """Return ``True`` if the object exists in MinIO."""
        object_key = self._build_key(dataset_id, filename, organisation_id)
        try:
            client = self._make_client()
            client.head_object(Bucket=self._bucket, Key=object_key)
            return True
        except Exception:
            if organisation_id:
                # Fallback check for unscoped legacy key
                try:
                    client = self._make_client()
                    client.head_object(
                        Bucket=self._bucket,
                        Key=self._build_key(dataset_id, filename, None),
                    )
                    return True
                except Exception:
                    pass
            return False

    def delete(
        self,
        dataset_id: str,
        filename: str,
        organisation_id: str | None = None,
    ) -> None:
        """Delete the object from MinIO.  No-op if the object is absent."""
        object_key = self._build_key(dataset_id, filename, organisation_id)
        try:
            client = self._make_client()
            client.delete_object(Bucket=self._bucket, Key=object_key)
            logger.info(
                "MinIOStorageBackend: deleted object '%s'.", object_key
            )
        except Exception as exc:
            raise StorageError(
                f"MinIOStorageBackend: failed deleting '{object_key}': {exc}"
            ) from exc

    def download_to_temp(
        self,
        dataset_id: str,
        filename: str,
        organisation_id: str | None = None,
    ) -> str:
        """Download an object from MinIO to a local temporary file."""
        object_key = self._build_key(dataset_id, filename, organisation_id)
        suffix = os.path.splitext(filename)[1] or ".csv"

        try:
            client = self._make_client()
            response = client.get_object(Bucket=self._bucket, Key=object_key)
            body = response["Body"].read()
        except Exception as exc:
            if organisation_id:
                legacy_key = self._build_key(dataset_id, filename, None)
                try:
                    client = self._make_client()
                    response = client.get_object(Bucket=self._bucket, Key=legacy_key)
                    body = response["Body"].read()
                except Exception:
                    raise StorageError(
                        f"MinIOStorageBackend: failed downloading '{object_key}' "
                        f"from bucket '{self._bucket}': {exc}"
                    ) from exc
            else:
                raise StorageError(
                    f"MinIOStorageBackend: failed downloading '{object_key}' "
                    f"from bucket '{self._bucket}': {exc}"
                ) from exc

        # Write to a named temp file — delete=False so the caller can open it
        with tempfile.NamedTemporaryFile(
            suffix=suffix, delete=False, prefix="apex_ingestion_"
        ) as tmp:
            tmp.write(body)
            tmp_path = tmp.name

        logger.debug(
            "MinIOStorageBackend: downloaded '%s' → temp file '%s' (%d bytes).",
            object_key,
            tmp_path,
            len(body),
        )

        return tmp_path

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _make_client(self):  # type: ignore[return]
        """Create a new boto3 S3 client for this call."""
        try:
            import boto3  # noqa: PLC0415
        except ImportError as exc:
            raise StorageError(
                "boto3 is not installed.  Run: pip install boto3"
            ) from exc

        return boto3.client(
            "s3",
            endpoint_url=self._endpoint_url,
            aws_access_key_id=self._access_key,
            aws_secret_access_key=self._secret_key,
            region_name="us-east-1",
        )

    def _build_key(
        self,
        dataset_id: str,
        filename: str,
        organisation_id: str | None = None,
    ) -> str:
        """Construct the object key ``[<organisation_id>/]{dataset_id}_{filename}``."""
        if organisation_id:
            return f"{organisation_id}/{dataset_id}_{filename}"
        return f"{dataset_id}_{filename}"

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"MinIOStorageBackend("
            f"endpoint={self._endpoint_url!r}, "
            f"bucket={self._bucket!r})"
        )
