"""Automatic Preprocessing Pipeline.

Builds a fully automatic scikit-learn preprocessing pipeline from a
DatasetContext, with configurable scalers and imputation strategies.

Supported column kinds:
  - numeric   → configurable numeric imputer → configurable scaler
  - categorical / text / identifier → mode imputer → OneHotEncoder
  - boolean   → mode imputer → ordinal integer mapping (0/1) → optional scaler
  - datetime  → mode imputer → numeric timestamp extraction (Unix epoch float) → optional scaler
  - target    → separated before preprocessing (not transformed here)
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import KNNImputer, SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import (
    FunctionTransformer,
    MaxAbsScaler,
    MinMaxScaler,
    OneHotEncoder,
    RobustScaler,
    StandardScaler,
)

from app.ml.dataset_loader import DatasetContext

logger = logging.getLogger("apex_ml.preprocessing")


# ---------------------------------------------------------------------------
# Scaler & Imputer Registries
# ---------------------------------------------------------------------------

def _create_scaler(scaler_name: Optional[str]) -> Optional[Any]:
    """Instantiate a scaler based on human-readable or canonical name."""
    if not scaler_name:
        return None
    key = scaler_name.strip().lower().replace(" ", "").replace("_", "").replace("-", "")
    if key in ("standardscaler", "standard", "zscore", "true"):
        return StandardScaler()
    if key in ("minmaxscaler", "minmax", "min_max"):
        return MinMaxScaler()
    if key in ("robustscaler", "robust"):
        return RobustScaler()
    if key in ("maxabsscaler", "maxabs"):
        return MaxAbsScaler()
    if key in ("none", "raw", "passthrough", "false"):
        return None
    logger.warning("Unrecognised scaler '%s'; defaulting to StandardScaler.", scaler_name)
    return StandardScaler()


def _create_numeric_imputer(imputer_name: Optional[str]) -> Any:
    """Instantiate an imputer for numeric columns."""
    if not imputer_name:
        return SimpleImputer(strategy="median")
    key = imputer_name.strip().lower().replace(" ", "").replace("_", "").replace("-", "")
    if key in ("median",):
        return SimpleImputer(strategy="median")
    if key in ("mean", "average"):
        return SimpleImputer(strategy="mean")
    if key in ("mostfrequent", "mode"):
        return SimpleImputer(strategy="most_frequent")
    if key in ("constant", "constant(0)", "zero", "0", "fill0"):
        return SimpleImputer(strategy="constant", fill_value=0.0)
    if key in ("knnimputer", "knn"):
        return KNNImputer(n_neighbors=5)
    logger.warning("Unrecognised numeric imputer '%s'; defaulting to median.", imputer_name)
    return SimpleImputer(strategy="median")


def list_supported_scalers() -> List[Dict[str, str]]:
    """Return list of supported scaler options with human-readable labels."""
    return [
        {"value": "StandardScaler", "label": "StandardScaler (Zero mean, Unit variance)"},
        {"value": "MinMaxScaler", "label": "MinMaxScaler (0 to 1 range)"},
        {"value": "RobustScaler", "label": "RobustScaler (IQR outlier-resistant)"},
        {"value": "MaxAbsScaler", "label": "MaxAbsScaler (Scale by absolute maximum)"},
        {"value": "None", "label": "None (Raw features)"},
    ]


def list_supported_imputers() -> List[Dict[str, str]]:
    """Return list of supported imputer options with human-readable labels."""
    return [
        {"value": "Median", "label": "Median (Robust for skewed numerics)"},
        {"value": "Mean", "label": "Mean (Standard continuous)"},
        {"value": "Most Frequent", "label": "Most Frequent (Categorical mode)"},
        {"value": "Constant (0)", "label": "Constant (Fill 0 / default)"},
        {"value": "KNN Imputer", "label": "KNN Imputer (K-Nearest Neighbors)"},
    ]


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
    scaler: Optional[str] = None,
    imputer: Optional[str] = None,
) -> ColumnTransformer:
    """Construct an unfitted ColumnTransformer for *ctx*.

    Args:
        ctx: A :class:`~app.ml.dataset_loader.DatasetContext` describing the
             dataset's column schema.
        use_scaling: Boolean flag for backward compatibility. If False, overrides scaler to None.
        scaler: Human-readable or canonical scaler name (e.g. "MinMaxScaler", "RobustScaler", "StandardScaler", "None").
        imputer: Human-readable or canonical imputer name (e.g. "Median", "Mean", "Most Frequent", "Constant (0)", "KNN Imputer").

    Returns:
        An unfitted :class:`~sklearn.compose.ColumnTransformer` ready to be
        embedded into a :class:`~sklearn.pipeline.Pipeline` and fitted on
        training data.
    """
    transformers: List = []

    # Determine effective scaler instance
    effective_scaler_name = scaler if use_scaling else "None"
    scaler_instance = _create_scaler(effective_scaler_name)
    numeric_imputer_instance = _create_numeric_imputer(imputer)

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
            ("imputer", SimpleImputer(strategy="most_frequent")),
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
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("to_int", FunctionTransformer(_bool_to_int, validate=False)),
        ]
        if scaler_instance is not None:
            bool_steps.append(("scaler", scaler_instance))
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
        if scaler_instance is not None:
            dt_steps.append(("scaler", scaler_instance))
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
