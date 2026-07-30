"""Jobs router for ML Job Management and Training Pipeline Orchestration."""

from fastapi import APIRouter, Query, status

from app.schemas.job import (
    JobCancelResponse,
    JobListResponse,
    JobProgressResponse,
    JobResponse,
    JobRetryResponse,
    TrainingRequest,
)
from app.services.job_service import job_service

router = APIRouter(prefix="/jobs", tags=["Jobs"])


@router.post(
    "/train",
    response_model=JobResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create and queue a new ML training job",
)
async def create_training_job(request: TrainingRequest) -> JobResponse:
    """Validate training configuration and queue a new Machine Learning job."""
    return job_service.create_job(request)


@router.get(
    "",
    response_model=JobListResponse,
    summary="List ML training jobs",
)
async def list_jobs(
    skip: int = Query(0, ge=0, description="Pagination offset"),
    limit: int = Query(50, ge=1, le=100, description="Page limit size"),
) -> JobListResponse:
    """List all active machine learning training jobs (newest first)."""
    return job_service.list_jobs(skip=skip, limit=limit)


@router.get(
    "/{job_id}",
    response_model=JobResponse,
    summary="Get job details by ID",
)
async def get_job(job_id: str) -> JobResponse:
    """Retrieve complete metadata and status details for a specific Job ID."""
    return job_service.get_job(job_id)


@router.get(
    "/{job_id}/progress",
    response_model=JobProgressResponse,
    summary="Get live job progress telemetry",
)
async def get_job_progress(job_id: str) -> JobProgressResponse:
    """Return live execution stage and percentage progress for a running Job ID."""
    return job_service.get_job_progress(job_id)


@router.post(
    "/{job_id}/cancel",
    response_model=JobCancelResponse,
    summary="Cancel an active training job",
)
async def cancel_job(job_id: str) -> JobCancelResponse:
    """Cancel an active or queued Machine Learning training job."""
    return job_service.cancel_job(job_id)


@router.post(
    "/{job_id}/retry",
    response_model=JobRetryResponse,
    summary="Retry a training job",
)
async def retry_job(job_id: str) -> JobRetryResponse:
    """Re-queue a new job run using the original job's training configuration."""
    return job_service.retry_job(job_id)


@router.delete(
    "/{job_id}",
    summary="Soft delete a job entity",
)
async def delete_job(job_id: str) -> dict[str, str]:
    """Soft delete a job from active view while preserving database history."""
    return job_service.delete_job(job_id)
