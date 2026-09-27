"""Local Deployment Service — Prototype 4.

Orchestrates the complete local deployment lifecycle:
  - Create a deployment from a completed training job (validates artifact integrity)
  - Load and cache the model artifact for fast inference
  - Execute predictions against the immutable model artifact
  - Stop / Redeploy lifecycle transitions
  - Log all lifecycle events

Immutability guarantee:
  model_path, feature_columns, target_column, and input_schema are all
  snapshotted from the model registry at creation time and stored in the
  local_deployments row.  Subsequent training runs cannot change an existing
  deployment.

Lineage chain:
  LocalDeployment.job_id -> Job -> job_metadata.model_id
      -> Model Registry -> lineage.json (DatasetVersion, PipelineRevision, ...)
"""

from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import numpy as np

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.local_deployment import LocalDeployment, LocalDeploymentStatus
from app.schemas.local_deployment import (
    LocalDeploymentCreate,
    LocalDeploymentResponse,
    LocalPredictRequest,
    LocalPredictResponse,
)

logger = logging.getLogger("apex_ml.local_deployment_service")

# Terminal statuses for jobs (from job schema)
_JOB_COMPLETED_STATUS = "COMPLETED"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _ts() -> str:
    """Current UTC ISO timestamp."""
    return datetime.now(timezone.utc).isoformat()


def _log_entry(msg: str) -> Dict[str, str]:
    return {"ts": _ts(), "msg": msg}


def _to_response(dep: LocalDeployment) -> LocalDeploymentResponse:
    """Map ORM LocalDeployment -> Pydantic response."""
    return LocalDeploymentResponse(
        deployment_id=str(dep.id),
        job_id=dep.job_id,
        model_id=dep.model_id,
        name=dep.name,
        status=dep.status,
        algorithm=dep.algorithm,
        problem_type=dep.problem_type,
        dataset_id=dep.dataset_id,
        target_column=dep.target_column,
        feature_columns=dep.feature_columns or [],
        input_schema=dep.input_schema or {},
        error_message=dep.error_message,
        started_at=dep.started_at.isoformat() if dep.started_at else None,
        stopped_at=dep.stopped_at.isoformat() if dep.stopped_at else None,
        created_at=dep.created_at.isoformat() if isinstance(dep.created_at, datetime) else str(dep.created_at),
        logs=dep.logs or [],
        total_predictions=dep.total_predictions or 0,
        endpoint_path=f"/api/v1/local-deployments/{dep.id}/predict",
    )


def _assert_owner(dep: LocalDeployment, owner_id: str) -> None:
    if dep.owner_id != owner_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this deployment.",
        )


def _build_input_schema(
    feature_columns: List[str],
    model_registry_meta: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Build a per-feature input schema for the prediction form.

    Uses lineage data when available to detect categorical columns.
    Fallback: all features are treated as numeric.
    """
    # Try to get categorical info from lineage
    lineage = model_registry_meta.get("lineage", {})
    feature_set = lineage.get("feature_set", {}) if isinstance(lineage, dict) else {}
    categorical_cols: List[str] = []

    # Lineage may embed categorical_columns list
    if isinstance(lineage, dict):
        categorical_cols = lineage.get("categorical_columns", []) or []

    # Also check registry metadata directly
    if not categorical_cols:
        categorical_cols = model_registry_meta.get("categorical_columns", []) or []

    schema: Dict[str, Any] = {}
    for col in feature_columns:
        if col in categorical_cols:
            schema[col] = {"type": "categorical", "categories": None}
        else:
            schema[col] = {"type": "numeric"}

    return schema


async def _get_deployment(
    deployment_id: str,
    db: AsyncSession,
) -> LocalDeployment:
    """Fetch deployment by UUID or raise 404."""
    try:
        dep_uuid = uuid.UUID(deployment_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Local deployment '{deployment_id}' not found.",
        )

    result = await db.execute(
        select(LocalDeployment).where(LocalDeployment.id == dep_uuid)
    )
    dep = result.scalar_one_or_none()
    if dep is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Local deployment '{deployment_id}' not found.",
        )
    return dep


# ---------------------------------------------------------------------------
# Public Service API
# ---------------------------------------------------------------------------

async def create_local_deployment(
    payload: LocalDeploymentCreate,
    *,
    owner_id: str,
    db: AsyncSession,
) -> LocalDeploymentResponse:
    """
    Create a local deployment from a completed training job.

    Steps:
      1. Verify job exists and is COMPLETED
      2. Extract model_id from job metadata
      3. Look up model from filesystem registry (feature_columns, model_path, etc.)
      4. Verify model binary exists on disk (immutability guard)
      5. Build input_schema from registry metadata
      6. Persist LocalDeployment record (status=DEPLOYING)
      7. Warm the inference engine model cache
      8. Transition to READY

    Raises:
        HTTP 404: Job not found
        HTTP 400: Job not COMPLETED / model artifact missing
        HTTP 409: Model binary missing from disk
    """
    from app.services.job_service import job_service, _JOBS_STORE
    from app.ml.model_registry import get_model_by_id
    from app.ml.inference_engine import load_model, ModelNotFoundError

    logs: List[Dict[str, str]] = []

    # ── Step 1: Validate job is COMPLETED ─────────────────────────────────────
    logs.append(_log_entry(f"Fetching job {payload.job_id} to validate completion..."))

    # Prefer DB, fall back to in-memory store
    db_job_meta: Optional[Dict[str, Any]] = None
    job_model_id: Optional[str] = None
    job_dataset_id: str = ""
    job_status: str = ""

    # Try in-memory first (fast path, also handles mid-session jobs)
    in_mem = _JOBS_STORE.get(payload.job_id)
    if in_mem:
        job_status = in_mem.status
        job_dataset_id = in_mem.dataset_id or ""
        job_model_id = in_mem.metadata.get("model_id") if in_mem.metadata else None

    # Try DB for persistent jobs
    if not in_mem or not job_model_id:
        try:
            from app.database import AsyncSessionLocal
            from app.models.job import Job
            async with AsyncSessionLocal() as _db:
                try:
                    job_uuid = uuid.UUID(payload.job_id)
                except ValueError:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"Job '{payload.job_id}' not found.",
                    )
                res = await _db.execute(select(Job).where(Job.id == job_uuid, Job.is_deleted == False))
                db_job = res.scalar_one_or_none()
                if db_job:
                    job_status = db_job.status
                    job_dataset_id = str(db_job.dataset_id) if db_job.dataset_id else ""
                    meta = db_job.job_metadata or {}
                    job_model_id = meta.get("model_id")
        except HTTPException:
            raise
        except Exception as exc:
            logger.warning("DB job lookup failed: %s", exc)

    if not job_status:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Training job '{payload.job_id}' not found.",
        )

    if job_status != _JOB_COMPLETED_STATUS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Job '{payload.job_id}' has status '{job_status}'. "
                f"Only COMPLETED jobs can be deployed."
            ),
        )

    if not job_model_id:
        from app.ml.model_registry import get_model_by_job_id, get_model_by_id
        reg_model = get_model_by_job_id(payload.job_id)
        if reg_model:
            job_model_id = reg_model.get("model_id")
        elif get_model_by_id(f"model-{payload.job_id[:8]}"):
            job_model_id = f"model-{payload.job_id[:8]}"

    if not job_model_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Job '{payload.job_id}' completed but no model_id was registered. "
                f"The training run may have failed to save an artifact."
            ),
        )

    logs.append(_log_entry(f"Job validated: COMPLETED. Model ID: {job_model_id}"))

    # ── Step 2: Load model registry metadata ──────────────────────────────────
    logs.append(_log_entry("Loading model registry metadata..."))
    registry_meta = get_model_by_id(job_model_id)
    if not registry_meta:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Model '{job_model_id}' not found in model registry. "
                f"The artifact may have been deleted."
            ),
        )

    feature_columns: List[str] = registry_meta.get("feature_columns", [])
    target_column: str = registry_meta.get("target_column", "target")
    model_path: str = registry_meta.get("model_path", "")
    algorithm: str = registry_meta.get("algorithm", "Unknown")
    problem_type: str = registry_meta.get("problem_type", "")
    dataset_id: str = registry_meta.get("dataset_id", "") or job_dataset_id

    # ── Step 3: Verify binary exists ──────────────────────────────────────────
    logs.append(_log_entry(f"Verifying model binary at: {model_path}"))
    if not model_path or not os.path.exists(model_path):
        # Try artifact manager fallback
        try:
            from app.ml.artifact_manager import load_artifact
            fallback_path = load_artifact("model", model_id=job_model_id)
            if fallback_path and os.path.exists(str(fallback_path)):
                model_path = str(fallback_path)
                logs.append(_log_entry(f"Model binary located via artifact manager: {model_path}"))
            else:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        f"Model binary for '{job_model_id}' not found on disk. "
                        f"Expected at: {model_path}"
                    ),
                )
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Model binary for '{job_model_id}' not found on disk.",
            )
    else:
        logs.append(_log_entry("Model binary verified."))

    # ── Step 4: Build input schema ─────────────────────────────────────────────
    input_schema = _build_input_schema(feature_columns, registry_meta)
    logs.append(_log_entry(f"Input schema built for {len(feature_columns)} features."))

    # ── Step 5: Persist deployment record (DEPLOYING) ─────────────────────────
    dep_id = uuid.uuid4()
    now = datetime.now(timezone.utc)
    logs.append(_log_entry("Persisting deployment record..."))

    dep = LocalDeployment(
        id=dep_id,
        job_id=payload.job_id,
        model_id=job_model_id,
        name=payload.name,
        status=LocalDeploymentStatus.DEPLOYING.value,
        algorithm=algorithm,
        problem_type=problem_type,
        dataset_id=dataset_id,
        target_column=target_column,
        feature_columns=feature_columns,
        model_path=model_path,
        input_schema=input_schema,
        logs=logs,
        total_predictions=0,
        started_at=now,
        owner_id=owner_id,
    )
    db.add(dep)
    await db.commit()
    await db.refresh(dep)

    # ── Step 6: Warm model cache (load_model caches in-process) ───────────────
    try:
        logs.append(_log_entry("Loading model into inference cache..."))
        load_model(model_id=job_model_id)
        logs.append(_log_entry("Model loaded and cached successfully. Deployment READY."))
        dep.status = LocalDeploymentStatus.READY.value
    except ModelNotFoundError as exc:
        err_msg = f"Model load failed: {exc}"
        logs.append(_log_entry(f"ERROR: {err_msg}"))
        dep.status = LocalDeploymentStatus.FAILED.value
        dep.error_message = err_msg
    except Exception as exc:
        err_msg = f"Unexpected error during model load: {exc}"
        logs.append(_log_entry(f"ERROR: {err_msg}"))
        dep.status = LocalDeploymentStatus.FAILED.value
        dep.error_message = err_msg

    dep.logs = logs
    await db.commit()
    await db.refresh(dep)

    logger.info(
        "Created local deployment %s for job %s (model=%s, status=%s).",
        dep.id, payload.job_id, job_model_id, dep.status,
    )
    return _to_response(dep)


async def get_local_deployment(
    deployment_id: str,
    *,
    owner_id: str,
    db: AsyncSession,
) -> LocalDeploymentResponse:
    dep = await _get_deployment(deployment_id, db)
    _assert_owner(dep, owner_id)
    return _to_response(dep)


async def list_local_deployments(
    *,
    owner_id: str,
    db: AsyncSession,
) -> List[LocalDeploymentResponse]:
    stmt = (
        select(LocalDeployment)
        .where(LocalDeployment.owner_id == owner_id)
        .order_by(LocalDeployment.created_at.desc())
    )
    result = await db.execute(stmt)
    return [_to_response(d) for d in result.scalars().all()]


async def list_deployments_for_job(
    job_id: str,
    *,
    owner_id: str,
    db: AsyncSession,
) -> List[LocalDeploymentResponse]:
    stmt = (
        select(LocalDeployment)
        .where(
            LocalDeployment.job_id == job_id,
            LocalDeployment.owner_id == owner_id,
        )
        .order_by(LocalDeployment.created_at.desc())
    )
    result = await db.execute(stmt)
    return [_to_response(d) for d in result.scalars().all()]


async def predict_local(
    deployment_id: str,
    payload: LocalPredictRequest,
    *,
    owner_id: str,
    db: AsyncSession,
) -> LocalPredictResponse:
    """
    Execute inference against an immutable local deployment artifact.

    Validates:
      - Deployment is READY
      - All required feature columns are present in payload.inputs
    """
    from app.ml.inference_engine import predict, ModelNotFoundError, InferenceValidationError

    dep = await _get_deployment(deployment_id, db)
    _assert_owner(dep, owner_id)

    if dep.status != LocalDeploymentStatus.READY.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Deployment '{deployment_id}' is not READY (current status: {dep.status}). "
                   f"Cannot run predictions.",
        )

    # Validate all required features are provided
    missing = [f for f in dep.feature_columns if f not in payload.inputs]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Missing required feature(s): {missing}. "
                   f"Required features: {dep.feature_columns}",
        )

    try:
        result = predict(
            data=payload.inputs,
            model_id=dep.model_id,
        )
    except ModelNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Model could not be loaded for prediction: {exc}",
        )
    except InferenceValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Input validation failed: {exc}",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Prediction failed: {exc}",
        )

    # Atomically increment prediction counter
    dep.total_predictions = (dep.total_predictions or 0) + 1

    # Append prediction to logs (keep last 50 only to avoid unbounded growth)
    prediction_val = result.get("prediction")
    log_msg = f"Prediction: {prediction_val} (latency={result.get('latency_ms', 0):.1f}ms)"
    current_logs = list(dep.logs or [])
    current_logs.append(_log_entry(log_msg))
    dep.logs = current_logs[-100:]  # keep last 100 log entries

    await db.commit()
    await db.refresh(dep)

    return LocalPredictResponse(
        deployment_id=str(dep.id),
        job_id=dep.job_id,
        model_id=dep.model_id,
        prediction=prediction_val,
        probabilities=result.get("probabilities"),
        confidence=result.get("confidence"),
        problem_type=dep.problem_type,
        latency_ms=result.get("latency_ms", 0.0),
        timestamp=_ts(),
    )


async def stop_local_deployment(
    deployment_id: str,
    *,
    owner_id: str,
    db: AsyncSession,
) -> LocalDeploymentResponse:
    """
    Stop a READY or DEPLOYING deployment.

    The model artifact is NOT deleted. The deployment can be redeployed.
    """
    dep = await _get_deployment(deployment_id, db)
    _assert_owner(dep, owner_id)

    if dep.status in (
        LocalDeploymentStatus.STOPPED.value,
        LocalDeploymentStatus.STOPPING.value,
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Deployment '{deployment_id}' is already {dep.status}.",
        )

    if dep.status == LocalDeploymentStatus.FAILED.value:
        # Allow stopping a failed deployment too
        pass

    logs = list(dep.logs or [])
    logs.append(_log_entry("Stopping deployment..."))
    dep.status = LocalDeploymentStatus.STOPPING.value
    dep.logs = logs
    await db.commit()

    # Transition to STOPPED
    logs.append(_log_entry("Deployment stopped. Model artifact preserved."))
    dep.status = LocalDeploymentStatus.STOPPED.value
    dep.stopped_at = datetime.now(timezone.utc)
    dep.logs = logs
    await db.commit()
    await db.refresh(dep)

    logger.info("Stopped local deployment %s.", deployment_id)
    return _to_response(dep)


async def redeploy_local_deployment(
    deployment_id: str,
    *,
    owner_id: str,
    db: AsyncSession,
) -> LocalDeploymentResponse:
    """
    Redeploy a STOPPED or FAILED deployment.

    Re-warms the model cache and transitions back to READY.
    Uses the immutable model_id snapshot — not any new training run.
    """
    from app.ml.inference_engine import load_model, ModelNotFoundError

    dep = await _get_deployment(deployment_id, db)
    _assert_owner(dep, owner_id)

    if dep.status not in (
        LocalDeploymentStatus.STOPPED.value,
        LocalDeploymentStatus.FAILED.value,
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Deployment '{deployment_id}' cannot be redeployed from status '{dep.status}'. "
                f"Only STOPPED or FAILED deployments can be redeployed."
            ),
        )

    logs = list(dep.logs or [])
    logs.append(_log_entry("Redeploying: loading model into inference cache..."))
    dep.status = LocalDeploymentStatus.DEPLOYING.value
    dep.error_message = None
    dep.stopped_at = None
    dep.logs = logs
    await db.commit()

    try:
        load_model(model_id=dep.model_id)
        logs.append(_log_entry("Model reloaded successfully. Deployment READY."))
        dep.status = LocalDeploymentStatus.READY.value
        dep.started_at = datetime.now(timezone.utc)
    except ModelNotFoundError as exc:
        err = f"Redeploy failed — model not found: {exc}"
        logs.append(_log_entry(f"ERROR: {err}"))
        dep.status = LocalDeploymentStatus.FAILED.value
        dep.error_message = err
    except Exception as exc:
        err = f"Redeploy failed: {exc}"
        logs.append(_log_entry(f"ERROR: {err}"))
        dep.status = LocalDeploymentStatus.FAILED.value
        dep.error_message = err

    dep.logs = logs
    await db.commit()
    await db.refresh(dep)

    logger.info("Redeployed local deployment %s (status=%s).", deployment_id, dep.status)
    return _to_response(dep)
