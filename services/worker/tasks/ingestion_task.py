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
    RUNNING    → 25%  Stage 1.5 START: data quality validation
    RUNNING    → 40%  Stage 1.5 COMPLETE: context stored, score computed
    RUNNING    → 45%  Schema fingerprint generation
    RUNNING    → 55%  Schema fingerprint ready
    RUNNING    → 60%  Launching profiler
    RUNNING    → 85%  Statistical profiling complete
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
    storage_backend_name: str = config.get("storage_backend", "local")
    dataset_id: str = config["dataset_id"]
    filename: str = config["filename"]
    size_bytes: int = int(config.get("size_bytes", 0))

    logger.info(
        "Ingestion pipeline starting — job_id=%s backend=%s file='%s'",
        job_id, storage_backend_name, storage_path,
    )

    # ── Resolve a local filesystem path once, before any stage ────────────────
    # For the local backend: storage_path is already a real filesystem path.
    # For MinIO: storage_path is an object key (e.g. "abc-123_churn.csv").
    #   os.path.getsize() and open() cannot use object keys.
    #   Download to a temp file here so ALL stages use a real path.
    # The temp file is cleaned up in the finally block below.
    _tmp_path: str | None = None
    try:
        from services.api.app.ingestion.storage_backend import get_configured_backend  # noqa: PLC0415
        from services.api.app.ingestion.minio_backend import MinIOStorageBackend  # noqa: PLC0415
        _backend = get_configured_backend()
        if isinstance(_backend, MinIOStorageBackend):
            logger.info(
                "MinIO backend detected — downloading '%s' to temp file for pipeline.",
                storage_path,
            )
            org_id = config.get("organisation_id")
            _tmp_path = _backend.download_to_temp(dataset_id, filename, organisation_id=org_id)
            _local_path = _tmp_path
            logger.info(
                "MinIO download complete — temp file '%s' (%s).",
                _local_path, storage_path,
            )
        else:
            _local_path = storage_path
    except Exception as exc:
        logger.error(
            "Failed to resolve local path for pipeline (storage_path='%s'): %s",
            storage_path, exc, exc_info=True,
        )
        update_job_state(
            job_id,
            JobStatusEnum.FAILED.value,
            0.0,
            "Storage Error",
            f"Could not retrieve dataset file: {exc}",
            error_msg=str(exc),
        )
        if _tmp_path:
            try:
                os.remove(_tmp_path)
            except OSError:
                pass
        return {"status": "failed", "job_id": job_id, "errors": [str(exc)]}

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
            file_path=_local_path,  # always a real filesystem path
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
            # For local backend: remove the invalid file to free disk space.
            # For MinIO: the object was already uploaded; delete it via the backend.
            if storage_backend_name == "local":
                try:
                    os.remove(_local_path)
                    logger.info("Removed invalid local file '%s'.", _local_path)
                except OSError as rm_exc:
                    logger.warning(
                        "Could not remove invalid file '%s': %s", _local_path, rm_exc
                    )
            else:
                try:
                    _backend.delete(dataset_id, filename)
                    logger.info(
                        "Deleted invalid MinIO object '%s'.", storage_path
                    )
                except Exception as rm_exc:
                    logger.warning(
                        "Could not delete invalid MinIO object '%s': %s",
                        storage_path, rm_exc
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

        # ── Stage 1.5: Data Quality & ML Compatibility Validation (20 → 40%) ─
        update_job_state(
            job_id,
            JobStatusEnum.RUNNING.value,
            25.0,
            "Data Quality Validation",
            "Running schema integrity, data quality, and ML compatibility analysis",
            estimated_seconds=4.0,
        )

        from services.api.app.ingestion.data_quality_validator import (  # noqa: PLC0415
            run_data_quality_validation,
        )
        from services.api.app.ingestion.validation_context import (  # noqa: PLC0415
            DatasetValidationContext,
            store_validation_context,
        )

        assert validation.schema is not None, (  # invariant from validate_csv_file
            "CSVValidationResult.schema must be set when is_valid=True"
        )

        vreport = run_data_quality_validation(
            file_path=_local_path,
            columns=validation.columns,
            encoding=validation.encoding,
            delimiter=validation.delimiter,
            row_count=validation.row_count,
            column_types=validation.schema.column_types,
        )

        # Build and persist the canonical DatasetValidationContext
        # keyed by dataset_id — independent of the job lifecycle.
        validated_at = datetime.now(timezone.utc)
        ctx = DatasetValidationContext(
            dataset_id=dataset_id,
            job_id=job_id,
            filename=filename,
            validated_at=validated_at,
            schema_version=validation.schema.schema_version,
            column_names=validation.schema.column_names,
            column_types=validation.schema.column_types,
            delimiter=validation.delimiter,
            encoding=validation.encoding,
            row_count=validation.row_count,
            column_count=len(validation.columns),
            size_bytes=size_bytes,
            ml_task_type=vreport.ml_task_type,
            ml_confidence=vreport.ml_confidence,
            ml_reasoning=vreport.ml_reasoning,
            validation_score=vreport.validation_score,
            validation_report=vreport,
        )
        store_validation_context(ctx)

        update_job_state(
            job_id,
            JobStatusEnum.RUNNING.value,
            40.0,
            "Data Quality Report Ready",
            (
                f"Score: {vreport.validation_score:.0f}/100 — "
                f"{vreport.errors} error(s), {vreport.warnings} warning(s) — "
                f"ML task: {vreport.ml_task_type} "
                f"({vreport.ml_confidence:.0%} confidence)"
            ),
            estimated_seconds=2.0,
        )
        logger.info(
            "Stage 1.5 complete — job=%s score=%.1f errors=%d warnings=%d "
            "ml_task=%s ml_conf=%.2f",
            job_id,
            vreport.validation_score,
            vreport.errors,
            vreport.warnings,
            vreport.ml_task_type,
            vreport.ml_confidence,
        )

        # ── Stage 2: Schema fingerprint generation (40 → 55%) ─────────────
        update_job_state(
            job_id,
            JobStatusEnum.RUNNING.value,
            45.0,
            "Schema Fingerprinting",
            "Computing deterministic schema fingerprint from metadata",
            estimated_seconds=2.0,
        )

        version_id, sha256_hex = generate_schema_fingerprint(validation.schema)

        update_job_state(
            job_id,
            JobStatusEnum.RUNNING.value,
            55.0,
            "Schema Fingerprint Ready",
            f"Fingerprint computed: {version_id} (sha256:{sha256_hex[:16]}…)",
            estimated_seconds=2.0,
        )
        logger.info(
            "Schema fingerprint — job=%s version_id=%s", job_id, version_id
        )

        # ── Stage 3: Statistical column profiling (55 → 85%) ──────────────
        update_job_state(
            job_id,
            JobStatusEnum.RUNNING.value,
            60.0,
            "Statistical Profiling",
            "Running column-level statistical analysis",
            estimated_seconds=4.0,
        )

        rows: list[dict[str, str]] = []
        try:
            # _local_path is already a real filesystem path (resolved before Stage 1).
            # For local backend: it equals storage_path.
            # For MinIO backend: it is the temp file downloaded before Stage 1.
            with open(
                _local_path,
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
            85.0,
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

        # ── Stage 4: Commit final metadata to _JOBS_STORE (85 → 100%) ─────
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
                    # ── V4 additions — additive, never overwrite existing keys ──
                    "validation_score": vreport.validation_score,
                    "ml_task_type": vreport.ml_task_type,
                    "validation_report": {
                        "passed": vreport.passed,
                        "validation_score": vreport.validation_score,
                        "warnings": vreport.warnings,
                        "errors": vreport.errors,
                        "ml_task_type": vreport.ml_task_type,
                        "ml_confidence": vreport.ml_confidence,
                        "ml_reasoning": vreport.ml_reasoning,
                        "duplicate_row_count": vreport.duplicate_row_count,
                        "missing_cell_pct": vreport.missing_cell_pct,
                        "issue_count": len(vreport.issues),
                        "issues": [
                            {
                                "severity": issue.severity,
                                "category": issue.category,
                                "message": issue.message,
                                "column_name": issue.column_name,
                            }
                            for issue in vreport.issues
                        ],
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
    finally:
        # Clean up MinIO temp file regardless of success or failure.
        if _tmp_path is not None:
            try:
                os.remove(_tmp_path)
                logger.debug("Cleaned up temp file '%s'.", _tmp_path)
            except OSError:
                pass
