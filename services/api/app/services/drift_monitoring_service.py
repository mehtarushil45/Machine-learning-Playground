"""Drift Monitoring & Telemetry Service — Enterprise Production Serving.

Implements statistical data drift detection and production telemetry:
1. Population Stability Index (PSI):
   PSI = sum((Actual_i - Baseline_i) * ln(Actual_i / Baseline_i))
   - PSI < 0.10: Stable (No Drift)
   - 0.10 <= PSI <= 0.25: Moderate Drift
   - PSI > 0.25: Significant Drift (Retraining Recommended)

2. Kolmogorov-Smirnov (KS) Test:
   Two-sample test comparing continuous baseline samples vs current inferences.
   Outputs test statistic D and p-value (p < 0.05 indicates statistical drift).

3. Categorical Distribution Shift:
   Computes categorical frequency proportions and categorical PSI.

4. Production Serving Telemetry:
   Calculates total inferences, HTTP success rate, and P50 / P95 / P99 latency quantiles.
"""

from __future__ import annotations

import logging
import math
import os
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

logger = logging.getLogger("apex_ml.drift_monitoring_service")

# Threshold constants based on international banking and enterprise MLOps standards
PSI_STABLE_THRESHOLD = 0.10
PSI_CRITICAL_THRESHOLD = 0.25
KS_ALPHA_THRESHOLD = 0.05
EPSILON = 1e-4  # Smoothing factor to avoid division by zero or ln(0)


def extract_baseline_distribution(
    dataset_path: str,
    feature_columns: List[str],
    input_schema: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Compute baseline distributions, 10-decile bin edges, and category proportions from training dataset."""
    if not dataset_path or not os.path.exists(dataset_path):
        return {}

    try:
        # Load dataset sample or full dataset up to 50k rows
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

        col_type = schema.get(col, {}).get("type", "numeric")
        is_numeric = col_type == "numeric" or pd.api.types.is_numeric_dtype(series)

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
                # Deduplicate edges if constant / low variance
                bin_edges = np.unique(bin_edges)
                if len(bin_edges) < 2:
                    bin_edges = np.array([min_val - 1e-3, max_val + 1e-3])

                # Compute baseline bin frequencies
                counts, _ = np.histogram(valid_vals, bins=bin_edges)
                total_count = len(valid_vals)
                bin_proportions = [float(c / total_count) for c in counts]

                # Store reservoir sample up to 500 records for 2-sample KS test
                reservoir_size = min(len(valid_vals), 500)
                sample_reservoir = np.random.choice(valid_vals, size=reservoir_size, replace=False).tolist()

                baseline[col] = {
                    "type": "numeric",
                    "mean": round(mean_val, 4),
                    "std": round(std_val, 4),
                    "min": round(min_val, 4),
                    "max": round(max_val, 4),
                    "bin_edges": [round(float(b), 4) for b in bin_edges],
                    "bin_proportions": [round(p, 4) for p in bin_proportions],
                    "sample_reservoir": [round(float(v), 4) for v in sample_reservoir],
                }
            except Exception as err:
                logger.warning("Error computing baseline for numeric feature %s: %s", col, err)

        else:
            # Categorical feature baseline
            try:
                str_series = series.astype(str)
                total = len(str_series)
                val_counts = str_series.value_counts()
                top_categories = val_counts.head(15).to_dict()
                category_proportions = {cat: float(count / total) for cat, count in top_categories.items()}
                mode_val = str(str_series.mode()[0]) if not str_series.mode().empty else "N/A"

                baseline[col] = {
                    "type": "categorical",
                    "mode": mode_val,
                    "categories": list(category_proportions.keys()),
                    "category_proportions": {k: round(v, 4) for k, v in category_proportions.items()},
                }
            except Exception as err:
                logger.warning("Error computing baseline for categorical feature %s: %s", col, err)

    return baseline


def calculate_numeric_psi(
    baseline_edges: List[float],
    baseline_proportions: List[float],
    current_values: List[float],
) -> Tuple[float, List[Dict[str, Any]]]:
    """Calculate Population Stability Index (PSI) across established decile bins."""
    if not current_values or len(baseline_edges) < 2:
        return 0.0, []

    valid_current = [float(v) for v in current_values if v is not None and np.isfinite(v)]
    if not valid_current:
        return 0.0, []

    edges = np.array(baseline_edges)
    # Ensure outer edges span current min and max to prevent unbinned values
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

        # Smoothing with epsilon
        b_smooth = max(b_pct, EPSILON)
        c_smooth = max(c_pct, EPSILON)

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

        b_smooth = max(b_pct, EPSILON)
        c_smooth = max(c_pct, EPSILON)

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
    """Compute two-sample Kolmogorov-Smirnov test statistic D and p-value."""
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
        # Fallback manual Kolmogorov-Smirnov supremum distance
        all_vals = np.sort(np.unique(np.concatenate([b_arr, c_arr])))
        cdf_b = np.searchsorted(np.sort(b_arr), all_vals, side="right") / len(b_arr)
        cdf_c = np.searchsorted(np.sort(c_arr), all_vals, side="right") / len(c_arr)
        d_stat = float(np.max(np.abs(cdf_b - cdf_c)))
        # Asymptotic approximate p-value
        n1, n2 = len(b_arr), len(c_arr)
        en = math.sqrt((n1 * n2) / (n1 + n2))
        p_val = math.exp(-2.0 * ((en * d_stat) ** 2))
        return round(d_stat, 4), round(min(max(p_val, 0.0), 1.0), 4)


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

    # Calculate throughput (requests / total duration in seconds)
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


def generate_drift_report(
    deployment: Any,
    history_records: List[Any],
    min_samples: int = 5,
) -> Dict[str, Any]:
    """Generate comprehensive production drift report and telemetry."""
    feature_columns: List[str] = getattr(deployment, "feature_columns", []) or []
    config: Dict[str, Any] = getattr(deployment, "configuration", {}) or {}
    baseline: Dict[str, Any] = config.get("baseline_distribution", {})

    # Compute production telemetry
    telemetry = compute_telemetry_metrics(history_records)

    # Filter successful inferences with inputs
    valid_inputs: List[Dict[str, Any]] = []
    for r in history_records:
        inputs = getattr(r, "inputs", {})
        if isinstance(inputs, dict) and inputs:
            valid_inputs.append(inputs)

    sample_count = len(valid_inputs)
    if sample_count < min_samples:
        return {
            "deployment_id": str(getattr(deployment, "id", "")),
            "drift_detected": False,
            "overall_status": "HEALTHY",
            "insufficient_data": True,
            "sample_count": sample_count,
            "min_required": min_samples,
            "highest_psi": 0.0,
            "drifted_features": [],
            "features": {},
            "telemetry": telemetry,
            "recommendation": f"Accumulating production inferences ({sample_count}/{min_samples} required for statistical significance).",
        }

    features_report: Dict[str, Any] = {}
    drifted_features: List[str] = []
    highest_psi = 0.0

    for col in feature_columns:
        col_values = [inp.get(col) for inp in valid_inputs if inp.get(col) is not None]
        if not col_values:
            continue

        col_base = baseline.get(col, {})
        col_type = col_base.get("type", "numeric")

        if col_type == "numeric":
            try:
                numeric_vals = [float(v) for v in col_values]
                base_edges = col_base.get("bin_edges", [])
                base_props = col_base.get("bin_proportions", [])
                base_reservoir = col_base.get("sample_reservoir", [])

                psi_score, bin_comps = calculate_numeric_psi(base_edges, base_props, numeric_vals)
                ks_stat, p_val = calculate_ks_test(base_reservoir, numeric_vals)

                cur_mean = round(float(np.mean(numeric_vals)), 4) if numeric_vals else 0.0
                base_mean = col_base.get("mean")

                # Drift classification
                if psi_score > PSI_CRITICAL_THRESHOLD or p_val < KS_ALPHA_THRESHOLD:
                    status = "CRITICAL"
                    drifted_features.append(col)
                elif psi_score >= PSI_STABLE_THRESHOLD:
                    status = "MODERATE"
                else:
                    status = "STABLE"

                highest_psi = max(highest_psi, psi_score)

                features_report[col] = {
                    "feature": col,
                    "type": "numeric",
                    "psi": psi_score,
                    "status": status,
                    "ks_statistic": ks_stat,
                    "p_value": p_val,
                    "baseline_mean": base_mean,
                    "current_mean": cur_mean,
                    "distribution_comparison": bin_comps,
                }
            except Exception as err:
                logger.warning("Error calculating drift for feature %s: %s", col, err)

        else:
            # Categorical feature
            try:
                base_props_cat = col_base.get("category_proportions", {})
                psi_score, bin_comps = calculate_categorical_psi(base_props_cat, col_values)

                if psi_score > PSI_CRITICAL_THRESHOLD:
                    status = "CRITICAL"
                    drifted_features.append(col)
                elif psi_score >= PSI_STABLE_THRESHOLD:
                    status = "MODERATE"
                else:
                    status = "STABLE"

                highest_psi = max(highest_psi, psi_score)

                features_report[col] = {
                    "feature": col,
                    "type": "categorical",
                    "psi": psi_score,
                    "status": status,
                    "ks_statistic": 0.0,
                    "p_value": 1.0,
                    "baseline_mode": col_base.get("mode"),
                    "distribution_comparison": bin_comps,
                }
            except Exception as err:
                logger.warning("Error calculating categorical drift for %s: %s", col, err)

    overall_status = "HEALTHY"
    if highest_psi > PSI_CRITICAL_THRESHOLD or len(drifted_features) > 0:
        overall_status = "CRITICAL_DRIFT"
        recommendation = f"Feature '{drifted_features[0]}' has drifted (PSI = {highest_psi:.3f} > 0.25). Model retraining recommended."
    elif highest_psi >= PSI_STABLE_THRESHOLD:
        overall_status = "MODERATE_DRIFT"
        recommendation = f"Moderate distribution shift observed (Highest PSI = {highest_psi:.3f}). Monitor endpoint closely."
    else:
        recommendation = "Production distribution is stable and closely aligns with training data."

    return {
        "deployment_id": str(getattr(deployment, "id", "")),
        "drift_detected": len(drifted_features) > 0,
        "overall_status": overall_status,
        "insufficient_data": False,
        "sample_count": sample_count,
        "min_required": min_samples,
        "highest_psi": highest_psi,
        "drifted_features": drifted_features,
        "features": features_report,
        "telemetry": telemetry,
        "recommendation": recommendation,
    }
