"""V6B Report Generator.

Consolidates report generation for all monitoring check types.
Ensures every report includes schema_version='6b.1.0'.
Generates human-readable summaries and recommendations.
"""

from __future__ import annotations

import datetime
from typing import List, Optional

SCHEMA_VERSION = "6b.1.0"


def generate_drift_summary(drift_report: dict) -> str:
    checks = drift_report.get("checks_summary", {})
    drifted_features = [f for f, check in checks.items() if check.get("drift_detected", False)]
    
    if drifted_features:
        features_str = ", ".join(drifted_features[:3])
        if len(drifted_features) > 3:
            features_str += f" and {len(drifted_features) - 3} more"
        return f"Drift detected in {len(drifted_features)} features ({features_str}). Schema: {drift_report.get('schema_status', 'OK')}. Missing values: {drift_report.get('missing_values_status', 'OK')}. Distribution: {drift_report.get('distribution_status', 'WARNING')}."
    
    return "No significant drift detected across all checks."


def generate_performance_summary(performance_report: dict) -> str:
    degradation = performance_report.get("performance_degraded", False)
    metrics = performance_report.get("metrics", {})
    baseline = performance_report.get("baseline", {})
    
    if degradation:
        primary_metric = performance_report.get("primary_metric_name", "accuracy")
        current_val = metrics.get(primary_metric, 0)
        baseline_val = baseline.get(primary_metric, 0)
        diff = current_val - baseline_val
        return f"Performance degraded: {primary_metric} dropped from {baseline_val:.2f} to {current_val:.2f} ({diff:+.2f})."
        
    return f"Performance within acceptable bounds. Primary metric: {metrics.get(performance_report.get('primary_metric_name', 'accuracy'), 0):.2f}."


def generate_system_summary(system_report: dict) -> str:
    latency = system_report.get("latency_stats", {}).get("p95", 0)
    throughput = system_report.get("throughput_rpm", 0)
    error_rate = system_report.get("error_rate_pct", 0)
    
    return f"Latency P95: {latency}ms (threshold: {system_report.get('latency_threshold', 500)}ms). Throughput: {throughput:.1f} rpm. Error rate: {error_rate:.1f}%."


def generate_drift_recommendations(drift_report: dict) -> List[str]:
    recs = []
    if drift_report.get("schema_drift_detected"):
        recs.append(f"Critical: expected features missing from predictions: {drift_report.get('missing_features', [])}")
    
    if drift_report.get("feature_drift_detected"):
        drifted = [f for f, d in drift_report.get("checks_summary", {}).items() if d.get("drift_detected")]
        recs.append(f"Investigate feature pipeline for upstream data changes in: {drifted}")
        
    if drift_report.get("distribution_drift_detected"):
        recs.append("Model output distribution has shifted. Consider retraining.")
        
    if not recs:
        recs.append("No immediate action required.")
        
    return recs


def generate_performance_recommendations(performance_report: dict) -> List[str]:
    recs = []
    if performance_report.get("performance_degraded"):
        metric = performance_report.get("primary_metric_name", "accuracy")
        recs.append(f"{metric.capitalize()} degraded. Consider model retraining or rollback.")
        
    if performance_report.get("regression_error_increased"):
        recs.append("Regression error increased. Check for data quality issues.")
        
    if not recs:
        recs.append("Monitor performance metrics regularly.")
        
    return recs


def generate_system_recommendations(system_report: dict) -> List[str]:
    recs = []
    if system_report.get("latency_breached"):
        recs.append("P95 latency exceeds threshold. Review model complexity or infrastructure.")
        
    if system_report.get("error_rate_breached"):
        recs.append("Error rate elevated. Check prediction endpoint health.")
        
    if not recs:
        recs.append("System health is normal.")
        
    return recs


def finalize_drift_report(draft_report: dict, drift_results: dict, alert_ids: List[str], recommendations: List[str]) -> dict:
    draft_report.update(drift_results)
    draft_report["alert_ids"] = alert_ids
    draft_report["recommendations"] = recommendations
    draft_report["schema_version"] = SCHEMA_VERSION
    draft_report["generated_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    draft_report["summary"] = generate_drift_summary(draft_report)
    return draft_report


def finalize_performance_report(draft_report: dict, metrics: dict, comparison: dict, alert_ids: List[str]) -> dict:
    draft_report["metrics"] = metrics
    draft_report["comparison"] = comparison
    draft_report["alert_ids"] = alert_ids
    draft_report["schema_version"] = SCHEMA_VERSION
    draft_report["generated_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    draft_report["recommendations"] = generate_performance_recommendations(draft_report)
    draft_report["summary"] = generate_performance_summary(draft_report)
    return draft_report


def finalize_system_report(draft_report: dict, latency_stats: dict, throughput: float, error_rate: float, thresholds_breached: List[str], alert_ids: List[str]) -> dict:
    draft_report["latency_stats"] = latency_stats
    draft_report["throughput_rpm"] = throughput
    draft_report["error_rate_pct"] = error_rate
    draft_report["thresholds_breached"] = thresholds_breached
    draft_report["alert_ids"] = alert_ids
    draft_report["cpu_usage_pct"] = None
    draft_report["memory_usage_mb"] = None
    draft_report["schema_version"] = SCHEMA_VERSION
    draft_report["generated_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    draft_report["recommendations"] = generate_system_recommendations(draft_report)
    draft_report["summary"] = generate_system_summary(draft_report)
    return draft_report


def create_full_check_summary(drift_report: Optional[dict], performance_report: Optional[dict], system_report: Optional[dict]) -> dict:
    checks_run = []
    alerts_triggered = 0
    overall_severity = "INFO"
    
    severities = {"INFO": 0, "WARNING": 1, "CRITICAL": 2}
    
    def update_severity(report_sev: str):
        nonlocal overall_severity
        if severities.get(report_sev, 0) > severities.get(overall_severity, 0):
            overall_severity = report_sev

    if drift_report:
        checks_run.append("drift")
        alerts_triggered += len(drift_report.get("alert_ids", []))
        update_severity(drift_report.get("severity", "INFO"))

    if performance_report:
        checks_run.append("performance")
        alerts_triggered += len(performance_report.get("alert_ids", []))
        update_severity(performance_report.get("severity", "INFO"))

    if system_report:
        checks_run.append("system")
        alerts_triggered += len(system_report.get("alert_ids", []))
        update_severity(system_report.get("severity", "INFO"))

    return {
        "checks_run": checks_run,
        "overall_severity": overall_severity,
        "drift": drift_report.get("summary") if drift_report else None,
        "performance": performance_report.get("summary") if performance_report else None,
        "system": system_report.get("summary") if system_report else None,
        "alerts_triggered": alerts_triggered,
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "schema_version": SCHEMA_VERSION
    }
