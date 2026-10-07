"""Unit & Statistical Verification Tests for Drift Monitoring & Production Telemetry.

Validates:
1. Population Stability Index (PSI):
   - Identical samples -> PSI close to 0.0 (Stable)
   - Drastically shifted samples -> PSI > 0.25 (Critical Drift)
2. Kolmogorov-Smirnov (KS) Test:
   - Identical samples -> high p-value (~ 1.0)
   - Shifted samples -> low p-value (< 0.05) and high D statistic
3. Categorical PSI:
   - Matches distribution shifts accurately
4. Production Serving Telemetry:
   - P50, P95, and P99 latency quantiles and success rate calculations
5. Full Drift Report Assembly:
   - Flagging critical drifted features and generating retraining recommendations
"""

import math
import numpy as np
import pytest

from app.services.drift_monitoring_service import (
    calculate_numeric_psi,
    calculate_categorical_psi,
    calculate_ks_test,
    compute_telemetry_metrics,
    generate_drift_report,
    PSI_STABLE_THRESHOLD,
    PSI_CRITICAL_THRESHOLD,
)


def test_numeric_psi_identical_distributions():
    """Identical distributions should have PSI very close to 0 (< 0.05)."""
    np.random.seed(42)
    baseline_samples = np.random.normal(50, 10, 1000).tolist()
    percentiles = np.linspace(0, 100, 11)
    bin_edges = np.percentile(baseline_samples, percentiles)
    counts, _ = np.histogram(baseline_samples, bins=bin_edges)
    bin_props = [float(c / len(baseline_samples)) for c in counts]

    # Current sample drawn from same distribution
    current_samples = np.random.normal(50, 10, 500).tolist()
    psi_score, comps = calculate_numeric_psi(bin_edges.tolist(), bin_props, current_samples)

    assert psi_score < PSI_STABLE_THRESHOLD
    assert len(comps) == 10
    assert all("baseline_pct" in c and "current_pct" in c for c in comps)


def test_numeric_psi_shifted_distribution():
    """Significantly shifted distribution should trigger critical PSI > 0.25."""
    np.random.seed(42)
    baseline_samples = np.random.normal(50, 5, 1000).tolist()
    percentiles = np.linspace(0, 100, 11)
    bin_edges = np.percentile(baseline_samples, percentiles)
    counts, _ = np.histogram(baseline_samples, bins=bin_edges)
    bin_props = [float(c / len(baseline_samples)) for c in counts]

    # Current sample shifted by 3 standard deviations (mean=65 vs 50)
    current_samples = np.random.normal(65, 5, 500).tolist()
    psi_score, comps = calculate_numeric_psi(bin_edges.tolist(), bin_props, current_samples)

    assert psi_score > PSI_CRITICAL_THRESHOLD


def test_ks_test_identical_and_drifted():
    """Two-sample KS test should yield p > 0.05 for same distribution, p < 0.01 for shifted."""
    np.random.seed(42)
    base = np.random.normal(100, 15, 300).tolist()
    same = np.random.normal(100, 15, 150).tolist()
    shifted = np.random.normal(130, 15, 150).tolist()

    d_same, p_same = calculate_ks_test(base, same)
    assert p_same > 0.05
    assert d_same < 0.20

    d_shift, p_shift = calculate_ks_test(base, shifted)
    assert p_shift < 0.01
    assert d_shift > 0.40


def test_categorical_psi():
    """Categorical PSI should detect category proportion shifts."""
    base_props = {"High": 0.5, "Medium": 0.3, "Low": 0.2}

    # Stable production
    stable_curr = ["High"] * 50 + ["Medium"] * 30 + ["Low"] * 20
    psi_stable, comps = calculate_categorical_psi(base_props, stable_curr)
    assert psi_stable < PSI_STABLE_THRESHOLD

    # Shifted production (inverted proportions)
    shifted_curr = ["High"] * 5 + ["Medium"] * 25 + ["Low"] * 70
    psi_shifted, _ = calculate_categorical_psi(base_props, shifted_curr)
    assert psi_shifted > PSI_CRITICAL_THRESHOLD


def test_telemetry_metrics_quantiles():
    """Telemetry should accurately compute P50, P95, and P99 latency."""
    class MockRecord:
        def __init__(self, lat, status="SUCCESS"):
            self.latency_ms = lat
            self.status = status
            self.created_at = None

    records = [
        MockRecord(10.0),
        MockRecord(20.0),
        MockRecord(30.0),
        MockRecord(40.0),
        MockRecord(100.0),
        MockRecord(0.0, status="FAILED"),
    ]

    telemetry = compute_telemetry_metrics(records)
    assert telemetry["total_requests"] == 6
    assert telemetry["error_count"] == 1
    assert telemetry["success_rate"] == round(5 / 6 * 100, 2)
    assert telemetry["p50_ms"] == 30.0
    assert telemetry["p95_ms"] > 40.0
    assert telemetry["p99_ms"] <= 100.0


def test_full_drift_report_generation():
    """Generate comprehensive report and verify retraining recommendation."""
    class MockDeployment:
        id = "dep-12345"
        feature_columns = ["age", "tier"]
        configuration = {
            "baseline_distribution": {
                "age": {
                    "type": "numeric",
                    "mean": 35.0,
                    "std": 5.0,
                    "bin_edges": [20.0, 25.0, 30.0, 35.0, 40.0, 45.0, 50.0],
                    "bin_proportions": [0.1, 0.2, 0.4, 0.2, 0.1, 0.0],
                    "sample_reservoir": [25.0, 30.0, 35.0, 40.0],
                },
                "tier": {
                    "type": "categorical",
                    "mode": "Basic",
                    "category_proportions": {"Basic": 0.8, "Premium": 0.2},
                },
            }
        }

    class MockHistory:
        def __init__(self, age, tier):
            self.inputs = {"age": age, "tier": tier}
            self.status = "SUCCESS"
            self.latency_ms = 8.5
            self.created_at = None

    # Feed drifted inputs (age average 55 instead of 35)
    records = [MockHistory(55.0, "Premium") for _ in range(25)]

    report = generate_drift_report(MockDeployment(), records, min_samples=5)
    assert report["drift_detected"] is True
    assert report["overall_status"] == "CRITICAL_DRIFT"
    assert "age" in report["drifted_features"]
    assert report["highest_psi"] > PSI_CRITICAL_THRESHOLD
    assert "Model retraining recommended" in report["recommendation"]
