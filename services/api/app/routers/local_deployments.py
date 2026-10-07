"""Local Deployments Router — Enterprise Model Deployment & Lifecycle Management.

All endpoints require JWT authentication (CurrentUser).
All deployments are scoped to the authenticated owner — no user can
access or modify another user's deployments.

Routes:
  POST   /api/v1/local-deployments                       Create deployment from completed job
  GET    /api/v1/local-deployments                       List all deployments (owner-scoped)
  GET    /api/v1/local-deployments/{id}                  Get deployment details
  POST   /api/v1/local-deployments/{id}/start            Start stopped/failed deployment
  POST   /api/v1/local-deployments/{id}/stop             Stop running deployment
  POST   /api/v1/local-deployments/{id}/restart          Restart deployment
  POST   /api/v1/local-deployments/{id}/redeploy         Redeploy (current or new model version)
  DELETE /api/v1/local-deployments/{id}                  Delete deployment & history
  POST   /api/v1/local-deployments/{id}/predict          Execute prediction with strict validation
  GET    /api/v1/local-deployments/{id}/predictions      Get persisted prediction history
  GET    /api/v1/local-deployments/{id}/versions         Get available model versions for redeployment
  GET    /api/v1/jobs/{job_id}/local-deployments         List deployments for a job
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import Response

from app.dependencies import CurrentUser, DBSession
from app.schemas.local_deployment import (
    LocalBatchPredictRequest,
    LocalBatchPredictResponse,
    LocalDeploymentCreate,
    LocalDeploymentRedeploy,
    LocalDeploymentResponse,
    LocalPredictRequest,
    LocalPredictResponse,
    ModelVersionOption,
    PredictionHistoryItem,
)
import app.services.local_deployment_service as svc

router = APIRouter(prefix="/local-deployments", tags=["Local Deployments"])
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
    """Create a local deployment from a COMPLETED training job."""
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
    "/{deployment_id}/start",
    response_model=LocalDeploymentResponse,
    summary="Start a stopped or failed deployment",
)
async def start_local_deployment(
    deployment_id: str,
    current_user: CurrentUser,
    db: DBSession,
) -> LocalDeploymentResponse:
    """Start an endpoint and transition to RUNNING."""
    return await svc.start_local_deployment(
        deployment_id,
        owner_id=str(current_user.id),
        db=db,
    )


@router.post(
    "/{deployment_id}/stop",
    response_model=LocalDeploymentResponse,
    summary="Stop a running deployment",
)
async def stop_local_deployment(
    deployment_id: str,
    current_user: CurrentUser,
    db: DBSession,
) -> LocalDeploymentResponse:
    """Stop a RUNNING deployment. Model artifact is preserved."""
    return await svc.stop_local_deployment(
        deployment_id,
        owner_id=str(current_user.id),
        db=db,
    )


@router.post(
    "/{deployment_id}/restart",
    response_model=LocalDeploymentResponse,
    summary="Restart a deployment",
)
async def restart_local_deployment(
    deployment_id: str,
    current_user: CurrentUser,
    db: DBSession,
) -> LocalDeploymentResponse:
    """Restart a deployment: reloads model into cache and transitions to RUNNING."""
    return await svc.restart_local_deployment(
        deployment_id,
        owner_id=str(current_user.id),
        db=db,
    )


@router.post(
    "/{deployment_id}/redeploy",
    response_model=LocalDeploymentResponse,
    summary="Redeploy a deployment",
)
async def redeploy_local_deployment(
    deployment_id: str,
    current_user: CurrentUser,
    db: DBSession,
    payload: Optional[LocalDeploymentRedeploy] = None,
) -> LocalDeploymentResponse:
    """Redeploy current deployment, optionally updating to a new model artifact version."""
    return await svc.redeploy_local_deployment(
        deployment_id,
        payload=payload,
        owner_id=str(current_user.id),
        db=db,
    )


@router.delete(
    "/{deployment_id}",
    summary="Delete a deployment and its history",
)
async def delete_local_deployment(
    deployment_id: str,
    current_user: CurrentUser,
    db: DBSession,
) -> Dict[str, Any]:
    """Delete a deployment and cascade-delete its persisted prediction records."""
    return await svc.delete_local_deployment(
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
    """Execute inference against a RUNNING local deployment with validation and audit history."""
    return await svc.predict_local(
        deployment_id,
        payload,
        owner_id=str(current_user.id),
        db=db,
    )


@router.post(
    "/{deployment_id}/predict-batch",
    response_model=LocalBatchPredictResponse,
    summary="Run batch CSV scoring against a local deployment",
)
async def predict_batch_local(
    deployment_id: str,
    current_user: CurrentUser,
    db: DBSession,
    file: UploadFile = File(..., description="CSV file containing feature records"),
    batch_size: int = Form(1000, description="Processing batch size"),
    return_probabilities: bool = Form(True, description="Compute class probabilities"),
) -> LocalBatchPredictResponse:
    """Execute high-throughput batch scoring from an uploaded CSV file."""
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Batch upload must be a valid .csv file.",
        )
    content = await file.read()
    return await svc.predict_batch_local(
        deployment_id,
        data=content,
        owner_id=str(current_user.id),
        db=db,
        batch_size=batch_size,
        return_probabilities=return_probabilities,
    )


@router.post(
    "/{deployment_id}/predict-batch-json",
    response_model=LocalBatchPredictResponse,
    summary="Run batch JSON scoring against a local deployment",
)
async def predict_batch_json_local(
    deployment_id: str,
    payload: LocalBatchPredictRequest,
    current_user: CurrentUser,
    db: DBSession,
) -> LocalBatchPredictResponse:
    """Execute batch inference for a list of JSON feature records."""
    return await svc.predict_batch_local(
        deployment_id,
        data=payload.data,
        owner_id=str(current_user.id),
        db=db,
        batch_size=payload.batch_size or 1000,
        return_probabilities=payload.return_probabilities if payload.return_probabilities is not None else True,
    )


@router.get(
    "/{deployment_id}/template-csv",
    summary="Download template CSV for batch scoring",
)
async def get_template_csv(
    deployment_id: str,
    current_user: CurrentUser,
    db: DBSession,
) -> Response:
    """Download a pre-formatted template CSV populated with the required feature headers and sample rows."""
    csv_text = await svc.generate_template_csv(
        deployment_id,
        owner_id=str(current_user.id),
        db=db,
    )
    return Response(
        content=csv_text,
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="template_{deployment_id[:8]}.csv"',
        },
    )



@router.get(
    "/{deployment_id}/predictions",
    response_model=List[PredictionHistoryItem],
    summary="List persisted prediction history for deployment",
)
async def list_prediction_history(
    deployment_id: str,
    current_user: CurrentUser,
    db: DBSession,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> List[PredictionHistoryItem]:
    """Fetch paginated inference audit history."""
    return await svc.list_prediction_history(
        deployment_id,
        limit=limit,
        offset=offset,
        owner_id=str(current_user.id),
        db=db,
    )


@router.get(
    "/{deployment_id}/versions",
    response_model=List[ModelVersionOption],
    summary="List available model versions for redeployment",
)
async def list_available_versions(
    deployment_id: str,
    current_user: CurrentUser,
    db: DBSession,
) -> List[ModelVersionOption]:
    """List all registered versions of this model in the registry."""
    return await svc.list_available_versions(
        deployment_id,
        owner_id=str(current_user.id),
        db=db,
    )


@router.get(
    "/{deployment_id}/drift",
    summary="Get real-time data drift analysis & serving telemetry",
)
async def get_deployment_drift(
    deployment_id: str,
    current_user: CurrentUser,
    db: DBSession,
    min_samples: int = Query(5, ge=1, le=100),
) -> Dict[str, Any]:
    """Retrieve statistical data drift report (PSI, KS test) and serving latency telemetry."""
    return await svc.get_deployment_drift_report(
        deployment_id,
        owner_id=str(current_user.id),
        db=db,
        min_samples=min_samples,
    )


@router.post(
    "/{deployment_id}/drift/simulate",
    summary="Run simulated data drift analysis for testing",
)
async def simulate_deployment_drift(
    deployment_id: str,
    current_user: CurrentUser,
    db: DBSession,
    shift_factor: float = Query(2.5, ge=0.5, le=5.0),
) -> Dict[str, Any]:
    """Simulate production inferences with distribution shifts to test drift guardrails."""
    return await svc.simulate_deployment_drift(
        deployment_id,
        owner_id=str(current_user.id),
        db=db,
        shift_factor=shift_factor,
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
    """List all local deployments created from a specific training job."""
    return await svc.list_deployments_for_job(
        job_id,
        owner_id=str(current_user.id),
        db=db,
    )
