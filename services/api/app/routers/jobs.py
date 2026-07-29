"""Jobs router for asynchronous model training job management."""

from fastapi import APIRouter

from app.schemas.common import MessageResponse

router = APIRouter(prefix="/jobs", tags=["Jobs"])


@router.get("", response_model=MessageResponse, summary="List ML training jobs")
async def list_jobs() -> MessageResponse:
    """List asynchronous machine learning training jobs."""
    return MessageResponse(message="Jobs endpoint active.")


@router.post("", response_model=MessageResponse, summary="Create ML training job")
async def create_job() -> MessageResponse:
    """Create asynchronous machine learning training job."""
    return MessageResponse(message="Job creation endpoint active.")
