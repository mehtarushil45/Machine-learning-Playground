"""Jobs router for ML Job Management and Training Pipeline Orchestration.

Authentication & Database Sessions
-----------------------------------
Every endpoint requires a valid Bearer token via ``CurrentUser`` and receives
a database session via ``DBSession``.
The authenticated user's ID is threaded through to the service layer so that:

  - ``create_job``  persists the job in PostgreSQL and stamps ``owner_id``.
  - ``list_jobs``   returns only jobs owned by the calling user from PostgreSQL.
  - ``get_job``     enforces read ownership (403 if caller is not the owner).
  - ``cancel_job``  enforces write ownership (403 if caller is not the owner).
  - ``retry_job``   inherits owner_id from the original job (ownership enforced).
  - ``delete_job``  enforces ownership before soft-deleting.
"""

import asyncio
import json
from fastapi import APIRouter, Query, Request, status
from fastapi.responses import StreamingResponse

from app.dependencies import CurrentUser, DBSession
from app.rate_limiter import limiter
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
@router.post(
    "",
    response_model=JobResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create and queue a new ML training job (alias)",
)
@limiter.limit("10/minute")
async def create_training_job(
    request: Request,
    payload: TrainingRequest,
    current_user: CurrentUser,
    db: DBSession,
) -> JobResponse:
    """Validate training configuration and queue a new Machine Learning job.

    The calling user's ID is stamped as owner_id on the created job in PostgreSQL.
    Only the owner can later cancel, retry, or delete the job.
    """
    org_id_str = str(current_user.organisation_id) if getattr(current_user, "organisation_id", None) else None
    return await job_service.create_job(
        payload,
        user_id=str(current_user.id),
        organisation_id=org_id_str,
        db=db,
    )


@router.get(
    "",
    response_model=JobListResponse,
    summary="List ML training jobs",
)
@limiter.limit("60/minute")
async def list_jobs(
    request: Request,
    current_user: CurrentUser,
    db: DBSession,
    skip: int = Query(0, ge=0, description="Pagination offset"),
    limit: int = Query(50, ge=1, le=100, description="Page limit size"),
) -> JobListResponse:
    """List training jobs owned by the authenticated user from PostgreSQL (newest first).

    Results are scoped to current_user.id. Users cannot see jobs of other users.
    """
    return await job_service.list_jobs(
        user_id=str(current_user.id),
        skip=skip,
        limit=limit,
        db=db,
    )


@router.get(
    "/{job_id}",
    response_model=JobResponse,
    summary="Get job details by ID",
)
@limiter.limit("60/minute")
async def get_job(
    request: Request,
    job_id: str,
    current_user: CurrentUser,
    db: DBSession,
) -> JobResponse:
    """Retrieve complete metadata and status details for a specific Job ID from PostgreSQL.

    Returns 403 if the job exists but belongs to a different user.
    """
    return await job_service.get_job(job_id, user_id=str(current_user.id), db=db)


@router.get(
    "/{job_id}/progress",
    response_model=JobProgressResponse,
    summary="Get live job progress telemetry",
)
@limiter.limit("60/minute")
async def get_job_progress(
    request: Request,
    job_id: str,
    current_user: CurrentUser,
    db: DBSession,
) -> JobProgressResponse:
    """Return live execution stage and percentage progress for a running Job ID.

    Ownership is enforced -- only the job owner can poll progress.
    """
    return await job_service.get_job_progress(job_id, user_id=str(current_user.id), db=db)


TERMINAL_STATUSES = {"COMPLETED", "FAILED", "CANCELLED"}


async def _generate_job_progress_sse(job_id: str, user_id: str):
    """Generator yielding formatted Server-Sent Events (SSE) for job progress stream."""
    try:
        while True:
            prog = await job_service.get_job_progress(job_id, user_id=user_id)
            payload = json.dumps(
                {
                    "job_id": prog.job_id,
                    "status": prog.status,
                    "progress": prog.progress,
                    "current_stage": prog.current_stage,
                    "message": prog.message,
                    "estimated_seconds_remaining": prog.estimated_seconds_remaining,
                }
            )

            if prog.status in TERMINAL_STATUSES:
                yield f"event: progress\ndata: {payload}\n\n"
                yield f"event: complete\ndata: {payload}\n\n"
                return

            yield f"event: progress\ndata: {payload}\n\n"
            await asyncio.sleep(0.1)
    except (asyncio.CancelledError, GeneratorExit):
        raise
    except Exception as exc:
        err_payload = json.dumps({"job_id": job_id, "error": str(exc)})
        yield f"event: error\ndata: {err_payload}\n\n"


@router.get(
    "/{job_id}/stream",
    summary="Stream live job progress via Server-Sent Events (SSE)",
)
@limiter.limit("60/minute")
async def stream_job_progress(
    request: Request,
    job_id: str,
    current_user: CurrentUser,
) -> StreamingResponse:
    """Stream live job execution progress telemetry using Server-Sent Events (SSE).

    - Emits `event: progress` data frames every second.
    - Emits `event: complete` and cleanly closes the connection upon reaching a terminal state.
    """
    # Ownership check before initiating SSE stream
    await job_service.get_job(job_id, user_id=str(current_user.id))

    return StreamingResponse(
        _generate_job_progress_sse(job_id, user_id=str(current_user.id)),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post(
    "/{job_id}/cancel",
    response_model=JobCancelResponse,
    summary="Cancel an active training job",
)
async def cancel_job(
    job_id: str,
    current_user: CurrentUser,
    db: DBSession,
) -> JobCancelResponse:
    """Cancel an active or queued Machine Learning training job.

    Only the owning user may cancel a job. Returns 403 for non-owners.
    """
    return await job_service.cancel_job(job_id, user_id=str(current_user.id), db=db)


@router.post(
    "/{job_id}/retry",
    response_model=JobRetryResponse,
    summary="Retry a training job",
)
async def retry_job(
    job_id: str,
    current_user: CurrentUser,
    db: DBSession,
) -> JobRetryResponse:
    """Re-queue a new job run using the original job's training configuration.

    The retry inherits the original job's ``owner_id``. Returns 403 if
    the caller does not own the original job.
    """
    return await job_service.retry_job(job_id, user_id=str(current_user.id), db=db)


@router.delete(
    "/{job_id}",
    summary="Soft delete a job entity",
)
async def delete_job(
    job_id: str,
    current_user: CurrentUser,
    db: DBSession,
) -> dict[str, str]:
    """Soft delete a job from active view while preserving database history.

    Only the owning user may delete a job. Returns 403 for non-owners.
    """
    return await job_service.delete_job(job_id, user_id=str(current_user.id), db=db)
