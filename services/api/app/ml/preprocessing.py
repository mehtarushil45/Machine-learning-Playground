"""Automatic Preprocessing Pipeline & Leakage-Safe Specification.

Builds a fully automatic, unfitted scikit-learn preprocessing pipeline from a
DatasetContext, with configurable scalers, imputation strategies, and conservative
multi-signal identifier and leakage filtering.

Supported column kinds:
  - numeric   → configurable numeric imputer → configurable scaler
  - categorical / text → mode imputer → OneHotEncoder(handle_unknown="ignore")
  - boolean   → mode imputer → ordinal integer mapping (0/1) → optional scaler
  - datetime  → mode imputer → numeric timestamp extraction (Unix epoch float) → optional scaler
  - target    → separated before preprocessing (never transformed inside feature pipeline)
"""

from __future__ import annotations

from dataclasses import dataclass
import logging
import math
import re
from typing import Any, List, Optional, Sequence

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import (
    FunctionTransformer,
    OneHotEncoder,
)

from app.ml.dataset_loader import DatasetContext
from app.ml.imputer_factory import get_imputer
from app.ml.scaler_factory import get_scaler

logger = logging.getLogger("apex_ml.preprocessing")

# Regex for UUID / Hex Hash / Key patterns
UUID_PATTERN = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)
HASH_PATTERN = re.compile(r"^[0-9a-fA-F]{32,64}$")
ID_NAME_PATTERN = re.compile(r"^(id|.*_id|id_.*|uuid|pk|guid|row_id|index|record_id|key|hash)$", re.IGNORECASE)


# ---------------------------------------------------------------------------
# Multi-Signal Identifier Detection
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class IdentifierDetectionResult:
    """Detailed verdict for a column's identifier status."""

    is_identifier: bool
    confidence: str  # "high", "medium", "low", "none"
    reasons: list[str]
    is_target_column: bool = False


def detect_identifier_signals(
    column_name: str,
    values: Sequence[Any] | pd.Series,
    total_rows: int,
    is_target: bool = False,
) -> IdentifierDetectionResult:
    """Evaluate multi-signal criteria for identifier detection.

    Signals evaluated:
      1. Name patterns (e.g. id, uuid, pk, record_id).
      2. Value shape patterns (UUID, MD5/SHA hex strings).
      3. Cardinality / Near-uniqueness ratio (unique / non-null count >= 0.99 with N >= 20).
      4. Strictly monotonic sequential integers (e.g. 1, 2, 3, ...).

    Target Safety Rule:
      The selected target column is NEVER auto-excluded. If the target column
      looks identifier-like, it is flagged with a warning requiring confirmation.
    """
    reasons: list[str] = []
    if isinstance(values, pd.Series):
        clean_series = values.dropna()
        sample_vals = clean_series.head(100).tolist()
        non_null_count = int(clean_series.count())
        unique_count = int(clean_series.nunique())
    else:
        sample_vals = [v for v in values if v is not None and not (isinstance(v, float) and math.isnan(v))]
        non_null_count = len(sample_vals)
        unique_count = len(set(sample_vals))

    if non_null_count == 0:
        return IdentifierDetectionResult(
            is_identifier=False,
            confidence="none",
            reasons=["Column is empty."],
            is_target_column=is_target,
        )

    # Signal 1: Name match
    name_matched = bool(ID_NAME_PATTERN.match(column_name.strip()))
    if name_matched:
        reasons.append(f"Column name '{column_name}' matches identifier naming convention.")

    # Signal 2: Value shape pattern
    str_samples = [str(v).strip() for v in sample_vals[:50] if v is not None]
    uuid_matches = sum(1 for v in str_samples if UUID_PATTERN.match(v))
    hash_matches = sum(1 for v in str_samples if HASH_PATTERN.match(v))
    shape_matched = False
    if str_samples and (uuid_matches / len(str_samples) >= 0.8 or hash_matches / len(str_samples) >= 0.8):
        shape_matched = True
        reasons.append("Values match UUID or cryptographic hash format.")

    # Signal 3: Near-uniqueness
    uniqueness_ratio = unique_count / non_null_count if non_null_count > 0 else 0.0
    near_unique = non_null_count >= 20 and uniqueness_ratio >= 0.99
    if near_unique:
        reasons.append(f"High uniqueness ratio ({uniqueness_ratio:.1%}) indicates key-like column.")

    # Signal 4: Monotonic sequential check
    sequential_matched = False
    if isinstance(values, pd.Series) and pd.api.types.is_numeric_dtype(values) and non_null_count >= 10:
        numeric_series = clean_series.astype(float)
        diffs = numeric_series.diff().dropna()
        if (diffs == 1.0).all():
            sequential_matched = True
            reasons.append("Values form a strictly sequential integer index.")

    # Composite verdict
    score = 0
    if shape_matched:
        score += 3
    if name_matched and near_unique:
        score += 3
    elif name_matched:
        score += 1
    elif near_unique and total_rows > 30:
        score += 2
    if sequential_matched:
        score += 3

    if score >= 3:
        return IdentifierDetectionResult(
            is_identifier=True,
            confidence="high" if score >= 4 else "medium",
            reasons=reasons,
            is_target_column=is_target,
        )
    elif score >= 1:
        return IdentifierDetectionResult(
            is_identifier=False,
            confidence="low",
            reasons=reasons,
            is_target_column=is_target,
        )

    return IdentifierDetectionResult(
        is_identifier=False,
        confidence="none",
        reasons=[],
        is_target_column=is_target,
    )


@dataclass(frozen=True)
class FeatureExclusion:
    """Declared reason for excluding a feature from benchmark preprocessing."""

    column_name: str
    reason: str
    category: str  # "identifier", "empty", "zero_variance", "unsupported_text"


def sanitize_feature_columns(
    dataframe: pd.DataFrame,
    target_column: str,
    explicit_features: Optional[list[str]] = None,
) -> tuple[list[str], list[FeatureExclusion]]:
    """Filter and sanitize feature columns, recording explicit exclusion reasons.

    Rules:
      1. Target column is NEVER included in feature list.
      2. 100% missing columns are excluded.
      3. Zero-variance constant columns are excluded.
      4. Conservative multi-signal identifiers are excluded.
    """
    candidates = explicit_features if explicit_features is not None else [
        c for c in dataframe.columns if c != target_column
    ]

    clean_features: list[str] = []
    exclusions: list[FeatureExclusion] = []
    total_rows = len(dataframe)

    for col in candidates:
        if col == target_column:
            continue

        if col not in dataframe.columns:
            exclusions.append(
                FeatureExclusion(col, f"Column '{col}' not found in dataset.", "missing")
            )
            continue

        series = dataframe[col]
        non_null_count = int(series.count())

        # 100% missing check
        if non_null_count == 0:
            exclusions.append(
                FeatureExclusion(col, "Column is 100% empty.", "empty")
            )
            continue

        # Zero-variance check
        if series.nunique(dropna=True) <= 1:
            exclusions.append(
                FeatureExclusion(col, "Zero-variance constant feature.", "zero_variance")
            )
            continue

        # Identifier check
        id_check = detect_identifier_signals(col, series, total_rows, is_target=False)
        if id_check.is_identifier:
            reason_str = " | ".join(id_check.reasons)
            exclusions.append(
                FeatureExclusion(col, f"Identifier detected: {reason_str}", "identifier")
            )
            continue

        clean_features.append(col)

    return clean_features, exclusions


# ---------------------------------------------------------------------------
# Datetime & Boolean helpers
# ---------------------------------------------------------------------------

def _cast_to_object(X: np.ndarray) -> np.ndarray:
    """Cast array to object dtype so SimpleImputer accepts boolean columns."""
    if hasattr(X, "astype"):
        return X.astype(object)
    return np.array(X, dtype=object)


def _to_unix_timestamp(X: np.ndarray | pd.DataFrame) -> np.ndarray:
    """Convert a 2-D array / DataFrame of datetime strings to float Unix timestamps using vectorized pandas operations."""
    if not isinstance(X, pd.DataFrame):
        df = pd.DataFrame(X)
    else:
        df = X.copy()

    if df.empty or df.shape[1] == 0:
        return np.empty((df.shape[0], df.shape[1]), dtype=np.float64)

    cols = []
    for col in df.columns:
        dt_series = pd.to_datetime(df[col], errors="coerce", utc=True)
        ts_sec = dt_series.astype("datetime64[s, UTC]").astype("int64").astype(np.float64)
        ts_sec = ts_sec.where(dt_series.notna(), 0.0)
        cols.append(ts_sec.to_numpy(dtype=np.float64))

    return np.column_stack(cols)


def _bool_to_int(X: np.ndarray) -> np.ndarray:
    """Convert boolean / boolean-string values to integer 0/1."""
    _true_set = {"true", "yes", "1"}
    result = np.zeros(X.shape, dtype=np.float64)
    for col_idx in range(X.shape[1]):
        for row_idx in range(X.shape[0]):
            val = X[row_idx, col_idx]
            if isinstance(val, bool):
                result[row_idx, col_idx] = float(val)
            elif isinstance(val, (int, float)):
                result[row_idx, col_idx] = float(bool(val))
            elif isinstance(val, str):
                result[row_idx, col_idx] = 1.0 if val.strip().lower() in _true_set else 0.0
    return result


# ---------------------------------------------------------------------------
# Public factory
# ---------------------------------------------------------------------------

def build_preprocessor(
    ctx: DatasetContext,
    use_scaling: bool = True,
    scaler: Optional[str] = "standard_scaler",
    imputer: Optional[str] = "median",
) -> ColumnTransformer:
    """Construct an unfitted ColumnTransformer for *ctx*.

    Args:
        ctx: A :class:`~app.ml.dataset_loader.DatasetContext` describing the
             dataset's column schema.
        use_scaling: Boolean flag for backward compatibility. If False, overrides scaler to None.
        scaler: Canonical key from ``scaler_factory``. ``None`` is supported
            only for legacy requests that explicitly disable normalization.
        imputer: Canonical key from ``imputer_factory``.

    Returns:
        An unfitted :class:`~sklearn.compose.ColumnTransformer` ready to be
        embedded into a :class:`~sklearn.pipeline.Pipeline` and fitted strictly
        on training data per cross-validation fold.
    """
    transformers: List = []

    # Determine effective scaler instance
    scaler_instance = get_scaler(scaler or "standard_scaler") if use_scaling else None
    numeric_imputer_instance = get_imputer(imputer or "median")

    # ── Numeric columns ───────────────────────────────────────────────────────
    if ctx.numeric_columns:
        num_steps = [("imputer", numeric_imputer_instance)]
        if scaler_instance is not None:
            num_steps.append(("scaler", scaler_instance))
        transformers.append(
            ("numeric", Pipeline(steps=num_steps), ctx.numeric_columns)
        )
        logger.debug("Numeric pipeline: %s → %s", ctx.numeric_columns, [s[0] for s in num_steps])

    # ── Categorical columns ───────────────────────────────────────────────────
    if ctx.categorical_columns:
        cat_steps = [
            ("imputer", get_imputer("most_frequent")),
            ("encoder", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
        ]
        transformers.append(
            ("categorical", Pipeline(steps=cat_steps), ctx.categorical_columns)
        )
        logger.debug("Categorical pipeline → %s", ctx.categorical_columns)

    # ── Boolean columns ───────────────────────────────────────────────────────
    if ctx.boolean_columns:
        bool_steps = [
            ("cast_obj", FunctionTransformer(_cast_to_object, validate=False)),
            ("imputer", get_imputer("most_frequent")),
            ("to_int", FunctionTransformer(_bool_to_int, validate=False)),
        ]
        if scaler_instance is not None:
            bool_steps.append(("scaler", get_scaler(scaler or "standard_scaler")))
        transformers.append(
            ("boolean", Pipeline(steps=bool_steps), ctx.boolean_columns)
        )
        logger.debug("Boolean pipeline -> %s", ctx.boolean_columns)

    # ── Datetime columns ──────────────────────────────────────────────────────
    if ctx.datetime_columns:
        dt_steps = [
            ("imputer", get_imputer("most_frequent")),
            ("to_ts", FunctionTransformer(_to_unix_timestamp, validate=False)),
        ]
        if scaler_instance is not None:
            dt_steps.append(("scaler", get_scaler(scaler or "standard_scaler")))
        transformers.append(
            ("datetime", Pipeline(steps=dt_steps), ctx.datetime_columns)
        )
        logger.debug("Datetime pipeline → %s", ctx.datetime_columns)

    if not transformers:
        raise ValueError(
            "DatasetContext contains no processable feature columns. "
            "At least one numeric, categorical, boolean, or datetime column is required."
        )

    preprocessor = ColumnTransformer(
        transformers=transformers,
        remainder="drop",
        verbose_feature_names_out=False,
    )

    logger.info(
        "Built preprocessing pipeline (scaler=%s, imputer=%s): %d transformer group(s) covering %d feature(s).",
        type(scaler_instance).__name__ if scaler_instance else "None",
        type(numeric_imputer_instance).__name__,
        len(transformers),
        len(ctx.feature_columns),
    )
    return preprocessor
