"""End-to-End Verification Test for Problem-Type Detection, Recommendation, and Job Validation.

Specifically tests the full pipeline on a multi-target dataset containing:
1. study_hours: continuous low-cardinality float target ([1.5, 2.0, 3.5, 4.25])
2. passed_exam: binary {0, 1} target
3. letter_grade: multiclass categorical target ('A', 'B', 'C', 'D')
4. final_score: high-cardinality continuous numeric target
"""

from typing import Any

from fastapi import HTTPException
import numpy as np
import pandas as pd
import pytest

from app.ml.algorithm_factory import get_algorithm
from app.ml.problem_detector import ProblemType, detect_problem_type_from_series
from app.schemas.dataset import (
    ColumnProfile,
    DatasetHealthResponse,
    DatasetProfileResponse,
)
from app.schemas.job import TrainingRequest
from app.services.job_service import _validate_algorithm_target_compatibility
from app.services.recommendation import recommendation_service


@pytest.fixture
def multi_target_df():
    """Create a realistic benchmark dataset containing all four problem-type target variations."""
    np.random.seed(42)
    n = 40
    return pd.DataFrame({
        "student_id": [f"STD_{i:03d}" for i in range(n)],
        "attendance_pct": np.random.uniform(60.0, 100.0, size=n),
        "study_hours": [1.5, 2.0, 3.5, 4.25] * 10,  # 4 unique continuous float values
        "passed_exam": [0, 1] * 20,  # binary indicator
        "letter_grade": ["A", "B", "C", "D"] * 10,  # multiclass categorical
        "final_score": np.linspace(45.5, 98.2, n),  # high-cardinality continuous float
    })


@pytest.fixture
def mock_dataset_environment(tmp_path, monkeypatch, multi_target_df):
    """Persist the multi-target dataset to disk and mock dataset path resolvers."""
    file_path = str(tmp_path / "students_eval.csv")
    multi_target_df.to_csv(file_path, index=False)

    from services.worker.core import dataset_loader as worker_loader
    import app.ml.dataset_loader as api_loader

    def _mock_find_dataset_path(dataset_id: str) -> str:
        if dataset_id == "ds_students_eval":
            return file_path
        raise FileNotFoundError(f"Dataset {dataset_id} not found")

    monkeypatch.setattr(worker_loader, "find_dataset_path", _mock_find_dataset_path)
    monkeypatch.setattr(api_loader, "find_dataset_path", _mock_find_dataset_path)

    return "ds_students_eval", multi_target_df


# ── 1. Problem Detector Authoritative Verification ───────────────────────────

def test_e2e_problem_detection_across_all_target_types(multi_target_df):
    # 1. study_hours (continuous float low cardinality) -> ProblemType.REGRESSION
    pt_study = detect_problem_type_from_series(multi_target_df["study_hours"])
    assert pt_study == ProblemType.REGRESSION
    assert pt_study.to_task_type() == "regression"
    assert pt_study.is_regression is True
    assert pt_study.is_classification is False

    # 2. passed_exam (binary 0/1) -> ProblemType.BINARY_CLASSIFICATION
    pt_passed = detect_problem_type_from_series(multi_target_df["passed_exam"])
    assert pt_passed == ProblemType.BINARY_CLASSIFICATION
    assert pt_passed.to_task_type() == "classification"
    assert pt_passed.is_binary is True
    assert pt_passed.is_classification is True

    # 3. letter_grade (multiclass strings) -> ProblemType.MULTI_CLASSIFICATION
    pt_grade = detect_problem_type_from_series(multi_target_df["letter_grade"])
    assert pt_grade == ProblemType.MULTI_CLASSIFICATION
    assert pt_grade.to_task_type() == "classification"
    assert pt_grade.is_multiclass is True
    assert pt_grade.is_classification is True

    # 4. final_score (high cardinality continuous float) -> ProblemType.REGRESSION
    pt_score = detect_problem_type_from_series(multi_target_df["final_score"])
    assert pt_score == ProblemType.REGRESSION
    assert pt_score.to_task_type() == "regression"


# ── 2. Recommendation Engine Verification ────────────────────────────────────

def test_e2e_recommendations_for_study_hours_target():
    """Verify recommendation engine produces regression recommendations for study_hours."""
    columns = [
        ColumnProfile(
            name="attendance_pct",
            type="numeric",
            nullable=False,
            missing=0,
            missing_percentage=0.0,
            unique=40,
            duplicate_count=0,
            statistics={"min": 60.0, "max": 100.0, "mean": 80.0},
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
        dataset_id="ds_students_eval",
        filename="students_eval.csv",
        row_count=40,
        column_count=2,
        memory_usage_bytes=1024,
        duplicate_rows=0,
        duplicate_columns=0,
        empty_columns=0,
        total_missing_values=0,
        columns=columns,
    )
    health = DatasetHealthResponse(
        dataset_id="ds_students_eval",
        filename="students_eval.csv",
        health_score=95,
        grade="A",
        summary="Clean dataset",
        warnings=[],
        issues=[],
    )

    recs = recommendation_service.generate_recommendations(profile, health)

    # 1. Problem type must be Regression
    assert recs.recommended_problem_type == "Regression"

    # 2. Only regression models recommended
    assert "Random Forest Regressor" in recs.recommended_models
    assert "Random Forest Classifier" not in recs.recommended_models

    # 3. study_hours target suggestion must have suggested_task='Regression'
    study_sugg = next(s for s in recs.target_suggestions if s.column_name == "study_hours")
    assert study_sugg.suggested_task == "Regression"


# ── 3. Backend Job Service Compatibility Validation ──────────────────────────

def test_e2e_job_validation_study_hours_accepts_regressor_rejects_classifier(mock_dataset_environment):
    dataset_id, _ = mock_dataset_environment

    # 1. study_hours + Random Forest Regressor -> ACCEPTED
    req_reg = TrainingRequest(
        dataset_id=dataset_id,
        target_column="study_hours",
        feature_columns=["attendance_pct"],
        algorithm="random_forest_regressor",
    )
    display_name = _validate_algorithm_target_compatibility(req_reg)
    assert display_name == "Random Forest Regressor"

    # 2. study_hours + Linear Regression -> ACCEPTED
    req_linear = TrainingRequest(
        dataset_id=dataset_id,
        target_column="study_hours",
        feature_columns=["attendance_pct"],
        algorithm="linear_regression",
    )
    display_name_lin = _validate_algorithm_target_compatibility(req_linear)
    assert display_name_lin == "Linear Regression"

    # 3. study_hours + Random Forest Classifier -> REJECTED with 422
    req_clf = TrainingRequest(
        dataset_id=dataset_id,
        target_column="study_hours",
        feature_columns=["attendance_pct"],
        algorithm="random_forest_classifier",
    )
    with pytest.raises(HTTPException) as exc_info:
        _validate_algorithm_target_compatibility(req_clf)

    assert exc_info.value.status_code == 422
    assert "Random Forest Classifier" in exc_info.value.detail
    assert "requires regression" in exc_info.value.detail

    # 4. study_hours + Logistic Regression -> REJECTED with 422
    req_log = TrainingRequest(
        dataset_id=dataset_id,
        target_column="study_hours",
        feature_columns=["attendance_pct"],
        algorithm="logistic_regression",
    )
    with pytest.raises(HTTPException) as exc_info_log:
        _validate_algorithm_target_compatibility(req_log)

    assert exc_info_log.value.status_code == 422
    assert "Logistic Regression" in exc_info_log.value.detail
    assert "requires regression" in exc_info_log.value.detail


def test_e2e_job_validation_binary_target_accepts_classifier_rejects_regressor(mock_dataset_environment):
    dataset_id, _ = mock_dataset_environment

    # 1. passed_exam + Logistic Regression -> ACCEPTED
    req_clf = TrainingRequest(
        dataset_id=dataset_id,
        target_column="passed_exam",
        feature_columns=["attendance_pct", "study_hours"],
        algorithm="logistic_regression",
    )
    display_name = _validate_algorithm_target_compatibility(req_clf)
    assert display_name == "Logistic Regression"

    # 2. passed_exam + Random Forest Classifier -> ACCEPTED
    req_rf_clf = TrainingRequest(
        dataset_id=dataset_id,
        target_column="passed_exam",
        feature_columns=["attendance_pct", "study_hours"],
        algorithm="random_forest_classifier",
    )
    assert _validate_algorithm_target_compatibility(req_rf_clf) == "Random Forest Classifier"

    # 3. passed_exam + Linear Regression -> REJECTED with 422
    req_lin = TrainingRequest(
        dataset_id=dataset_id,
        target_column="passed_exam",
        feature_columns=["attendance_pct", "study_hours"],
        algorithm="linear_regression",
    )
    with pytest.raises(HTTPException) as exc_info:
        _validate_algorithm_target_compatibility(req_lin)

    assert exc_info.value.status_code == 422
    assert "Linear Regression" in exc_info.value.detail
    assert "requires classification" in exc_info.value.detail


# ── 4. Algorithm Factory Execution Compatibility ─────────────────────────────

def test_e2e_algorithm_factory_instantiation_for_study_hours():
    # Instantiating random_forest_regressor with task_type='regression' succeeds
    model: Any = get_algorithm("random_forest_regressor", task_type="regression", random_state=42)
    assert model is not None

    # Fitting model on study_hours continuous values succeeds
    X = np.array([[80.0], [85.0], [90.0], [95.0]])
    y = np.array([1.5, 2.0, 3.5, 4.25])
    model.fit(X, y)
    preds = model.predict(X)
    assert len(preds) == 4
    assert np.all(np.isfinite(preds))
