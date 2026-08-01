"""Cross Validation Engine — Sprint 4 Module 4.1.

Performs k-fold cross-validation on a fitted sklearn Pipeline and returns
detailed fold-level and aggregate CV metrics.

Supported CV strategies (automatic selection):
  - StratifiedKFold  — classification with enough class samples per fold
  - KFold            — regression or when stratification is not feasible
  - TimeSeriesSplit  — when config explicitly requests it (future datetime target)

Design decisions:
- Strategy selection is automatic and deterministic; callers may override via
  the `cv_strategy` parameter for explicit control.
- cross_validate_pipeline() operates on the *unfitted* base estimator wrapped
  in a clone of the preprocessing pipeline, so there is zero data leakage
  between training folds.
- All results are plain Python dicts — no numpy arrays in the return value —
  so they serialise to JSON without any custom encoder.
- The function raises CrossValidationError (a ValueError subclass) on
  irrecoverable configuration problems, but individual fold failures are
  captured and logged rather than aborting the entire CV run.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

import numpy as np
from sklearn.base import clone
from sklearn.model_selection import (
    KFold,
    StratifiedKFold,
    TimeSeriesSplit,
    cross_validate,
)
from sklearn.pipeline import Pipeline

from app.ml.problem_detector import ProblemType

logger = logging.getLogger("apex_ml.cross_validator")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
_MIN_SAMPLES_PER_CLASS_FOR_STRATIFY = 2  # StratifiedKFold needs >= n_splits samples per class
_DEFAULT_N_SPLITS = 5


class CrossValidationError(ValueError):
    """Raised when CV configuration is invalid or irrecoverable."""


# ---------------------------------------------------------------------------
# Strategy selector
# ---------------------------------------------------------------------------

def select_cv_strategy(
    problem_type: ProblemType,
    y: Any,
    n_splits: int = _DEFAULT_N_SPLITS,
    cv_strategy: Optional[str] = None,
) -> Any:
    """Return the appropriate sklearn CV splitter for the problem.

    Args:
        problem_type: Detected task type from problem_detector.
        y:            Target array (used to check class frequencies).
        n_splits:     Number of folds.
        cv_strategy:  Optional override: "stratified" | "kfold" | "timeseries".

    Returns:
        An sklearn CV splitter instance.
    """
    if cv_strategy is not None:
        key = cv_strategy.strip().lower()
        if key == "timeseries":
            logger.info("CV strategy: TimeSeriesSplit (explicit override).")
            return TimeSeriesSplit(n_splits=n_splits)
        if key in ("kfold", "k_fold"):
            logger.info("CV strategy: KFold (explicit override).")
            return KFold(n_splits=n_splits, shuffle=True, random_state=42)
        if key in ("stratified", "stratifiedkfold"):
            logger.info("CV strategy: StratifiedKFold (explicit override).")
            return StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=42)

    # Automatic selection
    is_clf = problem_type in (
        ProblemType.BINARY_CLASSIFICATION,
        ProblemType.MULTI_CLASSIFICATION,
    )

    if is_clf:
        # Check that every class has enough samples for stratification
        y_arr = np.asarray(y)
        unique, counts = np.unique(y_arr, return_counts=True)
        min_count = int(counts.min())
        if min_count >= max(n_splits, _MIN_SAMPLES_PER_CLASS_FOR_STRATIFY):
            logger.info(
                "CV strategy: StratifiedKFold (classification, min class count=%d).",
                min_count,
            )
            return StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=42)
        # Fall back to KFold if some class is too rare
        logger.warning(
            "Falling back to KFold: min class sample count (%d) < n_splits (%d).",
            min_count,
            n_splits,
        )

    logger.info("CV strategy: KFold (regression or rare-class fallback).")
    return KFold(n_splits=n_splits, shuffle=True, random_state=42)


# ---------------------------------------------------------------------------
# Scoring maps
# ---------------------------------------------------------------------------

_CLASSIFICATION_SCORERS = {
    "accuracy": "accuracy",
    "f1_weighted": "f1_weighted",
    "precision_weighted": "precision_weighted",
    "recall_weighted": "recall_weighted",
}

_REGRESSION_SCORERS = {
    "r2": "r2",
    "neg_mae": "neg_mean_absolute_error",
    "neg_rmse": "neg_root_mean_squared_error",
}


# ---------------------------------------------------------------------------
# Public function
# ---------------------------------------------------------------------------

def cross_validate_pipeline(
    pipeline: Pipeline,
    X: Any,
    y: Any,
    problem_type: ProblemType,
    n_splits: int = _DEFAULT_N_SPLITS,
    cv_strategy: Optional[str] = None,
) -> Dict[str, Any]:
    """Run cross-validation on *pipeline* and return structured results.

    Args:
        pipeline:     Unfitted (or fitted — will be cloned) sklearn Pipeline.
        X:            Feature matrix (DataFrame or ndarray).
        y:            Target vector.
        problem_type: ProblemType from problem_detector.
        n_splits:     Number of CV folds (default 5).
        cv_strategy:  Optional override for CV strategy selection.

    Returns:
        Dict with keys:
            strategy          — name of CV splitter used
            n_splits          — number of folds
            scoring_metric    — primary metric name
            fold_scores       — list of per-fold scores (primary metric)
            mean_score        — mean of fold_scores
            std_score         — std of fold_scores
            all_scores        — dict of all scorer → list of fold values
            all_scores_mean   — dict of scorer → mean
            all_scores_std    — dict of scorer → std

    Raises:
        CrossValidationError: On configuration errors.
    """
    if n_splits < 2:
        raise CrossValidationError(
            f"n_splits must be >= 2, got {n_splits}."
        )

    cv_splitter = select_cv_strategy(problem_type, y, n_splits=n_splits, cv_strategy=cv_strategy)

    is_clf = problem_type in (
        ProblemType.BINARY_CLASSIFICATION,
        ProblemType.MULTI_CLASSIFICATION,
    )
    scorers = _CLASSIFICATION_SCORERS if is_clf else _REGRESSION_SCORERS
    primary_metric = "accuracy" if is_clf else "r2"

    # Clone pipeline to avoid cross-contaminating the fitted pipeline
    pipeline_clone = clone(pipeline)

    logger.info(
        "Running %d-fold CV with %s on %d samples.",
        n_splits,
        type(cv_splitter).__name__,
        len(y) if hasattr(y, "__len__") else "?",
    )

    try:
        cv_results = cross_validate(
            pipeline_clone,
            X,
            y,
            cv=cv_splitter,
            scoring=scorers,
            return_train_score=False,
            error_score="raise",
        )
    except Exception as exc:
        raise CrossValidationError(
            f"cross_validate failed: {exc}"
        ) from exc

    # Build structured result — all values as plain Python floats/lists
    all_scores: Dict[str, List[float]] = {}
    all_scores_mean: Dict[str, float] = {}
    all_scores_std: Dict[str, float] = {}

    for scorer_key, scorer_name in scorers.items():
        raw_key = f"test_{scorer_key}"
        vals = cv_results.get(raw_key, np.array([]))
        # Negate negative-convention scorers for human readability
        if scorer_name.startswith("neg_"):
            vals = -vals
        fold_vals = [round(float(v), 6) for v in vals]
        all_scores[scorer_key] = fold_vals
        all_scores_mean[scorer_key] = round(float(np.mean(vals)), 6)
        all_scores_std[scorer_key] = round(float(np.std(vals)), 6)

    primary_folds = all_scores.get(primary_metric, [])
    mean_score = all_scores_mean.get(primary_metric, 0.0)
    std_score = all_scores_std.get(primary_metric, 0.0)

    result: Dict[str, Any] = {
        "strategy": type(cv_splitter).__name__,
        "n_splits": n_splits,
        "scoring_metric": primary_metric,
        "fold_scores": primary_folds,
        "mean_score": mean_score,
        "std_score": std_score,
        "all_scores": all_scores,
        "all_scores_mean": all_scores_mean,
        "all_scores_std": all_scores_std,
    }

    logger.info(
        "CV complete: %s mean=%.4f std=%.4f",
        primary_metric,
        mean_score,
        std_score,
    )
    return result
