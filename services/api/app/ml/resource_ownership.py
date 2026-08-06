"""Resource Ownership Overlay — additive ownership metadata for V1-6B resources.

This module manages sidecar ownership records alongside existing V1-6B resource
files WITHOUT touching the core data files.

Storage pattern::
    uploads/ownership/{resource_type}/{resource_id}_ownership.json

V7A improvements included:
    - last_accessed: timestamp of last read access
    - access_count: number of times the resource was accessed
    - favorite: bool flag for user bookmarks
    - labels: list[str] for structured classification (Dataset Catalog)
    - tags: list[str] for freeform tagging
    - correlation_id: pipeline correlation for traceability

Backward compatibility:
    Resources without ownership records return ``None`` gracefully.
    No existing V1-6B file is modified.
"""

from __future__ import annotations

import json
import logging
import os
import threading
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

logger = logging.getLogger("apex_ml.resource_ownership")

SCHEMA_VERSION = "7a.1.0"
_LOCK = threading.Lock()

VALID_RESOURCE_TYPES = frozenset({
    "dataset", "model", "deployment", "monitoring",
    "experiment", "pipeline", "report", "workspace",
})

VALID_VISIBILITY = frozenset({"PRIVATE", "WORKSPACE", "ORG", "PUBLIC"})


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ownership_root() -> str:
    return os.path.join("uploads", "ownership")


def _ownership_path(resource_type: str, resource_id: str) -> str:
    return os.path.join(
        _ownership_root(), resource_type, f"{resource_id}_ownership.json"
    )


def _read_ownership(path: str) -> Optional[dict]:
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except FileNotFoundError:
        return None
    except Exception as exc:
        logger.warning("Error reading ownership file %s: %s", path, exc)
        return None


def _write_ownership(path: str, record: dict) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(record, fh, indent=2, default=str)
    os.replace(tmp, path)


# ── Public API ─────────────────────────────────────────────────────────────────

def claim_resource(
    resource_type: str,
    resource_id: str,
    org_id: str,
    workspace_id: str,
    created_by: str,
    *,
    created_by_display_name: str = "",
    visibility: str = "WORKSPACE",
    tags: Optional[list[str]] = None,
    labels: Optional[list[str]] = None,
    correlation_id: Optional[str] = None,
) -> dict:
    """Create an ownership record for a resource.

    If a record already exists, it is returned unchanged (idempotent).

    Args:
        resource_type: One of the VALID_RESOURCE_TYPES.
        resource_id: Primary identifier of the resource.
        org_id: Organisation that owns the resource.
        workspace_id: Workspace the resource belongs to.
        created_by: User ID of the creator.
        created_by_display_name: Human-readable creator name.
        visibility: One of PRIVATE | WORKSPACE | ORG | PUBLIC.
        tags: Freeform string tags.
        labels: Structured classification labels (for Dataset Catalog).
        correlation_id: Pipeline correlation ID.

    Returns:
        The ownership record dict.
    """
    if resource_type not in VALID_RESOURCE_TYPES:
        raise ValueError(f"Invalid resource_type: {resource_type!r}")
    if visibility not in VALID_VISIBILITY:
        raise ValueError(f"Invalid visibility: {visibility!r}")

    path = _ownership_path(resource_type, resource_id)
    with _LOCK:
        existing = _read_ownership(path)
        if existing:
            return existing

        record: dict[str, Any] = {
            "ownership_id": "own-" + uuid.uuid4().hex[:8],
            "schema_version": SCHEMA_VERSION,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "organisation_id": org_id,
            "workspace_id": workspace_id,
            "created_by": created_by,
            "created_by_display_name": created_by_display_name,
            "updated_by": None,
            "updated_by_display_name": None,
            "visibility": visibility,
            "tags": tags or [],
            "labels": labels or [],
            "favorite": False,
            "access_count": 0,
            "last_accessed": None,
            "correlation_id": correlation_id,
            "created_at": _utc_now(),
            "updated_at": _utc_now(),
        }
        _write_ownership(path, record)
        return record


def get_ownership(resource_type: str, resource_id: str) -> Optional[dict]:
    """Return the ownership record for a resource, or None if unclaimed.

    Never raises.
    """
    path = _ownership_path(resource_type, resource_id)
    return _read_ownership(path)


def update_ownership(
    resource_type: str,
    resource_id: str,
    patch: dict,
    updated_by: str,
    updated_by_display_name: str = "",
) -> dict:
    """Merge *patch* into the ownership record.

    Protected fields (resource_id, created_by, created_at) are ignored in patch.

    Args:
        resource_type: Resource type.
        resource_id: Resource ID.
        patch: Dict of fields to update.
        updated_by: User ID of the updater.
        updated_by_display_name: Human-readable updater name.

    Returns:
        Updated ownership record.

    Raises:
        KeyError: If no ownership record exists.
    """
    path = _ownership_path(resource_type, resource_id)
    with _LOCK:
        record = _read_ownership(path)
        if record is None:
            raise KeyError(f"No ownership record for {resource_type}/{resource_id}")

        # Protect immutable fields
        protected = {"ownership_id", "resource_type", "resource_id", "created_by", "created_at", "schema_version"}
        for key, value in patch.items():
            if key not in protected:
                record[key] = value

        record["updated_by"] = updated_by
        record["updated_by_display_name"] = updated_by_display_name
        record["updated_at"] = _utc_now()
        _write_ownership(path, record)
        return record


def record_access(
    resource_type: str,
    resource_id: str,
) -> None:
    """Increment access_count and update last_accessed. Non-blocking, never raises."""
    def _run() -> None:
        try:
            path = _ownership_path(resource_type, resource_id)
            with _LOCK:
                record = _read_ownership(path)
                if record is None:
                    return
                record["access_count"] = record.get("access_count", 0) + 1
                record["last_accessed"] = _utc_now()
                _write_ownership(path, record)
        except Exception as exc:
            logger.debug("record_access error: %s", exc)

    import threading
    threading.Thread(target=_run, daemon=True).start()


def set_favorite(
    resource_type: str,
    resource_id: str,
    favorite: bool,
    updated_by: str,
) -> dict:
    """Set or unset the favorite flag on a resource ownership record."""
    return update_ownership(
        resource_type, resource_id,
        {"favorite": favorite},
        updated_by,
    )


def tag_resource(
    resource_type: str,
    resource_id: str,
    tags: list[str],
    updated_by: str,
) -> dict:
    """Merge *tags* into the resource's tag list (no duplicates, preserves existing)."""
    path = _ownership_path(resource_type, resource_id)
    with _LOCK:
        record = _read_ownership(path)
        if record is None:
            raise KeyError(f"No ownership record for {resource_type}/{resource_id}")
        existing_tags: list[str] = record.get("tags", [])
        merged = list(dict.fromkeys(existing_tags + [t.strip() for t in tags if t.strip()]))
        record["tags"] = merged
        record["updated_by"] = updated_by
        record["updated_at"] = _utc_now()
        _write_ownership(path, record)
        return record


def set_labels(
    resource_type: str,
    resource_id: str,
    labels: list[str],
    updated_by: str,
) -> dict:
    """Set the structured labels list (replaces existing labels).

    Labels are for structured classification (e.g. Dataset Catalog taxonomy).
    Tags are freeform; labels are controlled vocabulary.
    """
    return update_ownership(
        resource_type, resource_id,
        {"labels": [lbl.strip() for lbl in labels if lbl.strip()]},
        updated_by,
    )


def transfer_ownership(
    resource_type: str,
    resource_id: str,
    new_workspace_id: str,
    transferred_by: str,
    transferred_by_display_name: str = "",
) -> dict:
    """Move a resource to a different workspace."""
    return update_ownership(
        resource_type, resource_id,
        {"workspace_id": new_workspace_id},
        transferred_by,
        transferred_by_display_name,
    )


def list_workspace_resources(
    workspace_id: str,
    resource_type: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
) -> list[dict]:
    """List all ownership records for a workspace.

    Args:
        workspace_id: The workspace to list resources for.
        resource_type: If provided, only return this resource type.
        limit: Max records to return.
        offset: Skip this many records (pagination).

    Returns:
        List of ownership record dicts.
    """
    results: list[dict] = []
    root = _ownership_root()
    if not os.path.isdir(root):
        return []

    types_to_scan = [resource_type] if resource_type else list(VALID_RESOURCE_TYPES)

    for rtype in types_to_scan:
        type_dir = os.path.join(root, rtype)
        if not os.path.isdir(type_dir):
            continue
        for fname in os.listdir(type_dir):
            if not fname.endswith("_ownership.json"):
                continue
            try:
                rec = _read_ownership(os.path.join(type_dir, fname))
                if rec and rec.get("workspace_id") == workspace_id:
                    results.append(rec)
            except Exception:
                pass

    # Sort by created_at descending
    results.sort(key=lambda r: r.get("created_at", ""), reverse=True)
    return results[offset: offset + limit]
