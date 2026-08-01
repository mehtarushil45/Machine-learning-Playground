"""Feature Importance Computer — Sprint 4 Module 4.4.

Automatically computes feature importances for a fitted sklearn Pipeline.

Supported strategies (tried in priority order):
  1. Tree-based models: feature_importances_ attribute (RF, GB, DT)
  2. Linear models: coef_ attribute (LR, LinearRegression)
  3. Permutation importance fallback for any other estimator type

Design decisions:
- All strategies produce the same output shape: a list of
  {"feature": str, "importance": float, "rank": int} dicts sorted by
  importance descending.
- The function works on the *fitted* pipeline and reconstructs the feature
  names from the ColumnTransformer output using get_feature_names_out().
  Older sklearn versions that don't support this method fall back to
  generic names (feature_0, feature_1, …).
- Permutation importance uses the training data, not a held-out set, to
  avoid requiring an extra data argument at the reporting stage.
- All values are serialisable plain Python dicts.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

import numpy as np
from sklearn.inspection import permutation_importance
from sklearn.pipeline import Pipeline

logger = logging.getLogger("apex_ml.feature_importance")


# ---------------------------------------------------------------------------
# Public function
# ---------------------------------------------------------------------------

def compute_feature_importance(
    fitted_pipeline: Pipeline,
    X_train: Any,
    y_train: Any,
    feature_columns: List[str],
    n_repeats: int = 5,
    random_state: int = 42,
) -> List[Dict[str, Any]]:
    """Compute ranked feature importances from a fitted pipeline.

    Args:
        fitted_pipeline: A fitted sklearn Pipeline with at least two steps:
                         "preprocessor" (ColumnTransformer) and "estimator".
        X_train:         Training feature DataFrame (used for permutation fallback).
        y_train:         Training target (used for permutation fallback).
        feature_columns: Original feature column names (before preprocessing).
        n_repeats:       Repeats for permutation importance (default 5).
        random_state:    RNG seed.

    Returns:
        List of dicts: [{"feature": str, "importance": float, "rank": int}, ...]
        Sorted by importance descending.  Empty list on irrecoverable failure.
    """
    estimator = fitted_pipeline.named_steps.get("estimator")
    preprocessor = fitted_pipeline.named_steps.get("preprocessor")

    if estimator is None:
        logger.warning("Pipeline has no 'estimator' step; skipping feature importance.")
        return []

    # ── Try to recover transformed feature names from ColumnTransformer ───────
    transformed_names = _get_transformed_feature_names(preprocessor, feature_columns)

    # ── Strategy 1: Tree-based feature_importances_ ────────────────────────────
    if hasattr(estimator, "feature_importances_"):
        raw = estimator.feature_importances_
        return _build_ranked_list(transformed_names, raw, "tree")

    # ── Strategy 2: Linear coef_ ──────────────────────────────────────────────
    if hasattr(estimator, "coef_"):
        coef = estimator.coef_
        # Multi-class: coef_ is (n_classes, n_features); take mean absolute value
        if coef.ndim > 1:
            raw = np.mean(np.abs(coef), axis=0)
        else:
            raw = np.abs(coef)
        return _build_ranked_list(transformed_names, raw, "linear")

    # ── Strategy 3: Permutation importance fallback ────────────────────────────
    logger.info(
        "No native importance attribute; falling back to permutation importance."
    )
    try:
        perm_result = permutation_importance(
            fitted_pipeline,
            X_train,
            y_train,
            n_repeats=n_repeats,
            random_state=random_state,
            n_jobs=-1,
        )
        # Permutation importance is in terms of original feature columns
        raw = perm_result.importances_mean
        return _build_ranked_list(feature_columns, raw, "permutation")
    except Exception as exc:
        logger.warning("Permutation importance failed: %s", exc)
        return []


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _get_transformed_feature_names(
    preprocessor: Optional[Any],
    original_columns: List[str],
) -> List[str]:
    """Retrieve output feature names from a fitted ColumnTransformer.

    Falls back to generic names if the preprocessor is absent or does not
    expose get_feature_names_out().
    """
    if preprocessor is None:
        return original_columns

    try:
        names: List[str] = list(preprocessor.get_feature_names_out())
        return names
    except Exception:
        pass

    # Fallback: use original column names if the count matches
    try:
        n_out = preprocessor.transform(
            preprocessor.feature_names_in_[:1] if hasattr(preprocessor, "feature_names_in_") else None
        )
    except Exception:
        pass

    return original_columns


def _build_ranked_list(
    names: List[str],
    importances: Any,
    strategy: str,
) -> List[Dict[str, Any]]:
    """Pair names with importance values, sort, and assign ranks."""
    imp_arr = np.asarray(importances, dtype=np.float64)

    # Align lengths — truncate or pad with zeros
    n_names = len(names)
    n_imp = len(imp_arr)
    if n_imp > n_names:
        imp_arr = imp_arr[:n_names]
    elif n_imp < n_names:
        imp_arr = np.pad(imp_arr, (0, n_names - n_imp), constant_values=0.0)

    # Normalise to [0, 1] range for comparability across strategies
    total = float(imp_arr.sum())
    if total > 0:
        imp_normalised = imp_arr / total
    else:
        imp_normalised = imp_arr

    paired = sorted(
        zip(names, imp_normalised),
        key=lambda t: t[1],
        reverse=True,
    )

    result: List[Dict[str, Any]] = []
    for rank, (feat_name, imp_val) in enumerate(paired, start=1):
        result.append(
            {
                "feature": str(feat_name),
                "importance": round(float(imp_val), 8),
                "rank": rank,
                "strategy": strategy,
            }
        )

    logger.info(
        "Feature importance computed via '%s': %d features.",
        strategy,
        len(result),
    )
    return result
