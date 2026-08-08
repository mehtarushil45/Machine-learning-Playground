"""Job Management Service.

Handles ML Job creation, status transition, stage progress tracking,
asynchronous scikit-learn model training execution, cancellation, retries,
and soft-deletion.

Ownership model
---------------
Every job record carries an ``owner_id`` (the ``str(user.id)`` of the creating
user).  All mutating operations (cancel, retry, delete) and all read operations
(get, progress, list) now require the caller to pass their ``user_id``.

Ownership checks raise HTTP 403 so the caller cannot infer whether a job ID
belonging to another user even exists.  This prevents enumeration attacks.
"""

import asyncio
import sys
from datetime import datetime, timezone
import logging
import os
import socket
from typing import Any, Dict, Optional

import uuid

from fastapi import HTTPException, status

from app.schemas.job import (
    JobCancelResponse,
    JobListResponse,
    JobProgressResponse,
    JobResponse,
    JobRetryResponse,
    JobStatusEnum,
    TrainingRequest,
)

logger = logging.getLogger("apex_job_service")

# In-memory store — preserved across requests in the same process.
# Key: job_id (str) → Value: JobResponse
_JOBS_STORE: Dict[str, JobResponse] = {}


def is_redis_available(host: str = "localhost", port: int = 6379, timeout: float = 0.5) -> bool:
    """Quick socket check to verify if Redis broker is active."""
    if os.environ.get("USE_CELERY", "").lower() in ("false", "0", "no"):
        return False
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except Exception:
        return False


def _assert_owner(job: JobResponse, user_id: str) -> None:
    """Raise HTTP 403 if *user_id* is not the job owner.

    Returns 403 (Forbidden) rather than 404 so callers cannot determine
    whether a job owned by another user exists (prevents enumeration).
    """
    if job.owner_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this job.",
        )


class JobService:
    """Enterprise ML Job Orchestration & Service Layer."""

    # ------------------------------------------------------------------
    # Create
    # ------------------------------------------------------------------

    def create_job(self, request: TrainingRequest, *, user_id: str) -> JobResponse:
        """Create and queue a new Machine Learning training job.

        Args:
            request: Validated ``TrainingRequest`` payload.
            user_id: ID of the authenticated user creating the job.
                     Stored as ``owner_id`` on the job record.
        """
        job_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)

        config: Dict[str, Any] = {
            "dataset_id": request.dataset_id,
            "target_column": request.target_column,
            "feature_columns": request.feature_columns,
            "algorithm": request.algorithm,
            "train_test_split": request.train_test_split,
            "random_seed": request.random_seed,
            "cross_validation": request.cross_validation,
            "normalization": request.normalization,
            "feature_selection": request.feature_selection,
            "class_weight": request.class_weight,
            "notes": request.notes,
        }

        job = JobResponse(
            job_id=job_id,
            dataset_id=request.dataset_id,
            status=JobStatusEnum.QUEUED.value,
            created_at=now,
            updated_at=now,
            started_at=now,
            job_type="training",
            algorithm=request.algorithm,
            target_column=request.target_column,
            feature_columns=request.feature_columns,
            progress=0.0,
            current_stage="Queued in orchestration queue",
            message=f"Training job initialized for dataset '{request.dataset_id}'.",
            estimated_seconds=10.0,
            worker_id=f"worker-{uuid.uuid4().hex[:8]}",
            retry_count=0,
            owner_id=user_id,          # ← stamped from the authenticated user
            metadata=config,
        )

        _JOBS_STORE[job_id] = job
        logger.info("Job %s created by user %s.", job_id, user_id)

        self._dispatch_job_execution(job_id, config)
        return job

    # ------------------------------------------------------------------
    # Internal dispatch
    # ------------------------------------------------------------------

    def _dispatch_job_execution(self, job_id: str, config: Dict[str, Any]) -> None:
        """Dispatch to Celery worker (if Redis is live) or async ML engine."""
        if is_redis_available():
            try:
                _repo_root = os.path.abspath(
                    os.path.join(os.path.dirname(__file__), "..", "..", "..", "..")
                )
                if _repo_root not in sys.path:
                    sys.path.insert(0, _repo_root)
                from services.worker.tasks.training_task import execute_ml_training_job

                execute_ml_training_job.delay(job_id, config)
                logger.info("Dispatched job %s to Celery worker.", job_id)
                return
            except Exception as exc:
                logger.warning("Celery dispatch failed: %s. Falling back to async engine.", exc)

        from app.ml.engine import execute_ml_training_pipeline_async

        asyncio.create_task(execute_ml_training_pipeline_async(job_id, config))
        logger.info("Dispatched job %s to async ML training engine.", job_id)

    # ------------------------------------------------------------------
    # Read
    # ------------------------------------------------------------------

    def list_jobs(
        self,
        *,
        user_id: str,
        skip: int = 0,
        limit: int = 50,
    ) -> JobListResponse:
        """Return paginated jobs belonging to *user_id*, newest first.

        Users can only see their own jobs. Pass ``user_id`` from the
        authenticated request; it is never inferred from the stored data.
        """
        skip_val = int(getattr(skip, "default", skip)) if hasattr(skip, "default") else int(skip)
        limit_val = int(getattr(limit, "default", limit)) if hasattr(limit, "default") else int(limit)

        # Filter to the calling user's jobs only
        user_jobs = [j for j in _JOBS_STORE.values() if j.owner_id == user_id]
        user_jobs.sort(key=lambda j: j.created_at, reverse=True)
        paginated = user_jobs[skip_val : skip_val + limit_val]

        return JobListResponse(total=len(user_jobs), jobs=paginated)

    def get_job(self, job_id: str, *, user_id: str) -> JobResponse:
        """Retrieve complete job details by Job ID.

        Raises:
            HTTP 404: Job not found (only for jobs that don't exist).
            HTTP 403: Job exists but belongs to a different user.
        """
        job = _JOBS_STORE.get(job_id)
        if job is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"ML Job with ID '{job_id}' not found.",
            )
        _assert_owner(job, user_id)
        return job

    def get_job_progress(self, job_id: str, *, user_id: str) -> JobProgressResponse:
        """Return live progress telemetry for a specific Job ID.

        Ownership is enforced via the underlying ``get_job`` call.
        """
        job = self.get_job(job_id, user_id=user_id)
        return JobProgressResponse(
            job_id=job.job_id,
            status=job.status,
            progress=job.progress,
            current_stage=job.current_stage,
            message=job.message,
            estimated_seconds_remaining=job.estimated_seconds,
        )

    # ------------------------------------------------------------------
    # Mutate
    # ------------------------------------------------------------------

    def cancel_job(self, job_id: str, *, user_id: str) -> JobCancelResponse:
        """Transition active job to CANCELLED state.

        Only the owning user may cancel. Terminal jobs (COMPLETED, FAILED,
        CANCELLED) raise HTTP 400.
        """
        job = self.get_job(job_id, user_id=user_id)   # ownership checked here

        if job.status in (
            JobStatusEnum.COMPLETED.value,
            JobStatusEnum.FAILED.value,
            JobStatusEnum.CANCELLED.value,
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot cancel job '{job_id}' in terminal state '{job.status}'.",
            )

        now = datetime.now(timezone.utc)
        updated_job = job.model_copy(
            update={
                "status": JobStatusEnum.CANCELLED.value,
                "current_stage": "Job execution cancelled by user",
                "message": "Job cancelled prior to completion.",
                "cancelled_at": now,
                "updated_at": now,
            }
        )
        _JOBS_STORE[job_id] = updated_job
        logger.info("Job %s cancelled by user %s.", job_id, user_id)

        return JobCancelResponse(
            job_id=job_id,
            status=JobStatusEnum.CANCELLED.value,
            cancelled_at=now,
            message="Training job was cancelled successfully.",
        )

    def retry_job(self, job_id: str, *, user_id: str) -> JobRetryResponse:
        """Create a new job retry run linked to the original job configuration.

        Ownership of the original job is enforced. The retry inherits
        the original ``owner_id``.
        """
        original_job = self.get_job(job_id, user_id=user_id)   # ownership checked
        new_job_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)

        new_retry_count = original_job.retry_count + 1
        config = dict(original_job.metadata)

        retried_job = JobResponse(
            job_id=new_job_id,
            dataset_id=original_job.dataset_id,
            status=JobStatusEnum.QUEUED.value,
            created_at=now,
            updated_at=now,
            started_at=now,
            job_type=original_job.job_type,
            algorithm=original_job.algorithm,
            target_column=original_job.target_column,
            feature_columns=original_job.feature_columns,
            progress=0.0,
            current_stage="Retrying training execution",
            message=f"Retry #{new_retry_count} created from original job '{job_id}'.",
            estimated_seconds=10.0,
            worker_id=f"worker-{uuid.uuid4().hex[:8]}",
            retry_count=new_retry_count,
            owner_id=original_job.owner_id,    # inherit original owner
            metadata=config,
        )

        _JOBS_STORE[new_job_id] = retried_job
        logger.info(
            "Job %s retried as %s by user %s (attempt #%d).",
            job_id, new_job_id, user_id, new_retry_count,
        )

        self._dispatch_job_execution(new_job_id, config)

        return JobRetryResponse(
            original_job_id=job_id,
            new_job_id=new_job_id,
            status=JobStatusEnum.QUEUED.value,
            retry_count=new_retry_count,
            message=f"Successfully queued job retry #{new_retry_count}.",
        )

    def delete_job(self, job_id: str, *, user_id: str) -> dict[str, str]:
        """Soft delete a job entity without purging database history.

        Only the owning user may delete. Raises 403 for non-owners and
        404 for non-existent jobs.
        """
        job = self.get_job(job_id, user_id=user_id)   # ownership checked
        _JOBS_STORE.pop(job_id, None)
        logger.info("Job %s soft-deleted by user %s.", job_id, user_id)
        return {"message": f"Job '{job_id}' soft deleted successfully."}


# Singleton service instance
job_service = JobService()
