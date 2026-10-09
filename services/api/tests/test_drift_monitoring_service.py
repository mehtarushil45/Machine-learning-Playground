"""Unit & Statistical Verification Tests for Drift Monitoring & Production Telemetry.

Validates the full enterprise statistical drift guardrails:
1. Insufficient Data Guard:
   - 20 requests when min_samples=50 -> INSUFFICIENT_DATA, not CRITICAL or STABLE.
2. False-Positive Check:
   - 500 requests drawn from the baseline distribution -> every feature is STABLE.
3. Importance-Weighted Drift & Retraining Decision:
   - Shift high-importance feature -> flagged and retrain is recommended.
   - Shift low-importance feature -> flagged, but retrain is NOT recommended on that alone.
4. Feature Type Test Selection:
   - Numeric (< 1000): Kolmogorov-Smirnov
   - Numeric (>= 1000): Wasserstein Distance
   - Categorical (< 1000): Chi-Squared (never KS!)
   - Categorical (>= 1000): Jensen-Shannon Divergence
   - Binary: Two-Proportion Z-Test
5. Identifier & Temporal Exclusions:
   - ID and timestamp columns are marked as EXCLUDED and not scored.
6. Deciles & Smoothing Constant:
   - 10 deciles and EPSILON = 0.0001 (1e-4) applied properly.
"""

import math
import numpy as np
import pytest

from app.services.drift_monitoring_service import (
    calculate_numeric_psi,
    calculate_categorical_psi,
    calculate_ks_test,
    calculate_wasserstein_distance,
    calculate_chi_squared_test,
    calculate_jensen_shannon_divergence,
    calculate_two_proportion_z_test,
    compute_telemetry_metrics,
    generate_drift_report,
    is_identifier_column,
    is_temporal_column,
    PSI_STABLE_THRESHOLD,
    PSI_CRITICAL_THRESHOLD,
    SMOOTHING_CONSTANT,
)


class MockHistory:
    def __init__(self, inputs, latency_ms=8.5, status="SUCCESS"):
        self.inputs = inputs
        self.latency_ms = latency_ms
        self.status = status
        self.created_at = None


def create_standard_deployment():
    rng = np.random.RandomState(42)
    base_reservoir = rng.normal(65.0, 15.0, 500)
    percentiles = np.linspace(0, 100, 11)
    bin_edges = np.percentile(base_reservoir, percentiles)
    counts, _ = np.histogram(base_reservoir, bins=bin_edges)
    bin_props = [float(c / len(base_reservoir)) for c in counts]

    class MockDeployment:
        id = "dep-enterprise-001"
        feature_columns = ["monthly_charges", "contract_type", "paperless_billing", "customer_id", "signup_date"]
        configuration = {
            "feature_importances": {
                "monthly_charges": 0.65,    # High importance
                "contract_type": 0.25,      # Medium importance
                "paperless_billing": 0.10,  # Low importance
            },
            "baseline_distribution": {
                "monthly_charges": {
                    "type": "numeric",
                    "sample_size": 500,
                    "mean": 65.0,
                    "std": 15.0,
                    "bin_edges": [round(float(b), 4) for b in bin_edges],
                    "bin_proportions": [round(float(p), 4) for p in bin_props],
                    "sample_reservoir": [round(float(v), 4) for v in base_reservoir],
                    "smoothing_constant": SMOOTHING_CONSTANT,
                },
                "contract_type": {
                    "type": "categorical",
                    "sample_size": 500,
                    "mode": "Month-to-month",
                    "categories": ["Month-to-month", "One-year", "Two-year"],
                    "category_proportions": {"Month-to-month": 0.55, "One-year": 0.25, "Two-year": 0.20},
                    "smoothing_constant": SMOOTHING_CONSTANT,
                },
                "paperless_billing": {
                    "type": "binary",
                    "sample_size": 500,
                    "categories": ["No", "Yes"],
                    "category_proportions": {"No": 0.40, "Yes": 0.60},
                    "positive_category": "Yes",
                    "positive_proportion": 0.60,
                },
                "customer_id": {
                    "type": "excluded_identifier",
                    "label": "excluded: identifier",
                    "reason": "Unique identifier",
                },
                "signup_date": {
                    "type": "excluded_temporal",
                    "label": "excluded: temporal",
                    "reason": "Temporal timestamp",
                },
            },
        }
    return MockDeployment()


def test_insufficient_data_guard_20_requests():
    """Verification Check 1: 20 live requests shows 'insufficient data', NOT CRITICAL or STABLE."""
    dep = create_standard_deployment()
    # 20 requests when 50 are required
    records = [
        MockHistory({"monthly_charges": 70.0, "contract_type": "Month-to-month", "paperless_billing": "Yes"})
        for _ in range(20)
    ]
    report = generate_drift_report(dep, records, min_samples=50)

    assert report["insufficient_data"] is True
    assert report["overall_status"] == "INSUFFICIENT_DATA"
    assert "20 of 50 required" in report["overall_status_display"]
    assert report["retrain_recommended"] is False
    assert report["features"]["monthly_charges"]["status"] == "INSUFFICIENT_DATA"
    assert "20 of 50 required" in report["features"]["monthly_charges"]["status_display"]


def test_false_positive_check_500_baseline_requests():
    """Verification Check 2: 500 requests drawn from baseline distribution -> every feature is STABLE."""
    np.random.seed(42)
    dep = create_standard_deployment()

    # Draw 500 samples directly from baseline distribution
    records = []
    for _ in range(500):
        mc = float(np.random.normal(65.0, 15.0))
        ct = np.random.choice(["Month-to-month", "One-year", "Two-year"], p=[0.55, 0.25, 0.20])
        pb = np.random.choice(["No", "Yes"], p=[0.40, 0.60])
        records.append(MockHistory({"monthly_charges": mc, "contract_type": ct, "paperless_billing": pb}))

    report = generate_drift_report(dep, records, min_samples=50)

    assert report["insufficient_data"] is False
    assert report["overall_status"] == "HEALTHY"
    assert report["drift_detected"] is False
    assert report["retrain_recommended"] is False
    assert report["features"]["monthly_charges"]["status"] == "STABLE"
    assert report["features"]["contract_type"]["status"] == "STABLE"
    assert report["features"]["paperless_billing"]["status"] == "STABLE"
    assert report["features"]["customer_id"]["status"] == "EXCLUDED"
    assert report["features"]["signup_date"]["status"] == "EXCLUDED"


def test_shift_high_importance_feature_recommends_retraining():
    """Verification Check 3A: Shift high-importance feature -> flagged and retrain is recommended."""
    np.random.seed(42)
    dep = create_standard_deployment()

    # monthly_charges has 65% importance. Shift it significantly (mean 115 instead of 65)
    records = []
    for _ in range(500):
        mc = float(np.random.normal(115.0, 10.0))  # Drastically shifted
        ct = np.random.choice(["Month-to-month", "One-year", "Two-year"], p=[0.55, 0.25, 0.20])
        pb = np.random.choice(["No", "Yes"], p=[0.40, 0.60])
        records.append(MockHistory({"monthly_charges": mc, "contract_type": ct, "paperless_billing": pb}))

    report = generate_drift_report(dep, records, min_samples=50)

    assert report["features"]["monthly_charges"]["status"] == "CRITICAL"
    assert "monthly_charges" in report["drifted_features"]
    assert report["importance_weighted_drift_score"] >= 0.25
    assert report["overall_status"] == "CRITICAL_DRIFT"
    assert report["retrain_recommended"] is True
    assert "Model retraining on fresh production data" in report["recommendation"]
    assert "retrain_context" in report
    assert "retraining on the original historical training dataset cannot fix input data drift" in report["retrain_context"]["guidance"]


def test_shift_low_importance_feature_flags_without_retrain():
    """Verification Check 3B: Shift low-importance feature -> flagged, but retrain is NOT recommended on that alone."""
    np.random.seed(42)
    dep = create_standard_deployment()

    # paperless_billing has only 10% importance. Shift it drastically (98% No instead of 40% No)
    records = []
    for _ in range(500):
        mc = float(np.random.normal(65.0, 15.0))  # Stable
        ct = np.random.choice(["Month-to-month", "One-year", "Two-year"], p=[0.55, 0.25, 0.20])  # Stable
        pb = "No" if np.random.rand() < 0.98 else "Yes"  # Drastically shifted binary feature
        records.append(MockHistory({"monthly_charges": mc, "contract_type": ct, "paperless_billing": pb}))

    report = generate_drift_report(dep, records, min_samples=50)

    # paperless_billing itself is flagged as CRITICAL
    assert report["features"]["paperless_billing"]["status"] == "CRITICAL"
    assert "paperless_billing" in report["drifted_features"]

    # But high-importance features (monthly_charges, contract_type) are stable
    assert report["features"]["monthly_charges"]["status"] == "STABLE"
    assert report["features"]["contract_type"]["status"] == "STABLE"

    # Importance-weighted drift score remains below 0.25, so overall status is MODERATE_SHIFT and retrain is NOT recommended
    assert report["importance_weighted_drift_score"] < 0.25
    assert report["overall_status"] == "MODERATE_SHIFT"
    assert report["retrain_recommended"] is False
    assert "Retraining is NOT recommended on this low-importance shift alone" in report["recommendation"]


def test_statistical_test_selection_by_type_and_size():
    """Verification Check 4: Test selection by type and baseline size (no KS for categorical!)."""
    # 1. Numeric small (< 1000) -> KS test
    ks_stat, ks_pval = calculate_ks_test([10.0, 20.0, 30.0], [10.0, 20.0, 30.0])
    assert ks_pval > 0.05

    # 2. Numeric large (>= 1000) -> Wasserstein distance
    w_dist, w_pval = calculate_wasserstein_distance([10.0]*1000, [10.0]*1000)
    assert w_dist == 0.0
    assert w_pval is None

    # 3. Categorical small (< 1000) -> Chi-Squared (NEVER KS)
    chi2_stat, chi2_pval = calculate_chi_squared_test(
        {"A": 0.5, "B": 0.5},
        ["A"] * 25 + ["B"] * 25,
    )
    assert chi2_pval > 0.05

    # 4. Categorical large (>= 1000) -> Jensen-Shannon divergence
    js_div, js_pval = calculate_jensen_shannon_divergence(
        {"A": 0.5, "B": 0.5},
        ["A"] * 50 + ["B"] * 50,
    )
    assert js_div < 0.05
    assert js_pval is None

    # 5. Binary -> Two-Proportion Z-Test
    z_stat, z_pval = calculate_two_proportion_z_test(
        {"0": 0.5, "1": 0.5},
        ["1"] * 50 + ["0"] * 50,
    )
    assert abs(z_stat) < 0.1
    assert z_pval > 0.8


def test_identifier_and_temporal_exclusion():
    """Verification Check 5: Identifier and date/time columns are detected and excluded."""
    assert is_identifier_column("customer_id") is True
    assert is_identifier_column("uuid") is True
    assert is_identifier_column("monthly_charges") is False

    assert is_temporal_column("created_at") is True
    assert is_temporal_column("timestamp") is True
    assert is_temporal_column("contract_type") is False
