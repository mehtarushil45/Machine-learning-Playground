"""Experiments and Models REST Router — Sprint 5A Part 6.

Provides all experiment lifecycle and model lifecycle endpoints.

All endpoints are mounted under /api/v1 via main.py.

Endpoints:
  GET    /experiments                    — list/filter experiments
  GET    /experiments/{id}               — get full experiment record
  DELETE /experiments/{id}               — delete an experiment
  GET    /models                         — list models with filters
  GET    /models/leaderboard             — ranked model leaderboard
  GET    /models/compare                 — compare experiments or models
  GET    /models/{id}                    — get full model metadata
  POST   /models/{id}/promote            — promote a model to ACTIVE
  POST   /models/{id}/archive            — archive a model
  POST   /models/{id}/restore            — restore an ARCHIVED model

Design decisions:
- No authentication headers are required on these endpoints (the
  platform uses JWT auth on other routers; lifecycle management is
  treated as an internal/admin surface for now).
- All mutation endpoints return the updated metadata dict so the
  client has an immediate consistent view without a follow-up GET.
- /models/leaderboard and /models/compare are placed BEFORE
  /models/{id} to avoid FastAPI routing conflicts with path params.
- Error responses follow HTTPException with appropriate status codes
  so the frontend can display meaningful error messages.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, status

from app.ml.artifact_manager import (
    cleanup_orphaned_artifacts,
    list_artifacts,
    validate_artifact,
)
from app.ml.comparison_engine import compare_experiments, compare_models
from app.ml.experiment_tracker import (
    delete_experiment,
    filter_experiments,
    get_experiment,
    list_by_algorithm,
    list_by_dataset,
    list_by_problem,
    list_experiments,
    list_recent,
    search_experiments,
    sort_experiments,
)
from app.ml.leaderboard import generate_leaderboard
from app.ml.model_registry import (
    archive_model,
    get_model_by_id,
    list_archived_models,
    list_models,
    promote_model,
    restore_model,
    demote_model,
)

router = APIRouter(tags=["Experiments & Models"])


# ===========================================================================
# EXPERIMENTS
# ===========================================================================

@router.get(
    "/experiments",
    summary="List and filter experiments",
    response_model=None,
)
async def list_experiments_endpoint(
    status: Optional[str] = Query(None, description="Filter by status: running|completed|failed"),
    algorithm: Optional[str] = Query(None, description="Filter by algorithm (case-insensitive)"),
    dataset_id: Optional[str] = Query(None, description="Filter by dataset_id"),
    problem_type: Optional[str] = Query(None, description="Filter by problem type"),
    query: Optional[str] = Query(None, description="Full-text search across experiment fields"),
    sort_by: str = Query("started_at", description="Field to sort by"),
    ascending: bool = Query(False, description="Sort ascending if true"),
    limit: int = Query(50, ge=1, le=500, description="Page size"),
    offset: int = Query(0, ge=0, description="Page offset"),
) -> Dict[str, Any]:
    """List experiments with optional filtering, search and sorting."""
    if query:
        experiments = search_experiments(query)
    elif any([status, algorithm, dataset_id, problem_type]):
        experiments = filter_experiments(
            status=status,
            algorithm=algorithm,
            dataset_id=dataset_id,
            problem_type=problem_type,
            limit=limit + offset,
        )
    else:
        experiments = list_experiments(limit=limit + offset)

    experiments = sort_experiments(experiments, sort_by=sort_by, ascending=ascending)
    page = experiments[offset: offset + limit]

    return {
        "total": len(experiments),
        "limit": limit,
        "offset": offset,
        "experiments": page,
    }


@router.get(
    "/experiments/{experiment_id}",
    summary="Get full experiment record",
    response_model=None,
)
async def get_experiment_endpoint(experiment_id: str) -> Dict[str, Any]:
    """Return the complete experiment record including the training report."""
    exp = get_experiment(experiment_id)
    if exp is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Experiment '{experiment_id}' not found.",
        )
    return exp


@router.delete(
    "/experiments/{experiment_id}",
    summary="Delete an experiment",
    response_model=None,
)
async def delete_experiment_endpoint(experiment_id: str) -> Dict[str, Any]:
    """Permanently delete an experiment directory (completed or failed only)."""
    try:
        deleted = delete_experiment(experiment_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        )
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Experiment '{experiment_id}' not found.",
        )
    return {"deleted": True, "experiment_id": experiment_id}


# ===========================================================================
# MODELS — special routes BEFORE /{id} to avoid path param conflicts
# ===========================================================================

@router.get(
    "/models/leaderboard",
    summary="Get model performance leaderboard",
    response_model=None,
)
async def get_leaderboard(
    metric: str = Query("accuracy", description="Ranking metric"),
    problem_type: Optional[str] = Query(None),
    algorithm: Optional[str] = Query(None),
    dataset_id: Optional[str] = Query(None),
    top_n: int = Query(20, ge=1, le=200),
    min_value: Optional[float] = Query(None),
    max_value: Optional[float] = Query(None),
    include_archived: bool = Query(False),
) -> Dict[str, Any]:
    """Return a ranked leaderboard of models by the specified metric."""
    return generate_leaderboard(
        metric=metric,
        problem_type=problem_type,
        algorithm=algorithm,
        dataset_id=dataset_id,
        top_n=top_n,
        min_value=min_value,
        max_value=max_value,
        include_archived=include_archived,
    )


@router.get(
    "/models/compare",
    summary="Compare experiments or models",
    response_model=None,
)
async def compare_endpoint(
    experiment_ids: Optional[str] = Query(
        None,
        description="Comma-separated experiment IDs to compare",
    ),
    model_ids: Optional[str] = Query(
        None,
        description="Comma-separated model IDs to compare",
    ),
) -> Dict[str, Any]:
    """Compare multiple experiments or models across all metrics dimensions."""
    if experiment_ids:
        ids = [eid.strip() for eid in experiment_ids.split(",") if eid.strip()]
        return compare_experiments(ids)
    if model_ids:
        ids = [mid.strip() for mid in model_ids.split(",") if mid.strip()]
        return compare_models(ids)
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail="Provide either 'experiment_ids' or 'model_ids' query parameter.",
    )


# ===========================================================================
# MODELS — CRUD and lifecycle
# ===========================================================================

@router.get(
    "/models",
    summary="List models with lifecycle filters",
    response_model=None,
)
async def list_models_endpoint(
    status: Optional[str] = Query(None, description="ACTIVE|ARCHIVED|DEPRECATED"),
    algorithm: Optional[str] = Query(None),
    dataset_id: Optional[str] = Query(None),
    problem_type: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> Dict[str, Any]:
    """List registered models with optional lifecycle and metadata filters."""
    models = list_models(
        status=status,
        algorithm=algorithm,
        dataset_id=dataset_id,
        problem_type=problem_type,
        limit=limit,
        offset=offset,
    )
    return {
        "total": len(models),
        "limit": limit,
        "offset": offset,
        "models": models,
    }


@router.get(
    "/models/{model_id}",
    summary="Get full model metadata",
    response_model=None,
)
async def get_model_endpoint(model_id: str) -> Dict[str, Any]:
    """Return complete metadata for a specific model."""
    model = get_model_by_id(model_id)
    if model is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Model '{model_id}' not found.",
        )
    return model


@router.post(
    "/models/{model_id}/promote",
    summary="Promote a model to ACTIVE",
    response_model=None,
    status_code=status.HTTP_200_OK,
)
async def promote_model_endpoint(model_id: str) -> Dict[str, Any]:
    """Promote a model to ACTIVE and auto-archive other active models for the same algorithm/dataset."""
    try:
        return promote_model(model_id)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))


@router.post(
    "/models/{model_id}/archive",
    summary="Archive a model",
    response_model=None,
    status_code=status.HTTP_200_OK,
)
async def archive_model_endpoint(
    model_id: str,
    reason: str = Query("", description="Reason for archiving"),
) -> Dict[str, Any]:
    """Transition a model from ACTIVE to ARCHIVED."""
    try:
        return archive_model(model_id, reason=reason)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))


@router.post(
    "/models/{model_id}/restore",
    summary="Restore an ARCHIVED model to ACTIVE",
    response_model=None,
    status_code=status.HTTP_200_OK,
)
async def restore_model_endpoint(model_id: str) -> Dict[str, Any]:
    """Restore an ARCHIVED model back to ACTIVE status."""
    try:
        return restore_model(model_id)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))


# ===========================================================================
# ARTIFACTS (bonus endpoints for artifact management)
# ===========================================================================

@router.get(
    "/artifacts",
    summary="List artifacts for a model or experiment",
    response_model=None,
)
async def list_artifacts_endpoint(
    model_id: Optional[str] = Query(None),
    experiment_id: Optional[str] = Query(None),
) -> Dict[str, Any]:
    """List all artifacts present for a given model or experiment."""
    if model_id is None and experiment_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide either model_id or experiment_id.",
        )
    return list_artifacts(model_id=model_id, experiment_id=experiment_id)


@router.get(
    "/artifacts/validate",
    summary="Validate an artifact",
    response_model=None,
)
async def validate_artifact_endpoint(
    artifact_type: str = Query(..., description="Artifact type to validate"),
    model_id: Optional[str] = Query(None),
    experiment_id: Optional[str] = Query(None),
) -> Dict[str, Any]:
    """Check that a specific artifact exists and is well-formed."""
    return validate_artifact(
        artifact_type=artifact_type,
        model_id=model_id,
        experiment_id=experiment_id,
    )


@router.post(
    "/artifacts/cleanup",
    summary="Cleanup orphaned artifacts",
    response_model=None,
)
async def cleanup_artifacts_endpoint(
    dry_run: bool = Query(True, description="If true, report only (no deletion)"),
) -> Dict[str, Any]:
    """Find and optionally delete orphaned artifact files."""
    return cleanup_orphaned_artifacts(dry_run=dry_run)
