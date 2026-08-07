"""Workflow Integration Engine — End-to-End ML Platform Orchestration (V7B Part 2).

Orchestrates the complete enterprise ML workflow:
Dataset → Validation → Profiling → Training → Registry →
Governance → Deployment → Monitoring → Explainability → Portfolio → Verification → Administration
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


_WORKFLOW_STAGES = [
    "dataset_upload",
    "validation",
    "profiling",
    "training",
    "registry",
    "governance",
    "deployment",
    "monitoring",
    "explainability",
    "portfolio",
    "verification",
    "administration",
]


def get_workflow_status(
    dataset_id: Optional[str] = None,
    model_id: Optional[str] = None,
    deployment_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Return the workflow status object showing completion per stage."""
    completed_stages = []
    pending_stages = []
    current_stage = None

    # Determine which stages are "done" based on provided IDs
    if dataset_id:
        completed_stages.extend(["dataset_upload", "validation", "profiling"])
    if model_id:
        completed_stages.extend(["training", "registry"])
    if deployment_id:
        completed_stages.extend(["governance", "deployment"])

    completed_set = set(completed_stages)
    for stage in _WORKFLOW_STAGES:
        if stage not in completed_set:
            if current_stage is None:
                current_stage = stage
            pending_stages.append(stage)

    return {
        "workflow_stages": _WORKFLOW_STAGES,
        "completed_stages": completed_stages,
        "current_stage": current_stage,
        "pending_stages": pending_stages,
        "completion_pct": round(len(completed_stages) / len(_WORKFLOW_STAGES) * 100, 1),
        "linked_resources": {
            "dataset_id": dataset_id,
            "model_id": model_id,
            "deployment_id": deployment_id,
        },
    }


def get_workflow_lineage(
    correlation_id: str,
    activity_events: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Trace the complete lineage of a workflow using a shared correlation_id.
    
    Reads from the activity feed to reconstruct the full chain of events.
    """
    related_events = [
        e for e in activity_events
        if e.get("correlation_id") == correlation_id
    ]
    related_events.sort(key=lambda e: e.get("timestamp", ""))

    stage_events: Dict[str, List] = {stage: [] for stage in _WORKFLOW_STAGES}
    for event in related_events:
        action = event.get("action", "")
        for stage in _WORKFLOW_STAGES:
            if stage in action or any(kw in action for kw in [stage]):
                stage_events[stage].append(event)
                break

    return {
        "correlation_id": correlation_id,
        "total_events": len(related_events),
        "stages": stage_events,
        "timeline": related_events,
        "first_event": related_events[0] if related_events else None,
        "last_event": related_events[-1] if related_events else None,
    }


def generate_workflow_report(
    correlation_id: str,
    dataset_id: Optional[str] = None,
    model_id: Optional[str] = None,
    deployment_id: Optional[str] = None,
    monitor_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Generate a comprehensive end-to-end workflow report."""
    status = get_workflow_status(
        dataset_id=dataset_id,
        model_id=model_id,
        deployment_id=deployment_id,
    )
    return {
        "report_type": "END_TO_END_WORKFLOW",
        "correlation_id": correlation_id,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "workflow_status": status,
        "resource_inventory": {
            "dataset_id": dataset_id,
            "model_id": model_id,
            "deployment_id": deployment_id,
            "monitor_id": monitor_id,
        },
        "next_action": (
            f"Proceed to stage: {status['current_stage']}"
            if status["current_stage"]
            else "Workflow complete. Consider publishing to portfolio."
        ),
    }
