"""Dataset Ingestion Service — Version 2.

Business logic layer for the v2 dataset upload pipeline.  Follows the same
service-layer conventions as ``app.services.job_service``:

    - Singleton instance exported at module level (``ingestion_service``).
    - Uses the shared ``_JOBS_STORE`` directly — no secondary in-memory store.
    - ``_dispatch_ingestion_job()`` mirrors ``_dispatch_job_execution()``
      with Celery as the primary path and a daemon thread as the fallback.
      Neither path uses ``asyncio.create_task()``.

Upload flow:
    1. Fast pre-screen  (extension, MIME, first-chunk header check) — sync.
    2. Streaming write to storage (64 KB async reads, sequential disk writes).
    3. Create ``JobResponse(job_type="ingestion")`` in ``_JOBS_STORE``.
    4. Dispatch background ingestion pipeline via Celery or daemon thread.
    5. Return ``DatasetUploadV2Response`` with job_id and poll_url immediately.

The caller polls ``GET /api/v1/jobs/{job_id}/progress`` — the existing job
endpoint — for live status; no new polling endpoint is needed.
"""

from __future__ import annotations

import csv
import io
import logging
import os
import re
import sys
import threading
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, UploadFile, status

from app.config import settings
from app.ingestion.storage_backend import (
    LocalFileSystemBackend,
    StorageBackend,
    get_configured_backend,
)
from app.schemas.dataset import DatasetUploadV2Response
from app.schemas.job import JobResponse, JobStatusEnum
from app.services.job_service import _JOBS_STORE, is_redis_available

logger = logging.getLogger("apex_ingestion.service")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_ALLOWED_MIMES: frozenset[str] = frozenset({
    "text/csv",
    "text/plain",
    "application/csv",
    "application/x-csv",
    "text/x-csv",
    "application/vnd.ms-excel",
    "application/octet-stream",
})

_PRE_SCREEN_CHUNK: int = 8_192   # 8 KB — just enough for header detection
_STREAM_CHUNK: int = 65_536       # 64 KB — write chunk size


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------


def _sanitize_filename(filename: str) -> str:
    """Return a safe filename stripped of path-traversal characters."""
    base = os.path.basename(filename)
    cleaned = re.sub(r"[^\w.\-]", "_", base)
    return cleaned or "dataset.csv"


# ---------------------------------------------------------------------------
# Service class
# ---------------------------------------------------------------------------


class IngestionService:
    """Enterprise Dataset Ingestion Service (Version 2).

    Decoupled from the storage medium via ``StorageBackend``.  Only the
    constructor knows which backend is in use; all methods reference
    the protocol interface.

    Args:
        backend: A ``StorageBackend`` implementation.  Defaults to
                 ``LocalFileSystemBackend`` using ``settings.upload_dir``.
    """

    def __init__(self, backend: StorageBackend | None = None) -> None:
        self._backend: StorageBackend = backend or get_configured_backend()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def create_ingestion_job(
        self,
        file: UploadFile,
    ) -> DatasetUploadV2Response:
        """Validate, stream-store, and enqueue a v2 dataset ingestion job.

        Synchronous pre-screens happen before any disk I/O so invalid
        requests are rejected cheaply.  The file is then streamed to
        disk in ``_STREAM_CHUNK``-byte increments — the full content is
        never held in memory simultaneously.

        Args:
            file: The multipart-uploaded ``UploadFile`` from FastAPI.

        Returns:
            ``DatasetUploadV2Response`` with ``job_id`` and ``poll_url``.

        Raises:
            HTTPException 400: Invalid filename, MIME type, or encoding.
            HTTPException 413: File exceeds ``settings.max_upload_size_bytes``.
            HTTPException 422: Missing or blank CSV header row.
            HTTPException 500: Disk write failure.
        """
        # ── 1. Filename & MIME pre-screen ──────────────────────────────────
        self._validate_filename_and_mime(file)

        dataset_id = str(uuid.uuid4())
        job_id = str(uuid.uuid4())
        safe_name = _sanitize_filename(file.filename or "dataset.csv")

        # ── 2. First-chunk header pre-screen (8 KB, no full read) ─────────
        first_chunk = await file.read(_PRE_SCREEN_CHUNK)
        if not first_chunk:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uploaded file is empty (0 bytes).",
            )
        self._validate_header_row(first_chunk)

        # ── 3. Stream entire file to storage (64 KB at a time) ────────────
        dest_path = self._backend.resolve_path(dataset_id, safe_name)
        size_bytes = await self._stream_file_to_disk(
            file=file,
            first_chunk=first_chunk,
            dest_path=dest_path,
            max_bytes=settings.max_upload_size_bytes,
        )

        # ── 4. Register ingestion job in the shared _JOBS_STORE ───────────
        now = datetime.now(timezone.utc)
        job = JobResponse(
            job_id=job_id,
            dataset_id=dataset_id,
            status=JobStatusEnum.QUEUED.value,
            created_at=now,
            updated_at=now,
            started_at=None,
            job_type="ingestion",
            algorithm="dataset_ingestion",   # sentinel — no ML model involved
            target_column="",                # N/A for ingestion jobs
            feature_columns=[],
            progress=0.0,
            current_stage="Upload received — queued for validation",
            message=(
                f"Ingestion job queued for '{safe_name}' "
                f"({size_bytes:,} bytes)."
            ),
            estimated_seconds=8.0,
            worker_id=f"ingestion-{uuid.uuid4().hex[:8]}",
            retry_count=0,
            owner_id="user-default",
            metadata={
                "filename": safe_name,
                "dataset_id": dataset_id,
                "storage_path": dest_path,
                "size_bytes": size_bytes,
                # Filled by the ingestion pipeline after schema validation:
                "version_id": None,
                "schema_fingerprint": None,
                "row_count": None,
                "column_count": None,
                "columns": [],
                "delimiter": None,
                "encoding": None,
            },
        )
        _JOBS_STORE[job_id] = job
        logger.info(
            "Ingestion job created — job_id=%s dataset_id=%s file='%s' size=%d bytes",
            job_id, dataset_id, safe_name, size_bytes,
        )

        # ── 5. Dispatch background ingestion pipeline ──────────────────────
        ingestion_config: dict[str, Any] = {
            "job_id": job_id,
            "dataset_id": dataset_id,
            "filename": safe_name,
            "storage_path": dest_path,
            "size_bytes": size_bytes,
        }
        self._dispatch_ingestion_job(job_id, ingestion_config)

        return DatasetUploadV2Response(
            job_id=job_id,
            dataset_id=dataset_id,
            status=JobStatusEnum.QUEUED.value,
            filename=safe_name,
            size_bytes=size_bytes,
            version_id=None,
            message="Upload received. Ingestion pipeline queued.",
            poll_url=f"/api/v1/jobs/{job_id}/progress",
        )

    # ------------------------------------------------------------------
    # Private: validation helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _validate_filename_and_mime(file: UploadFile) -> None:
        """Reject files without a .csv extension or with a non-CSV MIME type."""
        if not file or not file.filename:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No file was provided in the upload request.",
            )
        if not file.filename.lower().endswith(".csv"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only CSV (.csv) files are supported.",
            )
        if file.content_type and file.content_type.lower() not in _ALLOWED_MIMES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Invalid MIME type '{file.content_type}'. "
                    "Only CSV files are accepted."
                ),
            )

    @staticmethod
    def _validate_header_row(first_chunk: bytes) -> None:
        """Parse the CSV header from the first chunk; raise 422 if absent.

        Tries UTF-8 BOM, UTF-8, then ISO-8859-1 decoding.
        """
        decoded = ""
        for enc in ("utf-8-sig", "utf-8", "iso-8859-1"):
            try:
                decoded = first_chunk.decode(enc)
                break
            except UnicodeDecodeError:
                continue
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Cannot decode file with UTF-8-BOM, UTF-8, or ISO-8859-1. "
                    "Ensure the CSV file uses a supported character encoding."
                ),
            )

        try:
            reader = csv.reader(io.StringIO(decoded))
            header = next(reader, None)
        except csv.Error:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="The uploaded file is not a parseable CSV.",
            )

        if not header or not any(col.strip() for col in header):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="CSV is missing a valid header row.",
            )

    # ------------------------------------------------------------------
    # Private: streaming write
    # ------------------------------------------------------------------

    @staticmethod
    async def _stream_file_to_disk(
        file: UploadFile,
        first_chunk: bytes,
        dest_path: str,
        max_bytes: int,
    ) -> int:
        """Stream UploadFile to dest_path in 64 KB async reads.

        The ``first_chunk`` (already read for header pre-screening) is
        written first, then subsequent chunks are read with ``await
        file.read(_STREAM_CHUNK)`` until EOF.  This means the maximum
        memory held at any time is two chunks (~128 KB), not the full file.

        Args:
            file:        FastAPI UploadFile (stream positioned after first_chunk).
            first_chunk: Already-read initial bytes.
            dest_path:   Absolute target path on disk.
            max_bytes:   Hard size limit; excess triggers HTTP 413 and cleanup.

        Returns:
            Total bytes written to disk.

        Raises:
            HTTPException 413: File exceeds max_bytes.
            HTTPException 500: Disk write failure.
        """
        os.makedirs(
            os.path.dirname(os.path.abspath(dest_path)) or ".", exist_ok=True
        )
        written = 0

        try:
            with open(dest_path, "wb") as fout:
                # Write the pre-read first chunk
                fout.write(first_chunk)
                written += len(first_chunk)

                # Stream remainder in 64 KB increments
                while True:
                    chunk = await file.read(_STREAM_CHUNK)
                    if not chunk:
                        break
                    written += len(chunk)
                    if written > max_bytes:
                        # Clean up partial file before raising
                        fout.close()
                        try:
                            os.remove(dest_path)
                        except OSError:
                            pass
                        max_mb = max_bytes // (1024 * 1024)
                        raise HTTPException(
                            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                            detail=(
                                f"File size exceeds the {max_mb} MB upload limit. "
                                f"({written:,} bytes received before abort)."
                            ),
                        )
                    fout.write(chunk)

        except HTTPException:
            raise
        except OSError as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to store uploaded dataset on disk: {exc}",
            ) from exc

        return written

    # ------------------------------------------------------------------
    # Private: dispatch
    # ------------------------------------------------------------------

    def _dispatch_ingestion_job(
        self, job_id: str, config: dict[str, Any]
    ) -> None:
        """Dispatch the background ingestion pipeline.

        Primary path: Celery — ``ingest_dataset_task.delay(job_id, config)``.
        Fallback path: daemon thread — ``threading.Thread(target=ingestion_pipeline_sync)``.

        Neither path uses ``asyncio.create_task()``.

        The daemon thread is suitable for local development where Redis /
        Celery are not running.  In production, Celery handles all jobs.
        """
        if is_redis_available():
            try:
                _repo_root = os.path.abspath(
                    os.path.join(os.path.dirname(__file__), "..", "..", "..", "..")
                )
                if _repo_root not in sys.path:
                    sys.path.insert(0, _repo_root)
                from services.worker.tasks.ingestion_task import ingest_dataset_task  # noqa: PLC0415
                ingest_dataset_task.delay(job_id, config)
                logger.info(
                    "Ingestion job %s dispatched to Celery.", job_id
                )
                return
            except Exception as exc:
                logger.warning(
                    "Celery dispatch failed for ingestion job %s: %s. "
                    "Using daemon thread fallback.",
                    job_id,
                    exc,
                )

        # Daemon thread fallback — not asyncio.create_task()
        from services.worker.tasks.ingestion_task import ingestion_pipeline_sync  # noqa: PLC0415

        thread = threading.Thread(
            target=ingestion_pipeline_sync,
            args=(job_id, config),
            daemon=True,
            name=f"ingestion-{job_id[:8]}",
        )
        thread.start()
        logger.info(
            "Ingestion job %s dispatched to daemon thread '%s'.",
            job_id,
            thread.name,
        )


# ---------------------------------------------------------------------------
# Module-level singleton — matches job_service.py convention
# ---------------------------------------------------------------------------

ingestion_service = IngestionService()
