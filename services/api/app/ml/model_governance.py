"""Model Governance Engine — Version 5B.

Manages the Model Lifecycle State Machine, Governance Event Log,
Champion/Challenger assignment, Deployment Readiness initialisation,
Model Card generation, and Rollback for the ML Platform.

State Machine
-------------
::

    REGISTERED → VALIDATED → CANDIDATE → STAGING → PRODUCTION
                    ↓                                    ↓
                DEPRECATED ←──────────────────────── DEPRECATED
                    ↓
                ARCHIVED

Valid transitions
-----------------
+--------------+-------------------------------------------+
| From         | To (allowed)                              |
+==============+===========================================+
| REGISTERED   | VALIDATED                                 |
+--------------+-------------------------------------------+
| VALIDATED    | CANDIDATE, DEPRECATED                     |
+--------------+-------------------------------------------+
| CANDIDATE    | STAGING, DEPRECATED                       |
+--------------+-------------------------------------------+
| STAGING      | PRODUCTION, CANDIDATE                     |
+--------------+-------------------------------------------+
| PRODUCTION   | DEPRECATED, STAGING                       |
+--------------+-------------------------------------------+
| DEPRECATED   | ARCHIVED                                  |
+--------------+-------------------------------------------+
| ARCHIVED     | (terminal — no further transitions)       |
+--------------+-------------------------------------------+

Event log (V5B improvement)
---------------------------
Every governance action produces an **immutable structured event**:

::

    {
      "event_id":       "<uuid4>",
      "timestamp":      "<ISO-8601 UTC>",
      "event_type":     "REGISTERED | VALIDATED | CANDIDATE | STAGING |
                         PROMOTED | ROLLED_BACK | DEPRECATED | ARCHIVED",
      "previous_state": "<state | null>",
      "new_state":      "<state>",
      "performed_by":   "system | <user_id>",
      "reason":         "<string | null>"
    }

The event log is the authoritative audit record for governance dashboards,
compliance, and future organisation administration.

Storage
-------
::

    uploads/models/registry/<model_id>/governance.json

Full governance.json schema::

    {
      "model_id":         "<model_id>",
      "current_state":    "REGISTERED",
      "event_log":        [ <event>, ... ],
      "readiness_report": { ... },
      "model_card":       { ... },
      "created_at":       "<ISO>",
      "updated_at":       "<ISO>"
    }

Public API
----------
``initialise_governance(model_id, lineage, performed_by)``
    Write governance.json for a newly registered model (state=REGISTERED).
    Generates Deployment Readiness Report and Model Card.
    Non-blocking — called inside try/except in engine.py.

``transition_state(model_id, target_state, performed_by, reason)``
    Validate and apply a state transition. Appends a structured event.
    Raises ``ValueError`` on invalid transitions.

``rollback_governance(model_id, performed_by, reason)``
    Apply a ROLLED_BACK event and set state → PRODUCTION.
    Called by the rollback endpoint after champion pointer is updated.

``get_governance(model_id)``
    Return the full governance record, or None.

``get_event_log(model_id)``
    Return the immutable event log list for a model_id.

``get_valid_transitions(model_id)``
    Return sorted list of valid target states from current state.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import uuid

logger = logging.getLogger("apex_ml.governance")

# ---------------------------------------------------------------------------
# Storage layout (mirrors model_registry._model_dir)
# ---------------------------------------------------------------------------

_REGISTRY_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "uploads", "models", "registry")
)


def _model_dir(model_id: str) -> str:
    return os.path.join(_REGISTRY_ROOT, model_id)


def _governance_path(model_id: str) -> str:
    return os.path.join(_model_dir(model_id), "governance.json")


def _ensure_model_dir(model_id: str) -> None:
    os.makedirs(_model_dir(model_id), exist_ok=True)


# ---------------------------------------------------------------------------
# State machine definition
# ---------------------------------------------------------------------------

_ALL_STATES: frozenset = frozenset({
    "REGISTERED", "VALIDATED", "CANDIDATE",
    "STAGING", "PRODUCTION", "DEPRECATED", "ARCHIVED",
})

# Adjacency map: current_state → frozenset of valid target states
_VALID_TRANSITIONS: Dict[str, frozenset] = {
    "REGISTERED":  frozenset({"VALIDATED"}),
    "VALIDATED":   frozenset({"CANDIDATE", "DEPRECATED"}),
    "CANDIDATE":   frozenset({"STAGING", "DEPRECATED"}),
    "STAGING":     frozenset({"PRODUCTION", "CANDIDATE"}),
    "PRODUCTION":  frozenset({"DEPRECATED", "STAGING"}),
    "DEPRECATED":  frozenset({"ARCHIVED"}),
    "ARCHIVED":    frozenset(),   # terminal
}

# State → event_type mapping
_STATE_TO_EVENT: Dict[str, str] = {
    "VALIDATED":  "VALIDATED",
    "CANDIDATE":  "CANDIDATE",
    "STAGING":    "STAGING",
    "PRODUCTION": "PROMOTED",
    "DEPRECATED": "DEPRECATED",
    "ARCHIVED":   "ARCHIVED",
}


# ---------------------------------------------------------------------------
# I/O helpers
# ---------------------------------------------------------------------------

def _load_governance(model_id: str) -> Optional[Dict[str, Any]]:
    path = _governance_path(model_id)
    if not os.path.exists(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except Exception as exc:
        logger.error("Failed to read governance for %s: %s", model_id, exc)
        return None


def _save_governance(model_id: str, data: Dict[str, Any]) -> None:
    _ensure_model_dir(model_id)
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    path = _governance_path(model_id)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2, default=str)
    os.replace(tmp, path)


def _load_governance_or_raise(model_id: str) -> Dict[str, Any]:
    gov = _load_governance(model_id)
    if gov is None:
        raise KeyError(f"Governance record for model '{model_id}' not found.")
    return gov


# ---------------------------------------------------------------------------
# Event builder (V5B improvement)
# ---------------------------------------------------------------------------

def _make_event(
    event_type: str,
    previous_state: Optional[str],
    new_state: str,
    performed_by: str = "system",
    reason: Optional[str] = None,
) -> Dict[str, Any]:
    """Build an immutable structured governance event.

    Args:
        event_type:     Type label (e.g. ``"REGISTERED"``, ``"PROMOTED"``).
        previous_state: Prior state, or None for first event.
        new_state:      State after this event.
        performed_by:   Actor identifier (default: ``"system"``).
        reason:         Optional human-readable reason string.

    Returns:
        Immutable event dict containing event_id, timestamp, event_type,
        previous_state, new_state, performed_by, reason.
    """
    return {
        "event_id":       str(uuid.uuid4()),
        "timestamp":      datetime.now(timezone.utc).isoformat(),
        "event_type":     event_type,
        "previous_state": previous_state,
        "new_state":      new_state,
        "performed_by":   performed_by,
        "reason":         reason,
    }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def initialise_governance(
    model_id: str,
    lineage: Dict[str, Any],
    performed_by: str = "system",
) -> Dict[str, Any]:
    """Create the governance record for a newly registered model.

    Called once per model immediately after ``register_model()`` in engine.py.
    Generates the Deployment Readiness Report and Model Card as part of
    initialisation. Both are embedded in ``governance.json``.

    This function is always invoked inside a try/except in engine.py and
    must never raise — any internal failures are logged as warnings.

    Args:
        model_id:     Model identifier (must already exist in model registry).
        lineage:      Full lineage dict from ``model_lineage.build_lineage()``.
        performed_by: Actor initiating the registration (default: ``"system"``).

    Returns:
        The fully populated governance record dict.
    """
    now = datetime.now(timezone.utc).isoformat()

    # ── Deployment Readiness Report ───────────────────────────────────────
    readiness_report: Dict[str, Any] = {}
    try:
        from app.ml.deployment_readiness import generate_readiness_report  # noqa: PLC0415
        from app.ml.model_registry import get_model_by_id                   # noqa: PLC0415
        meta = get_model_by_id(model_id) or {}
        readiness_report = generate_readiness_report(meta, lineage)
    except Exception as exc:
        logger.warning(
            "Readiness report generation failed for %s (non-blocking): %s",
            model_id, exc,
        )

    # ── Champion status (required for model card) ─────────────────────────
    champion_status = "CHALLENGER"
    algorithm: str = lineage.get("algorithm", "")
    dataset_id: str = lineage.get("dataset", {}).get("dataset_id", "")

    try:
        from app.ml.model_version_manager import get_champion, set_champion  # noqa: PLC0415
        if algorithm and dataset_id:
            existing_champion = get_champion(algorithm, dataset_id)
            if existing_champion is None:
                # First model in this family → Champion
                set_champion(
                    algorithm, dataset_id, model_id,
                    performed_by=performed_by,
                    reason="First model in family — auto-promoted to Champion.",
                )
                champion_status = "CHAMPION"
            elif existing_champion == model_id:
                champion_status = "CHAMPION"
            # else: stays CHALLENGER (default)
    except Exception as exc:
        logger.warning(
            "Champion assignment failed for %s (non-blocking): %s",
            model_id, exc,
        )

    # ── Model Card ────────────────────────────────────────────────────────
    model_card: Dict[str, Any] = {}
    try:
        from app.ml.model_card import generate_model_card           # noqa: PLC0415
        from app.ml.model_registry import get_model_by_id           # noqa: PLC0415
        meta = get_model_by_id(model_id) or {}
        model_card = generate_model_card(
            model_metadata=meta,
            lineage=lineage,
            governance_state="REGISTERED",
            champion_status=champion_status,
            readiness_report=readiness_report,
        )
    except Exception as exc:
        logger.warning(
            "Model card generation failed for %s (non-blocking): %s",
            model_id, exc,
        )

    # ── Initial governance event (V5B structured event log) ───────────────
    initial_event = _make_event(
        event_type="REGISTERED",
        previous_state=None,
        new_state="REGISTERED",
        performed_by=performed_by,
        reason="Automatic registration on training completion.",
    )

    gov: Dict[str, Any] = {
        "model_id":         model_id,
        "current_state":    "REGISTERED",
        "event_log":        [initial_event],
        "readiness_report": readiness_report,
        "model_card":       model_card,
        "created_at":       now,
        "updated_at":       now,
    }

    _save_governance(model_id, gov)

    logger.info(
        "Governance initialised — model_id=%s state=REGISTERED "
        "champion=%s readiness_score=%s",
        model_id,
        champion_status,
        readiness_report.get("readiness_score", "N/A"),
    )
    return gov


def transition_state(
    model_id: str,
    target_state: str,
    performed_by: str = "system",
    reason: Optional[str] = None,
) -> Dict[str, Any]:
    """Validate and apply a lifecycle state transition.

    Appends a structured governance event to the immutable event log.
    Refreshes the Model Card to reflect the new state.

    Args:
        model_id:     Model identifier.
        target_state: Target lifecycle state (case-insensitive).
        performed_by: Actor performing the transition.
        reason:       Optional human-readable justification.

    Returns:
        Updated governance record dict.

    Raises:
        KeyError:   If the governance record for model_id does not exist.
        ValueError: If the target_state is unknown or the transition is invalid
                    from the current state.
    """
    target_state = target_state.strip().upper()
    if target_state not in _ALL_STATES:
        raise ValueError(
            f"Unknown lifecycle state '{target_state}'. "
            f"Valid states: {sorted(_ALL_STATES)}"
        )

    gov = _load_governance_or_raise(model_id)
    current = gov["current_state"]
    allowed = _VALID_TRANSITIONS.get(current, frozenset())

    if target_state not in allowed:
        raise ValueError(
            f"Invalid transition '{current}' → '{target_state}'. "
            f"Allowed from '{current}': "
            f"{sorted(allowed) or '(none — terminal state)'}"
        )

    event_type = _STATE_TO_EVENT.get(target_state, "TRANSITIONED")
    event = _make_event(
        event_type=event_type,
        previous_state=current,
        new_state=target_state,
        performed_by=performed_by,
        reason=reason,
    )

    gov["current_state"] = target_state
    gov["event_log"].append(event)

    # Refresh Model Card to reflect new state (non-blocking)
    try:
        _refresh_model_card(model_id, gov)
    except Exception as exc:
        logger.warning("Model card refresh failed after transition: %s", exc)

    _save_governance(model_id, gov)

    logger.info(
        "State transition — model_id=%s %s → %s (by=%s)",
        model_id, current, target_state, performed_by,
    )
    return gov


def rollback_governance(
    model_id: str,
    performed_by: str = "system",
    reason: Optional[str] = None,
) -> Dict[str, Any]:
    """Apply a ROLLED_BACK event and set governance state to PRODUCTION.

    Called by the rollback REST endpoint after the champion pointer in
    ``model_version_manager`` has already been updated.  The target
    model (the one being rolled back TO) receives this event.

    Args:
        model_id:     Model ID of the version being rolled back to.
        performed_by: Actor performing the rollback.
        reason:       Optional human-readable reason.

    Returns:
        Updated governance record dict.
    """
    gov = _load_governance(model_id)
    if gov is None:
        # Create a minimal record if governance.json is missing (resilience)
        now = datetime.now(timezone.utc).isoformat()
        gov = {
            "model_id":         model_id,
            "current_state":    "DEPRECATED",
            "event_log":        [],
            "readiness_report": {},
            "model_card":       {},
            "created_at":       now,
            "updated_at":       now,
        }
        logger.warning(
            "No governance record found for %s; creating minimal record for rollback.",
            model_id,
        )

    previous = gov["current_state"]
    event = _make_event(
        event_type="ROLLED_BACK",
        previous_state=previous,
        new_state="PRODUCTION",
        performed_by=performed_by,
        reason=reason or f"Rolled back to version {model_id}.",
    )

    gov["current_state"] = "PRODUCTION"
    gov["event_log"].append(event)

    try:
        _refresh_model_card(model_id, gov)
    except Exception:
        pass

    _save_governance(model_id, gov)
    logger.info("Rollback governance applied — model_id=%s", model_id)
    return gov


def deprecate_governance(
    model_id: str,
    performed_by: str = "system",
    reason: Optional[str] = None,
) -> Dict[str, Any]:
    """Apply a DEPRECATED event to the governance record of a displaced champion.

    Called internally during rollback to mark the old champion as deprecated.

    Args:
        model_id:     Model to deprecate.
        performed_by: Actor.
        reason:       Optional reason.

    Returns:
        Updated governance record or empty dict if record not found.
    """
    gov = _load_governance(model_id)
    if gov is None:
        logger.warning(
            "deprecate_governance: no record for %s — skipping.", model_id
        )
        return {}

    previous = gov["current_state"]
    # Allow deprecation from any non-terminal state
    if previous == "ARCHIVED":
        logger.warning(
            "deprecate_governance: model %s is ARCHIVED — skipping.", model_id
        )
        return gov

    event = _make_event(
        event_type="DEPRECATED",
        previous_state=previous,
        new_state="DEPRECATED",
        performed_by=performed_by,
        reason=reason or "Auto-deprecated: superseded by rollback.",
    )
    gov["current_state"] = "DEPRECATED"
    gov["event_log"].append(event)
    _save_governance(model_id, gov)
    logger.info("Deprecated governance — model_id=%s (was %s)", model_id, previous)
    return gov


def get_governance(model_id: str) -> Optional[Dict[str, Any]]:
    """Return the full governance record for a model, or None.

    Args:
        model_id: Model identifier.

    Returns:
        Full governance dict, or None if not found.
    """
    return _load_governance(model_id)


def get_event_log(model_id: str) -> List[Dict[str, Any]]:
    """Return the immutable governance event log for a model, oldest first.

    Args:
        model_id: Model identifier.

    Returns:
        List of immutable event dicts. Empty list if record not found.
    """
    gov = _load_governance(model_id)
    if gov is None:
        return []
    return gov.get("event_log", [])


def get_valid_transitions(model_id: str) -> List[str]:
    """Return the sorted list of valid target states from the current state.

    Args:
        model_id: Model identifier.

    Returns:
        Sorted list of valid target state strings.

    Raises:
        KeyError: If the governance record is not found.
    """
    gov = _load_governance_or_raise(model_id)
    current = gov["current_state"]
    return sorted(_VALID_TRANSITIONS.get(current, frozenset()))


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _refresh_model_card(model_id: str, gov: Dict[str, Any]) -> None:
    """Regenerate and update the model card embedded in the governance record.

    Uses lazy imports to avoid circular imports at module load time.
    All failures are silently swallowed — callers should guard with try/except.
    """
    from app.ml.model_card import generate_model_card      # noqa: PLC0415
    from app.ml.model_registry import get_model_by_id      # noqa: PLC0415
    from app.ml.model_lineage import get_lineage            # noqa: PLC0415

    meta = get_model_by_id(model_id) or {}
    lineage = get_lineage(model_id) or {}

    # Resolve champion status
    champion_status = "CHALLENGER"
    try:
        from app.ml.model_version_manager import get_champion  # noqa: PLC0415
        algorithm = meta.get("algorithm", "")
        dataset_id = meta.get("dataset_id", "")
        if algorithm and dataset_id:
            champ = get_champion(algorithm, dataset_id)
            if champ == model_id:
                champion_status = "CHAMPION"
    except Exception:
        pass

    gov["model_card"] = generate_model_card(
        model_metadata=meta,
        lineage=lineage,
        governance_state=gov["current_state"],
        champion_status=champion_status,
        readiness_report=gov.get("readiness_report") or {},
    )
