"""Phase 3.2 - Regression Support End-to-End Tests.

Verifies that the ML Playground regression pipeline is correctly implemented:
1. Regression metrics completeness: MAE, MSE, RMSE, R2 all returned.
2. Full sklearn regression pipeline integration test.
3. Problem type detection for continuous float target columns.
4. Algorithm factory can instantiate regression estimators.
5. Job creation queues correctly with a regression algorithm.
"""

from __future__ import annotations

import os
import uuid
from unittest.mock import patch

import numpy as np
import pandas as pd
import pytest
from sklearn.ensemble import RandomForestRegressor as SklearnRFR
from sklearn.linear_model import LinearRegression as SklearnLR
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from services.worker.core.metrics import compute_metrics, evaluate_regression
from app.ml.algorithm_factory import ALGORITHM_REGISTRY, get_algorithm
from app.ml.problem_detector import ProblemType, detect_problem_type_from_series


# --- 1. Regression Metrics Completeness ---

def test_evaluate_regression_returns_all_four_metrics():
    """Phase 3.2: evaluate_regression must return mae, mse, rmse, r2_score."""
    rng = np.random.default_rng(42)
    y_true = rng.uniform(10, 100, size=100)
    y_pred = y_true + rng.normal(0, 5, size=100)

    result = evaluate_regression(y_true, y_pred)

    required_keys = {"mae", "mse", "rmse", "r2_score"}
    assert required_keys == set(result.keys()), (
        f"Expected regression metric keys {required_keys}, got {set(result.keys())}"
    )


def test_evaluate_regression_metric_values_are_floats():
    """All regression metric values must be numeric (not None or NaN)."""
    rng = np.random.default_rng(42)
    y_true = rng.uniform(0, 1, size=50)
    y_pred = y_true * 0.9 + 0.05

    result = evaluate_regression(y_true, y_pred)

    for key, val in result.items():
        assert isinstance(val, float), f"Metric '{key}' is not a float: {val!r}"
        assert np.isfinite(val), f"Metric '{key}' is not finite: {val!r}"


def test_evaluate_regression_perfect_prediction_r2_is_one():
    """Perfect predictions should yield r2_score ~ 1.0."""
    y = np.array([1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5])
    result = evaluate_regression(y, y)

    assert result["mae"] < 1e-9
    assert result["mse"] < 1e-9
    assert result["rmse"] < 1e-9
    assert abs(result["r2_score"] - 1.0) < 1e-6


def test_evaluate_regression_mse_equals_rmse_squared():
    """RMSE should equal sqrt(MSE) to 4 decimal places."""
    rng = np.random.default_rng(2024)
    y_true = rng.uniform(0, 100, size=200)
    y_pred = y_true + rng.normal(0, 10, size=200)

    result = evaluate_regression(y_true, y_pred)

    rmse_from_mse = round(float(np.sqrt(result["mse"])), 4)
    assert result["rmse"] == rmse_from_mse


def test_compute_metrics_routes_to_regression():
    """compute_metrics with is_classification=False must return regression metrics."""
    rng = np.random.default_rng(42)
    y_true = rng.uniform(1, 10, size=80)
    y_pred = y_true * 1.05

    result = compute_metrics(is_classification=False, y_true=y_true, y_pred=y_pred)

    assert "r2_score" in result
    assert "mae" in result
    assert "mse" in result
    assert "rmse" in result
    assert "accuracy" not in result
    assert "roc_auc" not in result


# --- 2. Full Sklearn Pipeline Integration ---

def test_regression_pipeline_end_to_end_random_forest():
    """Full sklearn regression pipeline with RandomForestRegressor produces valid metrics."""
    from sklearn.model_selection import train_test_split
    rng = np.random.default_rng(2025)
    n = 150
    X = pd.DataFrame({
        "age": rng.integers(18, 65, size=n),
        "study_hours": rng.uniform(0.5, 12, size=n),
        "prior_score": rng.uniform(40, 100, size=n),
    })
    y = 0.5 * X["study_hours"] + 0.3 * X["prior_score"] + 0.02 * X["age"] + rng.normal(0, 3, size=n)

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    pipeline = Pipeline([
        ("scaler", StandardScaler()),
        ("estimator", SklearnRFR(n_estimators=50, random_state=42)),
    ])
    pipeline.fit(X_train, y_train)
    y_pred = pipeline.predict(X_test)

    metrics = compute_metrics(is_classification=False, y_true=y_test.values, y_pred=y_pred)

    assert metrics["r2_score"] > 0.0
    assert 0 <= metrics["mae"] <= y.max() - y.min()
    assert metrics["mse"] >= 0
    assert metrics["rmse"] >= metrics["mae"] - 0.01


def test_regression_pipeline_linear_regression():
    """LinearRegression on a linear dataset should yield near-perfect R2."""
    from sklearn.model_selection import train_test_split
    rng = np.random.default_rng(42)
    n = 200
    X = rng.uniform(0, 10, size=(n, 2))
    y = 3 * X[:, 0] - 2 * X[:, 1] + 1 + rng.normal(0, 0.01, size=n)

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=99)

    lr = SklearnLR()
    lr.fit(X_train, y_train)
    y_pred = lr.predict(X_test)

    metrics = compute_metrics(is_classification=False, y_true=y_test, y_pred=y_pred)
    assert metrics["r2_score"] > 0.99


# --- 3. Problem Type Detection ---

def test_problem_detector_float_target_with_many_unique_values_is_regression():
    """A float target with >20 unique values must resolve to REGRESSION."""
    rng = np.random.default_rng(42)
    series = pd.Series(rng.uniform(0, 100, size=500))
    result = detect_problem_type_from_series(series)
    assert result == ProblemType.REGRESSION


def test_problem_detector_recommendation_hint_regression_overrides_cardinality():
    """Explicit 'Regression' hint must force REGRESSION even for low-cardinality ints."""
    series = pd.Series([1, 2, 3, 1, 2, 3, 1, 2, 3, 1])
    result = detect_problem_type_from_series(series, recommendation_task="Regression")
    assert result == ProblemType.REGRESSION


def test_problem_detector_fractional_float_target_is_regression():
    """Target with fractional float values must be REGRESSION."""
    series = pd.Series([0.5, 1.7, 3.14, 2.71, 1.41, 0.99, 2.0, 3.5, 4.8, 5.1])
    result = detect_problem_type_from_series(series)
    assert result == ProblemType.REGRESSION


def test_problem_detector_integer_binary_target_is_classification():
    """Binary integer target {0, 1} must NOT be detected as REGRESSION."""
    series = pd.Series([0, 1, 0, 1, 0, 1, 0, 1, 0, 1])
    result = detect_problem_type_from_series(series)
    assert result == ProblemType.BINARY_CLASSIFICATION


# --- 4. Algorithm Factory Regression ---

def test_algorithm_factory_regression_keys_exist():
    """All required regression algorithm keys must be in ALGORITHM_REGISTRY."""
    required = ["random_forest_regressor", "linear_regression", "decision_tree_regressor", "ridge_regressor", "lasso_regressor"]
    for key in required:
        assert key in ALGORITHM_REGISTRY
        assert ALGORITHM_REGISTRY[key].task_type == "regression"


def test_get_algorithm_regression_factory_returns_estimator():
    """get_algorithm with task_type='regression' must return a valid sklearn estimator."""
    estimator = get_algorithm(key="random_forest_regressor", task_type="regression", random_state=42)
    assert hasattr(estimator, "fit")
    assert hasattr(estimator, "predict")
    X = [[1, 2], [3, 4], [5, 6], [7, 8], [9, 10]]
    y = [1.1, 2.2, 3.3, 4.4, 5.5]
    estimator.fit(X, y)
    preds = estimator.predict([[2, 3]])
    assert len(preds) == 1


def test_get_algorithm_linear_regression_no_seed_required():
    """LinearRegression must be constructable and produce correct linear predictions."""
    estimator = get_algorithm(key="linear_regression", task_type="regression", random_state=99)
    X = [[1.0], [2.0], [3.0], [4.0], [5.0]]
    y = [2.0, 4.0, 6.0, 8.0, 10.0]
    estimator.fit(X, y)
    pred = estimator.predict([[6.0]])
    assert abs(pred[0] - 12.0) < 0.5


# --- 5. Job Creation with Regression Dataset ---

@pytest.fixture
def regression_csv_dataset(tmp_path):
    """Create a continuous float-target CSV for regression job tests."""
    uploads_dir = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "uploads")
    )
    os.makedirs(uploads_dir, exist_ok=True)
    dataset_id = f"test-regression-{uuid.uuid4().hex[:8]}"
    file_path = os.path.join(uploads_dir, f"{dataset_id}.csv")

    rng = np.random.default_rng(2025)
    n = 50
    df = pd.DataFrame({
        "feature_a": rng.uniform(0, 10, size=n),
        "feature_b": rng.integers(1, 20, size=n).astype(float),
        "feature_c": rng.uniform(-5, 5, size=n),
        "price": 2.5 * rng.uniform(0, 10, size=n) + rng.normal(0, 2, size=n),
    })
    df.to_csv(file_path, index=False)
    yield dataset_id, file_path
    if os.path.exists(file_path):
        os.remove(file_path)


@pytest.mark.asyncio
async def test_job_creation_with_regression_algorithm(regression_csv_dataset):
    """Job service must accept a regression algorithm for a regression dataset."""
    from app.schemas.job import TrainingRequest
    from app.services.job_service import job_service

    dataset_id, _ = regression_csv_dataset

    with patch("services.worker.tasks.training_task.execute_ml_training_job.delay"):
        req = TrainingRequest(
            dataset_id=dataset_id,
            target_column="price",
            feature_columns=["feature_a", "feature_b", "feature_c"],
            algorithm="random_forest_regressor",
            scaler="standard_scaler",
            imputer="median",
            train_test_split=0.8,
            random_seed=42,
            cross_validation=3,
            normalization=True,
            feature_selection="all",
        )
        job_resp = await job_service.create_job(
            req,
            user_id=str(uuid.uuid4()),
            organisation_id=None,
            db=None,
        )

    assert job_resp.status == "QUEUED"
    assert "Regressor" in job_resp.algorithm or "Regression" in job_resp.algorithm
    assert job_resp.target_column == "price"
    assert set(job_resp.feature_columns) == {"feature_a", "feature_b", "feature_c"}


@pytest.mark.asyncio
async def test_classifier_rejected_for_regression_dataset(regression_csv_dataset):
    """Job service must reject a classifier algorithm for a regression target."""
    from fastapi import HTTPException
    from app.schemas.job import TrainingRequest
    from app.services.job_service import job_service

    dataset_id, _ = regression_csv_dataset

    req = TrainingRequest(
        dataset_id=dataset_id,
        target_column="price",
        feature_columns=["feature_a", "feature_b"],
        algorithm="random_forest_classifier",
        feature_selection="all",
    )

    with pytest.raises(HTTPException) as exc_info:
        await job_service.create_job(
            req,
            user_id=str(uuid.uuid4()),
            db=None,
        )

    assert exc_info.value.status_code == 422
