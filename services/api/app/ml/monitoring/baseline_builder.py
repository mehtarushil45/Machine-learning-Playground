"""V6B Baseline Builder.

Builds two strictly separate baselines:
1. FeatureBaseline  — from dataset validation context / prediction distribution
2. PerformanceBaseline — from training metrics in model registry

Priority for FeatureBaseline:
  1. dataset_validation_context in lineage (schema + validation stats)
  2. warm_start (prediction_logger records for prediction distribution)
  3. cold_start (empty baseline with warnings)

Priority for PerformanceBaseline:
  1. model_metadata.metrics (training metrics)
  2. lineage.metrics
  3. cold_start (empty baseline)
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger("apex_ml.monitoring.baseline_builder")

SCHEMA_VERSION = "6b.1.0"

_CLASSIFICATION_KEYWORDS = {
    "classifier", "classification", "logistic", "svm", "forest", "tree",
    "naive", "knn", "perceptron", "xgb", "lgbm", "catboost",
}
_REGRESSION_KEYWORDS = {
    "regressor", "regression", "linear", "ridge", "lasso", "svr",
    "elasticnet", "huber", "bayesianridge", "gradientboosting",
}


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id(prefix: str) -> str:
    return prefix + uuid.uuid4().hex[:8]


# ---------------------------------------------------------------------------
# Feature Baseline
# ---------------------------------------------------------------------------

def build_feature_baseline(
    monitoring_id: str,
    model_id: str,
    lineage: Optional[dict],
    prediction_log_records: List[dict],
) -> dict:
    """Build feature baseline dict.

    Priority:
      1. lineage.dataset.validation_context_summary + feature_set.feature_columns
      2. prediction_log_records warm_start: extract prediction distribution
      3. cold_start: empty baseline with warning logged
    """
    feature_names: List[str] = []
    feature_schema: dict = {}
    feature_stats: dict = {}
    missing_rates: dict = {}
    source = "cold_start"
    sample_count = 0

    # Priority 1: Lineage validation context
    if lineage:
        feature_set = lineage.get("feature_set", {})
        feature_names = feature_set.get("feature_columns", [])
        if feature_names:
            feature_schema = extract_feature_schema_from_lineage(lineage)
            missing_rates = {fn: 0.0 for fn in feature_names}
            source = "dataset_validation"
            # If validation_context_summary exists, note the row count
            ctx = lineage.get("dataset", {}).get("validation_context_summary", {})
            if ctx:
                feature_stats["baseline_row_count"] = ctx.get("row_count", 0)
                feature_stats["baseline_column_count"] = ctx.get("column_count", 0)
                feature_stats["validation_passed"] = ctx.get("validation_passed", False)

    # Prediction distribution from prediction_logger records
    prediction_distribution = compute_prediction_distribution(prediction_log_records)
    sample_count = len(prediction_log_records)

    if not feature_names and prediction_log_records:
        # warm_start from prediction records
        source = "warm_start"
        logger.warning(
            "monitor=%s model=%s: No feature schema in lineage; warm_start from %d prediction records",
            monitoring_id, model_id, sample_count,
        )
    elif not feature_names:
        source = "cold_start"
        logger.warning(
            "monitor=%s model=%s: Cold start — no feature schema and no prediction records.",
            monitoring_id, model_id,
        )

    return {
        "baseline_id": _new_id("fb-"),
        "monitoring_id": monitoring_id,
        "model_id": model_id,
        "source": source,
        "feature_names": feature_names,
        "feature_schema": feature_schema,
        "feature_stats": feature_stats,
        "prediction_distribution": prediction_distribution,
        "missing_rates": missing_rates,
        "sample_count": sample_count,
        "created_at": _utc_now(),
        "schema_version": SCHEMA_VERSION,
    }


def build_performance_baseline(
    monitoring_id: str,
    model_id: str,
    model_metadata: Optional[dict],
    lineage: Optional[dict],
) -> dict:
    """Build performance baseline dict.

    Priority:
      1. model_metadata.metrics (training metrics)
      2. lineage.metrics
      3. cold_start (empty baseline)
    """
    task_type = infer_task_type(model_metadata, lineage)
    training_metrics: dict = {}
    source = "cold_start"

    # Priority 1: model registry metadata metrics
    if model_metadata:
        meta_metrics = model_metadata.get("metrics", {})
        if meta_metrics:
            training_metrics = {k: v for k, v in meta_metrics.items() if isinstance(v, (int, float))}
            if training_metrics:
                source = "training_metrics"

    # Priority 2: lineage metrics (if not found above)
    if not training_metrics and lineage:
        lin_metrics = lineage.get("metrics", {})
        if lin_metrics:
            training_metrics = {k: v for k, v in lin_metrics.items() if isinstance(v, (int, float))}
            if training_metrics:
                source = "training_metrics"

    if not training_metrics:
        source = "cold_start"
        logger.warning(
            "monitor=%s model=%s: Performance cold_start — no training metrics found.",
            monitoring_id, model_id,
        )

    return {
        "baseline_id": _new_id("pb-"),
        "monitoring_id": monitoring_id,
        "model_id": model_id,
        "source": source,
        "task_type": task_type,
        "training_metrics": training_metrics,
        "created_at": _utc_now(),
        "schema_version": SCHEMA_VERSION,
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def infer_task_type(
    model_metadata: Optional[dict],
    lineage: Optional[dict],
) -> str:
    """Infer 'classification' or 'regression' or 'unknown'."""
    for source in [model_metadata, lineage]:
        if not source:
            continue
        # Check problem_type field
        pt = str(source.get("problem_type", "")).lower()
        if "classif" in pt:
            return "classification"
        if "regress" in pt:
            return "regression"
        # Check algorithm name
        algo = str(source.get("algorithm", "")).lower()
        if any(kw in algo for kw in _CLASSIFICATION_KEYWORDS):
            return "classification"
        if any(kw in algo for kw in _REGRESSION_KEYWORDS):
            return "regression"
        # Check ml_task_type in dataset section (for lineage)
        dataset = source.get("dataset", {})
        mlt = str(dataset.get("ml_task_type", "")).lower()
        if "classif" in mlt:
            return "classification"
        if "regress" in mlt:
            return "regression"
    return "unknown"


def compute_prediction_distribution(records: List[dict]) -> dict:
    """Compute proportion of each predicted value from prediction_logger records."""
    if not records:
        return {}
    counts: dict = {}
    total = 0
    for r in records:
        val = r.get("prediction")
        if val is None:
            continue
        key = str(val)
        counts[key] = counts.get(key, 0) + 1
        total += 1
    if total == 0:
        return {}
    return {k: round(v / total, 6) for k, v in counts.items()}


def extract_feature_schema_from_lineage(lineage: dict) -> dict:
    """Extract feature schema from lineage.feature_set.
    Returns {feature_name: 'numeric'|'categorical'|'unknown'}.
    """
    feature_set = lineage.get("feature_set", {})
    feature_columns = feature_set.get("feature_columns", [])
    if not feature_columns:
        return {}

    numeric_count = feature_set.get("numeric_count", 0)
    categorical_count = feature_set.get("categorical_count", 0)
    total = numeric_count + categorical_count

    schema: dict = {}
    if total == 0 or (numeric_count == 0 and categorical_count == 0):
        # All unknown
        for col in feature_columns:
            schema[col] = "unknown"
        return schema

    # Heuristic: first numeric_count columns are numeric, rest are categorical
    # (lineage does not store per-column type, only aggregate counts)
    for i, col in enumerate(feature_columns):
        if i < numeric_count:
            schema[col] = "numeric"
        else:
            schema[col] = "categorical"
    return schema
