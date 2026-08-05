from __future__ import annotations
import json
import os
import threading
import time
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional
import math

def atomic_write_json(path: str, data: Any) -> None:
    tmp_path = path + f".tmp.{os.getpid()}"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(data, f)
    for _ in range(3):
        try:
            os.replace(tmp_path, path)
            return
        except PermissionError:
            time.sleep(0.01)
    os.replace(tmp_path, path)

def read_json_file(path: str, default: Any = None) -> Any:
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default

def append_jsonl(path: str, record: dict, lock: threading.Lock) -> None:
    ensure_dir(os.path.dirname(path))
    line = json.dumps(record) + "\n"
    with lock:
        with open(path, "a", encoding="utf-8") as f:
            f.write(line)

def read_jsonl_file(path: str) -> List[dict]:
    results = []
    try:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        results.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue
    except FileNotFoundError:
        pass
    return results

def percentile(data: List[float], p: float) -> Optional[float]:
    if not data:
        return None
    sorted_data = sorted(data)
    n = len(sorted_data)
    if n == 0:
        return None
    if p <= 0.0:
        return sorted_data[0]
    if p >= 1.0 or p >= 100.0:
        if p >= 100.0: p = p / 100.0
        if p >= 1.0: return sorted_data[-1]
    
    rank = p * (n - 1)
    lower = int(rank)
    upper = lower + 1
    weight = rank - lower
    
    if upper >= n:
        return float(sorted_data[-1])
        
    return float(sorted_data[lower] * (1.0 - weight) + sorted_data[upper] * weight)

def mean_safe(values: List[float]) -> Optional[float]:
    if not values:
        return None
    return sum(values) / len(values)

def stddev_safe(values: List[float]) -> Optional[float]:
    if not values or len(values) < 2:
        return None
    mean_val = sum(values) / len(values)
    variance = sum((x - mean_val) ** 2 for x in values) / (len(values))
    return math.sqrt(variance)

def filter_by_time_window(records: List[dict], time_field: str, window_minutes: float) -> List[dict]:
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(minutes=window_minutes)
    filtered = []
    for r in records:
        ts_str = r.get(time_field)
        if not ts_str:
            continue
        ts = parse_iso(ts_str)
        if ts and ts >= cutoff:
            filtered.append(r)
    return filtered

def today_date_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")

def parse_iso(s: str) -> Optional[datetime]:
    try:
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        return datetime.fromisoformat(s)
    except Exception:
        return None

def monitoring_root() -> str:
    return os.path.abspath(os.path.join(".", "uploads", "monitoring"))

def monitor_dir(monitoring_id: str) -> str:
    return os.path.join(monitoring_root(), monitoring_id)

def actuals_dir(monitoring_id: str) -> str:
    return os.path.join(monitor_dir(monitoring_id), "actuals")

def actuals_path_for_date(monitoring_id: str, date_str: str) -> str:
    return os.path.join(actuals_dir(monitoring_id), date_str + ".jsonl")

def reports_dir(monitoring_id: str, report_type: str) -> str:
    return os.path.join(monitor_dir(monitoring_id), report_type + "_reports")

def alerts_dir(monitoring_id: str) -> str:
    return os.path.join(monitor_dir(monitoring_id), "alerts")

def retraining_root() -> str:
    return os.path.join(monitoring_root(), "retraining")

def ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)
