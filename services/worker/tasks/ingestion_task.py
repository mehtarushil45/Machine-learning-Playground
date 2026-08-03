"""Celery task and synchronous pipeline for v2 dataset ingestion.

Task registration
-----------------
The task ``ingest_dataset`` is registered on the shared ``celery_app``
by adding this module to ``celery_app.conf.include``.  It mirrors the
structure of ``training_task.py`` exactly:

    @celery_app.task(name="ingest_dataset", bind=True, max_retries=2)
    def ingest_dataset_task(self, job_id, config): ...

Synchronous pipeline
--------------------
``ingestion_pipeline_sync(job_id, config)`` is the callable executed by both
Celery workers and the daemon-thread fallback.  It reports progress via
``update_job_state()`` (imported from ``app.ml.engine``) so the existing
``GET /api/v1/jobs/{job_id}/progress`` endpoint serves live status without
any modification.

Progress milestones
-------------------
    QUEUED     →  0%  (set by IngestionService before dispatch)
    VALIDATING → 10%  Starting validation pass
    VALIDATING → 20%  Full CSV streaming validation complete
    RUNNING    → 35%  Schema fingerprint generation
    RUNNING    → 50%  Schema fingerprint ready
    RUNNING    → 55%  Launching profiler
    RUNNING    → 80%  Statistical profiling complete
    COMPLETED  →100%  Metadata committed to _JOBS_STORE
"""

from __future__ import annotations

import csv as _csv_module
import logging
import os
import sys
from datetime import datetime, timezone
from typing import Any

# ---------------------------------------------------------------------------
# sys.path bootstrap (identical pattern to training_task.py)
# ---------------------------------------------------------------------------

_repo_root = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..", "..")
)
if _repo_root not in sys.path:
    sys.path.insert(0, _repo_root)

# ---------------------------------------------------------------------------
# Cross-package imports  (deferred inside functions where needed to avoid
# circular references at Celery worker startup time)
# ---------------------------------------------------------------------------

from services.worker.celery_app import celery_app  # noqa: E402
from services.api.app.config import settings  # noqa: E402
from services.api.app.schemas.job import JobStatusEnum  # noqa: E402
from services.api.app.ml.engine import update_job_state  # noqa: E402

logger = logging.getLogger("apex_ingestion.task")


# ---------------------------------------------------------------------------
# Celery task
# ---------------------------------------------------------------------------


@celery_app.task(name="ingest_dataset", bind=True, max_retries=2)
def ingest_dataset_task(
    self: Any, job_id: str, config: dict[str, Any]
) -> dict[str, Any]:
    """Celery task: run the full v2 ingestion pipeline for a queued upload job.

    Wraps ``ingestion_pipeline_sync`` with the same retry policy used by
    ``execute_ml_training_job``:  up to 2 retries with a 5-second back-off.

    Args:
        job_id: The UUID string of the job registered in ``_JOBS_STORE``.
        config: Ingestion configuration dict produced by
                ``IngestionService.create_ingestion_job``.

    Returns:
        A summary dict written as the Celery task result.

    Raises:
        celery.exceptions.Retry: On transient failures (up to ``max_retries``).
    """
    try:
        return ingestion_pipeline_sync(job_id, config)
    except Exception as exc:
        raise self.retry(exc=exc, countdown=5)


# ---------------------------------------------------------------------------
# Synchronous pipeline  (shared by Celery task and daemon-thread fallback)
# ---------------------------------------------------------------------------


def ingestion_pipeline_sync(
    job_id: str, config: dict[str, Any]
) -> dict[str, Any]:
    """Execute all ingestion pipeline stages synchronously.

    This function is the single implementation used by both the Celery
    task and the daemon-thread fallback.  All progress is reported
    through ``update_job_state()`` so the existing polling endpoint serves
    live status without modification.

    Config keys consumed
    --------------------
    storage_path (str) : Absolute path to the already-stored CSV file.
    dataset_id   (str) : UUID of the dataset (used as ``TabularDataContainer`` id).
    filename     (str) : Sanitised original filename (without dataset_id prefix).
    size_bytes   (int) : File size in bytes (used as ``memory_usage_bytes``).

    Args:
        job_id: UUID string of the job in ``_JOBS_STORE``.
        config: Dict produced by ``IngestionService.create_ingestion_job``.

    Returns:
        Summary dict describing the completed ingestion.

    Raises:
        Any exception is caught, transitions the job to FAILED via
        ``update_job_state``, then re-raises so Celery can retry.
    """
    # Deferred imports to avoid circular dependencies at module-load time
    from services.api.app.ingestion.csv_validator import (  # noqa: PLC0415
        generate_schema_fingerprint,
        validate_csv_file,
    )
    from services.api.app.services.profiler import (  # noqa: PLC0415
        TabularDataContainer,
        profiler_service,
    )
    from services.api.app.services.job_service import _JOBS_STORE  # noqa: PLC0415

    storage_path: str = config["storage_path"]
    dataset_id: str = config["dataset_id"]
    filename: str = config["filename"]
    size_bytes: int = int(config.get("size_bytes", 0))

    logger.info(
        "Ingestion pipeline starting — job_id=%s file='%s'",
        job_id, storage_path,
    )

    try:
        # ── Stage 1: Full CSV streaming validation (0 → 20%) ──────────────
        update_job_state(
            job_id,
            JobStatusEnum.VALIDATING.value,
            10.0,
            "CSV Validation",
            f"Streaming validation of '{filename}'",
            estimated_seconds=5.0,
        )

        from services.api.app.ingestion.csv_validator import CSVValidationResult  # noqa: PLC0415
        validation: CSVValidationResult = validate_csv_file(
            file_path=storage_path,
            max_size_bytes=settings.max_upload_size_bytes,
        )

        if not validation.is_valid:
            error_summary = "; ".join(validation.errors)
            logger.error(
                "CSV validation failed for job %s: %s", job_id, error_summary
            )
            update_job_state(
                job_id,
                JobStatusEnum.FAILED.value,
                0.0,
                "Validation Failed",
                f"CSV validation failed: {error_summary}",
                error_msg=error_summary,
            )
            # Remove the invalid file to free disk space
            try:
                os.remove(storage_path)
                logger.info("Removed invalid file '%s'.", storage_path)
            except OSError as rm_exc:
                logger.warning(
                    "Could not remove invalid file '%s': %s", storage_path, rm_exc
                )
            return {"status": "failed", "job_id": job_id, "errors": validation.errors}

        update_job_state(
            job_id,
            JobStatusEnum.VALIDATING.value,
            20.0,
            "CSV Validation Complete",
            (
                f"Validated {validation.row_count:,} rows × "
                f"{len(validation.columns)} columns; "
                f"encoding={validation.encoding} delimiter={validation.delimiter!r}"
            ),
            estimated_seconds=3.0,
        )
        logger.info(
            "Validation passed — job=%s rows=%d columns=%d",
            job_id, validation.row_count, len(validation.columns),
        )

        # ── Stage 2: Schema fingerprint generation (20 → 50%) ─────────────
        update_job_state(
            job_id,
            JobStatusEnum.RUNNING.value,
            35.0,
            "Schema Fingerprinting",
            "Computing deterministic schema fingerprint from metadata",
            estimated_seconds=2.0,
        )

        assert validation.schema is not None, (  # invariant guaranteed by validate_csv_file
            "CSVValidationResult.schema must be set when is_valid=True"
        )
        version_id, sha256_hex = generate_schema_fingerprint(validation.schema)

        update_job_state(
            job_id,
            JobStatusEnum.RUNNING.value,
            50.0,
            "Schema Fingerprint Ready",
            f"Fingerprint computed: {version_id} (sha256:{sha256_hex[:16]}…)",
            estimated_seconds=2.0,
        )
        logger.info(
            "Schema fingerprint — job=%s version_id=%s", job_id, version_id
        )

        # ── Stage 3: Statistical column profiling (50 → 80%) ──────────────
        update_job_state(
            job_id,
            JobStatusEnum.RUNNING.value,
            55.0,
            "Statistical Profiling",
            "Running column-level statistical analysis",
            estimated_seconds=4.0,
        )

        rows: list[dict[str, str]] = []
        _tmp_path: str | None = None  # temp file created for MinIO downloads

        try:
            # Resolve the local path for CSV reading.
            # For the local backend: storage_path is already a filesystem path.
            # For MinIO: storage_path is an object key — download to a temp file.
            from services.api.app.ingestion.storage_backend import get_configured_backend  # noqa: PLC0415
            _backend = get_configured_backend()

            from services.api.app.ingestion.minio_backend import MinIOStorageBackend  # noqa: PLC0415
            if isinstance(_backend, MinIOStorageBackend):
                _tmp_path = _backend.download_to_temp(dataset_id, filename)
                _read_path = _tmp_path
            else:
                _read_path = storage_path

            with open(
                _read_path,
                encoding=validation.encoding,
                errors="replace",
                newline="",
            ) as fh:
                reader = _csv_module.DictReader(
                    fh, delimiter=validation.delimiter
                )
                for row in reader:
                    rows.append(dict(row))
        except OSError as exc:
            raise RuntimeError(
                f"Failed to open stored CSV for profiling: {exc}"
            ) from exc
        finally:
            # Clean up temp file created for MinIO download
            if _tmp_path is not None:
                try:
                    os.remove(_tmp_path)
                except OSError:
                    pass

        container = TabularDataContainer(
            dataset_id=dataset_id,
            filename=filename,
            columns=validation.columns,
            rows=rows,
            memory_usage_bytes=size_bytes,
        )
        profile = profiler_service.profile(container)

        update_job_state(
            job_id,
            JobStatusEnum.RUNNING.value,
            80.0,
            "Profiling Complete",
            (
                f"Profiled {profile.row_count:,} rows, {profile.column_count} columns; "
                f"{profile.total_missing_values} missing values detected"
            ),
            estimated_seconds=1.0,
        )
        logger.info(
            "Profiling complete — job=%s rows=%d columns=%d",
            job_id, profile.row_count, profile.column_count,
        )

        # ── Stage 4: Commit final metadata to _JOBS_STORE (80 → 100%) ─────
        now = datetime.now(timezone.utc)
        if job_id in _JOBS_STORE:
            current_job = _JOBS_STORE[job_id]
            # Merge new metadata into existing dict (preserves keys set earlier)
            updated_meta = dict(current_job.metadata)
            updated_meta.update(
                {
                    "version_id": version_id,
                    "schema_fingerprint": f"sha256:{sha256_hex}",
                    "row_count": profile.row_count,
                    "column_count": profile.column_count,
                    "columns": validation.columns,
                    "delimiter": validation.delimiter,
                    "encoding": validation.encoding,
                    "profiler_summary": {
                        "duplicate_rows": profile.duplicate_rows,
                        "duplicate_columns": profile.duplicate_columns,
                        "empty_columns": profile.empty_columns,
                        "total_missing_values": profile.total_missing_values,
                    },
                }
            )
            updated_job = current_job.model_copy(
                update={
                    "status": JobStatusEnum.COMPLETED.value,
                    "progress": 100.0,
                    "current_stage": "Ingestion Complete",
                    "message": (
                        f"Dataset '{filename}' is ready: "
                        f"{profile.row_count:,} rows, "
                        f"{profile.column_count} columns, "
                        f"fingerprint {version_id}."
                    ),
                    "estimated_seconds": 0.0,
                    "completed_at": now,
                    "updated_at": now,
                    "metadata": updated_meta,
                }
            )
            _JOBS_STORE[job_id] = updated_job
        else:
            logger.warning(
                "job_id=%s not found in _JOBS_STORE when committing final metadata.",
                job_id,
            )

        logger.info(
            "Ingestion pipeline completed — job=%s dataset=%s version=%s "
            "rows=%d columns=%d",
            job_id, dataset_id, version_id,
            profile.row_count, profile.column_count,
        )

        return {
            "status": "completed",
            "job_id": job_id,
            "dataset_id": dataset_id,
            "version_id": version_id,
            "schema_fingerprint": f"sha256:{sha256_hex}",
            "row_count": profile.row_count,
            "column_count": profile.column_count,
        }

    except Exception as exc:
        logger.exception(
            "Ingestion pipeline failed — job_id=%s error=%s", job_id, exc
        )
        # Transition job to FAILED so the frontend shows an error state
        update_job_state(
            job_id,
            JobStatusEnum.FAILED.value,
            0.0,
            "Failed",
            f"Ingestion pipeline failed: {exc}",
            error_msg=str(exc),
        )
        raise
