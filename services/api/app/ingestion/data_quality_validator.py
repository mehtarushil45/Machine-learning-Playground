"""Data quality, schema, and ML compatibility validation for ingested CSV datasets.

Version 4 ingestion pipeline — Stage 1.5.

Called after ``csv_validator.validate_csv_file()`` (Stage 1) has confirmed the
file is structurally valid, and before ``generate_schema_fingerprint()`` (Stage 2).
This module never re-validates structural correctness (size, encoding, header
presence) — those checks belong exclusively to Stage 1.

Responsibilities
----------------
1. **Schema validation** — duplicate columns, empty headers, suspicious names.
2. **Data quality validation** — missing values, duplicate rows, mixed types,
   constant columns, high cardinality, low variance, NaN/Inf strings.
3. **ML compatibility detection** — infers the most likely ML task type
   (classification, regression, timeseries, text, unsupported) from column types.
4. **Validation Score (0–100)** — an informational quality score derived from
   issue severities, missing value percentage, and duplicate row ratio.
   The score is **never** used to block ingestion.

No-duplication guarantee
-------------------------
All type inference delegates to ``app.services.profiler.infer_column_type``.
Missing-value detection delegates to ``app.services.profiler.is_missing_value``.
Numeric parsing delegates to ``app.services.profiler.try_parse_numeric``.
There is exactly one implementation of each utility across the entire platform.

Public API
----------
``run_data_quality_validation(file_path, columns, encoding, delimiter,
                               row_count, column_types) → ValidationReport``
"""

from __future__ import annotations

import csv
import logging
import math
import re
from dataclasses import dataclass, field
from typing import Any

from app.services.profiler import (  # single source of truth
    infer_column_type,
    is_missing_value,
    try_parse_numeric,
)

logger = logging.getLogger("apex_ingestion.data_quality")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_DATA_SAMPLE_LIMIT: int = 1_000    # max rows read for quality checks
_HIGH_CARDINALITY_THRESHOLD: float = 0.95   # uniqueness ratio considered high
_HIGH_MISSING_ERROR_THRESHOLD: float = 80.0  # % missing → error
_HIGH_MISSING_WARN_THRESHOLD: float = 30.0   # % missing → warning
_OVERALL_MISSING_ERROR_THRESHOLD: float = 40.0  # overall % → error
_OVERALL_MISSING_WARN_THRESHOLD: float = 15.0   # overall % → warning

_NAN_STRINGS: frozenset[str] = frozenset({"nan", "inf", "-inf", "+inf", "infinity", "-infinity"})
_SUSPICIOUS_NAME_PATTERN = re.compile(r"[^a-zA-Z0-9_]")


# ---------------------------------------------------------------------------
# Value objects
# ---------------------------------------------------------------------------


@dataclass
class ValidationIssue:
    """A single validation finding with severity, category, and human message.

    Attributes:
        severity:    ``"info"`` | ``"warning"`` | ``"error"`` | ``"critical"``
        category:    ``"schema"`` | ``"data_quality"`` | ``"ml_compatibility"``
        message:     Human-readable description.
        column_name: Affected column name, or ``None`` for dataset-level issues.
        detail:      Optional extra context (e.g. value count, percentage).
    """

    severity: str
    category: str
    message: str
    column_name: str | None = None
    detail: str | None = None


@dataclass
class ValidationReport:
    """Full output of a single data quality validation pass.

    Attributes:
        passed:             ``True`` when zero ``"error"`` or ``"critical"`` issues found.
                            A failing report does **not** block ingestion — it is advisory.
        issues:             Ordered list of all ``ValidationIssue`` findings.
        warnings:           Count of ``"warning"`` severity issues.
        errors:             Count of ``"error"`` and ``"critical"`` severity issues combined.
        ml_task_type:       Detected ML task: ``"classification"`` | ``"regression"``
                            | ``"timeseries"`` | ``"text"`` | ``"unsupported"``.
        ml_confidence:      Confidence of the ML task detection (0.0–1.0).
        ml_reasoning:       Human-readable explanation of the ML task determination.
        row_count:          Total rows in the dataset (from Stage 1).
        column_count:       Total columns in the dataset.
        duplicate_row_count: Estimated duplicate row count (sampled).
        missing_cell_pct:   Overall missing cell percentage across all columns × rows.
        validation_score:   Informational quality score (0–100).
                            Foundation for future Trust Score, AutoML readiness,
                            and enterprise quality dashboards.
    """

    passed: bool
    issues: list[ValidationIssue] = field(default_factory=list)
    warnings: int = 0
    errors: int = 0
    ml_task_type: str = "unknown"
    ml_confidence: float = 0.0
    ml_reasoning: str = ""
    row_count: int = 0
    column_count: int = 0
    duplicate_row_count: int = 0
    missing_cell_pct: float = 0.0
    validation_score: float = 100.0


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def run_data_quality_validation(
    file_path: str,
    columns: list[str],
    encoding: str,
    delimiter: str,
    row_count: int,
    column_types: dict[str, str],
) -> ValidationReport:
    """Run schema, data quality, and ML compatibility validation on a CSV file.

    The file must already have passed ``csv_validator.validate_csv_file()``
    (Stage 1).  This function performs a deeper pass that Stage 1 does not:
    it reads the actual row data (up to ``_DATA_SAMPLE_LIMIT`` rows) to check
    duplicate rows, per-column missing value rates, constant columns, etc.

    Args:
        file_path:    Absolute path to the stored CSV file (already validated).
        columns:      Column names from the validated header (Stage 1 output).
        encoding:     Normalised encoding label (Stage 1 output).
        delimiter:    Field separator character (Stage 1 output).
        row_count:    Total row count (Stage 1 output, used for ratio calculations).
        column_types: ``{column_name: type_string}`` mapping from Stage 1 schema.

    Returns:
        ``ValidationReport`` with all findings, ML task detection, and
        validation score.  Never raises — all internal errors are logged and
        returned as ``"error"`` severity issues.
    """
    issues: list[ValidationIssue] = []

    # ── 1. Schema validation (no file read required) ───────────────────────
    _check_schema(columns, issues)

    # ── 2. Read sample rows for data quality checks ────────────────────────
    sample_rows: list[dict[str, str]]
    col_values_map: dict[str, list[str]]
    try:
        sample_rows, col_values_map = _read_sample(
            file_path, columns, encoding, delimiter
        )
    except Exception as exc:
        logger.error(
            "data_quality_validator: failed to read sample from '%s': %s",
            file_path,
            exc,
            exc_info=True,
        )
        issues.append(
            ValidationIssue(
                severity="error",
                category="data_quality",
                message=f"Could not read data rows for quality validation: {exc}",
            )
        )
        sample_rows = []
        col_values_map = {col: [] for col in columns}

    # ── 3. Data quality checks ─────────────────────────────────────────────
    duplicate_row_count = _check_duplicates(sample_rows, row_count, issues)
    missing_cell_pct = _check_missing_values(col_values_map, row_count, issues)
    _check_mixed_types(col_values_map, column_types, issues)
    _check_constant_columns(col_values_map, issues)
    _check_high_cardinality(col_values_map, row_count, issues)
    _check_low_variance(col_values_map, column_types, issues)
    _check_nan_inf_strings(col_values_map, issues)

    # ── 4. ML compatibility detection ──────────────────────────────────────
    ml_task_type, ml_confidence, ml_reasoning = _detect_ml_task(
        columns, column_types, row_count
    )
    issues.append(
        ValidationIssue(
            severity="info",
            category="ml_compatibility",
            message=(
                f"Detected ML task type: {ml_task_type} "
                f"(confidence {ml_confidence:.0%})"
            ),
            detail=ml_reasoning,
        )
    )

    # ── 5. Aggregate and score ─────────────────────────────────────────────
    warnings = sum(1 for i in issues if i.severity == "warning")
    errors = sum(
        1 for i in issues if i.severity in ("error", "critical")
    )
    passed = errors == 0

    validation_score = _compute_validation_score(
        issues=issues,
        row_count=row_count,
        duplicate_row_count=duplicate_row_count,
        missing_cell_pct=missing_cell_pct,
    )

    logger.info(
        "Data quality validation complete — score=%.1f passed=%s "
        "errors=%d warnings=%d ml_task=%s",
        validation_score,
        passed,
        errors,
        warnings,
        ml_task_type,
    )

    return ValidationReport(
        passed=passed,
        issues=issues,
        warnings=warnings,
        errors=errors,
        ml_task_type=ml_task_type,
        ml_confidence=ml_confidence,
        ml_reasoning=ml_reasoning,
        row_count=row_count,
        column_count=len(columns),
        duplicate_row_count=duplicate_row_count,
        missing_cell_pct=missing_cell_pct,
        validation_score=validation_score,
    )


# ---------------------------------------------------------------------------
# Private: schema checks (no file I/O)
# ---------------------------------------------------------------------------


def _check_schema(columns: list[str], issues: list[ValidationIssue]) -> None:
    """S1–S3: Duplicate columns, empty headers, suspicious column names."""
    # S1: Duplicate column names
    seen: set[str] = set()
    duplicates: list[str] = []
    for col in columns:
        if col in seen:
            duplicates.append(col)
        seen.add(col)
    if duplicates:
        issues.append(
            ValidationIssue(
                severity="error",
                category="schema",
                message=(
                    f"Duplicate column name(s) detected: "
                    f"{', '.join(repr(c) for c in duplicates)}. "
                    "Each column must have a unique name."
                ),
                detail=f"Duplicated: {duplicates}",
            )
        )

    # S2: Empty or blank header names
    empty_positions = [i for i, col in enumerate(columns) if not col.strip()]
    if empty_positions:
        issues.append(
            ValidationIssue(
                severity="error",
                category="schema",
                message=(
                    f"Empty column name(s) at position(s): "
                    f"{empty_positions}. All columns must be named."
                ),
            )
        )

    # S3: Suspicious column name characters (spaces or special chars)
    for col in columns:
        if _SUSPICIOUS_NAME_PATTERN.search(col):
            issues.append(
                ValidationIssue(
                    severity="warning",
                    category="schema",
                    message=(
                        f"Column '{col}' contains characters outside "
                        "[a-zA-Z0-9_]. This may cause issues with ML "
                        "frameworks that expect clean identifiers."
                    ),
                    column_name=col,
                )
            )


# ---------------------------------------------------------------------------
# Private: file sample reader
# ---------------------------------------------------------------------------


def _read_sample(
    file_path: str,
    columns: list[str],
    encoding: str,
    delimiter: str,
) -> tuple[list[dict[str, str]], dict[str, list[str]]]:
    """Read up to ``_DATA_SAMPLE_LIMIT`` rows from the validated CSV.

    Returns:
        ``(sample_rows, col_values_map)`` where ``sample_rows`` is a list of
        row dicts and ``col_values_map`` maps each column name to its list of
        raw string cell values from the sample.
    """
    sample_rows: list[dict[str, str]] = []
    col_values_map: dict[str, list[str]] = {col: [] for col in columns}

    with open(file_path, encoding=encoding, errors="replace", newline="") as fh:
        reader = csv.DictReader(fh, delimiter=delimiter)
        for row in reader:
            if len(sample_rows) >= _DATA_SAMPLE_LIMIT:
                break
            sample_rows.append(dict(row))
            for col in columns:
                col_values_map[col].append(row.get(col, "") or "")

    return sample_rows, col_values_map


# ---------------------------------------------------------------------------
# Private: data quality checks
# ---------------------------------------------------------------------------


def _check_duplicates(
    sample_rows: list[dict[str, str]],
    row_count: int,
    issues: list[ValidationIssue],
) -> int:
    """D1: Estimate duplicate rows in the sample; extrapolate to full dataset."""
    if not sample_rows:
        return 0

    row_hashes = [hash(tuple(sorted(r.items()))) for r in sample_rows]
    unique_count = len(set(row_hashes))
    sample_dup_count = len(sample_rows) - unique_count

    # Extrapolate to full dataset size if we only read a sample
    if row_count > len(sample_rows) and len(sample_rows) > 0:
        dup_ratio = sample_dup_count / len(sample_rows)
        estimated_dup_count = round(dup_ratio * row_count)
    else:
        estimated_dup_count = sample_dup_count

    if estimated_dup_count > 0:
        dup_pct = (estimated_dup_count / max(row_count, 1)) * 100
        issues.append(
            ValidationIssue(
                severity="warning",
                category="data_quality",
                message=(
                    f"Estimated {estimated_dup_count:,} duplicate row(s) "
                    f"({dup_pct:.1f}% of dataset). Duplicates may bias model training."
                ),
                detail=(
                    f"Detected {sample_dup_count} duplicates in "
                    f"{len(sample_rows)}-row sample."
                ),
            )
        )

    return estimated_dup_count


def _check_missing_values(
    col_values_map: dict[str, list[str]],
    row_count: int,
    issues: list[ValidationIssue],
) -> float:
    """D2 + D8: Per-column and overall missing value rate."""
    if not col_values_map or row_count == 0:
        return 0.0

    total_cells = 0
    total_missing = 0

    for col, values in col_values_map.items():
        missing_cnt = sum(1 for v in values if is_missing_value(v))
        total_cells += len(values)
        total_missing += missing_cnt

        if not values:
            continue

        col_missing_pct = (missing_cnt / len(values)) * 100.0

        if col_missing_pct >= 100.0:
            issues.append(
                ValidationIssue(
                    severity="error",
                    category="data_quality",
                    message=(
                        f"Column '{col}' is completely empty "
                        "(100% missing values)."
                    ),
                    column_name=col,
                    detail=f"{missing_cnt}/{len(values)} values missing",
                )
            )
        elif col_missing_pct >= _HIGH_MISSING_ERROR_THRESHOLD:
            issues.append(
                ValidationIssue(
                    severity="error",
                    category="data_quality",
                    message=(
                        f"Column '{col}' has {col_missing_pct:.1f}% missing values "
                        f"(≥{_HIGH_MISSING_ERROR_THRESHOLD:.0f}%). "
                        "This column may not be usable for ML."
                    ),
                    column_name=col,
                    detail=f"{missing_cnt}/{len(values)} values missing",
                )
            )
        elif col_missing_pct >= _HIGH_MISSING_WARN_THRESHOLD:
            issues.append(
                ValidationIssue(
                    severity="warning",
                    category="data_quality",
                    message=(
                        f"Column '{col}' has {col_missing_pct:.1f}% missing values. "
                        "Consider imputation before training."
                    ),
                    column_name=col,
                    detail=f"{missing_cnt}/{len(values)} values missing",
                )
            )

    overall_pct = (total_missing / total_cells * 100.0) if total_cells > 0 else 0.0

    if overall_pct >= _OVERALL_MISSING_ERROR_THRESHOLD:
        issues.append(
            ValidationIssue(
                severity="error",
                category="data_quality",
                message=(
                    f"Overall dataset missing cell rate is {overall_pct:.1f}% "
                    f"(≥{_OVERALL_MISSING_ERROR_THRESHOLD:.0f}%). "
                    "Dataset quality is too low for reliable ML training."
                ),
                detail=f"{total_missing:,} / {total_cells:,} cells are missing",
            )
        )
    elif overall_pct >= _OVERALL_MISSING_WARN_THRESHOLD:
        issues.append(
            ValidationIssue(
                severity="warning",
                category="data_quality",
                message=(
                    f"Overall dataset missing cell rate is {overall_pct:.1f}%. "
                    "Imputation or row removal recommended before training."
                ),
                detail=f"{total_missing:,} / {total_cells:,} cells are missing",
            )
        )

    return round(overall_pct, 2)


def _check_mixed_types(
    col_values_map: dict[str, list[str]],
    column_types: dict[str, str],
    issues: list[ValidationIssue],
) -> None:
    """D3: Detect columns where inferred type differs from Stage 1 inference.

    Stage 1 infers types from the first 200 rows; Stage 1.5 re-infers from up
    to 1 000 rows.  A discrepancy indicates mixed/inconsistent data.
    """
    for col, values in col_values_map.items():
        if not values:
            continue
        stage1_type = column_types.get(col, "text")
        stage15_type = infer_column_type(col, values)
        if stage1_type != stage15_type:
            issues.append(
                ValidationIssue(
                    severity="warning",
                    category="data_quality",
                    message=(
                        f"Column '{col}' shows mixed data types: "
                        f"initial sample inferred '{stage1_type}', "
                        f"extended sample inferred '{stage15_type}'. "
                        "Values may be inconsistently formatted."
                    ),
                    column_name=col,
                    detail=f"stage1={stage1_type}, stage15={stage15_type}",
                )
            )


def _check_constant_columns(
    col_values_map: dict[str, list[str]],
    issues: list[ValidationIssue],
) -> None:
    """D4: Columns where every non-missing value is identical contribute zero variance."""
    for col, values in col_values_map.items():
        non_missing = [v for v in values if not is_missing_value(v)]
        if len(non_missing) < 2:
            continue
        if len(set(non_missing)) == 1:
            issues.append(
                ValidationIssue(
                    severity="warning",
                    category="data_quality",
                    message=(
                        f"Column '{col}' is a constant column — all non-missing "
                        f"values equal '{non_missing[0]}'. "
                        "Constant features provide no predictive signal and "
                        "should be dropped before training."
                    ),
                    column_name=col,
                )
            )


def _check_high_cardinality(
    col_values_map: dict[str, list[str]],
    row_count: int,
    issues: list[ValidationIssue],
) -> None:
    """D5: Columns with uniqueness ratio above threshold (e.g. free-text IDs)."""
    for col, values in col_values_map.items():
        non_missing = [v for v in values if not is_missing_value(v)]
        if len(non_missing) < 10:
            continue
        uniqueness = len(set(non_missing)) / len(non_missing)
        if uniqueness >= _HIGH_CARDINALITY_THRESHOLD:
            issues.append(
                ValidationIssue(
                    severity="info",
                    category="data_quality",
                    message=(
                        f"Column '{col}' has very high cardinality "
                        f"({uniqueness:.0%} unique values). "
                        "May be an identifier or free-text field; "
                        "consider excluding from ML features."
                    ),
                    column_name=col,
                    detail=f"{len(set(non_missing))} unique / {len(non_missing)} non-missing",
                )
            )


def _check_low_variance(
    col_values_map: dict[str, list[str]],
    column_types: dict[str, str],
    issues: list[ValidationIssue],
) -> None:
    """D6: Numeric columns with zero or near-zero standard deviation."""
    for col, values in col_values_map.items():
        if column_types.get(col) != "numeric":
            continue
        numeric_vals = [
            n
            for n in (try_parse_numeric(v) for v in values)
            if n is not None
        ]
        if len(numeric_vals) < 2:
            continue
        mean_val = sum(numeric_vals) / len(numeric_vals)
        variance = sum((x - mean_val) ** 2 for x in numeric_vals) / (len(numeric_vals) - 1)
        std_val = math.sqrt(variance)
        if std_val == 0.0:
            issues.append(
                ValidationIssue(
                    severity="warning",
                    category="data_quality",
                    message=(
                        f"Numeric column '{col}' has zero standard deviation "
                        "(all values are identical). "
                        "This column provides no variance for ML algorithms."
                    ),
                    column_name=col,
                    detail=f"mean={mean_val}, std=0.0",
                )
            )


def _check_nan_inf_strings(
    col_values_map: dict[str, list[str]],
    issues: list[ValidationIssue],
) -> None:
    """D7: Detect literal 'nan', 'inf', '-inf' strings that may signal data pipeline errors."""
    for col, values in col_values_map.items():
        nan_inf_values = [
            v for v in values
            if isinstance(v, str) and v.strip().lower() in _NAN_STRINGS
        ]
        if nan_inf_values:
            sample = list(set(nan_inf_values))[:3]
            issues.append(
                ValidationIssue(
                    severity="error",
                    category="data_quality",
                    message=(
                        f"Column '{col}' contains {len(nan_inf_values)} literal "
                        f"NaN/Inf string value(s): {sample}. "
                        "These indicate a broken data pipeline and must be "
                        "cleaned before ML training."
                    ),
                    column_name=col,
                    detail=f"Values found: {nan_inf_values[:5]}",
                )
            )


# ---------------------------------------------------------------------------
# Private: ML compatibility detection
# ---------------------------------------------------------------------------


def _detect_ml_task(
    columns: list[str],
    column_types: dict[str, str],
    row_count: int,
) -> tuple[str, float, str]:
    """Detect the most likely ML task type from column type composition.

    Reuses ``infer_column_type`` from ``app.services.profiler`` — no separate
    type inference logic is implemented here.

    Returns:
        ``(task_type, confidence, reasoning)`` where ``task_type`` is one of:
        ``"classification"``, ``"regression"``, ``"timeseries"``, ``"text"``,
        ``"unsupported"``.
    """
    if not columns:
        return "unsupported", 0.0, "No columns available for ML task detection."

    total = len(columns)
    type_counts: dict[str, int] = {}
    for col in columns:
        t = column_types.get(col, "text")
        type_counts[t] = type_counts.get(t, 0) + 1

    numeric_count = type_counts.get("numeric", 0)
    categorical_count = type_counts.get("categorical", 0)
    boolean_count = type_counts.get("boolean", 0)
    datetime_count = type_counts.get("datetime", 0)
    text_count = type_counts.get("text", 0)
    identifier_count = type_counts.get("identifier", 0)

    # Rule 1: Datetime column present → Time Series candidate
    if datetime_count >= 1:
        return (
            "timeseries",
            0.75,
            (
                f"Datetime column(s) detected ({datetime_count}/{total}). "
                "Temporal ordering suggests a time series or sequence modelling task."
            ),
        )

    # Rule 2: Dominant text columns → NLP / Text classification
    if text_count >= 1 and (text_count / total) >= 0.5:
        return (
            "text",
            0.70,
            (
                f"High text column ratio ({text_count}/{total}). "
                "Dataset is likely suited for NLP or text classification."
            ),
        )

    # Rule 3: Mixed numeric + categorical → Classification
    effective_numeric = numeric_count + boolean_count
    if effective_numeric > 0 and categorical_count > 0:
        return (
            "classification",
            0.75,
            (
                f"Mixed numeric ({numeric_count}) and categorical ({categorical_count}) "
                "columns detected. Binary or multi-class classification likely."
            ),
        )

    # Rule 4: Predominantly numeric → Regression
    if effective_numeric > 0 and (effective_numeric / total) >= 0.5:
        return (
            "regression",
            0.80,
            (
                f"Predominantly numeric columns ({effective_numeric}/{total}). "
                "Continuous target prediction (regression) likely."
            ),
        )

    # Rule 5: Predominantly categorical → Classification
    if categorical_count > 0 and (categorical_count / total) >= 0.5:
        return (
            "classification",
            0.80,
            (
                f"Predominantly categorical columns ({categorical_count}/{total}). "
                "Classification task likely."
            ),
        )

    # Rule 6: Only identifiers or indeterminate
    return (
        "unsupported",
        0.40,
        (
            f"Column type composition (numeric={numeric_count}, "
            f"categorical={categorical_count}, identifier={identifier_count}, "
            f"text={text_count}) is insufficient to determine ML task type. "
            "Manual inspection recommended."
        ),
    )


# ---------------------------------------------------------------------------
# Private: validation score
# ---------------------------------------------------------------------------


def _compute_validation_score(
    issues: list[ValidationIssue],
    row_count: int,
    duplicate_row_count: int,
    missing_cell_pct: float,
) -> float:
    """Compute an informational quality score (0–100) from validation findings.

    Scoring breakdown:
        - Missing cells:    −1.5 per 1% missing (max −30)
        - Duplicate rows:   −0.5 per 1% duplicate rows (max −10)
        - Per issue:        critical → −15, error → −8, warning → −2, info → 0

    The score is clamped to [0, 100] and rounded to one decimal place.
    It is **never** used to block ingestion.

    Foundation for: Dataset Trust Score, AutoML readiness scoring,
    Dataset Governance, enterprise quality dashboards.
    """
    score = 100.0

    # Deduct for missing values (up to −30)
    score -= min(30.0, missing_cell_pct * 1.5)

    # Deduct for duplicate rows (up to −10)
    if row_count > 0:
        dup_pct = (duplicate_row_count / row_count) * 100.0
        score -= min(10.0, dup_pct * 0.5)

    # Deduct per-issue penalties
    for issue in issues:
        if issue.severity == "critical":
            score -= 15.0
        elif issue.severity == "error":
            score -= 8.0
        elif issue.severity == "warning":
            score -= 2.0
        # "info" → no deduction

    return round(max(0.0, min(100.0, score)), 1)
