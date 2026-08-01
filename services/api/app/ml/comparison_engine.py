"""Comparison Engine — Sprint 5A Part 3.

Compares experiments and/or models across multiple dimensions:
  - metrics comparison
  - hyperparameter diff
  - cross-validation score comparison
  - feature importance overlap and ranking delta
  - training duration comparison
  - overall winner determination

Supports:
  - Binary classification
  - Multi-class classification
  - Regression

No data leakage: only uses already-computed artefacts from the
experiment tracker and model registry.

Public API:
  compare_experiments(experiment_ids)  → ComparisonResult dict
  compare_models(model_ids)            → ComparisonResult dict

Design decisions:
- Both functions produce the same ComparisonResult schema so the API
  router can serve both from the same response model.
- Winner selection uses primary_metric per problem type with tie-breaking
  by training_duration (shorter is better).
- Hyperparameter comparison is a symmetric diff: keys that differ across
  models are flagged; keys that are identical appear in "shared".
- Feature importance comparison ranks features by average importance
  across all compared models.
- All return values are plain Python dicts (JSON-serialisable without a
  custom encoder).
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from app.ml.experiment_tracker import get_experiment
from app.ml.model_registry import get_model_by_id

logger = logging.getLogger("apex_ml.comparison_engine")

# ---------------------------------------------------------------------------
# Primary metric per problem type (for winner selection)
# ---------------------------------------------------------------------------
_PRIMARY_METRIC: Dict[str, str] = {
    "binaryclassification": "accuracy",
    "multiclassification": "f1_score",
    "regression": "r2_score",
}

# Higher is better for these metrics; all others assume lower is better.
_HIGHER_IS_BETTER = {
    "accuracy", "f1_score", "precision", "recall", "roc_auc",
    "pr_auc", "r2_score", "r2",
}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def compare_experiments(experiment_ids: List[str]) -> Dict[str, Any]:
    """Compare multiple experiments by their stored training reports.

    Args:
        experiment_ids: List of experiment UUIDs to compare.

    Returns:
        ComparisonResult dict.  Missing experiments are noted in
        'missing_ids' and excluded from analysis.
    """
    if not experiment_ids:
        return _empty_result("No experiment IDs provided.")

    loaded: List[Dict[str, Any]] = []
    missing: List[str] = []

    for eid in experiment_ids:
        exp = get_experiment(eid)
        if exp is None:
            missing.append(eid)
            logger.warning("Experiment %s not found.", eid)
        else:
            loaded.append(exp)

    if not loaded:
        return _empty_result(
            f"None of the requested experiments were found. Missing: {missing}"
        )

    # Extract report sections (report may be None for running experiments)
    records: List[Dict[str, Any]] = []
    for exp in loaded:
        report = exp.get("report") or {}
        records.append(
            {
                "id": exp["experiment_id"],
                "label": f"{exp.get('algorithm', '?')} ({exp['experiment_id'][:8]})",
                "algorithm": exp.get("algorithm"),
                "problem_type": exp.get("problem_type"),
                "training_duration_seconds": exp.get("training_duration_seconds")
                    or report.get("training_duration_seconds"),
                "metrics": report.get("metrics") or exp.get("metrics_summary") or {},
                "hyperparameters": report.get("hyperparameters")
                    or exp.get("hyperparameters") or {},
                "cross_validation": report.get("cross_validation")
                    or exp.get("cv_mean_score"),
                "feature_importance": report.get("feature_importance") or [],
                "confusion_matrix": report.get("confusion_matrix"),
                "classification_report": report.get("classification_report"),
                "regression_metrics": report.get("regression_metrics"),
                "roc_auc": report.get("roc_auc"),
                "pr_auc": report.get("pr_auc"),
                "pipeline_hash": report.get("pipeline_hash"),
            }
        )

    return _build_comparison_result(records, missing, comparison_type="experiments")


def compare_models(model_ids: List[str]) -> Dict[str, Any]:
    """Compare multiple registered models.

    Args:
        model_ids: List of model_id strings from the model registry.

    Returns:
        ComparisonResult dict.
    """
    if not model_ids:
        return _empty_result("No model IDs provided.")

    loaded: List[Dict[str, Any]] = []
    missing: List[str] = []

    for mid in model_ids:
        model = get_model_by_id(mid)
        if model is None:
            missing.append(mid)
            logger.warning("Model %s not found.", mid)
        else:
            loaded.append(model)

    if not loaded:
        return _empty_result(
            f"None of the requested models were found. Missing: {missing}"
        )

    records: List[Dict[str, Any]] = []
    for m in loaded:
        records.append(
            {
                "id": m["model_id"],
                "label": f"{m.get('algorithm', '?')} ({m['model_id'][:8]})",
                "algorithm": m.get("algorithm"),
                "problem_type": m.get("problem_type"),
                "training_duration_seconds": None,  # not stored in model registry
                "metrics": m.get("metrics") or {},
                "hyperparameters": m.get("best_params") or {},
                "cross_validation": None,
                "feature_importance": [],
                "confusion_matrix": None,
                "classification_report": None,
                "regression_metrics": None,
                "roc_auc": m.get("auc"),
                "pr_auc": None,
                "pipeline_hash": m.get("pipeline_hash"),
            }
        )

    return _build_comparison_result(records, missing, comparison_type="models")


# ---------------------------------------------------------------------------
# Core comparison builder
# ---------------------------------------------------------------------------

def _build_comparison_result(
    records: List[Dict[str, Any]],
    missing: List[str],
    comparison_type: str,
) -> Dict[str, Any]:
    """Assemble the full ComparisonResult from a list of normalised records."""

    # ── Detect primary problem type ──────────────────────────────────────────
    problem_types = [r.get("problem_type") for r in records if r.get("problem_type")]
    primary_problem = problem_types[0] if problem_types else "binaryclassification"
    primary_metric_key = _PRIMARY_METRIC.get(
        (primary_problem or "").lower().replace(" ", ""),
        "accuracy",
    )

    # ── Metrics comparison table ─────────────────────────────────────────────
    all_metric_keys: List[str] = _union_keys([r["metrics"] for r in records])
    metrics_comparison: Dict[str, Any] = {}
    for key in all_metric_keys:
        values: Dict[str, Optional[float]] = {}
        for r in records:
            val = r["metrics"].get(key)
            values[r["id"]] = round(float(val), 6) if isinstance(val, (int, float)) else None
        metrics_comparison[key] = {
            "values": values,
            "labels": {r["id"]: r["label"] for r in records},
            "best_id": _best_id(values, key),
        }

    # ── Hyperparameter diff ──────────────────────────────────────────────────
    hp_comparison = _compare_hyperparams(records)

    # ── CV comparison ─────────────────────────────────────────────────────────
    cv_comparison = _compare_cv(records)

    # ── Feature importance comparison ─────────────────────────────────────────
    fi_comparison = _compare_feature_importance(records)

    # ── Training duration ─────────────────────────────────────────────────────
    duration_comparison = {
        r["id"]: r.get("training_duration_seconds") for r in records
    }

    # ── Ranking ───────────────────────────────────────────────────────────────
    ranking = _build_ranking(records, primary_metric_key)

    # ── Winner ────────────────────────────────────────────────────────────────
    winner_id: Optional[str] = ranking[0]["id"] if ranking else None
    winner_label: Optional[str] = ranking[0]["label"] if ranking else None

    return {
        "comparison_type": comparison_type,
        "n_compared": len(records),
        "missing_ids": missing,
        "problem_type": primary_problem,
        "primary_metric": primary_metric_key,
        "ids": [r["id"] for r in records],
        "labels": {r["id"]: r["label"] for r in records},
        "metrics_comparison": metrics_comparison,
        "hyperparameter_comparison": hp_comparison,
        "cross_validation_comparison": cv_comparison,
        "feature_importance_comparison": fi_comparison,
        "training_duration_comparison": duration_comparison,
        "ranking": ranking,
        "winner_id": winner_id,
        "winner_label": winner_label,
    }


# ---------------------------------------------------------------------------
# Dimension helpers
# ---------------------------------------------------------------------------

def _compare_hyperparams(records: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Diff hyperparameters across records."""
    all_keys = _union_keys([r["hyperparameters"] for r in records])
    shared: Dict[str, Any] = {}
    differing: Dict[str, Dict[str, Any]] = {}

    for key in all_keys:
        values = {r["id"]: r["hyperparameters"].get(key) for r in records}
        unique_vals = set(
            str(v) for v in values.values() if v is not None
        )
        if len(unique_vals) <= 1:
            shared[key] = list(values.values())[0]
        else:
            differing[key] = values

    return {
        "shared_params": shared,
        "differing_params": differing,
        "all_keys": list(all_keys),
    }


def _compare_cv(records: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Compare cross-validation results."""
    result: Dict[str, Any] = {}
    for r in records:
        cv = r.get("cross_validation")
        if isinstance(cv, dict):
            result[r["id"]] = {
                "strategy": cv.get("strategy"),
                "n_splits": cv.get("n_splits"),
                "mean_score": cv.get("mean_score"),
                "std_score": cv.get("std_score"),
                "scoring_metric": cv.get("scoring_metric"),
                "fold_scores": cv.get("fold_scores"),
                "skipped": cv.get("skipped", False),
            }
        elif isinstance(cv, (int, float)):
            result[r["id"]] = {"mean_score": float(cv), "skipped": False}
        else:
            result[r["id"]] = {"skipped": True}
    return result


def _compare_feature_importance(records: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Aggregate and compare feature importances."""
    # Collect all feature names across records
    all_features: Dict[str, List[float]] = {}
    per_record: Dict[str, List[Dict[str, Any]]] = {}

    for r in records:
        fi = r.get("feature_importance") or []
        per_record[r["id"]] = fi
        for entry in fi:
            fname = entry.get("feature", "?")
            imp = entry.get("importance", 0.0)
            all_features.setdefault(fname, []).append(float(imp))

    # Average importance across all models
    avg_importance = {
        feat: round(sum(vals) / len(vals), 8)
        for feat, vals in all_features.items()
    }
    # Rank by average
    ranked_features = sorted(
        avg_importance.items(), key=lambda t: t[1], reverse=True
    )

    return {
        "per_record": per_record,
        "average_importance": dict(ranked_features),
        "top_5_features": [f for f, _ in ranked_features[:5]],
    }


def _build_ranking(
    records: List[Dict[str, Any]],
    primary_metric: str,
) -> List[Dict[str, Any]]:
    """Rank records by primary metric; break ties by training duration."""
    higher = primary_metric in _HIGHER_IS_BETTER

    def _sort_key(r: Dict[str, Any]) -> tuple:
        val = r["metrics"].get(primary_metric)
        if val is None:
            # Missing metric sorts last
            score = float("-inf") if higher else float("inf")
        else:
            score = float(val)
        dur = r.get("training_duration_seconds") or 0.0
        # For higher-is-better: negate for ascending sort
        return (-score if higher else score, dur)

    sorted_records = sorted(records, key=_sort_key)

    ranking: List[Dict[str, Any]] = []
    for rank, r in enumerate(sorted_records, start=1):
        metric_val = r["metrics"].get(primary_metric)
        ranking.append(
            {
                "rank": rank,
                "id": r["id"],
                "label": r["label"],
                "algorithm": r.get("algorithm"),
                "primary_metric_value": round(float(metric_val), 6)
                if isinstance(metric_val, (int, float))
                else None,
                "training_duration_seconds": r.get("training_duration_seconds"),
            }
        )
    return ranking


def _best_id(
    values: Dict[str, Optional[float]],
    metric_key: str,
) -> Optional[str]:
    """Return the record ID with the best value for this metric."""
    valid = {k: v for k, v in values.items() if isinstance(v, (int, float))}
    if not valid:
        return None
    if metric_key in _HIGHER_IS_BETTER:
        return max(valid, key=lambda k: valid[k])
    return min(valid, key=lambda k: valid[k])


def _union_keys(dicts: List[Dict[str, Any]]) -> List[str]:
    """Return sorted union of all dict keys."""
    keys: set = set()
    for d in dicts:
        keys.update(d.keys())
    return sorted(keys)


def _empty_result(reason: str) -> Dict[str, Any]:
    return {
        "comparison_type": "none",
        "n_compared": 0,
        "missing_ids": [],
        "error": reason,
        "ids": [],
        "labels": {},
        "metrics_comparison": {},
        "hyperparameter_comparison": {},
        "cross_validation_comparison": {},
        "feature_importance_comparison": {},
        "training_duration_comparison": {},
        "ranking": [],
        "winner_id": None,
        "winner_label": None,
    }
