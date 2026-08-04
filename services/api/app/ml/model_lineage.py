"""Model Lineage Store — Version 5A.

Records the complete provenance of every trained model version: what data
it was trained on, which experiment produced it, what hyperparameters were
used, what metrics it achieved, and which features it consumed.

Purpose
-------
Lineage records are the canonical provenance artefacts for the ML platform.
They are keyed by ``model_id`` and stored independently of both the
``_JOBS_STORE`` (transient) and the model registry metadata (inference-focused).

Storage layout
--------------
    services/api/uploads/models/registry/lineage/
        <model_id>.json     — full lineage record for one model version

Lineage record schema
---------------------
::

    {
      "model_id":          "<model_id>",
      "model_name":        "<algorithm>",
      "semantic_version":  "vMAJOR.MINOR.PATCH",
      "model_family":      "<family_key from ModelVersionManager>",
      "created_at":        "<ISO-8601 UTC>",
      "created_by":        "system" | "<user_id>",
      "training_job_id":   "<job_id>",
      "experiment_id":     "<experiment_id>",
      "training_timestamp": "<ISO-8601 UTC>",
      "algorithm":         "<algorithm name>",
      "problem_type":      "<classification|regression|...>",

      "dataset": {
        "dataset_id":       "<dataset UUID>",
        "dataset_version":  "<dv-xxxxxxxxxx>",
        "validation_score": <float | null>,
        "ml_task_type":     "<classification|...| null>",
        "validation_context_summary": {
          "row_count":       <int>,
          "column_count":    <int>,
          "encoding":        "<utf-8>",
          "delimiter":       ",",
          "schema_version":  "v1",
          "validation_passed": <bool>
        } | null
      },

      "hyperparameters": { <best_params> },

      "feature_set": {
        "feature_columns":  ["col1", "col2", ...],
        "target_column":    "<target>",
        "feature_count":    <int>,
        "numeric_count":    <int>,
        "categorical_count": <int>
      },

      "metrics": { <scalar metrics dict> },

      "cv_summary": {
        "mean_score": <float | null>,
        "std_score":  <float | null>,
        "n_splits":   <int | null>
      } | null,

      "pipeline_hash": "<12-char hex>",
      "random_seed":   <int>
    }

Public API
----------
``record_lineage(lineage_dict) -> None``
    Persist a lineage record for a model_id.

``get_lineage(model_id) -> dict | None``
    Retrieve the lineage record for a model_id.

``list_lineage(dataset_id, algorithm, limit) -> list[dict]``
    List lineage records with optional filters.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger("apex_ml.lineage")

# ---------------------------------------------------------------------------
# Storage layout
# ---------------------------------------------------------------------------

_LINEAGE_ROOT = os.path.abspath(
    os.path.join(
        os.path.dirname(__file__),
        "..", "..", "uploads", "models", "registry", "lineage"
    )
)


def _ensure_dirs() -> None:
    os.makedirs(_LINEAGE_ROOT, exist_ok=True)


def _lineage_path(model_id: str) -> str:
    return os.path.join(_LINEAGE_ROOT, f"{model_id}.json")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def record_lineage(lineage: Dict[str, Any]) -> None:
    """Persist a lineage record keyed by ``lineage["model_id"]``.

    The record is written atomically (tmp → rename). Any prior lineage
    for the same ``model_id`` is overwritten (latest training wins).

    Args:
        lineage: Fully-populated lineage dict as described in this module's
                 docstring.  Must contain ``"model_id"``.

    Raises:
        ValueError: If ``"model_id"`` is absent.
        IOError:    If the filesystem write fails.
    """
    model_id: str = lineage.get("model_id", "")
    if not model_id:
        raise ValueError("lineage dict must contain a non-empty 'model_id'.")

    _ensure_dirs()

    # Stamp write time
    lineage = {**lineage, "lineage_recorded_at": datetime.now(timezone.utc).isoformat()}

    path = _lineage_path(model_id)
    tmp = path + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(lineage, fh, indent=2, default=str)
        os.replace(tmp, path)
        logger.info(
            "Lineage recorded — model_id=%s version=%s dataset=%s experiment=%s",
            model_id,
            lineage.get("semantic_version", "?"),
            lineage.get("dataset", {}).get("dataset_id", "?"),
            lineage.get("experiment_id", "?"),
        )
    except Exception as exc:
        logger.error("Failed to write lineage for %s: %s", model_id, exc)
        raise


def get_lineage(model_id: str) -> Optional[Dict[str, Any]]:
    """Return the full lineage record for a ``model_id``, or ``None``.

    Args:
        model_id: Model identifier.

    Returns:
        Full lineage dict, or ``None`` if not found.
    """
    path = _lineage_path(model_id)
    if not os.path.exists(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except Exception as exc:
        logger.error("Failed to read lineage for %s: %s", model_id, exc)
        return None


def list_lineage(
    dataset_id: Optional[str] = None,
    algorithm: Optional[str] = None,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    """Return lineage records with optional filters, newest first.

    Reads all ``*.json`` files in the lineage directory.  This is an
    in-memory scan — suitable for the current filesystem-only backend.

    Args:
        dataset_id: Filter to lineage records for a specific dataset.
        algorithm:  Case-insensitive algorithm filter.
        limit:      Maximum number of results.

    Returns:
        List of lineage dicts, sorted by ``created_at`` descending.
    """
    _ensure_dirs()
    records: List[Dict[str, Any]] = []

    try:
        for fname in os.listdir(_LINEAGE_ROOT):
            if not fname.endswith(".json"):
                continue
            path = os.path.join(_LINEAGE_ROOT, fname)
            try:
                with open(path, "r", encoding="utf-8") as fh:
                    rec = json.load(fh)
                records.append(rec)
            except Exception:
                continue
    except Exception as exc:
        logger.error("Failed to list lineage directory: %s", exc)
        return []

    # Apply filters
    if dataset_id:
        records = [
            r for r in records
            if r.get("dataset", {}).get("dataset_id") == dataset_id
        ]
    if algorithm:
        al = algorithm.strip().lower()
        records = [
            r for r in records
            if r.get("algorithm", "").lower() == al
        ]

    records = sorted(records, key=lambda r: r.get("created_at", ""), reverse=True)
    return records[:limit]


# ---------------------------------------------------------------------------
# Builder helper — constructs the lineage dict from engine-level inputs
# ---------------------------------------------------------------------------

def build_lineage(
    *,
    model_id: str,
    job_id: str,
    experiment_id: str,
    algorithm: str,
    dataset_id: str,
    dataset_version: str,
    problem_type: str,
    semantic_version: str,
    model_family: str,
    training_timestamp: str,
    hyperparameters: Dict[str, Any],
    metrics: Dict[str, Any],
    feature_columns: List[str],
    target_column: str,
    numeric_columns: Optional[List[str]] = None,
    categorical_columns: Optional[List[str]] = None,
    cv_results: Optional[Dict[str, Any]] = None,
    pipeline_hash: str = "",
    random_seed: int = 42,
    created_by: str = "system",
    # V4 DatasetValidationContext summary (optional — advisory)
    validation_score: Optional[float] = None,
    ml_task_type: Optional[str] = None,
    validation_context_summary: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Build a complete lineage dict ready to pass to ``record_lineage()``.

    This is a pure-function builder — it does NOT write to disk.

    Args:
        model_id:          Model identifier (matches registry).
        job_id:            Training job UUID.
        experiment_id:     Experiment UUID.
        algorithm:         Algorithm name.
        dataset_id:        Dataset UUID.
        dataset_version:   Dataset file-hash version string.
        problem_type:      ML problem type string.
        semantic_version:  Semantic version from ``ModelVersionManager``.
        model_family:      Family key from ``ModelVersionManager``.
        training_timestamp: ISO-8601 UTC timestamp from training report.
        hyperparameters:   Best hyperparameter dict from tuning.
        metrics:           Hold-out evaluation metrics dict.
        feature_columns:   List of feature column names.
        target_column:     Target column name.
        numeric_columns:   Optional list of numeric feature names.
        categorical_columns: Optional list of categorical feature names.
        cv_results:        Cross-validation results dict or None.
        pipeline_hash:     SHA-256 pipeline hash (12-char hex).
        random_seed:       Training random seed for reproducibility.
        created_by:        Creator identifier (default ``"system"``).
        validation_score:  V4 dataset quality score (0–100), advisory.
        ml_task_type:      V4 detected ML task type, advisory.
        validation_context_summary: Summary fields from DatasetValidationContext.

    Returns:
        Fully-populated lineage dict.
    """
    now = datetime.now(timezone.utc).isoformat()

    # CV summary — extract scalars only
    cv_summary: Optional[Dict[str, Any]] = None
    if cv_results and not cv_results.get("skipped"):
        cv_summary = {
            "mean_score": cv_results.get("mean_score"),
            "std_score":  cv_results.get("std_score"),
            "n_splits":   cv_results.get("n_splits"),
        }

    return {
        # ── Identity ───────────────────────────────────────────────────────
        "model_id":         model_id,
        "model_name":       algorithm,
        "semantic_version": semantic_version,
        "model_family":     model_family,
        "created_at":       now,
        "created_by":       created_by,

        # ── Training Job & Experiment ───────────────────────────────────────
        "training_job_id":    job_id,
        "experiment_id":      experiment_id,
        "training_timestamp": training_timestamp,
        "algorithm":          algorithm,
        "problem_type":       problem_type,

        # ── Dataset Provenance ──────────────────────────────────────────────
        "dataset": {
            "dataset_id":      dataset_id,
            "dataset_version": dataset_version,
            # V4 advisory fields — None if V4 validation context is unavailable
            "validation_score": validation_score,
            "ml_task_type":     ml_task_type,
            "validation_context_summary": validation_context_summary,
        },

        # ── Hyperparameters ─────────────────────────────────────────────────
        "hyperparameters": hyperparameters or {},

        # ── Feature Set ─────────────────────────────────────────────────────
        "feature_set": {
            "feature_columns":    feature_columns,
            "target_column":      target_column,
            "feature_count":      len(feature_columns),
            "numeric_count":      len(numeric_columns or []),
            "categorical_count":  len(categorical_columns or []),
        },

        # ── Metrics ─────────────────────────────────────────────────────────
        "metrics": metrics or {},

        # ── Cross-Validation Summary ────────────────────────────────────────
        "cv_summary": cv_summary,

        # ── Reproducibility ─────────────────────────────────────────────────
        "pipeline_hash": pipeline_hash,
        "random_seed":   random_seed,
    }
