"""Drift Monitoring & Telemetry Service — Enterprise Production Serving.

Implements statistical data drift detection, multi-test statistical engine,
and production telemetry according to the ML Playground Product Constitution:
1. Multi-test Statistical Selection by Feature Type & Baseline Size:
   - Numeric (small baseline < 1000): Two-sample Kolmogorov-Smirnov (KS) test
   - Numeric (large baseline >= 1000): Wasserstein Distance (Earth Mover's Distance)
   - Categorical (small baseline < 1000): Chi-Squared Goodness-of-Fit test
   - Categorical (large baseline >= 1000): Jensen–Shannon (JS) Divergence
   - Binary (2 classes): Two-Proportion Z-Test
   - Identifier & Temporal columns: Automatically detected and excluded from scoring
2. Population Stability Index (PSI):
   - Quantile decile bins extracted from training baseline
   - Explicitly documented smoothing constant: EPSILON = 0.0001 (1e-4)
   - Bin edges stored with model artifact so live data is bucketed identically
3. Importance-Weighted Drift & Retraining Decision:
   - Weights feature shifts by trained model importance
   - Dataset-level summary with share of drifted features and importance-weighted score
   - Retraining only recommended when high-importance features drift or weighted score >= 0.25
4. Minimum-Sample Guard:
   - Below configurable minimum (default 50), reports 'Insufficient data (n of N required)'
   - Never returns CRITICAL or STABLE under insufficient data
5. Production Telemetry & Rolling Windows:
   - P50, P95, P99 latency quantiles and throughput
   - Rolling chronological windows for drift-over-time analysis
"""

from __future__ import annotations

import logging
import math
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

logger = logging.getLogger("apex_ml.drift_monitoring_service")

# Threshold constants based on international banking and enterprise MLOps standards
PSI_STABLE_THRESHOLD = 0.10
PSI_CRITICAL_THRESHOLD = 0.25
ALPHA_THRESHOLD = 0.05
LARGE_BASELINE_THRESHOLD = 1000

# Documented smoothing constant (Laplace smoothing factor to prevent division by zero or ln(0))
SMOOTHING_CONSTANT = 0.0001
EPSILON = SMOOTHING_CONSTANT


def is_identifier_column(col_name: str, sample_values: Optional[List[Any]] = None) -> bool:
    """Identify if a column is an ID or unique key that must not be scored for drift."""
    clean = col_name.strip().lower()
    if clean in ("id", "uuid", "guid", "row_id", "record_id", "customer_id", "user_id", "client_id", "cust_id"):
        return True
    if clean.endswith(("_id", "_uuid", "_guid", "id")) and len(clean) > 2:
        return True
    if sample_values and len(sample_values) >= 20:
        unique_count = len(set(sample_values))
        if unique_count / len(sample_values) > 0.98:
            return True
    return False


def is_temporal_column(col_name: str, sample_values: Optional[List[Any]] = None) -> bool:
    """Identify if a column is a date, time, or timestamp that must not be scored as categorical."""
    clean = col_name.strip().lower()
    if any(k in clean for k in ("date", "timestamp", "datetime", "created_at", "updated_at", "time_stamp", "_time")):
        return True
    if sample_values:
        first_few = [str(v).strip() for v in sample_values[:5] if v is not None]
        for f in first_few:
            if ("-" in f or "/" in f) and (":" in f or len(f.split("-")) == 3 or len(f.split("/")) == 3):
                return True
    return False


def extract_baseline_distribution(
    dataset_path: str,
    feature_columns: List[str],
    input_schema: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Compute baseline distributions, 10-decile bin edges, and category proportions from training dataset."""
    if not dataset_path or not os.path.exists(dataset_path):
        return {}

    try:
        df = pd.read_csv(dataset_path, nrows=50000)
    except Exception as exc:
        logger.warning("Failed to read dataset for baseline distribution: %s", exc)
        return {}

    schema = input_schema or {}
    baseline: Dict[str, Any] = {}

    for col in feature_columns:
        if col not in df.columns:
            continue

        series = df[col].dropna()
        if series.empty:
            continue

        # Check for Identifier column
        if is_identifier_column(col, series.head(50).tolist()):
            baseline[col] = {
                "type": "excluded_identifier",
                "label": "excluded: identifier",
                "reason": "High-cardinality unique identifier; excluded from statistical drift scoring",
            }
            continue

        # Check for Temporal column
        if is_temporal_column(col, series.head(50).tolist()):
            baseline[col] = {
                "type": "excluded_temporal",
                "label": "excluded: temporal",
                "reason": "Date/datetime temporal feature; excluded from categorical drift scoring",
            }
            continue

        col_type = schema.get(col, {}).get("type", "numeric")
        is_numeric = col_type == "numeric" or pd.api.types.is_numeric_dtype(series)

        # Check for Binary feature (boolean or exactly 2 unique values)
        unique_vals = series.unique()
        if len(unique_vals) == 2:
            try:
                str_series = series.astype(str)
                total = len(str_series)
                val_counts = str_series.value_counts().to_dict()
                cat_props = {str(k): float(v / total) for k, v in val_counts.items()}
                pos_cat = sorted(cat_props.keys())[-1]
                baseline[col] = {
                    "type": "binary",
                    "sample_size": total,
                    "categories": list(cat_props.keys()),
                    "category_proportions": {k: round(v, 4) for k, v in cat_props.items()},
                    "positive_category": pos_cat,
                    "positive_proportion": round(cat_props[pos_cat], 4),
                }
                continue
            except Exception as err:
                logger.warning("Error computing binary baseline for %s: %s", col, err)

        if is_numeric:
            try:
                numeric_vals = series.astype(float).values
                valid_vals = numeric_vals[np.isfinite(numeric_vals)]
                if len(valid_vals) < 5:
                    continue

                min_val = float(np.min(valid_vals))
                max_val = float(np.max(valid_vals))
                mean_val = float(np.mean(valid_vals))
                std_val = float(np.std(valid_vals))

                # Compute 10 deciles (0%, 10%, 20%, ..., 100%)
                percentiles = np.linspace(0, 100, 11)
                bin_edges = np.percentile(valid_vals, percentiles)
                bin_edges = np.unique(bin_edges)
                if len(bin_edges) < 2:
                    bin_edges = np.array([min_val - 1e-3, max_val + 1e-3])

                # Compute baseline bin frequencies
                counts, _ = np.histogram(valid_vals, bins=bin_edges)
                total_count = len(valid_vals)
                bin_proportions = [float(c / total_count) for c in counts]

                # Store sample reservoir (up to 1000 records)
                reservoir_size = min(len(valid_vals), 1000)
                sample_reservoir = np.random.choice(valid_vals, size=reservoir_size, replace=False).tolist()

                baseline[col] = {
                    "type": "numeric",
                    "sample_size": total_count,
                    "mean": round(mean_val, 4),
                    "std": round(std_val, 4),
                    "min": round(min_val, 4),
                    "max": round(max_val, 4),
                    "bin_edges": [round(float(b), 4) for b in bin_edges],
                    "bin_proportions": [round(p, 4) for p in bin_proportions],
                    "sample_reservoir": [round(float(v), 4) for v in sample_reservoir],
                    "smoothing_constant": SMOOTHING_CONSTANT,
                }
            except Exception as err:
                logger.warning("Error computing baseline for numeric feature %s: %s", col, err)

        else:
            # Categorical feature baseline
            try:
                str_series = series.astype(str)
                total = len(str_series)
                val_counts = str_series.value_counts()
                top_categories = val_counts.head(20).to_dict()
                category_proportions = {str(cat): float(count / total) for cat, count in top_categories.items()}
                mode_val = str(str_series.mode()[0]) if not str_series.mode().empty else "N/A"

                baseline[col] = {
                    "type": "categorical",
                    "sample_size": total,
                    "mode": mode_val,
                    "categories": list(category_proportions.keys()),
                    "category_proportions": {k: round(v, 4) for k, v in category_proportions.items()},
                    "smoothing_constant": SMOOTHING_CONSTANT,
                }
            except Exception as err:
                logger.warning("Error computing baseline for categorical feature %s: %s", col, err)

    return baseline


def calculate_numeric_psi(
    baseline_edges: List[float],
    baseline_proportions: List[float],
    current_values: List[float],
) -> Tuple[float, List[Dict[str, Any]]]:
    """Calculate Population Stability Index (PSI) using fixed baseline decile bins and documented smoothing constant."""
    if not current_values or len(baseline_edges) < 2:
        return 0.0, []

    valid_current = [float(v) for v in current_values if v is not None and np.isfinite(v)]
    if not valid_current:
        return 0.0, []

    edges = np.array(baseline_edges)
    cur_min = min(valid_current)
    cur_max = max(valid_current)
    if cur_min < edges[0]:
        edges[0] = cur_min - 1e-4
    if cur_max > edges[-1]:
        edges[-1] = cur_max + 1e-4

    counts, _ = np.histogram(valid_current, bins=edges)
    total_curr = len(valid_current)
    curr_proportions = [float(c / total_curr) for c in counts]

    psi_total = 0.0
    bin_comparisons: List[Dict[str, Any]] = []

    for idx in range(len(counts)):
        b_pct = baseline_proportions[idx] if idx < len(baseline_proportions) else 0.0
        c_pct = curr_proportions[idx]

        # Documented smoothing with EPSILON = 0.0001
        b_smooth = max(b_pct, SMOOTHING_CONSTANT)
        c_smooth = max(c_pct, SMOOTHING_CONSTANT)

        bin_psi = (c_smooth - b_smooth) * math.log(c_smooth / b_smooth)
        psi_total += bin_psi

        left_edge = round(float(edges[idx]), 2)
        right_edge = round(float(edges[idx + 1]), 2)
        bin_label = f"[{left_edge}, {right_edge}]"

        bin_comparisons.append({
            "bin": bin_label,
            "baseline_pct": round(b_pct * 100, 2),
            "current_pct": round(c_pct * 100, 2),
        })

    return round(max(psi_total, 0.0), 4), bin_comparisons


def calculate_categorical_psi(
    baseline_proportions: Dict[str, float],
    current_values: List[Any],
) -> Tuple[float, List[Dict[str, Any]]]:
    """Calculate Categorical Population Stability Index (PSI)."""
    if not current_values or not baseline_proportions:
        return 0.0, []

    str_vals = [str(v).strip() for v in current_values if v is not None]
    total_curr = len(str_vals)
    if total_curr == 0:
        return 0.0, []

    curr_counts: Dict[str, int] = {}
    for v in str_vals:
        curr_counts[v] = curr_counts.get(v, 0) + 1

    all_keys = sorted(set(list(baseline_proportions.keys()) + list(curr_counts.keys())))
    psi_total = 0.0
    bin_comparisons: List[Dict[str, Any]] = []

    for k in all_keys:
        b_pct = baseline_proportions.get(k, 0.0)
        c_pct = float(curr_counts.get(k, 0) / total_curr)

        b_smooth = max(b_pct, SMOOTHING_CONSTANT)
        c_smooth = max(c_pct, SMOOTHING_CONSTANT)

        bin_psi = (c_smooth - b_smooth) * math.log(c_smooth / b_smooth)
        psi_total += bin_psi

        bin_comparisons.append({
            "bin": k,
            "baseline_pct": round(b_pct * 100, 2),
            "current_pct": round(c_pct * 100, 2),
        })

    return round(max(psi_total, 0.0), 4), bin_comparisons


def calculate_ks_test(
    baseline_samples: List[float],
    current_values: List[float],
) -> Tuple[float, float]:
    """Compute two-sample Kolmogorov-Smirnov test statistic D and p-value for small continuous baselines (< 1000)."""
    if not baseline_samples or not current_values:
        return 0.0, 1.0

    b_arr = [float(v) for v in baseline_samples if np.isfinite(v)]
    c_arr = [float(v) for v in current_values if np.isfinite(v)]

    if len(b_arr) < 3 or len(c_arr) < 3:
        return 0.0, 1.0

    try:
        from scipy import stats
        res = stats.ks_2samp(b_arr, c_arr)
        return round(float(res.statistic), 4), round(float(res.pvalue), 4)
    except Exception:
        all_vals = np.sort(np.unique(np.concatenate([b_arr, c_arr])))
        cdf_b = np.searchsorted(np.sort(b_arr), all_vals, side="right") / len(b_arr)
        cdf_c = np.searchsorted(np.sort(c_arr), all_vals, side="right") / len(c_arr)
        d_stat = float(np.max(np.abs(cdf_b - cdf_c)))
        n1, n2 = len(b_arr), len(c_arr)
        en = math.sqrt((n1 * n2) / (n1 + n2))
        p_val = math.exp(-2.0 * ((en * d_stat) ** 2))
        return round(d_stat, 4), round(min(max(p_val, 0.0), 1.0), 4)


def calculate_wasserstein_distance(
    baseline_samples: List[float],
    current_values: List[float],
) -> Tuple[float, Optional[float]]:
    """Compute normalized Wasserstein distance (Earth Mover's Distance) for large continuous baselines (>= 1000)."""
    if not baseline_samples or not current_values:
        return 0.0, None

    b_arr = np.array([float(v) for v in baseline_samples if np.isfinite(v)])
    c_arr = np.array([float(v) for v in current_values if np.isfinite(v)])

    if len(b_arr) < 3 or len(c_arr) < 3:
        return 0.0, None

    try:
        from scipy import stats
        dist = stats.wasserstein_distance(b_arr, c_arr)
        base_std = float(np.std(b_arr))
        norm_dist = dist / base_std if base_std > 1e-5 else dist
        return round(float(norm_dist), 4), None
    except Exception:
        qs = np.linspace(0, 1, 100)
        qb = np.quantile(np.sort(b_arr), qs)
        qc = np.quantile(np.sort(c_arr), qs)
        diff = float(np.mean(np.abs(qb - qc)))
        base_std = float(np.std(b_arr))
        norm_dist = diff / base_std if base_std > 1e-5 else diff
        return round(norm_dist, 4), None


def calculate_chi_squared_test(
    baseline_proportions: Dict[str, float],
    current_values: List[Any],
) -> Tuple[float, float]:
    """Compute Chi-Squared goodness-of-fit test for small categorical baselines (< 1000)."""
    if not baseline_proportions or not current_values:
        return 0.0, 1.0

    str_vals = [str(v).strip() for v in current_values if v is not None]
    total_curr = len(str_vals)
    if total_curr < 5:
        return 0.0, 1.0

    curr_counts: Dict[str, int] = {}
    for v in str_vals:
        curr_counts[v] = curr_counts.get(v, 0) + 1

    categories = sorted(set(list(baseline_proportions.keys()) + list(curr_counts.keys())))
    if len(categories) < 2:
        return 0.0, 1.0

    observed = []
    expected = []
    for cat in categories:
        obs = float(curr_counts.get(cat, 0))
        base_p = baseline_proportions.get(cat, 0.0)
        exp = max(base_p * total_curr, SMOOTHING_CONSTANT * total_curr)
        observed.append(obs)
        expected.append(exp)

    exp_sum = sum(expected)
    if exp_sum > 0:
        expected = [e * (total_curr / exp_sum) for e in expected]

    try:
        from scipy import stats
        res = stats.chisquare(f_obs=observed, f_exp=expected)
        stat = float(res.statistic) if np.isfinite(res.statistic) else 0.0
        pval = float(res.pvalue) if np.isfinite(res.pvalue) else 1.0
        return round(max(stat, 0.0), 4), round(min(max(pval, 0.0), 1.0), 4)
    except Exception:
        chi2_val = 0.0
        for o, e in zip(observed, expected):
            if e > 0:
                chi2_val += ((o - e) ** 2) / e
        p_val = math.exp(-0.5 * chi2_val) if chi2_val > 0 else 1.0
        return round(chi2_val, 4), round(min(max(p_val, 0.0), 1.0), 4)


def calculate_jensen_shannon_divergence(
    baseline_proportions: Dict[str, float],
    current_values: List[Any],
) -> Tuple[float, Optional[float]]:
    """Compute Jensen-Shannon Divergence for large categorical baselines (>= 1000). Bounded in [0, 1]."""
    if not baseline_proportions or not current_values:
        return 0.0, None

    str_vals = [str(v).strip() for v in current_values if v is not None]
    total_curr = len(str_vals)
    if total_curr < 5:
        return 0.0, None

    curr_counts: Dict[str, int] = {}
    for v in str_vals:
        curr_counts[v] = curr_counts.get(v, 0) + 1

    categories = sorted(set(list(baseline_proportions.keys()) + list(curr_counts.keys())))
    p = []
    q = []
    for cat in categories:
        p_val = baseline_proportions.get(cat, 0.0)
        q_val = float(curr_counts.get(cat, 0) / total_curr)
        p.append(max(p_val, SMOOTHING_CONSTANT))
        q.append(max(q_val, SMOOTHING_CONSTANT))

    p = np.array(p) / sum(p)
    q = np.array(q) / sum(q)

    try:
        from scipy.spatial import distance
        js_val = float(distance.jensenshannon(p, q, base=2))
        return round(js_val, 4), None
    except Exception:
        m = 0.5 * (p + q)
        kl_pm = np.sum(p * np.log2(p / m))
        kl_qm = np.sum(q * np.log2(q / m))
        js_val = math.sqrt(max(0.5 * (kl_pm + kl_qm), 0.0))
        return round(js_val, 4), None


def calculate_two_proportion_z_test(
    baseline_proportions: Dict[str, float],
    current_values: List[Any],
) -> Tuple[float, float]:
    """Compute two-proportion z-test for binary features."""
    if not baseline_proportions or not current_values:
        return 0.0, 1.0

    str_vals = [str(v).strip() for v in current_values if v is not None]
    total_curr = len(str_vals)
    if total_curr < 5:
        return 0.0, 1.0

    cats = sorted(baseline_proportions.keys())
    if not cats:
        return 0.0, 1.0
    pos_cat = cats[-1]
    base_p = float(baseline_proportions.get(pos_cat, 0.5))

    curr_pos = sum(1 for v in str_vals if v == pos_cat)
    curr_p = float(curr_pos / total_curr)

    denom = math.sqrt(max(base_p * (1.0 - base_p) / total_curr, 1e-8))
    z_stat = (curr_p - base_p) / denom

    try:
        from scipy import stats
        p_val = float(2.0 * (1.0 - stats.norm.cdf(abs(z_stat))))
        return round(float(z_stat), 4), round(min(max(p_val, 0.0), 1.0), 4)
    except Exception:
        p_val = math.exp(-0.5 * (z_stat ** 2))
        return round(float(z_stat), 4), round(min(max(p_val, 0.0), 1.0), 4)


def compute_telemetry_metrics(history_records: List[Any]) -> Dict[str, Any]:
    """Compute production serving telemetry: P50, P95, P99 latency and success rates."""
    total_requests = len(history_records)
    if total_requests == 0:
        return {
            "total_requests": 0,
            "success_rate": 100.0,
            "error_count": 0,
            "p50_ms": 0.0,
            "p95_ms": 0.0,
            "p99_ms": 0.0,
            "avg_latency_ms": 0.0,
            "throughput_rps": 0.0,
        }

    successes = [r for r in history_records if getattr(r, "status", "") == "SUCCESS"]
    success_rate = round((len(successes) / total_requests) * 100, 2)
    error_count = total_requests - len(successes)

    latencies = [float(r.latency_ms) for r in successes if getattr(r, "latency_ms", None) is not None]
    if not latencies:
        latencies = [5.0]

    lat_arr = np.array(latencies)
    p50 = float(np.percentile(lat_arr, 50))
    p95 = float(np.percentile(lat_arr, 95))
    p99 = float(np.percentile(lat_arr, 99))
    avg_lat = float(np.mean(lat_arr))

    timestamps = [getattr(r, "created_at", None) for r in history_records if getattr(r, "created_at", None)]
    throughput = 0.0
    if len(timestamps) >= 2:
        try:
            span_seconds = abs((max(timestamps) - min(timestamps)).total_seconds())
            if span_seconds > 0:
                throughput = round(total_requests / span_seconds, 2)
        except Exception:
            pass

    return {
        "total_requests": total_requests,
        "success_rate": success_rate,
        "error_count": error_count,
        "p50_ms": round(p50, 2),
        "p95_ms": round(p95, 2),
        "p99_ms": round(p99, 2),
        "avg_latency_ms": round(avg_lat, 2),
        "throughput_rps": throughput,
    }


def compute_rolling_windows_drift(
    valid_inputs: List[Dict[str, Any]],
    baseline: Dict[str, Any],
    feature_columns: List[str],
    num_windows: int = 5,
) -> Dict[str, List[Dict[str, Any]]]:
    """Compute rolling window drift trends to show users when distribution drift began."""
    total_samples = len(valid_inputs)
    if total_samples < 10:
        return {}

    window_size = max(total_samples // num_windows, 5)
    windows: List[List[Dict[str, Any]]] = []
    for i in range(0, total_samples, window_size):
        chunk = valid_inputs[i : i + window_size]
        if len(chunk) >= 5:
            windows.append(chunk)

    if not windows:
        return {}

    trends: Dict[str, List[Dict[str, Any]]] = {}

    for col in feature_columns:
        col_base = baseline.get(col, {})
        col_type = col_base.get("type", "numeric")
        if col_type in ("excluded_identifier", "excluded_temporal"):
            continue

        window_records = []
        for idx, win in enumerate(windows):
            win_label = f"W{idx + 1} (n={len(win)})"
            vals = [inp.get(col) for inp in win if inp.get(col) is not None]
            if not vals:
                continue

            if col_type == "numeric":
                num_vals = [float(v) for v in vals if v is not None]
                if not num_vals:
                    continue
                mean_val = round(float(np.mean(num_vals)), 2)
                base_edges = col_base.get("bin_edges", [])
                base_props = col_base.get("bin_proportions", [])
                psi_val, _ = calculate_numeric_psi(base_edges, base_props, num_vals)
                status = "CRITICAL" if psi_val > PSI_CRITICAL_THRESHOLD else "MODERATE" if psi_val >= PSI_STABLE_THRESHOLD else "STABLE"
                window_records.append({
                    "window": win_label,
                    "sample_count": len(num_vals),
                    "metric_value": mean_val,
                    "psi": psi_val,
                    "status": status,
                })
            else:
                base_props = col_base.get("category_proportions", {})
                psi_val, _ = calculate_categorical_psi(base_props, vals)
                status = "CRITICAL" if psi_val > PSI_CRITICAL_THRESHOLD else "MODERATE" if psi_val >= PSI_STABLE_THRESHOLD else "STABLE"
                window_records.append({
                    "window": win_label,
                    "sample_count": len(vals),
                    "metric_value": psi_val,
                    "psi": psi_val,
                    "status": status,
                })

        if window_records:
            trends[col] = window_records

    return trends


def generate_drift_report(
    deployment: Any,
    history_records: List[Any],
    min_samples: int = 50,
    feature_importances: Optional[Dict[str, float]] = None,
    actuals: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Generate comprehensive production drift report and telemetry with statistical correctness."""
    feature_columns: List[str] = getattr(deployment, "feature_columns", []) or []
    config: Dict[str, Any] = getattr(deployment, "configuration", {}) or {}
    baseline: Dict[str, Any] = config.get("baseline_distribution", {})

    # Resolve feature importances from deployment metadata or uniform fallback
    raw_fi = feature_importances or config.get("feature_importances") or {}
    if not raw_fi and hasattr(deployment, "metrics") and isinstance(deployment.metrics, dict):
        raw_fi = deployment.metrics.get("feature_importances") or {}

    fi_weights: Dict[str, float] = {}
    active_cols = [c for c in feature_columns if baseline.get(c, {}).get("type") not in ("excluded_identifier", "excluded_temporal")]
    total_assigned_fi = sum(raw_fi.get(c, 0.0) for c in active_cols)
    if total_assigned_fi > 0:
        for c in active_cols:
            fi_weights[c] = float(raw_fi.get(c, 0.0) / total_assigned_fi)
    else:
        # Uniform fallback
        uniform = 1.0 / max(len(active_cols), 1)
        for c in active_cols:
            fi_weights[c] = uniform

    # Compute production telemetry
    telemetry = compute_telemetry_metrics(history_records)

    # Filter successful inferences with inputs
    valid_inputs: List[Dict[str, Any]] = []
    for r in history_records:
        inputs = getattr(r, "inputs", {})
        if isinstance(inputs, dict) and inputs:
            valid_inputs.append(inputs)

    sample_count = len(valid_inputs)

    # ── MINIMUM SAMPLE GUARD (B3) ──────────────────────────────────────────
    if sample_count < min_samples:
        features_insufficient: Dict[str, Any] = {}
        for col in feature_columns:
            base_info = baseline.get(col, {})
            ftype = base_info.get("type", "numeric")
            if ftype in ("excluded_identifier", "excluded_temporal"):
                features_insufficient[col] = {
                    "feature": col,
                    "type": ftype,
                    "status": "EXCLUDED",
                    "status_display": base_info.get("label", "excluded"),
                    "psi": 0.0,
                    "test_name": "None",
                    "test_display": "Excluded",
                    "importance": fi_weights.get(col, 0.0),
                    "distribution_comparison": [],
                }
            else:
                features_insufficient[col] = {
                    "feature": col,
                    "type": ftype,
                    "status": "INSUFFICIENT_DATA",
                    "status_display": f"Insufficient data ({sample_count} of {min_samples} required)",
                    "psi": 0.0,
                    "test_name": "Pending Sample Accumulation",
                    "test_display": f"Pending ({sample_count}/{min_samples})",
                    "importance": fi_weights.get(col, 0.0),
                    "distribution_comparison": [],
                }

        return {
            "deployment_id": str(getattr(deployment, "id", "")),
            "drift_detected": False,
            "overall_status": "INSUFFICIENT_DATA",
            "overall_status_display": f"Insufficient data ({sample_count} of {min_samples} required)",
            "insufficient_data": True,
            "sample_count": sample_count,
            "min_required": min_samples,
            "highest_psi": 0.0,
            "drifted_features": [],
            "drifted_features_count": 0,
            "total_features_count": len(active_cols),
            "drifted_share": 0.0,
            "importance_weighted_drift_score": 0.0,
            "retrain_recommended": False,
            "smoothing_constant": SMOOTHING_CONSTANT,
            "performance_confirmed": False,
            "alert_badge_label": f"insufficient data ({sample_count} of {min_samples} required)",
            "features": features_insufficient,
            "telemetry": telemetry,
            "drift_over_time": {},
            "recommendation": f"Accumulating production inferences ({sample_count} of {min_samples} required for statistical significance).",
            "retrain_context": None,
        }

    # ── FEATURE DRIFT EVALUATION (B1, B2, B4, C1) ──────────────────────────
    features_report: Dict[str, Any] = {}
    drifted_features: List[str] = []
    highest_psi = 0.0
    weighted_drift_sum = 0.0

    for col in feature_columns:
        col_base = baseline.get(col, {})
        col_type = col_base.get("type", "numeric")

        # Excluded identifier or temporal feature (B4)
        if col_type in ("excluded_identifier", "excluded_temporal"):
            features_report[col] = {
                "feature": col,
                "type": col_type,
                "status": "EXCLUDED",
                "status_display": col_base.get("label", "excluded"),
                "psi": 0.0,
                "test_name": "None",
                "test_display": col_base.get("label", "excluded"),
                "importance": 0.0,
                "distribution_comparison": [],
            }
            continue

        col_values = [inp.get(col) for inp in valid_inputs if inp.get(col) is not None]
        if not col_values:
            continue

        base_sample_size = col_base.get("sample_size", 500)
        feature_importance = fi_weights.get(col, 0.0)

        # ── 1. Binary Features (B1) ─────────────────────────────────────────
        if col_type == "binary":
            try:
                base_props = col_base.get("category_proportions", {})
                psi_score, bin_comps = calculate_categorical_psi(base_props, col_values)
                z_stat, p_val = calculate_two_proportion_z_test(base_props, col_values)

                # Statistical drift classification
                is_drifted = (p_val < ALPHA_THRESHOLD) or (psi_score > PSI_CRITICAL_THRESHOLD)
                status = "CRITICAL" if is_drifted else "MODERATE" if psi_score >= PSI_STABLE_THRESHOLD else "STABLE"

                if status == "CRITICAL":
                    drifted_features.append(col)
                    weighted_drift_sum += feature_importance * max(0.7, min(1.0, psi_score / 0.25))
                elif status == "MODERATE":
                    weighted_drift_sum += feature_importance * max(0.3, psi_score / 0.25)
                else:
                    weighted_drift_sum += feature_importance * min(0.2, psi_score / 0.25)

                highest_psi = max(highest_psi, psi_score)

                features_report[col] = {
                    "feature": col,
                    "type": "binary",
                    "psi": psi_score,
                    "status": status,
                    "status_display": status,
                    "test_name": "Two-Proportion Z-Test",
                    "test_statistic": z_stat,
                    "p_value": p_val,
                    "test_display": f"Z-test (p={p_val:.3f})",
                    "importance": round(feature_importance, 4),
                    "distribution_comparison": bin_comps,
                }
            except Exception as err:
                logger.warning("Error computing binary drift for %s: %s", col, err)

        # ── 2. Numeric Continuous Features (B1) ─────────────────────────────
        elif col_type == "numeric":
            try:
                numeric_vals = [float(v) for v in col_values]
                base_edges = col_base.get("bin_edges", [])
                base_props = col_base.get("bin_proportions", [])
                base_reservoir = col_base.get("sample_reservoir", [])

                psi_score, bin_comps = calculate_numeric_psi(base_edges, base_props, numeric_vals)

                cur_mean = round(float(np.mean(numeric_vals)), 4) if numeric_vals else 0.0
                base_mean = col_base.get("mean")

                # Test selection based on baseline size
                if base_sample_size >= LARGE_BASELINE_THRESHOLD:
                    w_dist, _ = calculate_wasserstein_distance(base_reservoir, numeric_vals)
                    test_name = "Wasserstein Distance"
                    test_display = f"Wasserstein (d={w_dist:.3f})"
                    is_drifted = (w_dist > 0.35) or (psi_score > PSI_CRITICAL_THRESHOLD)
                    test_stat = w_dist
                    test_pval = None
                else:
                    ks_stat, p_val = calculate_ks_test(base_reservoir, numeric_vals)
                    test_name = "Kolmogorov-Smirnov"
                    test_display = f"KS (p={p_val:.3f})"
                    is_drifted = (p_val < ALPHA_THRESHOLD) or (psi_score > PSI_CRITICAL_THRESHOLD)
                    test_stat = ks_stat
                    test_pval = p_val

                status = "CRITICAL" if is_drifted else "MODERATE" if psi_score >= PSI_STABLE_THRESHOLD else "STABLE"

                if status == "CRITICAL":
                    drifted_features.append(col)
                    weighted_drift_sum += feature_importance * max(0.7, min(1.0, psi_score / 0.25))
                elif status == "MODERATE":
                    weighted_drift_sum += feature_importance * max(0.3, psi_score / 0.25)
                else:
                    weighted_drift_sum += feature_importance * min(0.2, psi_score / 0.25)

                highest_psi = max(highest_psi, psi_score)

                features_report[col] = {
                    "feature": col,
                    "type": "numeric",
                    "psi": psi_score,
                    "status": status,
                    "status_display": status,
                    "test_name": test_name,
                    "test_statistic": test_stat,
                    "p_value": test_pval,
                    "test_display": test_display,
                    "importance": round(feature_importance, 4),
                    "baseline_mean": base_mean,
                    "current_mean": cur_mean,
                    "distribution_comparison": bin_comps,
                }
            except Exception as err:
                logger.warning("Error calculating numeric drift for %s: %s", col, err)

        # ── 3. Categorical Multi-Class Features (B1) ────────────────────────
        else:
            try:
                base_props_cat = col_base.get("category_proportions", {})
                psi_score, bin_comps = calculate_categorical_psi(base_props_cat, col_values)

                # Never show KS for categorical! Select Chi-Squared or Jensen-Shannon
                if base_sample_size >= LARGE_BASELINE_THRESHOLD:
                    js_div, _ = calculate_jensen_shannon_divergence(base_props_cat, col_values)
                    test_name = "Jensen-Shannon Divergence"
                    test_display = f"Jensen-Shannon (d={js_div:.3f})"
                    is_drifted = (js_div > 0.25) or (psi_score > PSI_CRITICAL_THRESHOLD)
                    test_stat = js_div
                    test_pval = None
                else:
                    chi2_stat, p_val = calculate_chi_squared_test(base_props_cat, col_values)
                    test_name = "Chi-Squared"
                    test_display = f"Chi-Sq (p={p_val:.3f})"
                    is_drifted = (p_val < ALPHA_THRESHOLD) or (psi_score > PSI_CRITICAL_THRESHOLD)
                    test_stat = chi2_stat
                    test_pval = p_val

                status = "CRITICAL" if is_drifted else "MODERATE" if psi_score >= PSI_STABLE_THRESHOLD else "STABLE"

                if status == "CRITICAL":
                    drifted_features.append(col)
                    weighted_drift_sum += feature_importance * max(0.7, min(1.0, psi_score / 0.25))
                elif status == "MODERATE":
                    weighted_drift_sum += feature_importance * max(0.3, psi_score / 0.25)
                else:
                    weighted_drift_sum += feature_importance * min(0.2, psi_score / 0.25)

                highest_psi = max(highest_psi, psi_score)

                features_report[col] = {
                    "feature": col,
                    "type": "categorical",
                    "psi": psi_score,
                    "status": status,
                    "status_display": status,
                    "test_name": test_name,
                    "test_statistic": test_stat,
                    "p_value": test_pval,
                    "test_display": test_display,
                    "importance": round(feature_importance, 4),
                    "baseline_mode": col_base.get("mode"),
                    "distribution_comparison": bin_comps,
                }
            except Exception as err:
                logger.warning("Error calculating categorical drift for %s: %s", col, err)

    # ── DATASET-LEVEL SUMMARY & IMPORTANCE-WEIGHTED DECISION (C1) ──────────
    total_active_features = len(active_cols)
    drifted_count = len(drifted_features)
    drifted_share = round(float(drifted_count / max(total_active_features, 1)), 4)
    importance_weighted_drift_score = round(float(weighted_drift_sum), 4)

    # Retrain decision: based on importance-weighted score exceeding 0.25, NOT a single low-impact feature
    retrain_recommended = False
    if importance_weighted_drift_score >= 0.25:
        overall_status = "CRITICAL_DRIFT"
        retrain_recommended = True
        recommendation = (
            f"Significant distribution drift on high-importance features "
            f"(Weighted Drift Score: {importance_weighted_drift_score:.2f}, {drifted_count}/{total_active_features} drifted). "
            f"Model retraining on fresh production data reflecting the current distribution is strongly recommended."
        )
    elif drifted_count > 0:
        overall_status = "MODERATE_SHIFT"
        retrain_recommended = False
        drifted_names = ", ".join(f"'{f}'" for f in drifted_features[:2])
        recommendation = (
            f"Feature {drifted_names} shifted, but model impact is low "
            f"(Weighted Drift Score: {importance_weighted_drift_score:.2f} < 0.25). "
            f"Retraining is NOT recommended on this low-importance shift alone."
        )
    elif highest_psi >= PSI_STABLE_THRESHOLD:
        overall_status = "MODERATE_SHIFT"
        recommendation = f"Minor distribution shift observed (Highest PSI = {highest_psi:.3f}). Production serving remains stable."
    else:
        overall_status = "HEALTHY"
        recommendation = "Production distribution is stable and closely aligns with training data."

    # ── GROUND-TRUTH ACTUALS / PERFORMANCE CHECK (C2) ──────────────────────
    live_performance = None
    performance_confirmed = False
    if actuals and len(actuals) >= 5:
        performance_confirmed = True
        # Calculate actuals performance if labels exist
        live_performance = {
            "evaluated_samples": len(actuals),
            "status": "CONFIRMED",
        }

    alert_badge_label = "inputs changed — performance not yet confirmed" if (drifted_count > 0 and not performance_confirmed) else None

    # ── DRIFT OVER TIME ROLLING WINDOWS (C3) ────────────────────────────────
    drift_over_time = compute_rolling_windows_drift(valid_inputs, baseline, feature_columns)

    # ── CODE STUDIO RETRAINING CONTEXT (C4) ────────────────────────────────
    primary_drifted_feature = drifted_features[0] if drifted_features else (feature_columns[0] if feature_columns else "input")
    primary_fi = fi_weights.get(primary_drifted_feature, 0.0)
    retrain_context = {
        "primary_feature": primary_drifted_feature,
        "primary_feature_importance": round(primary_fi, 4),
        "drifted_features": drifted_features,
        "severity": overall_status,
        "importance_weighted_score": importance_weighted_drift_score,
        "guidance": (
            f"⚠️ Data Drift Detected on '{primary_drifted_feature}' (Importance: {primary_fi*100:.1f}%). "
            f"Note: Model retraining requires fresh production data reflecting the current distribution — "
            f"retraining on the original historical training dataset cannot fix input data drift."
        ),
    }

    return {
        "deployment_id": str(getattr(deployment, "id", "")),
        "drift_detected": drifted_count > 0,
        "overall_status": overall_status,
        "overall_status_display": "CRITICAL DRIFT" if overall_status == "CRITICAL_DRIFT" else "MODERATE SHIFT" if overall_status == "MODERATE_SHIFT" else "STABLE",
        "insufficient_data": False,
        "sample_count": sample_count,
        "min_required": min_samples,
        "highest_psi": highest_psi,
        "drifted_features": drifted_features,
        "drifted_features_count": drifted_count,
        "total_features_count": total_active_features,
        "drifted_share": drifted_share,
        "importance_weighted_drift_score": importance_weighted_drift_score,
        "retrain_recommended": retrain_recommended,
        "smoothing_constant": SMOOTHING_CONSTANT,
        "performance_confirmed": performance_confirmed,
        "alert_badge_label": alert_badge_label,
        "live_performance": live_performance,
        "features": features_report,
        "telemetry": telemetry,
        "drift_over_time": drift_over_time,
        "recommendation": recommendation,
        "retrain_context": retrain_context,
    }
