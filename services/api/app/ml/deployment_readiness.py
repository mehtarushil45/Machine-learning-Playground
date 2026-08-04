"""Deployment Readiness Report Generator — Version 5B.

Pure-function generator. Accepts model metadata and lineage dicts.
Never reads from disk (except for model file size check).
Never blocks model registration.

Report schema::

    {
      "model_id":      "<model_id>",
      "generated_at":  "<ISO-8601>",
      "checks": {
        "validation_score":    {"value": 88.5, "status": "PASS", "weight": 25, "earned": 22.1},
        "dataset_quality":     {"value": "PASS","status": "PASS", "weight": 15, "earned": 15.0},
        "cv_performance":      {"value": 0.91, "status": "PASS", "weight": 25, "earned": 22.8},
        "model_performance":   {"value": {...}, "status": "PASS", "weight": 25, "earned": 23.0},
        "feature_completeness":{"value": 3,    "status": "PASS", "weight":  5, "earned":  5.0},
        "model_size":          {"value": 48200,"status": "PASS", "weight":  5, "earned":  5.0}
      },
      "readiness_score": 93.0,
      "risk_level":     "LOW",
      "recommendation": "DEPLOY",
      "decision_summary": {
        "deployment_decision": "APPROVED",
        "readiness_score":     93.0,
        "risk_level":          "LOW",
        "recommendation":      "DEPLOY",
        "reasons":  ["Good dataset validation score: 88.5/100.", "..."],
        "warnings": []
      }
    }

Risk thresholds
---------------
  score ≥ 80  → LOW    / DEPLOY        / APPROVED
  score 60–79 → MEDIUM / REVIEW        / CONDITIONAL
  score < 60  → HIGH   / DO NOT DEPLOY / REJECTED

Public API
----------
``generate_readiness_report(model_metadata, lineage) -> dict``
    Pure function (except optional filesystem stat for model size).
    Returns the fully populated readiness report dict including
    the V5B Decision Summary.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger("apex_ml.readiness")

# ---------------------------------------------------------------------------
# Scoring thresholds
# ---------------------------------------------------------------------------

_VALIDATION_SCORE_PASS = 70.0    # dataset quality score (0–100) — PASS threshold
_VALIDATION_SCORE_WARN = 50.0    # below this → FAIL
_CV_SCORE_PASS = 0.75            # cross-validation mean score — PASS threshold
_CV_SCORE_WARN = 0.60            # below this → FAIL
_PERF_ACCURACY_PASS = 0.70       # hold-out accuracy / R² — PASS threshold
_PERF_ACCURACY_WARN = 0.55       # below this → FAIL
_MODEL_SIZE_WARN_MB = 500.0      # warn if model file exceeds this (MB)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def generate_readiness_report(
    model_metadata: Dict[str, Any],
    lineage: Dict[str, Any],
) -> Dict[str, Any]:
    """Generate a Deployment Readiness Report from model metadata and lineage.

    This is a pure function.  The only optional filesystem access is the
    model file size check (``os.path.getsize``), which is guarded with
    ``OSError`` handling so it never raises.

    Args:
        model_metadata: Full metadata dict from ``model_registry.get_model_by_id()``.
        lineage:        Full lineage dict from ``model_lineage.get_lineage()``.
                        May be an empty dict if lineage was not recorded.

    Returns:
        Fully populated readiness report dict including ``decision_summary``.
    """
    model_id: str = (
        model_metadata.get("model_id") or lineage.get("model_id", "unknown")
    )

    checks: Dict[str, Any] = {}
    reasons: List[str] = []
    warnings: List[str] = []

    dataset_info: Dict[str, Any] = lineage.get("dataset") or {}

    # ── Check 1: Dataset Validation Score (weight: 25) ────────────────────
    val_score: Optional[float] = dataset_info.get("validation_score")
    checks["validation_score"] = _check_validation_score(val_score, reasons, warnings)

    # ── Check 2: Dataset Quality — validation_passed (weight: 15) ─────────
    ctx_summary: Dict[str, Any] = dataset_info.get("validation_context_summary") or {}
    val_passed: Optional[bool] = ctx_summary.get("validation_passed")
    checks["dataset_quality"] = _check_dataset_quality(val_passed, reasons, warnings)

    # ── Check 3: Cross-Validation Performance (weight: 25) ────────────────
    cv_summary: Dict[str, Any] = lineage.get("cv_summary") or {}
    cv_mean: Optional[float] = cv_summary.get("mean_score") if cv_summary else None
    checks["cv_performance"] = _check_cv_performance(cv_mean, reasons, warnings)

    # ── Check 4: Model Performance / Hold-out Metrics (weight: 25) ────────
    metrics: Dict[str, Any] = (
        lineage.get("metrics") or model_metadata.get("metrics") or {}
    )
    checks["model_performance"] = _check_model_performance(metrics, reasons, warnings)

    # ── Check 5: Feature Completeness (weight: 5) ─────────────────────────
    feature_set: Dict[str, Any] = lineage.get("feature_set") or {}
    feature_count: int = int(feature_set.get("feature_count", 0))
    feature_cols: List[str] = feature_set.get("feature_columns") or []
    checks["feature_completeness"] = _check_feature_completeness(
        feature_count, feature_cols, reasons, warnings
    )

    # ── Check 6: Model File Size (weight: 5) ──────────────────────────────
    model_path: str = model_metadata.get("model_path", "")
    checks["model_size"] = _check_model_size(model_path, reasons, warnings)

    # ── Overall readiness score ────────────────────────────────────────────
    total_weight: float = sum(c["weight"] for c in checks.values())
    earned: float = sum(c["earned"] for c in checks.values())
    readiness_score: float = (
        round((earned / total_weight) * 100.0, 1) if total_weight > 0 else 0.0
    )

    # ── Risk level + recommendation ────────────────────────────────────────
    risk_level, recommendation = _compute_risk(readiness_score)

    # ── Decision Summary (V5B improvement) ────────────────────────────────
    decision_summary: Dict[str, Any] = _build_decision_summary(
        readiness_score=readiness_score,
        risk_level=risk_level,
        recommendation=recommendation,
        reasons=reasons,
        warnings=warnings,
    )

    return {
        "model_id":        model_id,
        "generated_at":    datetime.now(timezone.utc).isoformat(),
        "checks":          checks,
        "readiness_score": readiness_score,
        "risk_level":      risk_level,
        "recommendation":  recommendation,
        "decision_summary": decision_summary,
    }


# ---------------------------------------------------------------------------
# Individual check functions
# ---------------------------------------------------------------------------

def _check_validation_score(
    val_score: Optional[float],
    reasons: List[str],
    warnings: List[str],
) -> Dict[str, Any]:
    weight = 25
    if val_score is None:
        warnings.append(
            "Dataset validation score not available "
            "(V4 validation was not run on this dataset)."
        )
        return {"value": None, "status": "SKIP", "weight": weight, "earned": weight * 0.5}

    val = round(float(val_score), 1)
    earned = round(weight * (val / 100.0), 2)
    if val >= _VALIDATION_SCORE_PASS:
        reasons.append(f"Good dataset validation score: {val}/100.")
        return {"value": val, "status": "PASS", "weight": weight, "earned": earned}
    elif val >= _VALIDATION_SCORE_WARN:
        warnings.append(f"Moderate dataset validation score: {val}/100.")
        return {"value": val, "status": "WARN", "weight": weight, "earned": earned}
    else:
        warnings.append(
            f"Low dataset validation score: {val}/100. Review dataset quality."
        )
        return {"value": val, "status": "FAIL", "weight": weight, "earned": earned}


def _check_dataset_quality(
    val_passed: Optional[bool],
    reasons: List[str],
    warnings: List[str],
) -> Dict[str, Any]:
    weight = 15
    if val_passed is None:
        warnings.append(
            "Dataset quality validation result not available "
            "(V4 validation context missing)."
        )
        return {"value": None, "status": "SKIP", "weight": weight, "earned": weight * 0.5}
    if val_passed:
        reasons.append("Dataset passed all schema and quality validations.")
        return {"value": "PASS", "status": "PASS", "weight": weight, "earned": float(weight)}
    warnings.append(
        "Dataset did not pass all quality validations. "
        "Review schema and data quality issues before deployment."
    )
    return {"value": "FAIL", "status": "FAIL", "weight": weight, "earned": 0.0}


def _check_cv_performance(
    cv_mean: Optional[float],
    reasons: List[str],
    warnings: List[str],
) -> Dict[str, Any]:
    weight = 25
    if cv_mean is None:
        warnings.append(
            "No cross-validation results available. "
            "Enable CV (enable_cv=True) for a more reliable deployment signal."
        )
        return {"value": None, "status": "SKIP", "weight": weight, "earned": weight * 0.5}
    val = round(float(cv_mean), 4)
    earned = round(weight * min(val, 1.0), 2)
    if val >= _CV_SCORE_PASS:
        reasons.append(f"Strong cross-validation mean score: {val}.")
        return {"value": val, "status": "PASS", "weight": weight, "earned": earned}
    elif val >= _CV_SCORE_WARN:
        warnings.append(
            f"Moderate cross-validation mean score: {val}. "
            "Consider more training data or a different algorithm."
        )
        return {"value": val, "status": "WARN", "weight": weight, "earned": earned}
    warnings.append(
        f"Low cross-validation mean score: {val}. "
        "Model may not generalise well. Investigate before deployment."
    )
    return {"value": val, "status": "FAIL", "weight": weight, "earned": earned}


def _check_model_performance(
    metrics: Dict[str, Any],
    reasons: List[str],
    warnings: List[str],
) -> Dict[str, Any]:
    weight = 25
    if not metrics:
        warnings.append("No performance metrics available.")
        return {"value": None, "status": "SKIP", "weight": weight, "earned": weight * 0.5}

    # Primary metric: prefer accuracy, r2, roc_auc, f1_score in order
    primary_val: Optional[float] = None
    primary_name: Optional[str] = None
    for key in ("accuracy", "r2", "roc_auc", "f1_score", "f1"):
        raw = metrics.get(key)
        if raw is not None:
            try:
                primary_val = round(float(raw), 4)
                primary_name = key
                break
            except (TypeError, ValueError):
                continue

    # Serialisable secondary metrics
    secondary: Dict[str, float] = {
        k: round(float(v), 4)
        for k, v in metrics.items()
        if k != primary_name and isinstance(v, (int, float))
    }

    if primary_val is None:
        warnings.append(
            "No primary metric (accuracy/r2/roc_auc/f1_score) found in metrics dict."
        )
        return {
            "value": secondary or None,
            "status": "SKIP",
            "weight": weight,
            "earned": weight * 0.5,
        }

    earned = round(weight * min(primary_val, 1.0), 2)
    metric_display = {primary_name: primary_val, **secondary}

    if primary_val >= _PERF_ACCURACY_PASS:
        reasons.append(f"Good {primary_name}: {primary_val}.")
        return {
            "value": metric_display,
            "status": "PASS",
            "weight": weight,
            "earned": earned,
        }
    elif primary_val >= _PERF_ACCURACY_WARN:
        warnings.append(
            f"Moderate {primary_name}: {primary_val}. "
            "Performance may not meet production SLAs."
        )
        return {
            "value": metric_display,
            "status": "WARN",
            "weight": weight,
            "earned": earned,
        }
    warnings.append(
        f"Low {primary_name}: {primary_val}. "
        "Model performance is likely insufficient for production."
    )
    return {
        "value": metric_display,
        "status": "FAIL",
        "weight": weight,
        "earned": earned,
    }


def _check_feature_completeness(
    feature_count: int,
    feature_columns: List[str],
    reasons: List[str],
    warnings: List[str],
) -> Dict[str, Any]:
    weight = 5
    if feature_count == 0 or not feature_columns:
        warnings.append(
            "No feature columns recorded in lineage. "
            "Feature completeness cannot be verified."
        )
        return {"value": 0, "status": "FAIL", "weight": weight, "earned": 0.0}
    reasons.append(
        f"Feature set is fully defined: {feature_count} feature(s)."
    )
    return {
        "value": feature_count,
        "status": "PASS",
        "weight": weight,
        "earned": float(weight),
    }


def _check_model_size(
    model_path: str,
    reasons: List[str],
    warnings: List[str],
) -> Dict[str, Any]:
    weight = 5
    if not model_path:
        warnings.append("Model path not recorded in registry; size check skipped.")
        return {"value": None, "status": "SKIP", "weight": weight, "earned": weight * 0.5}
    try:
        size_bytes: int = os.path.getsize(model_path)
        size_mb: float = round(size_bytes / (1024 * 1024), 2)
        if size_mb > _MODEL_SIZE_WARN_MB:
            warnings.append(
                f"Model file is large ({size_mb} MB). "
                "Consider model compression or quantisation before deployment."
            )
            return {
                "value": size_bytes,
                "status": "WARN",
                "weight": weight,
                "earned": round(weight * 0.7, 2),
            }
        reasons.append(f"Model file size is acceptable: {size_mb} MB.")
        return {
            "value": size_bytes,
            "status": "PASS",
            "weight": weight,
            "earned": float(weight),
        }
    except OSError:
        warnings.append(
            f"Model file not found on disk at '{model_path}'; size check skipped."
        )
        return {"value": None, "status": "SKIP", "weight": weight, "earned": weight * 0.5}


# ---------------------------------------------------------------------------
# Risk + Recommendation
# ---------------------------------------------------------------------------

def _compute_risk(score: float) -> tuple:
    """Map readiness score to (risk_level, recommendation)."""
    if score >= 80.0:
        return "LOW", "DEPLOY"
    elif score >= 60.0:
        return "MEDIUM", "REVIEW"
    return "HIGH", "DO NOT DEPLOY"


# ---------------------------------------------------------------------------
# Decision Summary (V5B improvement)
# ---------------------------------------------------------------------------

def _build_decision_summary(
    readiness_score: float,
    risk_level: str,
    recommendation: str,
    reasons: List[str],
    warnings: List[str],
) -> Dict[str, Any]:
    """Build the structured Deployment Decision Summary.

    Clearly explains why the model is or is not recommended for deployment,
    with explicit reasons (passing checks) and warnings (failing/skipping checks).

    Args:
        readiness_score: 0–100 overall score.
        risk_level:      "LOW" | "MEDIUM" | "HIGH"
        recommendation:  "DEPLOY" | "REVIEW" | "DO NOT DEPLOY"
        reasons:         Human-readable explanations of passing checks.
        warnings:        Human-readable explanations of failing/skipped checks.

    Returns:
        Decision summary dict (advisory only — never blocks registration).
    """
    if risk_level == "LOW":
        decision = "APPROVED"
    elif risk_level == "MEDIUM":
        decision = "CONDITIONAL"
    else:
        decision = "REJECTED"

    return {
        "deployment_decision": decision,
        "readiness_score":     readiness_score,
        "risk_level":          risk_level,
        "recommendation":      recommendation,
        "reasons":             reasons,
        "warnings":            warnings,
    }
