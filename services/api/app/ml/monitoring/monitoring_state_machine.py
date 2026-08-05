"""V6B Monitoring State Machine.

States: INACTIVE, INITIALIZING, ACTIVE, PAUSED, ALERTING, DEGRADED, STOPPED
STOPPED is terminal.

Valid transitions:
  INACTIVE      -> INITIALIZING
  INITIALIZING  -> ACTIVE, STOPPED
  ACTIVE        -> PAUSED, ALERTING, DEGRADED, STOPPED
  PAUSED        -> ACTIVE, STOPPED
  ALERTING      -> ACTIVE, PAUSED, STOPPED
  DEGRADED      -> ACTIVE, STOPPED
  STOPPED       -> (terminal)
"""
from __future__ import annotations
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional

ALL_MONITORING_STATES = frozenset({
    "INACTIVE", "INITIALIZING", "ACTIVE", "PAUSED", "ALERTING", "DEGRADED", "STOPPED"
})

TERMINAL_STATES = frozenset({"STOPPED"})

VALID_MONITORING_TRANSITIONS: Dict[str, frozenset] = {
    "INACTIVE": frozenset({"INITIALIZING"}),
    "INITIALIZING": frozenset({"ACTIVE", "STOPPED"}),
    "ACTIVE": frozenset({"PAUSED", "ALERTING", "DEGRADED", "STOPPED"}),
    "PAUSED": frozenset({"ACTIVE", "STOPPED"}),
    "ALERTING": frozenset({"ACTIVE", "PAUSED", "STOPPED"}),
    "DEGRADED": frozenset({"ACTIVE", "STOPPED"}),
    "STOPPED": frozenset()
}

EVENT_TYPES = {
    ("INACTIVE", "INITIALIZING"): "STARTED",
    ("INITIALIZING", "ACTIVE"): "BASELINE_COMPUTED",
    ("ACTIVE", "PAUSED"): "PAUSED",
    ("PAUSED", "ACTIVE"): "RESUMED",
    ("ACTIVE", "ALERTING"): "ALERT_RAISED",
    ("ALERTING", "ACTIVE"): "ALERT_RESOLVED",
    ("*", "DEGRADED"): "DEGRADED",
    ("DEGRADED", "ACTIVE"): "RECOVERED",
    ("*", "STOPPED"): "STOPPED"
}

def validate_monitoring_transition(current_state: str, target_state: str) -> None:
    if current_state not in ALL_MONITORING_STATES:
        raise ValueError(f"Invalid current state: {current_state}")
    if target_state not in ALL_MONITORING_STATES:
        raise ValueError(f"Invalid target state: {target_state}")
    if target_state not in VALID_MONITORING_TRANSITIONS.get(current_state, frozenset()):
        raise ValueError(f"Invalid transition from {current_state} to {target_state}")

def get_valid_monitoring_transitions(current_state: str) -> List[str]:
    if current_state not in ALL_MONITORING_STATES:
        return []
    return sorted(list(VALID_MONITORING_TRANSITIONS.get(current_state, frozenset())))

def get_event_type(from_state: str, to_state: str) -> str:
    key = (from_state, to_state)
    if key in EVENT_TYPES:
        return EVENT_TYPES[key]
    wildcard_key = ("*", to_state)
    if wildcard_key in EVENT_TYPES:
        return EVENT_TYPES[wildcard_key]
    return "TRANSITIONED"

def make_monitoring_event(event_type: str, previous_state: Optional[str], new_state: str, performed_by: str, reason: Optional[str] = None) -> dict:
    return {
        "event_id": str(uuid.uuid4()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "event_type": event_type,
        "previous_state": previous_state,
        "new_state": new_state,
        "performed_by": performed_by,
        "reason": reason
    }
