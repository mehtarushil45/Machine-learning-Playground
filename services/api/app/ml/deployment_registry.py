"""Deployment Registry — Version 6A.

Filesystem-based persistence for all V6A enterprise deployment records.
Mirrors the pattern established by ``model_registry.py`` (V5A) and
``model_governance.py`` (V5B): atomic writes, isolated storage root,
JSON Lines-compatible index.

Storage layout
--------------
::

    uploads/deployments/v6a/
      index.json                  ← all deployment summaries (for listing)
      active.json                 ← set of deployment_ids currently ACTIVE
      <deployment_id>/
        metadata.json             ← full DeploymentRecord
        state_history.json        ← immutable event log (array)
      endpoints/
        index.json                ← all endpoint summaries (for listing)
        <endpoint_id>/
          metadata.json           ← full EndpointRecord

Isolation
---------
The V6A root is ``uploads/deployments/v6a/`` — fully isolated from the
Phase 5 ``uploads/deployments/`` root.  The two stores never share files.

Atomic writes
-------------
All writes use the ``tmp → os.replace()`` pattern to prevent partial reads.

Public API
----------
``register_v6a_deployment(record)``
``update_deployment_state(deployment_id, new_state, event)``
``get_v6a_deployment(deployment_id)``
``list_v6a_deployments(status, strategy, model_id, limit, offset)``
``list_active_v6a()``
``get_state_history(deployment_id)``
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from threading import Lock
from typing import Any, Dict, List, Optional

logger = logging.getLogger("apex_ml.deployment_registry")

# ---------------------------------------------------------------------------
# Storage roots
# ---------------------------------------------------------------------------

_V6A_ROOT = os.path.abspath(
    os.path.join(".", "uploads", "deployments", "v6a")
)
_INDEX_PATH    = os.path.join(_V6A_ROOT, "index.json")
_ACTIVE_PATH   = os.path.join(_V6A_ROOT, "active.json")
_ENDPOINTS_DIR = os.path.join(_V6A_ROOT, "endpoints")

_REGISTRY_LOCK = Lock()


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _ensure_roots() -> None:
    os.makedirs(_V6A_ROOT, exist_ok=True)
    os.makedirs(_ENDPOINTS_DIR, exist_ok=True)


def _atomic_write(path: str, data: Any) -> None:
    """Write *data* as JSON to *path* atomically (tmp → replace)."""
    tmp = path + ".tmp"
    os.makedirs(os.path.dirname(path), exist_ok=True)
    try:
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=2, default=str)
        os.replace(tmp, path)
    except Exception as exc:
        logger.error("Atomic write failed for %s: %s", path, exc)
        raise


def _read_json(path: str, default: Any = None) -> Any:
    """Read JSON from *path*, returning *default* if the file is absent."""
    if not os.path.exists(path):
        return default
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except Exception as exc:
        logger.error("JSON read failed for %s: %s", path, exc)
        return default


def _deployment_dir(deployment_id: str) -> str:
    return os.path.join(_V6A_ROOT, deployment_id)


def _metadata_path(deployment_id: str) -> str:
    return os.path.join(_deployment_dir(deployment_id), "metadata.json")


def _history_path(deployment_id: str) -> str:
    return os.path.join(_deployment_dir(deployment_id), "state_history.json")


# ---------------------------------------------------------------------------
# Deployment CRUD
# ---------------------------------------------------------------------------

def register_v6a_deployment(record: Dict[str, Any]) -> None:
    """Persist a new V6A deployment record.

    Creates the per-deployment directory, writes ``metadata.json``,
    initialises ``state_history.json`` from ``record["initial_event"]``,
    and appends a summary to ``index.json``.

    Args:
        record: Full deployment record dict.  Must contain at minimum:
                ``deployment_id``, ``deployment_state``, ``created_at``.
                May contain an ``"initial_event"`` key which is removed
                from ``metadata.json`` and written to ``state_history.json``.

    Raises:
        ValueError: If a deployment with the same ID already exists.
    """
    _ensure_roots()
    deployment_id: str = record["deployment_id"]

    with _REGISTRY_LOCK:
        meta_path = _metadata_path(deployment_id)
        if os.path.exists(meta_path):
            raise ValueError(
                f"V6A deployment '{deployment_id}' already exists."
            )

        # Split initial event out of metadata
        initial_event = record.pop("initial_event", None)

        os.makedirs(_deployment_dir(deployment_id), exist_ok=True)
        _atomic_write(meta_path, record)

        history: List[Dict[str, Any]] = []
        if initial_event:
            history.append(initial_event)
        _atomic_write(_history_path(deployment_id), history)

        # Append summary to index
        index: Dict[str, Any] = _read_json(_INDEX_PATH, default={})
        index[deployment_id] = _summary(record)
        _atomic_write(_INDEX_PATH, index)

    logger.info("Registered V6A deployment %s.", deployment_id)


def update_deployment_state(
    deployment_id: str,
    new_state: str,
    event: Dict[str, Any],
) -> Dict[str, Any]:
    """Transition a deployment to *new_state* and append *event* to history.

    Updates ``metadata.json``, appends to ``state_history.json``,
    updates ``index.json`` summary, and maintains ``active.json``.

    Args:
        deployment_id: Target deployment.
        new_state:     The new state string (already validated by state machine).
        event:         Structured event dict from ``make_deployment_event()``.

    Returns:
        Updated full metadata dict.

    Raises:
        KeyError: If the deployment does not exist.
    """
    _ensure_roots()
    with _REGISTRY_LOCK:
        meta_path = _metadata_path(deployment_id)
        if not os.path.exists(meta_path):
            raise KeyError(
                f"V6A deployment '{deployment_id}' not found in registry."
            )

        record: Dict[str, Any] = _read_json(meta_path)
        record["deployment_state"] = new_state
        record["updated_at"] = datetime.now(timezone.utc).isoformat()
        _atomic_write(meta_path, record)

        # Append event to history
        history: List[Dict[str, Any]] = _read_json(_history_path(deployment_id), default=[])
        history.append(event)
        _atomic_write(_history_path(deployment_id), history)

        # Update index summary
        index: Dict[str, Any] = _read_json(_INDEX_PATH, default={})
        index[deployment_id] = _summary(record)
        _atomic_write(_INDEX_PATH, index)

        # Maintain active.json
        active: List[str] = _read_json(_ACTIVE_PATH, default=[])
        if new_state == "ACTIVE" and deployment_id not in active:
            active.append(deployment_id)
        elif new_state != "ACTIVE" and deployment_id in active:
            active.remove(deployment_id)
        _atomic_write(_ACTIVE_PATH, active)

        return record


def get_v6a_deployment(deployment_id: str) -> Optional[Dict[str, Any]]:
    """Return the full V6A deployment record, or None if not found.

    Args:
        deployment_id: V6A deployment ID.

    Returns:
        Full metadata dict, or None.
    """
    _ensure_roots()
    meta_path = _metadata_path(deployment_id)
    if not os.path.exists(meta_path):
        return None
    return _read_json(meta_path)


def list_v6a_deployments(
    status: Optional[str] = None,
    strategy: Optional[str] = None,
    model_id: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> List[Dict[str, Any]]:
    """List V6A deployment summaries with optional filtering.

    Args:
        status:    Filter by ``deployment_state`` (case-insensitive).
        strategy:  Filter by ``deployment_strategy``.
        model_id:  Filter by ``model_id``.
        limit:     Maximum records to return (default 50).
        offset:    Pagination offset (default 0).

    Returns:
        List of deployment summary dicts, sorted by ``created_at`` descending.
    """
    _ensure_roots()
    index: Dict[str, Any] = _read_json(_INDEX_PATH, default={})
    records = list(index.values())

    if status:
        records = [r for r in records if r.get("deployment_state", "").upper() == status.upper()]
    if strategy:
        records = [r for r in records if r.get("deployment_strategy", "").upper() == strategy.upper()]
    if model_id:
        records = [r for r in records if r.get("model_id") == model_id]

    records.sort(key=lambda r: r.get("created_at", ""), reverse=True)
    return records[offset: offset + limit]


def list_active_v6a() -> List[str]:
    """Return the list of currently ACTIVE V6A deployment IDs.

    O(1) lookup from ``active.json``.

    Returns:
        List of deployment_id strings.
    """
    _ensure_roots()
    return _read_json(_ACTIVE_PATH, default=[])


def get_state_history(deployment_id: str) -> List[Dict[str, Any]]:
    """Return the immutable state event log for a deployment.

    Args:
        deployment_id: V6A deployment ID.

    Returns:
        List of event dicts, in chronological order.

    Raises:
        KeyError: If the deployment does not exist.
    """
    _ensure_roots()
    hist_path = _history_path(deployment_id)
    if not os.path.exists(hist_path):
        if not os.path.exists(_metadata_path(deployment_id)):
            raise KeyError(
                f"V6A deployment '{deployment_id}' not found."
            )
        return []
    return _read_json(hist_path, default=[])


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _summary(record: Dict[str, Any]) -> Dict[str, Any]:
    """Extract lightweight index summary from a full record."""
    return {
        "deployment_id":       record.get("deployment_id"),
        "deployment_name":     record.get("deployment_name"),
        "deployment_version":  record.get("deployment_version"),
        "deployment_state":    record.get("deployment_state"),
        "deployment_strategy": record.get("deployment_strategy"),
        "model_id":            record.get("model_id"),
        "model_version":       record.get("model_version"),
        "model_family":        record.get("model_family"),
        "endpoint_name":       record.get("endpoint_name"),
        "created_by":          record.get("created_by"),
        "created_at":          record.get("created_at"),
        "updated_at":          record.get("updated_at"),
    }
