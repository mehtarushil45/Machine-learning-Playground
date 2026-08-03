"""DatasetValidationContext — canonical validation record keyed by dataset_id.

Version 4 ingestion pipeline.

Purpose
-------
``DatasetValidationContext`` is the **canonical validation object** for the
entire ingestion pipeline.  It is associated with the **Dataset** (keyed by
``dataset_id``), not with the ingestion job.

Motivation
----------
Storing validation results only in ``_JOBS_STORE`` makes them ephemeral: they
are tied to a single job lifecycle and inaccessible once the job is forgotten.
This module introduces a separate, dataset-keyed store that outlives any
individual job, preparing the architecture for:

    - Dataset Versioning       — track validation across schema versions
    - Dataset History          — full audit trail per dataset_id
    - Dataset Catalog          — searchable quality metadata across the org
    - Organization Workspaces  — scoped quality dashboards per team
    - Enterprise Governance    — compliance artefacts and trust scores

In-memory store
---------------
``_DATASET_VALIDATION_STORE`` is keyed by ``dataset_id``.  It is the V4
implementation.  Future versions will replace this dict with a persisted
``DatasetValidation`` PostgreSQL table (or equivalent), enabling cross-session
queries without changing any caller code.

Public API
----------
``store_validation_context(ctx)``   → None
``get_validation_context(id)``      → DatasetValidationContext | None
``list_validation_contexts()``      → list[DatasetValidationContext]
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime

from app.ingestion.data_quality_validator import ValidationReport

logger = logging.getLogger("apex_ingestion.context")


# ---------------------------------------------------------------------------
# Canonical value object
# ---------------------------------------------------------------------------


@dataclass
class DatasetValidationContext:
    """Canonical validation record for a dataset, keyed by ``dataset_id``.

    Encapsulates all artefacts produced during Stage 1.5 of the ingestion
    pipeline so that downstream systems (Dataset Catalog, Governance,
    Versioning) can query a dataset's quality history without re-running
    the pipeline.

    Attributes:
        dataset_id:       Primary key — UUID of the dataset.
        job_id:           UUID of the originating ingestion job.
        filename:         Sanitised original filename.
        validated_at:     UTC timestamp when Stage 1.5 completed.

        schema_version:   Schema algorithm version tag (e.g. ``"v1"``).
        column_names:     Column names in original CSV order.
        column_types:     ``{column_name: inferred_type}`` mapping.
        delimiter:        Detected field separator character.
        encoding:         Normalised encoding label (e.g. ``"utf-8"``).

        row_count:        Total rows in the dataset (Stage 1 output).
        column_count:     Total columns.
        size_bytes:       File size in bytes.

        ml_task_type:     Detected ML task: ``"classification"`` |
                          ``"regression"`` | ``"timeseries"`` |
                          ``"text"`` | ``"unsupported"``.
        ml_confidence:    Confidence of the ML task detection (0.0–1.0).
        ml_reasoning:     Human-readable explanation of the determination.

        validation_score: Informational quality score (0–100).
                          Foundation for: Dataset Trust Score, AutoML
                          readiness, Dataset Governance, enterprise
                          quality dashboards.  Never blocks ingestion.

        validation_report: Full ``ValidationReport`` from Stage 1.5,
                           including all issues, warnings, errors, and
                           per-column findings.
    """

    # ── Identity ──────────────────────────────────────────────────────────
    dataset_id: str
    job_id: str
    filename: str
    validated_at: datetime

    # ── Schema Information ────────────────────────────────────────────────
    schema_version: str
    column_names: tuple[str, ...]
    column_types: dict[str, str]
    delimiter: str
    encoding: str

    # ── Dataset Statistics ────────────────────────────────────────────────
    row_count: int
    column_count: int
    size_bytes: int

    # ── ML Compatibility ──────────────────────────────────────────────────
    ml_task_type: str
    ml_confidence: float
    ml_reasoning: str

    # ── Validation Score ──────────────────────────────────────────────────
    validation_score: float  # 0–100, informational only

    # ── Full Report ───────────────────────────────────────────────────────
    validation_report: ValidationReport


# ---------------------------------------------------------------------------
# In-memory store  (future: PostgreSQL DatasetValidation table)
# ---------------------------------------------------------------------------

_DATASET_VALIDATION_STORE: dict[str, DatasetValidationContext] = {}


def store_validation_context(ctx: DatasetValidationContext) -> None:
    """Persist a ``DatasetValidationContext`` keyed by ``dataset_id``.

    Overwrites any previous context for the same ``dataset_id`` (latest
    ingestion wins).  Future versions will upsert into a PostgreSQL table
    using the same interface.

    Args:
        ctx: The fully-populated ``DatasetValidationContext`` from Stage 1.5.
    """
    _DATASET_VALIDATION_STORE[ctx.dataset_id] = ctx
    logger.info(
        "Stored DatasetValidationContext — dataset_id=%s score=%.1f "
        "ml_task=%s passed=%s issues=%d",
        ctx.dataset_id,
        ctx.validation_score,
        ctx.ml_task_type,
        ctx.validation_report.passed,
        len(ctx.validation_report.issues),
    )


def get_validation_context(dataset_id: str) -> DatasetValidationContext | None:
    """Return the ``DatasetValidationContext`` for a dataset, or ``None``.

    Args:
        dataset_id: UUID of the dataset to retrieve.

    Returns:
        The stored context, or ``None`` if the dataset has not yet been
        validated (or was validated before V4 was deployed).
    """
    return _DATASET_VALIDATION_STORE.get(dataset_id)


def list_validation_contexts() -> list[DatasetValidationContext]:
    """Return all stored ``DatasetValidationContext`` objects.

    Used by the Dataset Catalog and quality dashboards.  Returned in
    insertion order (Python 3.7+ dict ordering guarantee).

    Returns:
        A snapshot list of all stored contexts.
    """
    return list(_DATASET_VALIDATION_STORE.values())
