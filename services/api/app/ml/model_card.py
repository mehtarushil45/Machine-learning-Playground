"""Model Card Generator — Version 5B.

Pure-function generator. Accepts model metadata, lineage, governance state,
champion/challenger status, and deployment readiness report. Returns a
fully JSON-serialisable Model Card dict.

Model Card schema::

    {
      "card_version":    "v1",
      "generated_at":   "<ISO-8601>",

      // Identity
      "model_id":           "<model_id>",
      "model_name":         "<algorithm>",
      "version":            "<model_version>",
      "semantic_version":   "vMAJOR.MINOR.PATCH",
      "algorithm":          "<algorithm>",
      "problem_type":       "<problem_type>",

      // Governance
      "lifecycle_state":    "<REGISTERED|VALIDATED|CANDIDATE|STAGING|PRODUCTION|...>",
      "champion_status":    "CHAMPION" | "CHALLENGER",

      // Provenance
      "created_by":         "system",
      "training_timestamp": "<ISO>",

      // Dataset
      "dataset": {
        "dataset_id":      "<id>",
        "dataset_version": "<dv-xxx>",
        "validation_score": <float | null>,
        "ml_task_type":    "<classification|...>"
      },

      // Performance
      "metrics":         { ... },
      "hyperparameters": { ... },
      "feature_set": {
        "feature_columns":   ["col1", ...],
        "target_column":     "<target>",
        "feature_count":     <int>,
        "numeric_count":     <int>,
        "categorical_count": <int>
      },

      // Lineage references (no full dump — IDs only)
      "lineage_summary": {
        "model_id":      "...",
        "experiment_id": "...",
        "job_id":        "...",
        "dataset_id":    "...",
        "model_family":  "..."
      },

      // Deployment readiness summary (from readiness report)
      "deployment_readiness": {
        "readiness_score": 82.5,
        "risk_level":      "LOW",
        "recommendation":  "DEPLOY",
        "decision":        "APPROVED"
      }
    }

Public API
----------
``generate_model_card(model_metadata, lineage, governance_state,
                      champion_status, readiness_report) -> dict``
    Pure function — does NOT read from or write to disk.
    JSON-serialisable output only.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

logger = logging.getLogger("apex_ml.model_card")

_CARD_VERSION = "v1"


def generate_model_card(
    model_metadata: Dict[str, Any],
    lineage: Dict[str, Any],
    governance_state: str = "REGISTERED",
    champion_status: str = "CHALLENGER",
    readiness_report: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Generate a Model Card from model metadata, lineage, and governance context.

    This is a pure function — it does NOT read from or write to disk.
    All output values are JSON-serialisable.

    Args:
        model_metadata:   Full metadata dict from ``model_registry.get_model_by_id()``.
                          May be empty dict if called before registration completes.
        lineage:          Full lineage dict from ``model_lineage.get_lineage()``.
                          May be empty dict if lineage was not recorded.
        governance_state: Current governance lifecycle state string.
        champion_status:  ``"CHAMPION"`` or ``"CHALLENGER"``.
        readiness_report: Optional deployment readiness report dict.
                          If None, the card will have an empty readiness section.

    Returns:
        Fully populated, JSON-serialisable Model Card dict.
    """
    readiness_report = readiness_report or {}
    dataset_info: Dict[str, Any] = lineage.get("dataset") or {}
    feature_set: Dict[str, Any] = lineage.get("feature_set") or {}
    metrics: Dict[str, Any] = (
        lineage.get("metrics") or model_metadata.get("metrics") or {}
    )
    hyperparameters: Dict[str, Any] = (
        lineage.get("hyperparameters")
        or model_metadata.get("best_params")
        or {}
    )

    # ── Lineage summary (IDs only — no full dump) ─────────────────────────
    lineage_summary: Dict[str, Any] = {
        "model_id":      lineage.get("model_id") or model_metadata.get("model_id"),
        "experiment_id": lineage.get("experiment_id") or model_metadata.get("experiment_id"),
        "job_id":        lineage.get("training_job_id") or model_metadata.get("job_id"),
        "dataset_id":    dataset_info.get("dataset_id") or model_metadata.get("dataset_id"),
        "model_family":  lineage.get("model_family") or model_metadata.get("model_family", ""),
    }

    # ── Deployment readiness summary ──────────────────────────────────────
    readiness_summary: Dict[str, Any] = {}
    if readiness_report:
        ds = readiness_report.get("decision_summary") or {}
        readiness_summary = {
            "readiness_score": readiness_report.get("readiness_score"),
            "risk_level":      readiness_report.get("risk_level"),
            "recommendation":  readiness_report.get("recommendation"),
            "decision":        ds.get("deployment_decision"),
        }

    card: Dict[str, Any] = {
        # Card metadata
        "card_version": _CARD_VERSION,
        "generated_at": datetime.now(timezone.utc).isoformat(),

        # Model identity
        "model_id":         model_metadata.get("model_id") or lineage.get("model_id"),
        "model_name":       model_metadata.get("algorithm") or lineage.get("algorithm"),
        "version":          (
            model_metadata.get("version")
            or model_metadata.get("model_version")
            or lineage.get("semantic_version")
        ),
        "semantic_version": (
            model_metadata.get("semantic_version")
            or lineage.get("semantic_version")
        ),
        "algorithm":        model_metadata.get("algorithm") or lineage.get("algorithm"),
        "problem_type":     (
            model_metadata.get("problem_type")
            or lineage.get("problem_type")
        ),

        # Governance
        "lifecycle_state": governance_state,
        "champion_status": champion_status,

        # Provenance
        "created_by":         (
            lineage.get("created_by")
            or model_metadata.get("owner", "system")
        ),
        "training_timestamp": (
            lineage.get("training_timestamp")
            or model_metadata.get("training_timestamp")
        ),

        # Dataset
        "dataset": {
            "dataset_id":      (
                dataset_info.get("dataset_id")
                or model_metadata.get("dataset_id")
            ),
            "dataset_version": (
                dataset_info.get("dataset_version")
                or model_metadata.get("dataset_version")
            ),
            "validation_score": dataset_info.get("validation_score"),
            "ml_task_type":    dataset_info.get("ml_task_type"),
        },

        # Performance
        "metrics":         _serialise_metrics(metrics),
        "hyperparameters": _serialise_metrics(hyperparameters),
        "feature_set":     feature_set,

        # Traceability
        "lineage_summary": lineage_summary,

        # Deployment readiness
        "deployment_readiness": readiness_summary,
    }

    return card


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _serialise_metrics(data: Dict[str, Any]) -> Dict[str, Any]:
    """Return a copy of *data* containing only JSON-serialisable scalar values.

    Lists, nested dicts, and non-numeric values are dropped to keep the
    Model Card clean and portable.
    """
    result: Dict[str, Any] = {}
    for k, v in data.items():
        if isinstance(v, bool):
            result[k] = v
        elif isinstance(v, (int, float)) and v is not None:
            result[k] = round(float(v), 6)
        elif isinstance(v, str):
            result[k] = v
        elif v is None:
            result[k] = v
        # Drop lists/dicts — not suitable for a flat card
    return result
