"""Endpoint Manager — Version 6A.

Manages V6A enterprise endpoint metadata records.
An endpoint is the logical service entry point that a V6A deployment exposes.

Pure metadata management — no actual HTTP server binding.
The Phase 5 inference path (``/api/v1/deployments/{id}/predict``) continues
to serve live traffic; V6A endpoints are governance + discovery metadata.

Storage layout
--------------
::

    uploads/deployments/v6a/endpoints/
      index.json               ← all endpoint summaries (for listing)
      <endpoint_id>/
        metadata.json          ← full EndpointRecord

Endpoint metadata schema
------------------------
::

    {
      "endpoint_id":      "<uuid4>",
      "endpoint_name":    "fraud-detection-v1",
      "endpoint_version": "v1.2.0",
      "deployment_id":    "<v6a_deployment_id>",
      "model_id":         "<model_id>",
      "model_family":     "<family_key>",
      "route":            "/api/v1/predict/fraud-detection",
      "protocol":         "HTTP" | "HTTPS" | "GRPC",
      "authentication":   "NONE" | "API_KEY" | "JWT" | "MTLS",
      "status":           "PENDING" | "ACTIVE" | "INACTIVE" | "DEPRECATED",
      "created_at":       "<ISO>",
      "updated_at":       "<ISO>",
      "created_by":       "system | <user_id>",
      "tags":             list[str],
      "description":      "<string>"
    }

Valid status values
-------------------
``PENDING``    Endpoint registered; deployment not yet ACTIVE.
``ACTIVE``     Deployment is ACTIVE and endpoint is live.
``INACTIVE``   Deployment is ROLLED_BACK, FAILED, or UPDATING.
``DEPRECATED`` Endpoint permanently superseded.

Public API
----------
``register_endpoint(record)``                → endpoint_id str
``update_endpoint_status(endpoint_id, status)`` → updated record dict
``get_endpoint(endpoint_id)``                → dict | None
``get_endpoint_by_deployment(deployment_id)`` → dict | None
``list_endpoints(status, model_family, limit)`` → list[dict]
``deprecate_endpoint(endpoint_id)``          → updated record dict
"""

from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import datetime, timezone
from threading import Lock
from typing import Any, Dict, List, Optional

logger = logging.getLogger("apex_ml.endpoint_manager")

# ---------------------------------------------------------------------------
# Storage paths (re-uses V6A root)
# ---------------------------------------------------------------------------

_V6A_ROOT = os.path.abspath(
    os.path.join(".", "uploads", "deployments", "v6a")
)
_ENDPOINTS_DIR   = os.path.join(_V6A_ROOT, "endpoints")
_ENDPOINTS_INDEX = os.path.join(_ENDPOINTS_DIR, "index.json")

_ENDPOINT_LOCK = Lock()

VALID_STATUSES: frozenset = frozenset({"PENDING", "ACTIVE", "INACTIVE", "DEPRECATED"})
VALID_PROTOCOLS: frozenset = frozenset({"HTTP", "HTTPS", "GRPC"})
VALID_AUTH: frozenset = frozenset({"NONE", "API_KEY", "JWT", "MTLS"})


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _ensure_roots() -> None:
    os.makedirs(_ENDPOINTS_DIR, exist_ok=True)


def _atomic_write(path: str, data: Any) -> None:
    tmp = path + ".tmp"
    os.makedirs(os.path.dirname(path), exist_ok=True)
    try:
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=2, default=str)
        os.replace(tmp, path)
    except Exception as exc:
        logger.error("Endpoint atomic write failed for %s: %s", path, exc)
        raise


def _read_json(path: str, default: Any = None) -> Any:
    if not os.path.exists(path):
        return default
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except Exception as exc:
        logger.error("Endpoint JSON read failed for %s: %s", path, exc)
        return default


def _endpoint_dir(endpoint_id: str) -> str:
    return os.path.join(_ENDPOINTS_DIR, endpoint_id)


def _metadata_path(endpoint_id: str) -> str:
    return os.path.join(_endpoint_dir(endpoint_id), "metadata.json")


def _summary(record: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "endpoint_id":      record.get("endpoint_id"),
        "endpoint_name":    record.get("endpoint_name"),
        "endpoint_version": record.get("endpoint_version"),
        "deployment_id":    record.get("deployment_id"),
        "model_id":         record.get("model_id"),
        "model_family":     record.get("model_family"),
        "route":            record.get("route"),
        "protocol":         record.get("protocol"),
        "authentication":   record.get("authentication"),
        "status":           record.get("status"),
        "created_at":       record.get("created_at"),
        "updated_at":       record.get("updated_at"),
        "created_by":       record.get("created_by"),
    }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def register_endpoint(record: Dict[str, Any]) -> str:
    """Register a new V6A endpoint record.

    If ``endpoint_id`` is not present in *record*, a new UUID4 is generated.
    If ``status`` is not set, defaults to ``PENDING``.

    Args:
        record: Endpoint metadata dict.  Must contain at minimum:
                ``deployment_id``, ``model_id``, ``endpoint_name``.

    Returns:
        The assigned ``endpoint_id``.

    Raises:
        ValueError: If ``status``, ``protocol``, or ``authentication`` values
                    are not in the allowed sets, or if the endpoint_id already exists.
    """
    _ensure_roots()
    now = datetime.now(timezone.utc).isoformat()

    if not record.get("endpoint_id"):
        record["endpoint_id"] = f"ep-{uuid.uuid4().hex[:12]}"

    endpoint_id: str = record["endpoint_id"]

    record.setdefault("endpoint_version", "v1.0.0")
    record.setdefault("protocol",         "HTTP")
    record.setdefault("authentication",   "API_KEY")
    record.setdefault("status",           "PENDING")
    record.setdefault("tags",             [])
    record.setdefault("description",      "")
    record.setdefault("created_by",       "system")
    record.setdefault("created_at",       now)
    record.setdefault("updated_at",       now)

    # Validate enum values
    if record["status"].upper() not in VALID_STATUSES:
        raise ValueError(
            f"Invalid endpoint status '{record['status']}'. "
            f"Must be one of: {sorted(VALID_STATUSES)}"
        )
    if record["protocol"].upper() not in VALID_PROTOCOLS:
        raise ValueError(
            f"Invalid protocol '{record['protocol']}'. "
            f"Must be one of: {sorted(VALID_PROTOCOLS)}"
        )
    if record["authentication"].upper() not in VALID_AUTH:
        raise ValueError(
            f"Invalid authentication '{record['authentication']}'. "
            f"Must be one of: {sorted(VALID_AUTH)}"
        )

    with _ENDPOINT_LOCK:
        meta_path = _metadata_path(endpoint_id)
        if os.path.exists(meta_path):
            raise ValueError(
                f"Endpoint '{endpoint_id}' already exists."
            )
        os.makedirs(_endpoint_dir(endpoint_id), exist_ok=True)
        _atomic_write(meta_path, record)

        # Update index
        index: Dict[str, Any] = _read_json(_ENDPOINTS_INDEX, default={})
        index[endpoint_id] = _summary(record)
        _atomic_write(_ENDPOINTS_INDEX, index)

    logger.info(
        "Registered endpoint %s (deployment=%s, model=%s).",
        endpoint_id, record.get("deployment_id"), record.get("model_id"),
    )
    return endpoint_id


def update_endpoint_status(
    endpoint_id: str,
    status: str,
) -> Dict[str, Any]:
    """Update the status of a V6A endpoint.

    Args:
        endpoint_id: Endpoint to update.
        status:      New status — one of PENDING, ACTIVE, INACTIVE, DEPRECATED.

    Returns:
        Updated endpoint record dict.

    Raises:
        KeyError:   If the endpoint does not exist.
        ValueError: If *status* is not a valid endpoint status.
    """
    status_upper = status.strip().upper()
    if status_upper not in VALID_STATUSES:
        raise ValueError(
            f"Invalid status '{status}'. Must be one of: {sorted(VALID_STATUSES)}"
        )

    _ensure_roots()
    with _ENDPOINT_LOCK:
        meta_path = _metadata_path(endpoint_id)
        if not os.path.exists(meta_path):
            raise KeyError(f"Endpoint '{endpoint_id}' not found.")

        record: Dict[str, Any] = _read_json(meta_path)
        record["status"] = status_upper
        record["updated_at"] = datetime.now(timezone.utc).isoformat()
        _atomic_write(meta_path, record)

        # Update index
        index: Dict[str, Any] = _read_json(_ENDPOINTS_INDEX, default={})
        index[endpoint_id] = _summary(record)
        _atomic_write(_ENDPOINTS_INDEX, index)

    logger.info("Endpoint %s status → %s.", endpoint_id, status_upper)
    return record


def get_endpoint(endpoint_id: str) -> Optional[Dict[str, Any]]:
    """Return the full endpoint record, or None if not found.

    Args:
        endpoint_id: Endpoint identifier.

    Returns:
        Full endpoint metadata dict, or None.
    """
    _ensure_roots()
    meta_path = _metadata_path(endpoint_id)
    if not os.path.exists(meta_path):
        return None
    return _read_json(meta_path)


def get_endpoint_by_deployment(deployment_id: str) -> Optional[Dict[str, Any]]:
    """Return the endpoint record for a specific deployment, or None.

    Performs a linear scan of the index (O(n)).  Suitable for O(10s) of
    endpoints per deployment; a secondary index can be added if scale demands.

    Args:
        deployment_id: V6A deployment ID.

    Returns:
        Matching endpoint record dict, or None.
    """
    _ensure_roots()
    index: Dict[str, Any] = _read_json(_ENDPOINTS_INDEX, default={})
    for summary in index.values():
        if summary.get("deployment_id") == deployment_id:
            ep_id = summary.get("endpoint_id")
            if ep_id:
                return get_endpoint(ep_id)
    return None


def list_endpoints(
    status: Optional[str] = None,
    model_family: Optional[str] = None,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    """List V6A endpoint summaries with optional filtering.

    Args:
        status:       Filter by status (case-insensitive).
        model_family: Filter by model_family key.
        limit:        Maximum records to return.

    Returns:
        List of endpoint summary dicts, sorted by ``created_at`` descending.
    """
    _ensure_roots()
    index: Dict[str, Any] = _read_json(_ENDPOINTS_INDEX, default={})
    records = list(index.values())

    if status:
        records = [r for r in records if r.get("status", "").upper() == status.upper()]
    if model_family:
        records = [r for r in records if r.get("model_family") == model_family]

    records.sort(key=lambda r: r.get("created_at", ""), reverse=True)
    return records[:limit]


def deprecate_endpoint(endpoint_id: str) -> Dict[str, Any]:
    """Permanently mark an endpoint as DEPRECATED.

    A DEPRECATED endpoint cannot be reactivated.

    Args:
        endpoint_id: Endpoint to deprecate.

    Returns:
        Updated endpoint record dict.

    Raises:
        KeyError: If the endpoint does not exist.
    """
    return update_endpoint_status(endpoint_id, "DEPRECATED")
