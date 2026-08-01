"""Model Factory — Sprint 3 Module 3.4.

Returns unfitted scikit-learn estimators by algorithm name.

Factory pattern:
- A private registry dict maps canonical algorithm names to zero-argument
  factory callables.
- create_model() does a normalised lookup (strip, casefold, collapse spaces)
  so minor spelling variations ("Random Forest" vs "Random Forest Classifier")
  resolve to the same estimator.
- Adding a new algorithm requires inserting one entry into _REGISTRY —
  no existing code changes.

Design decisions:
- All estimators are parameterised only by random_state for reproducibility.
  Hyper-parameter tuning belongs to a future Batch 2 module.
- The factory always returns an unfitted estimator.  Fitting happens inside
  engine.py so the full sklearn Pipeline is assembled before any data is seen.
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
from sklearn.linear_model import LinearRegression, LogisticRegression

from app.ml.problem_detector import ProblemType

logger = logging.getLogger("apex_ml.model_factory")

# ---------------------------------------------------------------------------
# Registry type alias
# ---------------------------------------------------------------------------
# Each entry is a callable that accepts (random_state: int) and returns an
# unfitted sklearn estimator.
_FactoryFn = Callable[[int], BaseEstimator]

# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------
# Keys are lowercase, stripped, and space-normalised for resilient lookup.
# New algorithms plug in here — nothing else changes.
_REGISTRY: Dict[str, _FactoryFn] = {
    # ── Classification ────────────────────────────────────────────────────────
    "logistic regression": lambda rs: LogisticRegression(
        max_iter=1000, random_state=rs
    ),
    "random forest classifier": lambda rs: RandomForestClassifier(
        n_estimators=100, random_state=rs
    ),
    "random forest": lambda rs: RandomForestClassifier(
        n_estimators=100, random_state=rs
    ),
    "gradient boosting classifier": lambda rs: GradientBoostingClassifier(
        random_state=rs
    ),
    "gradient boosting": lambda rs: GradientBoostingClassifier(random_state=rs),
    # ── Regression ───────────────────────────────────────────────────────────
    "linear regression": lambda _: LinearRegression(),
    "random forest regressor": lambda rs: RandomForestRegressor(
        n_estimators=100, random_state=rs
    ),
    "gradient boosting regressor": lambda rs: GradientBoostingRegressor(
        random_state=rs
    ),
}

# Default fallbacks keyed by ProblemType for when the requested algorithm is
# unrecognised.
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
    """Return an unfitted scikit-learn estimator.

    Args:
        algorithm:    Human-readable algorithm name (case-insensitive).
        problem_type: Detected :class:`~app.ml.problem_detector.ProblemType`
                      used to select an appropriate fallback estimator when
                      *algorithm* is not in the registry.
        random_state: Integer seed for reproducibility.

    Returns:
        An unfitted :class:`~sklearn.base.BaseEstimator`.
    """
    key = _normalise(algorithm)
    factory = _REGISTRY.get(key)

    if factory is not None:
        estimator = factory(random_state)
        logger.info(
            "Model factory: resolved '%s' → %s",
            algorithm,
            type(estimator).__name__,
        )
        return estimator

    # Unrecognised algorithm — fall back by problem type
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


def list_supported_algorithms() -> Dict[str, list]:
    """Return a dict of supported algorithm names grouped by task.

    Useful for documentation endpoints or frontend algorithm pickers.
    """
    return {
        "classification": [
            "Logistic Regression",
            "Random Forest Classifier",
            "Gradient Boosting Classifier",
        ],
        "regression": [
            "Linear Regression",
            "Random Forest Regressor",
            "Gradient Boosting Regressor",
        ],
    }


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _normalise(name: str) -> str:
    """Lowercase, strip, and collapse whitespace for registry lookup."""
    import re
    return re.sub(r"\s+", " ", name.strip().lower())
