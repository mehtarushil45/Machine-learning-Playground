"""Deployment Studio & Embeddable Web Widget REST API Router — Phase 5.

Endpoints for:
  - Creating a 1-click model deployment: POST /api/v1/deployments
  - Listing active deployments: GET /api/v1/deployments
  - Retrieving deployment details: GET /api/v1/deployments/{id}
  - Public/API prediction inference: POST /api/v1/deployments/{id}/predict
  - Generating SDK & Web Widget snippets: GET /api/v1/deployments/{id}/snippets
  - Updating status (ACTIVE/PAUSED/REVOKED): PATCH /api/v1/deployments/{id}/status
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Header, HTTPException, Request, status

from app.ml.deployment_manager import (
    create_deployment,
    generate_integration_snippets,
    get_deployment,
    list_deployments,
    predict_deployed_model,
    update_deployment_status,
)
from app.schemas.deployment import (
    DeploymentCreate,
    DeploymentPredictRequest,
    DeploymentPredictResponse,
    DeploymentResponse,
    IntegrationSnippets,
)

router = APIRouter(prefix="/deployments", tags=["Deployment Studio & Web Widgets"])


@router.post(
    "",
    response_model=DeploymentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create 1-click model deployment endpoint",
)
async def create_deployment_endpoint(
    payload: DeploymentCreate,
    request: Request,
) -> DeploymentResponse:
    """Deploy a model version from registry with API key auth and rate limits."""
    try:
        base_url = str(request.base_url)
        return create_deployment(payload, base_url=base_url)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Deployment creation failed: {str(exc)}",
        )


@router.get(
    "",
    response_model=List[DeploymentResponse],
    summary="List registered model deployments",
)
async def list_deployments_endpoint() -> List[DeploymentResponse]:
    """Retrieve list of all active, paused, or revoked model deployments."""
    return list_deployments()


@router.get(
    "/{deployment_id}",
    response_model=DeploymentResponse,
    summary="Get deployment configuration details",
)
async def get_deployment_endpoint(deployment_id: str) -> DeploymentResponse:
    """Retrieve deployment configuration, request counters, and status."""
    dep = get_deployment(deployment_id)
    if not dep:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Deployment '{deployment_id}' not found.",
        )
    return dep


@router.post(
    "/{deployment_id}/predict",
    response_model=DeploymentPredictResponse,
    summary="Public/API widget prediction endpoint",
)
async def predict_deployment_endpoint(
    deployment_id: str,
    payload: DeploymentPredictRequest,
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
) -> DeploymentPredictResponse:
    """Execute inference against a deployed model endpoint."""
    try:
        return predict_deployed_model(
            deployment_id=deployment_id,
            features=payload.features,
            provided_api_key=x_api_key,
        )
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Prediction failed: {str(exc)}")


@router.get(
    "/{deployment_id}/snippets",
    response_model=IntegrationSnippets,
    summary="Generate SDK & HTML embeddable web widget snippets",
)
async def get_deployment_snippets_endpoint(
    deployment_id: str,
    request: Request,
) -> IntegrationSnippets:
    """Retrieve cURL, Python, JavaScript, and HTML embeddable widget code snippets."""
    try:
        base_url = str(request.base_url)
        return generate_integration_snippets(deployment_id=deployment_id, base_url=base_url)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.patch(
    "/{deployment_id}/status",
    response_model=DeploymentResponse,
    summary="Update deployment status (ACTIVE / PAUSED / REVOKED)",
)
async def update_deployment_status_endpoint(
    deployment_id: str,
    new_status: str,
) -> DeploymentResponse:
    """Pause, reactivate, or revoke a deployment endpoint."""
    try:
        return update_deployment_status(deployment_id=deployment_id, new_status=new_status)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
