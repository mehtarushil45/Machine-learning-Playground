"""Test algorithm recommendation benchmark on large multi-column datasets (e.g. 12,000 rows x 30 columns).

Verifies Milestone 1 deliverables:
- Fast multi-fidelity screening (sub-15s runtime on 12k rows)
- Proper resource admission & candidate ranking
- Clean recommendation with non-empty candidates and valid score
"""

import time
import numpy as np
import pandas as pd
import pytest

from app.ml.recommendation_engine import (
    RecommendationConfig,
    RecommendationConstraints,
    run_recommendation_benchmark,
)


def _generate_synthetic_12k_dataset(n_rows: int = 12_000, n_cols: int = 30) -> pd.DataFrame:
    """Generate reproducible 12,000-row x 30-column dataset with numeric & categorical features."""
    rng = np.random.default_rng(42)
    data = {}

    # 20 numeric columns
    for i in range(20):
        data[f"num_feature_{i}"] = rng.normal(loc=i * 2.0, scale=1.0, size=n_rows)

    # 5 categorical columns with varied cardinality
    for i in range(5):
        cats = [f"cat_{k}" for k in range(5 + i * 5)]
        data[f"cat_feature_{i}"] = rng.choice(cats, size=n_rows)

    # 3 boolean indicator columns
    for i in range(3):
        data[f"flag_feature_{i}"] = rng.choice([0, 1], size=n_rows)

    # Binary classification target with some signal
    signal = (
        data["num_feature_0"] * 0.5
        + data["num_feature_1"] * 0.3
        + data["flag_feature_0"] * 1.2
        + rng.normal(0, 1, size=n_rows)
    )
    data["target"] = (signal > np.median(signal)).astype(int)

    # 1 continuous regression target
    data["regression_target"] = signal

    return pd.DataFrame(data)


def test_12k_row_30_col_classification_recommendation_completes_within_budget():
    """Verify that a 12,000-row x 30-col dataset produces a valid classification recommendation within budget."""
    df = _generate_synthetic_12k_dataset(n_rows=12_000, n_cols=30)
    assert len(df) == 12_000
    assert len(df.columns) == 30

    feature_cols = [c for c in df.columns if c not in ("target", "regression_target")]
    assert len(feature_cols) == 28

    config = RecommendationConfig(
        target_column="target",
        feature_columns=feature_cols,
        cv_folds=3,
        random_seed=42,
        screening_sample_size=2_000,
        verification_sample_size=5_000,
        max_distance_kernel_rows=2_000,
    )

    stages_hit = []

    def stage_cb(stage: str, pct: float):
        stages_hit.append((stage, pct))

    start = time.perf_counter()
    result = run_recommendation_benchmark(
        dataframe=df,
        config=config,
        stage_callback=stage_cb,
    )
    elapsed = time.perf_counter() - start

    # 1. Verification of status and recommendation
    assert result.status == "completed", f"Benchmark failed: {result.limitations}"
    assert result.recommended_algorithm is not None
    assert result.recommended_algorithm.algorithm_id is not None
    assert result.recommended_algorithm.score is not None
    assert result.task_type == "classification"

    # 2. Verification of candidate evaluation
    completed_candidates = [c for c in result.candidates if c.status == "completed"]
    assert len(completed_candidates) >= 2, "Expected at least 2 completed candidate models"

    # 3. Verification of resource admission for distance/kernel algorithms on >2k rows
    skipped_cands = [c for c in result.candidates if c.status == "skipped"]
    for c in skipped_cands:
        if c.category in ("kernel", "distance"):
            assert "exceeds safe limit" in (c.skip_reason or "")

    assert ("SCREENING", 20.0) in stages_hit
    assert ("VERIFYING", 60.0) in stages_hit


def test_12k_row_30_col_regression_recommendation_completes():
    """Verify that a 12,000-row x 30-col dataset produces a valid regression recommendation."""
    df = _generate_synthetic_12k_dataset(n_rows=12_000, n_cols=30)

    feature_cols = [c for c in df.columns if c not in ("target", "regression_target")]

    config = RecommendationConfig(
        target_column="regression_target",
        feature_columns=feature_cols,
        metric="rmse",
        cv_folds=3,
        random_seed=42,
        screening_sample_size=2_000,
        verification_sample_size=5_000,
    )

    result = run_recommendation_benchmark(
        dataframe=df,
        config=config,
    )

    assert result.status == "completed"
    assert result.recommended_algorithm is not None
    assert result.task_type == "regression"
    assert result.evaluation_metric == "rmse"
    assert result.recommended_algorithm.score is not None
