"""Jobs router stub.

Full implementation in Batch 4 (Celery Worker) + Batch 5.
"""

from fastapi import APIRouter

from app.schemas.common import MessageResponse

router = APIRouter(prefix="/jobs", tags=["Jobs"])


@router.get("", response_model=MessageResponse, summary="List jobs (stub)")
async def list_jobs() -> MessageResponse:
    """Returns placeholder until Batch 4."""
    return MessageResponse(message="Jobs endpoint — coming in Batch 4.")


@router.post("", response_model=MessageResponse, summary="Create job (stub)")
async def create_job() -> MessageResponse:
    """Returns placeholder until Batch 4."""
    return MessageResponse(message="Job creation — coming in Batch 4.")
