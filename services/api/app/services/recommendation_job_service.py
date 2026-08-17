"""Recommendation Job Service.

Orchestrates authenticated, organisation-scoped creation, cache deduplication,
retrieval, and cooperative cancellation of algorithm recommendation benchmark jobs.
"""

from __future__ import annotations

from datetime import datetime, timezone
import logging
import os
import socket
from typing import Any, Dict, List, Optional, Tuple
import uuid

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.ml.algorithm_factory import ALGORITHM_REGISTRY
from app.ml.recommendation_cache import compute_recommendation_cache_key
from app.models.dataset import Dataset
from app.models.recommendation import RecommendationJob, RecommendationJobStatus
from app.models.user import User
from app.redis_client import get_redis
from app.schemas.recommendation import (
    RecommendationCandidateItem,
    RecommendationJobCreateRequest,
    RecommendationJobResponse,
)

logger = logging.getLogger("apex_ml.recommendation_service")

SUPPORTED_METRICS = {
    "roc_auc",
    "pr_auc",
    "f1",
    "macro_f1",
    "accuracy",
    "balanced_accuracy",
    "rmse",
    "mae",
    "r2",
    "mse",
}


def _is_redis_broker_available(host: str | None = None, port: int | None = None, timeout: float = 0.5) -> bool:
    """Quick socket probe to check broker availability."""
    if os.environ.get("USE_CELERY", "").lower() in ("false", "0", "no"):
        return False
    try:
        if host is None or port is None:
            from urllib.parse import urlparse
            parsed = urlparse(settings.redis_url)
            host = host or parsed.hostname or "localhost"
            port = port or parsed.port or 6379
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except Exception:
        return False


def _orm_to_response(job: RecommendationJob) -> RecommendationJobResponse:
    """Map RecommendationJob ORM instance to typed Pydantic response."""
    rec_candidate = None
    if job.recommendation:
        rec_candidate = RecommendationCandidateItem(**job.recommendation)

    candidate_items = [
        RecommendationCandidateItem(**c) if isinstance(c, dict) else c
        for c in (job.candidates or [])
    ]

    return RecommendationJobResponse(
        job_id=str(job.id),
        dataset_id=str(job.dataset_id),
        organisation_id=str(job.organisation_id),
        status=job.status,
        stage=job.stage or "QUEUED",
        progress=float(job.progress if job.progress is not None else 0.0),
        message=job.message,
        cache_key=job.cache_key,
        created_at=job.created_at.isoformat() if job.created_at else None,
        started_at=job.started_at.isoformat() if job.started_at else None,
        completed_at=job.completed_at.isoformat() if job.completed_at else None,
        cancelled_at=job.cancelled_at.isoformat() if job.cancelled_at else None,
        recommendation=rec_candidate,
        candidates=candidate_items,
        warnings=job.warnings or [],
        exclusions=job.exclusions or [],
        reason_codes=job.reason_codes or [],
        limitations=job.limitations or [],
        reproducibility=job.reproducibility or {},
        error_details=job.error_details,
    )


class RecommendationJobService:
    """Service managing recommendation job lifecycle and database persistence."""

    async def create_or_deduplicate_job(
        self,
        *,
        dataset_id: str,
        request: RecommendationJobCreateRequest,
        current_user: User,
        db: AsyncSession,
    ) -> Tuple[RecommendationJobResponse, int, bool, bool]:
        """Create a new recommendation job or return cached/deduplicated matching job.

        Returns:
            (RecommendationJobResponse, http_status_code, is_cached, is_deduplicated)
        """
        try:
            dataset_uuid = uuid.UUID(dataset_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Dataset not found.",
            )

        # ── 1. Authorize dataset access scoped to caller's organisation ─────────
        stmt = (
            select(Dataset)
            .where(
                Dataset.id == dataset_uuid,
                Dataset.organisation_id == current_user.organisation_id,
            )
        )
        dataset = (await db.execute(stmt)).scalar_one_or_none()
        if not dataset:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Dataset not found.",
            )

        # ── 2. Validate input fields ──────────────────────────────────────────
        target_col = request.target_column.strip() if request.target_column else ""
        if not target_col:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Target column must be a non-empty string.",
            )

        clean_features: Optional[List[str]] = None
        if request.feature_columns is not None:
            clean_features = [f.strip() for f in request.feature_columns if f and f.strip()]
            if target_col in clean_features:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Target column cannot be included in feature columns.",
                )
            if len(clean_features) == 0:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="At least one feature column must be available for training.",
                )
            clean_features = sorted(list(set(clean_features)))

        if request.metric is not None:
            metric_clean = request.metric.strip().lower()
            if metric_clean not in SUPPORTED_METRICS:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Unsupported metric '{request.metric}'. Supported metrics: {', '.join(sorted(SUPPORTED_METRICS))}.",
                )
        else:
            metric_clean = None

        if request.cv_folds < 2 or request.cv_folds > 10:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="cv_folds must be between 2 and 10.",
            )

        if request.train_test_split < 0.5 or request.train_test_split > 1.0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="train_test_split must be between 0.5 and 1.0.",
            )

        # ── 3. Build canonical cache key ──────────────────────────────────────
        constraints_dict = {
            "max_training_seconds": request.max_training_seconds or 120,
            "prefer_interpretable": request.prefer_interpretable,
        }
        cache_key = compute_recommendation_cache_key(
            dataset_content_hash=dataset_id,
            target_column=target_col,
            feature_columns=clean_features,
            metric=metric_clean,
            cv_folds=request.cv_folds,
            random_seed=request.random_seed,
            train_test_split=request.train_test_split,
            max_training_seconds=request.max_training_seconds,
            prefer_interpretable=request.prefer_interpretable,
        )

        req_config_dict: Dict[str, Any] = {
            "target_column": target_col,
            "feature_columns": clean_features,
            "metric": metric_clean,
            "cv_folds": request.cv_folds,
            "random_seed": request.random_seed,
            "train_test_split": request.train_test_split,
            "constraints": constraints_dict,
        }

        # ── 4. Check for completed cache hit ──────────────────────────────────
        stmt_completed = (
            select(RecommendationJob)
            .where(
                RecommendationJob.organisation_id == current_user.organisation_id,
                RecommendationJob.cache_key == cache_key,
                RecommendationJob.status == RecommendationJobStatus.COMPLETED.value,
            )
            .order_by(RecommendationJob.completed_at.desc())
            .limit(1)
        )
        cached_job = (await db.execute(stmt_completed)).scalar_one_or_none()
        if cached_job:
            logger.info(
                "Recommendation cache HIT for dataset %s (job %s, org %s)",
                dataset_id,
                cached_job.id,
                current_user.organisation_id,
            )
            return _orm_to_response(cached_job), status.HTTP_200_OK, True, False

        # ── 5. Check for active deduplication ─────────────────────────────────
        stmt_active = (
            select(RecommendationJob)
            .where(
                RecommendationJob.organisation_id == current_user.organisation_id,
                RecommendationJob.cache_key == cache_key,
                RecommendationJob.status.in_([
                    RecommendationJobStatus.PENDING.value,
                    RecommendationJobStatus.QUEUED.value,
                    RecommendationJobStatus.PROFILING.value,
                    RecommendationJobStatus.SCREENING.value,
                    RecommendationJobStatus.VERIFYING.value,
                ]),
            )
            .order_by(RecommendationJob.created_at.desc())
            .limit(1)
        )
        active_job = (await db.execute(stmt_active)).scalar_one_or_none()
        if active_job:
            logger.info(
                "Recommendation active deduplication for dataset %s (job %s, org %s)",
                dataset_id,
                active_job.id,
                current_user.organisation_id,
            )
            return _orm_to_response(active_job), status.HTTP_202_ACCEPTED, False, True

        # ── 6. Create new QUEUED RecommendationJob ────────────────────────────
        job_id = uuid.uuid4()
        new_job = RecommendationJob(
            id=job_id,
            organisation_id=current_user.organisation_id,
            user_id=current_user.id,
            dataset_id=dataset_uuid,
            status=RecommendationJobStatus.QUEUED.value,
            stage="QUEUED",
            progress=0.0,
            cache_key=cache_key,
            request_config=req_config_dict,
            candidates=[],
            warnings=[],
            exclusions=[],
            reason_codes=[],
            limitations=[],
            reproducibility={},
        )
        db.add(new_job)

        try:
            await db.commit()
            await db.refresh(new_job)
        except IntegrityError:
            # Concurrent race caught by partial unique index
            await db.rollback()
            race_active = (await db.execute(stmt_active)).scalar_one_or_none()
            if race_active:
                return _orm_to_response(race_active), status.HTTP_202_ACCEPTED, False, True
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Database race conflict occurred while queueing recommendation job.",
            )

        # ── 7. Dispatch Celery task after commit ──────────────────────────────
        broker_live = _is_redis_broker_available()
        if not broker_live:
            await db.execute(
                update(RecommendationJob)
                .where(RecommendationJob.id == new_job.id)
                .values(
                    status=RecommendationJobStatus.FAILED.value,
                    stage="Failed",
                    error_details={"error_type": "QueueUnavailable", "message": "Celery broker unavailable for job dispatch"},
                    completed_at=datetime.now(timezone.utc),
                )
            )
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Recommendation queue service is temporarily unavailable. Please retry later.",
            )

        try:
            from services.worker.tasks.recommendation_task import execute_recommendation_benchmark_job

            task_res = execute_recommendation_benchmark_job.delay(str(new_job.id))
            if hasattr(task_res, "id"):
                await db.execute(
                    update(RecommendationJob)
                    .where(RecommendationJob.id == new_job.id)
                    .values(celery_task_id=task_res.id)
                )
                await db.commit()
        except Exception as exc:
            logger.error("Celery dispatch failure for recommendation job %s: %s", new_job.id, exc)
            await db.execute(
                update(RecommendationJob)
                .where(RecommendationJob.id == new_job.id)
                .values(
                    status=RecommendationJobStatus.FAILED.value,
                    stage="Failed",
                    error_details={"error_type": "DispatchFailed", "message": "Failed to dispatch job to Celery worker"},
                    completed_at=datetime.now(timezone.utc),
                )
            )
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Recommendation queue service is temporarily unavailable. Please retry later.",
            )

        logger.info(
            "Created and queued RecommendationJob %s for dataset %s (org %s)",
            new_job.id,
            dataset_id,
            current_user.organisation_id,
        )
        return _orm_to_response(new_job), status.HTTP_202_ACCEPTED, False, False

    async def get_recommendation_job(
        self,
        *,
        dataset_id: str,
        job_id: str,
        current_user: User,
        db: AsyncSession,
    ) -> RecommendationJobResponse:
        """Query a single recommendation job with strict multi-tenant scoping."""
        try:
            dataset_uuid = uuid.UUID(dataset_id)
            job_uuid = uuid.UUID(job_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Recommendation job not found.",
            )

        stmt = (
            select(RecommendationJob)
            .where(
                RecommendationJob.id == job_uuid,
                RecommendationJob.dataset_id == dataset_uuid,
                RecommendationJob.organisation_id == current_user.organisation_id,
            )
        )
        job = (await db.execute(stmt)).scalar_one_or_none()
        if not job:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Recommendation job not found.",
            )

        return _orm_to_response(job)

    async def cancel_recommendation_job(
        self,
        *,
        dataset_id: str,
        job_id: str,
        current_user: User,
        db: AsyncSession,
    ) -> RecommendationJobResponse:
        """Cancel an active recommendation job with strict multi-tenant scoping."""
        try:
            dataset_uuid = uuid.UUID(dataset_id)
            job_uuid = uuid.UUID(job_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Recommendation job not found.",
            )

        stmt = (
            select(RecommendationJob)
            .where(
                RecommendationJob.id == job_uuid,
                RecommendationJob.dataset_id == dataset_uuid,
                RecommendationJob.organisation_id == current_user.organisation_id,
            )
        )
        job = (await db.execute(stmt)).scalar_one_or_none()
        if not job:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Recommendation job not found.",
            )

        # Idempotent: if already cancelled, return existing state
        if job.status == RecommendationJobStatus.CANCELLED.value:
            return _orm_to_response(job)

        # Conflict: terminal states cannot be cancelled
        if job.status in (
            RecommendationJobStatus.COMPLETED.value,
            RecommendationJobStatus.FAILED.value,
            RecommendationJobStatus.INSUFFICIENT_DATA.value,
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Cannot cancel job with terminal status '{job.status}'.",
            )

        # Active state -> Cancel atomically
        now = datetime.now(timezone.utc)
        job.status = RecommendationJobStatus.CANCELLED.value
        job.stage = "Cancelled"
        job.cancelled_at = now
        await db.commit()
        await db.refresh(job)

        # Write Redis cancellation token
        try:
            r = await get_redis()
            if r is not None:
                await r.set(f"recommendation:cancel:{job_id}", "1", ex=86400)
        except Exception as exc:
            logger.debug("Redis cancellation token write error: %s", exc)

        # Safe Celery task revocation attempt
        if job.celery_task_id:
            try:
                from services.worker.celery_app import celery_app
                celery_app.control.revoke(job.celery_task_id, terminate=False)
            except Exception as exc:
                logger.debug("Celery revoke attempt notice: %s", exc)

        logger.info("Recommendation job %s cancelled by user %s", job_id, current_user.id)
        return _orm_to_response(job)

    async def get_latest_completed_job(
        self,
        *,
        dataset_id: str,
        organisation_id: uuid.UUID,
        db: AsyncSession,
    ) -> Optional[RecommendationJobResponse]:
        """Query the latest completed benchmark job for this dataset within the organisation."""
        try:
            dataset_uuid = uuid.UUID(dataset_id)
        except ValueError:
            return None

        stmt = (
            select(RecommendationJob)
            .where(
                RecommendationJob.dataset_id == dataset_uuid,
                RecommendationJob.organisation_id == organisation_id,
                RecommendationJob.status == RecommendationJobStatus.COMPLETED.value,
            )
            .order_by(RecommendationJob.completed_at.desc())
            .limit(1)
        )
        job = (await db.execute(stmt)).scalar_one_or_none()
        if not job:
            return None
        return _orm_to_response(job)


recommendation_job_service = RecommendationJobService()
