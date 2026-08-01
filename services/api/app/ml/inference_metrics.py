"""Inference Performance & Telemetry Metrics Collector — Sprint 6 Part 5.

Tracks real-time operational telemetry for model serving:
  - Latency (avg, min, max, p50, p90, p95, p99)
  - Request counts (total, successful, failed)
  - Model load counts & active cache count
  - Error distribution breakdown
  - Process memory footprint (MB)
"""

from __future__ import annotations

from collections import deque
import logging
import os
import threading
from typing import Any, Dict, List, Optional

try:
    import psutil
except ImportError:
    psutil = None  # Optional memory metrics fallback

logger = logging.getLogger("apex_ml.inference_metrics")

_LOCK = threading.Lock()

# ---------------------------------------------------------------------------
# State variables
# ---------------------------------------------------------------------------
_TOTAL_REQUESTS: int = 0
_SUCCESSFUL_REQUESTS: int = 0
_FAILED_REQUESTS: int = 0
_TOTAL_LATENCY_MS: float = 0.0
_MODEL_LOAD_COUNT: int = 0
_LATENCY_HISTORY: deque = deque(maxlen=2000)  # rolling window of 2000 latencies
_MODEL_REQUEST_COUNTS: Dict[str, int] = {}
_ERROR_COUNTS: Dict[str, int] = {}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def record_request(
    latency_ms: float,
    success: bool = True,
    model_id: str = "unknown",
    error: Optional[str] = None,
) -> None:
    """Record a single inference request event.

    Args:
        latency_ms: Execution duration in milliseconds.
        success: True if inference completed without exception.
        model_id: ID of the model serving the request.
        error: Error category or message if failed.
    """
    global _TOTAL_REQUESTS, _SUCCESSFUL_REQUESTS, _FAILED_REQUESTS, _TOTAL_LATENCY_MS

    lat = max(0.0, float(latency_ms))
    with _LOCK:
        _TOTAL_REQUESTS += 1
        _TOTAL_LATENCY_MS += lat
        _LATENCY_HISTORY.append(lat)

        if success:
            _SUCCESSFUL_REQUESTS += 1
        else:
            _FAILED_REQUESTS += 1

        _MODEL_REQUEST_COUNTS[model_id] = _MODEL_REQUEST_COUNTS.get(model_id, 0) + 1

        if error:
            err_key = str(error)[:100]
            _ERROR_COUNTS[err_key] = _ERROR_COUNTS.get(err_key, 0) + 1


def record_model_load(model_id: str) -> None:
    """Record a model cold-start or cache-miss load event."""
    global _MODEL_LOAD_COUNT
    with _LOCK:
        _MODEL_LOAD_COUNT += 1
    logger.info("Recorded model load event for %s (total_loads=%d)", model_id, _MODEL_LOAD_COUNT)


def get_metrics_summary(cached_model_count: int = 0) -> Dict[str, Any]:
    """Calculate rolling statistical summary of inference engine performance.

    Args:
        cached_model_count: Current count of models held in memory cache.

    Returns:
        Structured telemetry summary dictionary.
    """
    with _LOCK:
        tot_req = _TOTAL_REQUESTS
        succ_req = _SUCCESSFUL_REQUESTS
        fail_req = _FAILED_REQUESTS
        tot_lat = _TOTAL_LATENCY_MS
        load_cnt = _MODEL_LOAD_COUNT
        history = list(_LATENCY_HISTORY)
        model_counts = dict(_MODEL_REQUEST_COUNTS)
        err_counts = dict(_ERROR_COUNTS)

    avg_lat = round(tot_lat / tot_req, 3) if tot_req > 0 else 0.0
    err_rate = round(fail_req / tot_req, 4) if tot_req > 0 else 0.0

    percentiles = _compute_percentiles(history)

    # Process RSS Memory
    mem_mb = 0.0
    if psutil is not None:
        try:
            proc = psutil.Process(os.getpid())
            mem_mb = round(proc.memory_info().rss / (1024 * 1024), 2)
        except Exception:
            pass

    return {
        "requests": {
            "total": tot_req,
            "successful": succ_req,
            "failed": fail_req,
            "error_rate": err_rate,
        },
        "latency_ms": {
            "average": avg_lat,
            "min": percentiles["min"],
            "max": percentiles["max"],
            "p50": percentiles["p50"],
            "p90": percentiles["p90"],
            "p95": percentiles["p95"],
            "p99": percentiles["p99"],
        },
        "engine": {
            "model_load_count": load_cnt,
            "cached_models_count": cached_model_count,
            "process_memory_mb": mem_mb,
        },
        "model_request_counts": model_counts,
        "error_distribution": err_counts,
    }


def reset_metrics() -> None:
    """Reset all in-memory telemetry counters (useful for unit testing)."""
    global _TOTAL_REQUESTS, _SUCCESSFUL_REQUESTS, _FAILED_REQUESTS, _TOTAL_LATENCY_MS, _MODEL_LOAD_COUNT
    with _LOCK:
        _TOTAL_REQUESTS = 0
        _SUCCESSFUL_REQUESTS = 0
        _FAILED_REQUESTS = 0
        _TOTAL_LATENCY_MS = 0.0
        _MODEL_LOAD_COUNT = 0
        _LATENCY_HISTORY.clear()
        _MODEL_REQUEST_COUNTS.clear()
        _ERROR_COUNTS.clear()


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _compute_percentiles(history: List[float]) -> Dict[str, float]:
    if not history:
        return {"min": 0.0, "max": 0.0, "p50": 0.0, "p90": 0.0, "p95": 0.0, "p99": 0.0}

    s = sorted(history)
    n = len(s)

    def _pct(p: float) -> float:
        idx = int(round(p * (n - 1)))
        idx = max(0, min(n - 1, idx))
        return round(s[idx], 3)

    return {
        "min": round(s[0], 3),
        "max": round(s[-1], 3),
        "p50": _pct(0.50),
        "p90": _pct(0.90),
        "p95": _pct(0.95),
        "p99": _pct(0.99),
    }
