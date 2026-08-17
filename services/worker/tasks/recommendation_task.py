"""Celery Recommendation Benchmark Task.

Executes asynchronous algorithm recommendation benchmarking in Celery worker processes
with database state persistence, Redis cancellation checks, canonical storage loading,
and bounded retries.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import logging
import os
from typing import Any, Dict, Optional
import uuid

import pandas as pd
from sqlalchemy import select, update
from sqlalchemy.exc import OperationalError

from contextlib import asynccontextmanager
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from services.worker.celery_app import celery_app
from services.worker.core.dataset_loader import load_dataset_dataframe
from app.config import settings
from app.ml.recommendation_engine import (
    RecommendationConfig,
    RecommendationConstraints,
    run_recommendation_benchmark,
)
from app.models.dataset import Dataset
from app.models.recommendation import RecommendationJob, RecommendationJobStatus
from app.redis_client import get_redis

logger = logging.getLogger("apex_ml.recommendation_task")


@asynccontextmanager
async def get_worker_session():
    """Create an isolated, unpooled async database session for Celery worker tasks."""
    engine = create_async_engine(
        settings.database_url,
        poolclass=NullPool,
        future=True,
    )
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_maker() as session:
        try:
            yield session
        finally:
            await session.close()
    await engine.dispose()


class JobCancelledException(Exception):
    """Raised when a job is cooperatively cancelled during execution."""
    pass


async def _is_job_cancelled(job_id: str) -> bool:
    """Check Redis for a cancellation token."""
    try:
        r = await get_redis()
        if r is not None:
            val = await r.get(f"recommendation:cancel:{job_id}")
            return val is not None
    except Exception as exc:
        logger.debug("Redis cancellation check error: %s", exc)
    return False


async def _execute_recommendation_job_async(job_id_str: str) -> Dict[str, Any]:
    """Async execution flow for recommendation benchmark worker task."""
    try:
        job_uuid = uuid.UUID(job_id_str)
    except ValueError:
        logger.error("Invalid UUID format for job_id: %s", job_id_str)
        return {"status": "failed", "error": "Invalid job ID"}

    # ── 1. Initial State Check & Transition to PROFILING ──────────────────────
    async with get_worker_session() as db:
        stmt = select(RecommendationJob).where(RecommendationJob.id == job_uuid)
        result = await db.execute(stmt)
        job = result.scalar_one_or_none()

        if not job:
            logger.error("RecommendationJob %s not found", job_id_str)
            return {"status": "failed", "error": "Job not found"}

        if job.status == RecommendationJobStatus.CANCELLED.value:
            logger.info("RecommendationJob %s already cancelled", job_id_str)
            return {"status": "cancelled"}

        if job.status == RecommendationJobStatus.COMPLETED.value:
            logger.info("RecommendationJob %s already completed", job_id_str)
            return {"status": "completed"}

        # Mark as PROFILING before loading and validating dataset
        job.status = RecommendationJobStatus.PROFILING.value
        job.stage = "Profiling and Validating Dataset"
        job.progress = 10.0
        job.started_at = datetime.now(timezone.utc)
        await db.commit()

        dataset_id_str = str(job.dataset_id)
        org_id_str = str(job.organisation_id)
        req_cfg = dict(job.request_config) if job.request_config else {}

    # ── 2. Check cancellation during PROFILING ────────────────────────────────
    if await _is_job_cancelled(job_id_str):
        async with get_worker_session() as db:
            await db.execute(
                update(RecommendationJob)
                .where(RecommendationJob.id == job_uuid)
                .values(
                    status=RecommendationJobStatus.CANCELLED.value,
                    stage="Cancelled",
                    cancelled_at=datetime.now(timezone.utc),
                )
            )
            await db.commit()
        return {"status": "cancelled"}

    # ── 3. Load dataset via Canonical Storage Abstraction ─────────────────────
    try:
        df = load_dataset_dataframe(
            dataset_id=dataset_id_str,
            organisation_id=org_id_str,
        )
    except FileNotFoundError as exc:
        async with get_worker_session() as db:
            await db.execute(
                update(RecommendationJob)
                .where(RecommendationJob.id == job_uuid)
                .values(
                    status=RecommendationJobStatus.FAILED.value,
                    stage="Failed",
                    error_details={"error_type": "FileNotFoundError", "message": str(exc)},
                    completed_at=datetime.now(timezone.utc),
                )
            )
            await db.commit()
        return {"status": "failed", "error": str(exc)}
    except Exception as exc:
        sanitized_msg = type(exc).__name__ + ": " + str(exc).split("\n")[0][:200]
        async with get_worker_session() as db:
            await db.execute(
                update(RecommendationJob)
                .where(RecommendationJob.id == job_uuid)
                .values(
                    status=RecommendationJobStatus.FAILED.value,
                    stage="Failed",
                    error_details={"error_type": type(exc).__name__, "message": sanitized_msg},
                    completed_at=datetime.now(timezone.utc),
                )
            )
            await db.commit()
        return {"status": "failed", "error": sanitized_msg}

    # ── 4. Check cancellation before SCREENING ────────────────────────────────
    if await _is_job_cancelled(job_id_str):
        async with get_worker_session() as db:
            await db.execute(
                update(RecommendationJob)
                .where(RecommendationJob.id == job_uuid)
                .values(
                    status=RecommendationJobStatus.CANCELLED.value,
                    stage="Cancelled",
                    cancelled_at=datetime.now(timezone.utc),
                )
            )
            await db.commit()
        return {"status": "cancelled"}

    # ── 5. Build Engine Config ────────────────────────────────────────────────
    constraints_cfg = req_cfg.get("constraints", {})
    config = RecommendationConfig(
        target_column=req_cfg.get("target_column", ""),
        feature_columns=req_cfg.get("feature_columns"),
        metric=req_cfg.get("metric"),
        cv_folds=req_cfg.get("cv_folds", 5),
        random_seed=req_cfg.get("random_seed", 42),
        train_test_split=req_cfg.get("train_test_split", 0.8),
        constraints=RecommendationConstraints(
            max_training_seconds=constraints_cfg.get("max_training_seconds", 120),
            prefer_interpretable=constraints_cfg.get("prefer_interpretable", False),
        ),
    )

    # ── 6. Cooperative Stage & Progress Callbacks ─────────────────────────────
    current_status_holder = {"status": RecommendationJobStatus.PROFILING.value}

    def stage_callback(stage_name: str, progress_pct: float) -> None:
        target_status = getattr(RecommendationJobStatus, stage_name, None)
        if target_status:
            current_status_holder["status"] = target_status.value

    def progress_callback(candidate_name: str, fold: int, total_folds: int) -> None:
        pass

    # ── 7. Run Pure Benchmark Engine ──────────────────────────────────────────
    try:
        bench_result = run_recommendation_benchmark(
            dataframe=df,
            config=config,
            progress_callback=progress_callback,
            stage_callback=stage_callback,
        )
    except Exception as exc:
        sanitized_msg = type(exc).__name__ + ": " + str(exc).split("\n")[0][:200]
        async with get_worker_session() as db:
            await db.execute(
                update(RecommendationJob)
                .where(RecommendationJob.id == job_uuid)
                .values(
                    status=RecommendationJobStatus.FAILED.value,
                    stage="Failed",
                    error_details={"error_type": type(exc).__name__, "message": sanitized_msg},
                    completed_at=datetime.now(timezone.utc),
                )
            )
            await db.commit()
        return {"status": "failed", "error": sanitized_msg}

    # ── 8. Check cancellation before final DB write ───────────────────────────
    if await _is_job_cancelled(job_id_str):
        async with get_worker_session() as db:
            await db.execute(
                update(RecommendationJob)
                .where(RecommendationJob.id == job_uuid)
                .values(
                    status=RecommendationJobStatus.CANCELLED.value,
                    stage="Cancelled",
                    cancelled_at=datetime.now(timezone.utc),
                )
            )
            await db.commit()
        return {"status": "cancelled"}

    # ── 9. Persist Final Result ───────────────────────────────────────────────
    res_dict = bench_result.to_dict()
    async with get_worker_session() as db:
        # Atomic check that job was not marked CANCELLED in DB during execution
        stmt = select(RecommendationJob.status).where(RecommendationJob.id == job_uuid)
        curr_status = (await db.execute(stmt)).scalar_one_or_none()

        if curr_status == RecommendationJobStatus.CANCELLED.value:
            logger.info("Job %s was cancelled before final write, skipping result overwrite", job_id_str)
            return {"status": "cancelled"}

        if bench_result.status in ("insufficient_data", "invalid_target"):
            final_status = RecommendationJobStatus.INSUFFICIENT_DATA.value
            stage_str = "Insufficient Data"
        elif bench_result.status == "completed":
            final_status = RecommendationJobStatus.COMPLETED.value
            stage_str = "Completed"
        else:
            final_status = RecommendationJobStatus.FAILED.value
            stage_str = "Failed"

        await db.execute(
            update(RecommendationJob)
            .where(RecommendationJob.id == job_uuid)
            .values(
                status=final_status,
                stage=stage_str,
                progress=100.0,
                recommendation=res_dict.get("recommendation"),
                candidates=res_dict.get("candidates", []),
                warnings=res_dict.get("warnings", []),
                exclusions=res_dict.get("exclusions", []),
                reason_codes=res_dict.get("reason_codes", []),
                limitations=res_dict.get("limitations", []),
                reproducibility=res_dict.get("reproducibility", {}),
                completed_at=datetime.now(timezone.utc),
            )
        )
        await db.commit()

    logger.info("RecommendationJob %s finished with status %s", job_id_str, final_status)
    return {"status": final_status, "job_id": job_id_str}


@celery_app.task(
    name="execute_recommendation_benchmark_job",
    bind=True,
    max_retries=3,
    default_retry_delay=5,
)
def execute_recommendation_benchmark_job(self: Any, job_id: str) -> Dict[str, Any]:
    """Celery task executing recommendation benchmark job with bounded retries."""
    try:
        return asyncio.run(_execute_recommendation_job_async(job_id))
    except (OperationalError, ConnectionError) as exc:
        logger.warning("Transient error in recommendation job %s, retrying: %s", job_id, exc)
        raise self.retry(exc=exc)
    except Exception as exc:
        logger.error("Permanent failure in recommendation job %s: %s", job_id, exc)
        return {"status": "failed", "job_id": job_id, "error": str(exc)}
