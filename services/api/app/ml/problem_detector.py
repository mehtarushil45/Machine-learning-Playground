"""Problem Type Detector — Sprint 3 Module 3.3.

Classifies a supervised ML task as one of:
  - BinaryClassification
  - MultiClassification
  - Regression

Detection uses three independent signals, combined in priority order:
  1. Recommendation engine's existing suggested_task (highest authority — already
     embodies domain heuristics from profiler + health engine).
  2. Target column dtype (object / category → classification candidate).
  3. Unique value count relative to thresholds and continuous numerical evidence.

Design decisions:
- ProblemType is a string enum so it round-trips safely through JSON.
- detect_problem_type() and detect_problem_type_from_series() are pure functions
  (no side effects) so they are trivially testable and composable.
"""

from __future__ import annotations

import enum
import logging
from typing import Literal, Optional

import numpy as np
import pandas as pd

from app.ml.dataset_loader import DatasetContext

logger = logging.getLogger("apex_ml.problem_detector")

# ---------------------------------------------------------------------------
# Thresholds
# ---------------------------------------------------------------------------
# A discrete integer target with <= this many unique values is treated as classification.
_CLASSIFICATION_UNIQUE_CAP = 20
# A classification target with exactly 2 unique classes is binary.
_BINARY_CLASS_COUNT = 2


# ---------------------------------------------------------------------------
# Enum
# ---------------------------------------------------------------------------

class ProblemType(str, enum.Enum):
    """Detected supervised ML task type."""

    BINARY_CLASSIFICATION = "BinaryClassification"
    MULTI_CLASSIFICATION = "MultiClassification"
    REGRESSION = "Regression"

    def to_task_type(self) -> Literal["classification", "regression"]:
        """Project fine-grained ProblemType into coarse TaskType ('classification' | 'regression')."""
        if self in (ProblemType.BINARY_CLASSIFICATION, ProblemType.MULTI_CLASSIFICATION):
            return "classification"
        return "regression"

    @property
    def is_classification(self) -> bool:
        """True if the task is either binary or multi-class classification."""
        return self in (ProblemType.BINARY_CLASSIFICATION, ProblemType.MULTI_CLASSIFICATION)

    @property
    def is_regression(self) -> bool:
        """True if the task is continuous regression."""
        return self == ProblemType.REGRESSION

    @property
    def is_binary(self) -> bool:
        """True if the task is strictly binary classification."""
        return self == ProblemType.BINARY_CLASSIFICATION

    @property
    def is_multiclass(self) -> bool:
        """True if the task is multi-class classification (>= 3 distinct classes)."""
        return self == ProblemType.MULTI_CLASSIFICATION


# ---------------------------------------------------------------------------
# Public detector
# ---------------------------------------------------------------------------

def detect_problem_type_from_series(
    target_series: pd.Series,
    recommendation_task: Optional[str] = None,
) -> ProblemType:
    """Classify the ML task from a target series using multi-signal detection.

    Args:
        target_series: The target column Pandas Series.
        recommendation_task: Optional explicit task hint ("Classification" or "Regression").

    Returns:
        One of :class:`ProblemType`.
    """
    clean_series: pd.Series = target_series.dropna()

    # ── Signal 1: Explicit recommendation engine or user hint ─────────────────
    if recommendation_task is not None and recommendation_task.strip():
        rec_task_clean = recommendation_task.strip().lower()
        if rec_task_clean in ("regression", "reg"):
            logger.info("Problem type resolved as REGRESSION via explicit recommendation signal.")
            return ProblemType.REGRESSION
        if rec_task_clean in (
            "classification",
            "clf",
            "binaryclassification",
            "binary_classification",
            "multiclassification",
            "multi_classification",
        ):
            return _resolve_classification_subtype(clean_series)

    # ── Signal 2: Categorical / Boolean / Object dtypes ───────────────────────
    dtype_str = str(clean_series.dtype)
    if dtype_str in ("object", "category", "bool") or dtype_str.startswith("str"):
        logger.info("Problem type resolved as CLASSIFICATION via target dtype '%s'.", dtype_str)
        return _resolve_classification_subtype(clean_series)

    # ── Signal 3: Numeric target analysis ─────────────────────────────────────
    n_unique = clean_series.nunique()

    # Empty or single-value constant check
    if n_unique <= 1:
        return _resolve_classification_subtype(clean_series)

    # Genuine binary target (e.g. {0, 1} or exactly 2 unique discrete values)
    if n_unique == _BINARY_CLASS_COUNT:
        unique_vals = set(clean_series.unique())
        if unique_vals.issubset({0, 1, 0.0, 1.0, -1, 1}):
            logger.info("Problem type resolved as BINARY_CLASSIFICATION via binary indicator values.")
            return ProblemType.BINARY_CLASSIFICATION
        return ProblemType.BINARY_CLASSIFICATION

    # Check for continuous float characteristics (fractional parts)
    if pd.api.types.is_float_dtype(clean_series):
        try:
            arr = clean_series.to_numpy(dtype=float, na_value=np.nan)
            arr_valid = arr[~np.isnan(arr)]
            has_fractional = bool(np.any(np.mod(arr_valid, 1) != 0))
        except Exception:
            has_fractional = False

        if has_fractional:
            logger.info(
                "Problem type resolved as REGRESSION (floating-point target with fractional values, %d unique values).",
                n_unique,
            )
            return ProblemType.REGRESSION

    # If strictly discrete integer values:
    if n_unique <= _CLASSIFICATION_UNIQUE_CAP:
        logger.info(
            "Problem type resolved as CLASSIFICATION via discrete integer cardinality (%d unique values).",
            n_unique,
        )
        return _resolve_classification_subtype(clean_series)

    # High-cardinality numeric target (> 20 unique values) → Regression
    logger.info(
        "Problem type resolved as REGRESSION (numeric target, %d unique values).",
        n_unique,
    )
    return ProblemType.REGRESSION


def detect_problem_type(
    ctx: DatasetContext,
    recommendation_task: Optional[str] = None,
) -> ProblemType:
    """Classify the ML task using multi-signal detection.

    Args:
        ctx: A fully populated :class:`~app.ml.dataset_loader.DatasetContext`.
        recommendation_task: Optional task label produced by the recommendation engine.

    Returns:
        One of :class:`ProblemType`.
    """
    target_series = pd.Series(ctx.dataframe[ctx.target_column])
    return detect_problem_type_from_series(target_series, recommendation_task=recommendation_task)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _resolve_classification_subtype(target_series: pd.Series) -> ProblemType:
    """Determine binary vs. multi-class from the target series."""
    n_unique = target_series.nunique(dropna=True)
    if n_unique <= _BINARY_CLASS_COUNT:
        logger.info("Classification subtype: BINARY (%d classes).", n_unique)
        return ProblemType.BINARY_CLASSIFICATION
    logger.info("Classification subtype: MULTI-CLASS (%d classes).", n_unique)
    return ProblemType.MULTI_CLASSIFICATION
