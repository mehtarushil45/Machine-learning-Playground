"""Unit tests for ProblemType and problem_detector module."""

import numpy as np
import pandas as pd
import pytest

from app.ml.dataset_loader import DatasetContext
from app.ml.problem_detector import (
    ProblemType,
    detect_problem_type,
    detect_problem_type_from_series,
)


def _make_dummy_context(df: pd.DataFrame, target_col: str) -> DatasetContext:
    feature_cols = [c for c in df.columns if c != target_col]
    return DatasetContext(
        dataset_id="test_ds",
        file_path="",
        dataframe=df,
        target_column=target_col,
        feature_columns=feature_cols,
        numeric_columns=[c for c in feature_cols if pd.api.types.is_numeric_dtype(df[c])],
        categorical_columns=[c for c in feature_cols if not pd.api.types.is_numeric_dtype(df[c])],
        boolean_columns=[],
        datetime_columns=[],
        missing_per_column={c: pd.Series(df[c]).isna().sum() for c in df.columns},
        row_count=len(df),
        column_count=len(df.columns),
    )


# ---------------------------------------------------------------------------
# ProblemType Enum & Helpers Tests
# ---------------------------------------------------------------------------

def test_problem_type_enum_values():
    assert ProblemType.BINARY_CLASSIFICATION.value == "BinaryClassification"
    assert ProblemType.MULTI_CLASSIFICATION.value == "MultiClassification"
    assert ProblemType.REGRESSION.value == "Regression"


def test_problem_type_to_task_type():
    assert ProblemType.BINARY_CLASSIFICATION.to_task_type() == "classification"
    assert ProblemType.MULTI_CLASSIFICATION.to_task_type() == "classification"
    assert ProblemType.REGRESSION.to_task_type() == "regression"


def test_problem_type_helper_properties():
    b = ProblemType.BINARY_CLASSIFICATION
    m = ProblemType.MULTI_CLASSIFICATION
    r = ProblemType.REGRESSION

    assert b.is_classification is True
    assert b.is_regression is False
    assert b.is_binary is True
    assert b.is_multiclass is False

    assert m.is_classification is True
    assert m.is_regression is False
    assert m.is_binary is False
    assert m.is_multiclass is True

    assert r.is_classification is False
    assert r.is_regression is True
    assert r.is_binary is False
    assert r.is_multiclass is False


# ---------------------------------------------------------------------------
# Continuous Numeric Target (Low & High Cardinality)
# ---------------------------------------------------------------------------

def test_detect_continuous_numeric_low_cardinality_as_regression():
    # Fractional floats with low cardinality (e.g. study_hours = 1.5, 2.0, 3.5, 4.25)
    s = pd.Series([1.5, 2.0, 3.5, 4.25, 1.5, 2.0, 3.5, 4.25])
    assert s.nunique() == 4
    result = detect_problem_type_from_series(s)
    assert result == ProblemType.REGRESSION
    assert result.to_task_type() == "regression"


def test_detect_continuous_numeric_high_cardinality_as_regression():
    # 50 unique floats
    s = pd.Series(np.linspace(10.0, 100.0, 50).tolist())
    result = detect_problem_type_from_series(s)
    assert result == ProblemType.REGRESSION
    assert result.to_task_type() == "regression"


def test_detect_continuous_with_nans_as_regression():
    s = pd.Series([1.5, np.nan, 2.25, 3.75, np.nan, 4.5])
    result = detect_problem_type_from_series(s)
    assert result == ProblemType.REGRESSION


# ---------------------------------------------------------------------------
# Discrete Integer Classification Targets
# ---------------------------------------------------------------------------

def test_detect_binary_integer_as_binary_classification():
    # Strict 0/1 binary target
    s = pd.Series([0, 1, 1, 0, 1, 0, 0, 1])
    result = detect_problem_type_from_series(s)
    assert result == ProblemType.BINARY_CLASSIFICATION
    assert result.to_task_type() == "classification"


def test_detect_multiclass_integer_as_multiclass_classification():
    # Low cardinality discrete integers (e.g. class labels 0, 1, 2)
    s = pd.Series([0, 1, 2, 0, 1, 2, 0, 1, 2])
    assert s.nunique() == 3
    result = detect_problem_type_from_series(s)
    assert result == ProblemType.MULTI_CLASSIFICATION
    assert result.to_task_type() == "classification"


def test_detect_high_cardinality_integer_as_regression():
    # High cardinality integers (> 20 unique values) like house prices or counts
    s = pd.Series(list(range(25)))
    assert s.nunique() == 25
    result = detect_problem_type_from_series(s)
    assert result == ProblemType.REGRESSION
    assert result.to_task_type() == "regression"


# ---------------------------------------------------------------------------
# String / Categorical / Boolean Targets
# ---------------------------------------------------------------------------

def test_detect_binary_string_as_binary_classification():
    s = pd.Series(["yes", "no", "yes", "no", "yes"])
    result = detect_problem_type_from_series(s)
    assert result == ProblemType.BINARY_CLASSIFICATION
    assert result.is_binary is True


def test_detect_multiclass_string_as_multiclass_classification():
    s = pd.Series(["cat", "dog", "bird", "cat", "dog"])
    result = detect_problem_type_from_series(s)
    assert result == ProblemType.MULTI_CLASSIFICATION
    assert result.is_multiclass is True


def test_detect_boolean_as_binary_classification():
    s = pd.Series([True, False, True, True, False])
    result = detect_problem_type_from_series(s)
    assert result == ProblemType.BINARY_CLASSIFICATION


# ---------------------------------------------------------------------------
# Explicit Recommendation / User Hints
# ---------------------------------------------------------------------------

def test_explicit_recommendation_task_regression_override():
    # Low cardinality integer (1..5) with explicit regression hint
    s = pd.Series([1, 2, 3, 4, 5, 1, 2, 3, 4, 5])
    result = detect_problem_type_from_series(s, recommendation_task="Regression")
    assert result == ProblemType.REGRESSION


def test_explicit_recommendation_task_classification_override():
    # Float target with explicit classification hint
    s = pd.Series([1.0, 2.0, 3.0, 1.0, 2.0, 3.0])
    result = detect_problem_type_from_series(s, recommendation_task="Classification")
    assert result == ProblemType.MULTI_CLASSIFICATION


# ---------------------------------------------------------------------------
# DatasetContext Integration
# ---------------------------------------------------------------------------

def test_detect_problem_type_via_context():
    df = pd.DataFrame({
        "feature_1": [10, 20, 30, 40],
        "study_hours": [1.5, 2.5, 3.5, 4.5],
    })
    ctx = _make_dummy_context(df, target_col="study_hours")
    result = detect_problem_type(ctx)
    assert result == ProblemType.REGRESSION
    assert result.to_task_type() == "regression"
