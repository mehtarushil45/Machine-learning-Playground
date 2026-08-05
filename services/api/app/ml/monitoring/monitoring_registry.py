"""V6B Monitoring Registry — Filesystem Persistence Layer.

Atomic writes throughout. All index files are append-friendly JSON arrays.
Thread-safe via module-level Lock.

Storage layout (all relative to uploads/monitoring/):
  index.json                         global monitor summaries
  alerts_index.json                  global alert summaries
  retraining/
    index.json
    <request_id>.json
  <monitoring_id>/
    config.json
    status.json
    state_history.json               append-only list
    baseline_feature.json
    baseline_performance.json
    actuals/
      YYYY-MM-DD.jsonl
    drift_reports/index.json + <id>.json
    performance_reports/index.json + <id>.json
    system_reports/index.json + <id>.json
    alerts/index.json + <id>.json
"""
from __future__ import annotations

import json
import logging
import os
import time
from datetime import datetime, timezone
from threading import Lock
from typing import Any, Dict, List, Optional

logger = logging.getLogger("apex_ml.monitoring.registry")

_REGISTRY_LOCK = Lock()

# ---------------------------------------------------------------------------
# Path helpers
# ---------------------------------------------------------------------------

def _monitoring_root() -> str:
    return os.path.abspath(os.path.join(".", "uploads", "monitoring"))


def _monitor_dir(monitoring_id: str) -> str:
    return os.path.join(_monitoring_root(), monitoring_id)


def _index_path() -> str:
    return os.path.join(_monitoring_root(), "index.json")


def _alerts_index_path() -> str:
    return os.path.join(_monitoring_root(), "alerts_index.json")


def _retraining_root() -> str:
    return os.path.join(_monitoring_root(), "retraining")


def _retraining_index_path() -> str:
    return os.path.join(_retraining_root(), "index.json")


def _reports_dir(monitoring_id: str, report_type: str) -> str:
    return os.path.join(_monitor_dir(monitoring_id), f"{report_type}_reports")


def _alerts_dir(monitoring_id: str) -> str:
    return os.path.join(_monitor_dir(monitoring_id), "alerts")


def _actuals_dir(monitoring_id: str) -> str:
    return os.path.join(_monitor_dir(monitoring_id), "actuals")


# ---------------------------------------------------------------------------
# I/O helpers
# ---------------------------------------------------------------------------

def _atomic_write(path: str, data: Any) -> None:
    """Write JSON atomically via tmp → os.replace()."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + f".{os.getpid()}.tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=2, default=str)
        try:
            os.replace(tmp, path)
        except PermissionError:
            time.sleep(0.01)
            if os.path.exists(path):
                os.remove(path)
            os.replace(tmp, path)
    except Exception:
        if os.path.exists(tmp):
            try:
                os.remove(tmp)
            except OSError:
                pass
        raise


def _read_json(path: str, default: Any = None) -> Any:
    if not os.path.exists(path):
        return default
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except Exception as exc:
        logger.error("Failed to read %s: %s", path, exc)
        return default


def _append_jsonl(path: str, record: dict) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(record, default=str) + "\n")


def _read_jsonl(path: str) -> List[dict]:
    if not os.path.exists(path):
        return []
    records = []
    try:
        with open(path, "r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if line:
                    try:
                        records.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue
    except Exception as exc:
        logger.error("Failed to read JSONL %s: %s", path, exc)
    return records


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Public API — Monitor CRUD
# ---------------------------------------------------------------------------

def register_monitor(config: dict) -> str:
    """Persist a new monitoring config. Returns monitoring_id."""
    monitoring_id = config["monitoring_id"]
    mdir = _monitor_dir(monitoring_id)
    os.makedirs(mdir, exist_ok=True)

    with _REGISTRY_LOCK:
        # Write config
        _atomic_write(os.path.join(mdir, "config.json"), config)

        # Write initial status
        status = {
            "monitoring_id": monitoring_id,
            "state": "INACTIVE",
            "last_drift_check": None,
            "last_performance_check": None,
            "last_system_check": None,
            "predictions_since_last_check": 0,
            "total_predictions_monitored": 0,
            "active_alerts_count": 0,
            "drift_detected": False,
            "last_drift_score": None,
            "last_error": None,
            "last_checked_at": None,
            "updated_at": _utc_now(),
        }
        _atomic_write(os.path.join(mdir, "status.json"), status)

        # Write empty state history
        _atomic_write(os.path.join(mdir, "state_history.json"), [])

        # Update global index
        index = _read_json(_index_path(), default=[])
        summary = {
            "monitoring_id": monitoring_id,
            "deployment_id": config.get("deployment_id"),
            "model_id": config.get("model_id"),
            "monitoring_name": config.get("monitoring_name"),
            "monitoring_state": "INACTIVE",
            "created_at": config.get("created_at"),
        }
        index.append(summary)
        _atomic_write(_index_path(), index)

    return monitoring_id


def update_monitor_state(monitoring_id: str, new_state: str, event: dict) -> dict:
    """Atomically update state in status + config, append event to history. Returns status."""
    mdir = _monitor_dir(monitoring_id)
    with _REGISTRY_LOCK:
        # Append event to history
        history_path = os.path.join(mdir, "state_history.json")
        history = _read_json(history_path, default=[])
        history.append(event)
        _atomic_write(history_path, history)

        # Update status
        status = _read_json(os.path.join(mdir, "status.json"), default={})
        status["state"] = new_state
        status["last_checked_at"] = _utc_now()
        status["updated_at"] = _utc_now()
        _atomic_write(os.path.join(mdir, "status.json"), status)

        # Update config
        config = _read_json(os.path.join(mdir, "config.json"), default={})
        config["monitoring_state"] = new_state
        config["updated_at"] = _utc_now()
        _atomic_write(os.path.join(mdir, "config.json"), config)

        # Update global index
        index = _read_json(_index_path(), default=[])
        for entry in index:
            if entry.get("monitoring_id") == monitoring_id:
                entry["monitoring_state"] = new_state
                break
        _atomic_write(_index_path(), index)

    return status


def update_monitor_status(monitoring_id: str, status_patch: dict) -> dict:
    """Merge status_patch into status.json. Returns updated status."""
    mdir = _monitor_dir(monitoring_id)
    with _REGISTRY_LOCK:
        status = _read_json(os.path.join(mdir, "status.json"), default={})
        status.update(status_patch)
        status["updated_at"] = _utc_now()
        _atomic_write(os.path.join(mdir, "status.json"), status)
    return status


def update_monitor_config(monitoring_id: str, config_patch: dict) -> dict:
    """Merge config_patch into config.json. Returns updated config."""
    mdir = _monitor_dir(monitoring_id)
    with _REGISTRY_LOCK:
        config = _read_json(os.path.join(mdir, "config.json"), default={})
        config.update(config_patch)
        config["updated_at"] = _utc_now()
        _atomic_write(os.path.join(mdir, "config.json"), config)
    return config


def get_monitor(monitoring_id: str) -> Optional[dict]:
    """Return config.json for monitoring_id, or None."""
    path = os.path.join(_monitor_dir(monitoring_id), "config.json")
    return _read_json(path, default=None)


def get_monitor_status(monitoring_id: str) -> Optional[dict]:
    """Return status.json for monitoring_id, or None."""
    path = os.path.join(_monitor_dir(monitoring_id), "status.json")
    return _read_json(path, default=None)


def list_monitors(
    deployment_id: Optional[str] = None,
    model_id: Optional[str] = None,
    state: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> List[dict]:
    """List monitoring summaries from index.json with optional filters."""
    with _REGISTRY_LOCK:
        index = _read_json(_index_path(), default=[])
    if deployment_id:
        index = [m for m in index if m.get("deployment_id") == deployment_id]
    if model_id:
        index = [m for m in index if m.get("model_id") == model_id]
    if state:
        index = [m for m in index if m.get("monitoring_state") == state]
    return index[offset: offset + limit]


def get_state_history(monitoring_id: str) -> List[dict]:
    """Return state_history.json list."""
    path = os.path.join(_monitor_dir(monitoring_id), "state_history.json")
    return _read_json(path, default=[])


# ---------------------------------------------------------------------------
# Baselines
# ---------------------------------------------------------------------------

def save_feature_baseline(monitoring_id: str, baseline: dict) -> None:
    path = os.path.join(_monitor_dir(monitoring_id), "baseline_feature.json")
    with _REGISTRY_LOCK:
        _atomic_write(path, baseline)


def get_feature_baseline(monitoring_id: str) -> Optional[dict]:
    path = os.path.join(_monitor_dir(monitoring_id), "baseline_feature.json")
    return _read_json(path, default=None)


def save_performance_baseline(monitoring_id: str, baseline: dict) -> None:
    path = os.path.join(_monitor_dir(monitoring_id), "baseline_performance.json")
    with _REGISTRY_LOCK:
        _atomic_write(path, baseline)


def get_performance_baseline(monitoring_id: str) -> Optional[dict]:
    path = os.path.join(_monitor_dir(monitoring_id), "baseline_performance.json")
    return _read_json(path, default=None)


# ---------------------------------------------------------------------------
# Actuals (daily rolling files)
# ---------------------------------------------------------------------------

def append_actual(monitoring_id: str, actual_record: dict) -> None:
    """Append ground truth record to actuals/YYYY-MM-DD.jsonl (UTC today)."""
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    path = os.path.join(_actuals_dir(monitoring_id), f"{date_str}.jsonl")
    with _REGISTRY_LOCK:
        _append_jsonl(path, actual_record)


def get_actuals(
    monitoring_id: str,
    date_str: Optional[str] = None,
    limit: int = 1000,
) -> List[dict]:
    """Read actuals. If date_str given, read that day's file.
    If None, read all daily files sorted by date (newest first), capped at limit."""
    adir = _actuals_dir(monitoring_id)
    if date_str:
        path = os.path.join(adir, f"{date_str}.jsonl")
        records = _read_jsonl(path)
        return records[:limit]

    # Read all daily files
    if not os.path.exists(adir):
        return []
    files = sorted(
        [f for f in os.listdir(adir) if f.endswith(".jsonl")],
        reverse=True,
    )
    all_records: List[dict] = []
    for fname in files:
        recs = _read_jsonl(os.path.join(adir, fname))
        all_records.extend(recs)
        if len(all_records) >= limit:
            break
    return all_records[:limit]


# ---------------------------------------------------------------------------
# Reports (drift, performance, system)
# ---------------------------------------------------------------------------

def save_report(monitoring_id: str, report_type: str, report: dict) -> str:
    """Save a report. Returns report_id."""
    report_id = report.get("report_id", f"{report_type[:2]}-unknown")
    rdir = _reports_dir(monitoring_id, report_type)
    os.makedirs(rdir, exist_ok=True)
    with _REGISTRY_LOCK:
        _atomic_write(os.path.join(rdir, f"{report_id}.json"), report)
        # Update index
        idx_path = os.path.join(rdir, "index.json")
        idx = _read_json(idx_path, default=[])
        summary = {
            "report_id": report_id,
            "generated_at": report.get("generated_at"),
            "severity": report.get("severity"),
            "drift_detected": report.get("drift_detected"),
            "degradation_detected": report.get("degradation_detected"),
            "schema_version": report.get("schema_version"),
        }
        idx.append(summary)
        # Keep newest first
        idx.sort(key=lambda r: r.get("generated_at") or "", reverse=True)
        _atomic_write(idx_path, idx)
    return report_id


def get_report(monitoring_id: str, report_type: str, report_id: str) -> Optional[dict]:
    path = os.path.join(_reports_dir(monitoring_id, report_type), f"{report_id}.json")
    return _read_json(path, default=None)


def list_reports(monitoring_id: str, report_type: str, limit: int = 20) -> List[dict]:
    idx_path = os.path.join(_reports_dir(monitoring_id, report_type), "index.json")
    idx = _read_json(idx_path, default=[])
    return idx[:limit]


# ---------------------------------------------------------------------------
# Alerts
# ---------------------------------------------------------------------------

def save_alert(monitoring_id: str, alert: dict) -> str:
    """Save alert. Updates local and global alert indexes. Returns alert_id."""
    alert_id = alert.get("alert_id", "al-unknown")
    adir = _alerts_dir(monitoring_id)
    os.makedirs(adir, exist_ok=True)
    with _REGISTRY_LOCK:
        _atomic_write(os.path.join(adir, f"{alert_id}.json"), alert)
        # Update local index
        idx_path = os.path.join(adir, "index.json")
        idx = _read_json(idx_path, default=[])
        summary = _alert_summary(alert)
        idx.append(summary)
        _atomic_write(idx_path, idx)
        # Update global index
        gidx = _read_json(_alerts_index_path(), default=[])
        gidx.append(summary)
        _atomic_write(_alerts_index_path(), gidx)
    return alert_id


def update_alert(monitoring_id: str, alert_id: str, updates: dict) -> dict:
    """Merge updates into alert. Returns updated alert."""
    adir = _alerts_dir(monitoring_id)
    path = os.path.join(adir, f"{alert_id}.json")
    with _REGISTRY_LOCK:
        alert = _read_json(path, default={})
        alert.update(updates)
        alert["updated_at"] = _utc_now()
        _atomic_write(path, alert)
        # Update local index
        idx_path = os.path.join(adir, "index.json")
        idx = _read_json(idx_path, default=[])
        for i, entry in enumerate(idx):
            if entry.get("alert_id") == alert_id:
                idx[i] = _alert_summary(alert)
                break
        _atomic_write(idx_path, idx)
        # Update global index
        gidx = _read_json(_alerts_index_path(), default=[])
        for i, entry in enumerate(gidx):
            if entry.get("alert_id") == alert_id:
                gidx[i] = _alert_summary(alert)
                break
        _atomic_write(_alerts_index_path(), gidx)
    return alert


def get_alert(monitoring_id: str, alert_id: str) -> Optional[dict]:
    path = os.path.join(_alerts_dir(monitoring_id), f"{alert_id}.json")
    return _read_json(path, default=None)


def list_alerts(
    monitoring_id: str,
    severity: Optional[str] = None,
    resolved: Optional[bool] = None,
    limit: int = 50,
) -> List[dict]:
    idx_path = os.path.join(_alerts_dir(monitoring_id), "index.json")
    idx = _read_json(idx_path, default=[])
    if severity:
        idx = [a for a in idx if a.get("severity") == severity]
    if resolved is not None:
        idx = [a for a in idx if a.get("resolved") == resolved]
    return idx[:limit]


def list_all_alerts(
    severity: Optional[str] = None,
    resolved: Optional[bool] = None,
    limit: int = 100,
) -> List[dict]:
    gidx = _read_json(_alerts_index_path(), default=[])
    if severity:
        gidx = [a for a in gidx if a.get("severity") == severity]
    if resolved is not None:
        gidx = [a for a in gidx if a.get("resolved") == resolved]
    return gidx[:limit]


def find_active_alert(
    monitoring_id: str,
    alert_type: str,
    alert_subtype: str,
    context_key: str,
) -> Optional[dict]:
    """Find unresolved alert by dedup key. For UPSERT strategy."""
    idx_path = os.path.join(_alerts_dir(monitoring_id), "index.json")
    idx = _read_json(idx_path, default=[])
    for summary in idx:
        if (
            summary.get("alert_type") == alert_type
            and summary.get("alert_subtype") == alert_subtype
            and summary.get("context_key") == context_key
            and not summary.get("resolved", False)
        ):
            # Load full alert
            return get_alert(monitoring_id, summary["alert_id"])
    return None


def _alert_summary(alert: dict) -> dict:
    return {
        "alert_id": alert.get("alert_id"),
        "monitoring_id": alert.get("monitoring_id"),
        "deployment_id": alert.get("deployment_id"),
        "model_id": alert.get("model_id"),
        "alert_type": alert.get("alert_type"),
        "alert_subtype": alert.get("alert_subtype"),
        "context_key": alert.get("context", {}).get("context_key") or alert.get("metric_name", ""),
        "severity": alert.get("severity"),
        "title": alert.get("title"),
        "triggered_at": alert.get("triggered_at"),
        "resolved": alert.get("resolved", False),
        "resolved_at": alert.get("resolved_at"),
    }


# ---------------------------------------------------------------------------
# Retraining Requests
# ---------------------------------------------------------------------------

def save_retraining_request(request: dict) -> str:
    """Save retraining request. Returns request_id."""
    request_id = request.get("request_id", "ret-unknown")
    rroot = _retraining_root()
    os.makedirs(rroot, exist_ok=True)
    with _REGISTRY_LOCK:
        _atomic_write(os.path.join(rroot, f"{request_id}.json"), request)
        idx = _read_json(_retraining_index_path(), default=[])
        summary = {
            "request_id": request_id,
            "monitoring_id": request.get("monitoring_id"),
            "model_id": request.get("model_id"),
            "source_model_version": request.get("source_model_version"),
            "trigger_type": request.get("trigger_type"),
            "status": request.get("status"),
            "priority": request.get("priority"),
            "created_at": request.get("created_at"),
        }
        idx.append(summary)
        _atomic_write(_retraining_index_path(), idx)
    return request_id


def update_retraining_request(request_id: str, updates: dict) -> dict:
    path = os.path.join(_retraining_root(), f"{request_id}.json")
    with _REGISTRY_LOCK:
        req = _read_json(path, default={})
        req.update(updates)
        req["updated_at"] = _utc_now()
        _atomic_write(path, req)
        # Update index status
        idx = _read_json(_retraining_index_path(), default=[])
        for entry in idx:
            if entry.get("request_id") == request_id:
                entry["status"] = req.get("status")
                break
        _atomic_write(_retraining_index_path(), idx)
    return req


def get_retraining_request(request_id: str) -> Optional[dict]:
    path = os.path.join(_retraining_root(), f"{request_id}.json")
    return _read_json(path, default=None)


def list_retraining_requests(
    monitoring_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 50,
) -> List[dict]:
    idx = _read_json(_retraining_index_path(), default=[])
    if monitoring_id:
        idx = [r for r in idx if r.get("monitoring_id") == monitoring_id]
    if status:
        idx = [r for r in idx if r.get("status") == status]
    return idx[:limit]
