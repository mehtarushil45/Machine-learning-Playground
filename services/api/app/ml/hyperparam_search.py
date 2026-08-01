"""Hyperparameter Search Engine — Sprint 4 Module 4.2.

Performs hyperparameter optimisation over a full sklearn Pipeline using
either GridSearchCV or RandomizedSearchCV.

Strategy selection:
  - GridSearchCV   — total parameter combinations <= GRID_SEARCH_MAX_COMBOS
  - RandomizedSearchCV — total combinations > threshold or explicit override

Design decisions:
- Parameter grids are defined per estimator class name so adding new
  estimators only requires adding an entry in _PARAM_GRIDS — no other
  changes.
- The search object wraps the *full* pipeline (preprocessor + estimator)
  and uses the estimator__ prefix notation so preprocessing is correctly
  re-fitted inside every CV fold (no leakage).
- run_hyperparameter_search() returns the best_estimator_ (a refitted
  Pipeline), the best_params_ cleaned of the "estimator__" prefix, and
  the full CV results for the training report.
- All CV scores in the return dict are plain Python floats.
"""

from __future__ import annotations

import logging
import math
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from sklearn.model_selection import GridSearchCV, RandomizedSearchCV
from sklearn.pipeline import Pipeline

from app.ml.problem_detector import ProblemType

logger = logging.getLogger("apex_ml.hyperparam_search")

# ---------------------------------------------------------------------------
# Strategy threshold
# ---------------------------------------------------------------------------
GRID_SEARCH_MAX_COMBOS = 50  # Use GridSearchCV below this count


# ---------------------------------------------------------------------------
# Estimator parameter grids
# ---------------------------------------------------------------------------
# Keys are sklearn estimator class names (type(est).__name__).
# Values are dicts mapping parameter name (without estimator__ prefix) to
# a list of candidate values.
_PARAM_GRIDS: Dict[str, Dict[str, List[Any]]] = {
    "RandomForestClassifier": {
        "n_estimators": [50, 100, 200],
        "max_depth": [None, 5, 10],
        "min_samples_split": [2, 5],
    },
    "RandomForestRegressor": {
        "n_estimators": [50, 100, 200],
        "max_depth": [None, 5, 10],
        "min_samples_split": [2, 5],
    },
    "GradientBoostingClassifier": {
        "n_estimators": [50, 100],
        "learning_rate": [0.05, 0.1, 0.2],
        "max_depth": [3, 5],
    },
    "GradientBoostingRegressor": {
        "n_estimators": [50, 100],
        "learning_rate": [0.05, 0.1, 0.2],
        "max_depth": [3, 5],
    },
    "LogisticRegression": {
        "C": [0.01, 0.1, 1.0, 10.0],
        "solver": ["lbfgs", "liblinear"],
    },
    "LinearRegression": {},   # No hyperparameters to tune
}

# Scoring maps (primary scorer per task)
_PRIMARY_SCORER: Dict[ProblemType, str] = {
    ProblemType.BINARY_CLASSIFICATION: "accuracy",
    ProblemType.MULTI_CLASSIFICATION: "f1_weighted",
    ProblemType.REGRESSION: "r2",
}


# ---------------------------------------------------------------------------
# Public function
# ---------------------------------------------------------------------------

class HyperparameterSearchError(ValueError):
    """Raised when the search cannot be configured or completed."""


def run_hyperparameter_search(
    pipeline: Pipeline,
    X: Any,
    y: Any,
    problem_type: ProblemType,
    n_cv_splits: int = 5,
    n_iter_random: int = 20,
    search_strategy: Optional[str] = None,
    random_state: int = 42,
) -> Tuple[Pipeline, Dict[str, Any], Dict[str, Any]]:
    """Run hyperparameter search and return the best pipeline.

    Args:
        pipeline:         Unfitted sklearn Pipeline (preprocessor + estimator).
        X:                Feature matrix.
        y:                Target vector.
        problem_type:     Detected ProblemType.
        n_cv_splits:      Inner CV folds for search scoring.
        n_iter_random:    Max iterations for RandomizedSearchCV.
        search_strategy:  Optional override: "grid" | "random".
        random_state:     RNG seed.

    Returns:
        Tuple of:
          - best_pipeline   : refitted Pipeline on full training data
          - best_params     : cleaned param dict (estimator__ prefix stripped)
          - search_summary  : dict with strategy, n_candidates, best_score, cv_results_summary
    """
    # ── Identify estimator and fetch its parameter grid ───────────────────────
    estimator = pipeline.named_steps.get("estimator")
    if estimator is None:
        raise HyperparameterSearchError(
            "Pipeline must have a step named 'estimator'."
        )

    est_class_name = type(estimator).__name__
    raw_grid = _PARAM_GRIDS.get(est_class_name, {})

    # Prefix all param names with "estimator__" for Pipeline compatibility
    param_grid = {f"estimator__{k}": v for k, v in raw_grid.items()}

    if not param_grid:
        logger.info(
            "No hyperparameter grid defined for %s. Skipping search; "
            "returning pipeline fitted on full data.",
            est_class_name,
        )
        pipeline.fit(X, y)
        return (
            pipeline,
            {},
            {
                "strategy": "none",
                "estimator": est_class_name,
                "n_candidates": 0,
                "best_score": None,
                "cv_results_summary": [],
                "skipped": True,
                "reason": f"No parameter grid defined for {est_class_name}.",
            },
        )

    # ── Count total combinations ──────────────────────────────────────────────
    total_combos = math.prod(len(v) for v in param_grid.values())

    # ── Select strategy ───────────────────────────────────────────────────────
    if search_strategy is not None:
        use_grid = search_strategy.strip().lower() == "grid"
    else:
        use_grid = total_combos <= GRID_SEARCH_MAX_COMBOS

    scorer = _PRIMARY_SCORER[problem_type]
    logger.info(
        "Hyperparameter search: estimator=%s, combos=%d, strategy=%s, scorer=%s",
        est_class_name,
        total_combos,
        "GridSearchCV" if use_grid else "RandomizedSearchCV",
        scorer,
    )

    # ── Run search ────────────────────────────────────────────────────────────
    try:
        if use_grid:
            searcher = GridSearchCV(
                estimator=pipeline,
                param_grid=param_grid,
                scoring=scorer,
                cv=n_cv_splits,
                refit=True,
                n_jobs=-1,
                return_train_score=False,
            )
        else:
            actual_iter = min(n_iter_random, total_combos)
            searcher = RandomizedSearchCV(
                estimator=pipeline,
                param_distributions=param_grid,
                n_iter=actual_iter,
                scoring=scorer,
                cv=n_cv_splits,
                refit=True,
                n_jobs=-1,
                random_state=random_state,
                return_train_score=False,
            )

        searcher.fit(X, y)

    except Exception as exc:
        raise HyperparameterSearchError(
            f"Hyperparameter search failed for {est_class_name}: {exc}"
        ) from exc

    # ── Extract results ───────────────────────────────────────────────────────
    best_pipeline: Pipeline = searcher.best_estimator_

    # Strip "estimator__" prefix for human-readable output
    best_params: Dict[str, Any] = {
        k.replace("estimator__", ""): v
        for k, v in searcher.best_params_.items()
    }

    # Build compact cv_results_summary (top-10 by mean test score)
    cv_df_raw = searcher.cv_results_
    n_candidates = len(cv_df_raw["mean_test_score"])
    indices = np.argsort(cv_df_raw["mean_test_score"])[::-1][:10]

    cv_results_summary: List[Dict[str, Any]] = []
    for idx in indices:
        params_clean = {
            k.replace("estimator__", ""): v
            for k, v in cv_df_raw["params"][idx].items()
        }
        cv_results_summary.append(
            {
                "rank": int(cv_df_raw["rank_test_score"][idx]),
                "params": params_clean,
                "mean_score": round(float(cv_df_raw["mean_test_score"][idx]), 6),
                "std_score": round(float(cv_df_raw["std_test_score"][idx]), 6),
            }
        )

    search_summary: Dict[str, Any] = {
        "strategy": "GridSearchCV" if use_grid else "RandomizedSearchCV",
        "estimator": est_class_name,
        "n_candidates": n_candidates,
        "best_score": round(float(searcher.best_score_), 6),
        "scorer": scorer,
        "cv_splits": n_cv_splits,
        "best_params": best_params,
        "cv_results_summary": cv_results_summary,
        "skipped": False,
    }

    logger.info(
        "Search complete: best_score=%.4f params=%s",
        searcher.best_score_,
        best_params,
    )
    return best_pipeline, best_params, search_summary
