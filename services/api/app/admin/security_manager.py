"""Security Manager — V7B.

Tracks security events: login failures, suspicious IPs, token revocations,
API key misuse, and permission failures. Supports listing + summary.
"""

from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.admin._storage import SECURITY_DIR, append_locked, ensure_dir, get_lock
from app.schemas.admin import SecurityEvent, SecuritySummary


def _log_file() -> str:
    ensure_dir(SECURITY_DIR)
    return os.path.join(SECURITY_DIR, "security_events.jsonl")


def log_security_event(
    event_type: str,
    ip_address: str,
    severity: str,
    details: Dict[str, Any],
    user_id: Optional[str] = None,
) -> str:
    """Append a security event to the immutable log. Returns event_id."""
    event = SecurityEvent(
        event_id=str(uuid.uuid4()),
        timestamp=datetime.now(timezone.utc),
        event_type=event_type,
        ip_address=ip_address,
        severity=severity,
        details=details,
        user_id=user_id,
    )
    append_locked(_log_file(), event.model_dump_json(), "security")
    return event.event_id


def get_security_events(
    limit: int = 100,
    offset: int = 0,
    event_type: Optional[str] = None,
    severity: Optional[str] = None,
    user_id: Optional[str] = None,
) -> List[SecurityEvent]:
    """Retrieve security events with optional filters (newest first)."""
    path = _log_file()
    events: List[SecurityEvent] = []
    if os.path.exists(path):
        lock = get_lock("security")
        with lock:
            with open(path, "r", encoding="utf-8") as f:
                for line in f:
                    if line.strip():
                        try:
                            events.append(SecurityEvent.model_validate_json(line))
                        except Exception:
                            pass

    if event_type:
        events = [e for e in events if e.event_type == event_type]
    if severity:
        events = [e for e in events if e.severity == severity]
    if user_id:
        events = [e for e in events if e.user_id == user_id]

    events.reverse()
    return events[offset: offset + limit]


def get_security_summary() -> SecuritySummary:
    """Generate a summary of all security events."""
    path = _log_file()
    failed_logins = revocations = high_severity = 0

    if os.path.exists(path):
        lock = get_lock("security")
        with lock:
            with open(path, "r", encoding="utf-8") as f:
                for line in f:
                    if not line.strip():
                        continue
                    try:
                        event = json.loads(line)
                    except Exception:
                        continue
                    if event.get("event_type") == "login_failure":
                        failed_logins += 1
                    if event.get("event_type") == "token_revoked":
                        revocations += 1
                    if event.get("severity") in ("high", "critical"):
                        high_severity += 1

    return SecuritySummary(
        failed_logins_24h=failed_logins,
        active_revoked_tokens=revocations,
        high_severity_events=high_severity,
    )
