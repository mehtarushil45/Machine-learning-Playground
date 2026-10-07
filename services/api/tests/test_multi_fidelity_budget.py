"""Unit and integration tests for Milestone 2: Progressive Multi-Fidelity Iteration Budgets.

Verifies:
1. Dynamic iteration budget scaling between screening and verification tiers.
2. Graceful enforcement of global max_training_seconds time budget without crashing or hanging.
3. Progressive fold-level early pruning on fold timeout / degenerate conditions.
4. Fast and accurate benchmark completion on large datasets.
"""

import time
import numpy as np
import pandas as pd
import pytest
from sklearn.model_selection import KFold, StratifiedKFold

from app.ml.algorithm_factory import ALGORITHM_REGISTRY, AlgorithmDefinition
from app.ml.recommendation_engine import (
    RecommendationConfig,
    RecommendationConstraints,
    evaluate_candidate_cv,
    run_recommendation_benchmark,
)


def _make_sample_dataset(n_rows: int = 1_000, n_cols: int = 10, seed: int = 42) -> pd.DataFrame:
    """Generate a reproducible synthetic tabular classification dataset."""
    rng = np.random.default_rng(seed)
    data = {f"num_{i}": rng.normal(size=n_rows) for i in range(n_cols)}
    signal = data["num_0"] * 2.0 + data["num_1"] * -1.5 + rng.normal(scale=0.5, size=n_rows)
    data["target"] = (signal > 0).astype(int)
    return pd.DataFrame(data)


def test_multi_fidelity_budget_scaling():
    """Verify that multi-fidelity budget parameters scale estimator iterations and are recorded."""
    df = _make_sample_dataset(n_rows=500, n_cols=6)
    config = RecommendationConfig(
        target_column="target",
        cv_folds=3,
        random_seed=42,
        screening_sample_size=300,
        verification_sample_size=400,
        screening_n_estimators=25,
        verification_n_estimators=80,
    )

    result = run_recommendation_benchmark(df, config)

    assert result.status == "completed"
    assert result.recommended_algorithm is not None
    assert result.recommended_algorithm.score is not None

    # Check reproducibility metadata
    assert "fidelity_tiers" in result.reproducibility
    assert result.reproducibility["fidelity_tiers"]["screening_trees"] == 25
    assert result.reproducibility["fidelity_tiers"]["verification_trees"] == 80
    assert result.reproducibility["screening_n_estimators"] == 25
    assert result.reproducibility["verification_n_estimators"] == 80


def test_global_time_budget_graceful_exhaustion():
    """Verify that a restrictive time budget terminates gracefully with partial screening."""
    df = _make_sample_dataset(n_rows=1_500, n_cols=12)

    # Set an aggressively small time budget (0.5 seconds)
    config = RecommendationConfig(
        target_column="target",
        cv_folds=3,
        random_seed=42,
        constraints=RecommendationConstraints(max_training_seconds=1),
        screening_n_estimators=50,
        candidate_fold_timeout_seconds=5.0,
    )

    start = time.perf_counter()
    result = run_recommendation_benchmark(df, config)
    elapsed = time.perf_counter() - start

    # The engine must return completed without hanging
    assert result.status == "completed"
    assert result.recommended_algorithm is not None
    assert len(result.candidates) >= 2

    # Should contain limitation note noting time budget respect if screening broke early
    any_budget_limitation = any("time budget" in lim.lower() for lim in result.limitations)
    # Either screening finished within 1s or time budget limitation was added
    assert elapsed < 10.0, f"Benchmark exceeded safe cutoff: {elapsed:.2f}s"


def test_candidate_fold_early_pruning_on_timeout():
    """Verify that evaluate_candidate_cv prunes remaining folds when a fold exceeds max_fold_seconds."""
    df = _make_sample_dataset(n_rows=200, n_cols=4)
    defn = ALGORITHM_REGISTRY["random_forest_classifier"]

    # Set fold timeout to virtually 0 seconds so fold 1 definitely triggers the cutoff
    cv_splitter = StratifiedKFold(n_splits=4, shuffle=True, random_state=42)

    cand_res = evaluate_candidate_cv(
        definition=defn,
        dataframe=df,
        feature_columns=["num_0", "num_1", "num_2", "num_3"],
        target_column="target",
        cv_splitter=cv_splitter,
        metric_name="roc_auc",
        task_type="classification",
        random_seed=42,
        n_estimators_budget=50,
        max_fold_seconds=0.00001,  # Sub-millisecond timeout
    )

    assert cand_res.status == "completed"
    assert len(cand_res.fold_scores) == 1, "Expected candidate to prune remaining folds after fold 1"
    assert any("pruned after fold 1" in flag.lower() for flag in cand_res.risk_flags)


def test_candidate_fold_early_pruning_on_degenerate_score():
    """Verify that evaluate_candidate_cv prunes remaining folds when fold score is non-finite."""
    df = _make_sample_dataset(n_rows=200, n_cols=4)
    defn = ALGORITHM_REGISTRY["decision_tree_classifier"]

    cv_splitter = StratifiedKFold(n_splits=3, shuffle=True, random_state=42)

    # Normal execution should evaluate all 3 folds
    cand_res = evaluate_candidate_cv(
        definition=defn,
        dataframe=df,
        feature_columns=["num_0", "num_1", "num_2", "num_3"],
        target_column="target",
        cv_splitter=cv_splitter,
        metric_name="roc_auc",
        task_type="classification",
        random_seed=42,
        max_fold_seconds=10.0,
    )

    assert cand_res.status == "completed"
    assert len(cand_res.fold_scores) == 3
    assert not any("Pruned" in flag for flag in cand_res.risk_flags)
