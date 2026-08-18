"""Celery ML Training Task.

Executes asynchronous Machine Learning training jobs in Celery worker processes
and persists job lifecycle state, progress, metrics, and artifact references to PostgreSQL.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import logging
from typing import Any, Dict
import uuid

from sqlalchemy import select, update

from services.worker.celery_app import celery_app
from services.api.app.ml.engine import execute_ml_training_pipeline_sync
from services.worker.tasks.recommendation_task import get_worker_session
from app.models.job import Job, JobStatusEnum

logger = logging.getLogger("apex_ml.training_task")


async def _update_job_status_in_db(
    job_id_str: str,
    status_val: str,
    progress: float,
    stage: str,
    message: str | None = None,
    metrics: dict | None = None,
    model_path: str | None = None,
    error_msg: str | None = None,
) -> None:
    """Persist job state transition to PostgreSQL database."""
    try:
        job_uuid = uuid.UUID(job_id_str)
        now = datetime.now(timezone.utc)
        async with get_worker_session() as db:
            stmt = select(Job).where(Job.id == job_uuid)
            res = await db.execute(stmt)
            job = res.scalar_one_or_none()
            if job:
                job.status = status_val
                job.progress = progress
                job.current_stage = stage
                job.message = message
                job.updated_at = now
                if error_msg:
                    job.error_message = error_msg
                if model_path:
                    job.result_path = model_path
                if status_val == JobStatusEnum.COMPLETED.value:
                    job.completed_at = now
                if metrics or model_path:
                    meta = dict(job.job_metadata or {})
                    if metrics:
                        meta["metrics"] = metrics
                    if model_path:
                        meta["model_artifact_path"] = model_path
                    job.job_metadata = meta
                await db.commit()
    except Exception as exc:
        logger.warning("Failed to persist job %s state to DB: %s", job_id_str, exc)


@celery_app.task(name="execute_ml_training_job", bind=True, max_retries=2)
def execute_ml_training_job(self: Any, job_id: str, config: Dict[str, Any]) -> Dict[str, Any]:
    """Celery task executing scikit-learn model training pipeline."""
    try:
        asyncio.run(
            _update_job_status_in_db(
                job_id,
                JobStatusEnum.RUNNING.value,
                10.0,
                "Training",
                "Training model...",
            )
        )
        result = execute_ml_training_pipeline_sync(job_id, config)
        metrics = result.get("metrics")
        model_path = result.get("model_path")
        asyncio.run(
            _update_job_status_in_db(
                job_id,
                JobStatusEnum.COMPLETED.value,
                100.0,
                "Completed",
                f"Training complete. Model: {result.get('filename')}",
                metrics=metrics,
                model_path=model_path,
            )
        )
        return result
    except Exception as exc:
        asyncio.run(
            _update_job_status_in_db(
                job_id,
                JobStatusEnum.FAILED.value,
                0.0,
                "Failed",
                error_msg=str(exc),
            )
        )
        raise self.retry(exc=exc, countdown=5)
