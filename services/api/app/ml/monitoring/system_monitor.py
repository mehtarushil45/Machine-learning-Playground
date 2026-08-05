from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

try:
    from app.ml.prediction_logger import get_recent_logs
except ImportError:
    def get_recent_logs(model_id=None, limit=50, status=None): return []

SCHEMA_VERSION = "6b.1.0"

def fetch_prediction_records(model_id: str, window_minutes: float, limit: int = 5000) -> List[dict]:
    records = get_recent_logs(model_id=model_id, limit=limit)
    if not records:
        return []
        
    now = datetime.now(timezone.utc)
    filtered = []
    for r in records:
        time_str = r.get('request_time') or r.get('logged_at')
        if not time_str:
            continue
        try:
            record_time = datetime.fromisoformat(time_str.replace('Z', '+00:00'))
            if record_time.tzinfo is None:
                record_time = record_time.replace(tzinfo=timezone.utc)
            delta = (now - record_time).total_seconds() / 60.0
            if delta <= window_minutes:
                filtered.append(r)
        except ValueError:
            pass
            
    return filtered

def compute_latency_stats(records: List[dict]) -> dict:
    latencies = [r['latency_ms'] for r in records if r.get('latency_ms') is not None]
    if not latencies:
        return {
            "p50_ms": None, "p95_ms": None, "p99_ms": None,
            "mean_ms": None, "max_ms": None, "min_ms": None,
            "sample_count": 0
        }
        
    latencies.sort()
    n = len(latencies)
    
    def percentile(p):
        idx = (p * (n - 1)) / 100.0
        i = int(idx)
        if i >= n - 1:
            return float(latencies[-1])
        f = idx - i
        return float(latencies[i] + f * (latencies[i+1] - latencies[i]))
        
    return {
        "p50_ms": percentile(50),
        "p95_ms": percentile(95),
        "p99_ms": percentile(99),
        "mean_ms": sum(latencies) / n,
        "max_ms": float(latencies[-1]),
        "min_ms": float(latencies[0]),
        "sample_count": n
    }

def compute_throughput(records: List[dict], window_minutes: float) -> float:
    if not records or window_minutes <= 0:
        return 0.0
    return len(records) / window_minutes

def compute_error_rate(records: List[dict]) -> float:
    if not records:
        return 0.0
    errors = sum(1 for r in records if r.get('status') == 'error')
    return errors / len(records)

def check_thresholds(latency_stats: dict, throughput: float, error_rate: float, request_count: int, config: dict) -> List[str]:
    breaches = []
    
    p95_threshold = config.get('latency_p95_threshold_ms')
    if p95_threshold is not None and latency_stats.get('p95_ms') is not None:
        if latency_stats['p95_ms'] > p95_threshold:
            breaches.append('LATENCY_P95_BREACH')
            
    err_threshold = config.get('error_rate_threshold')
    if err_threshold is not None:
        if error_rate > err_threshold:
            breaches.append('ERROR_RATE_BREACH')
            
    return breaches

def determine_system_severity(thresholds_breached: List[str]) -> str:
    if 'ERROR_RATE_BREACH' in thresholds_breached:
        return 'CRITICAL'
    if 'LATENCY_P95_BREACH' in thresholds_breached:
        return 'WARNING'
    return 'INFO'

def run_system_check(monitoring_id: str, deployment_id: str, model_id: str, config: dict) -> dict:
    window_minutes = config.get('throughput_window_minutes', 60.0)
    records = fetch_prediction_records(model_id, window_minutes, limit=5000)
    
    min_predictions = config.get('min_predictions', 10)
    if len(records) < min_predictions:
        return {'insufficient_data': True}
        
    latency_stats = compute_latency_stats(records)
    throughput_rpm = compute_throughput(records, window_minutes)
    error_rate = compute_error_rate(records)
    
    breached = check_thresholds(latency_stats, throughput_rpm, error_rate, len(records), config)
    severity = determine_system_severity(breached)
    
    return {
        "report_id": "sr-" + uuid.uuid4().hex[:8],
        "schema_version": "6b.1.0",
        "monitoring_id": monitoring_id,
        "deployment_id": deployment_id,
        "window_minutes": window_minutes,
        "request_count": len(records),
        "throughput_rpm": throughput_rpm,
        "latency": latency_stats,
        "error_rate": error_rate,
        "cpu_usage_pct": None,
        "memory_usage_mb": None,
        "thresholds_breached": breached,
        "severity": severity,
        "alert_triggered": False,
        "alert_id": None,
        "generated_at": datetime.now(timezone.utc).isoformat()
    }
