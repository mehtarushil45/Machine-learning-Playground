"""API-level coverage for the published training options and execution path."""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
import uuid

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.dependencies import get_current_active_user, get_db
from app.main import app
from app.services.job_service import _JOBS_STORE, job_service


@pytest.fixture
def api_client(monkeypatch):
    """Use the real routes with an in-process user and no persistence service."""
    fake_user = SimpleNamespace(id=uuid.uuid4())

    async def override_user():
        return fake_user

    async def override_db():
        yield None

    app.dependency_overrides[get_current_active_user] = override_user
    app.dependency_overrides[get_db] = override_db

    # Keep this test focused on the real data/preprocessing/model path rather
    # than shared filesystem registries, which have independent test coverage.
    from app.ml import engine

    monkeypatch.setattr(engine, "start_experiment", lambda **_: "test-experiment")
    monkeypatch.setattr(engine, "save_trained_model", lambda **_: {"filename": "test.joblib", "model_path": "memory://test"})
    monkeypatch.setattr(engine, "register_model", lambda _: "test-model")
    monkeypatch.setattr(engine, "save_experiment", lambda **_: None)
    monkeypatch.setattr(engine, "record_lineage", lambda _: None)
    monkeypatch.setattr(engine, "list_artifacts", lambda **_: [])
    monkeypatch.setattr(
        engine,
        "generate_training_report",
        lambda **_: {"training_timestamp": "2026-01-01T00:00:00+00:00", "pipeline_hash": "test-pipeline"},
    )

    async def execute_before_responding(job_id, config):
        # This is the same synchronous engine used by the Celery worker.  The
        # flags only avoid repeated CV during a six-combination contract test.
        config.update(enable_cv=False, enable_tuning=False)
        engine.execute_ml_training_pipeline_sync(job_id, config)

    monkeypatch.setattr(job_service, "_dispatch_job_execution", execute_before_responding)
    _JOBS_STORE.clear()
    with TestClient(app) as client:
        yield client
    _JOBS_STORE.clear()
    app.dependency_overrides.clear()


@pytest.fixture
def training_data_path():
    """Create a disposable CSV in the same upload directory used by the API."""
    rng = np.random.default_rng(42)
    rows = 60
    frame = pd.DataFrame(
        {
            "feature_a": rng.normal(size=rows),
            "feature_b": rng.normal(loc=10, scale=3, size=rows),
            "feature_c": rng.normal(loc=-5, scale=2, size=rows),
        }
    )
    frame.loc[[3, 12, 40], "feature_b"] = np.nan
    frame["classification_target"] = np.where(frame.feature_a + frame.feature_b > 10, "high", "low")
    frame["regression_target"] = 3 * frame.feature_a - 0.5 * frame.feature_b + rng.normal(scale=0.1, size=rows)
    uploads_dir = Path(__file__).resolve().parents[1] / "uploads"
    uploads_dir.mkdir(exist_ok=True)
    path = uploads_dir / f"test-training-options-{uuid.uuid4().hex}.csv"
    frame.to_csv(path, index=False)
    try:
        yield str(path)
    finally:
        path.unlink(missing_ok=True)


@pytest.mark.parametrize(
    "algorithm,scaler,imputer,target_column,expected_estimator",
    [
        ("random_forest_classifier", "standard_scaler", "median", "classification_target", "RandomForestClassifier"),
        ("xgboost_classifier", "normalizer", "knn_imputer", "classification_target", "XGBClassifier"),
        ("lightgbm_classifier", "robust_scaler", "mean", "classification_target", "LGBMClassifier"),
        ("linear_regression", "min_max_scaler", "constant", "regression_target", "LinearRegression"),
        ("xgboost_regressor", "max_abs_scaler", "median", "regression_target", "XGBRegressor"),
        ("lightgbm_regressor", "normalizer", "knn_imputer", "regression_target", "LGBMRegressor"),
    ],
)
def test_training_request_runs_exact_selected_options(
    api_client, training_data_path, algorithm, scaler, imputer, target_column, expected_estimator
):
    response = api_client.post(
        "/api/v1/jobs/train",
        json={
            "dataset_id": training_data_path,
            "target_column": target_column,
            "feature_columns": ["feature_a", "feature_b", "feature_c"],
            "algorithm": algorithm,
            "scaler": scaler,
            "imputer": imputer,
            "train_test_split": 0.8,
            "cross_validation": 2,
        },
    )

    assert response.status_code == 201, response.text
    job = _JOBS_STORE[response.json()["job_id"]]
    assert job.status == "COMPLETED"
    assert job.metadata["algorithm_key"] == algorithm
    assert job.metadata["scaler"] == scaler
    assert job.metadata["imputer"] == imputer
    assert job.metadata["estimator_type"] == expected_estimator


def test_training_request_rejects_an_algorithm_target_mismatch(api_client, training_data_path):
    response = api_client.post(
        "/api/v1/jobs/train",
        json={
            "dataset_id": training_data_path,
            "target_column": "classification_target",
            "feature_columns": ["feature_a", "feature_b", "feature_c"],
            "algorithm": "linear_regression",
            "scaler": "standard_scaler",
            "imputer": "median",
        },
    )

    assert response.status_code == 422
    assert "regression algorithm" in response.json()["detail"]


def test_training_options_endpoint_publishes_the_complete_registries(api_client):
    for endpoint in ("/api/v1/training-options", "/training-options"):
        response = api_client.get(endpoint)
        assert response.status_code == 200
        payload = response.json()
        assert len(payload["algorithms"]) == 20
        assert len(payload["scalers"]) == 5
        assert len(payload["imputers"]) == 5
        assert payload["default_cv_folds"] == 5
        assert payload["default_train_test_split"] == 0.8
