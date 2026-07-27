"""Datasets router stub.

Full implementation in Batch 5 (Object Storage Integration).
"""

from fastapi import APIRouter

from app.schemas.common import MessageResponse

router = APIRouter(prefix="/datasets", tags=["Datasets"])


@router.get("", response_model=MessageResponse, summary="List datasets (stub)")
async def list_datasets() -> MessageResponse:
    """Returns placeholder until Batch 5."""
    return MessageResponse(message="Datasets endpoint — coming in Batch 5.")


@router.post("", response_model=MessageResponse, summary="Upload dataset (stub)")
async def upload_dataset() -> MessageResponse:
    """Returns placeholder until Batch 5."""
    return MessageResponse(message="Dataset upload — coming in Batch 5.")
