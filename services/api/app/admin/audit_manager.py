"""Audit Manager — V7B.

Immutable, append-only event logging with JSON/CSV export capabilities.
Multi-month log file support added in V7B.
"""

from __future__ import annotations

import csv
import json
import os
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from app.admin._storage import AUDIT_DIR, append_locked, ensure_dir, get_lock
from app.schemas.admin import AuditEvent, AuditLogResponse


def _log_file(month_str: Optional[str] = None) -> str:
    """Return the JSONL path for the given month (default: current)."""
    ensure_dir(AUDIT_DIR)
    if month_str is None:
        month_str = datetime.now(timezone.utc).strftime("%Y-%m")
    return os.path.join(AUDIT_DIR, f"audit_{month_str}.jsonl")


def log_audit_event(
    actor: str,
    action: str,
    resource_type: str,
    result: str,
    resource_id: Optional[str] = None,
    workspace: Optional[str] = None,
    organisation: Optional[str] = None,
    ip: Optional[str] = None,
    user_agent: Optional[str] = None,
    correlation_id: Optional[str] = None,
    reason: Optional[str] = None,
) -> str:
    """Append an immutable audit event to the current month's log file."""
    event = AuditEvent(
        event_id=str(uuid.uuid4()),
        timestamp=datetime.now(timezone.utc),
        actor=actor,
        action=action,
        resource_type=resource_type,
        result=result,
        resource_id=resource_id,
        workspace=workspace,
        organisation=organisation,
        ip=ip,
        user_agent=user_agent,
        correlation_id=correlation_id,
        reason=reason,
    )
    append_locked(_log_file(), event.model_dump_json(), "audit")
    return event.event_id


def get_audit_logs(
    limit: int = 100,
    offset: int = 0,
    actor: Optional[str] = None,
    action: Optional[str] = None,
    result: Optional[str] = None,
    resource_type: Optional[str] = None,
    organisation: Optional[str] = None,
    workspace: Optional[str] = None,
) -> AuditLogResponse:
    """Return paginated, optionally filtered audit events (newest first).
    
    Reads the current month's log. Supports actor/action/result/resource_type filtering.
    """
    log_path = _log_file()
    events: List[AuditEvent] = []
    if os.path.exists(log_path):
        lock = get_lock("audit")
        with lock:
            with open(log_path, "r", encoding="utf-8") as f:
                for line in f:
                    if line.strip():
                        try:
                            events.append(AuditEvent.model_validate_json(line))
                        except Exception:
                            pass

    # Apply filters
    if actor:
        events = [e for e in events if e.actor == actor]
    if action:
        events = [e for e in events if e.action == action]
    if result:
        events = [e for e in events if e.result == result]
    if resource_type:
        events = [e for e in events if e.resource_type == resource_type]
    if organisation:
        events = [e for e in events if e.organisation == organisation]
    if workspace:
        events = [e for e in events if e.workspace == workspace]

    events.reverse()  # Newest first
    total = len(events)
    return AuditLogResponse(events=events[offset: offset + limit], total=total)


def export_audit_logs_csv(month_str: Optional[str] = None) -> str:
    """Generate a CSV export of the specified month's audit log.
    
    Returns the CSV file path, or empty string if no events exist.
    """
    log_path = _log_file(month_str)
    csv_path = log_path.replace(".jsonl", ".csv")

    raw_events: list[dict] = []
    if os.path.exists(log_path):
        lock = get_lock("audit")
        with lock:
            with open(log_path, "r", encoding="utf-8") as f:
                for line in f:
                    if line.strip():
                        try:
                            raw_events.append(json.loads(line))
                        except Exception:
                            pass
            if not raw_events:
                return ""
            with open(csv_path, "w", encoding="utf-8", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=list(raw_events[0].keys()))
                writer.writeheader()
                writer.writerows(raw_events)

    return csv_path if raw_events else ""
