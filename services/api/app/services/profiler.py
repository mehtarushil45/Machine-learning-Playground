"""Modular Dataset Profiler Engine.

Provides deterministic schema inference, statistical analysis, and quality auditing
for tabular datasets. Decoupled from specific file parsers (CSV, Excel, Parquet, SQL).
"""

from collections import Counter
import math
import re
from typing import Any, Sequence

from app.schemas.dataset import ColumnProfile, DatasetProfileResponse

# Datetime pattern matcher (ISO-8601, YYYY-MM-DD, MM/DD/YYYY, etc.)
DATETIME_REGEX = re.compile(
    r"^(\d{4}[-/]\d{1,2}[-/]\d{1,2}"  # YYYY-MM-DD
    r"|\d{1,2}[-/]\d{1,2}[-/]\d{4}"  # MM/DD/YYYY
    r"|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})"  # ISO 8601
)

# UUID / Hash pattern matcher
UUID_REGEX = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)


class TabularDataContainer:
    """Abstract container wrapping tabular dataset rows and columns."""

    def __init__(
        self,
        dataset_id: str,
        filename: str,
        columns: Sequence[str],
        rows: Sequence[dict[str, Any]],
        memory_usage_bytes: int = 0,
    ):
        self.dataset_id = dataset_id
        self.filename = filename
        self.columns = list(columns)
        self.rows = list(rows)
        self.memory_usage_bytes = memory_usage_bytes


def is_missing_value(val: Any) -> bool:
    """Return True if value represents a missing cell."""
    if val is None:
        return True
    if isinstance(val, float) and math.isnan(val):
        return True
    if isinstance(val, str):
        cleaned = val.strip().lower()
        if cleaned in ("", "null", "none", "nan", "n/a", "na", "#N/A", "undefined"):
            return True
    return False


def try_parse_numeric(val: Any) -> float | int | None:
    """Attempt to parse value into int or float."""
    if is_missing_value(val):
        return None
    if isinstance(val, (int, float)) and not isinstance(val, bool):
        return val
    if isinstance(val, str):
        try:
            cleaned = val.strip()
            if "." in cleaned or "e" in cleaned.lower():
                return float(cleaned)
            return int(cleaned)
        except ValueError:
            return None
    return None


def is_boolean_value(val: Any) -> bool:
    """Return True if value is a boolean or boolean string."""
    if isinstance(val, bool):
        return True
    if isinstance(val, str):
        return val.strip().lower() in ("true", "false", "yes", "no", "0", "1")
    return False


def infer_column_type(column_name: str, values: list[Any]) -> str:
    """Deterministically infer column type from non-missing cell values.

    Supported types: numeric, boolean, datetime, identifier, categorical, text.
    """
    non_missing = [v for v in values if not is_missing_value(v)]
    total_non_missing = len(non_missing)

    if total_non_missing == 0:
        return "text"

    col_name_lower = column_name.lower()

    # 1. Check Numeric
    numeric_parsed = [try_parse_numeric(v) for v in non_missing]
    numeric_count = sum(1 for n in numeric_parsed if n is not None)

    if numeric_count == total_non_missing:
        # Check if it's an Identifier (e.g., id, user_id, row_id with unique integers)
        unique_num_count = len(set(numeric_parsed))
        is_id_name = any(
            k in col_name_lower for k in ("id", "_id", "uuid", "key", "pk", "code")
        )
        if is_id_name and unique_num_count == total_non_missing and total_non_missing > 1:
            return "identifier"

        # Check if Boolean flags (0 or 1 only)
        num_set = set(numeric_parsed)
        if num_set.issubset({0, 1}) and (
            col_name_lower.startswith("is_")
            or col_name_lower.startswith("has_")
            or col_name_lower.endswith("_flag")
        ):
            return "boolean"

        return "numeric"

    # 2. Check Boolean
    bool_count = sum(1 for v in non_missing if is_boolean_value(v))
    if bool_count == total_non_missing:
        return "boolean"

    # 3. Check Datetime
    datetime_count = sum(
        1
        for v in non_missing
        if isinstance(v, str) and DATETIME_REGEX.match(v.strip())
    )
    if datetime_count / total_non_missing >= 0.85:
        return "datetime"

    # 4. Check Identifier (UUID or string IDs)
    string_values = [str(v).strip() for v in non_missing]
    unique_str_count = len(set(string_values))
    is_id_name = any(
        k in col_name_lower for k in ("id", "_id", "uuid", "key", "pk", "code")
    )
    uuid_count = sum(1 for s in string_values if UUID_REGEX.match(s))

    if (
        uuid_count / total_non_missing >= 0.8
        or (is_id_name and unique_str_count == total_non_missing)
        or (unique_str_count == total_non_missing and total_non_missing >= 10)
    ):
        return "identifier"

    # 5. Check Categorical vs Text
    uniqueness_ratio = unique_str_count / total_non_missing
    avg_len = sum(len(s) for s in string_values) / total_non_missing

    if unique_str_count <= 50 or (uniqueness_ratio <= 0.5 and avg_len <= 40):
        return "categorical"

    return "text"


def compute_numeric_statistics(numbers: list[float | int]) -> dict[str, Any]:
    """Calculate mean, median, std, min, max, variance for numeric series."""
    if not numbers:
        return {
            "mean": None,
            "median": None,
            "std": None,
            "min": None,
            "max": None,
            "variance": None,
        }

    floats = [float(n) for n in numbers]
    count = len(floats)
    min_val = min(floats)
    max_val = max(floats)
    mean_val = sum(floats) / count

    sorted_vals = sorted(floats)
    if count % 2 == 1:
        median_val = sorted_vals[count // 2]
    else:
        median_val = (sorted_vals[count // 2 - 1] + sorted_vals[count // 2]) / 2.0

    if count > 1:
        variance_val = sum((x - mean_val) ** 2 for x in floats) / (count - 1)
        std_val = math.sqrt(variance_val)
    else:
        variance_val = 0.0
        std_val = 0.0

    return {
        "mean": round(mean_val, 4),
        "median": round(median_val, 4),
        "std": round(std_val, 4),
        "min": round(min_val, 4),
        "max": round(max_val, 4),
        "variance": round(variance_val, 4),
    }


def compute_categorical_statistics(values: list[Any]) -> dict[str, Any]:
    """Calculate cardinality, mode, and sample values for non-numeric series."""
    str_vals = [str(v).strip() for v in values if not is_missing_value(v)]
    if not str_vals:
        return {
            "cardinality": 0,
            "most_frequent_value": None,
            "frequency_count": None,
            "sample_values": [],
        }

    counts = Counter(str_vals)
    most_common = counts.most_common(1)
    top_val, top_freq = most_common[0] if most_common else (None, 0)
    samples = list(dict.fromkeys(str_vals))[:5]

    return {
        "cardinality": len(counts),
        "most_frequent_value": top_val,
        "frequency_count": top_freq,
        "sample_values": samples,
    }


class DatasetProfilerService:
    """Core Profiling Engine for tabular datasets."""

    def profile(self, data: TabularDataContainer) -> DatasetProfileResponse:
        """Run modular profiling on the tabular dataset and return JSON schema."""
        row_count = len(data.rows)
        column_count = len(data.columns)

        # 1. Quality Analysis: Duplicate Rows
        row_tuples = []
        for r in data.rows:
            row_tuples.append(tuple(r.get(col) for col in data.columns))
        duplicate_rows = row_count - len(set(row_tuples)) if row_count > 0 else 0

        # 2. Quality Analysis: Duplicate Columns
        duplicate_columns = 0
        seen_headers = set()
        for col in data.columns:
            if col in seen_headers:
                duplicate_columns += 1
            else:
                seen_headers.add(col)

        # 3. Column Profiling Loop
        column_profiles: list[ColumnProfile] = []
        empty_columns_count = 0
        total_missing_values = 0

        for col_name in data.columns:
            col_values = [r.get(col_name) for r in data.rows]

            missing_cnt = sum(1 for v in col_values if is_missing_value(v))
            total_missing_values += missing_cnt

            if missing_cnt == row_count:
                empty_columns_count += 1

            missing_pct = (
                round((missing_cnt / row_count) * 100.0, 2) if row_count > 0 else 0.0
            )

            non_missing = [v for v in col_values if not is_missing_value(v)]
            unique_cnt = len(set(str(v) for v in non_missing))
            dup_cnt = row_count - unique_cnt if row_count > 0 else 0

            detected_type = infer_column_type(col_name, col_values)
            nullable = missing_cnt > 0

            # Calculate type-specific statistics
            if detected_type == "numeric":
                numeric_vals = [
                    n
                    for n in (try_parse_numeric(v) for v in col_values)
                    if n is not None
                ]
                stats = compute_numeric_statistics(numeric_vals)
            else:
                stats = compute_categorical_statistics(col_values)

            column_profiles.append(
                ColumnProfile(
                    name=col_name,
                    type=detected_type,
                    nullable=nullable,
                    missing=missing_cnt,
                    missing_percentage=missing_pct,
                    unique=unique_cnt,
                    duplicate_count=dup_cnt,
                    statistics=stats,
                )
            )

        # Estimate memory usage if size_bytes not supplied
        mem_bytes = data.memory_usage_bytes
        if mem_bytes <= 0:
            mem_bytes = sum(
                len(str(k)) + len(str(v)) for r in data.rows for k, v in r.items()
            )

        return DatasetProfileResponse(
            dataset_id=data.dataset_id,
            filename=data.filename,
            row_count=row_count,
            column_count=column_count,
            memory_usage_bytes=mem_bytes,
            duplicate_rows=duplicate_rows,
            duplicate_columns=duplicate_columns,
            empty_columns=empty_columns_count,
            total_missing_values=total_missing_values,
            columns=column_profiles,
        )


# Singleton instance
profiler_service = DatasetProfilerService()
