"""Problem Type Detector — Sprint 3 Module 3.3.

Classifies a supervised ML task as one of:
  - BinaryClassification
  - MultiClassification
  - Regression

Detection uses three independent signals, combined in priority order:
  1. Recommendation engine's existing suggested_task (highest authority — already
     embodies domain heuristics from profiler + health engine).
  2. Target column dtype (object / category → classification candidate).
  3. Unique value count relative to thresholds.

Design decisions:
- ProblemType is a string enum so it round-trips safely through JSON.
- detect_problem_type() is a pure function (no side effects) so it is trivially
  testable and composable.
- The recommendation engine is consulted via its existing singleton — no new
  coupling is introduced.
"""

from __future__ import annotations

import enum
import logging
from typing import Optional

import numpy as np
import pandas as pd

from app.ml.dataset_loader import DatasetContext

logger = logging.getLogger("apex_ml.problem_detector")

# ---------------------------------------------------------------------------
# Thresholds
# ---------------------------------------------------------------------------
# A numeric target with ≤ this many unique values is treated as classification.
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


# ---------------------------------------------------------------------------
# Public detector
# ---------------------------------------------------------------------------

def detect_problem_type(
    ctx: DatasetContext,
    recommendation_task: Optional[str] = None,
) -> ProblemType:
    """Classify the ML task using multi-signal detection.

    The function resolves disagreements between signals by giving higher
    authority to explicit human/engine annotations over raw heuristics.

    Args:
        ctx: A fully populated :class:`~app.ml.dataset_loader.DatasetContext`.
        recommendation_task: Optional task label produced by the recommendation
            engine ("Classification" or "Regression").  When provided it takes
            precedence over dtype/cardinality heuristics for the coarse decision
            but the binary/multi split is still resolved from the data.

    Returns:
        One of :class:`ProblemType`.
    """
    target_series: pd.Series = ctx.dataframe[ctx.target_column]

    # ── Signal 1: Recommendation engine ───────────────────────────────────────
    # The recommendation engine already ran profiler + health analysis, so its
    # label is the most informed signal available.
    if recommendation_task is not None:
        if recommendation_task.lower() == "regression":
            logger.info(
                "Problem type resolved as REGRESSION via recommendation engine signal."
            )
            return ProblemType.REGRESSION
        if recommendation_task.lower() == "classification":
            return _resolve_classification_subtype(target_series)

    # ── Signal 2: Target dtype ────────────────────────────────────────────────
    dtype_str = str(target_series.dtype)
    if dtype_str in ("object", "category", "bool") or dtype_str.startswith("str"):
        logger.info(
            "Problem type resolved as CLASSIFICATION via target dtype '%s'.", dtype_str
        )
        return _resolve_classification_subtype(target_series)

    # ── Signal 3: Unique value cardinality ────────────────────────────────────
    n_unique = int(target_series.nunique(dropna=True))

    # An absolutely low unique count means discrete labels regardless of ratio.
    if n_unique <= _CLASSIFICATION_UNIQUE_CAP:
        logger.info(
            "Problem type resolved as CLASSIFICATION via cardinality "
            "(%d unique values).",
            n_unique,
        )
        return _resolve_classification_subtype(target_series)

    # ── Default: continuous numeric target → Regression ───────────────────────
    logger.info(
        "Problem type resolved as REGRESSION (numeric target, %d unique values).",
        n_unique,
    )
    return ProblemType.REGRESSION


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _resolve_classification_subtype(target_series: pd.Series) -> ProblemType:
    """Determine binary vs. multi-class from the target series."""
    n_unique = int(target_series.nunique(dropna=True))
    if n_unique <= _BINARY_CLASS_COUNT:
        logger.info("Classification subtype: BINARY (%d classes).", n_unique)
        return ProblemType.BINARY_CLASSIFICATION
    logger.info("Classification subtype: MULTI-CLASS (%d classes).", n_unique)
    return ProblemType.MULTI_CLASSIFICATION
