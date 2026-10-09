"""Local Deployment Service — Enterprise Model Deployment & Lifecycle Management.

Orchestrates the complete local deployment lifecycle:
  - Create a deployment from a completed training run (validates artifact integrity & lineage)
  - Manage lifecycle state transitions: STARTING, RUNNING, STOPPING, STOPPED, FAILED
  - Start, Stop, Restart, Redeploy, and Delete operations
  - Execute strict pre-inference input validation (schema, types, and categorical domain verification)
  - Execute inference against the immutable model artifact
  - Persist real prediction audit logs & telemetry in LocalPredictionHistory
  - Provide structured lifecycle logs with timestamps and severities

Architecture Separation of Concerns:
  Dataset ≠ Experiment ≠ Training Run ≠ Model ≠ Model Artifact ≠ Deployment ≠ Prediction
"""

from __future__ import annotations

import logging
import os
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from fastapi import HTTPException, status
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.local_deployment import LocalDeployment, LocalDeploymentStatus
from app.models.local_prediction_history import LocalPredictionHistory
from app.schemas.local_deployment import (
    LocalBatchPredictResponse,
    LocalDeploymentCreate,
    LocalDeploymentRedeploy,
    LocalDeploymentResponse,
    LocalPredictRequest,
    LocalPredictResponse,
    ModelVersionOption,
    PredictionHistoryItem,
)

logger = logging.getLogger("apex_ml.local_deployment_service")

# Terminal status for training jobs
_JOB_COMPLETED_STATUS = "COMPLETED"


# ---------------------------------------------------------------------------
# Internal Helpers
# ---------------------------------------------------------------------------

def _ts() -> str:
    """Current UTC ISO timestamp."""
    return datetime.now(timezone.utc).isoformat()


def _log_entry(msg: str, event: str = "LIFECYCLE_EVENT", severity: str = "INFO") -> Dict[str, Any]:
    """Build a structured lifecycle log entry."""
    return {
        "ts": _ts(),
        "event": event,
        "severity": severity,
        "msg": msg,
    }


def _assert_owner(dep: LocalDeployment, owner_id: str) -> None:
    if dep.owner_id and dep.owner_id != owner_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this deployment.",
        )


def _build_input_schema(
    feature_columns: List[str],
    model_registry_meta: Dict[str, Any],
    loaded_model: Optional[Any] = None,
    dataset_sample: Optional[Any] = None,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Build a per-feature input schema and realistic sample inputs for the prediction form.

    Returns (input_schema, sample_inputs).
    """
    import pandas as pd
    cat_cols: set = set()
    categories_map: Dict[str, List[str]] = {}
    bool_cols: set = set()

    # 1. Introspect loaded model container if available
    if loaded_model:
        cat_cols = set(getattr(loaded_model, "categorical_columns", []))
        bool_cols = set(getattr(loaded_model, "boolean_columns", []))
        categories_map = dict(getattr(loaded_model, "categories_map", {}))

        # Direct pipeline introspection if not already populated
        pipe = getattr(loaded_model, "pipeline", loaded_model)
        prep = getattr(pipe, "named_steps", {}).get("preprocessor") if hasattr(pipe, "named_steps") else None
        trans_list = getattr(prep, "transformers_", None) or getattr(prep, "transformers", None)
        if trans_list:
            for tname, trans, cols in trans_list:
                if isinstance(cols, (list, tuple, set)):
                    str_cols = [str(c) for c in cols]
                    if tname in ("categorical", "cat", "boolean") or "cat" in str(tname).lower():
                        cat_cols.update(str_cols)
                        encoder = None
                        if hasattr(trans, "named_steps"):
                            for step_obj in trans.named_steps.values():
                                if hasattr(step_obj, "categories_"):
                                    encoder = step_obj
                                    break
                        elif hasattr(trans, "categories_"):
                            encoder = trans

                        if encoder and hasattr(encoder, "categories_"):
                            for c, cats_arr in zip(str_cols, encoder.categories_):
                                categories_map[c] = [str(x) for x in cats_arr]

    # 2. Lineage / registry metadata fallback
    if isinstance(model_registry_meta, dict):
        lineage = model_registry_meta.get("lineage", {})
        if isinstance(lineage, dict):
            lineage_cats = lineage.get("categorical_columns") or []
            cat_cols.update(lineage_cats)
        direct_cats = model_registry_meta.get("categorical_columns") or []
        cat_cols.update(direct_cats)

    schema: Dict[str, Any] = {}
    sample_inputs: Dict[str, Any] = {}

    for col in feature_columns:
        if col in cat_cols:
            cats = categories_map.get(col)
            if not cats and dataset_sample is not None and isinstance(dataset_sample, pd.DataFrame) and col in dataset_sample.columns:
                unique_vals = [str(x) for x in dataset_sample[col].dropna().unique() if str(x).strip()]
                cats = unique_vals[:30] if unique_vals else None

            if not cats:
                # If boolean-like column name, supply standard binary categories
                col_lower = col.lower()
                if any(k in col_lower for k in ("renew", "churn", "is_", "has_", "active", "flag")):
                    cats = ["No", "Yes"]
                else:
                    cats = ["Category_A", "Category_B"]

            schema[col] = {
                "type": "categorical",
                "categories": cats,
            }
            sample_inputs[col] = cats[0]

        elif col in bool_cols or (
            dataset_sample is not None
            and isinstance(dataset_sample, pd.DataFrame)
            and col in dataset_sample.columns
            and set(dataset_sample[col].dropna().unique()).issubset({0, 1, "0", "1", True, False})
        ):
            schema[col] = {
                "type": "boolean",
                "categories": ["0", "1"],
            }
            sample_inputs[col] = 1

        else:
            col_min = None
            col_max = None
            col_median = 0.0

            if dataset_sample is not None and isinstance(dataset_sample, pd.DataFrame) and col in dataset_sample.columns:
                try:
                    s_num = pd.to_numeric(dataset_sample[col], errors="coerce").dropna()
                    if len(s_num) > 0:
                        col_min = float(s_num.min())
                        col_max = float(s_num.max())
                        col_median = float(s_num.median())
                except Exception:
                    pass

            schema[col] = {
                "type": "numeric",
                "min": col_min,
                "max": col_max,
            }
            sample_inputs[col] = round(col_median, 2) if col_median is not None else 0.0

    return schema, sample_inputs


def _enrich_deployment_data(
    dep: LocalDeployment,
) -> Tuple[Dict[str, Any], Optional[Dict[str, Any]], Optional[Dict[str, Any]], str, str]:
    """Enrich deployment with categories, sample data, performance metrics, and clean display names."""
    import pandas as pd
    from app.ml.inference_engine import load_model
    from app.ml.model_registry import get_model_by_id

    registry_meta = get_model_by_id(dep.model_id) or {}
    metrics = registry_meta.get("metrics")
    algo_key = dep.algorithm or registry_meta.get("algorithm", "Model")

    # Friendly algorithm display name
    algo_display = algo_key.replace("_", " ").title()
    try:
        from app.ml.algorithm_factory import ALGORITHM_REGISTRY
        if algo_key in ALGORITHM_REGISTRY:
            algo_display = ALGORITHM_REGISTRY[algo_key].display_name
    except Exception:
        pass

    # Dataset friendly name
    dataset_name = dep.dataset_id or "Training Dataset"
    try:
        from services.worker.core.dataset_loader import find_dataset_path
        path = find_dataset_path(dep.dataset_id)
        if path:
            dataset_name = os.path.basename(path)
    except Exception:
        pass

    # Preprocessor introspection for categories and numeric bounds
    loaded_model = None
    try:
        loaded_model = load_model(model_id=dep.model_id)
    except Exception:
        pass

    # Load dataset sample
    dataset_sample = None
    try:
        from services.worker.core.dataset_loader import find_dataset_path
        csv_path = find_dataset_path(dep.dataset_id)
        if csv_path and os.path.exists(csv_path):
            dataset_sample = pd.read_csv(csv_path, nrows=50)
    except Exception:
        pass

    schema, sample_inputs = _build_input_schema(
        dep.feature_columns or [],
        registry_meta,
        loaded_model=loaded_model,
        dataset_sample=dataset_sample,
    )

    return schema, sample_inputs, metrics, dataset_name, algo_display


def _to_response(dep: LocalDeployment) -> LocalDeploymentResponse:
    """Map ORM LocalDeployment -> Pydantic response enriched with enterprise metadata."""
    schema, sample_inputs, metrics, dataset_name, algo_display = _enrich_deployment_data(dep)
    return LocalDeploymentResponse(
        deployment_id=str(dep.id),
        job_id=dep.job_id,
        model_id=dep.model_id,
        model_version=dep.model_version or "v1.0.0",
        artifact_id=dep.artifact_id or (os.path.basename(dep.model_path) if dep.model_path else ""),
        name=dep.name,
        status=dep.status,
        algorithm=dep.algorithm,
        problem_type=dep.problem_type,
        dataset_id=dep.dataset_id,
        target_column=dep.target_column,
        feature_columns=dep.feature_columns or [],
        input_schema=schema,
        configuration=dep.configuration or {},
        error_message=dep.error_message,
        started_at=dep.started_at.isoformat() if dep.started_at else None,
        stopped_at=dep.stopped_at.isoformat() if dep.stopped_at else None,
        created_at=dep.created_at.isoformat() if isinstance(dep.created_at, datetime) else str(dep.created_at),
        logs=dep.logs or [],
        total_predictions=dep.total_predictions or 0,
        endpoint_path=f"/api/v1/local-deployments/{dep.id}/predict",
        sample_inputs=sample_inputs,
        metrics=metrics,
        dataset_name=dataset_name,
        algorithm_display_name=algo_display,
    )


async def _get_deployment(
    deployment_id: str | uuid.UUID,
    db: AsyncSession,
) -> LocalDeployment:
    """Fetch deployment by UUID or raise 404."""
    try:
        dep_uuid = deployment_id if isinstance(deployment_id, uuid.UUID) else uuid.UUID(deployment_id)
    except (ValueError, AttributeError):
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
    """Create a local deployment from a completed training job."""
    from app.services.job_service import _JOBS_STORE
    from app.ml.model_registry import get_model_by_id, get_model_by_job_id
    from app.ml.inference_engine import load_model, ModelNotFoundError

    logs: List[Dict[str, Any]] = []

    # 1. Resolve model_id and Validate Source
    job_model_id: Optional[str] = payload.model_id
    effective_job_id: str = payload.job_id or ""
    job_dataset_id: str = ""
    job_status: str = ""

    if payload.job_id:
        logs.append(_log_entry(f"Initiating deployment for training job '{payload.job_id}'...", event="DEPLOYMENT_CREATED"))
        in_mem = _JOBS_STORE.get(payload.job_id)
        if in_mem:
            job_status = in_mem.status
            job_dataset_id = in_mem.dataset_id or ""
            job_model_id = in_mem.metadata.get("model_id") if in_mem.metadata else job_model_id

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
                        job_model_id = meta.get("model_id") or job_model_id
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
                detail=f"Job '{payload.job_id}' has status '{job_status}'. Only COMPLETED jobs can be deployed.",
            )

        if not job_model_id:
            reg_model = get_model_by_job_id(payload.job_id)
            if reg_model:
                job_model_id = reg_model.get("model_id")
            elif get_model_by_id(f"model-{payload.job_id[:8]}"):
                job_model_id = f"model-{payload.job_id[:8]}"

        if not job_model_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Job '{payload.job_id}' completed but no model_id was registered.",
            )
        logs.append(_log_entry(f"Training run validated: COMPLETED. Model ID: {job_model_id}", event="ARTIFACT_RESOLVED"))
    else:
        if not job_model_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Either job_id or model_id must be provided to create a deployment.",
            )
        logs.append(_log_entry(f"Initiating deployment for registered model '{job_model_id}'...", event="DEPLOYMENT_CREATED"))
        effective_job_id = f"custom-{job_model_id}"

    # 2. Model Registry Metadata & Version
    registry_meta = get_model_by_id(job_model_id)
    if not registry_meta:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Model '{job_model_id}' not found in registry.",
        )

    feature_columns: List[str] = registry_meta.get("feature_columns", [])
    target_column: str = registry_meta.get("target_column", "target")
    model_path: str = registry_meta.get("model_path", "")
    algorithm: str = registry_meta.get("algorithm", "Unknown")
    problem_type: str = registry_meta.get("problem_type", "")
    dataset_id: str = registry_meta.get("dataset_id", "") or job_dataset_id
    model_version: str = registry_meta.get("model_version") or registry_meta.get("version") or "v1.0.0"
    artifact_id: str = os.path.basename(model_path) if model_path else f"artifact-{job_model_id}"

    # 3. Verify Binary on Disk
    if not model_path or not os.path.exists(model_path):
        try:
            from app.ml.artifact_manager import load_artifact
            fb = load_artifact("model", model_id=job_model_id)
            if fb and os.path.exists(str(fb)):
                model_path = str(fb)
                artifact_id = os.path.basename(model_path)
            else:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Model artifact binary for '{job_model_id}' not found on disk at {model_path}.",
                )
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Model artifact binary for '{job_model_id}' not found on disk.",
            )

    logs.append(_log_entry(f"Model artifact binary verified: {artifact_id}", event="ARTIFACT_LOADED"))

    # 4. Build Input Schema — load model + dataset sample for accurate type introspection
    import pandas as pd
    from app.ml.inference_engine import load_model as _load_model_for_schema
    _loaded_model_for_schema = None
    _dataset_sample_for_schema = None
    try:
        _loaded_model_for_schema = _load_model_for_schema(model_id=job_model_id)
    except Exception:
        pass
    try:
        from services.worker.core.dataset_loader import find_dataset_path
        _csv_path = find_dataset_path(dataset_id)
        if _csv_path and os.path.exists(_csv_path):
            _dataset_sample_for_schema = pd.read_csv(_csv_path, nrows=50)
    except Exception:
        pass
    input_schema, _ = _build_input_schema(
        feature_columns,
        registry_meta,
        loaded_model=_loaded_model_for_schema,
        dataset_sample=_dataset_sample_for_schema,
    )
    logs.append(_log_entry(f"Input schema built for {len(feature_columns)} features.", event="INPUT_SCHEMA_LOADED"))

    # Compute baseline feature distributions for production drift monitoring
    baseline_dist = {}
    try:
        from app.services.drift_monitoring_service import extract_baseline_distribution
        if _csv_path and os.path.exists(_csv_path):
            baseline_dist = extract_baseline_distribution(_csv_path, feature_columns, input_schema)
            if baseline_dist:
                logs.append(_log_entry(f"Captured baseline distribution for {len(baseline_dist)} features.", event="BASELINE_DISTRIBUTION_CAPTURED"))
    except Exception as exc:
        logger.warning("Could not extract baseline distribution: %s", exc)

    # 5. Persist Deployment record (STARTING)
    dep_id = uuid.uuid4()
    now = datetime.now(timezone.utc)
    config = {
        "host": "localhost",
        "port": 8000,
        "timeout_seconds": 30,
        "baseline_distribution": baseline_dist,
        **(payload.configuration or {}),
    }

    dep = LocalDeployment(
        id=dep_id,
        job_id=effective_job_id,
        model_id=job_model_id,
        model_version=model_version,
        artifact_id=artifact_id,
        name=payload.name,
        configuration=config,
        status=LocalDeploymentStatus.STARTING.value,
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

    # 6. Warm Cache & Transition to RUNNING
    try:
        logs.append(_log_entry("Loading model into in-memory inference cache...", event="ENDPOINT_STARTING"))
        load_model(model_id=job_model_id)
        logs.append(_log_entry(f"Endpoint active and serving on /api/v1/local-deployments/{dep.id}/predict", event="ENDPOINT_STARTED"))
        dep.status = LocalDeploymentStatus.RUNNING.value
    except ModelNotFoundError as exc:
        err = f"Model load failed: {exc}"
        logs.append(_log_entry(err, event="DEPLOYMENT_FAILED", severity="ERROR"))
        dep.status = LocalDeploymentStatus.FAILED.value
        dep.error_message = err
    except Exception as exc:
        err = f"Unexpected startup error: {exc}"
        logs.append(_log_entry(err, event="DEPLOYMENT_FAILED", severity="ERROR"))
        dep.status = LocalDeploymentStatus.FAILED.value
        dep.error_message = err

    dep.logs = logs
    await db.commit()
    await db.refresh(dep)

    logger.info("Created local deployment %s (model=%s, version=%s, status=%s).", dep.id, job_model_id, model_version, dep.status)
    return _to_response(dep)


async def get_local_deployment(
    deployment_id: str,
    *,
    owner_id: str,
    db: AsyncSession,
) -> LocalDeploymentResponse:
    """Retrieve full deployment record."""
    dep = await _get_deployment(deployment_id, db)
    _assert_owner(dep, owner_id)
    return _to_response(dep)


async def list_local_deployments(
    *,
    owner_id: str,
    db: AsyncSession,
) -> List[LocalDeploymentResponse]:
    """List all deployments owned by the user, newest first."""
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
    """List all deployments linked to a specific training job."""
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


async def start_local_deployment(
    deployment_id: str,
    *,
    owner_id: str,
    db: AsyncSession,
) -> LocalDeploymentResponse:
    """Start a STOPPED or FAILED deployment into RUNNING."""
    from app.ml.inference_engine import load_model, ModelNotFoundError

    dep = await _get_deployment(deployment_id, db)
    _assert_owner(dep, owner_id)

    if dep.status in (LocalDeploymentStatus.RUNNING.value, "READY"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Deployment '{deployment_id}' is already running.",
        )

    logs = list(dep.logs or [])
    logs.append(_log_entry("Starting serving endpoint...", event="ENDPOINT_STARTING"))
    dep.status = LocalDeploymentStatus.STARTING.value
    dep.error_message = None
    dep.stopped_at = None
    dep.logs = logs
    await db.commit()

    try:
        load_model(model_id=dep.model_id)
        logs.append(_log_entry("Model loaded into cache. Serving active.", event="ENDPOINT_STARTED"))
        dep.status = LocalDeploymentStatus.RUNNING.value
        dep.started_at = datetime.now(timezone.utc)
    except ModelNotFoundError as exc:
        err = f"Failed to start endpoint — model not found: {exc}"
        logs.append(_log_entry(err, event="DEPLOYMENT_FAILED", severity="ERROR"))
        dep.status = LocalDeploymentStatus.FAILED.value
        dep.error_message = err
    except Exception as exc:
        err = f"Failed to start endpoint: {exc}"
        logs.append(_log_entry(err, event="DEPLOYMENT_FAILED", severity="ERROR"))
        dep.status = LocalDeploymentStatus.FAILED.value
        dep.error_message = err

    dep.logs = logs
    await db.commit()
    await db.refresh(dep)
    return _to_response(dep)


async def stop_local_deployment(
    deployment_id: str,
    *,
    owner_id: str,
    db: AsyncSession,
) -> LocalDeploymentResponse:
    """Stop a RUNNING or STARTING deployment."""
    dep = await _get_deployment(deployment_id, db)
    _assert_owner(dep, owner_id)

    if dep.status == LocalDeploymentStatus.STOPPED.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Deployment '{deployment_id}' is already stopped.",
        )

    logs = list(dep.logs or [])
    logs.append(_log_entry("Stopping serving endpoint...", event="ENDPOINT_STOPPING"))
    dep.status = LocalDeploymentStatus.STOPPING.value
    dep.logs = logs
    await db.commit()

    logs.append(_log_entry("Endpoint stopped. Model artifact preserved in registry.", event="ENDPOINT_STOPPED"))
    dep.status = LocalDeploymentStatus.STOPPED.value
    dep.stopped_at = datetime.now(timezone.utc)
    dep.logs = logs
    await db.commit()
    await db.refresh(dep)

    logger.info("Stopped local deployment %s.", deployment_id)
    return _to_response(dep)


async def restart_local_deployment(
    deployment_id: str,
    *,
    owner_id: str,
    db: AsyncSession,
) -> LocalDeploymentResponse:
    """Restart a deployment: stops if running, reloads model into cache, and starts."""
    from app.ml.inference_engine import load_model

    dep = await _get_deployment(deployment_id, db)
    _assert_owner(dep, owner_id)

    logs = list(dep.logs or [])
    logs.append(_log_entry("Restarting serving endpoint...", event="ENDPOINT_RESTARTING"))
    dep.status = LocalDeploymentStatus.STARTING.value
    dep.error_message = None
    dep.stopped_at = None
    dep.logs = logs
    await db.commit()

    try:
        load_model(model_id=dep.model_id)
        logs.append(_log_entry("Endpoint restarted successfully and serving predictions.", event="ENDPOINT_RESTARTED"))
        dep.status = LocalDeploymentStatus.RUNNING.value
        dep.started_at = datetime.now(timezone.utc)
    except Exception as exc:
        err = f"Restart failed: {exc}"
        logs.append(_log_entry(err, event="DEPLOYMENT_FAILED", severity="ERROR"))
        dep.status = LocalDeploymentStatus.FAILED.value
        dep.error_message = err

    dep.logs = logs
    await db.commit()
    await db.refresh(dep)
    return _to_response(dep)


async def redeploy_local_deployment(
    deployment_id: str,
    payload: Optional[LocalDeploymentRedeploy] = None,
    *,
    owner_id: str,
    db: AsyncSession,
) -> LocalDeploymentResponse:
    """Redeploy an existing deployment.

    Can re-initialize the existing model artifact OR upgrade to a new model version
    (via new job_id or model_id) while preserving historical prediction records.
    """
    from app.ml.inference_engine import load_model, ModelNotFoundError
    from app.ml.model_registry import get_model_by_id, get_model_by_job_id

    dep = await _get_deployment(deployment_id, db)
    _assert_owner(dep, owner_id)

    logs = list(dep.logs or [])
    now = datetime.now(timezone.utc)

    target_model_id = dep.model_id
    target_job_id = dep.job_id

    if payload and (payload.job_id or payload.model_id):
        if payload.job_id:
            target_job_id = payload.job_id
            reg = get_model_by_job_id(payload.job_id)
            if not reg:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"No registered model found for job '{payload.job_id}'.",
                )
            target_model_id = reg["model_id"]
        elif payload.model_id:
            target_model_id = payload.model_id

        meta = get_model_by_id(target_model_id)
        if not meta:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Model '{target_model_id}' not found in registry.",
            )

        new_version = meta.get("model_version") or meta.get("version") or "v1.0.0"
        new_path = meta.get("model_path", "")
        new_artifact_id = os.path.basename(new_path) if new_path else f"artifact-{target_model_id}"

        logs.append(
            _log_entry(
                f"Upgrading deployment from model {dep.model_id} ({dep.model_version}) to {target_model_id} ({new_version})...",
                event="DEPLOYMENT_REDEPLOYED",
            )
        )

        dep.job_id = target_job_id
        dep.model_id = target_model_id
        dep.model_version = new_version
        dep.artifact_id = new_artifact_id
        dep.algorithm = meta.get("algorithm", dep.algorithm)
        dep.problem_type = meta.get("problem_type", dep.problem_type)
        dep.target_column = meta.get("target_column", dep.target_column)
        dep.feature_columns = meta.get("feature_columns", dep.feature_columns)
        dep.model_path = new_path
        dep.input_schema, _ = _build_input_schema(dep.feature_columns, meta)
    else:
        logs.append(_log_entry("Redeploying current model artifact into cache...", event="DEPLOYMENT_REDEPLOYED"))

    if payload and payload.name:
        dep.name = payload.name

    dep.status = LocalDeploymentStatus.STARTING.value
    dep.error_message = None
    dep.stopped_at = None
    dep.logs = logs
    await db.commit()

    try:
        load_model(model_id=dep.model_id)
        logs.append(_log_entry(f"Deployment READY and serving model version '{dep.model_version}'.", event="ENDPOINT_STARTED"))
        dep.status = LocalDeploymentStatus.RUNNING.value
        dep.started_at = now
    except ModelNotFoundError as exc:
        err = f"Redeploy failed — model artifact not found: {exc}"
        logs.append(_log_entry(err, event="DEPLOYMENT_FAILED", severity="ERROR"))
        dep.status = LocalDeploymentStatus.FAILED.value
        dep.error_message = err
    except Exception as exc:
        err = f"Redeploy failed: {exc}"
        logs.append(_log_entry(err, event="DEPLOYMENT_FAILED", severity="ERROR"))
        dep.status = LocalDeploymentStatus.FAILED.value
        dep.error_message = err

    dep.logs = logs
    await db.commit()
    await db.refresh(dep)
    return _to_response(dep)


async def delete_local_deployment(
    deployment_id: str,
    *,
    owner_id: str,
    db: AsyncSession,
) -> Dict[str, Any]:
    """Delete a deployment and its associated prediction history."""
    dep = await _get_deployment(deployment_id, db)
    _assert_owner(dep, owner_id)

    if dep.status == LocalDeploymentStatus.STARTING.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete a deployment while it is STARTING.",
        )

    # Delete prediction history (cascade handled by FK, but explicit cleanup for safety)
    dep_uuid = dep.id
    await db.execute(
        delete(LocalPredictionHistory).where(LocalPredictionHistory.deployment_id == dep_uuid)
    )
    await db.delete(dep)
    await db.commit()

    logger.info("Deleted local deployment %s and associated prediction history.", deployment_id)
    return {"detail": f"Deployment '{deployment_id}' and all associated inference history deleted successfully."}


async def predict_local(
    deployment_id: str,
    payload: LocalPredictRequest,
    *,
    owner_id: str,
    db: AsyncSession,
) -> LocalPredictResponse:
    """Execute prediction against an active local deployment with strict validation & audit persistence."""
    from app.ml.inference_engine import predict, ModelNotFoundError, InferenceValidationError

    dep = await _get_deployment(deployment_id, db)
    _assert_owner(dep, owner_id)

    # 1. State check: Must be RUNNING or READY
    if dep.status not in (LocalDeploymentStatus.RUNNING.value, "READY"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Deployment '{deployment_id}' is currently {dep.status}. "
                f"Cannot run predictions. Please start the deployment first."
            ),
        )

    # 2. Strict Input Validation
    missing_features = [f for f in dep.feature_columns if f not in payload.inputs]
    if missing_features:
        err_msg = f"Missing required feature(s): {missing_features}. Required features: {dep.feature_columns}"
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=err_msg,
        )

    validation_errors: List[str] = []
    # Check if a rich input schema already exists on the deployment
    stored_schema = dep.input_schema or {}
    schema = dict(stored_schema)
    if not schema or all(v.get("type") == "numeric" for v in schema.values()):
        try:
            from app.ml.inference_engine import load_model as _load_for_validation
            from app.ml.model_registry import get_model_by_id as _reg_for_validation
            import pandas as _pd_val
            _lm = _load_for_validation(model_id=dep.model_id)
            _rm = _reg_for_validation(dep.model_id) or {}
            _ds = None
            try:
                from services.worker.core.dataset_loader import find_dataset_path as _fdp
                _cp = _fdp(dep.dataset_id)
                if _cp and os.path.exists(_cp):
                    _ds = _pd_val.read_csv(_cp, nrows=50)
            except Exception:
                pass
            rebuilt, _ = _build_input_schema(dep.feature_columns or [], _rm, loaded_model=_lm, dataset_sample=_ds)
            if rebuilt:
                schema = rebuilt
        except Exception:
            pass

    for col in dep.feature_columns:
        val = payload.inputs.get(col)
        col_schema = schema.get(col, {})
        col_type = col_schema.get("type", "numeric")

        if val is None or (isinstance(val, str) and not val.strip()):
            validation_errors.append(f"{col}: Value cannot be null or empty.")
            continue

        if col_type == "numeric":
            try:
                num = float(val)
                if not np.isfinite(num):
                    validation_errors.append(f"{col}: Expected finite numeric value, received {val}.")
            except (ValueError, TypeError):
                validation_errors.append(f"{col}: Expected numeric value, received {val!r}.")

        elif col_type == "categorical":
            valid_categories = col_schema.get("categories")
            if valid_categories:
                val_str = str(val).strip()
                if val_str not in valid_categories:
                    allowed = ", ".join(valid_categories[:8]) + ("..." if len(valid_categories) > 8 else "")
                    validation_errors.append(
                        f"{col}: Value '{val_str}' is not present in the trained categorical schema. Valid categories: {allowed}"
                    )

        elif col_type == "boolean":
            if str(val).lower() not in ("0", "1", "true", "false", "yes", "no"):
                validation_errors.append(f"{col}: Expected boolean value (0/1 or True/False), received {val!r}.")

    if validation_errors:
        err_detail = "Prediction failed:\n" + "\n".join(validation_errors)
        # Record failed inference in history for auditing
        fail_rec = LocalPredictionHistory(
            id=uuid.uuid4(),
            deployment_id=dep.id,
            model_id=dep.model_id,
            model_version=dep.model_version or "v1.0.0",
            inputs=payload.inputs,
            prediction="",
            status="FAILED",
            error_message=err_detail,
            owner_id=owner_id,
        )
        db.add(fail_rec)
        await db.commit()

        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=err_detail,
        )

    # 3. Inference Execution
    t_start = time.perf_counter()
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
            detail=f"Inference execution failed: {exc}",
        )

    latency_ms = (time.perf_counter() - t_start) * 1000.0
    prediction_val = result.get("prediction")
    confidence_val = result.get("confidence")
    probabilities_val = result.get("probabilities")

    # 4. Persist Prediction Record in History
    pred_id = uuid.uuid4()
    history_rec = LocalPredictionHistory(
        id=pred_id,
        deployment_id=dep.id,
        model_id=dep.model_id,
        model_version=dep.model_version or "v1.0.0",
        inputs=payload.inputs,
        prediction=str(prediction_val),
        confidence=confidence_val,
        probabilities=probabilities_val,
        latency_ms=round(latency_ms, 2),
        status="SUCCESS",
        owner_id=owner_id,
    )
    db.add(history_rec)

    # 5. Telemetry & Log
    dep.total_predictions = (dep.total_predictions or 0) + 1
    log_msg = f"Prediction: {prediction_val} (latency={latency_ms:.1f}ms, confidence={confidence_val if confidence_val is not None else 'N/A'})"
    current_logs = list(dep.logs or [])
    current_logs.append(_log_entry(log_msg, event="PREDICTION_COMPLETED"))
    dep.logs = current_logs[-100:]

    await db.commit()
    await db.refresh(dep)

    return LocalPredictResponse(
        inference_id=str(pred_id),
        deployment_id=str(dep.id),
        job_id=dep.job_id,
        model_id=dep.model_id,
        model_version=dep.model_version or "v1.0.0",
        prediction=prediction_val,
        probabilities=probabilities_val,
        confidence=confidence_val,
        problem_type=dep.problem_type,
        latency_ms=round(latency_ms, 2),
        timestamp=_ts(),
        status="SUCCESS",
    )


async def list_prediction_history(
    deployment_id: str,
    *,
    limit: int = 50,
    offset: int = 0,
    owner_id: str,
    db: AsyncSession,
) -> List[PredictionHistoryItem]:
    """Retrieve paginated, persisted inference history for a specific deployment."""
    dep = await _get_deployment(deployment_id, db)
    _assert_owner(dep, owner_id)

    stmt = (
        select(LocalPredictionHistory)
        .where(LocalPredictionHistory.deployment_id == dep.id)
        .order_by(LocalPredictionHistory.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    result = await db.execute(stmt)
    records = result.scalars().all()

    return [
        PredictionHistoryItem(
            id=str(r.id),
            deployment_id=str(r.deployment_id),
            model_id=r.model_id,
            model_version=r.model_version,
            inputs=r.inputs or {},
            prediction=r.prediction,
            confidence=r.confidence,
            probabilities=r.probabilities,
            latency_ms=r.latency_ms,
            status=r.status,
            error_message=r.error_message,
            created_at=r.created_at.isoformat() if isinstance(r.created_at, datetime) else str(r.created_at),
        )
        for r in records
    ]


async def list_available_versions(
    deployment_id: str,
    *,
    owner_id: str,
    db: AsyncSession,
) -> List[ModelVersionOption]:
    """List all registered model versions for this algorithm and dataset, indicating current."""
    from app.ml.model_registry import list_versions

    dep = await _get_deployment(deployment_id, db)
    _assert_owner(dep, owner_id)

    versions = list_versions(algorithm=dep.algorithm, dataset_id=dep.dataset_id)
    options: List[ModelVersionOption] = []

    for v in versions:
        m_id = v.get("model_id", "")
        version_str = v.get("model_version") or v.get("version") or "v1.0.0"
        algo = v.get("algorithm", dep.algorithm)
        algo_display = algo.replace("_", " ").title()

        options.append(
            ModelVersionOption(
                model_id=m_id,
                job_id=v.get("job_id"),
                version=version_str,
                algorithm=algo,
                algorithm_display_name=algo_display,
                registered_at=v.get("registered_at", ""),
                accuracy=v.get("accuracy"),
                f1=v.get("f1"),
                is_current=(m_id == dep.model_id),
            )
        )

    return options


async def predict_batch_local(
    deployment_id: str,
    data: Any,
    *,
    owner_id: str,
    db: AsyncSession,
    batch_size: int = 1000,
    return_probabilities: bool = True,
) -> LocalBatchPredictResponse:
    """Execute high-throughput batch predictions against a local deployment.

    Accepts raw CSV bytes, DataFrame, or List[Dict[str, Any]].
    Saves predictions to a downloadable enriched CSV and logs performance telemetry.
    """
    from collections import Counter
    from app.ml.inference_engine import (
        predict_batch,
        ModelNotFoundError,
        InferenceValidationError,
    )

    dep = await _get_deployment(deployment_id, db)
    _assert_owner(dep, owner_id)

    # 1. State check: Must be RUNNING or READY
    if dep.status not in (LocalDeploymentStatus.RUNNING.value, "READY"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Deployment '{deployment_id}' is currently {dep.status}. "
                f"Cannot run batch predictions. Please start the deployment first."
            ),
        )

    # 2. Run inference via inference_engine
    try:
        res = predict_batch(
            data=data,
            model_id=dep.model_id,
            return_probabilities=return_probabilities,
            batch_size=batch_size,
            save_csv=True,
        )
    except ModelNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Model artifact unavailable for batch inference: {exc}",
        )
    except InferenceValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Batch input validation failed: {exc}",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Batch inference failed: {exc}",
        )

    total_samples = res.get("total_samples", 0)
    successful = res.get("successful_predictions", 0)
    failed = res.get("failed_predictions", 0)
    all_preds = res.get("predictions", [])
    latency_ms = res.get("latency_ms", 0.0)
    download_url = res.get("csv_download_url")

    # 3. Build preview (first 50)
    preview: List[Dict[str, Any]] = []
    for idx, item in enumerate(all_preds[:50]):
        preview.append({
            "row_index": idx + 1,
            "prediction": item.get("prediction"),
            "confidence": item.get("confidence"),
            "probabilities": item.get("probabilities"),
        })

    # 4. Class distribution for classification
    class_distribution: Optional[Dict[str, int]] = None
    if "classification" in (dep.problem_type or "").lower() and all_preds:
        class_distribution = dict(Counter(str(item.get("prediction")) for item in all_preds))

    # 5. Average confidence
    confidences = [item.get("confidence") for item in all_preds if item.get("confidence") is not None]
    avg_conf = float(np.mean(confidences)) if confidences else None

    # 6. Update deployment telemetry and logs
    dep.total_predictions = (dep.total_predictions or 0) + total_samples
    log_msg = f"Batch scoring: {total_samples} samples scored in {latency_ms:.1f}ms ({successful} successful)"
    current_logs = list(dep.logs or [])
    current_logs.append(_log_entry(log_msg, event="BATCH_PREDICTION_COMPLETED"))
    dep.logs = current_logs[-100:]

    await db.commit()
    await db.refresh(dep)

    return LocalBatchPredictResponse(
        deployment_id=str(dep.id),
        total_samples=total_samples,
        successful_predictions=successful,
        failed_predictions=failed,
        predictions_preview=preview,
        class_distribution=class_distribution,
        avg_confidence=round(avg_conf, 4) if avg_conf is not None else None,
        latency_ms=round(latency_ms, 2),
        download_url=download_url,
        status="SUCCESS",
        timestamp=_ts(),
    )


async def generate_template_csv(
    deployment_id: str,
    *,
    owner_id: str,
    db: AsyncSession,
) -> str:
    """Generate a template CSV string containing required feature columns and sample values."""
    import io
    import pandas as pd

    dep = await _get_deployment(deployment_id, db)
    _assert_owner(dep, owner_id)

    schema, sample_inputs = _build_input_schema(dep.feature_columns or [], {})

    # Generate 3 representative sample rows
    rows: List[Dict[str, Any]] = []
    for i in range(3):
        row: Dict[str, Any] = {}
        for col in (dep.feature_columns or []):
            base_val = sample_inputs.get(col, "0")
            col_info = schema.get(col, {})
            if col_info.get("type") == "numeric":
                try:
                    num_val = float(base_val)
                    row[col] = round(num_val + i * (1.0 if num_val >= 0 else -1.0), 2)
                except (ValueError, TypeError):
                    row[col] = base_val
            elif col_info.get("type") == "categorical":
                cats = col_info.get("categories") or []
                if cats:
                    row[col] = cats[i % len(cats)]
                else:
                    row[col] = base_val
            elif col_info.get("type") == "boolean":
                row[col] = i % 2
            else:
                row[col] = f"{base_val}_{i + 1}"
        rows.append(row)

    df_sample = pd.DataFrame(rows, columns=dep.feature_columns or [])
    out = io.StringIO()
    df_sample.to_csv(out, index=False)
    return out.getvalue()


async def get_deployment_drift_report(
    deployment_id: str,
    *,
    owner_id: str,
    db: AsyncSession,
    min_samples: int = 50,
) -> Dict[str, Any]:
    """Retrieve real-time drift analysis and serving telemetry for a deployment."""
    dep = await _get_deployment(deployment_id, db)
    if dep.owner_id and dep.owner_id != owner_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this deployment.",
        )

    # If baseline is missing from configuration, attempt to compute and persist it
    config = dict(dep.configuration or {})
    if not config.get("baseline_distribution"):
        try:
            from services.worker.core.dataset_loader import find_dataset_path
            from app.services.drift_monitoring_service import extract_baseline_distribution
            csv_path = find_dataset_path(dep.dataset_id)
            if csv_path and os.path.exists(csv_path):
                baseline = extract_baseline_distribution(csv_path, dep.feature_columns or [], dep.input_schema or {})
                if baseline:
                    config["baseline_distribution"] = baseline
                    dep.configuration = config
                    await db.commit()
        except Exception as exc:
            logger.warning("Dynamic baseline extraction failed: %s", exc)

    # Extract model feature importances from config, registry metadata, or metrics
    fi = config.get("feature_importances") or {}
    if not fi:
        try:
            from app.ml.model_registry import get_model_by_id
            reg = get_model_by_id(dep.model_id) or {}
            fi = reg.get("feature_importances") or reg.get("metrics", {}).get("feature_importances") or {}
        except Exception:
            pass

    # Fetch recent inference history records (most recent 500 records)
    dep_uuid = dep.id
    history_res = await db.execute(
        select(LocalPredictionHistory)
        .where(LocalPredictionHistory.deployment_id == dep_uuid)
        .order_by(LocalPredictionHistory.created_at.desc())
        .limit(500)
    )
    records = list(history_res.scalars().all())

    # Check for submitted actuals
    actuals = config.get("actuals") or []

    from app.services.drift_monitoring_service import generate_drift_report
    report = generate_drift_report(dep, records, min_samples=min_samples, feature_importances=fi, actuals=actuals)
    report["is_simulation"] = False
    return report


async def simulate_deployment_drift(
    deployment_id: str,
    *,
    owner_id: str,
    db: AsyncSession,
    shift_factor: float = 2.5,
    target_feature: Optional[str] = None,
) -> Dict[str, Any]:
    """Generate an isolated simulated drift analysis with synthetic production samples to preview drift detection.
    
    Runs entirely in-memory and never writes to real prediction logs or databases.
    """
    dep = await _get_deployment(deployment_id, db)
    if dep.owner_id and dep.owner_id != owner_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this deployment.",
        )

    config = dep.configuration or {}
    baseline = config.get("baseline_distribution", {})
    feature_cols = dep.feature_columns or []

    # Target feature: specified or first active numeric feature
    drift_target_feature = target_feature or (feature_cols[0] if feature_cols else "")
    if target_feature and target_feature in feature_cols:
        drift_target_feature = target_feature

    # Extract feature importances
    fi = config.get("feature_importances") or {}
    if not fi:
        try:
            from app.ml.model_registry import get_model_by_id
            reg = get_model_by_id(dep.model_id) or {}
            fi = reg.get("feature_importances") or reg.get("metrics", {}).get("feature_importances") or {}
        except Exception:
            pass

    # Generate 50 synthetic records purely in-memory
    simulated_records = []
    for i in range(50):
        fake_inputs: Dict[str, Any] = {}
        for col in feature_cols:
            col_info = baseline.get(col, {})
            col_type = col_info.get("type", "numeric")
            if col_type == "numeric":
                mean_val = float(col_info.get("mean", 50.0))
                std_val = float(col_info.get("std", 10.0))
                if col == drift_target_feature:
                    val = float(np.random.normal(mean_val + shift_factor * std_val, max(std_val, 1.0)))
                else:
                    val = float(np.random.normal(mean_val, max(std_val, 1.0)))
                fake_inputs[col] = round(val, 2)
            elif col_type == "binary":
                cats = col_info.get("categories", ["0", "1"])
                if col == drift_target_feature:
                    # Inverted binary distribution
                    fake_inputs[col] = cats[0] if (i < 45) else cats[1]
                else:
                    fake_inputs[col] = cats[i % len(cats)]
            else:
                cats = col_info.get("categories", ["A", "B", "C"])
                if col == drift_target_feature:
                    fake_inputs[col] = cats[-1] if (i < 40) else cats[0]
                else:
                    fake_inputs[col] = cats[i % len(cats)] if cats else "sample"

        simulated_records.append(
            type("SimulatedRec", (), {
                "inputs": fake_inputs,
                "status": "SUCCESS",
                "latency_ms": round(float(np.random.uniform(3.0, 15.0)), 2),
                "created_at": datetime.now(timezone.utc),
            })()
        )

    from app.services.drift_monitoring_service import generate_drift_report
    report = generate_drift_report(dep, simulated_records, min_samples=5, feature_importances=fi)
    report["is_simulation"] = True
    report["simulation_target_feature"] = drift_target_feature
    report["simulation_shift_factor"] = shift_factor
    return report


