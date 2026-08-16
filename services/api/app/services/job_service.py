"""Job Management Service.

Handles ML Job creation, status transition, stage progress tracking,
asynchronous scikit-learn model training execution, cancellation, retries,
and soft-deletion using PostgreSQL database via SQLAlchemy async sessions.

Preserves in-memory store for test compatibility and telemetry fallback.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import logging
import os
import socket
import sys
from typing import Any, Dict, Optional, List
import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.ml.algorithm_factory import (
    ALGORITHM_REGISTRY,
    AlgorithmTaskMismatchError,
    get_algorithm,
)
from app.ml.dataset_loader import DatasetValidationError, load_dataset_context
from app.ml.problem_detector import ProblemType, detect_problem_type
from app.models.job import Job
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

# In-memory store — preserved for test compatibility & fast lookup
_JOBS_STORE: Dict[str, JobResponse] = {}


def _validate_algorithm_target_compatibility(request: TrainingRequest) -> str:
    """Verify the selected algorithm matches the uploaded target before queuing work."""
    try:
        context = load_dataset_context(
            dataset_id=request.dataset_id,
            target_column=request.target_column,
            feature_columns=request.feature_columns,
        )
    except (DatasetValidationError, FileNotFoundError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Training request cannot be validated: {exc}",
        ) from exc

    problem_type = detect_problem_type(context)
    task_type = (
        "classification"
        if problem_type in (ProblemType.BINARY_CLASSIFICATION, ProblemType.MULTI_CLASSIFICATION)
        else "regression"
    )
    try:
        get_algorithm(request.algorithm, task_type=task_type, random_state=request.random_seed or 42)
    except AlgorithmTaskMismatchError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    return ALGORITHM_REGISTRY[request.algorithm].display_name


def is_redis_available(host: str = "localhost", port: int = 6379, timeout: float = 0.5) -> bool:
    """Quick socket check to verify if Redis broker is active."""
    if os.environ.get("USE_CELERY", "").lower() in ("false", "0", "no"):
        return False
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except Exception:
        return False


def job_to_response(job: Job) -> JobResponse:
    """Map ORM Job instance to Pydantic JobResponse schema."""
    return JobResponse(
        job_id=str(job.id),
        dataset_id=job.dataset_id or "",
        status=job.status,
        created_at=job.created_at,
        updated_at=job.updated_at,
        started_at=job.started_at,
        completed_at=job.completed_at,
        cancelled_at=job.cancelled_at,
        job_type=job.job_type,
        algorithm=job.algorithm or "",
        target_column=job.target_column or "",
        feature_columns=job.feature_columns or [],
        progress=job.progress,
        current_stage=job.current_stage,
        message=job.message,
        estimated_seconds=job.estimated_seconds,
        worker_id=job.worker_id,
        error_message=job.error_message,
        retry_count=job.retry_count,
        owner_id=job.owner_id,
        metadata=job.job_metadata or {},
    )


def _assert_owner(job: JobResponse | Job, user_id: str) -> None:
    """Raise HTTP 403 if *user_id* is not the job owner."""
    owner = job.owner_id if isinstance(job, JobResponse) else job.owner_id
    if owner != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this job.",
        )


def update_job_state(
    job_id: str,
    status_val: str,
    pct: float,
    stage_name: str,
    message: str,
    estimated_seconds: float = 0.0,
    error_msg: Optional[str] = None,
    metadata_update: Optional[Dict[str, Any]] = None,
) -> None:
    """Write live progress update into PostgreSQL DB and in-memory _JOBS_STORE."""
    # 1. In-memory update
    try:
        if job_id in _JOBS_STORE:
            current_job = _JOBS_STORE[job_id]
            if current_job.status != JobStatusEnum.CANCELLED.value:
                now = datetime.now(timezone.utc)
                new_meta = dict(current_job.metadata)
                if metadata_update:
                    new_meta.update(metadata_update)

                updated_job = current_job.model_copy(
                    update={
                        "status": status_val,
                        "progress": pct,
                        "current_stage": stage_name,
                        "message": message,
                        "estimated_seconds": estimated_seconds,
                        "error_message": error_msg,
                        "updated_at": now,
                        "completed_at": (
                            now if status_val == JobStatusEnum.COMPLETED.value else None
                        ),
                        "metadata": new_meta,
                    }
                )
                _JOBS_STORE[job_id] = updated_job
    except Exception as exc:
        logger.warning("In-memory job state update failed for %s: %s", job_id, exc)

    # 2. Database update
    async def _async_db_update():
        session = None
        try:
            try:
                job_uuid = uuid.UUID(job_id)
            except ValueError:
                return

            session = AsyncSessionLocal()
            stmt = select(Job).where(Job.id == job_uuid, Job.is_deleted == False)
            res = await session.execute(stmt)
            db_job = res.scalar_one_or_none()
            if db_job and db_job.status != JobStatusEnum.CANCELLED.value:
                now = datetime.now(timezone.utc)
                db_job.status = status_val
                db_job.progress = pct
                db_job.current_stage = stage_name
                db_job.message = message
                db_job.estimated_seconds = estimated_seconds
                db_job.updated_at = now
                if error_msg is not None:
                    db_job.error_message = error_msg
                if status_val == JobStatusEnum.COMPLETED.value:
                    db_job.completed_at = now
                if metadata_update:
                    current_meta = dict(db_job.job_metadata or {})
                    current_meta.update(metadata_update)
                    db_job.job_metadata = current_meta
                await session.commit()
        except Exception as err:
            logger.warning("DB job state update failed for %s: %s", job_id, err)
        finally:
            if session is not None:
                try:
                    await session.close()
                except Exception:
                    pass

    try:
        loop = asyncio.get_running_loop()
        if loop.is_running():
            loop.create_task(_async_db_update())
            return
    except RuntimeError:
        pass

    try:
        asyncio.run(_async_db_update())
    except Exception as exc:
        logger.warning("Failed to run DB update for %s: %s", job_id, exc)


class JobService:
    """Enterprise ML Job Orchestration & Service Layer using SQLAlchemy Async Sessions."""

    def __init__(self, runner: Optional[Callable[[str, Dict[str, Any]], Awaitable[None]]] = None) -> None:
        """Initialize JobService with optional runner callable for dependency injection."""
        self._runner = runner

    # ------------------------------------------------------------------
    # Create
    # ------------------------------------------------------------------

    async def create_job(
        self,
        request: TrainingRequest,
        *,
        user_id: str,
        db: AsyncSession | None = None,
    ) -> JobResponse:
        """Create and queue a new Machine Learning training job."""
        return await self._create_job_impl(db, request, user_id=user_id)

    async def _create_job_impl(
        self,
        db: AsyncSession | None,
        request: TrainingRequest,
        *,
        user_id: str,
    ) -> JobResponse:
        algorithm_display_name = _validate_algorithm_target_compatibility(request)
        job_uuid = uuid.uuid4()
        job_id = str(job_uuid)
        now = datetime.now(timezone.utc)

        config: Dict[str, Any] = {
            "dataset_id": request.dataset_id,
            "target_column": request.target_column,
            "feature_columns": request.feature_columns,
            "algorithm": request.algorithm,
            "scaler": getattr(request, "scaler", "standard_scaler") or "standard_scaler",
            "imputer": getattr(request, "imputer", "median") or "median",
            "train_test_split": getattr(request, "train_test_split", 0.8),
            "random_seed": getattr(request, "random_seed", 42),
            "cross_validation": getattr(request, "cross_validation", 5),
            "cv_n_splits": getattr(request, "cv_n_splits", None) or getattr(request, "cross_validation", 5),
            "normalization": getattr(request, "normalization", True),
            "feature_selection": getattr(request, "feature_selection", "all"),
            "class_weight": getattr(request, "class_weight", "balanced"),
            "notes": getattr(request, "notes", ""),
            "created_at": now.isoformat(),
        }

        job_resp = JobResponse(
            job_id=job_id,
            dataset_id=request.dataset_id,
            status=JobStatusEnum.QUEUED.value,
            created_at=now,
            updated_at=now,
            started_at=now,
            job_type="training",
            algorithm=algorithm_display_name,
            target_column=request.target_column,
            feature_columns=request.feature_columns,
            progress=0.0,
            current_stage="Queued in orchestration queue",
            message=f"Training job initialized for dataset '{request.dataset_id}'.",
            estimated_seconds=10.0,
            worker_id=f"worker-{uuid.uuid4().hex[:8]}",
            retry_count=0,
            owner_id=user_id,
            metadata=config,
        )
        _JOBS_STORE[job_id] = job_resp

        if db is not None:
            user_uuid = None
            try:
                user_uuid = uuid.UUID(user_id)
            except ValueError:
                pass

            try:
                dataset_uuid = None
                if request.dataset_id:
                    try:
                        dataset_uuid = uuid.UUID(request.dataset_id)
                    except ValueError:
                        dataset_uuid = None

                db_job = Job(
                    id=job_uuid,
                    user_id=user_uuid,
                    owner_id=user_id,
                    dataset_id=dataset_uuid,
                    status=JobStatusEnum.QUEUED.value,
                    job_type="training",
                    algorithm=algorithm_display_name,
                    target_column=request.target_column,
                    feature_columns=request.feature_columns,
                    job_metadata=config,
                    created_at=now,
                    updated_at=now,
                )
                db.add(db_job)
                await db.commit()
                await db.refresh(db_job)
                job_resp = job_to_response(db_job)
                _JOBS_STORE[job_id] = job_resp
                logger.info("Job %s persisted to PostgreSQL DB.", job_id)
            except HTTPException:
                raise
            except Exception as db_exc:
                logger.warning("DB insert failed (using in-memory store): %s", db_exc)

        await self._dispatch_job_execution(job_id, config)
        return job_resp

    # ------------------------------------------------------------------
    # Internal dispatch
    # ------------------------------------------------------------------

    async def _dispatch_job_execution(self, job_id: str, config: Dict[str, Any]) -> None:
        """Dispatch to injected runner, Celery worker (if Redis is live), or lazy-imported async ML engine."""
        if self._runner is not None:
            asyncio.create_task(self._runner(job_id, config))
            logger.info("Dispatched job %s to injected runner.", job_id)
            return

        if is_redis_available():
            try:
                from services.worker.tasks.training_task import execute_ml_training_job

                execute_ml_training_job.delay(job_id, config)
                logger.info("Dispatched job %s to Celery worker.", job_id)
                return
            except Exception as exc:
                logger.warning("Celery dispatch failed: %s. Falling back to async engine.", exc)

        # LAZY IMPORT: Deferred inside function body to eliminate top-level circular import with engine.py
        from app.ml.engine import execute_ml_training_pipeline_async

        asyncio.create_task(execute_ml_training_pipeline_async(job_id, config))
        logger.info("Dispatched job %s to async ML training engine.", job_id)

    # ------------------------------------------------------------------
    # Read
    # ------------------------------------------------------------------

    async def list_jobs(
        self,
        *,
        user_id: str,
        skip: int = 0,
        limit: int = 50,
        db: AsyncSession | None = None,
    ) -> JobListResponse:
        """Return paginated jobs belonging to *user_id*, newest first."""
        return await self._list_jobs_impl(db, user_id=user_id, skip=skip, limit=limit)

    async def _list_jobs_impl(
        self,
        db: AsyncSession | None,
        *,
        user_id: str,
        skip: int = 0,
        limit: int = 50,
    ) -> JobListResponse:
        job_list: List[JobResponse] = []
        db_job_ids = set()

        if db is not None:
            try:
                stmt = (
                    select(Job)
                    .where(Job.owner_id == user_id, Job.is_deleted == False)
                    .order_by(Job.created_at.desc())
                )
                res = await db.execute(stmt)
                db_jobs = res.scalars().all()
                job_list = [job_to_response(j) for j in db_jobs]
                db_job_ids = {j.job_id for j in job_list}
            except HTTPException:
                raise
            except Exception as db_exc:
                logger.warning("DB list jobs failed (using in-memory store): %s", db_exc)

        # Include any memory-only jobs from _JOBS_STORE for caller
        for j in _JOBS_STORE.values():
            if j.owner_id == user_id and j.job_id not in db_job_ids:
                job_list.append(j)

        job_list.sort(key=lambda j: j.created_at, reverse=True)
        paginated = job_list[skip : skip + limit]

        return JobListResponse(total=len(job_list), jobs=paginated)

    async def get_job(
        self,
        job_id: str,
        *,
        user_id: str,
        db: AsyncSession | None = None,
    ) -> JobResponse:
        """Retrieve complete job details by Job ID."""
        return await self._get_job_impl(db, job_id, user_id=user_id)

    async def _get_job_impl(
        self,
        db: AsyncSession | None,
        job_id: str,
        *,
        user_id: str,
    ) -> JobResponse:
        db_job = None
        if db is not None:
            try:
                job_uuid = uuid.UUID(job_id)
                stmt = select(Job).where(Job.id == job_uuid, Job.is_deleted == False)
                res = await db.execute(stmt)
                db_job = res.scalar_one_or_none()
            except HTTPException:
                raise
            except (ValueError, Exception) as db_exc:
                logger.warning("DB get_job lookup failed for %s: %s", job_id, db_exc)

        if db_job is not None:
            _assert_owner(db_job, user_id)
            resp = job_to_response(db_job)
            _JOBS_STORE[job_id] = resp
            return resp

        # Fallback to _JOBS_STORE
        in_mem_job = _JOBS_STORE.get(job_id)
        if in_mem_job is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"ML Job with ID '{job_id}' not found.",
            )
        _assert_owner(in_mem_job, user_id)
        return in_mem_job

    async def get_job_progress(
        self,
        job_id: str,
        *,
        user_id: str,
        db: AsyncSession | None = None,
    ) -> JobProgressResponse:
        """Return live progress telemetry for a specific Job ID."""
        job = await self.get_job(job_id, user_id=user_id, db=db)
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

    async def cancel_job(
        self,
        job_id: str,
        *,
        user_id: str,
        db: AsyncSession | None = None,
    ) -> JobCancelResponse:
        """Transition active job to CANCELLED state."""
        return await self._cancel_job_impl(db, job_id, user_id=user_id)

    async def _cancel_job_impl(
        self,
        db: AsyncSession | None,
        job_id: str,
        *,
        user_id: str,
    ) -> JobCancelResponse:
        job = await self._get_job_impl(db, job_id, user_id=user_id)

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
        if db is not None:
            try:
                job_uuid = uuid.UUID(job_id)
                stmt = select(Job).where(Job.id == job_uuid)
                res = await db.execute(stmt)
                db_job = res.scalar_one_or_none()
                if db_job:
                    db_job.status = JobStatusEnum.CANCELLED.value
                    db_job.current_stage = "Job execution cancelled by user"
                    db_job.message = "Job cancelled prior to completion."
                    db_job.cancelled_at = now
                    db_job.updated_at = now
                    await db.commit()
            except HTTPException:
                raise
            except Exception as db_exc:
                logger.warning("DB cancel_job update failed for %s: %s", job_id, db_exc)

        if job_id in _JOBS_STORE:
            _JOBS_STORE[job_id] = _JOBS_STORE[job_id].model_copy(
                update={
                    "status": JobStatusEnum.CANCELLED.value,
                    "current_stage": "Job execution cancelled by user",
                    "message": "Job cancelled prior to completion.",
                    "cancelled_at": now,
                    "updated_at": now,
                }
            )

        logger.info("Job %s cancelled by user %s.", job_id, user_id)
        return JobCancelResponse(
            job_id=job_id,
            status=JobStatusEnum.CANCELLED.value,
            cancelled_at=now,
            message="Training job was cancelled successfully.",
        )

    async def retry_job(
        self,
        job_id: str,
        *,
        user_id: str,
        db: AsyncSession | None = None,
    ) -> JobRetryResponse:
        """Create a new job retry run linked to original job configuration."""
        return await self._retry_job_impl(db, job_id, user_id=user_id)

    async def _retry_job_impl(
        self,
        db: AsyncSession | None,
        job_id: str,
        *,
        user_id: str,
    ) -> JobRetryResponse:
        original_job = await self._get_job_impl(db, job_id, user_id=user_id)
        new_job_uuid = uuid.uuid4()
        new_job_id = str(new_job_uuid)
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

        if db is not None:
            user_uuid = None
            try:
                user_uuid = uuid.UUID(user_id)
            except ValueError:
                pass

            try:
                db_job = Job(
                    id=new_job_uuid,
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
                    worker_id=retried_job.worker_id,
                    retry_count=new_retry_count,
                    owner_id=original_job.owner_id,
                    job_metadata=config,
                    user_id=user_uuid,
                    is_deleted=False,
                )
                db.add(db_job)
                await db.commit()
                await db.refresh(db_job)
                retried_job = job_to_response(db_job)
                _JOBS_STORE[new_job_id] = retried_job
            except HTTPException:
                raise
            except Exception as db_exc:
                logger.warning("DB retry_job insert failed: %s", db_exc)

        logger.info(
            "Job %s retried as %s by user %s (attempt #%d).",
            job_id, new_job_id, user_id, new_retry_count,
        )

        await self._dispatch_job_execution(new_job_id, config)

        return JobRetryResponse(
            original_job_id=job_id,
            new_job_id=new_job_id,
            status=JobStatusEnum.QUEUED.value,
            retry_count=new_retry_count,
            message=f"Successfully queued job retry #{new_retry_count}.",
        )

    async def delete_job(
        self,
        job_id: str,
        *,
        user_id: str,
        db: AsyncSession | None = None,
    ) -> dict[str, str]:
        """Soft delete a job entity without purging database history."""
        return await self._delete_job_impl(db, job_id, user_id=user_id)

    async def _delete_job_impl(
        self,
        db: AsyncSession | None,
        job_id: str,
        *,
        user_id: str,
    ) -> dict[str, str]:
        job_resp = await self._get_job_impl(db, job_id, user_id=user_id)
        if db is not None:
            try:
                job_uuid = uuid.UUID(job_id)
                stmt = select(Job).where(Job.id == job_uuid)
                res = await db.execute(stmt)
                db_job = res.scalar_one_or_none()
                if db_job:
                    db_job.is_deleted = True
                    await db.commit()
            except HTTPException:
                raise
            except Exception as db_exc:
                logger.warning("DB delete_job failed for %s: %s", job_id, db_exc)

        _JOBS_STORE.pop(job_id, None)
        logger.info("Job %s soft-deleted by user %s.", job_id, user_id)
        return {"message": f"Job '{job_id}' soft deleted successfully."}


# Singleton service instance
job_service = JobService()
