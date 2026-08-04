"""Models Router — V5A.

REST API for the V5A Model Versioning & Lineage system.

Endpoints
---------
GET  /api/v1/models                    — list all model versions (filterable)
GET  /api/v1/models/families           — list all model version families
GET  /api/v1/models/{model_id}         — get full model metadata
GET  /api/v1/models/{model_id}/lineage — get full lineage record

POST /api/v1/models/{model_id}/archive   — archive a model
POST /api/v1/models/{model_id}/restore   — restore archived model
POST /api/v1/models/{model_id}/promote   — promote model to canonical ACTIVE
POST /api/v1/models/{model_id}/deprecate — deprecate a model

DELETE /api/v1/models/{model_id}       — delete ARCHIVED/DEPRECATED model

Sprint 4 registry functions are reused without change.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.ml.model_registry import (
    archive_model,
    delete_model,
    demote_model,
    get_model_by_id,
    list_models,
    promote_model,
    restore_model,
)
from app.ml.model_lineage import get_lineage, list_lineage
from app.ml.model_version_manager import list_families

logger = logging.getLogger("apex_ml.router.models")

router = APIRouter(prefix="/models", tags=["Models"])


# ---------------------------------------------------------------------------
# Request/response models
# ---------------------------------------------------------------------------

class ArchiveRequest(BaseModel):
    reason: str = ""


class DemoteRequest(BaseModel):
    new_status: str = "ARCHIVED"


# ---------------------------------------------------------------------------
# Model Catalog
# ---------------------------------------------------------------------------

@router.get("", summary="List registered model versions")
def list_registered_models(
    status: Optional[str] = Query(None, description="Filter by status: ACTIVE, ARCHIVED, DEPRECATED"),
    algorithm: Optional[str] = Query(None, description="Case-insensitive algorithm name filter"),
    dataset_id: Optional[str] = Query(None, description="Exact dataset_id filter"),
    problem_type: Optional[str] = Query(None, description="Case-insensitive problem type filter"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> Dict[str, Any]:
    """Return a paginated list of model index summaries with optional filters."""
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
        "offset": offset,
        "limit": limit,
        "models": models,
    }


@router.get("/families", summary="List model version families")
def list_model_families() -> Dict[str, Any]:
    """Return all model version families tracked by the V5A Version Manager.

    Each family represents a unique (algorithm, dataset_id) pair and carries
    the semantic version history and current promoted version.
    """
    families = list_families()
    return {"total": len(families), "families": families}


@router.get("/{model_id}", summary="Get full model metadata")
def get_model(model_id: str) -> Dict[str, Any]:
    """Return the full metadata record for a specific model version."""
    meta = get_model_by_id(model_id)
    if meta is None:
        raise HTTPException(status_code=404, detail=f"Model '{model_id}' not found.")
    return meta


@router.get("/{model_id}/lineage", summary="Get model lineage record")
def get_model_lineage(model_id: str) -> Dict[str, Any]:
    """Return the complete V5A lineage provenance record for a model version.

    Lineage captures: dataset provenance, validation context, experiment,
    job, hyperparameters, feature set, metrics, and CV summary.
    """
    lineage = get_lineage(model_id)
    if lineage is None:
        raise HTTPException(
            status_code=404,
            detail=f"Lineage record for model '{model_id}' not found.",
        )
    return lineage


# ---------------------------------------------------------------------------
# Lineage catalog
# ---------------------------------------------------------------------------

@router.get("/lineage/all", summary="List all lineage records")
def list_all_lineage(
    dataset_id: Optional[str] = Query(None),
    algorithm: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
) -> Dict[str, Any]:
    """Return all V5A lineage records with optional filters."""
    records = list_lineage(dataset_id=dataset_id, algorithm=algorithm, limit=limit)
    return {"total": len(records), "lineage": records}


# ---------------------------------------------------------------------------
# Lifecycle management
# ---------------------------------------------------------------------------

@router.post("/{model_id}/archive", summary="Archive a model version")
def archive_model_version(model_id: str, body: ArchiveRequest) -> Dict[str, Any]:
    """Transition a model to ARCHIVED status."""
    try:
        return archive_model(model_id, reason=body.reason)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Model '{model_id}' not found.")
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))


@router.post("/{model_id}/restore", summary="Restore an archived model")
def restore_model_version(model_id: str) -> Dict[str, Any]:
    """Restore an ARCHIVED model back to ACTIVE status."""
    try:
        return restore_model(model_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Model '{model_id}' not found.")
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))


@router.post("/{model_id}/promote", summary="Promote a model to canonical ACTIVE")
def promote_model_version(model_id: str) -> Dict[str, Any]:
    """Promote a model. All other ACTIVE models for the same (algorithm, dataset_id) are auto-demoted."""
    try:
        return promote_model(model_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Model '{model_id}' not found.")


@router.post("/{model_id}/deprecate", summary="Deprecate a model version")
def deprecate_model_version(model_id: str) -> Dict[str, Any]:
    """Transition a model to DEPRECATED status."""
    try:
        return demote_model(model_id, new_status="DEPRECATED")
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Model '{model_id}' not found.")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/{model_id}", summary="Delete an archived or deprecated model")
def delete_model_version(model_id: str) -> Dict[str, Any]:
    """Permanently delete a model registry entry.

    Only ARCHIVED or DEPRECATED models can be deleted.
    The model binary artifact is NOT removed — use the artifact manager.
    """
    try:
        deleted = delete_model(model_id)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Model '{model_id}' not found.")
    return {"deleted": True, "model_id": model_id}
