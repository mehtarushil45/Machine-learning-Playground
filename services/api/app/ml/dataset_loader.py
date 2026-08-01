"""Dataset Loader — Sprint 3 Module 3.1.

Loads a CSV file by dataset_id, validates its structure, and produces a
DatasetContext value object that all downstream pipeline stages consume.

Design decisions:
- Delegates file-system path resolution to the worker's existing find_dataset_path()
  so there is exactly ONE source of truth for upload location.
- Delegates column-type inference to app.services.profiler.infer_column_type so
  the same logic is used everywhere in the platform.
- DatasetContext is a frozen dataclass — immutable after construction — so pipeline
  stages cannot accidentally mutate shared state.
"""

from __future__ import annotations

import logging
import os
import sys
from dataclasses import dataclass, field
from typing import List

import pandas as pd

# ---------------------------------------------------------------------------
# Ensure repo root is on sys.path so services.worker can be imported when the
# server is started from services/api/ (CWD = services/api/).
# ---------------------------------------------------------------------------
_repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
if _repo_root not in sys.path:
    sys.path.insert(0, _repo_root)

# Reuse the existing file-system helper — single source of truth.
from services.worker.core.dataset_loader import find_dataset_path  # noqa: E402

# Reuse the profiler's column-type inference — no duplicate logic.
from app.services.profiler import infer_column_type  # noqa: E402

logger = logging.getLogger("apex_ml.dataset_loader")


# ---------------------------------------------------------------------------
# Value object
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class DatasetContext:
    """Immutable snapshot of a loaded dataset ready for pipeline consumption.

    Attributes:
        dataset_id: Original dataset identifier supplied by the caller.
        file_path:  Absolute path to the CSV file on disk.
        dataframe:  Raw pandas DataFrame (columns unmodified).
        target_column: Name of the target / label column.
        feature_columns: Ordered list of feature column names to use.
        numeric_columns: Feature columns whose inferred type is "numeric".
        categorical_columns: Feature columns whose inferred type is "categorical".
        boolean_columns: Feature columns whose inferred type is "boolean".
        datetime_columns: Feature columns whose inferred type is "datetime".
        missing_per_column: Mapping of column name → count of missing values.
        row_count: Total number of rows in the raw dataframe.
        column_count: Total number of columns in the raw dataframe.
    """

    dataset_id: str
    file_path: str
    dataframe: pd.DataFrame
    target_column: str
    feature_columns: List[str]
    numeric_columns: List[str]
    categorical_columns: List[str]
    boolean_columns: List[str]
    datetime_columns: List[str]
    missing_per_column: dict
    row_count: int
    column_count: int

    # dataclass frozen=True prevents mutation but allows __hash__ on non-df fields.
    # pandas DataFrames are not hashable, so we suppress that here.
    def __hash__(self) -> int:
        return id(self)

    def __eq__(self, other: object) -> bool:
        return self is other


# ---------------------------------------------------------------------------
# Public loader function
# ---------------------------------------------------------------------------

class DatasetValidationError(ValueError):
    """Raised when the dataset fails structural validation."""


def load_dataset_context(
    dataset_id: str,
    target_column: str,
    feature_columns: List[str],
) -> DatasetContext:
    """Load a CSV by dataset_id, validate it, and return a DatasetContext.

    Args:
        dataset_id:      Identifier used to locate the CSV on disk.
        target_column:   Name of the label / target column.
        feature_columns: Requested feature columns (may be a subset of all columns).

    Returns:
        Populated :class:`DatasetContext`.

    Raises:
        DatasetValidationError: If the file cannot be loaded or required columns
            are absent.
        FileNotFoundError: If no CSV can be found for *dataset_id*.
    """
    logger.info("Loading dataset '%s'", dataset_id)

    # ── 1. Resolve file path ─────────────────────────────────────────────────
    file_path = find_dataset_path(dataset_id)
    if not os.path.exists(file_path):
        raise FileNotFoundError(
            f"No CSV file found for dataset_id='{dataset_id}'. "
            "Ensure the file was uploaded successfully."
        )

    # ── 2. Parse CSV ─────────────────────────────────────────────────────────
    try:
        df = pd.read_csv(file_path)
    except Exception as exc:
        raise DatasetValidationError(
            f"Failed to parse CSV for dataset '{dataset_id}': {exc}"
        ) from exc

    logger.info(
        "Loaded CSV '%s' — %d rows × %d columns",
        file_path,
        len(df),
        len(df.columns),
    )

    # ── 3. Resolve target column ──────────────────────────────────────────────
    if target_column not in df.columns:
        # Graceful fallback: use last column (mirrors worker behaviour)
        fallback = df.columns[-1]
        logger.warning(
            "Target column '%s' not found; falling back to '%s'",
            target_column,
            fallback,
        )
        target_column = fallback

    # ── 4. Resolve feature columns ────────────────────────────────────────────
    available = [c for c in feature_columns if c in df.columns and c != target_column]
    if not available:
        # Use all non-target columns as features
        available = [c for c in df.columns if c != target_column]
        logger.warning(
            "None of the requested feature columns exist; defaulting to all "
            "non-target columns: %s",
            available,
        )

    if not available:
        raise DatasetValidationError(
            f"Dataset '{dataset_id}' has no usable feature columns after "
            f"removing target column '{target_column}'."
        )

    # ── 5. Validate minimum row count ─────────────────────────────────────────
    if len(df) < 2:
        raise DatasetValidationError(
            f"Dataset '{dataset_id}' has only {len(df)} row(s). "
            "At least 2 rows are required for train/test split."
        )

    # ── 6. Detect column types via existing profiler logic ────────────────────
    # We operate on the feature subset only (never the target) so that target
    # type detection is handled by problem_detector.py independently.
    feature_df = df[available]

    numeric_cols: List[str] = []
    categorical_cols: List[str] = []
    boolean_cols: List[str] = []
    datetime_cols: List[str] = []

    for col_name in available:
        raw_values = feature_df[col_name].tolist()
        col_type = infer_column_type(col_name, raw_values)

        if col_type == "numeric":
            numeric_cols.append(col_name)
        elif col_type == "boolean":
            boolean_cols.append(col_name)
        elif col_type == "datetime":
            datetime_cols.append(col_name)
        else:
            # "categorical", "text", "identifier" → all treated as categorical
            # for preprocessing; problem_detector handles identifiers separately
            categorical_cols.append(col_name)

    logger.info(
        "Column classification — numeric: %d, categorical: %d, "
        "boolean: %d, datetime: %d",
        len(numeric_cols),
        len(categorical_cols),
        len(boolean_cols),
        len(datetime_cols),
    )

    # ── 7. Missing value counts ───────────────────────────────────────────────
    missing_per_column: dict = {
        col: int(df[col].isna().sum())
        for col in available + [target_column]
    }

    return DatasetContext(
        dataset_id=dataset_id,
        file_path=file_path,
        dataframe=df,
        target_column=target_column,
        feature_columns=available,
        numeric_columns=numeric_cols,
        categorical_columns=categorical_cols,
        boolean_columns=boolean_cols,
        datetime_columns=datetime_cols,
        missing_per_column=missing_per_column,
        row_count=len(df),
        column_count=len(df.columns),
    )
