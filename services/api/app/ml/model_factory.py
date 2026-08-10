"""Model Factory — Sprint 3 Module 3.4.

Returns unfitted scikit-learn / XGBoost / LightGBM estimators by algorithm name.

Factory pattern:
- A private registry dict maps canonical algorithm names to zero-argument
  factory callables.
- create_model() does a normalised lookup (strip, casefold, collapse spaces)
  and intelligently resolves generic algorithm names (e.g. "xgboost", "lightgbm",
  "ridge", "lasso", "random forest") to classification or regression variants based
  on problem_type.
- Adding a new algorithm requires inserting one entry into _REGISTRY —
  no existing code changes.
"""

from __future__ import annotations

import logging
from typing import Any, Callable, Dict

from sklearn.base import BaseEstimator
from sklearn.ensemble import (
    GradientBoostingClassifier,
    GradientBoostingRegressor,
    RandomForestClassifier,
    RandomForestRegressor,
)
from sklearn.linear_model import (
    Lasso,
    LinearRegression,
    LogisticRegression,
    Ridge,
    RidgeClassifier,
)

# Optional XGBoost & LightGBM imports with graceful fallbacks
try:
    from xgboost import XGBClassifier, XGBRegressor
    _HAS_XGBOOST = True
except ImportError:
    _HAS_XGBOOST = False

try:
    from lightgbm import LGBMClassifier, LGBMRegressor
    _HAS_LIGHTGBM = True
except ImportError:
    _HAS_LIGHTGBM = False

from app.ml.problem_detector import ProblemType

logger = logging.getLogger("apex_ml.model_factory")

# ---------------------------------------------------------------------------
# Registry type alias
# ---------------------------------------------------------------------------
_FactoryFn = Callable[[int], BaseEstimator]

# Helper constructors for XGBoost & LightGBM with fallbacks
def _make_xgb_classifier(rs: int) -> BaseEstimator:
    if _HAS_XGBOOST:
        return XGBClassifier(random_state=rs, eval_metric="logloss")
    logger.warning("XGBoost not installed; falling back to GradientBoostingClassifier")
    return GradientBoostingClassifier(random_state=rs)

def _make_xgb_regressor(rs: int) -> BaseEstimator:
    if _HAS_XGBOOST:
        return XGBRegressor(random_state=rs)
    logger.warning("XGBoost not installed; falling back to GradientBoostingRegressor")
    return GradientBoostingRegressor(random_state=rs)

def _make_lgbm_classifier(rs: int) -> BaseEstimator:
    if _HAS_LIGHTGBM:
        return LGBMClassifier(random_state=rs, verbose=-1)
    logger.warning("LightGBM not installed; falling back to GradientBoostingClassifier")
    return GradientBoostingClassifier(random_state=rs)

def _make_lgbm_regressor(rs: int) -> BaseEstimator:
    if _HAS_LIGHTGBM:
        return LGBMRegressor(random_state=rs, verbose=-1)
    logger.warning("LightGBM not installed; falling back to GradientBoostingRegressor")
    return GradientBoostingRegressor(random_state=rs)


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------
_REGISTRY: Dict[str, _FactoryFn] = {
    # ── Classification ────────────────────────────────────────────────────────
    "logistic regression": lambda rs: LogisticRegression(
        max_iter=1000, random_state=rs
    ),
    "random forest classifier": lambda rs: RandomForestClassifier(
        n_estimators=100, random_state=rs
    ),
    "gradient boosting classifier": lambda rs: GradientBoostingClassifier(
        random_state=rs
    ),
    "xgboost classifier": _make_xgb_classifier,
    "lightgbm classifier": _make_lgbm_classifier,
    "ridge classifier": lambda rs: RidgeClassifier(random_state=rs),
    "lasso classifier": lambda rs: LogisticRegression(
        penalty="l1", solver="liblinear", random_state=rs
    ),

    # ── Regression ───────────────────────────────────────────────────────────
    "linear regression": lambda _: LinearRegression(),
    "random forest regressor": lambda rs: RandomForestRegressor(
        n_estimators=100, random_state=rs
    ),
    "gradient boosting regressor": lambda rs: GradientBoostingRegressor(
        random_state=rs
    ),
    "xgboost regressor": _make_xgb_regressor,
    "lightgbm regressor": _make_lgbm_regressor,
    "ridge": lambda rs: Ridge(random_state=rs),
    "ridge regressor": lambda rs: Ridge(random_state=rs),
    "lasso": lambda rs: Lasso(random_state=rs),
    "lasso regressor": lambda rs: Lasso(random_state=rs),
}

# Generic algorithm name mapping based on problem type
_GENERIC_MAP: Dict[str, Dict[str, str]] = {
    "xgboost": {
        "classification": "xgboost classifier",
        "regression": "xgboost regressor",
    },
    "lightgbm": {
        "classification": "lightgbm classifier",
        "regression": "lightgbm regressor",
    },
    "ridge": {
        "classification": "ridge classifier",
        "regression": "ridge",
    },
    "lasso": {
        "classification": "lasso classifier",
        "regression": "lasso",
    },
    "random forest": {
        "classification": "random forest classifier",
        "regression": "random forest regressor",
    },
    "gradient boosting": {
        "classification": "gradient boosting classifier",
        "regression": "gradient boosting regressor",
    },
}

# Default fallbacks keyed by ProblemType for unrecognised algorithms
_DEFAULTS: Dict[ProblemType, _FactoryFn] = {
    ProblemType.BINARY_CLASSIFICATION: lambda rs: RandomForestClassifier(
        n_estimators=100, random_state=rs
    ),
    ProblemType.MULTI_CLASSIFICATION: lambda rs: RandomForestClassifier(
        n_estimators=100, random_state=rs
    ),
    ProblemType.REGRESSION: lambda rs: RandomForestRegressor(
        n_estimators=100, random_state=rs
    ),
}


# ---------------------------------------------------------------------------
# Public factory function
# ---------------------------------------------------------------------------

def create_model(
    algorithm: str,
    problem_type: ProblemType,
    random_state: int = 42,
) -> BaseEstimator:
    """Return an unfitted estimator for classification or regression.

    Args:
        algorithm:    Human-readable algorithm name (case-insensitive).
        problem_type: Detected :class:`~app.ml.problem_detector.ProblemType`.
        random_state: Integer seed for reproducibility.

    Returns:
        An unfitted :class:`~sklearn.base.BaseEstimator`.
    """
    key = _normalise(algorithm)

    # 1. Resolve generic algorithm names according to task (classification vs regression)
    is_classification = problem_type in (
        ProblemType.BINARY_CLASSIFICATION,
        ProblemType.MULTI_CLASSIFICATION,
    )
    task_kind = "classification" if is_classification else "regression"

    if key in _GENERIC_MAP:
        key = _GENERIC_MAP[key][task_kind]

    # 2. Lookup in registry
    factory = _REGISTRY.get(key)

    if factory is not None:
        estimator = factory(random_state)
        logger.info(
            "Model factory: resolved '%s' (task=%s) → %s",
            algorithm,
            task_kind,
            type(estimator).__name__,
        )
        return estimator

    # 3. Unrecognised algorithm — fall back by problem type
    fallback = _DEFAULTS[problem_type]
    estimator = fallback(random_state)
    logger.warning(
        "Algorithm '%s' not found in registry (key='%s'). "
        "Falling back to %s for problem type %s.",
        algorithm,
        key,
        type(estimator).__name__,
        problem_type.value,
    )
    return estimator


def list_supported_algorithms() -> Dict[str, list[str]]:
    """Return a dict of supported algorithm names grouped by task."""
    return {
        "classification": [
            "Logistic Regression",
            "Random Forest Classifier",
            "Gradient Boosting Classifier",
            "XGBoost Classifier",
            "LightGBM Classifier",
            "Ridge Classifier",
        ],
        "regression": [
            "Linear Regression",
            "Random Forest Regressor",
            "Gradient Boosting Regressor",
            "XGBoost Regressor",
            "LightGBM Regressor",
            "Ridge",
            "Lasso",
        ],
    }


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _normalise(name: str) -> str:
    """Lowercase, strip, and collapse whitespace for registry lookup."""
    import re
    return re.sub(r"\s+", " ", name.strip().lower())
