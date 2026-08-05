"""V6B Retraining Manager.

Manages RetrainingRequest lifecycle.
Architecture only - no scheduler, no engine.py calls.

Trigger types: MANUAL, SCHEDULED (arch), DRIFT_TRIGGERED (arch), PERFORMANCE_TRIGGERED (arch)
Statuses: PENDING -> APPROVED -> EXECUTING (future) -> COMPLETED
          PENDING -> REJECTED

Every request records source_model_version.
Scheduled retraining: stores cron_expression for future V6C implementation.
"""

from __future__ import annotations

import datetime
from uuid import uuid4
from typing import List, Optional

from app.ml.monitoring import monitoring_registry as registry
from app.ml import model_registry, model_lineage


SCHEMA_VERSION = "6b.1.0"
VALID_TRIGGER_TYPES = {'MANUAL', 'SCHEDULED', 'DRIFT_TRIGGERED', 'PERFORMANCE_TRIGGERED'}
VALID_STATUSES = {'PENDING', 'APPROVED', 'EXECUTING', 'COMPLETED', 'REJECTED'}


def create_retraining_request(
    monitoring_id: str,
    deployment_id: str,
    model_id: str,
    model_version: str,
    trigger_type: str,
    reason: str,
    report_id: Optional[str] = None,
    suggested_config: Optional[dict] = None,
    priority: str = 'MEDIUM',
    requested_by: str = 'system'
) -> dict:
    if trigger_type not in VALID_TRIGGER_TYPES:
        raise ValueError(f"Invalid trigger_type. Must be one of {VALID_TRIGGER_TYPES}")

    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    request_id = 'ret-' + uuid4().hex[:8]

    # For scheduled type, we try to grab the cron from monitor config
    scheduled_cron = None
    if trigger_type == 'SCHEDULED':
        monitor = registry.get_monitor(monitoring_id)
        if monitor:
            scheduled_cron = monitor.get('scheduled_retraining_cron')

    request = {
        "request_id": request_id,
        "monitoring_id": monitoring_id,
        "deployment_id": deployment_id,
        "model_id": model_id,
        "source_model_version": model_version,
        "trigger_type": trigger_type,
        "reason": reason,
        "trigger_report_id": report_id,
        "status": "PENDING",
        "suggested_config": suggested_config or {},
        "priority": priority,
        "requested_by": requested_by,
        "approved_by": None,
        "rejected_by": None,
        "rejection_reason": None,
        "scheduled_cron": scheduled_cron,
        "created_at": now,
        "updated_at": now,
        "schema_version": SCHEMA_VERSION
    }
    
    registry.save_retraining_request(request)
    return request


def approve_retraining(request_id: str, approved_by: str) -> dict:
    request = registry.get_retraining_request(request_id)
    if not request:
        raise ValueError(f"Retraining request {request_id} not found")
        
    if request["status"] != "PENDING":
        raise ValueError(f"Cannot approve request with status {request['status']}")
        
    request["status"] = "APPROVED"
    request["approved_by"] = approved_by
    request["updated_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    
    registry.save_retraining_request(request)
    return request


def reject_retraining(request_id: str, rejected_by: str, reason: str) -> dict:
    request = registry.get_retraining_request(request_id)
    if not request:
        raise ValueError(f"Retraining request {request_id} not found")
        
    if request["status"] != "PENDING":
        raise ValueError(f"Cannot reject request with status {request['status']}")
        
    request["status"] = "REJECTED"
    request["rejected_by"] = rejected_by
    request["rejection_reason"] = reason
    request["updated_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    
    registry.save_retraining_request(request)
    return request


def get_retraining_request(request_id: str) -> Optional[dict]:
    return registry.get_retraining_request(request_id)


def list_retraining_requests(monitoring_id: Optional[str] = None, status: Optional[str] = None, limit: int = 50) -> List[dict]:
    return registry.list_retraining_requests(monitoring_id=monitoring_id, status=status, limit=limit)


def suggest_retraining_config(monitoring_id: str, model_id: str) -> dict:
    model_meta = model_registry.get_model_by_id(model_id)
    if not model_meta:
        return {}
        
    lineage = model_lineage.get_lineage(model_id)
    if not lineage:
        return {}
        
    return {
        "dataset_id": lineage.get("dataset", {}).get("dataset_id", ""),
        "algorithm": model_meta.get("algorithm", "Unknown"),
        "hyperparameters": lineage.get("hyperparameters", {}),
        "feature_columns": lineage.get("feature_set", {}).get("feature_columns", []),
        "target_column": lineage.get("feature_set", {}).get("target_column", ""),
        "suggested_reason": "Retrain with same configuration on updated dataset"
    }


def trigger_drift_retraining(monitoring_id: str, deployment_id: str, model_id: str, model_version: str, drift_report: dict) -> dict:
    priority = "HIGH" if drift_report.get("severity") == "CRITICAL" else "MEDIUM"
    reason = f"Drift detected. Severity: {drift_report.get('severity', 'UNKNOWN')}."
    
    suggested = suggest_retraining_config(monitoring_id, model_id)
    
    return create_retraining_request(
        monitoring_id=monitoring_id,
        deployment_id=deployment_id,
        model_id=model_id,
        model_version=model_version,
        trigger_type="DRIFT_TRIGGERED",
        reason=reason,
        report_id=drift_report.get("report_id"),
        suggested_config=suggested,
        priority=priority,
        requested_by="system"
    )


def trigger_performance_retraining(monitoring_id: str, deployment_id: str, model_id: str, model_version: str, performance_report: dict) -> dict:
    priority = "HIGH" if performance_report.get("severity") == "CRITICAL" else "MEDIUM"
    reason = f"Performance degraded. Severity: {performance_report.get('severity', 'UNKNOWN')}."
    
    suggested = suggest_retraining_config(monitoring_id, model_id)
    
    return create_retraining_request(
        monitoring_id=monitoring_id,
        deployment_id=deployment_id,
        model_id=model_id,
        model_version=model_version,
        trigger_type="PERFORMANCE_TRIGGERED",
        reason=reason,
        report_id=performance_report.get("report_id"),
        suggested_config=suggested,
        priority=priority,
        requested_by="system"
    )


def trigger_scheduled_retraining(monitoring_id: str) -> dict:
    """Architecture placeholder. V6C implementation will call this on schedule.
    Creates a SCHEDULED retraining request for human review."""
    config = registry.get_monitor(monitoring_id)
    if not config:
        raise KeyError(f'Monitor {monitoring_id} not found')
    return create_retraining_request(
        monitoring_id=monitoring_id,
        deployment_id=config['deployment_id'],
        model_id=config['model_id'],
        model_version=config.get('model_version', 'unknown'),
        trigger_type='SCHEDULED',
        reason=f'Scheduled retraining per cron: {config.get("scheduled_retraining_cron", "N/A")}',
        priority='MEDIUM',
        requested_by='scheduler',
    )
