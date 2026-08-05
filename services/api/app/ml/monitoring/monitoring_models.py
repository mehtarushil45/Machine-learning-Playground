"""V6B Monitoring Data Models.

All monitoring schemas are plain dicts created by factory functions.
Every report dict includes schema_version = '6b.1.0'.
No Pydantic dependency — pure stdlib.
"""
from __future__ import annotations
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

SCHEMA_VERSION = "6b.1.0"

# Monitoring states
MONITORING_STATES = frozenset({
    "INACTIVE", "INITIALIZING", "ACTIVE", "PAUSED", "ALERTING", "DEGRADED", "STOPPED"
})

# Alert severity
ALERT_SEVERITY = frozenset({"INFO", "WARNING", "CRITICAL"})

# Alert types
ALERT_TYPES = frozenset({"DRIFT", "PERFORMANCE", "SYSTEM", "CUSTOM"})

# Alert subtypes
ALERT_SUBTYPES = frozenset({
    "FEATURE_DRIFT", "SCHEMA_DRIFT", "MISSING_VALUE_DRIFT", "DISTRIBUTION_DRIFT",
    "ACCURACY_DEGRADATION", "CONFIDENCE_DEGRADATION",
    "LATENCY_BREACH", "THROUGHPUT_DROP", "ERROR_RATE_BREACH",
    "CUSTOM"
})

# Retraining trigger types  
RETRAIN_TRIGGERS = frozenset({"MANUAL", "SCHEDULED", "DRIFT_TRIGGERED", "PERFORMANCE_TRIGGERED"})
RETRAIN_STATUSES = frozenset({"PENDING", "APPROVED", "REJECTED", "EXECUTING", "COMPLETED", "FAILED"})
RETRAIN_PRIORITIES = frozenset({"LOW", "MEDIUM", "HIGH", "URGENT"})

# Baseline sources
BASELINE_SOURCES = frozenset({"dataset_validation", "training_metrics", "warm_start", "cold_start"})

def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()

def new_id(prefix: str) -> str:
    return prefix + uuid.uuid4().hex[:8]

def make_monitoring_config(
    deployment_id: str,
    model_id: str,
    model_version: str,
    model_family: str,
    dataset_id: str,
    monitoring_name: str,
    created_by: str,
    created_from_deployment_state: str,
    enabled_checks: Optional[Dict[str, bool]] = None,
    data_drift_config: Optional[Dict[str, Any]] = None,
    performance_config: Optional[Dict[str, Any]] = None,
    system_config: Optional[Dict[str, Any]] = None,
    alert_config: Optional[Dict[str, Any]] = None,
    scheduled_retraining_cron: Optional[str] = None
) -> dict:
    return {
        "monitoring_id": new_id("mon-"),
        "deployment_id": deployment_id,
        "model_id": model_id,
        "model_version": model_version,
        "model_family": model_family or "",
        "dataset_id": dataset_id or "",
        "monitoring_name": monitoring_name,
        "monitoring_state": "INACTIVE",
        "created_from_deployment_state": created_from_deployment_state,
        "enabled_checks": enabled_checks or {"data_drift": True, "performance": True, "system": True},
        "data_drift_config": data_drift_config or {"feature_drift_threshold": 0.10, "missing_value_drift_threshold": 0.10, "window_size": 500, "min_predictions": 50},
        "performance_config": performance_config or {"metrics": ["accuracy", "f1", "precision", "recall"], "evaluation_window": 200, "degradation_threshold": 0.05, "min_actuals": 50},
        "system_config": system_config or {"latency_p95_threshold_ms": 500.0, "error_rate_threshold": 0.05, "throughput_window_minutes": 60, "min_predictions": 10},
        "alert_config": alert_config or {"rules": [], "webhook_url": None, "email_recipients": []},
        "scheduled_retraining_cron": scheduled_retraining_cron,
        "baseline_computed": False,
        "baseline_source": None,
        "feature_baseline_id": None,
        "performance_baseline_id": None,
        "created_by": created_by,
        "created_at": utc_now(),
        "updated_at": utc_now(),
        "schema_version": SCHEMA_VERSION
    }

def make_monitoring_status(monitoring_id: str) -> dict:
    return {
        "monitoring_id": monitoring_id,
        "state": "INACTIVE",
        "last_checked_at": None,
        "active_alerts": 0,
        "schema_version": SCHEMA_VERSION
    }

def make_monitoring_event(event_type: str, previous_state: Optional[str], new_state: str, performed_by: str, reason: Optional[str] = None) -> dict:
    return {
        "event_id": str(uuid.uuid4()),
        "timestamp": utc_now(),
        "event_type": event_type,
        "previous_state": previous_state,
        "new_state": new_state,
        "performed_by": performed_by,
        "reason": reason
    }

def make_feature_baseline(monitoring_id: str, model_id: str, source: str, feature_schema: dict, feature_stats: dict, prediction_distribution: dict, missing_rates: dict) -> dict:
    return {
        "baseline_id": new_id("fb-"),
        "monitoring_id": monitoring_id,
        "model_id": model_id,
        "source": source,
        "feature_schema": feature_schema,
        "feature_stats": feature_stats,
        "prediction_distribution": prediction_distribution,
        "missing_rates": missing_rates,
        "created_at": utc_now(),
        "schema_version": SCHEMA_VERSION
    }

def make_performance_baseline(monitoring_id: str, model_id: str, source: str, metrics: dict, task_type: str) -> dict:
    return {
        "baseline_id": new_id("pb-"),
        "monitoring_id": monitoring_id,
        "model_id": model_id,
        "source": source,
        "metrics": metrics,
        "task_type": task_type,
        "created_at": utc_now(),
        "schema_version": SCHEMA_VERSION
    }

def make_drift_report(monitoring_id: str, model_id: str, deployment_id: str, window_start: str, window_end: str, prediction_count: int) -> dict:
    return {
        "report_id": new_id("dr-"),
        "monitoring_id": monitoring_id,
        "model_id": model_id,
        "deployment_id": deployment_id,
        "window_start": window_start,
        "window_end": window_end,
        "prediction_count": prediction_count,
        "drift_score": None,
        "drift_detected": False,
        "feature_drifts": [],
        "created_at": utc_now(),
        "schema_version": SCHEMA_VERSION
    }

def make_performance_report(monitoring_id: str, model_id: str, evaluation_window: int, prediction_count: int, matched_actuals_count: int) -> dict:
    return {
        "report_id": new_id("pr-"),
        "monitoring_id": monitoring_id,
        "model_id": model_id,
        "evaluation_window": evaluation_window,
        "prediction_count": prediction_count,
        "matched_actuals_count": matched_actuals_count,
        "metrics": {},
        "degradation_detected": False,
        "created_at": utc_now(),
        "schema_version": SCHEMA_VERSION
    }

def make_system_report(monitoring_id: str, deployment_id: str, window_minutes: float, request_count: int) -> dict:
    return {
        "report_id": new_id("sr-"),
        "monitoring_id": monitoring_id,
        "deployment_id": deployment_id,
        "window_minutes": window_minutes,
        "request_count": request_count,
        "latency": None,
        "cpu_usage_pct": None,
        "memory_usage_mb": None,
        "created_at": utc_now(),
        "schema_version": SCHEMA_VERSION
    }

def make_alert(monitoring_id: str, deployment_id: str, model_id: str, alert_type: str, alert_subtype: str, severity: str, title: str, message: str, metric_name: Optional[str] = None, metric_value: Optional[float] = None, threshold: Optional[float] = None, context: Optional[dict] = None, report_id: Optional[str] = None) -> dict:
    return {
        "alert_id": new_id("al-"),
        "monitoring_id": monitoring_id,
        "deployment_id": deployment_id,
        "model_id": model_id,
        "alert_type": alert_type,
        "alert_subtype": alert_subtype,
        "severity": severity,
        "title": title,
        "message": message,
        "metric_name": metric_name,
        "metric_value": metric_value,
        "threshold": threshold,
        "context": context or {},
        "report_id": report_id,
        "triggered_at": utc_now(),
        "resolved": False,
        "resolved_at": None,
        "resolution_reason": None,
        "channels_notified": [],
        "schema_version": SCHEMA_VERSION
    }

def make_retraining_request(monitoring_id: str, deployment_id: str, model_id: str, model_version: str, trigger_type: str, reason: str, report_id: Optional[str] = None, suggested_config: Optional[dict] = None, priority: str = "MEDIUM", requested_by: str = "system") -> dict:
    return {
        "request_id": new_id("ret-"),
        "monitoring_id": monitoring_id,
        "deployment_id": deployment_id,
        "model_id": model_id,
        "model_version": model_version,
        "source_model_version": model_version,
        "trigger_type": trigger_type,
        "reason": reason,
        "report_id": report_id,
        "suggested_config": suggested_config or {},
        "priority": priority,
        "requested_by": requested_by,
        "status": "PENDING",
        "created_at": utc_now(),
        "schema_version": SCHEMA_VERSION
    }
