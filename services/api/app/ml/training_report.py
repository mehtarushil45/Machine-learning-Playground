"""Training Report Generator — Sprint 4 Module 4.5.

Assembles a comprehensive, fully-serialisable training report from
the outputs of every Sprint 3 and Sprint 4 pipeline stage.

Report sections:
  experiment_id      — uuid4
  model_version      — semver-style string
  dataset_version    — hash of dataset file path + modification time
  training_timestamp — ISO-8601 UTC
  random_seed        — reproducibility seed
  algorithm          — human-readable algorithm name
  problem_type       — ProblemType.value string
  training_duration  — seconds (float)
  pipeline_hash      — stable hash of the serialised pipeline repr
  dataset_summary    — row/column counts, feature types, missing value summary
  metrics            — final hold-out metrics dict
  cross_validation   — CV results dict (from cross_validator)
  hyperparameters    — best params dict (from hyperparam_search)
  feature_importance — ranked importance list (from feature_importance)
  classification_report — per-class metrics dict (classification only)
  confusion_matrix   — 2D list (classification only)
  roc_auc            — float or None
  pr_auc             — float or None (precision-recall AUC)
  regression_metrics — extended regression metrics (regression only)

All values are JSON-serialisable (no numpy arrays, no datetime objects).

Design decisions:
- generate_training_report() is a pure function — all its inputs are
  already computed before it is called, so it adds no data leakage.
- confusion_matrix and classification_report require sklearn but are
  imported lazily inside the function to avoid top-level sklearn coupling.
- pr_auc is computed from precision_recall_curve to complement ROC AUC
  in imbalanced datasets.
- The report is returned as a plain dict so it can be written to JSON by
  both the experiment tracker and the model registry without converters.
"""

from __future__ import annotations

import hashlib
import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import uuid

import numpy as np

from app.ml.dataset_loader import DatasetContext
from app.ml.problem_detector import ProblemType

logger = logging.getLogger("apex_ml.training_report")


# ---------------------------------------------------------------------------
# Public function
# ---------------------------------------------------------------------------

def generate_training_report(
    job_id: str,
    ctx: DatasetContext,
    problem_type: ProblemType,
    algorithm: str,
    random_seed: int,
    training_duration_seconds: float,
    fitted_pipeline: Any,                          # sklearn Pipeline
    X_test: Any,
    y_test: Any,
    y_pred: Any,
    y_prob: Optional[Any],
    metrics: Dict[str, Any],
    cv_results: Optional[Dict[str, Any]],
    best_params: Optional[Dict[str, Any]],
    feature_importance: Optional[List[Dict[str, Any]]],
    model_version: str,
    dataset_version: str,
    experiment_id: str,
) -> Dict[str, Any]:
    """Assemble and return the complete serialisable training report.

    Returns a plain dict with all fields described in the module docstring.
    """
    is_clf = problem_type in (
        ProblemType.BINARY_CLASSIFICATION,
        ProblemType.MULTI_CLASSIFICATION,
    )

    # ── Pipeline hash ─────────────────────────────────────────────────────────
    pipeline_hash = _stable_hash(repr(fitted_pipeline))

    # ── Classification-only extras ────────────────────────────────────────────
    clf_report: Optional[Dict[str, Any]] = None
    confusion: Optional[List[List[int]]] = None
    roc_auc_val: Optional[float] = None
    pr_auc_val: Optional[float] = None

    if is_clf:
        clf_report, confusion = _compute_classification_report_and_cm(y_test, y_pred)
        roc_auc_val, pr_auc_val = _compute_roc_pr_auc(y_test, y_pred, y_prob, problem_type)

    # ── Extended regression metrics ───────────────────────────────────────────
    regression_metrics: Optional[Dict[str, float]] = None
    if not is_clf:
        regression_metrics = _compute_extended_regression_metrics(y_test, y_pred)

    # ── Dataset summary ───────────────────────────────────────────────────────
    dataset_summary = _build_dataset_summary(ctx)

    report: Dict[str, Any] = {
        # Identity
        "experiment_id": experiment_id,
        "job_id": job_id,
        "model_version": model_version,
        "dataset_version": dataset_version,
        "training_timestamp": datetime.now(timezone.utc).isoformat(),
        "random_seed": random_seed,
        "algorithm": algorithm,
        "problem_type": problem_type.value,
        "training_duration_seconds": round(training_duration_seconds, 4),
        "pipeline_hash": pipeline_hash,
        # Data
        "dataset_summary": dataset_summary,
        # Core metrics
        "metrics": metrics,
        "cross_validation": cv_results,
        "hyperparameters": best_params or {},
        "feature_importance": feature_importance or [],
        # Classification-specific
        "classification_report": clf_report,
        "confusion_matrix": confusion,
        "roc_auc": roc_auc_val,
        "pr_auc": pr_auc_val,
        # Regression-specific
        "regression_metrics": regression_metrics,
    }

    logger.info(
        "Training report assembled for job %s (experiment %s).",
        job_id,
        experiment_id,
    )
    return report


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _stable_hash(text: str) -> str:
    """Return a stable 12-char hex hash of *text*."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:12]


def _build_dataset_summary(ctx: DatasetContext) -> Dict[str, Any]:
    """Extract a serialisable summary from DatasetContext."""
    total_missing = sum(ctx.missing_per_column.values())
    return {
        "dataset_id": ctx.dataset_id,
        "file_path": ctx.file_path,
        "row_count": ctx.row_count,
        "column_count": ctx.column_count,
        "feature_count": len(ctx.feature_columns),
        "target_column": ctx.target_column,
        "feature_columns": ctx.feature_columns,
        "numeric_columns": ctx.numeric_columns,
        "categorical_columns": ctx.categorical_columns,
        "boolean_columns": ctx.boolean_columns,
        "datetime_columns": ctx.datetime_columns,
        "total_missing_values": total_missing,
        "missing_per_column": ctx.missing_per_column,
    }


def _compute_classification_report_and_cm(
    y_test: Any, y_pred: Any
) -> tuple:
    """Return (classification_report_dict, confusion_matrix_2d_list)."""
    try:
        from sklearn.metrics import classification_report, confusion_matrix

        clf_dict: Dict[str, Any] = classification_report(
            y_test, y_pred, output_dict=True, zero_division=0
        )
        # Convert numpy values to plain Python floats
        clf_serialisable: Dict[str, Any] = {}
        for k, v in clf_dict.items():
            if isinstance(v, dict):
                clf_serialisable[k] = {
                    mk: round(float(mv), 4) if isinstance(mv, (int, float, np.floating)) else mv
                    for mk, mv in v.items()
                }
            elif isinstance(v, (int, float, np.floating)):
                clf_serialisable[k] = round(float(v), 4)
            else:
                clf_serialisable[k] = v

        cm = confusion_matrix(y_test, y_pred)
        cm_list: List[List[int]] = cm.tolist()
        return clf_serialisable, cm_list
    except Exception as exc:
        logger.warning("Could not compute classification report/CM: %s", exc)
        return None, None


def _compute_roc_pr_auc(
    y_test: Any,
    y_pred: Any,
    y_prob: Optional[Any],
    problem_type: ProblemType,
) -> tuple:
    """Return (roc_auc, pr_auc) floats or (None, None)."""
    roc_val: Optional[float] = None
    pr_val: Optional[float] = None

    if y_prob is None:
        return roc_val, pr_val

    try:
        from sklearn.metrics import (
            auc,
            precision_recall_curve,
            roc_auc_score,
        )

        y_test_arr = np.asarray(y_test)

        if problem_type == ProblemType.BINARY_CLASSIFICATION:
            unique = np.unique(y_test_arr)
            if len(unique) == 2:
                # Ensure probabilities are for the positive class
                if y_prob.ndim == 2:
                    prob_pos = y_prob[:, 1]
                else:
                    prob_pos = y_prob

                roc_val = round(float(roc_auc_score(y_test_arr, prob_pos)), 6)

                precision, recall, _ = precision_recall_curve(y_test_arr, prob_pos)
                pr_val = round(float(auc(recall, precision)), 6)

    except Exception as exc:
        logger.warning("Could not compute ROC/PR AUC: %s", exc)

    return roc_val, pr_val


def _compute_extended_regression_metrics(
    y_test: Any, y_pred: Any
) -> Dict[str, float]:
    """Compute extended regression metrics beyond MAE/RMSE/R2."""
    try:
        from sklearn.metrics import (
            explained_variance_score,
            max_error,
            mean_absolute_percentage_error,
        )

        y_t = np.asarray(y_test, dtype=float)
        y_p = np.asarray(y_pred, dtype=float)

        result: Dict[str, float] = {
            "explained_variance": round(float(explained_variance_score(y_t, y_p)), 6),
            "max_error": round(float(max_error(y_t, y_p)), 6),
        }
        try:
            mape = float(mean_absolute_percentage_error(y_t, y_p))
            result["mape"] = round(mape, 6)
        except Exception:
            result["mape"] = None  # type: ignore[assignment]

        return result
    except Exception as exc:
        logger.warning("Could not compute extended regression metrics: %s", exc)
        return {}


def build_dataset_version(ctx: DatasetContext) -> str:
    """Produce a stable version string for a dataset from its file stats."""
    try:
        stat = os.stat(ctx.file_path)
        raw = f"{ctx.file_path}:{stat.st_size}:{stat.st_mtime}"
    except Exception:
        raw = ctx.file_path
    return "dv-" + hashlib.sha256(raw.encode()).hexdigest()[:10]


def build_model_version(algorithm: str, experiment_id: str) -> str:
    """Produce a consistent model version string."""
    import re
    algo_slug = re.sub(r"[^a-z0-9]+", "-", algorithm.lower().strip())[:20]
    return f"v1.0.0-{algo_slug}-{experiment_id[:8]}"
