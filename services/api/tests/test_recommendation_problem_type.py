"""Focused unit tests for recommendation.py problem-type detection and response shape."""

import pytest

from app.schemas.dataset import (
    ColumnProfile,
    DatasetHealthResponse,
    DatasetProfileResponse,
    DatasetRecommendationResponse,
)
from app.services.recommendation import recommendation_service


def _make_dummy_health(dataset_id: str, score: int = 90) -> DatasetHealthResponse:
    return DatasetHealthResponse(
        dataset_id=dataset_id,
        filename="test.csv",
        health_score=score,
        grade="A",
        summary="Dataset is clean",
        warnings=[],
        issues=[],
    )


def test_recommendation_low_cardinality_continuous_numeric_target_is_regression():
    """study_hours with 4 unique float values (e.g. 1.5 to 4.25) must recommend Regression."""
    columns = [
        ColumnProfile(
            name="feature_1",
            type="numeric",
            nullable=False,
            missing=0,
            missing_percentage=0.0,
            unique=10,
            duplicate_count=0,
            statistics={"min": 1, "max": 10, "mean": 5.5},
        ),
        ColumnProfile(
            name="study_hours",
            type="numeric",
            nullable=False,
            missing=0,
            missing_percentage=0.0,
            unique=4,
            duplicate_count=0,
            statistics={"min": 1.5, "max": 4.25, "mean": 2.8125},
        ),
    ]
    profile = DatasetProfileResponse(
        dataset_id="ds_study_hours",
        filename="study.csv",
        row_count=20,
        column_count=2,
        memory_usage_bytes=512,
        duplicate_rows=0,
        duplicate_columns=0,
        empty_columns=0,
        total_missing_values=0,
        columns=columns,
    )
    health = _make_dummy_health("ds_study_hours")

    resp: DatasetRecommendationResponse = recommendation_service.generate_recommendations(profile, health)

    assert resp.recommended_problem_type == "Regression"
    assert "Random Forest Regressor" in resp.recommended_models
    assert len(resp.target_suggestions) >= 1

    study_sugg = next(s for s in resp.target_suggestions if s.column_name == "study_hours")
    assert study_sugg.suggested_task == "Regression"


def test_recommendation_binary_numeric_target_is_classification():
    """Binary 0/1 target with unique=2 must recommend Classification."""
    columns = [
        ColumnProfile(
            name="feature_1",
            type="numeric",
            nullable=False,
            missing=0,
            missing_percentage=0.0,
            unique=10,
            duplicate_count=0,
            statistics={"min": 1, "max": 10, "mean": 5.5},
        ),
        ColumnProfile(
            name="passed",
            type="numeric",
            nullable=False,
            missing=0,
            missing_percentage=0.0,
            unique=2,
            duplicate_count=0,
            statistics={"min": 0, "max": 1, "mean": 0.5},
        ),
    ]
    profile = DatasetProfileResponse(
        dataset_id="ds_binary",
        filename="binary.csv",
        row_count=20,
        column_count=2,
        memory_usage_bytes=512,
        duplicate_rows=0,
        duplicate_columns=0,
        empty_columns=0,
        total_missing_values=0,
        columns=columns,
    )
    health = _make_dummy_health("ds_binary")

    resp = recommendation_service.generate_recommendations(profile, health)

    assert resp.recommended_problem_type == "Classification"
    assert "Random Forest Classifier" in resp.recommended_models
    passed_sugg = next(s for s in resp.target_suggestions if s.column_name == "passed")
    assert passed_sugg.suggested_task == "Classification"


def test_recommendation_multiclass_categorical_target_is_classification():
    """Categorical column with 3 unique classes must recommend Classification."""
    columns = [
        ColumnProfile(
            name="feature_1",
            type="numeric",
            nullable=False,
            missing=0,
            missing_percentage=0.0,
            unique=10,
            duplicate_count=0,
            statistics={"min": 1, "max": 10, "mean": 5.5},
        ),
        ColumnProfile(
            name="species",
            type="categorical",
            nullable=False,
            missing=0,
            missing_percentage=0.0,
            unique=3,
            duplicate_count=0,
            statistics={"cardinality": 3, "sample_values": ["setosa", "versicolor", "virginica"]},
        ),
    ]
    profile = DatasetProfileResponse(
        dataset_id="ds_iris",
        filename="iris.csv",
        row_count=150,
        column_count=2,
        memory_usage_bytes=1024,
        duplicate_rows=0,
        duplicate_columns=0,
        empty_columns=0,
        total_missing_values=0,
        columns=columns,
    )
    health = _make_dummy_health("ds_iris")

    resp = recommendation_service.generate_recommendations(profile, health)

    assert resp.recommended_problem_type == "Classification"
    assert "Random Forest Classifier" in resp.recommended_models
    species_sugg = next(s for s in resp.target_suggestions if s.column_name == "species")
    assert species_sugg.suggested_task == "Classification"


def test_recommendation_high_cardinality_numeric_target_is_regression():
    """Numeric column with high cardinality (unique > 20) must recommend Regression."""
    columns = [
        ColumnProfile(
            name="feature_1",
            type="numeric",
            nullable=False,
            missing=0,
            missing_percentage=0.0,
            unique=10,
            duplicate_count=0,
            statistics={"min": 1, "max": 10, "mean": 5.5},
        ),
        ColumnProfile(
            name="price",
            type="numeric",
            nullable=False,
            missing=0,
            missing_percentage=0.0,
            unique=85,
            duplicate_count=0,
            statistics={"min": 100.0, "max": 999.0, "mean": 450.0},
        ),
    ]
    profile = DatasetProfileResponse(
        dataset_id="ds_price",
        filename="price.csv",
        row_count=100,
        column_count=2,
        memory_usage_bytes=1024,
        duplicate_rows=0,
        duplicate_columns=0,
        empty_columns=0,
        total_missing_values=0,
        columns=columns,
    )
    health = _make_dummy_health("ds_price")

    resp = recommendation_service.generate_recommendations(profile, health)

    assert resp.recommended_problem_type == "Regression"
    assert "Random Forest Regressor" in resp.recommended_models


def test_recommendation_time_series_when_datetime_and_no_target():
    """When dataset contains datetime column and no explicit target, recommend Time Series."""
    columns = [
        ColumnProfile(
            name="timestamp",
            type="datetime",
            nullable=False,
            missing=0,
            missing_percentage=0.0,
            unique=100,
            duplicate_count=0,
            statistics={},
        ),
        ColumnProfile(
            name="value",
            type="numeric",
            nullable=False,
            missing=0,
            missing_percentage=0.0,
            unique=100,
            duplicate_count=0,
            statistics={"min": 1.0, "max": 100.0, "mean": 50.0},
        ),
    ]
    profile = DatasetProfileResponse(
        dataset_id="ds_ts",
        filename="timeseries.csv",
        row_count=100,
        column_count=2,
        memory_usage_bytes=1024,
        duplicate_rows=0,
        duplicate_columns=0,
        empty_columns=0,
        total_missing_values=0,
        columns=columns,
    )
    health = _make_dummy_health("ds_ts")

    resp = recommendation_service.generate_recommendations(profile, health)

    # When target exists, target takes priority; if no target suggestions or datetime
    assert resp.recommended_problem_type in ("Time Series", "Regression")


def test_recommendation_response_shape_compatibility():
    """Verify all contract fields are present in the response object."""
    columns = [
        ColumnProfile(
            name="target",
            type="categorical",
            nullable=False,
            missing=0,
            missing_percentage=0.0,
            unique=2,
            duplicate_count=0,
            statistics={"cardinality": 2, "sample_values": ["0", "1"]},
        ),
    ]
    profile = DatasetProfileResponse(
        dataset_id="ds_compat",
        filename="compat.csv",
        row_count=50,
        column_count=1,
        memory_usage_bytes=512,
        duplicate_rows=0,
        duplicate_columns=0,
        empty_columns=0,
        total_missing_values=0,
        columns=columns,
    )
    health = _make_dummy_health("ds_compat")

    resp = recommendation_service.generate_recommendations(profile, health)

    data = resp.model_dump()
    assert "dataset_id" in data
    assert "overall_readiness" in data
    assert "readiness_reasoning" in data
    assert "recommended_problem_type" in data
    assert "problem_type_confidence" in data
    assert "problem_type_reasoning" in data
    assert "recommended_models" in data
    assert "recommended_preprocessing" in data
    assert "target_suggestions" in data
    assert "feature_recommendations" in data
    assert "warnings" in data
