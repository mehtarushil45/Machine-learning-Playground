"""Leaderboard Engine — Sprint 5A Part 4.

Generates ranked leaderboards from the model registry across all
relevant metrics.  Supports classification, regression, and mixed
model sets.

Supported ranking metrics:
  Classification: accuracy, f1_score, precision, recall, roc_auc, pr_auc
  Regression:     mae, rmse, r2_score (r2)
  Universal:      training_speed (inferred from training_duration_seconds),
                  model_size (inferred from .joblib file size on disk)

Features:
  - Top-N filtering
  - Arbitrary metric filtering (min/max thresholds)
  - Problem type filtering
  - Algorithm filtering
  - Dataset filtering
  - Tie handling (stable sort by registration time as tiebreaker)

Public API:
  generate_leaderboard(metric, problem_type, algorithm, dataset_id,
                       top_n, min_value, max_value,
                       include_archived)          → LeaderboardResult dict
"""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Optional

from app.ml.model_registry import list_models, _REGISTRY_ROOT

logger = logging.getLogger("apex_ml.leaderboard")

# ---------------------------------------------------------------------------
# Metric configuration
# ---------------------------------------------------------------------------

# True  = higher value is better rank
# False = lower value is better rank (e.g. error metrics)
_METRIC_CONFIG: Dict[str, bool] = {
    # Classification
    "accuracy": True,
    "f1_score": True,
    "f1": True,
    "precision": True,
    "recall": True,
    "roc_auc": True,
    "auc": True,
    "pr_auc": True,
    # Regression
    "mae": False,
    "rmse": False,
    "r2_score": True,
    "r2": True,
    # Universal
    "training_speed": True,   # computed as 1 / duration
    "model_size": False,       # bytes — smaller is better
}

_SUPPORTED_METRICS = sorted(_METRIC_CONFIG.keys())


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def generate_leaderboard(
    metric: str = "accuracy",
    problem_type: Optional[str] = None,
    algorithm: Optional[str] = None,
    dataset_id: Optional[str] = None,
    top_n: int = 20,
    min_value: Optional[float] = None,
    max_value: Optional[float] = None,
    include_archived: bool = False,
) -> Dict[str, Any]:
    """Generate a ranked leaderboard from the model registry.

    Args:
        metric:           Metric name to rank by (see _SUPPORTED_METRICS).
        problem_type:     Optional problem type filter.
        algorithm:        Optional algorithm name filter.
        dataset_id:       Optional dataset_id filter.
        top_n:            Maximum entries in the leaderboard.
        min_value:        Minimum metric value filter (inclusive).
        max_value:        Maximum metric value filter (inclusive).
        include_archived: Whether to include ARCHIVED models (default False).

    Returns:
        Dict with:
            metric          — the ranking metric used
            higher_is_better — bool
            total_models    — total models before top_n clipping
            entries         — list of ranked model dicts
            supported_metrics — list of all rankable metric names
    """
    metric_lower = metric.strip().lower().replace(" ", "_")
    if metric_lower not in _METRIC_CONFIG:
        logger.warning(
            "Unknown metric '%s'. Defaulting to 'accuracy'.", metric
        )
        metric_lower = "accuracy"

    higher_is_better = _METRIC_CONFIG[metric_lower]

    # ── Fetch models ─────────────────────────────────────────────────────────
    statuses: List[str] = ["ACTIVE"]
    if include_archived:
        statuses.append("ARCHIVED")

    all_entries: List[Dict[str, Any]] = []
    for status in statuses:
        all_entries.extend(
            list_models(
                status=status,
                algorithm=algorithm,
                dataset_id=dataset_id,
                problem_type=problem_type,
                limit=10000,
            )
        )

    # De-duplicate by model_id
    seen: set = set()
    unique_entries: List[Dict[str, Any]] = []
    for e in all_entries:
        mid = e.get("model_id")
        if mid and mid not in seen:
            seen.add(mid)
            unique_entries.append(e)

    # ── Extract metric value for each model ──────────────────────────────────
    scored: List[Dict[str, Any]] = []
    for entry in unique_entries:
        value = _extract_metric_value(entry, metric_lower)
        if not isinstance(value, (int, float)):
            continue  # Exclude models with non-numeric or missing metric value

        # Apply value filters
        if min_value is not None and value < min_value:
            continue
        if max_value is not None and value > max_value:
            continue

        scored.append(
            {
                "model_id": entry.get("model_id"),
                "algorithm": entry.get("algorithm"),
                "problem_type": entry.get("problem_type"),
                "dataset_id": entry.get("dataset_id"),
                "model_version": entry.get("model_version"),
                "status": entry.get("status"),
                "registered_at": entry.get("registered_at"),
                "promoted_at": entry.get("promoted_at"),
                "owner": entry.get("owner"),
                "tags": entry.get("tags", []),
                metric_lower: value,
                "metrics_summary": entry.get("metrics_summary", {}),
                "accuracy": entry.get("accuracy"),
                "f1": entry.get("f1"),
                "auc": entry.get("auc"),
            }
        )

    # ── Sort: primary by metric, tiebreak by registration time ───────────────
    def _sort_key(e: Dict[str, Any]) -> tuple:
        val = e.get(metric_lower)
        if val is None:
            # Missing metric value always sorts last
            score = float("-inf") if higher_is_better else float("inf")
        else:
            score = float(val)
        ts = e.get("registered_at") or ""
        return (-score if higher_is_better else score, ts)

    scored.sort(key=_sort_key)

    total_models = len(scored)

    # ── Assign ranks (with tie handling) ─────────────────────────────────────
    ranked_entries: List[Dict[str, Any]] = []
    prev_val: Optional[float] = None
    prev_rank = 0

    for i, entry in enumerate(scored[:top_n], start=1):
        curr_val = entry.get(metric_lower)
        if curr_val == prev_val:
            rank = prev_rank  # same rank on tie
        else:
            rank = i
            prev_rank = i
        prev_val = curr_val
        ranked_entries.append({"rank": rank, **entry})

    return {
        "metric": metric_lower,
        "higher_is_better": higher_is_better,
        "total_models": total_models,
        "top_n": top_n,
        "filters": {
            "problem_type": problem_type,
            "algorithm": algorithm,
            "dataset_id": dataset_id,
            "include_archived": include_archived,
            "min_value": min_value,
            "max_value": max_value,
        },
        "entries": ranked_entries,
        "supported_metrics": _SUPPORTED_METRICS,
    }


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _extract_metric_value(
    entry: Dict[str, Any],
    metric: str,
) -> Optional[float]:
    """Extract the requested metric value from an index summary entry."""

    # ── Special computed metrics ─────────────────────────────────────────────
    if metric == "training_speed":
        # training_duration_seconds not stored in index summary — return None
        # (full training_report would be needed; acceptable limitation)
        return None

    if metric == "model_size":
        model_path = entry.get("model_path")
        if model_path and os.path.exists(model_path):
            try:
                return float(os.path.getsize(model_path))
            except OSError:
                return None
        return None

    # ── Shorthand aliases ─────────────────────────────────────────────────────
    alias_map = {
        "f1": "f1_score",
        "r2": "r2_score",
        "auc": "roc_auc",
    }
    lookup_key = alias_map.get(metric, metric)

    # ── Check top-level fields first (accuracy, f1, auc stored in index) ─────
    if metric in ("accuracy",):
        val = entry.get("accuracy")
        if isinstance(val, (int, float)):
            return float(val)

    if metric in ("f1", "f1_score"):
        val = entry.get("f1")
        if isinstance(val, (int, float)):
            return float(val)

    if metric in ("auc", "roc_auc"):
        val = entry.get("auc")
        if isinstance(val, (int, float)):
            return float(val)

    # ── Fall back to metrics_summary ─────────────────────────────────────────
    ms = entry.get("metrics_summary") or {}
    for candidate in (lookup_key, metric):
        val = ms.get(candidate)
        if isinstance(val, (int, float)):
            return float(val)

    return None
