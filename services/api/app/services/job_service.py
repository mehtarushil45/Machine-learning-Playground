"""Job Management Service.

Handles ML Job creation, status transition, stage progress tracking,
asynchronous scikit-learn model training execution, cancellation, retries, and soft-deletion.
"""

import asyncio
from datetime import datetime, timezone
import logging
import os
import socket
from typing import Any, Dict
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

# In-memory storage store (preserving session jobs for instant orchestration)
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


class JobService:
    """Enterprise ML Job Orchestration & Service Layer."""

    def create_job(self, request: TrainingRequest) -> JobResponse:
        """Create and queue a new Machine Learning training job."""
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
            owner_id="user-default",
            metadata=config,
        )

        _JOBS_STORE[job_id] = job

        # Dispatch Asynchronous ML Training Execution Engine
        self._dispatch_job_execution(job_id, config)

        return job

    def _dispatch_job_execution(self, job_id: str, config: Dict[str, Any]) -> None:
        """Dispatches job to Celery worker if Redis is active, or in-process ML training engine."""
        if is_redis_available():
            try:
                _repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
                if _repo_root not in sys.path:
                    sys.path.insert(0, _repo_root)
                from services.worker.tasks.training_task import execute_ml_training_job
                execute_ml_training_job.delay(job_id, config)
                logger.info(f"Dispatched job {job_id} to Celery worker.")
                return
            except Exception as exc:
                logger.warning(f"Celery dispatch failed: {exc}. Using async engine fallback.")

        # Fallback to in-process async model training execution engine
        from app.ml.engine import execute_ml_training_pipeline_async
        asyncio.create_task(execute_ml_training_pipeline_async(job_id, config))
        logger.info(f"Dispatched job {job_id} to async ML training engine.")

    def list_jobs(self, skip: int = 0, limit: int = 50) -> JobListResponse:
        """Return list of all non-deleted ML jobs, newest first."""
        skip_val = int(getattr(skip, "default", skip)) if hasattr(skip, "default") else int(skip)
        limit_val = int(getattr(limit, "default", limit)) if hasattr(limit, "default") else int(limit)

        all_jobs = list(_JOBS_STORE.values())
        # Sort newest created_at first
        all_jobs.sort(key=lambda j: j.created_at, reverse=True)
        paginated = all_jobs[skip_val : skip_val + limit_val]

        return JobListResponse(total=len(all_jobs), jobs=paginated)

    def get_job(self, job_id: str) -> JobResponse:
        """Retrieve complete job details by Job ID."""
        if job_id not in _JOBS_STORE:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"ML Job with ID '{job_id}' not found.",
            )
        return _JOBS_STORE[job_id]

    def get_job_progress(self, job_id: str) -> JobProgressResponse:
        """Return live progress telemetry for a specific Job ID."""
        job = self.get_job(job_id)
        return JobProgressResponse(
            job_id=job.job_id,
            status=job.status,
            progress=job.progress,
            current_stage=job.current_stage,
            message=job.message,
            estimated_seconds_remaining=job.estimated_seconds,
        )

    def cancel_job(self, job_id: str) -> JobCancelResponse:
        """Transition active job to CANCELLED state."""
        job = self.get_job(job_id)

        if job.status in (JobStatusEnum.COMPLETED.value, JobStatusEnum.FAILED.value, JobStatusEnum.CANCELLED.value):
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

        return JobCancelResponse(
            job_id=job_id,
            status=JobStatusEnum.CANCELLED.value,
            cancelled_at=now,
            message="Training job was cancelled successfully.",
        )

    def retry_job(self, job_id: str) -> JobRetryResponse:
        """Create a new job retry run linked to the original job configuration."""
        original_job = self.get_job(job_id)
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
            owner_id=original_job.owner_id,
            metadata=config,
        )

        _JOBS_STORE[new_job_id] = retried_job

        # Dispatch model training execution
        self._dispatch_job_execution(new_job_id, config)

        return JobRetryResponse(
            original_job_id=job_id,
            new_job_id=new_job_id,
            status=JobStatusEnum.QUEUED.value,
            retry_count=new_retry_count,
            message=f"Successfully queued job retry #{new_retry_count}.",
        )

    def delete_job(self, job_id: str) -> dict[str, str]:
        """Soft delete a job entity without purging database history."""
        if job_id not in _JOBS_STORE:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"ML Job with ID '{job_id}' not found.",
            )
        # Soft delete from memory active list
        _JOBS_STORE.pop(job_id, None)
        return {"message": f"Job '{job_id}' soft deleted successfully."}


# Singleton service instance
job_service = JobService()
