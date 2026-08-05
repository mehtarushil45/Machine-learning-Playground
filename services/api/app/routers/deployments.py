"""Deployment Studio & Embeddable Web Widget REST API Router — Phase 5.

Endpoints for:
  - Creating a 1-click model deployment: POST /api/v1/deployments
  - Listing active deployments: GET /api/v1/deployments
  - Retrieving deployment details: GET /api/v1/deployments/{id}
  - Public/API prediction inference: POST /api/v1/deployments/{id}/predict
  - Generating SDK & Web Widget snippets: GET /api/v1/deployments/{id}/snippet
  - Updating status (ACTIVE/PAUSED/REVOKED): PATCH /api/v1/deployments/{id}/status
"""

from __future__ import annotations
import logging
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


# ===========================================================================
# V6A: Enterprise Deployment REST API
#
# Migration strategy:
#   - The /v6a prefix is TEMPORARY — used to enable parallel verification
#     of Phase 5 and V6A during the transition period.
#   - After V6A verification is complete, V6A becomes the CANONICAL
#     deployment system and Phase 5 routes above are soft-deprecated.
#   - V6A routes will be promoted to /api/v1/deployments in a future
#     clean-up sprint. The /v6a prefix is NOT a permanent design decision.
#
# Deployment Policy (enforcement):
#   ALLOW              readiness_score >= 80   → proceed
#   ALLOW_WITH_WARNING readiness_score 60–79   → proceed with warning
#   BLOCK              readiness_score <  60   → refused unless admin_override=True
#
# Governance state gate (hard requirement):
#   Only CANDIDATE, STAGING, or PRODUCTION models may be deployed.
# ===========================================================================

from typing import Any, Dict, List, Optional  # already imported above but re-stated for clarity

from pydantic import BaseModel, Field

from app.ml.deployment_manager import (
    create_v6a_deployment,
    validate_v6a_deployment,
    deploy_v6a,
    scale_v6a,
    update_v6a_deployment,
    rollback_v6a,
    archive_v6a,
    get_v6a_deployment_record,
    list_v6a_deployment_records,
    list_active_v6a_deployments,
    get_v6a_state_history,
    get_v6a_endpoint,
)
from app.ml.deployment_state_machine import (
    get_valid_transitions,
)
from app.ml.deployment_strategies import (
    get_strategy_schema,
    STRATEGY_NAMES,
)
from app.ml.endpoint_manager import (
    register_endpoint,
    update_endpoint_status as update_ep_status,
    get_endpoint,
    list_endpoints,
    deprecate_endpoint,
)

_v6a_router_logger = logging.getLogger("apex_ml.router.deployments.v6a")

# ---------------------------------------------------------------------------
# V6A Request models
# ---------------------------------------------------------------------------


class V6ACreateDeploymentRequest(BaseModel):
    model_id: str = Field(..., description="Model ID from V5A/V5B registry")
    deployment_name: str = Field(..., description="Human-readable deployment name")
    deployment_strategy: str = Field(
        ..., description="BLUE_GREEN | CANARY | ROLLING"
    )
    created_by: str = Field("system", description="Actor creating the deployment")
    admin_override: bool = Field(
        False,
        description=(
            "Governance administrator override. "
            "When True, a BLOCK policy is elevated to ALLOW_WITH_WARNING. "
            "Has no effect if policy is ALLOW or ALLOW_WITH_WARNING."
        ),
    )
    endpoint_name: Optional[str] = Field(None, description="Endpoint display name")
    endpoint_route: Optional[str] = Field(None, description="Custom route path")
    endpoint_protocol: str = Field("HTTP", description="HTTP | HTTPS | GRPC")
    endpoint_auth: str = Field("API_KEY", description="NONE | API_KEY | JWT | MTLS")
    deployment_version: str = Field("v1.0.0", description="Semantic version for this deployment")
    strategy_kwargs: Optional[Dict[str, Any]] = Field(
        None, description="Strategy-specific configuration overrides"
    )
    tags: Optional[List[str]] = Field(None, description="Endpoint tags")


class V6AValidateRequest(BaseModel):
    performed_by: str = Field("system", description="Actor triggering validation")


class V6ADeployRequest(BaseModel):
    performed_by: str = Field("system", description="Actor activating deployment")


class V6AScaleRequest(BaseModel):
    performed_by: str = Field("system", description="Actor triggering scale")
    scaling_config: Optional[Dict[str, Any]] = Field(
        None,
        description=(
            "Strategy-specific scaling params. "
            "CANARY: {advance_stage: true}. "
            "ROLLING: {batch_updated: N}."
        ),
    )
    reason: Optional[str] = Field(None, description="Reason for scaling")


class V6AUpdateRequest(BaseModel):
    new_model_id: str = Field(..., description="New model ID for champion swap")
    performed_by: str = Field("system", description="Actor performing update")
    reason: Optional[str] = Field(None, description="Reason for update")


class V6ARollbackRequest(BaseModel):
    target_model_id: Optional[str] = Field(
        None,
        description=(
            "Model ID to roll back to. "
            "If not provided, resolved from strategy config "
            "(rollback_slot for BLUE_GREEN, base for CANARY, old for ROLLING)."
        ),
    )
    performed_by: str = Field("system", description="Actor performing rollback")
    reason: Optional[str] = Field(None, description="Reason for rollback")


class V6AArchiveRequest(BaseModel):
    performed_by: str = Field("system", description="Actor archiving deployment")
    reason: Optional[str] = Field(None, description="Reason for archiving")


class V6ARegisterEndpointRequest(BaseModel):
    deployment_id: str = Field(..., description="V6A deployment ID this endpoint belongs to")
    model_id: str = Field(..., description="Model ID being served")
    endpoint_name: str = Field(..., description="Endpoint display name")
    endpoint_version: str = Field("v1.0.0", description="Endpoint version")
    model_family: Optional[str] = Field(None, description="Model family key")
    route: str = Field(..., description="Route path (e.g. /api/v1/predict/fraud)")
    protocol: str = Field("HTTP", description="HTTP | HTTPS | GRPC")
    authentication: str = Field("API_KEY", description="NONE | API_KEY | JWT | MTLS")
    status: str = Field("PENDING", description="Initial status")
    created_by: str = Field("system", description="Actor registering endpoint")
    tags: Optional[List[str]] = Field(None, description="Tags")
    description: Optional[str] = Field("", description="Human-readable description")


class V6AUpdateEndpointStatusRequest(BaseModel):
    status: str = Field(
        ..., description="New status: PENDING | ACTIVE | INACTIVE | DEPRECATED"
    )


# ---------------------------------------------------------------------------
# V6A: Deployment lifecycle endpoints
# ---------------------------------------------------------------------------

@router.post(
    "/v6a",
    status_code=status.HTTP_201_CREATED,
    summary="[V6A] Create enterprise deployment",
)
async def v6a_create_deployment(
    body: V6ACreateDeploymentRequest,
) -> Dict[str, Any]:
    """Create a V6A enterprise deployment.

    Applies Deployment Policy enforcement:
    - **ALLOW** (score ≥ 80): Deployment created immediately.
    - **ALLOW_WITH_WARNING** (score 60–79): Created with a policy warning.
    - **BLOCK** (score < 60): Refused. Governance administrator must set
      ``admin_override=True`` to proceed (elevates to ALLOW_WITH_WARNING).

    Governance state gate:
    - Only **CANDIDATE**, **STAGING**, or **PRODUCTION** models may be deployed.

    Returns the full V6A deployment record (state = CREATED).
    """
    try:
        record = create_v6a_deployment(
            model_id=body.model_id,
            deployment_name=body.deployment_name,
            deployment_strategy=body.deployment_strategy,
            created_by=body.created_by,
            admin_override=body.admin_override,
            endpoint_name=body.endpoint_name,
            endpoint_route=body.endpoint_route,
            endpoint_protocol=body.endpoint_protocol,
            endpoint_auth=body.endpoint_auth,
            deployment_version=body.deployment_version,
            strategy_kwargs=body.strategy_kwargs,
            tags=body.tags,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        )
    return record


@router.get(
    "/v6a/active",
    summary="[V6A] List ACTIVE deployment IDs",
)
async def v6a_list_active() -> Dict[str, Any]:
    """Return the list of currently ACTIVE V6A deployment IDs (O(1) lookup)."""
    ids = list_active_v6a_deployments()
    return {"active_count": len(ids), "active_deployment_ids": ids}


@router.get(
    "/v6a/strategies",
    summary="[V6A] List deployment strategies and configuration schemas",
)
async def v6a_list_strategies() -> Dict[str, Any]:
    """Return the available deployment strategies and their configuration schemas."""
    schemas = {}
    for name in sorted(STRATEGY_NAMES):
        schemas[name] = get_strategy_schema(name)
    return {"strategies": schemas, "strategy_names": sorted(STRATEGY_NAMES)}


@router.get(
    "/v6a",
    summary="[V6A] List deployment records",
)
async def v6a_list_deployments(
    deployment_state: Optional[str] = None,
    deployment_strategy: Optional[str] = None,
    model_id: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> Dict[str, Any]:
    """List V6A deployment summaries with optional filters.

    Filters:
    - ``deployment_state``: e.g. ACTIVE, CREATED, FAILED
    - ``deployment_strategy``: BLUE_GREEN, CANARY, ROLLING
    - ``model_id``: filter by model
    """
    records = list_v6a_deployment_records(
        status=deployment_state,
        strategy=deployment_strategy,
        model_id=model_id,
        limit=limit,
        offset=offset,
    )
    return {"total": len(records), "deployments": records}


@router.get(
    "/v6a/{deployment_id}",
    summary="[V6A] Get full deployment record",
)
async def v6a_get_deployment(deployment_id: str) -> Dict[str, Any]:
    """Return the full V6A deployment record including strategy config and policy result."""
    record = get_v6a_deployment_record(deployment_id)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"V6A deployment '{deployment_id}' not found.",
        )
    return record


@router.get(
    "/v6a/{deployment_id}/history",
    summary="[V6A] Get deployment state event log",
)
async def v6a_get_history(deployment_id: str) -> Dict[str, Any]:
    """Return the immutable state event log for a V6A deployment.

    Event format mirrors V5B governance events for platform audit consistency:
    event_id, timestamp, event_type, previous_state, new_state, performed_by, reason.
    """
    try:
        history = get_v6a_state_history(deployment_id)
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"V6A deployment '{deployment_id}' not found.",
        )
    return {"deployment_id": deployment_id, "event_count": len(history), "history": history}


@router.get(
    "/v6a/{deployment_id}/transitions",
    summary="[V6A] Get valid next state transitions",
)
async def v6a_get_transitions(deployment_id: str) -> Dict[str, Any]:
    """Return the valid next states from the deployment's current state."""
    record = get_v6a_deployment_record(deployment_id)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"V6A deployment '{deployment_id}' not found.",
        )
    current = record.get("deployment_state", "UNKNOWN")
    try:
        valid = get_valid_transitions(current)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    return {
        "deployment_id":     deployment_id,
        "current_state":     current,
        "valid_transitions": valid,
    }


@router.post(
    "/v6a/{deployment_id}/validate",
    summary="[V6A] Trigger pre-flight validation (CREATED → DEPLOYING)",
)
async def v6a_validate(
    deployment_id: str,
    body: V6AValidateRequest,
) -> Dict[str, Any]:
    """Trigger pre-flight validation for a V6A deployment.

    Transitions: CREATED → VALIDATING → DEPLOYING (or FAILED on error).

    Checks:
    - Governance state is CANDIDATE, STAGING, or PRODUCTION.
    - Model binary path is present in registry.
    """
    try:
        return validate_v6a_deployment(deployment_id, performed_by=body.performed_by)
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"V6A deployment '{deployment_id}' not found.",
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))


@router.post(
    "/v6a/{deployment_id}/deploy",
    summary="[V6A] Activate deployment (DEPLOYING → ACTIVE)",
)
async def v6a_deploy(
    deployment_id: str,
    body: V6ADeployRequest,
) -> Dict[str, Any]:
    """Promote a V6A deployment to ACTIVE.

    Post-activation:
    - Model governance state advanced to PRODUCTION (non-blocking).
    - Champion pointer updated in model_version_manager (non-blocking).
    - Endpoint status set to ACTIVE (non-blocking).
    """
    try:
        return deploy_v6a(deployment_id, performed_by=body.performed_by)
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"V6A deployment '{deployment_id}' not found.",
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))


@router.post(
    "/v6a/{deployment_id}/scale",
    summary="[V6A] Trigger scaling operation (ACTIVE → SCALING → ACTIVE)",
)
async def v6a_scale(
    deployment_id: str,
    body: V6AScaleRequest,
) -> Dict[str, Any]:
    """Trigger a scaling operation.

    CANARY: pass ``{"advance_stage": true}`` in ``scaling_config`` to
    advance to the next traffic percentage stage.

    ROLLING: pass ``{"batch_updated": N}`` to record batch progress.
    """
    try:
        return scale_v6a(
            deployment_id,
            scaling_config=body.scaling_config,
            performed_by=body.performed_by,
            reason=body.reason,
        )
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"V6A deployment '{deployment_id}' not found.",
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))


@router.post(
    "/v6a/{deployment_id}/update",
    summary="[V6A] Champion model swap (ACTIVE → UPDATING → ACTIVE)",
)
async def v6a_update(
    deployment_id: str,
    body: V6AUpdateRequest,
) -> Dict[str, Any]:
    """Perform a champion model swap on a live deployment.

    The new model must have governance state CANDIDATE, STAGING, or PRODUCTION.
    V5B governance is updated non-blocking.
    """
    try:
        return update_v6a_deployment(
            deployment_id,
            new_model_id=body.new_model_id,
            performed_by=body.performed_by,
            reason=body.reason,
        )
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"V6A deployment '{deployment_id}' not found.",
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))


@router.post(
    "/v6a/{deployment_id}/rollback",
    summary="[V6A] Rollback deployment — delegates to V5B governance",
)
async def v6a_rollback(
    deployment_id: str,
    body: V6ARollbackRequest,
) -> Dict[str, Any]:
    """Roll back a V6A deployment to a prior model version.

    Rollback is fully delegated to V5B:
    - ``model_governance.rollback_governance()``
    - ``model_governance.deprecate_governance()``
    - ``model_version_manager.record_rollback_event()``

    Zero new rollback logic in V6A.

    If ``target_model_id`` is not provided, it is resolved from the strategy config.
    """
    try:
        return rollback_v6a(
            deployment_id,
            target_model_id=body.target_model_id,
            performed_by=body.performed_by,
            reason=body.reason,
        )
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"V6A deployment '{deployment_id}' not found.",
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))


@router.post(
    "/v6a/{deployment_id}/archive",
    summary="[V6A] Archive deployment (terminal state)",
)
async def v6a_archive(
    deployment_id: str,
    body: V6AArchiveRequest,
) -> Dict[str, Any]:
    """Archive a V6A deployment permanently.

    ARCHIVED is a terminal state — no further transitions are possible.
    The endpoint is automatically DEPRECATED.
    """
    try:
        return archive_v6a(
            deployment_id,
            performed_by=body.performed_by,
            reason=body.reason,
        )
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"V6A deployment '{deployment_id}' not found.",
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))


@router.get(
    "/v6a/{deployment_id}/endpoint",
    summary="[V6A] Get endpoint metadata for a deployment",
)
async def v6a_get_deployment_endpoint(deployment_id: str) -> Dict[str, Any]:
    """Return the endpoint metadata record for a V6A deployment."""
    ep = get_v6a_endpoint(deployment_id)
    if ep is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No endpoint found for V6A deployment '{deployment_id}'.",
        )
    return ep


# ---------------------------------------------------------------------------
# V6A: Endpoint management
# ---------------------------------------------------------------------------

@router.post(
    "/v6a/endpoints",
    status_code=status.HTTP_201_CREATED,
    summary="[V6A] Register a new endpoint",
)
async def v6a_register_endpoint(
    body: V6ARegisterEndpointRequest,
) -> Dict[str, Any]:
    """Register a V6A endpoint record.

    Endpoints are governance metadata describing the logical service entry point
    for a deployment. This does not bind an actual HTTP server.
    """
    record = body.model_dump()
    record["tags"] = record.get("tags") or []
    try:
        ep_id = register_endpoint(record)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        )
    ep = get_endpoint(ep_id)
    return ep or {"endpoint_id": ep_id}


@router.get(
    "/v6a/endpoints",
    summary="[V6A] List all endpoints",
)
async def v6a_list_endpoints(
    ep_status: Optional[str] = None,
    model_family: Optional[str] = None,
    limit: int = 50,
) -> Dict[str, Any]:
    """List V6A endpoint summaries with optional filters."""
    records = list_endpoints(status=ep_status, model_family=model_family, limit=limit)
    return {"total": len(records), "endpoints": records}


@router.get(
    "/v6a/endpoints/{endpoint_id}",
    summary="[V6A] Get endpoint by ID",
)
async def v6a_get_endpoint(endpoint_id: str) -> Dict[str, Any]:
    """Return the full V6A endpoint record."""
    ep = get_endpoint(endpoint_id)
    if ep is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Endpoint '{endpoint_id}' not found.",
        )
    return ep


@router.patch(
    "/v6a/endpoints/{endpoint_id}/status",
    summary="[V6A] Update endpoint status",
)
async def v6a_update_endpoint_status(
    endpoint_id: str,
    body: V6AUpdateEndpointStatusRequest,
) -> Dict[str, Any]:
    """Update the status of a V6A endpoint (PENDING | ACTIVE | INACTIVE | DEPRECATED)."""
    try:
        return update_ep_status(endpoint_id, body.status)
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Endpoint '{endpoint_id}' not found.",
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        )


@router.post(
    "/v6a/endpoints/{endpoint_id}/deprecate",
    summary="[V6A] Deprecate endpoint",
)
async def v6a_deprecate_endpoint(endpoint_id: str) -> Dict[str, Any]:
    """Permanently mark a V6A endpoint as DEPRECATED.

    A DEPRECATED endpoint cannot be reactivated.
    """
    try:
        return deprecate_endpoint(endpoint_id)
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Endpoint '{endpoint_id}' not found.",
        )


# ============================================================================
# V6B: Enterprise Model Monitoring & Continuous Learning
# ============================================================================
# All monitoring routes are nested under /v6a/{deployment_id}/monitoring/...
# This preserves the deployment-centric URL hierarchy established in V6A.
# A standalone /monitoring router may be introduced in V6C once V6B is canonical.
# ============================================================================

from app.ml.monitoring import monitoring_manager


# ---------------------------------------------------------------------------
# Monitor lifecycle
# ---------------------------------------------------------------------------

@router.post(
    "/v6a/{deployment_id}/monitoring",
    status_code=status.HTTP_201_CREATED,
    summary="[V6B] Create monitoring config for a V6A deployment",
    tags=["V6B Monitoring"],
)
async def v6b_create_monitor(
    deployment_id: str,
    body: Dict[str, Any],
) -> Dict[str, Any]:
    """Create a monitoring configuration for a deployed model.

    Body fields:
    - model_id (required): Model ID to monitor
    - monitoring_name (optional): Human-readable name
    - created_by (optional): Creator identifier
    - enabled_checks (optional): {data_drift, performance, system}
    - data_drift_config (optional): Drift detection thresholds
    - performance_config (optional): Performance metric config
    - system_config (optional): Latency/throughput thresholds
    - alert_config (optional): Alert rules and channels
    - scheduled_retraining_cron (optional): Cron expression (V6C architecture)
    """
    model_id = body.get("model_id")
    if not model_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="'model_id' is required.",
        )
    monitoring_name = body.get("monitoring_name", f"monitor-{deployment_id[:8]}")
    created_by = body.get("created_by", "api")
    config_overrides = {
        k: v for k, v in body.items()
        if k in {"enabled_checks", "data_drift_config", "performance_config",
                 "system_config", "alert_config", "scheduled_retraining_cron"}
    }
    try:
        return monitoring_manager.create_monitor(
            deployment_id=deployment_id,
            model_id=model_id,
            monitoring_name=monitoring_name,
            config_overrides=config_overrides or None,
            created_by=created_by,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


@router.get(
    "/v6a/{deployment_id}/monitoring",
    summary="[V6B] Get monitoring summary for a deployment",
    tags=["V6B Monitoring"],
)
async def v6b_get_monitor(deployment_id: str) -> Dict[str, Any]:
    """Get monitoring config, status, and latest report summaries for a deployment."""
    from app.ml.monitoring import monitoring_registry
    monitors = monitoring_registry.list_monitors(deployment_id=deployment_id, limit=1)
    if not monitors:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No monitoring config found for deployment '{deployment_id}'.",
        )
    monitoring_id = monitors[0]["monitoring_id"]
    try:
        return monitoring_manager.get_monitor_summary(monitoring_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.post(
    "/v6a/{deployment_id}/monitoring/start",
    summary="[V6B] Start monitoring (INACTIVE → ACTIVE via baseline computation)",
    tags=["V6B Monitoring"],
)
async def v6b_start_monitoring(
    deployment_id: str,
    body: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Start monitoring for a deployment. Computes baselines, then transitions to ACTIVE."""
    from app.ml.monitoring import monitoring_registry
    monitors = monitoring_registry.list_monitors(deployment_id=deployment_id, limit=1)
    if not monitors:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"No monitor for deployment '{deployment_id}'.")
    monitoring_id = monitors[0]["monitoring_id"]
    performed_by = (body or {}).get("performed_by", "api")
    try:
        return monitoring_manager.start_monitoring(monitoring_id, performed_by=performed_by)
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post(
    "/v6a/{deployment_id}/monitoring/pause",
    summary="[V6B] Pause monitoring",
    tags=["V6B Monitoring"],
)
async def v6b_pause_monitoring(
    deployment_id: str,
    body: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Pause an ACTIVE or ALERTING monitor."""
    from app.ml.monitoring import monitoring_registry
    monitors = monitoring_registry.list_monitors(deployment_id=deployment_id, limit=1)
    if not monitors:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"No monitor for deployment '{deployment_id}'.")
    monitoring_id = monitors[0]["monitoring_id"]
    performed_by = (body or {}).get("performed_by", "api")
    reason = (body or {}).get("reason")
    try:
        return monitoring_manager.pause_monitoring(monitoring_id, performed_by, reason)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post(
    "/v6a/{deployment_id}/monitoring/resume",
    summary="[V6B] Resume monitoring from PAUSED",
    tags=["V6B Monitoring"],
)
async def v6b_resume_monitoring(
    deployment_id: str,
    body: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Resume a PAUSED monitor."""
    from app.ml.monitoring import monitoring_registry
    monitors = monitoring_registry.list_monitors(deployment_id=deployment_id, limit=1)
    if not monitors:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"No monitor for deployment '{deployment_id}'.")
    monitoring_id = monitors[0]["monitoring_id"]
    performed_by = (body or {}).get("performed_by", "api")
    try:
        return monitoring_manager.resume_monitoring(monitoring_id, performed_by)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post(
    "/v6a/{deployment_id}/monitoring/stop",
    summary="[V6B] Stop monitoring permanently (terminal)",
    tags=["V6B Monitoring"],
)
async def v6b_stop_monitoring(
    deployment_id: str,
    body: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Stop a monitor permanently. STOPPED is a terminal state."""
    from app.ml.monitoring import monitoring_registry
    monitors = monitoring_registry.list_monitors(deployment_id=deployment_id, limit=1)
    if not monitors:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"No monitor for deployment '{deployment_id}'.")
    monitoring_id = monitors[0]["monitoring_id"]
    performed_by = (body or {}).get("performed_by", "api")
    reason = (body or {}).get("reason")
    try:
        return monitoring_manager.stop_monitoring(monitoring_id, performed_by, reason)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.get(
    "/v6a/{deployment_id}/monitoring/history",
    summary="[V6B] Get monitoring lifecycle event log",
    tags=["V6B Monitoring"],
)
async def v6b_get_monitoring_history(deployment_id: str) -> Dict[str, Any]:
    """Return the immutable monitoring lifecycle event log."""
    from app.ml.monitoring import monitoring_registry
    monitors = monitoring_registry.list_monitors(deployment_id=deployment_id, limit=1)
    if not monitors:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"No monitor for deployment '{deployment_id}'.")
    monitoring_id = monitors[0]["monitoring_id"]
    return monitoring_manager.get_monitoring_history(monitoring_id)


# ---------------------------------------------------------------------------
# On-demand checks
# ---------------------------------------------------------------------------

@router.post(
    "/v6a/{deployment_id}/monitoring/check/drift",
    summary="[V6B] Run on-demand drift check",
    tags=["V6B Monitoring"],
)
async def v6b_run_drift_check(
    deployment_id: str,
    body: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Run feature drift, schema drift, missing value drift, and distribution drift checks."""
    from app.ml.monitoring import monitoring_registry
    monitors = monitoring_registry.list_monitors(deployment_id=deployment_id, limit=1)
    if not monitors:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"No monitor for deployment '{deployment_id}'.")
    monitoring_id = monitors[0]["monitoring_id"]
    performed_by = (body or {}).get("performed_by", "api")
    try:
        return monitoring_manager.run_drift_check(monitoring_id, performed_by)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post(
    "/v6a/{deployment_id}/monitoring/check/performance",
    summary="[V6B] Run on-demand performance check",
    tags=["V6B Monitoring"],
)
async def v6b_run_performance_check(
    deployment_id: str,
    body: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Run performance metrics check. Requires submitted actuals for accuracy/F1."""
    from app.ml.monitoring import monitoring_registry
    monitors = monitoring_registry.list_monitors(deployment_id=deployment_id, limit=1)
    if not monitors:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"No monitor for deployment '{deployment_id}'.")
    monitoring_id = monitors[0]["monitoring_id"]
    performed_by = (body or {}).get("performed_by", "api")
    try:
        return monitoring_manager.run_performance_check(monitoring_id, performed_by)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post(
    "/v6a/{deployment_id}/monitoring/check/system",
    summary="[V6B] Run on-demand system metrics check",
    tags=["V6B Monitoring"],
)
async def v6b_run_system_check(
    deployment_id: str,
    body: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Run system metrics check: latency percentiles, throughput, error rate."""
    from app.ml.monitoring import monitoring_registry
    monitors = monitoring_registry.list_monitors(deployment_id=deployment_id, limit=1)
    if not monitors:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"No monitor for deployment '{deployment_id}'.")
    monitoring_id = monitors[0]["monitoring_id"]
    performed_by = (body or {}).get("performed_by", "api")
    try:
        return monitoring_manager.run_system_check(monitoring_id, performed_by)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post(
    "/v6a/{deployment_id}/monitoring/check/all",
    summary="[V6B] Run all enabled monitoring checks",
    tags=["V6B Monitoring"],
)
async def v6b_run_full_check(
    deployment_id: str,
    body: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Run all enabled checks (drift, performance, system) and return combined summary."""
    from app.ml.monitoring import monitoring_registry
    monitors = monitoring_registry.list_monitors(deployment_id=deployment_id, limit=1)
    if not monitors:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"No monitor for deployment '{deployment_id}'.")
    monitoring_id = monitors[0]["monitoring_id"]
    performed_by = (body or {}).get("performed_by", "api")
    try:
        return monitoring_manager.run_full_check(monitoring_id, performed_by)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------

@router.get(
    "/v6a/{deployment_id}/monitoring/reports/drift",
    summary="[V6B] List drift reports for a deployment",
    tags=["V6B Monitoring"],
)
async def v6b_list_drift_reports(
    deployment_id: str,
    limit: int = 20,
) -> Dict[str, Any]:
    """List drift report summaries, newest first."""
    from app.ml.monitoring import monitoring_registry
    monitors = monitoring_registry.list_monitors(deployment_id=deployment_id, limit=1)
    if not monitors:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"No monitor for deployment '{deployment_id}'.")
    monitoring_id = monitors[0]["monitoring_id"]
    reports = monitoring_registry.list_reports(monitoring_id, "drift", limit=limit)
    return {"monitoring_id": monitoring_id, "reports": reports, "count": len(reports)}


@router.get(
    "/v6a/{deployment_id}/monitoring/reports/performance",
    summary="[V6B] List performance reports for a deployment",
    tags=["V6B Monitoring"],
)
async def v6b_list_performance_reports(
    deployment_id: str,
    limit: int = 20,
) -> Dict[str, Any]:
    """List performance report summaries, newest first."""
    from app.ml.monitoring import monitoring_registry
    monitors = monitoring_registry.list_monitors(deployment_id=deployment_id, limit=1)
    if not monitors:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"No monitor for deployment '{deployment_id}'.")
    monitoring_id = monitors[0]["monitoring_id"]
    reports = monitoring_registry.list_reports(monitoring_id, "performance", limit=limit)
    return {"monitoring_id": monitoring_id, "reports": reports, "count": len(reports)}


@router.get(
    "/v6a/{deployment_id}/monitoring/reports/system",
    summary="[V6B] List system reports for a deployment",
    tags=["V6B Monitoring"],
)
async def v6b_list_system_reports(
    deployment_id: str,
    limit: int = 20,
) -> Dict[str, Any]:
    """List system metric report summaries, newest first."""
    from app.ml.monitoring import monitoring_registry
    monitors = monitoring_registry.list_monitors(deployment_id=deployment_id, limit=1)
    if not monitors:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"No monitor for deployment '{deployment_id}'.")
    monitoring_id = monitors[0]["monitoring_id"]
    reports = monitoring_registry.list_reports(monitoring_id, "system", limit=limit)
    return {"monitoring_id": monitoring_id, "reports": reports, "count": len(reports)}


# ---------------------------------------------------------------------------
# Alerts
# ---------------------------------------------------------------------------

@router.get(
    "/v6a/{deployment_id}/monitoring/alerts",
    summary="[V6B] List alerts for a deployment",
    tags=["V6B Monitoring"],
)
async def v6b_list_alerts(
    deployment_id: str,
    severity: Optional[str] = None,
    resolved: Optional[bool] = None,
    limit: int = 50,
) -> Dict[str, Any]:
    """List alerts. Filter by severity (INFO/WARNING/CRITICAL) and resolved status."""
    from app.ml.monitoring import monitoring_registry
    monitors = monitoring_registry.list_monitors(deployment_id=deployment_id, limit=1)
    if not monitors:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"No monitor for deployment '{deployment_id}'.")
    monitoring_id = monitors[0]["monitoring_id"]
    alerts = monitoring_registry.list_alerts(monitoring_id, severity=severity, resolved=resolved, limit=limit)
    return {"monitoring_id": monitoring_id, "alerts": alerts, "count": len(alerts)}


@router.post(
    "/v6a/{deployment_id}/monitoring/alerts/{alert_id}/resolve",
    summary="[V6B] Resolve an active alert",
    tags=["V6B Monitoring"],
)
async def v6b_resolve_alert(
    deployment_id: str,
    alert_id: str,
    body: Dict[str, Any],
) -> Dict[str, Any]:
    """Resolve an active alert. Transitions ALERTING → ACTIVE if no CRITICAL alerts remain."""
    from app.ml.monitoring import monitoring_registry
    monitors = monitoring_registry.list_monitors(deployment_id=deployment_id, limit=1)
    if not monitors:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"No monitor for deployment '{deployment_id}'.")
    monitoring_id = monitors[0]["monitoring_id"]
    resolved_by = body.get("resolved_by", "api")
    resolution_note = body.get("resolution_note", "")
    try:
        return monitoring_manager.resolve_alert(monitoring_id, alert_id, resolved_by, resolution_note)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


# ---------------------------------------------------------------------------
# Actuals (ground truth for performance evaluation)
# ---------------------------------------------------------------------------

@router.post(
    "/v6a/{deployment_id}/monitoring/actuals",
    summary="[V6B] Submit ground truth labels for performance evaluation",
    tags=["V6B Monitoring"],
)
async def v6b_submit_actuals(
    deployment_id: str,
    body: Dict[str, Any],
) -> Dict[str, Any]:
    """Submit ground truth labels linked to prediction log_ids.

    Body: {"actuals": [{"log_id_ref": "<prediction_id>", "actual": <label>}, ...]}
    Stores in daily JSONL files: actuals/YYYY-MM-DD.jsonl
    """
    from app.ml.monitoring import monitoring_registry
    monitors = monitoring_registry.list_monitors(deployment_id=deployment_id, limit=1)
    if not monitors:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"No monitor for deployment '{deployment_id}'.")
    monitoring_id = monitors[0]["monitoring_id"]
    actuals_list = body.get("actuals", [])
    if not actuals_list:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="'actuals' list is required and must not be empty.",
        )
    try:
        return monitoring_manager.submit_actuals(monitoring_id, actuals_list)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


# ---------------------------------------------------------------------------
# Retraining
# ---------------------------------------------------------------------------

@router.post(
    "/v6a/{deployment_id}/monitoring/retraining/trigger",
    status_code=status.HTTP_201_CREATED,
    summary="[V6B] Manually trigger a retraining request",
    tags=["V6B Monitoring"],
)
async def v6b_trigger_retraining(
    deployment_id: str,
    body: Dict[str, Any],
) -> Dict[str, Any]:
    """Create a MANUAL retraining request (status=PENDING, requires human approval).

    Body: {"reason": "...", "requested_by": "mlops", "priority": "HIGH"}
    """
    from app.ml.monitoring import monitoring_registry
    monitors = monitoring_registry.list_monitors(deployment_id=deployment_id, limit=1)
    if not monitors:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"No monitor for deployment '{deployment_id}'.")
    monitoring_id = monitors[0]["monitoring_id"]
    reason = body.get("reason", "Manual retraining request")
    requested_by = body.get("requested_by", "api")
    priority = body.get("priority", "MEDIUM")
    try:
        return monitoring_manager.trigger_retraining(monitoring_id, reason, requested_by, priority)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.get(
    "/v6a/{deployment_id}/monitoring/retraining",
    summary="[V6B] List retraining requests for a deployment",
    tags=["V6B Monitoring"],
)
async def v6b_list_retraining(
    deployment_id: str,
    req_status: Optional[str] = None,
    limit: int = 50,
) -> Dict[str, Any]:
    """List retraining requests. Filter by status (PENDING/APPROVED/REJECTED/etc.)."""
    from app.ml.monitoring import monitoring_registry
    monitors = monitoring_registry.list_monitors(deployment_id=deployment_id, limit=1)
    if not monitors:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"No monitor for deployment '{deployment_id}'.")
    monitoring_id = monitors[0]["monitoring_id"]
    from app.ml.monitoring import retraining_manager
    requests = retraining_manager.list_retraining_requests(
        monitoring_id=monitoring_id, status=req_status, limit=limit
    )
    return {"monitoring_id": monitoring_id, "requests": requests, "count": len(requests)}


@router.patch(
    "/v6a/{deployment_id}/monitoring/retraining/{request_id}/approve",
    summary="[V6B] Approve a PENDING retraining request",
    tags=["V6B Monitoring"],
)
async def v6b_approve_retraining(
    deployment_id: str,
    request_id: str,
    body: Dict[str, Any],
) -> Dict[str, Any]:
    """Approve a retraining request (PENDING → APPROVED)."""
    from app.ml.monitoring import retraining_manager
    approved_by = body.get("approved_by", "api")
    try:
        return retraining_manager.approve_retraining(request_id, approved_by)
    except (ValueError, KeyError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.patch(
    "/v6a/{deployment_id}/monitoring/retraining/{request_id}/reject",
    summary="[V6B] Reject a PENDING retraining request",
    tags=["V6B Monitoring"],
)
async def v6b_reject_retraining(
    deployment_id: str,
    request_id: str,
    body: Dict[str, Any],
) -> Dict[str, Any]:
    """Reject a retraining request (PENDING → REJECTED)."""
    from app.ml.monitoring import retraining_manager
    rejected_by = body.get("rejected_by", "api")
    reason = body.get("reason", "Rejected by reviewer")
    try:
        return retraining_manager.reject_retraining(request_id, rejected_by, reason)
    except (ValueError, KeyError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.patch(
    "/v6a/{deployment_id}/monitoring/config",
    summary="[V6B] Update monitoring configuration",
    tags=["V6B Monitoring"],
)
async def v6b_update_monitor_config(
    deployment_id: str,
    body: Dict[str, Any],
) -> Dict[str, Any]:
    """Update monitoring configuration (thresholds, alert rules, enabled checks, etc.)."""
    from app.ml.monitoring import monitoring_registry
    monitors = monitoring_registry.list_monitors(deployment_id=deployment_id, limit=1)
    if not monitors:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"No monitor for deployment '{deployment_id}'.")
    monitoring_id = monitors[0]["monitoring_id"]
    try:
        return monitoring_manager.update_monitor_config(monitoring_id, body)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


# ---------------------------------------------------------------------------
# Global monitoring endpoints (cross-deployment)
# ---------------------------------------------------------------------------

@router.get(
    "/v6a/monitoring/alerts",
    summary="[V6B] List all alerts across all deployments",
    tags=["V6B Monitoring Global"],
)
async def v6b_list_all_alerts(
    severity: Optional[str] = None,
    resolved: Optional[bool] = None,
    limit: int = 100,
) -> Dict[str, Any]:
    """Global alert list across all monitored deployments."""
    return monitoring_manager.get_all_alerts(severity=severity, resolved=resolved, limit=limit)


@router.get(
    "/v6a/monitoring/monitors",
    summary="[V6B] List all monitoring configs",
    tags=["V6B Monitoring Global"],
)
async def v6b_list_all_monitors(
    deployment_id: Optional[str] = None,
    model_id: Optional[str] = None,
    state: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> Dict[str, Any]:
    """List all monitoring configurations with optional filters."""
    return monitoring_manager.list_monitors(
        deployment_id=deployment_id,
        model_id=model_id,
        state=state,
        limit=limit,
        offset=offset,
    )
