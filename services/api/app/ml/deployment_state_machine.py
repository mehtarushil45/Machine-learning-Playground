"""Deployment State Machine + Deployment Policy — Version 6A.

Pure validation module. Zero I/O.

State Machine
-------------
Defines the V6A deployment lifecycle and validates all state transitions.
Mirrors the design of ``model_governance.py`` for platform consistency.

States
------
CREATED      Deployment record initialised; not yet validated.
VALIDATING   Pre-flight checks running (model binary, governance, policy).
DEPLOYING    Strategy applying; traffic not yet routed.
ACTIVE       Live, serving traffic.
SCALING      Replica / traffic adjustment in progress.
UPDATING     Champion model swap in progress.
FAILED       Unrecoverable error in any active stage.
ROLLED_BACK  Traffic reverted to prior version via V5B rollback.
ARCHIVED     Permanently decommissioned (terminal).

Valid transitions
-----------------
CREATED      → VALIDATING
VALIDATING   → DEPLOYING, FAILED
DEPLOYING    → ACTIVE, FAILED
ACTIVE       → SCALING, UPDATING, ROLLED_BACK, ARCHIVED
SCALING      → ACTIVE, FAILED
UPDATING     → ACTIVE, FAILED, ROLLED_BACK
FAILED       → ROLLED_BACK, ARCHIVED
ROLLED_BACK  → ARCHIVED
ARCHIVED     → (terminal)

Deployment Policy
-----------------
Replaces the advisory readiness check with an enforceable gate.

Policy values:
    ALLOW              readiness_score >= 80   — proceed immediately
    ALLOW_WITH_WARNING readiness_score 60-79   — proceed with logged warning
    BLOCK              readiness_score <  60   — deployment refused unless
                       governance admin provides explicit override

Governance administrator override:
    Caller passes ``admin_override=True`` to ``evaluate_deployment_policy()``.
    When ``admin_override=True`` and policy would BLOCK, outcome is elevated
    to ``ALLOW_WITH_WARNING`` and the override is recorded in the evaluation
    result for audit purposes.

Public API
----------
``get_valid_transitions(current_state)``      → ``list[str]``
``validate_transition(current_state, target)`` → raises ``ValueError`` if invalid
``make_deployment_event(...)``                 → immutable event dict
``evaluate_deployment_policy(readiness_score, admin_override)`` → PolicyResult dict

``ALL_STATES``         frozenset of all valid state strings
``VALID_TRANSITIONS``  Dict[str, frozenset] adjacency map
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger("apex_ml.deployment_state_machine")

# ---------------------------------------------------------------------------
# State machine definition
# ---------------------------------------------------------------------------

ALL_STATES: frozenset = frozenset({
    "CREATED", "VALIDATING", "DEPLOYING", "ACTIVE",
    "SCALING", "UPDATING", "FAILED", "ROLLED_BACK", "ARCHIVED",
})

VALID_TRANSITIONS: Dict[str, frozenset] = {
    "CREATED":      frozenset({"VALIDATING"}),
    "VALIDATING":   frozenset({"DEPLOYING", "FAILED"}),
    "DEPLOYING":    frozenset({"ACTIVE", "FAILED"}),
    "ACTIVE":       frozenset({"SCALING", "UPDATING", "ROLLED_BACK", "ARCHIVED"}),
    "SCALING":      frozenset({"ACTIVE", "FAILED"}),
    "UPDATING":     frozenset({"ACTIVE", "FAILED", "ROLLED_BACK"}),
    "FAILED":       frozenset({"ROLLED_BACK", "ARCHIVED"}),
    "ROLLED_BACK":  frozenset({"ARCHIVED"}),
    "ARCHIVED":     frozenset(),   # terminal
}

# State → canonical event_type label
_STATE_TO_EVENT: Dict[str, str] = {
    "VALIDATING":  "VALIDATING",
    "DEPLOYING":   "DEPLOYING",
    "ACTIVE":      "ACTIVATED",
    "SCALING":     "SCALING",
    "UPDATING":    "UPDATING",
    "FAILED":      "FAILED",
    "ROLLED_BACK": "ROLLED_BACK",
    "ARCHIVED":    "ARCHIVED",
}

# ---------------------------------------------------------------------------
# Public state machine API
# ---------------------------------------------------------------------------

def get_valid_transitions(current_state: str) -> List[str]:
    """Return the sorted list of valid target states from *current_state*.

    Args:
        current_state: The deployment's current state string.

    Returns:
        Sorted list of valid target state strings.

    Raises:
        ValueError: If *current_state* is not a recognised state.
    """
    current_state = current_state.strip().upper()
    if current_state not in ALL_STATES:
        raise ValueError(
            f"Unknown deployment state '{current_state}'. "
            f"Valid states: {sorted(ALL_STATES)}"
        )
    return sorted(VALID_TRANSITIONS.get(current_state, frozenset()))


def validate_transition(current_state: str, target_state: str) -> None:
    """Validate a deployment state transition.

    This is a pure function — no I/O.

    Args:
        current_state: Current deployment state.
        target_state:  Proposed next state.

    Raises:
        ValueError: If either state is unrecognised or the transition is invalid.
    """
    current_state = current_state.strip().upper()
    target_state = target_state.strip().upper()

    if current_state not in ALL_STATES:
        raise ValueError(f"Unknown current state '{current_state}'.")
    if target_state not in ALL_STATES:
        raise ValueError(f"Unknown target state '{target_state}'.")

    allowed = VALID_TRANSITIONS.get(current_state, frozenset())
    if target_state not in allowed:
        raise ValueError(
            f"Invalid deployment transition '{current_state}' → '{target_state}'. "
            f"Allowed from '{current_state}': "
            f"{sorted(allowed) or '(none — terminal state)'}"
        )


def make_deployment_event(
    event_type: str,
    previous_state: Optional[str],
    new_state: str,
    performed_by: str = "system",
    reason: Optional[str] = None,
) -> Dict[str, Any]:
    """Build an immutable structured deployment event.

    The event format is identical to V5B governance events for platform
    consistency and future unified audit log support.

    Args:
        event_type:     Canonical event label (e.g. ``"ACTIVATED"``).
        previous_state: Prior state, or None for the first event.
        new_state:      State after this event.
        performed_by:   Actor identifier (default: ``"system"``).
        reason:         Optional human-readable reason.

    Returns:
        Immutable event dict with: event_id, timestamp, event_type,
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


def event_type_for_state(state: str) -> str:
    """Return the canonical event_type label for a target state.

    Args:
        state: Target state string.

    Returns:
        Canonical event_type string.
    """
    return _STATE_TO_EVENT.get(state.upper(), "TRANSITIONED")


# ---------------------------------------------------------------------------
# Deployment Policy (V6A architectural improvement)
# ---------------------------------------------------------------------------

# Policy thresholds
_SCORE_ALLOW = 80.0      # score >= this → ALLOW
_SCORE_WARN = 60.0       # score >= this (and < ALLOW) → ALLOW_WITH_WARNING
                          # score <  WARN → BLOCK

POLICY_ALLOW = "ALLOW"
POLICY_WARN  = "ALLOW_WITH_WARNING"
POLICY_BLOCK = "BLOCK"

# Governance states that are deployable
DEPLOYABLE_GOVERNANCE_STATES: frozenset = frozenset({
    "CANDIDATE", "STAGING", "PRODUCTION"
})


def evaluate_deployment_policy(
    readiness_score: Optional[float],
    admin_override: bool = False,
) -> Dict[str, Any]:
    """Evaluate the Deployment Policy for a candidate model.

    Policy values:
        ALLOW              score >= 80   — proceed immediately.
        ALLOW_WITH_WARNING score 60–79   — proceed with warning.
        BLOCK              score <  60   — refused unless admin override.

    Admin override:
        When ``admin_override=True`` and the policy would be BLOCK, the
        outcome is elevated to ALLOW_WITH_WARNING.  The override is recorded
        in the returned dict for audit purposes.  Override does NOT produce
        ALLOW — it always retains a warning.

    Args:
        readiness_score: Float 0–100 from the V5B deployment readiness report,
                         or None if the report has not been generated.
        admin_override:  True if a governance administrator explicitly
                         overrides a BLOCK decision.

    Returns:
        Policy result dict::

            {
              "policy":          "ALLOW | ALLOW_WITH_WARNING | BLOCK",
              "readiness_score": float | null,
              "threshold_used":  float,
              "admin_override":  bool,
              "override_applied": bool,
              "message":         str,
              "evaluated_at":    ISO-8601,
            }
    """
    evaluated_at = datetime.now(timezone.utc).isoformat()

    if readiness_score is None:
        # No report available → treat as BLOCK (unknown is not safe)
        raw_policy = POLICY_BLOCK
        message = (
            "Readiness report not available. "
            "Run validation to generate a readiness report before deploying."
        )
    else:
        score = float(readiness_score)
        if score >= _SCORE_ALLOW:
            raw_policy = POLICY_ALLOW
            message = f"Readiness score {score:.1f} meets ALLOW threshold (≥ {_SCORE_ALLOW})."
        elif score >= _SCORE_WARN:
            raw_policy = POLICY_WARN
            message = (
                f"Readiness score {score:.1f} is in the ALLOW_WITH_WARNING range "
                f"({_SCORE_WARN}–{_SCORE_ALLOW - 0.1:.1f}). "
                "Review warnings before proceeding to production."
            )
        else:
            raw_policy = POLICY_BLOCK
            message = (
                f"Readiness score {score:.1f} is below BLOCK threshold (< {_SCORE_WARN}). "
                "Deployment refused. A governance administrator may override this decision."
            )

    override_applied = False
    final_policy = raw_policy

    if raw_policy == POLICY_BLOCK and admin_override:
        final_policy = POLICY_WARN
        override_applied = True
        message = (
            f"[ADMIN OVERRIDE] Policy elevated from BLOCK to ALLOW_WITH_WARNING. "
            f"Original: {message}"
        )
        logger.warning(
            "Deployment policy BLOCK overridden by administrator. "
            "readiness_score=%s",
            readiness_score,
        )

    if raw_policy == POLICY_BLOCK and not admin_override:
        logger.warning(
            "Deployment blocked by policy. readiness_score=%s. "
            "Governance administrator override required.",
            readiness_score,
        )

    return {
        "policy":           final_policy,
        "readiness_score":  readiness_score,
        "threshold_used":   _SCORE_WARN if raw_policy == POLICY_BLOCK else _SCORE_ALLOW,
        "admin_override":   admin_override,
        "override_applied": override_applied,
        "message":          message,
        "evaluated_at":     evaluated_at,
    }


def check_governance_state_deployable(governance_state: str) -> bool:
    """Return True if the governance state permits deployment.

    Only models in CANDIDATE, STAGING, or PRODUCTION state may be deployed.

    Args:
        governance_state: The model's current V5B governance state string.

    Returns:
        True if deployable, False otherwise.
    """
    return governance_state.upper() in DEPLOYABLE_GOVERNANCE_STATES
