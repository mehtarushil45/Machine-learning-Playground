"""Local Deployments Router — Prototype 4.

All endpoints require JWT authentication (CurrentUser).
All deployments are scoped to the authenticated owner — no user can
access or modify another user''s deployments.

Routes:
  POST   /api/v1/local-deployments                       Create deployment from completed job
  GET    /api/v1/local-deployments                       List all deployments (owner-scoped)
  GET    /api/v1/local-deployments/{id}                  Get deployment details
  POST   /api/v1/local-deployments/{id}/predict          Execute prediction
  POST   /api/v1/local-deployments/{id}/stop             Stop deployment
  POST   /api/v1/local-deployments/{id}/redeploy         Redeploy stopped/failed deployment
  GET    /api/v1/jobs/{job_id}/local-deployments         List deployments for a job
"""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, status

from app.dependencies import CurrentUser, DBSession
from app.schemas.local_deployment import (
    LocalDeploymentCreate,
    LocalDeploymentResponse,
    LocalPredictRequest,
    LocalPredictResponse,
)
import app.services.local_deployment_service as svc

router = APIRouter(prefix="/local-deployments", tags=["Local Deployments"])

# Separate router for the job-scoped list endpoint
job_router = APIRouter(prefix="/jobs", tags=["Local Deployments"])


@router.post(
    "",
    response_model=LocalDeploymentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Deploy a completed training run locally",
)
async def create_local_deployment(
    payload: LocalDeploymentCreate,
    current_user: CurrentUser,
    db: DBSession,
) -> LocalDeploymentResponse:
    """
    Create a local deployment from a COMPLETED training job.

    Validates that:
    - The job exists and is COMPLETED
    - The model artifact exists on disk (immutability guard)
    - The model can be loaded into the inference cache

    Returns READY status if all checks pass, FAILED otherwise.
    """
    return await svc.create_local_deployment(
        payload,
        owner_id=str(current_user.id),
        db=db,
    )


@router.get(
    "",
    response_model=List[LocalDeploymentResponse],
    summary="List all local deployments",
)
async def list_local_deployments(
    current_user: CurrentUser,
    db: DBSession,
) -> List[LocalDeploymentResponse]:
    """List all local deployments owned by the authenticated user, newest first."""
    return await svc.list_local_deployments(owner_id=str(current_user.id), db=db)


@router.get(
    "/{deployment_id}",
    response_model=LocalDeploymentResponse,
    summary="Get local deployment details",
)
async def get_local_deployment(
    deployment_id: str,
    current_user: CurrentUser,
    db: DBSession,
) -> LocalDeploymentResponse:
    """Retrieve full deployment record including logs, schema, and status."""
    return await svc.get_local_deployment(
        deployment_id,
        owner_id=str(current_user.id),
        db=db,
    )


@router.post(
    "/{deployment_id}/predict",
    response_model=LocalPredictResponse,
    summary="Run prediction against a local deployment",
)
async def predict_local(
    deployment_id: str,
    payload: LocalPredictRequest,
    current_user: CurrentUser,
    db: DBSession,
) -> LocalPredictResponse:
    """
    Execute inference against a READY local deployment.

    - All feature_columns registered at deployment time must be present in inputs.
    - Returns prediction, confidence, and probabilities (for classification).
    - Increments total_predictions counter.
    - Appends to deployment logs.
    """
    return await svc.predict_local(
        deployment_id,
        payload,
        owner_id=str(current_user.id),
        db=db,
    )


@router.post(
    "/{deployment_id}/stop",
    response_model=LocalDeploymentResponse,
    summary="Stop a local deployment",
)
async def stop_local_deployment(
    deployment_id: str,
    current_user: CurrentUser,
    db: DBSession,
) -> LocalDeploymentResponse:
    """
    Stop a READY deployment.

    The model artifact is NOT deleted. The deployment can be redeployed later.
    """
    return await svc.stop_local_deployment(
        deployment_id,
        owner_id=str(current_user.id),
        db=db,
    )


@router.post(
    "/{deployment_id}/redeploy",
    response_model=LocalDeploymentResponse,
    summary="Redeploy a stopped or failed deployment",
)
async def redeploy_local_deployment(
    deployment_id: str,
    current_user: CurrentUser,
    db: DBSession,
) -> LocalDeploymentResponse:
    """
    Redeploy a STOPPED or FAILED deployment back to READY.

    Uses the same immutable model_id snapshot from the original deployment.
    The original training run artifact is reloaded — no new training run needed.
    """
    return await svc.redeploy_local_deployment(
        deployment_id,
        owner_id=str(current_user.id),
        db=db,
    )


@job_router.get(
    "/{job_id}/local-deployments",
    response_model=List[LocalDeploymentResponse],
    summary="List local deployments for a specific training job",
    tags=["Local Deployments"],
)
async def list_deployments_for_job(
    job_id: str,
    current_user: CurrentUser,
    db: DBSession,
) -> List[LocalDeploymentResponse]:
    """List all local deployments that were created from a specific training job."""
    return await svc.list_deployments_for_job(
        job_id,
        owner_id=str(current_user.id),
        db=db,
    )
