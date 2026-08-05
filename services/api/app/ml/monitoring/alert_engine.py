from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

try:
    from app.ml.monitoring import monitoring_registry
    from app.ml.monitoring.monitoring_models import make_alert
except ImportError:
    class DummyRegistry:
        def find_active_alert(self, *args, **kwargs): return None
        def save_alert(self, *args, **kwargs): pass
        def update_alert(self, *args, **kwargs): pass
    monitoring_registry = DummyRegistry()
    def make_alert(**kwargs): return kwargs

logger = logging.getLogger(__name__)

DEFAULT_DRIFT_RULES = [
    {'rule_id': 'drift-001', 'name': 'High feature drift', 'check': 'feature_drift', 'metric': 'overall_drift_score', 'operator': '>', 'threshold': 0.15, 'severity': 'CRITICAL'},
    {'rule_id': 'drift-002', 'name': 'Moderate feature drift', 'check': 'feature_drift', 'metric': 'overall_drift_score', 'operator': '>', 'threshold': 0.10, 'severity': 'WARNING'},
    {'rule_id': 'drift-003', 'name': 'Schema drift detected', 'check': 'schema_drift', 'metric': 'drift_detected', 'operator': '==', 'threshold': True, 'severity': 'WARNING'},
    {'rule_id': 'drift-004', 'name': 'Missing value drift', 'check': 'missing_value_drift', 'metric': 'drift_detected', 'operator': '==', 'threshold': True, 'severity': 'WARNING'},
    {'rule_id': 'drift-005', 'name': 'Distribution shift', 'check': 'distribution_drift', 'metric': 'shift_score', 'operator': '>', 'threshold': 0.15, 'severity': 'WARNING'}
]

DEFAULT_PERFORMANCE_RULES = [
    {'rule_id': 'perf-001', 'name': 'Critical accuracy degradation', 'check': 'performance', 'metric': 'accuracy', 'operator': 'delta_below', 'threshold': 0.10, 'severity': 'CRITICAL'},
    {'rule_id': 'perf-002', 'name': 'Warning accuracy degradation', 'check': 'performance', 'metric': 'accuracy', 'operator': 'delta_below', 'threshold': 0.05, 'severity': 'WARNING'},
    {'rule_id': 'perf-003', 'name': 'F1 degradation', 'check': 'performance', 'metric': 'f1', 'operator': 'delta_below', 'threshold': 0.05, 'severity': 'WARNING'}
]

DEFAULT_SYSTEM_RULES = [
    {'rule_id': 'sys-001', 'name': 'High latency P95', 'check': 'system', 'metric': 'p95_ms', 'operator': '>', 'threshold': 500, 'severity': 'WARNING'},
    {'rule_id': 'sys-002', 'name': 'Critical error rate', 'check': 'system', 'metric': 'error_rate', 'operator': '>', 'threshold': 0.05, 'severity': 'CRITICAL'}
]

def get_default_rules(check_type: str) -> List[dict]:
    if check_type == 'drift':
        return DEFAULT_DRIFT_RULES
    elif check_type == 'performance':
        return DEFAULT_PERFORMANCE_RULES
    elif check_type == 'system':
        return DEFAULT_SYSTEM_RULES
    return []

def evaluate_rule(rule: dict, report: dict, baseline_metrics: Optional[dict] = None) -> Optional[dict]:
    metric_name = rule['metric']
    op = rule['operator']
    threshold = rule['threshold']
    
    actual_value = report.get('metrics', {}).get(metric_name)
    if actual_value is None and metric_name in report:
        actual_value = report[metric_name]
    if actual_value is None and metric_name in report.get('latency', {}):
        actual_value = report['latency'].get(metric_name)
        
    if actual_value is None:
        return None
        
    triggered = False
    baseline_value = None
    
    if op == '>':
        triggered = actual_value > threshold
    elif op == '<':
        triggered = actual_value < threshold
    elif op == '>=':
        triggered = actual_value >= threshold
    elif op == '<=':
        triggered = actual_value <= threshold
    elif op == '==':
        triggered = actual_value == threshold
    elif op == 'delta_below':
        if not baseline_metrics or metric_name not in baseline_metrics:
            return None
        baseline_value = baseline_metrics[metric_name]
        if baseline_value is not None:
            triggered = actual_value < (baseline_value - threshold)
            
    if triggered:
        return {
            'rule_id': rule.get('rule_id'),
            'name': rule.get('name'),
            'operator': op,
            'threshold': threshold,
            'actual_value': actual_value,
            'baseline_value': baseline_value,
            'severity': rule.get('severity', 'WARNING'),
            'metric_name': metric_name
        }
    return None

def evaluate_rules(alert_config: dict, report: dict, report_type: str, baseline_metrics: Optional[dict] = None) -> List[dict]:
    rules = alert_config.get('rules')
    if not rules:
        rules = get_default_rules(report_type)
        
    triggered = []
    for rule in rules:
        result = evaluate_rule(rule, report, baseline_metrics)
        if result:
            triggered.append(result)
    return triggered

def make_dedup_key(monitoring_id: str, alert_type: str, alert_subtype: str, context_key: str) -> str:
    return f"{monitoring_id}|{alert_type}|{alert_subtype}|{context_key}"

def create_alert_with_dedup(monitoring_id: str, deployment_id: str, model_id: str, alert_type: str, alert_subtype: str, severity: str, title: str, message: str, context_key: str, report_id: str, metric_name: Optional[str], metric_value: Optional[float], threshold: Optional[float], context: Optional[dict]) -> dict:
    
    existing = monitoring_registry.find_active_alert(monitoring_id, alert_type, alert_subtype, context_key)
    now_str = datetime.now(timezone.utc).isoformat()
    
    if existing:
        updates = {
            "metric_value": metric_value,
            "severity": severity,
            "message": message,
        }
        return monitoring_registry.update_alert(monitoring_id, existing["alert_id"], updates)
        
    # Store context_key in context dict for deduplication index
    if context is None:
        context = {}
    context["context_key"] = context_key
    new_alert = make_alert(
        monitoring_id=monitoring_id,
        deployment_id=deployment_id,
        model_id=model_id,
        alert_type=alert_type,
        alert_subtype=alert_subtype,
        severity=severity,
        title=title,
        message=message,
        report_id=report_id,
        metric_name=metric_name,
        metric_value=metric_value,
        threshold=threshold,
        context=context,
    )
    monitoring_registry.save_alert(monitoring_id, new_alert)
    new_alert["channels_notified"] = ["event_log"]
    return new_alert

def dispatch_alert(alert: dict, alert_config: dict) -> List[str]:
    channels = ['event_log']
    
    if alert_config.get('webhook_url'):
        logger.warning('V6B webhook dispatch not implemented (V6C)')
        
    if alert_config.get('email_recipients'):
        logger.warning('V6B email dispatch not implemented (V6C)')
        
    return channels

def process_report_alerts(monitoring_id: str, deployment_id: str, model_id: str, report: dict, report_type: str, alert_config: dict, baseline_metrics: Optional[dict] = None) -> List[dict]:
    triggered = evaluate_rules(alert_config, report, report_type, baseline_metrics)
    
    created_alerts = []
    for t in triggered:
        context_key = t['metric_name']
        alert = create_alert_with_dedup(
            monitoring_id=monitoring_id,
            deployment_id=deployment_id,
            model_id=model_id,
            alert_type=report_type,
            alert_subtype=t['name'],
            severity=t['severity'],
            title=f"{t['severity']}: {t['name']}",
            message=f"Rule {t['name']} triggered. Value: {t['actual_value']}, Threshold: {t['threshold']}",
            context_key=context_key,
            report_id=report.get('report_id', ''),
            metric_name=t['metric_name'],
            metric_value=t['actual_value'],
            threshold=t['threshold'],
            context={'rule_id': t['rule_id'], 'operator': t['operator']}
        )
        dispatch_alert(alert, alert_config)
        created_alerts.append(alert)
        
    if created_alerts:
        report['alert_triggered'] = True
        report['alert_id'] = created_alerts[0].get('alert_id')
        
    return created_alerts

def resolve_alert(monitoring_id: str, alert_id: str, resolved_by: str, resolution_note: str) -> dict:
    updates = {
        "resolved": True,
        "resolved_at": datetime.now(timezone.utc).isoformat(),
        "resolved_by": resolved_by,
        "resolution_note": resolution_note,
    }
    return monitoring_registry.update_alert(monitoring_id, alert_id, updates)
