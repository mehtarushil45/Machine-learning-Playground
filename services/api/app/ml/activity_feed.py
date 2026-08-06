"""Activity Feed — immutable, append-only audit trail for workspace events.

Storage layout::
    uploads/activity/{org_id}/{workspace_id}/YYYY-MM.jsonl

Each line is one JSON event. Files are append-only and never modified.
Retrieval scans relevant month files and filters in-memory.

V7A improvement: every event carries a ``correlation_id`` so that an entire
ML pipeline run (dataset upload → training → model registration → deployment
→ monitoring → retraining) can be traced end-to-end.
"""

from __future__ import annotations

import json
import logging
import os
import threading
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

logger = logging.getLogger("apex_ml.activity_feed")

SCHEMA_VERSION = "7a.1.0"
_LOCK = threading.Lock()

# ── Event type constants ───────────────────────────────────────────────────────

class ActivityEventType:
    """Constants for all platform activity event types."""
    DATASET_UPLOADED      = "DATASET_UPLOADED"
    DATASET_DELETED       = "DATASET_DELETED"
    DATASET_VALIDATED     = "DATASET_VALIDATED"
    TRAINING_STARTED      = "TRAINING_STARTED"
    TRAINING_COMPLETED    = "TRAINING_COMPLETED"
    TRAINING_FAILED       = "TRAINING_FAILED"
    MODEL_REGISTERED      = "MODEL_REGISTERED"
    MODEL_PROMOTED        = "MODEL_PROMOTED"
    MODEL_DEPRECATED      = "MODEL_DEPRECATED"
    EXPERIMENT_CREATED    = "EXPERIMENT_CREATED"
    EXPERIMENT_COMPLETED  = "EXPERIMENT_COMPLETED"
    DEPLOYMENT_CREATED    = "DEPLOYMENT_CREATED"
    DEPLOYMENT_PROMOTED   = "DEPLOYMENT_PROMOTED"
    DEPLOYMENT_ROLLED_BACK = "DEPLOYMENT_ROLLED_BACK"
    DEPLOYMENT_ARCHIVED   = "DEPLOYMENT_ARCHIVED"
    DEPLOYMENT_SCALED     = "DEPLOYMENT_SCALED"
    MONITORING_CREATED    = "MONITORING_CREATED"
    MONITORING_STARTED    = "MONITORING_STARTED"
    ALERT_RAISED          = "ALERT_RAISED"
    ALERT_RESOLVED        = "ALERT_RESOLVED"
    RETRAINING_TRIGGERED  = "RETRAINING_TRIGGERED"
    RETRAINING_APPROVED   = "RETRAINING_APPROVED"
    RETRAINING_REJECTED   = "RETRAINING_REJECTED"
    MEMBER_INVITED        = "MEMBER_INVITED"
    MEMBER_JOINED         = "MEMBER_JOINED"
    MEMBER_REMOVED        = "MEMBER_REMOVED"
    MEMBER_SUSPENDED      = "MEMBER_SUSPENDED"
    WORKSPACE_CREATED     = "WORKSPACE_CREATED"
    WORKSPACE_ARCHIVED    = "WORKSPACE_ARCHIVED"
    SETTINGS_UPDATED      = "SETTINGS_UPDATED"
    API_KEY_CREATED       = "API_KEY_CREATED"
    API_KEY_REVOKED       = "API_KEY_REVOKED"


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _activity_root() -> str:
    return os.path.join("uploads", "activity")


def _month_file(org_id: str, workspace_id: str) -> str:
    month = datetime.now(timezone.utc).strftime("%Y-%m")
    return os.path.join(
        _activity_root(), org_id, workspace_id, f"{month}.jsonl"
    )


def _atomic_append(filepath: str, line: str) -> None:
    """Append *line* + newline to *filepath* atomically under a lock."""
    with _LOCK:
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        with open(filepath, "a", encoding="utf-8") as fh:
            fh.write(line + "\n")


# ── Public API ─────────────────────────────────────────────────────────────────

def log_event(
    event_type: str,
    actor_id: str,
    org_id: str,
    workspace_id: str,
    resource_type: str,
    resource_id: str,
    *,
    actor_display_name: str = "",
    resource_name: Optional[str] = None,
    action: str = "",
    metadata: Optional[dict] = None,
    correlation_id: Optional[str] = None,
) -> dict:
    """Append an immutable activity event to the workspace JSONL log.

    Args:
        event_type: One of the ``ActivityEventType`` constants.
        actor_id: User ID of the person/system that triggered the event.
        org_id: Organisation ID (used to partition storage).
        workspace_id: Workspace ID (used to partition storage).
        resource_type: e.g. ``"dataset"``, ``"model"``, ``"deployment"``.
        resource_id: The primary identifier of the affected resource.
        actor_display_name: Human-readable actor name for UI display.
        resource_name: Optional friendly resource name.
        action: Short action description (e.g. ``"uploaded"``).
        metadata: Arbitrary contextual data dict.
        correlation_id: Shared ID linking related events across pipeline steps.
            If not provided, a new UUID is generated.  Callers should pass the
            same correlation_id across all events in a single pipeline run.

    Returns:
        The event dict that was persisted.
    """
    event: dict[str, Any] = {
        "event_id": "act-" + uuid.uuid4().hex[:12],
        "event_type": event_type,
        "schema_version": SCHEMA_VERSION,
        "timestamp": _utc_now(),
        "correlation_id": correlation_id or str(uuid.uuid4()),
        "actor_id": actor_id,
        "actor_display_name": actor_display_name,
        "organisation_id": org_id,
        "workspace_id": workspace_id,
        "resource_type": resource_type,
        "resource_id": resource_id,
        "resource_name": resource_name,
        "action": action or event_type.lower().replace("_", " "),
        "metadata": metadata or {},
    }
    filepath = _month_file(org_id, workspace_id)
    _atomic_append(filepath, json.dumps(event, default=str))
    logger.debug(
        "Activity: %s by %s on %s/%s",
        event_type, actor_id, resource_type, resource_id,
    )
    return event


def log_event_nonblocking(
    event_type: str,
    actor_id: str,
    org_id: str,
    workspace_id: str,
    resource_type: str,
    resource_id: str,
    **kwargs: Any,
) -> None:
    """Non-blocking wrapper: calls log_event in a daemon thread.

    Use this from existing V1-6B routers where activity logging must never
    add latency to the primary response path.

    Args: Same as log_event.  Never raises.
    """
    import threading

    def _run() -> None:
        try:
            log_event(
                event_type, actor_id, org_id, workspace_id,
                resource_type, resource_id, **kwargs,
            )
        except Exception as exc:
            logger.debug("activity feed error (non-critical): %s", exc)

    t = threading.Thread(target=_run, daemon=True, name=f"act-{event_type[:10]}")
    t.start()


def get_activity_feed(
    org_id: str,
    workspace_id: str,
    *,
    event_type_filter: Optional[str] = None,
    resource_type_filter: Optional[str] = None,
    resource_id_filter: Optional[str] = None,
    actor_id_filter: Optional[str] = None,
    correlation_id_filter: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    """Return paginated activity events for a workspace, newest first.

    Scans the last 3 months of JSONL files. For older history, use
    ``get_resource_history``.

    Args:
        org_id: Organisation ID.
        workspace_id: Workspace ID.
        event_type_filter: If set, only return events of this type.
        resource_type_filter: If set, filter by resource type.
        resource_id_filter: If set, filter by specific resource ID.
        actor_id_filter: If set, filter by actor.
        correlation_id_filter: If set, return all events sharing this correlation_id.
        limit: Maximum events to return.
        offset: Skip this many events (for pagination).

    Returns:
        List of event dicts ordered newest-first.
    """
    from datetime import timedelta

    events: list[dict] = []
    now = datetime.now(timezone.utc)

    # Scan last 3 months
    months_to_check = [
        (now - timedelta(days=30 * i)).strftime("%Y-%m")
        for i in range(3)
    ]

    for month in months_to_check:
        filepath = os.path.join(
            _activity_root(), org_id, workspace_id, f"{month}.jsonl"
        )
        if not os.path.exists(filepath):
            continue
        try:
            with open(filepath, "r", encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        evt = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    # Apply filters
                    if event_type_filter and evt.get("event_type") != event_type_filter:
                        continue
                    if resource_type_filter and evt.get("resource_type") != resource_type_filter:
                        continue
                    if resource_id_filter and evt.get("resource_id") != resource_id_filter:
                        continue
                    if actor_id_filter and evt.get("actor_id") != actor_id_filter:
                        continue
                    if correlation_id_filter and evt.get("correlation_id") != correlation_id_filter:
                        continue
                    events.append(evt)
        except Exception as exc:
            logger.warning("Error reading activity file %s: %s", filepath, exc)

    # Sort newest-first and paginate
    events.sort(key=lambda e: e.get("timestamp", ""), reverse=True)
    return events[offset: offset + limit]


def get_resource_history(
    resource_type: str,
    resource_id: str,
    org_id: str,
    workspace_id: str,
    limit: int = 100,
) -> list[dict]:
    """Return all activity events for a specific resource, newest first.

    Args:
        resource_type: Type of the resource (e.g. ``"model"``).
        resource_id: ID of the resource.
        org_id: Organisation ID.
        workspace_id: Workspace ID.
        limit: Maximum events to return.

    Returns:
        List of event dicts for this resource.
    """
    return get_activity_feed(
        org_id,
        workspace_id,
        resource_type_filter=resource_type,
        resource_id_filter=resource_id,
        limit=limit,
    )


def get_pipeline_trace(correlation_id: str, org_id: str, workspace_id: str) -> list[dict]:
    """Return all events sharing a correlation_id (a complete pipeline trace).

    Args:
        correlation_id: The shared correlation ID for the pipeline run.
        org_id: Organisation ID.
        workspace_id: Workspace ID.

    Returns:
        List of event dicts, oldest-first (chronological pipeline order).
    """
    events = get_activity_feed(
        org_id,
        workspace_id,
        correlation_id_filter=correlation_id,
        limit=500,
    )
    # Return in chronological order for pipeline traces
    events.sort(key=lambda e: e.get("timestamp", ""))
    return events
