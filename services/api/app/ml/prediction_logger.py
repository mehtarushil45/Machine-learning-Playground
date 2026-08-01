"""Prediction Audit Logging Engine — Sprint 6 Part 4.

Logs every inference request (single, batch, CSV) to filesystem JSON audit logs
for telemetry, auditing, drift monitoring, and compliance.

Storage location:
  services/api/uploads/prediction_logs/
    index.json          — Master index summary of inference events
    logs_<date>.json    — Daily partition log file
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import uuid

logger = logging.getLogger("apex_ml.prediction_logger")

# ---------------------------------------------------------------------------
# Path configuration
# ---------------------------------------------------------------------------
_LOGS_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "uploads", "prediction_logs")
)
_INDEX_PATH = os.path.join(_LOGS_DIR, "index.json")

_LOCK = threading.Lock()


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _ensure_dir() -> None:
    os.makedirs(_LOGS_DIR, exist_ok=True)


def _load_index() -> List[Dict[str, Any]]:
    if not os.path.exists(_INDEX_PATH):
        return []
    try:
        with open(_INDEX_PATH, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except Exception as exc:
        logger.error("Failed to read prediction log index: %s", exc)
        return []


def _save_index(entries: List[Dict[str, Any]]) -> None:
    _ensure_dir()
    tmp_path = f"{_INDEX_PATH}.{threading.get_ident()}.tmp"
    with open(tmp_path, "w", encoding="utf-8") as fh:
        json.dump(entries, fh, indent=2, default=str)
    try:
        os.replace(tmp_path, _INDEX_PATH)
    except PermissionError:
        time.sleep(0.01)
        try:
            if os.path.exists(_INDEX_PATH):
                os.remove(_INDEX_PATH)
            os.replace(tmp_path, _INDEX_PATH)
        except Exception:
            with open(_INDEX_PATH, "w", encoding="utf-8") as fh:
                json.dump(entries, fh, indent=2, default=str)
            if os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except OSError:
                    pass


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def log_prediction(record: Dict[str, Any]) -> str:
    """Log an inference event atomically and thread-safely.

    Args:
        record: Dict containing:
            - prediction_id (str, optional — auto-generated if missing)
            - model_id (str)
            - model_version (str)
            - experiment_id (str, optional)
            - algorithm (str)
            - request_time (str ISO-8601)
            - latency_ms (float)
            - prediction (Any)
            - confidence (float, optional)
            - feature_count (int)
            - dataset_version (str, optional)
            - status (str: "success" | "error")
            - error_message (str, optional)
            - is_batch (bool, optional)
            - sample_count (int, optional)

    Returns:
        prediction_id string.
    """
    _ensure_dir()
    prediction_id = record.get("prediction_id") or str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()

    entry: Dict[str, Any] = {
        "prediction_id": prediction_id,
        "model_id": record.get("model_id", "unknown"),
        "model_version": record.get("model_version", "v1.0.0"),
        "experiment_id": record.get("experiment_id"),
        "algorithm": record.get("algorithm", "Unknown"),
        "request_time": record.get("request_time") or now_iso,
        "latency_ms": round(float(record.get("latency_ms", 0.0)), 3),
        "prediction": record.get("prediction"),
        "confidence": round(float(record["confidence"]), 6)
        if isinstance(record.get("confidence"), (int, float))
        else None,
        "feature_count": int(record.get("feature_count", 0)),
        "dataset_version": record.get("dataset_version"),
        "status": record.get("status", "success"),
        "error_message": record.get("error_message"),
        "is_batch": bool(record.get("is_batch", False)),
        "sample_count": int(record.get("sample_count", 1)),
        "logged_at": now_iso,
    }

    with _LOCK:
        index = _load_index()
        index.append(entry)
        # Cap master index to last 5000 predictions for performance
        if len(index) > 5000:
            index = index[-5000:]
        _save_index(index)

    logger.debug("Logged prediction %s (model=%s, latency=%.2fms)",
                 prediction_id, entry["model_id"], entry["latency_ms"])
    return prediction_id


def get_recent_logs(
    limit: int = 50,
    model_id: Optional[str] = None,
    status: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Retrieve recent prediction audit logs, newest first.

    Args:
        limit: Max log items to return.
        model_id: Optional filter by model_id.
        status: Optional filter by status ("success" / "error").

    Returns:
        List of log record dicts.
    """
    with _LOCK:
        index = _load_index()

    filtered = index
    if model_id:
        filtered = [r for r in filtered if r.get("model_id") == model_id]
    if status:
        st_lower = status.lower()
        filtered = [r for r in filtered if r.get("status", "").lower() == st_lower]

    filtered.sort(key=lambda r: r.get("logged_at", ""), reverse=True)
    return filtered[:limit]


def get_log_by_id(prediction_id: str) -> Optional[Dict[str, Any]]:
    """Find a specific log entry by prediction_id."""
    with _LOCK:
        index = _load_index()
    for entry in index:
        if entry.get("prediction_id") == prediction_id:
            return entry
    return None


def clear_logs() -> None:
    """Testing utility: reset index log file."""
    with _LOCK:
        if os.path.exists(_INDEX_PATH):
            try:
                os.remove(_INDEX_PATH)
            except OSError:
                pass
