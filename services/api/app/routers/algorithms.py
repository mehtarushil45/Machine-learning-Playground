"""Algorithms router.

Provides endpoints for querying the central algorithm catalog, capability flags,
resource constraints, and runtime dependency availability.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.dependencies import CurrentUser
from app.ml.algorithm_factory import get_supported_algorithms_catalog
from app.schemas.algorithm import SupportedAlgorithmsResponse

router = APIRouter(prefix="/algorithms", tags=["Algorithms"])


@router.get(
    "/supported",
    response_model=SupportedAlgorithmsResponse,
    summary="Get central catalog of supported algorithms with capabilities and availability",
)
async def get_supported_algorithms(
    current_user: CurrentUser,
) -> SupportedAlgorithmsResponse:
    """Return backend-driven algorithm registry with task compatibility, resource constraints, and availability.

    - **Authentication**: Requires valid JWT token.
    - **Dynamic Availability**: Checks whether optional packages (e.g. `xgboost`, `lightgbm`) are importable.
    """
    catalog = get_supported_algorithms_catalog()
    return SupportedAlgorithmsResponse(total=len(catalog), algorithms=catalog)
