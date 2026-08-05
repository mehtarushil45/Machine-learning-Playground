"""V6B Monitoring Manager — Thin Orchestrator.

Coordinates all V6B monitoring modules.
Contains NO business logic — delegates to specialized modules.
All state transitions go through monitoring_state_machine.

Monitoring must be started manually. No auto-start on deployment.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger("apex_ml.monitoring.manager")


# ---------------------------------------------------------------------------
# Lazy module imports (avoid circular deps at load time)
# ---------------------------------------------------------------------------

def _registry():
    from app.ml.monitoring import monitoring_registry
    return monitoring_registry


def _sm():
    from app.ml.monitoring import monitoring_state_machine
    return monitoring_state_machine


def _bb():
    from app.ml.monitoring import baseline_builder
    return baseline_builder


def _dd():
    from app.ml.monitoring import drift_detector
    return drift_detector


def _pm():
    from app.ml.monitoring import performance_monitor
    return performance_monitor


def _sm_sys():
    from app.ml.monitoring import system_monitor
    return system_monitor


def _ae():
    from app.ml.monitoring import alert_engine
    return alert_engine


def _rg():
    from app.ml.monitoring import report_generator
    return report_generator


def _rm():
    from app.ml.monitoring import retraining_manager
    return retraining_manager


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _transition(monitoring_id: str, new_state: str, performed_by: str, reason: Optional[str] = None) -> dict:
    """Apply a state transition and return the updated status."""
    reg = _registry()
    sm = _sm()
    config = reg.get_monitor(monitoring_id)
    current_state = config.get("monitoring_state", "INACTIVE") if config else "INACTIVE"
    sm.validate_monitoring_transition(current_state, new_state)
    event_type = sm.get_event_type(current_state, new_state)
    event = sm.make_monitoring_event(event_type, current_state, new_state, performed_by, reason)
    return reg.update_monitor_state(monitoring_id, new_state, event)


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------

def create_monitor(
    deployment_id: str,
    model_id: str,
    monitoring_name: str,
    config_overrides: Optional[dict] = None,
    created_by: str = "system",
) -> dict:
    """Create a monitoring config for a deployment.

    Raises ValueError if model_id not found in registry.
    """
    from app.ml.monitoring.monitoring_models import make_monitoring_config

    # Resolve model info
    from app.ml import model_registry, model_lineage, model_governance
    model_meta = model_registry.get_model_by_id(model_id)
    if not model_meta:
        raise ValueError(f"Model '{model_id}' not found in model registry.")

    gov = model_governance.get_governance(model_id) or {}
    lineage = model_lineage.get_lineage(model_id) or {}

    # Resolve governance state for created_from_deployment_state
    created_from_deployment_state = gov.get("current_state", "UNKNOWN")

    # Resolve deployment record (non-blocking)
    dep_record: dict = {}
    try:
        from app.ml.deployment_registry import get_v6a_deployment
        dep_record = get_v6a_deployment(deployment_id) or {}
    except Exception as exc:
        logger.warning("Could not load V6A deployment record for %s: %s", deployment_id, exc)

    # Build config
    model_version = model_meta.get("semantic_version") or model_meta.get("version", "unknown")
    model_family = (
        lineage.get("model_family")
        or dep_record.get("model_family")
        or f"{model_meta.get('algorithm', 'unknown')}@{lineage.get('dataset', {}).get('dataset_id', 'unknown')}"
    )
    dataset_id = lineage.get("dataset", {}).get("dataset_id", "")

    config = make_monitoring_config(
        deployment_id=deployment_id,
        model_id=model_id,
        model_version=model_version,
        model_family=model_family,
        dataset_id=dataset_id,
        monitoring_name=monitoring_name,
        created_by=created_by,
        created_from_deployment_state=created_from_deployment_state,
    )

    # Apply overrides (must not override monitoring_id, model_id, etc.)
    if config_overrides:
        safe_keys = {
            "enabled_checks", "data_drift_config", "performance_config",
            "system_config", "alert_config", "scheduled_retraining_cron",
            "monitoring_name",
        }
        for k, v in config_overrides.items():
            if k in safe_keys:
                config[k] = v

    _registry().register_monitor(config)
    logger.info("Created monitor %s for deployment %s model %s", config["monitoring_id"], deployment_id, model_id)
    return config


def start_monitoring(monitoring_id: str, performed_by: str = "system") -> dict:
    """Initialize baseline and transition to ACTIVE.

    INACTIVE -> INITIALIZING -> ACTIVE
    """
    reg = _registry()
    config = reg.get_monitor(monitoring_id)
    if not config:
        raise ValueError(f"Monitor '{monitoring_id}' not found.")

    current_state = config.get("monitoring_state", "INACTIVE")
    if current_state != "INACTIVE":
        raise ValueError(f"Cannot start monitor from state '{current_state}'. Must be INACTIVE.")

    model_id = config["model_id"]

    # INACTIVE -> INITIALIZING
    _transition(monitoring_id, "INITIALIZING", performed_by, "Baseline computation started")

    try:
        # Resolve data for baselines
        from app.ml import model_registry, model_lineage
        model_meta = model_registry.get_model_by_id(model_id)
        lineage = model_lineage.get_lineage(model_id)

        # Fetch recent predictions for warm-start
        from app.ml.prediction_logger import get_recent_logs
        pred_records = get_recent_logs(model_id=model_id, limit=500)

        # Build feature baseline
        bb = _bb()
        feature_baseline = bb.build_feature_baseline(
            monitoring_id=monitoring_id,
            model_id=model_id,
            lineage=lineage,
            prediction_log_records=pred_records,
        )
        reg.save_feature_baseline(monitoring_id, feature_baseline)

        # Build performance baseline
        perf_baseline = bb.build_performance_baseline(
            monitoring_id=monitoring_id,
            model_id=model_id,
            model_metadata=model_meta,
            lineage=lineage,
        )
        reg.save_performance_baseline(monitoring_id, perf_baseline)

        # Update config
        reg.update_monitor_config(monitoring_id, {
            "baseline_computed": True,
            "baseline_source": feature_baseline.get("source"),
            "feature_baseline_id": feature_baseline.get("baseline_id"),
            "performance_baseline_id": perf_baseline.get("baseline_id"),
        })

        # INITIALIZING -> ACTIVE
        status = _transition(monitoring_id, "ACTIVE", performed_by, "Baseline computation complete")
        logger.info("Monitor %s now ACTIVE (baseline_source=%s)", monitoring_id, feature_baseline.get("source"))
        return {"status": status, "feature_baseline": feature_baseline, "performance_baseline": perf_baseline}

    except Exception as exc:
        logger.error("Baseline computation failed for %s: %s", monitoring_id, exc)
        # INITIALIZING -> STOPPED on error
        try:
            _transition(monitoring_id, "STOPPED", "system", f"Baseline failed: {exc}")
        except Exception:
            pass
        raise RuntimeError(f"Failed to start monitoring for {monitoring_id}: {exc}") from exc


def pause_monitoring(
    monitoring_id: str,
    performed_by: str = "system",
    reason: Optional[str] = None,
) -> dict:
    """ACTIVE or ALERTING -> PAUSED."""
    config = _registry().get_monitor(monitoring_id)
    if not config:
        raise ValueError(f"Monitor '{monitoring_id}' not found.")
    return _transition(monitoring_id, "PAUSED", performed_by, reason or "Manually paused")


def resume_monitoring(monitoring_id: str, performed_by: str = "system") -> dict:
    """PAUSED -> ACTIVE."""
    config = _registry().get_monitor(monitoring_id)
    if not config:
        raise ValueError(f"Monitor '{monitoring_id}' not found.")
    return _transition(monitoring_id, "ACTIVE", performed_by, "Manually resumed")


def stop_monitoring(
    monitoring_id: str,
    performed_by: str = "system",
    reason: Optional[str] = None,
) -> dict:
    """Any non-STOPPED state -> STOPPED (terminal)."""
    config = _registry().get_monitor(monitoring_id)
    if not config:
        raise ValueError(f"Monitor '{monitoring_id}' not found.")
    current = config.get("monitoring_state", "INACTIVE")
    if current == "STOPPED":
        raise ValueError(f"Monitor '{monitoring_id}' is already STOPPED.")
    return _transition(monitoring_id, "STOPPED", performed_by, reason or "Manually stopped")


# ---------------------------------------------------------------------------
# Checks
# ---------------------------------------------------------------------------

def run_drift_check(monitoring_id: str, performed_by: str = "system") -> dict:
    """On-demand drift check."""
    reg = _registry()
    config = reg.get_monitor(monitoring_id)
    if not config:
        raise ValueError(f"Monitor '{monitoring_id}' not found.")

    model_id = config["model_id"]
    deployment_id = config["deployment_id"]
    drift_config = config.get("data_drift_config", {})
    alert_cfg = config.get("alert_config", {})

    # Get baselines
    feature_baseline = reg.get_feature_baseline(monitoring_id) or {}

    # Fetch prediction records
    from app.ml.prediction_logger import get_recent_logs
    pred_records = get_recent_logs(model_id=model_id, limit=drift_config.get("window_size", 500))

    # Fetch submitted feature actuals
    feature_actuals = reg.get_actuals(monitoring_id, limit=drift_config.get("window_size", 500))

    # Run drift detection
    drift_report = _dd().run_drift_check(
        monitoring_id=monitoring_id,
        model_id=model_id,
        deployment_id=deployment_id,
        prediction_records=pred_records,
        feature_actuals=feature_actuals,
        feature_baseline=feature_baseline,
        config=drift_config,
    )

    # Add recommendations
    drift_report["recommendations"] = _rg().generate_drift_recommendations(drift_report)

    # Process alerts
    perf_baseline = reg.get_performance_baseline(monitoring_id) or {}
    baseline_metrics = perf_baseline.get("training_metrics", {})
    alerts = _ae().process_report_alerts(
        monitoring_id=monitoring_id,
        deployment_id=deployment_id,
        model_id=model_id,
        report=drift_report,
        report_type="drift",
        alert_config=alert_cfg,
        baseline_metrics=baseline_metrics,
    )
    if alerts:
        drift_report["alert_triggered"] = True
        drift_report["alert_ids"] = [a.get("alert_id") for a in alerts]

    # Transition to ALERTING if CRITICAL alerts
    current_state = config.get("monitoring_state", "ACTIVE")
    if any(a.get("severity") == "CRITICAL" for a in alerts) and current_state == "ACTIVE":
        try:
            _transition(monitoring_id, "ALERTING", "system", "CRITICAL drift alert raised")
        except Exception as e:
            logger.warning("Could not transition to ALERTING: %s", e)

    # Auto-suggest retraining if CRITICAL drift
    if drift_report.get("drift_detected") and drift_report.get("severity") == "CRITICAL":
        try:
            _rm().trigger_drift_retraining(
                monitoring_id=monitoring_id,
                deployment_id=deployment_id,
                model_id=model_id,
                model_version=config.get("model_version", "unknown"),
                drift_report=drift_report,
            )
        except Exception as e:
            logger.warning("Retraining suggestion failed (non-blocking): %s", e)

    # Save report
    reg.save_report(monitoring_id, "drift", drift_report)

    # Update status
    reg.update_monitor_status(monitoring_id, {
        "last_drift_check": _utc_now(),
        "drift_detected": drift_report.get("drift_detected", False),
        "last_drift_score": drift_report.get("overall_drift_score"),
        "active_alerts_count": len([a for a in _ae().get_active_alerts(monitoring_id)]) if hasattr(_ae(), "get_active_alerts") else None,
    })

    return drift_report


def run_performance_check(monitoring_id: str, performed_by: str = "system") -> dict:
    """On-demand performance check."""
    reg = _registry()
    config = reg.get_monitor(monitoring_id)
    if not config:
        raise ValueError(f"Monitor '{monitoring_id}' not found.")

    model_id = config["model_id"]
    deployment_id = config["deployment_id"]
    perf_config = config.get("performance_config", {})
    alert_cfg = config.get("alert_config", {})

    perf_baseline = reg.get_performance_baseline(monitoring_id) or {}

    from app.ml.prediction_logger import get_recent_logs
    pred_records = get_recent_logs(model_id=model_id, limit=perf_config.get("evaluation_window", 200))

    perf_report = _pm().run_performance_check(
        monitoring_id=monitoring_id,
        model_id=model_id,
        prediction_records=pred_records,
        performance_baseline=perf_baseline,
        config=perf_config,
    )

    # Process alerts
    baseline_metrics = perf_baseline.get("training_metrics", {})
    alerts = _ae().process_report_alerts(
        monitoring_id=monitoring_id,
        deployment_id=deployment_id,
        model_id=model_id,
        report=perf_report,
        report_type="performance",
        alert_config=alert_cfg,
        baseline_metrics=baseline_metrics,
    )
    if alerts:
        perf_report["alert_triggered"] = True
        perf_report["alert_ids"] = [a.get("alert_id") for a in alerts]

    # Transition to ALERTING if CRITICAL
    current_state = config.get("monitoring_state", "ACTIVE")
    if any(a.get("severity") == "CRITICAL" for a in alerts) and current_state == "ACTIVE":
        try:
            _transition(monitoring_id, "ALERTING", "system", "CRITICAL performance alert raised")
        except Exception as e:
            logger.warning("Could not transition to ALERTING: %s", e)

    # Auto-suggest retraining if degradation detected and CRITICAL
    if perf_report.get("degradation_detected") and perf_report.get("severity") == "CRITICAL":
        try:
            _rm().trigger_performance_retraining(
                monitoring_id=monitoring_id,
                deployment_id=deployment_id,
                model_id=model_id,
                model_version=config.get("model_version", "unknown"),
                performance_report=perf_report,
            )
        except Exception as e:
            logger.warning("Performance retraining suggestion failed (non-blocking): %s", e)

    reg.save_report(monitoring_id, "performance", perf_report)
    reg.update_monitor_status(monitoring_id, {"last_performance_check": _utc_now()})
    return perf_report


def run_system_check(monitoring_id: str, performed_by: str = "system") -> dict:
    """On-demand system metrics check."""
    reg = _registry()
    config = reg.get_monitor(monitoring_id)
    if not config:
        raise ValueError(f"Monitor '{monitoring_id}' not found.")

    deployment_id = config["deployment_id"]
    model_id = config["model_id"]
    sys_config = config.get("system_config", {})
    alert_cfg = config.get("alert_config", {})

    sys_report = _sm_sys().run_system_check(
        monitoring_id=monitoring_id,
        deployment_id=deployment_id,
        model_id=model_id,
        config=sys_config,
    )

    if not sys_report.get("insufficient_data"):
        alerts = _ae().process_report_alerts(
            monitoring_id=monitoring_id,
            deployment_id=deployment_id,
            model_id=model_id,
            report=sys_report,
            report_type="system",
            alert_config=alert_cfg,
        )
        if alerts:
            sys_report["alert_triggered"] = True
            sys_report["alert_ids"] = [a.get("alert_id") for a in alerts]

        # Transition to ALERTING if CRITICAL
        current_state = config.get("monitoring_state", "ACTIVE")
        if any(a.get("severity") == "CRITICAL" for a in alerts) and current_state == "ACTIVE":
            try:
                _transition(monitoring_id, "ALERTING", "system", "CRITICAL system alert raised")
            except Exception as e:
                logger.warning("Could not transition to ALERTING: %s", e)

        reg.save_report(monitoring_id, "system", sys_report)

    reg.update_monitor_status(monitoring_id, {"last_system_check": _utc_now()})
    return sys_report


def run_full_check(monitoring_id: str, performed_by: str = "system") -> dict:
    """Run all enabled checks and return combined summary."""
    config = _registry().get_monitor(monitoring_id)
    if not config:
        raise ValueError(f"Monitor '{monitoring_id}' not found.")

    enabled = config.get("enabled_checks", {})
    drift_report = None
    perf_report = None
    sys_report = None

    if enabled.get("data_drift", True):
        try:
            drift_report = run_drift_check(monitoring_id, performed_by)
        except Exception as e:
            logger.warning("Drift check failed (non-blocking): %s", e)
            drift_report = {"error": str(e), "schema_version": "6b.1.0"}

    if enabled.get("performance", True):
        try:
            perf_report = run_performance_check(monitoring_id, performed_by)
        except Exception as e:
            logger.warning("Performance check failed (non-blocking): %s", e)
            perf_report = {"error": str(e), "schema_version": "6b.1.0"}

    if enabled.get("system", True):
        try:
            sys_report = run_system_check(monitoring_id, performed_by)
        except Exception as e:
            logger.warning("System check failed (non-blocking): %s", e)
            sys_report = {"error": str(e), "schema_version": "6b.1.0"}

    summary = _rg().create_full_check_summary(drift_report, perf_report, sys_report)

    return {
        "monitoring_id": monitoring_id,
        "drift_report": drift_report,
        "performance_report": perf_report,
        "system_report": sys_report,
        "summary": summary,
    }


# ---------------------------------------------------------------------------
# Actuals submission
# ---------------------------------------------------------------------------

def submit_actuals(monitoring_id: str, actuals_list: List[dict]) -> dict:
    """Submit ground truth labels. Delegates to performance_monitor."""
    config = _registry().get_monitor(monitoring_id)
    if not config:
        raise ValueError(f"Monitor '{monitoring_id}' not found.")
    result = _pm().submit_actuals(monitoring_id=monitoring_id, actuals_list=actuals_list)
    _registry().update_monitor_status(monitoring_id, {
        "predictions_since_last_check": _registry().get_monitor_status(monitoring_id).get(
            "predictions_since_last_check", 0
        ) + result.get("submitted_count", 0),
    })
    return result


# ---------------------------------------------------------------------------
# Alert management
# ---------------------------------------------------------------------------

def resolve_alert(
    monitoring_id: str,
    alert_id: str,
    resolved_by: str,
    resolution_note: str,
) -> dict:
    """Resolve an alert. Transition ALERTING -> ACTIVE if no more CRITICAL alerts."""
    result = _ae().resolve_alert(monitoring_id, alert_id, resolved_by, resolution_note)

    # Check if still any CRITICAL unresolved alerts
    active_critical = _registry().list_alerts(monitoring_id, severity="CRITICAL", resolved=False)
    config = _registry().get_monitor(monitoring_id)
    current_state = config.get("monitoring_state", "ACTIVE") if config else "ACTIVE"

    if not active_critical and current_state == "ALERTING":
        try:
            _transition(monitoring_id, "ACTIVE", "system", f"All CRITICAL alerts resolved by {resolved_by}")
        except Exception as e:
            logger.warning("Could not transition from ALERTING to ACTIVE: %s", e)

    return result


def get_all_alerts(
    severity: Optional[str] = None,
    resolved: Optional[bool] = None,
    limit: int = 100,
) -> dict:
    """Global alert list across all deployments."""
    alerts = _registry().list_all_alerts(severity=severity, resolved=resolved, limit=limit)
    return {"total": len(alerts), "alerts": alerts}


# ---------------------------------------------------------------------------
# Monitor read / config
# ---------------------------------------------------------------------------

def get_monitor_summary(monitoring_id: str) -> dict:
    """Config + status + latest report summaries + active alert count."""
    reg = _registry()
    config = reg.get_monitor(monitoring_id)
    if not config:
        raise ValueError(f"Monitor '{monitoring_id}' not found.")

    status = reg.get_monitor_status(monitoring_id) or {}
    drift_reports = reg.list_reports(monitoring_id, "drift", limit=1)
    perf_reports = reg.list_reports(monitoring_id, "performance", limit=1)
    sys_reports = reg.list_reports(monitoring_id, "system", limit=1)
    active_alerts = reg.list_alerts(monitoring_id, resolved=False, limit=50)

    return {
        "monitoring_id": monitoring_id,
        "config": config,
        "status": status,
        "latest_drift_report": drift_reports[0] if drift_reports else None,
        "latest_performance_report": perf_reports[0] if perf_reports else None,
        "latest_system_report": sys_reports[0] if sys_reports else None,
        "active_alerts_count": len(active_alerts),
        "active_alerts": active_alerts[:10],  # first 10
    }


def get_monitoring_history(monitoring_id: str) -> dict:
    """Return the monitoring lifecycle event log."""
    config = _registry().get_monitor(monitoring_id)
    if not config:
        raise ValueError(f"Monitor '{monitoring_id}' not found.")
    history = _registry().get_state_history(monitoring_id)
    return {
        "monitoring_id": monitoring_id,
        "event_count": len(history),
        "history": history,
    }


def list_monitors(
    deployment_id: Optional[str] = None,
    model_id: Optional[str] = None,
    state: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> dict:
    """List monitoring configs with optional filters."""
    monitors = _registry().list_monitors(
        deployment_id=deployment_id,
        model_id=model_id,
        state=state,
        limit=limit,
        offset=offset,
    )
    return {"total": len(monitors), "monitors": monitors}


def update_monitor_config(monitoring_id: str, config_patch: dict) -> dict:
    """Update monitoring configuration."""
    config = _registry().get_monitor(monitoring_id)
    if not config:
        raise ValueError(f"Monitor '{monitoring_id}' not found.")
    return _registry().update_monitor_config(monitoring_id, config_patch)


# ---------------------------------------------------------------------------
# Retraining
# ---------------------------------------------------------------------------

def trigger_retraining(
    monitoring_id: str,
    reason: str,
    requested_by: str = "system",
    priority: str = "MEDIUM",
) -> dict:
    """Manually trigger a retraining request (MANUAL type)."""
    config = _registry().get_monitor(monitoring_id)
    if not config:
        raise ValueError(f"Monitor '{monitoring_id}' not found.")

    suggested = _rm().suggest_retraining_config(monitoring_id, config["model_id"])

    return _rm().create_retraining_request(
        monitoring_id=monitoring_id,
        deployment_id=config["deployment_id"],
        model_id=config["model_id"],
        model_version=config.get("model_version", "unknown"),
        trigger_type="MANUAL",
        reason=reason,
        suggested_config=suggested,
        priority=priority,
        requested_by=requested_by,
    )
