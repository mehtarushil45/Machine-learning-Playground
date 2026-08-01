"""Automatic Preprocessing Pipeline — Sprint 3 Module 3.2.

Builds a fully automatic scikit-learn preprocessing pipeline from a
DatasetContext, with no hardcoded column names.

Supported column kinds:
  - numeric   → median imputation → optional StandardScaler
  - categorical / text / identifier → mode imputation → OneHotEncoder
  - boolean   → mode imputation → ordinal integer mapping (0/1)
  - datetime  → numeric timestamp extraction (Unix epoch float)
  - target    → separated before preprocessing (not transformed here)

Design decisions:
- build_preprocessor() is a pure factory function that returns a fitted-ready
  ColumnTransformer.  It does NOT fit — fitting happens inside the training
  pipeline so train/test leakage is impossible.
- Boolean columns are mapped to integers via a FunctionTransformer before being
  passed to a numeric pipeline — this avoids sparse OHE output for flags.
- Datetime columns are converted to float Unix timestamps so the model sees
  ordinal time information without leaking string formats.
- The returned ColumnTransformer uses remainder="drop" to silently ignore any
  columns not in the schema (e.g. future schema drift).
"""

from __future__ import annotations

import logging
from typing import List, Optional

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import FunctionTransformer, OneHotEncoder, StandardScaler

from app.ml.dataset_loader import DatasetContext

logger = logging.getLogger("apex_ml.preprocessing")


# ---------------------------------------------------------------------------
# Datetime helper
# ---------------------------------------------------------------------------

def _cast_to_object(X: np.ndarray) -> np.ndarray:
    """Cast array to object dtype so SimpleImputer accepts boolean columns."""
    if hasattr(X, "astype"):
        return X.astype(object)
    return np.array(X, dtype=object)


def _to_unix_timestamp(X: np.ndarray) -> np.ndarray:
    """Convert a 2-D object array of datetime strings to float Unix timestamps.

    Rows that cannot be parsed are filled with 0.0.
    """
    result = np.zeros(X.shape, dtype=np.float64)
    for col_idx in range(X.shape[1]):
        for row_idx in range(X.shape[0]):
            try:
                ts = pd.Timestamp(X[row_idx, col_idx])
                result[row_idx, col_idx] = ts.timestamp()
            except Exception:
                result[row_idx, col_idx] = 0.0
    return result


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
            # else: stays 0.0
    return result


# ---------------------------------------------------------------------------
# Public factory
# ---------------------------------------------------------------------------

def build_preprocessor(
    ctx: DatasetContext,
    use_scaling: bool = True,
) -> ColumnTransformer:
    """Construct an unfitted ColumnTransformer for *ctx*.

    Args:
        ctx: A :class:`~app.ml.dataset_loader.DatasetContext` describing the
             dataset's column schema.
        use_scaling: If ``True``, a :class:`~sklearn.preprocessing.StandardScaler`
             is appended to the numeric sub-pipeline.

    Returns:
        An unfitted :class:`~sklearn.compose.ColumnTransformer` ready to be
        embedded into a :class:`~sklearn.pipeline.Pipeline` and fitted on
        training data.
    """
    transformers: List = []

    # ── Numeric columns ───────────────────────────────────────────────────────
    if ctx.numeric_columns:
        num_steps = [("imputer", SimpleImputer(strategy="median"))]
        if use_scaling:
            num_steps.append(("scaler", StandardScaler()))
        transformers.append(
            ("numeric", Pipeline(steps=num_steps), ctx.numeric_columns)
        )
        logger.debug("Numeric pipeline: %s → %s", ctx.numeric_columns, [s[0] for s in num_steps])

    # ── Categorical columns ───────────────────────────────────────────────────
    if ctx.categorical_columns:
        cat_steps = [
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("encoder", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
        ]
        transformers.append(
            ("categorical", Pipeline(steps=cat_steps), ctx.categorical_columns)
        )
        logger.debug("Categorical pipeline → %s", ctx.categorical_columns)

    # ── Boolean columns ───────────────────────────────────────────────────────
    if ctx.boolean_columns:
        # SimpleImputer rejects pandas bool dtype — cast to object first.
        bool_steps = [
            ("cast_obj", FunctionTransformer(_cast_to_object, validate=False)),
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("to_int", FunctionTransformer(_bool_to_int, validate=False)),
        ]
        if use_scaling:
            bool_steps.append(("scaler", StandardScaler()))
        transformers.append(
            ("boolean", Pipeline(steps=bool_steps), ctx.boolean_columns)
        )
        logger.debug("Boolean pipeline -> %s", ctx.boolean_columns)

    # ── Datetime columns ──────────────────────────────────────────────────────
    if ctx.datetime_columns:
        dt_steps = [
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("to_ts", FunctionTransformer(_to_unix_timestamp, validate=False)),
        ]
        if use_scaling:
            dt_steps.append(("scaler", StandardScaler()))
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
        remainder="drop",   # unknown/unexpected columns are silently ignored
        verbose_feature_names_out=False,
    )

    logger.info(
        "Built preprocessing pipeline: %d transformer group(s) covering %d feature(s).",
        len(transformers),
        len(ctx.feature_columns),
    )
    return preprocessor
