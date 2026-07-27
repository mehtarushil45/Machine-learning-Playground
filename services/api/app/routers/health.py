"""Health-check router.

GET /health — always returns 200 while the process is alive.
"""

from fastapi import APIRouter

from app.schemas.common import HealthResponse

router = APIRouter(tags=["Health"])


@router.get("/health", response_model=HealthResponse, summary="Liveness probe")
async def health() -> HealthResponse:
    """Returns ``{"status": "ok"}`` as long as the API process is running.

    Used by Docker HEALTHCHECK and orchestrators (k8s liveness probe).
    Does **not** check database or Redis — use ``/health/ready`` for that
    (to be added in a later batch when all services are wired up).
    """
    return HealthResponse(status="ok")
