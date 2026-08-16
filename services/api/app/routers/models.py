"""Models Router — V5A + V5B.

REST API for the V5A Model Versioning & Lineage system (10 endpoints)
and V5B Model Governance extensions (9 new endpoints).

V5A Endpoints (unchanged)
--------------------------
GET  /api/v1/models                    — list all model versions (filterable)
GET  /api/v1/models/families           — list all model version families
GET  /api/v1/models/{model_id}         — get full model metadata
GET  /api/v1/models/{model_id}/lineage — get full lineage record
GET  /api/v1/models/lineage/all        — list all lineage records (filterable)
POST /api/v1/models/{model_id}/archive   — archive a model
POST /api/v1/models/{model_id}/restore   — restore archived model
POST /api/v1/models/{model_id}/promote   — promote model to canonical ACTIVE
POST /api/v1/models/{model_id}/deprecate — deprecate a model
DELETE /api/v1/models/{model_id}       — delete ARCHIVED/DEPRECATED model

V5B Governance Endpoints (new)
--------------------------------
GET  /api/v1/models/{model_id}/governance             — full governance record
POST /api/v1/models/{model_id}/governance/transition  — state transition
GET  /api/v1/models/{model_id}/governance/transitions — valid next states
GET  /api/v1/models/{model_id}/readiness              — deployment readiness report
GET  /api/v1/models/{model_id}/card                   — model card
GET  /api/v1/models/families/{family_key}/champion    — current champion
GET  /api/v1/models/families/{family_key}/challengers — all challengers
POST /api/v1/models/families/{family_key}/rollback    — rollback to prior version
GET  /api/v1/models/families/{family_key}/rollback-history — rollback audit log
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
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
from app.ml.model_version_manager import (
    list_families,
    get_family_by_key,
    get_champion,
    get_challengers,
    set_champion,
    record_rollback_event,
)
from app.ml.model_governance import (
    get_governance,
    get_event_log,
    get_valid_transitions,
    transition_state,
    rollback_governance,
    deprecate_governance,
)

from app.ml.algorithm_factory import ALGORITHM_REGISTRY

from app.dependencies import CurrentUser

logger = logging.getLogger("apex_ml.router.models")

router = APIRouter(
    prefix="/models",
    tags=["Models"],
    dependencies=[Depends(CurrentUser)],  # ← all model endpoints require auth
)


@router.get("/algorithms", summary="List supported ML algorithms grouped by task")
def get_supported_algorithms() -> Dict[str, List[str]]:
    """Return dictionary of supported classification and regression algorithms."""
    return {
        task_type: [
            definition.display_name
            for definition in ALGORITHM_REGISTRY.values()
            if definition.task_type == task_type
        ]
        for task_type in ("classification", "regression")
    }


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


# ===========================================================================
# V5B: Governance Endpoints
# ===========================================================================

# ---------------------------------------------------------------------------
# Request / Response models (V5B)
# ---------------------------------------------------------------------------

class TransitionRequest(BaseModel):
    target_state: str
    performed_by: str = "system"
    reason: Optional[str] = None


class RollbackRequest(BaseModel):
    target_model_id: str
    performed_by: str = "system"
    reason: Optional[str] = None


# ---------------------------------------------------------------------------
# Per-model governance endpoints
# NOTE: These must be defined BEFORE /{model_id} to avoid route shadowing
#       for paths like /families/{key}/... (static prefix wins in FastAPI).
# ---------------------------------------------------------------------------

@router.get("/families/{family_key}/champion", summary="Get current champion model for a family")
def get_family_champion(family_key: str) -> Dict[str, Any]:
    """Return the current Champion model ID for a model family.

    The Champion is the single model within the family that is currently
    promoted as the preferred production version.
    """
    fam = get_family_by_key(family_key)
    if fam is None:
        raise HTTPException(
            status_code=404,
            detail=f"Model family '{family_key}' not found.",
        )
    champion_id: Optional[str] = fam.get("champion_model_id")
    champion_meta: Optional[Dict[str, Any]] = None
    if champion_id:
        champion_meta = get_model_by_id(champion_id)
    return {
        "family_key":      family_key,
        "champion_model_id": champion_id,
        "champion_metadata": champion_meta,
    }


@router.get("/families/{family_key}/challengers", summary="Get challenger models for a family")
def get_family_challengers(family_key: str) -> Dict[str, Any]:
    """Return all Challenger model IDs for a model family.

    Challengers are models that are registered in the same family but are not
    the current Champion. They can be promoted to Champion via the rollback
    or promote endpoints.
    """
    fam = get_family_by_key(family_key)
    if fam is None:
        raise HTTPException(
            status_code=404,
            detail=f"Model family '{family_key}' not found.",
        )
    challenger_ids: List[str] = fam.get("challenger_model_ids", [])
    challenger_meta: List[Dict[str, Any]] = [
        m for mid in challenger_ids
        if (m := get_model_by_id(mid)) is not None
    ]
    return {
        "family_key":       family_key,
        "challenger_count": len(challenger_ids),
        "challenger_ids":   challenger_ids,
        "challengers":      challenger_meta,
    }


@router.post("/families/{family_key}/rollback", summary="Rollback to a previous model version")
def rollback_to_version(
    family_key: str,
    body: RollbackRequest,
) -> Dict[str, Any]:
    """Roll back to a specific model version within a family.

    Rollback:
    - Updates the Champion pointer to ``target_model_id``.
    - Appends a ROLLED_BACK event to the target model's governance event log.
    - Appends a DEPRECATED event to the previous champion's governance event log.
    - Appends a rollback event to the family's ``rollback_history``.
    - Preserves all lineage, version history, and previous governance events.
    - Never deletes any models.
    """
    target_model_id: str = body.target_model_id.strip()

    # Resolve family
    fam = get_family_by_key(family_key)
    if fam is None:
        raise HTTPException(
            status_code=404,
            detail=f"Model family '{family_key}' not found.",
        )

    # Verify target model exists
    target_meta = get_model_by_id(target_model_id)
    if target_meta is None:
        raise HTTPException(
            status_code=404,
            detail=f"Target model '{target_model_id}' not found in registry.",
        )

    # Verify target model belongs to this family
    if target_meta.get("model_family", "") != family_key:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Model '{target_model_id}' belongs to family "
                f"'{target_meta.get('model_family')}', not '{family_key}'."
            ),
        )

    current_champion_id: Optional[str] = fam.get("champion_model_id")

    if current_champion_id == target_model_id:
        raise HTTPException(
            status_code=409,
            detail=f"Model '{target_model_id}' is already the Champion. No rollback needed.",
        )

    algorithm: str = fam.get("algorithm", "")
    dataset_id: str = fam.get("dataset_id", "")

    # 1. Update champion pointer
    set_champion(
        algorithm, dataset_id, target_model_id,
        performed_by=body.performed_by,
        reason=body.reason or f"Rollback to {target_model_id}.",
    )

    # 2. Apply ROLLED_BACK governance event on target model
    try:
        rollback_governance(
            model_id=target_model_id,
            performed_by=body.performed_by,
            reason=body.reason or f"Rolled back to this version from {current_champion_id}.",
        )
    except Exception as exc:
        logger.warning("Rollback governance event failed (non-blocking): %s", exc)

    # 3. Deprecate previous champion's governance state
    if current_champion_id:
        try:
            deprecate_governance(
                model_id=current_champion_id,
                performed_by=body.performed_by,
                reason=(
                    body.reason
                    or f"Superseded by rollback to {target_model_id}."
                ),
            )
        except Exception as exc:
            logger.warning("Deprecate old champion governance failed (non-blocking): %s", exc)

    # 4. Record rollback event in family audit log
    try:
        record_rollback_event(
            algorithm, dataset_id,
            from_model_id=current_champion_id or "",
            to_model_id=target_model_id,
            performed_by=body.performed_by,
            reason=body.reason,
        )
    except Exception as exc:
        logger.warning("Record rollback event failed (non-blocking): %s", exc)

    return {
        "success":           True,
        "family_key":        family_key,
        "previous_champion": current_champion_id,
        "new_champion":      target_model_id,
        "performed_by":      body.performed_by,
        "reason":            body.reason,
    }


@router.get("/families/{family_key}/rollback-history", summary="Get rollback history for a family")
def get_rollback_history(family_key: str) -> Dict[str, Any]:
    """Return the complete rollback event audit log for a model family.

    Each event records: event_id, timestamp, from_model_id, to_model_id,
    performed_by, and reason.
    """
    fam = get_family_by_key(family_key)
    if fam is None:
        raise HTTPException(
            status_code=404,
            detail=f"Model family '{family_key}' not found.",
        )
    history = fam.get("rollback_history", [])
    return {
        "family_key":      family_key,
        "rollback_count":  len(history),
        "rollback_history": history,
    }


@router.get("/{model_id}/governance", summary="Get full governance record and event log")
def get_model_governance(model_id: str) -> Dict[str, Any]:
    """Return the full V5B governance record for a model version.

    Includes: current lifecycle state, immutable governance event log,
    deployment readiness report, and model card.
    """
    gov = get_governance(model_id)
    if gov is None:
        raise HTTPException(
            status_code=404,
            detail=(
                f"Governance record for model '{model_id}' not found. "
                "The model may have been registered before V5B was deployed."
            ),
        )
    return gov


@router.post("/{model_id}/governance/transition", summary="Transition lifecycle state")
def governance_transition(
    model_id: str,
    body: TransitionRequest,
) -> Dict[str, Any]:
    """Apply a validated lifecycle state transition.

    Appends a structured immutable event to the governance event log.
    Invalid transitions are rejected with HTTP 409.

    Valid state machine::

        REGISTERED → VALIDATED → CANDIDATE → STAGING → PRODUCTION
                         ↓                                    ↓
                     DEPRECATED ←──────────────────────── DEPRECATED
                         ↓
                     ARCHIVED
    """
    try:
        gov = transition_state(
            model_id=model_id,
            target_state=body.target_state,
            performed_by=body.performed_by,
            reason=body.reason,
        )
    except KeyError:
        raise HTTPException(
            status_code=404,
            detail=f"Governance record for model '{model_id}' not found.",
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    return gov


@router.get("/{model_id}/governance/transitions", summary="Get valid next lifecycle transitions")
def get_governance_transitions(model_id: str) -> Dict[str, Any]:
    """Return the list of valid target states from the model's current state."""
    try:
        valid = get_valid_transitions(model_id)
    except KeyError:
        raise HTTPException(
            status_code=404,
            detail=f"Governance record for model '{model_id}' not found.",
        )
    gov = get_governance(model_id) or {}
    return {
        "model_id":       model_id,
        "current_state":  gov.get("current_state"),
        "valid_transitions": valid,
    }


@router.get("/{model_id}/readiness", summary="Get deployment readiness report")
def get_model_readiness(model_id: str) -> Dict[str, Any]:
    """Return the Deployment Readiness Report for a model.

    The report includes six weighted checks, an overall readiness score (0-100),
    a risk level (LOW/MEDIUM/HIGH), and the V5B Decision Summary
    (deployment_decision, reasons, warnings).

    This report is advisory only. It does not affect model registration.
    """
    gov = get_governance(model_id)
    if gov is None:
        # Fallback: generate on-the-fly from registry + lineage
        meta = get_model_by_id(model_id)
        if meta is None:
            raise HTTPException(
                status_code=404,
                detail=f"Model '{model_id}' not found.",
            )
        lineage_data = get_lineage(model_id) or {}
        try:
            from app.ml.deployment_readiness import generate_readiness_report  # noqa: PLC0415
            return generate_readiness_report(meta, lineage_data)
        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to generate readiness report: {exc}",
            )
    report = gov.get("readiness_report")
    if not report:
        raise HTTPException(
            status_code=404,
            detail=f"Readiness report for model '{model_id}' not yet generated.",
        )
    return report


@router.get("/{model_id}/card", summary="Get model card")
def get_model_card(model_id: str) -> Dict[str, Any]:
    """Return the auto-generated Model Card for a model version.

    The card contains: model identity, algorithm, dataset provenance,
    validation score, metrics, hyperparameters, feature set,
    training timestamp, created_by, lifecycle state,
    champion/challenger status, and deployment readiness summary.
    """
    gov = get_governance(model_id)
    if gov is None:
        # Fallback: generate on-the-fly
        meta = get_model_by_id(model_id)
        if meta is None:
            raise HTTPException(
                status_code=404, detail=f"Model '{model_id}' not found."
            )
        lineage_data = get_lineage(model_id) or {}
        try:
            from app.ml.model_card import generate_model_card  # noqa: PLC0415
            return generate_model_card(
                model_metadata=meta,
                lineage=lineage_data,
                governance_state="UNKNOWN",
                champion_status="UNKNOWN",
            )
        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to generate model card: {exc}",
            )
    card = gov.get("model_card")
    if not card:
        raise HTTPException(
            status_code=404,
            detail=f"Model card for '{model_id}' not yet generated.",
        )
    return card
