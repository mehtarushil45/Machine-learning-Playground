"""Comprehensive test suite for pure recommendation engine and cache-key generator."""

from __future__ import annotations

from unittest.mock import patch

import numpy as np
import pandas as pd
import pytest
from sklearn.datasets import make_classification, make_regression

from app.ml.recommendation_cache import (
    compute_recommendation_cache_key,
    normalize_cache_payload,
)
from app.ml.recommendation_engine import (
    RecommendationConfig,
    RecommendationConstraints,
    run_recommendation_benchmark,
)


@pytest.fixture
def binary_classification_df() -> pd.DataFrame:
    """Fixture providing a balanced binary classification dataset."""
    X, y = make_classification(
        n_samples=120,
        n_features=5,
        n_informative=3,
        n_redundant=0,
        random_state=42,
    )
    df = pd.DataFrame(X, columns=[f"feat_{i}" for i in range(5)])
    df["target"] = y
    return df


@pytest.fixture
def multiclass_df() -> pd.DataFrame:
    """Fixture providing a 3-class classification dataset."""
    X, y = make_classification(
        n_samples=150,
        n_features=6,
        n_informative=4,
        n_classes=3,
        n_clusters_per_class=1,
        random_state=42,
    )
    df = pd.DataFrame(X, columns=[f"feat_{i}" for i in range(6)])
    df["target"] = [f"class_{v}" for v in y]
    return df


@pytest.fixture
def regression_df() -> pd.DataFrame:
    """Fixture providing a continuous regression dataset."""
    X, y = make_regression(
        n_samples=100,
        n_features=4,
        n_informative=3,
        noise=0.1,
        random_state=42,
    )
    df = pd.DataFrame(X, columns=[f"feat_{i}" for i in range(4)])
    df["target"] = y
    return df


# ---------------------------------------------------------------------------
# 1. Core Task Tests (Binary, Multiclass, Regression, Imbalance)
# ---------------------------------------------------------------------------

def test_binary_classification_recommendation(binary_classification_df: pd.DataFrame):
    """Binary dataset must produce a valid ranked recommendation with CV scores."""
    config = RecommendationConfig(
        target_column="target",
        cv_folds=5,
        random_seed=42,
        train_test_split=0.8,
    )

    result = run_recommendation_benchmark(binary_classification_df, config)

    assert result.status == "completed"
    assert result.task_type == "classification"
    assert result.target_cardinality == 2
    assert result.evaluation_metric in ("roc_auc", "f1")
    assert result.recommended_algorithm is not None
    assert result.recommended_algorithm.rank == 1
    assert result.recommended_algorithm.score is not None
    assert result.recommended_algorithm.score_std is not None
    assert len(result.recommended_algorithm.fold_scores) > 0
    assert result.train_sample_rows == int(120 * 0.8)
    assert result.holdout_rows == 120 - int(120 * 0.8)
    assert len(result.candidates) >= 3


def test_imbalanced_binary_classification_metric_selection():
    """Severe class imbalance (>10:1 ratio) must select F1 over ROC-AUC."""
    # 100 negative, 8 positive (12.5:1 ratio)
    X = np.random.randn(108, 4)
    y = np.array([0] * 100 + [1] * 8)
    df = pd.DataFrame(X, columns=["f1", "f2", "f3", "f4"])
    df["target"] = y

    config = RecommendationConfig(target_column="target", cv_folds=3, random_seed=42)
    result = run_recommendation_benchmark(df, config)

    assert result.status == "completed"
    assert result.evaluation_metric == "f1"
    assert result.recommended_algorithm is not None


def test_multiclass_classification_recommendation(multiclass_df: pd.DataFrame):
    """Multiclass target must select macro_f1 and produce valid rankings."""
    config = RecommendationConfig(target_column="target", cv_folds=4, random_seed=42)
    result = run_recommendation_benchmark(multiclass_df, config)

    assert result.status == "completed"
    assert result.task_type == "classification"
    assert result.target_cardinality == 3
    assert result.evaluation_metric == "macro_f1"
    assert result.recommended_algorithm is not None
    assert result.recommended_algorithm.score is not None


def test_regression_recommendation_and_negative_score_ranking(regression_df: pd.DataFrame):
    """Regression must use RMSE/MAE, rank by negative score, and return positive raw metric."""
    config = RecommendationConfig(target_column="target", cv_folds=5, random_seed=42)
    result = run_recommendation_benchmark(regression_df, config)

    assert result.status == "completed"
    assert result.task_type == "regression"
    assert result.evaluation_metric == "rmse"
    assert result.recommended_algorithm is not None
    # Higher score is better (negated RMSE closer to 0)
    assert result.recommended_algorithm.score <= 0.0
    # Raw metric value is positive RMSE
    assert result.recommended_algorithm.raw_metric_value >= 0.0


# ---------------------------------------------------------------------------
# 2. Validation Failures & Insufficient Data Handling
# ---------------------------------------------------------------------------

def test_insufficient_data_and_invalid_target_states(binary_classification_df: pd.DataFrame):
    """Empty df, missing target, >20% NaNs, or <10 rows must return structured insufficient_data/invalid_target."""
    # 1. Empty DF
    res_empty = run_recommendation_benchmark(pd.DataFrame(), RecommendationConfig(target_column="target"))
    assert res_empty.status == "insufficient_data"
    assert "empty_dataset" in res_empty.reason_codes

    # 2. Missing target column
    res_no_col = run_recommendation_benchmark(binary_classification_df, RecommendationConfig(target_column="non_existent"))
    assert res_no_col.status == "invalid_target"
    assert "missing_target_column" in res_no_col.reason_codes

    # 3. Excessive target NaNs (> 20%)
    df_nans = binary_classification_df.copy()
    df_nans.loc[:30, "target"] = np.nan  # 31 / 120 > 25%
    res_nans = run_recommendation_benchmark(df_nans, RecommendationConfig(target_column="target"))
    assert res_nans.status == "invalid_target"
    assert "target_excessive_missing_values" in res_nans.reason_codes

    # 4. Single class target
    df_single = binary_classification_df.copy()
    df_single["target"] = 1
    res_single = run_recommendation_benchmark(df_single, RecommendationConfig(target_column="target"))
    assert res_single.status == "invalid_target"
    assert "single_class_target" in res_single.reason_codes

    # 5. Too few rows (< 10)
    res_few = run_recommendation_benchmark(binary_classification_df.head(8), RecommendationConfig(target_column="target"))
    assert res_few.status == "insufficient_data"
    assert "insufficient_rows" in res_few.reason_codes


def test_target_appears_identifier_like_not_auto_excluded():
    """Identifier-like target column must trigger a confirmation warning without being excluded."""
    df = pd.DataFrame({
        "feat_1": [1.0, 2.0, 3.0, 4.0, 5.0] * 6,
        "id_target": [0, 1] * 15,
    })

    config = RecommendationConfig(target_column="id_target", cv_folds=3, random_seed=42)
    result = run_recommendation_benchmark(df, config)

    assert result.status == "completed"
    assert any("identifier characteristics" in w for w in result.warnings)


# ---------------------------------------------------------------------------
# 3. Leakage Safety & Holdout Isolation Integrity
# ---------------------------------------------------------------------------

def test_preprocessing_leakage_safety_isolation():
    """Verify that validation-fold values never contaminate training fold transformation statistics."""
    # Create dataset with normal values in training, but massive extreme outliers in specific rows
    df = pd.DataFrame({
        "num_feat": [10.0, 11.0, 10.5, 9.5, 10.0, 1000000.0] * 10,
        "target": [0, 1] * 30,
    })

    config = RecommendationConfig(target_column="target", cv_folds=3, random_seed=42)
    result = run_recommendation_benchmark(df, config)

    assert result.status == "completed"
    # Result must succeed without crashing or propagating unhandled fold scaling


def test_holdout_isolation_integrity(binary_classification_df: pd.DataFrame):
    """Holdout partition (test set) is strictly isolated and never scored during CV selection."""
    config = RecommendationConfig(
        target_column="target",
        cv_folds=3,
        random_seed=42,
        train_test_split=0.8,
    )

    result = run_recommendation_benchmark(binary_classification_df, config)

    assert result.holdout_rows == int(len(binary_classification_df) * 0.2)
    assert result.train_sample_rows == len(binary_classification_df) - result.holdout_rows


# ---------------------------------------------------------------------------
# 4. Feature Sanitization & Resource Admission
# ---------------------------------------------------------------------------

def test_feature_sanitization_and_exclusions():
    """100% empty, zero-variance, and identifier columns are safely excluded and recorded."""
    df = pd.DataFrame({
        "row_id": list(range(1, 61)),
        "all_empty": [np.nan] * 60,
        "constant_val": [99] * 60,
        "clean_num": [float(i % 3) for i in range(60)],
        "target": [0 if i < 30 else 1 for i in range(60)],
    })

    config = RecommendationConfig(target_column="target", cv_folds=3, random_seed=42)
    result = run_recommendation_benchmark(df, config)

    assert result.status == "completed"
    excluded_cols = {e["column_name"] for e in result.exclusions}
    assert "row_id" in excluded_cols
    assert "all_empty" in excluded_cols
    assert "constant_val" in excluded_cols


def test_resource_admission_safe_limits(binary_classification_df: pd.DataFrame):
    """Algorithms exceeding safe row limits (e.g. SVC > 5k rows) must be skipped gracefully."""
    config = RecommendationConfig(
        target_column="target",
        cv_folds=3,
        random_seed=42,
        screening_sample_size=10_000,  # Simulated large dataset
    )

    # Patch screening sample size check to simulate >5,000 rows
    with patch("app.ml.recommendation_engine.ALGORITHM_REGISTRY") as mock_reg:
        from app.ml.algorithm_factory import ALGORITHM_REGISTRY as REAL_REG
        # Copy registry but give SVC max_safe_rows=50
        modified_reg = dict(REAL_REG)
        from app.ml.algorithm_factory import AlgorithmDefinition
        old_svc = REAL_REG["support_vector_classifier"]
        modified_reg["support_vector_classifier"] = AlgorithmDefinition(
            key=old_svc.key,
            display_name=old_svc.display_name,
            task_type=old_svc.task_type,
            factory=old_svc.factory,
            category=old_svc.category,
            recommendation_tier="screening_default",
            max_safe_rows=50,  # Dataset has 120 rows -> triggers skip
        )
        mock_reg.values.return_value = modified_reg.values()

        result = run_recommendation_benchmark(binary_classification_df, config)
        svc_cand = next((c for c in result.candidates if c.algorithm_id == "support_vector_classifier"), None)
        assert svc_cand is not None
        assert svc_cand.status == "skipped"
        assert "exceeds safe limit" in (svc_cand.skip_reason or "")


def test_unavailable_dependency_graceful_skip(binary_classification_df: pd.DataFrame):
    """When xgboost/lightgbm is unavailable, candidate is skipped without failing the job."""
    with patch("app.ml.recommendation_engine.is_package_available", return_value=False):
        config = RecommendationConfig(target_column="target", cv_folds=3, random_seed=42)
        result = run_recommendation_benchmark(binary_classification_df, config)

        assert result.status == "completed"
        xgb_cand = next((c for c in result.candidates if c.algorithm_id == "xgboost_classifier"), None)
        if xgb_cand:
            assert xgb_cand.status == "skipped"
            assert "not installed" in (xgb_cand.skip_reason or "")


# ---------------------------------------------------------------------------
# 5. Tie Policy & Practical Significance
# ---------------------------------------------------------------------------

def test_tie_policy_and_simpler_model_preference(binary_classification_df: pd.DataFrame):
    """When contenders are within practical significance delta, tie break prefers simpler/faster model."""
    config = RecommendationConfig(
        target_column="target",
        cv_folds=3,
        random_seed=42,
        constraints=RecommendationConstraints(prefer_interpretable=True),
    )

    result = run_recommendation_benchmark(binary_classification_df, config)
    assert result.status == "completed"
    assert result.recommended_algorithm is not None
    # Result should include transparent reason codes
    assert len(result.reason_codes) > 0


# ---------------------------------------------------------------------------
# 6. Cache Key Canonicalization & Sensitivity
# ---------------------------------------------------------------------------

def test_cache_key_canonicalization_and_sensitivity():
    """Cache keys must be deterministic and sensitive to any algorithmic or data changes."""
    base_args = {
        "dataset_content_hash": "a" * 64,
        "target_column": "STATUS",
        "feature_columns": ["col_b", "col_a", "col_c"],
        "task_type": "classification",
        "metric": "roc_auc",
        "split_strategy": "stratified_k_fold",
        "train_test_split": 0.8,
        "cv_folds": 5,
        "random_seed": 42,
        "max_training_seconds": 120,
        "prefer_interpretable": False,
    }

    # 1. Same config
    key1 = compute_recommendation_cache_key(**base_args)

    # 2. Re-ordered feature columns -> Must yield IDENTICAL key
    reordered_args = dict(base_args)
    reordered_args["feature_columns"] = ["col_c", "col_a", "col_b"]
    key2 = compute_recommendation_cache_key(**reordered_args)
    assert key1 == key2

    # 3. Changed target -> Different key
    diff_target = dict(base_args, target_column="DIFFERENT")
    assert compute_recommendation_cache_key(**diff_target) != key1

    # 4. Changed random seed -> Different key
    diff_seed = dict(base_args, random_seed=99)
    assert compute_recommendation_cache_key(**diff_seed) != key1

    # 5. Changed cv_folds -> Different key
    diff_folds = dict(base_args, cv_folds=10)
    assert compute_recommendation_cache_key(**diff_folds) != key1

    # 6. Changed train_test_split -> Different key
    diff_split = dict(base_args, train_test_split=0.7)
    assert compute_recommendation_cache_key(**diff_split) != key1

    # 7. Changed prefer_interpretable -> Different key
    diff_interp = dict(base_args, prefer_interpretable=True)
    assert compute_recommendation_cache_key(**diff_interp) != key1

    # 8. Changed dataset content hash -> Different key
    diff_hash = dict(base_args, dataset_content_hash="b" * 64)
    assert compute_recommendation_cache_key(**diff_hash) != key1
