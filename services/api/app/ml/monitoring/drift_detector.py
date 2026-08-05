"""V6B Drift Detector.

Supports:
  1. Feature Drift   — KS test (scipy) or mean-shift fallback
  2. Schema Drift    — missing/extra features, type changes
  3. Missing Value Drift — null rate per feature vs baseline
  4. Distribution Drift — prediction output distribution shift

Concept Drift: Architecture documented, not implemented (V6C).
scipy is optional: try/except ImportError, fallback to stdlib statistics.
Minimum 50 records required before evaluation.
"""
from __future__ import annotations

import logging
import math
import statistics
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger("apex_ml.monitoring.drift_detector")

SCHEMA_VERSION = "6b.1.0"
MIN_RECORDS = 50

# Optional scipy
try:
    from scipy import stats as _scipy_stats
    _SCIPY_AVAILABLE = True
    logger.debug("drift_detector: scipy available — using KS test")
except ImportError:
    _scipy_stats = None  # type: ignore[assignment]
    _SCIPY_AVAILABLE = False
    logger.debug("drift_detector: scipy not available — using mean-shift fallback")


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id(prefix: str) -> str:
    return prefix + uuid.uuid4().hex[:8]


# ---------------------------------------------------------------------------
# Statistical helpers
# ---------------------------------------------------------------------------

def ks_test_or_fallback(
    current_values: List[float],
    baseline_values: List[float],
    threshold: float,
) -> dict:
    """Run KS test if scipy available, else mean-shift ratio fallback.

    Returns: {score: float, drift_detected: bool, method: 'ks'|'mean_shift'}
    """
    if not current_values or not baseline_values:
        return {"score": 0.0, "drift_detected": False, "method": "insufficient_data"}

    if _SCIPY_AVAILABLE and len(current_values) >= 5 and len(baseline_values) >= 5:
        try:
            result = _scipy_stats.ks_2samp(current_values, baseline_values)
            # KS p-value: low p-value means significant difference
            # We use statistic (0-1) as score; flag if p-value < threshold
            # threshold here is used as p-value threshold
            score = float(result.statistic)
            drift_detected = result.pvalue < threshold
            return {"score": score, "drift_detected": drift_detected, "method": "ks", "p_value": float(result.pvalue)}
        except Exception as e:
            logger.warning("KS test failed (%s); falling back to mean-shift", e)

    # Mean-shift fallback
    try:
        mean_current = statistics.mean(current_values)
        mean_baseline = statistics.mean(baseline_values)
        stdev_baseline = statistics.pstdev(baseline_values) if len(baseline_values) > 1 else 0.0
        if stdev_baseline < 1e-10:
            score = abs(mean_current - mean_baseline)
        else:
            score = abs(mean_current - mean_baseline) / (stdev_baseline + 1e-10)
        # Normalize score to [0, 1] range (cap at 1.0)
        score = min(score / 3.0, 1.0)  # 3-sigma = score 1.0
        drift_detected = score > threshold
        return {"score": round(score, 6), "drift_detected": drift_detected, "method": "mean_shift"}
    except Exception as e:
        logger.error("Mean-shift fallback failed: %s", e)
        return {"score": 0.0, "drift_detected": False, "method": "error"}


def _categorical_proportion_shift(
    current_values: List,
    baseline_distribution: dict,
    threshold: float,
) -> dict:
    """Compute proportion shift for categorical values.
    Returns: {score, drift_detected, current_distribution, shift_per_category}
    """
    if not current_values:
        return {"score": 0.0, "drift_detected": False, "current_distribution": {}, "shift_per_category": {}}

    # Compute current distribution
    counts: dict = {}
    total = len(current_values)
    for v in current_values:
        k = str(v)
        counts[k] = counts.get(k, 0) + 1
    current_dist = {k: v / total for k, v in counts.items()}

    # All known categories
    all_cats = set(current_dist.keys()) | set(baseline_distribution.keys())
    shifts: dict = {}
    max_shift = 0.0
    for cat in all_cats:
        cur_p = current_dist.get(cat, 0.0)
        base_p = baseline_distribution.get(cat, 0.0)
        shift = abs(cur_p - base_p)
        shifts[cat] = round(shift, 6)
        if shift > max_shift:
            max_shift = shift

    return {
        "score": round(max_shift, 6),
        "drift_detected": max_shift > threshold,
        "current_distribution": {k: round(v, 6) for k, v in current_dist.items()},
        "shift_per_category": shifts,
    }


# ---------------------------------------------------------------------------
# Drift detection functions
# ---------------------------------------------------------------------------

def detect_feature_drift(
    current_predictions: List[dict],
    feature_actuals: List[dict],
    feature_baseline: dict,
    config: dict,
) -> dict:
    """Detect feature drift using actual submitted features.

    current_predictions: from prediction_logger (not used for feature values)
    feature_actuals: from actuals JSONL (have raw features dict in 'features' field)
    feature_baseline: FeatureBaseline dict
    """
    threshold = config.get("feature_drift_threshold", 0.10)
    feature_names = feature_baseline.get("feature_names", [])
    feature_schema = feature_baseline.get("feature_schema", {})
    baseline_stats = feature_baseline.get("feature_stats", {})

    if len(feature_actuals) < MIN_RECORDS:
        return {
            "drift_detected": False,
            "insufficient_data": True,
            "sample_count": len(feature_actuals),
            "min_required": MIN_RECORDS,
            "drifted_features": [],
            "feature_scores": {},
            "details": {},
        }

    # Extract feature values from actuals
    feature_values: Dict[str, List] = {fn: [] for fn in feature_names}
    for record in feature_actuals:
        features = record.get("features", {})
        if isinstance(features, dict):
            for fn in feature_names:
                val = features.get(fn)
                if val is not None:
                    feature_values[fn].append(val)

    drifted_features: List[str] = []
    feature_scores: dict = {}
    details: dict = {}

    for fn in feature_names:
        vals = feature_values.get(fn, [])
        if not vals:
            feature_scores[fn] = 0.0
            details[fn] = {"score": 0.0, "drift_detected": False, "reason": "no_data"}
            continue

        ftype = feature_schema.get(fn, "unknown")
        if ftype == "numeric":
            # Extract baseline distribution if stored
            baseline_feature_vals = baseline_stats.get(f"{fn}_sample_values", [])
            try:
                numeric_vals = [float(v) for v in vals if v is not None]
                numeric_baseline = [float(v) for v in baseline_feature_vals] if baseline_feature_vals else []
                if numeric_baseline:
                    result = ks_test_or_fallback(numeric_vals, numeric_baseline, threshold)
                else:
                    # No baseline sample values; use mean from stats if available
                    baseline_mean = baseline_stats.get(f"{fn}_mean")
                    baseline_std = baseline_stats.get(f"{fn}_std", 1.0)
                    if baseline_mean is not None:
                        current_mean = sum(numeric_vals) / len(numeric_vals)
                        diff = abs(current_mean - baseline_mean) / (float(baseline_std) + 1e-10)
                        score = min(diff / 3.0, 1.0)
                        result = {"score": round(score, 6), "drift_detected": score > threshold, "method": "mean_shift"}
                    else:
                        result = {"score": 0.0, "drift_detected": False, "method": "no_baseline"}
            except (TypeError, ValueError) as e:
                result = {"score": 0.0, "drift_detected": False, "method": "error", "error": str(e)}
        else:
            # Categorical
            baseline_dist = baseline_stats.get(f"{fn}_distribution", {})
            result = _categorical_proportion_shift(vals, baseline_dist, threshold)

        feature_scores[fn] = result.get("score", 0.0)
        details[fn] = result
        if result.get("drift_detected", False):
            drifted_features.append(fn)

    overall_score = max(feature_scores.values()) if feature_scores else 0.0

    return {
        "drift_detected": len(drifted_features) > 0,
        "insufficient_data": False,
        "drifted_features": drifted_features,
        "feature_scores": feature_scores,
        "overall_drift_score": round(overall_score, 6),
        "details": details,
        "sample_count": len(feature_actuals),
    }


def detect_schema_drift(
    feature_actuals: List[dict],
    feature_baseline: dict,
) -> dict:
    """Detect schema drift: missing features, extra features."""
    if not feature_actuals:
        return {
            "drift_detected": False,
            "insufficient_data": True,
            "missing_features": [],
            "extra_features": [],
            "type_changes": {},
        }

    expected_features = set(feature_baseline.get("feature_names", []))
    if not expected_features:
        return {
            "drift_detected": False,
            "insufficient_data": False,
            "missing_features": [],
            "extra_features": [],
            "type_changes": {},
            "note": "No expected features defined in baseline",
        }

    # Sample actual feature keys from recent records
    observed_features: dict = {}  # feature -> set of observed types
    for record in feature_actuals[:100]:  # sample first 100
        features = record.get("features", {})
        if isinstance(features, dict):
            for k, v in features.items():
                if k not in observed_features:
                    observed_features[k] = set()
                observed_features[k].add(type(v).__name__)

    observed_set = set(observed_features.keys())
    missing = sorted(expected_features - observed_set)
    extra = sorted(observed_set - expected_features)

    # Type changes: compare observed types vs baseline schema
    expected_schema = feature_baseline.get("feature_schema", {})
    type_changes: dict = {}
    for fn in expected_features & observed_set:
        expected_type = expected_schema.get(fn, "unknown")
        obs_types = observed_features.get(fn, set())
        # Check if numeric is becoming string or vice versa
        is_numeric = any(t in {"int", "float", "int64", "float64"} for t in obs_types)
        is_str = any(t in {"str", "NoneType"} for t in obs_types)
        if expected_type == "numeric" and is_str and not is_numeric:
            type_changes[fn] = {"expected": "numeric", "observed": list(obs_types)}
        elif expected_type == "categorical" and is_numeric and not is_str:
            type_changes[fn] = {"expected": "categorical", "observed": list(obs_types)}

    drift_detected = bool(missing or extra or type_changes)

    return {
        "drift_detected": drift_detected,
        "insufficient_data": False,
        "missing_features": missing,
        "extra_features": extra,
        "type_changes": type_changes,
        "sample_count": len(feature_actuals),
    }


def detect_missing_value_drift(
    feature_actuals: List[dict],
    feature_baseline: dict,
    config: dict,
) -> dict:
    """Detect missing/null value rate drift per feature."""
    threshold = config.get("missing_value_drift_threshold", 0.10)
    feature_names = feature_baseline.get("feature_names", [])
    baseline_missing_rates = feature_baseline.get("missing_rates", {})

    if not feature_actuals or not feature_names:
        return {
            "drift_detected": False,
            "insufficient_data": True,
            "drifted_features": [],
            "missing_rates": {},
            "baseline_rates": {},
        }

    # Compute current missing rates
    current_rates: dict = {}
    total = len(feature_actuals)
    for fn in feature_names:
        missing_count = 0
        for record in feature_actuals:
            features = record.get("features", {})
            if not isinstance(features, dict) or features.get(fn) is None:
                missing_count += 1
        current_rates[fn] = round(missing_count / total, 6) if total > 0 else 0.0

    drifted: List[str] = []
    for fn in feature_names:
        current_rate = current_rates.get(fn, 0.0)
        baseline_rate = baseline_missing_rates.get(fn, 0.0)
        if current_rate - baseline_rate > threshold:
            drifted.append(fn)

    return {
        "drift_detected": len(drifted) > 0,
        "insufficient_data": False,
        "drifted_features": drifted,
        "missing_rates": current_rates,
        "baseline_rates": baseline_missing_rates,
        "threshold": threshold,
        "sample_count": total,
    }


def detect_distribution_drift(
    prediction_records: List[dict],
    feature_baseline: dict,
    config: dict,
) -> dict:
    """Detect distribution drift in model output (prediction values).
    Uses Total Variation Distance = 0.5 * sum(|p_current - p_baseline|).
    """
    threshold = config.get("feature_drift_threshold", 0.10)
    baseline_dist = feature_baseline.get("prediction_distribution", {})

    if len(prediction_records) < MIN_RECORDS:
        return {
            "drift_detected": False,
            "insufficient_data": True,
            "sample_count": len(prediction_records),
            "min_required": MIN_RECORDS,
        }

    # Compute current distribution
    counts: dict = {}
    total = len(prediction_records)
    for r in prediction_records:
        val = r.get("prediction")
        if val is not None:
            k = str(val)
            counts[k] = counts.get(k, 0) + 1

    if not counts:
        return {"drift_detected": False, "insufficient_data": True, "reason": "no_prediction_values"}

    current_dist = {k: v / total for k, v in counts.items()}

    # Total Variation Distance
    all_classes = set(current_dist.keys()) | set(baseline_dist.keys())
    tvd = 0.5 * sum(
        abs(current_dist.get(c, 0.0) - baseline_dist.get(c, 0.0))
        for c in all_classes
    )

    return {
        "drift_detected": tvd > threshold,
        "insufficient_data": False,
        "current_distribution": {k: round(v, 6) for k, v in current_dist.items()},
        "baseline_distribution": baseline_dist,
        "shift_score": round(tvd, 6),
        "threshold": threshold,
        "sample_count": total,
    }


def run_drift_check(
    monitoring_id: str,
    model_id: str,
    deployment_id: str,
    prediction_records: List[dict],
    feature_actuals: List[dict],
    feature_baseline: dict,
    config: dict,
) -> dict:
    """Run all drift checks and return consolidated drift report dict."""
    now = _utc_now()
    report_id = _new_id("dr-")

    # Determine time window
    window_start = prediction_records[-1].get("request_time", now) if prediction_records else now
    window_end = prediction_records[0].get("request_time", now) if prediction_records else now

    # Run all checks
    feature_drift = detect_feature_drift(prediction_records, feature_actuals, feature_baseline, config)
    schema_drift = detect_schema_drift(feature_actuals, feature_baseline)
    missing_value_drift = detect_missing_value_drift(feature_actuals, feature_baseline, config)
    distribution_drift = detect_distribution_drift(prediction_records, feature_baseline, config)

    # Overall drift score = max of all individual scores
    scores = [
        feature_drift.get("overall_drift_score", 0.0),
        distribution_drift.get("shift_score", 0.0),
    ]
    overall_score = max(scores)

    # Drift detected if any sub-check detected drift
    any_drift = any([
        feature_drift.get("drift_detected", False),
        schema_drift.get("drift_detected", False),
        missing_value_drift.get("drift_detected", False),
        distribution_drift.get("drift_detected", False),
    ])

    # Severity
    if overall_score > 0.20 or schema_drift.get("missing_features"):
        severity = "CRITICAL"
    elif overall_score > 0.10 or any_drift:
        severity = "WARNING"
    else:
        severity = "INFO"

    return {
        "report_id": report_id,
        "monitoring_id": monitoring_id,
        "model_id": model_id,
        "deployment_id": deployment_id,
        "report_type": "DRIFT",
        "generated_at": now,
        "window_start": window_start,
        "window_end": window_end,
        "prediction_count": len(prediction_records),
        "actuals_count": len(feature_actuals),
        "overall_drift_score": round(overall_score, 6),
        "drift_detected": any_drift,
        "severity": severity,
        "feature_drift": feature_drift,
        "schema_drift": schema_drift,
        "missing_value_drift": missing_value_drift,
        "distribution_drift": distribution_drift,
        "alert_triggered": False,
        "alert_id": None,
        "recommendations": [],
        "schema_version": SCHEMA_VERSION,
    }


# ---------------------------------------------------------------------------
# CONCEPT DRIFT ARCHITECTURE (V6C)
# ---------------------------------------------------------------------------
# Concept drift occurs when P(Y|X) changes — the relationship between
# features and labels shifts even if feature distributions are stable.
#
# Planned V6C implementation:
#
# 1. ADWIN (Adaptive Windowing):
#    - Maintains a sliding window of accuracy values
#    - Detects change point when variance exceeds threshold
#    - Suitable for streaming data
#
# 2. Page-Hinkley Test:
#    - Detects shifts in the mean of a metric
#    - Cumulative sum-based; low memory footprint
#    - Works well for gradual drift
#
# 3. DDM (Drift Detection Method):
#    - Monitors error rate + standard deviation
#    - Raises WARNING when error_rate + 2*std > baseline
#    - Raises CRITICAL when error_rate + 3*std > baseline
#
# Prerequisites for V6C:
#    - Continuous actuals pipeline with < 24h latency
#    - Rolling accuracy computation
#    - Historical accuracy time series storage
# ---------------------------------------------------------------------------

class ConceptDriftDetector:
    """Architecture placeholder for V6C concept drift detection.

    Concept drift types to detect (V6C):
      1. Prediction drift: output distribution shifts over time
      2. Target drift: label distribution shifts
      3. Confidence drift: systematic confidence score degradation
      4. Accuracy degradation: rolling accuracy drop below baseline

    Planned algorithms:
      - ADWIN for streaming change point detection
      - Page-Hinkley for sequential monitoring
      - DDM for accuracy-based drift detection

    Requirements:
      - Continuous ground truth (actuals) pipeline
      - Rolling window accuracy computation
      - Historical metric time series in monitoring_registry
    """

    def __init__(self) -> None:
        raise NotImplementedError(
            "ConceptDriftDetector is a V6C architecture placeholder. "
            "Implementation deferred to V6C pending continuous actuals pipeline."
        )
