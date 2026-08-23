"""Focused unit and regression tests for job_service validation and algorithm compatibility."""

import os
from fastapi import HTTPException
import pandas as pd
import pytest

from app.schemas.job import TrainingRequest
from app.services.job_service import _validate_algorithm_target_compatibility


@pytest.fixture
def mock_dataset_factory(tmp_path, monkeypatch):
    """Create test CSV datasets and patch find_dataset_path to point to tmp_path."""
    from services.worker.core import dataset_loader as worker_loader
    import app.ml.dataset_loader as api_loader

    def _create_dataset(dataset_id: str, df: pd.DataFrame) -> str:
        file_path = str(tmp_path / f"{dataset_id}.csv")
        df.to_csv(file_path, index=False)
        return file_path

    def _mock_find_dataset_path(dataset_id: str) -> str:
        file_path = tmp_path / f"{dataset_id}.csv"
        if not file_path.exists():
            raise FileNotFoundError(f"Dataset {dataset_id} not found")
        return str(file_path)

    monkeypatch.setattr(worker_loader, "find_dataset_path", _mock_find_dataset_path)
    monkeypatch.setattr(api_loader, "find_dataset_path", _mock_find_dataset_path)

    return _create_dataset


def test_continuous_low_cardinality_numeric_target_with_regressor_accepted(mock_dataset_factory):
    # study_hours with 4 unique float values (low cardinality continuous target)
    df = pd.DataFrame({
        "feature_1": [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0],
        "study_hours": [1.5, 2.0, 3.5, 4.25, 1.5, 2.0, 3.5, 4.25],
    })
    mock_dataset_factory("ds_study_hours", df)

    req = TrainingRequest(
        dataset_id="ds_study_hours",
        target_column="study_hours",
        feature_columns=["feature_1"],
        algorithm="random_forest_regressor",
    )
    result = _validate_algorithm_target_compatibility(req)
    assert result == "Random Forest Regressor"


def test_continuous_low_cardinality_numeric_target_with_classifier_rejected(mock_dataset_factory):
    # study_hours with float values + Random Forest Classifier -> rejected with 422
    df = pd.DataFrame({
        "feature_1": [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0],
        "study_hours": [1.5, 2.0, 3.5, 4.25, 1.5, 2.0, 3.5, 4.25],
    })
    mock_dataset_factory("ds_study_hours", df)

    req = TrainingRequest(
        dataset_id="ds_study_hours",
        target_column="study_hours",
        feature_columns=["feature_1"],
        algorithm="random_forest_classifier",
    )
    with pytest.raises(HTTPException) as exc_info:
        _validate_algorithm_target_compatibility(req)

    assert exc_info.value.status_code == 422
    assert "Random Forest Classifier" in exc_info.value.detail
    assert "requires regression" in exc_info.value.detail


def test_binary_classification_target_with_classifier_accepted(mock_dataset_factory):
    # Binary 0/1 target + Logistic Regression -> accepted
    df = pd.DataFrame({
        "feature_1": [10, 20, 30, 40, 50, 60, 70, 80],
        "passed": [0, 1, 1, 0, 1, 0, 0, 1],
    })
    mock_dataset_factory("ds_binary", df)

    req = TrainingRequest(
        dataset_id="ds_binary",
        target_column="passed",
        feature_columns=["feature_1"],
        algorithm="logistic_regression",
    )
    result = _validate_algorithm_target_compatibility(req)
    assert result == "Logistic Regression"


def test_regression_target_with_incompatible_classifier_rejected(mock_dataset_factory):
    # High cardinality continuous target + Logistic Regression -> rejected with 422
    df = pd.DataFrame({
        "feature_1": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        "price": [100.5, 200.25, 300.75, 400.0, 500.5, 600.1, 700.8, 800.9, 900.2, 1000.4],
    })
    mock_dataset_factory("ds_price", df)

    req = TrainingRequest(
        dataset_id="ds_price",
        target_column="price",
        feature_columns=["feature_1"],
        algorithm="logistic_regression",
    )
    with pytest.raises(HTTPException) as exc_info:
        _validate_algorithm_target_compatibility(req)

    assert exc_info.value.status_code == 422
    assert "Logistic Regression" in exc_info.value.detail
    assert "requires regression" in exc_info.value.detail


def test_binary_classification_target_with_incompatible_regressor_rejected(mock_dataset_factory):
    # Binary target + Linear Regression -> rejected with 422
    df = pd.DataFrame({
        "feature_1": [10, 20, 30, 40, 50, 60, 70, 80],
        "passed": [0, 1, 1, 0, 1, 0, 0, 1],
    })
    mock_dataset_factory("ds_binary", df)

    req = TrainingRequest(
        dataset_id="ds_binary",
        target_column="passed",
        feature_columns=["feature_1"],
        algorithm="linear_regression",
    )
    with pytest.raises(HTTPException) as exc_info:
        _validate_algorithm_target_compatibility(req)

    assert exc_info.value.status_code == 422
    assert "Linear Regression" in exc_info.value.detail
    assert "requires classification" in exc_info.value.detail
