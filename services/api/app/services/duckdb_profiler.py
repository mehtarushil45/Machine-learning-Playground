"""Out-of-Core Dataset Profiler Engine using DuckDB.

Provides high-throughput, memory-mapped zero-copy profiling for tabular datasets
(Parquet, CSV, Compressed CSV). Never buffers gigabytes of raw data into Python RAM.
Automatically detects Target Leakage, Multicollinearity, Constant Columns,
and recommends Imputation Strategies.
"""

from __future__ import annotations

import logging
import math
import os
import re
from typing import Any

try:
    import duckdb
except ImportError:
    duckdb = None  # type: ignore

from app.schemas.dataset import (
    ColumnProfile,
    DataGovernanceReport,
    DataLeakageFinding,
    DatasetProfileResponse,
    MulticollinearityFinding,
)

logger = logging.getLogger("apex_ingestion.duckdb_profiler")

DATETIME_REGEX = re.compile(
    r"^(\d{4}[-/]\d{1,2}[-/]\d{1,2}"
    r"|\d{1,2}[-/]\d{1,2}[-/]\d{4}"
    r"|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})"
)
UUID_REGEX = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)

TARGET_CANDIDATE_NAMES = {
    "target", "label", "class", "churn", "y", "outcome", "survived",
    "is_churn", "default", "price", "status", "fraud", "churn_risk",
}


def escape_sql_identifier(identifier: str) -> str:
    """Safely escape column identifier for DuckDB SQL."""
    escaped = identifier.replace('"', '""')
    return f'"{escaped}"'


class DuckDBProfilerEngine:
    """Out-of-Core Profiling Engine backed by DuckDB."""

    def __init__(self) -> None:
        pass

    def profile_file(
        self,
        file_path: str,
        dataset_id: str,
        filename: str,
        version: str = "v1",
        content_hash: str | None = None,
    ) -> DatasetProfileResponse:
        """Profile CSV or Parquet file out-of-core using streaming DuckDB engine."""
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Dataset file not found: {file_path}")

        if duckdb is None:
            raise RuntimeError("DuckDB engine is not installed. Install duckdb to enable out-of-core profiling.")

        file_size_bytes = os.path.getsize(file_path)
        path_lower = file_path.lower()
        is_parquet = path_lower.endswith((".parquet", ".pq"))
        is_json = path_lower.endswith((".json", ".jsonl", ".ndjson"))
        if is_parquet:
            file_format = "parquet"
        elif is_json:
            file_format = "jsonl"
        else:
            file_format = "csv"

        # Create thread-safe in-memory DuckDB connection
        con = duckdb.connect(database=":memory:")
        try:
            # Set modest memory limit to guarantee zero host OOM
            con.execute("SET memory_limit = '1GB';")
            con.execute("SET threads = 4;")

            # Register view to stream data from disk
            sql_escaped_path = file_path.replace("'", "''")
            if is_parquet:
                scan_clause = f"read_parquet('{sql_escaped_path}')"
            elif is_json:
                scan_clause = f"read_json_auto('{sql_escaped_path}')"
            else:
                scan_clause = f"read_csv_auto('{sql_escaped_path}', sample_size=20000, ignore_errors=true)"

            con.execute(f"CREATE VIEW dataset_view AS SELECT * FROM {scan_clause};")

            # 1. Basic Dimensions
            row_count_res = con.execute("SELECT COUNT(*) FROM dataset_view;").fetchone()
            row_count = int(row_count_res[0]) if row_count_res is not None else 0
            columns_desc = con.execute("DESCRIBE dataset_view;").fetchall()
            # columns_desc is [(col_name, col_type, null, key, default, extra), ...]
            column_names = [row[0] for row in columns_desc]
            column_types_raw = {row[0]: row[1].upper() for row in columns_desc}
            column_count = len(column_names)

            if row_count == 0 or column_count == 0:
                return DatasetProfileResponse(
                    dataset_id=dataset_id,
                    filename=filename,
                    row_count=row_count,
                    column_count=column_count,
                    file_format=file_format,
                    engine="duckdb",
                    version=version,
                    content_hash=content_hash,
                    memory_usage_bytes=file_size_bytes,
                    duplicate_rows=0,
                    duplicate_columns=0,
                    empty_columns=column_count,
                    total_missing_values=0,
                    columns=[],
                    governance=DataGovernanceReport(),
                )

            # 2. Duplicate rows estimate/computation
            duplicate_rows = 0
            if row_count > 0:
                try:
                    escaped_cols = ", ".join(escape_sql_identifier(c) for c in column_names)
                    distinct_res = con.execute(
                        f"SELECT COUNT(*) FROM (SELECT DISTINCT {escaped_cols} FROM dataset_view);"
                    ).fetchone()
                    distinct_rows = int(distinct_res[0]) if distinct_res is not None else row_count
                    duplicate_rows = max(0, row_count - distinct_rows)
                except Exception as exc:
                    logger.debug("Distinct row count skipped or failed: %s", exc)
                    duplicate_rows = 0

            # 3. Column Profiling
            column_profiles: list[ColumnProfile] = []
            empty_columns_count = 0
            total_missing_values = 0
            numeric_columns: list[str] = []
            constant_columns: list[str] = []
            identifier_columns: list[str] = []
            imputation_strategies: dict[str, str] = {}

            for col_name in column_names:
                escaped_col = escape_sql_identifier(col_name)
                duck_type = column_types_raw.get(col_name, "VARCHAR")
                col_name_lower = col_name.lower()

                # Missing & Distinct counts
                stats_query = f"""
                    SELECT 
                        COUNT(*) - COUNT({escaped_col}) AS missing_cnt,
                        COUNT(DISTINCT {escaped_col}) AS unique_cnt
                    FROM dataset_view;
                """
                stats_res = con.execute(stats_query).fetchone()
                if stats_res is not None:
                    missing_cnt = int(stats_res[0] or 0)
                    unique_cnt = int(stats_res[1] or 0)
                else:
                    missing_cnt = 0
                    unique_cnt = 0
                total_missing_values += missing_cnt

                if missing_cnt == row_count:
                    empty_columns_count += 1

                missing_pct = round((missing_cnt / row_count) * 100.0, 2) if row_count > 0 else 0.0
                dup_cnt = max(0, row_count - unique_cnt)

                # Determine classified column type & detailed sub-type
                is_integer = any(
                    t in duck_type
                    for t in (
                        "INT", "HUGEINT", "TINYINT", "BIGINT", "SMALLINT",
                        "UBIGINT", "UINTEGER", "USMALLINT", "UTINYINT",
                    )
                )
                is_float = any(
                    t in duck_type
                    for t in ("FLOAT", "DOUBLE", "DECIMAL", "NUMERIC", "REAL")
                )
                is_numeric_type = is_integer or is_float
                is_bool_type = "BOOL" in duck_type
                is_date_type = any(t in duck_type for t in ("DATE", "TIME", "TIMESTAMP"))

                # Constant check
                if unique_cnt <= 1:
                    constant_columns.append(col_name)

                # Strict type classification
                detected_type = "text"
                detailed_type = "free_text"

                if is_numeric_type:
                    is_id_name = any(k in col_name_lower for k in ("id", "_id", "uuid", "pk", "key", "code"))
                    if is_id_name and unique_cnt == row_count and row_count > 1:
                        detected_type = "identifier"
                        detailed_type = "identifier"
                        identifier_columns.append(col_name)
                    elif unique_cnt <= 2 and (
                        col_name_lower.startswith("is_") or col_name_lower.startswith("has_") or col_name_lower.endswith("_flag")
                    ):
                        detected_type = "boolean"
                        detailed_type = "boolean"
                    elif is_integer:
                        detected_type = "numeric"
                        detailed_type = "discrete_integer"
                        numeric_columns.append(col_name)
                    else:
                        detected_type = "numeric"
                        detailed_type = "continuous_numeric"
                        numeric_columns.append(col_name)
                elif is_bool_type:
                    detected_type = "boolean"
                    detailed_type = "boolean"
                elif is_date_type:
                    detected_type = "datetime"
                    detailed_type = "datetime"
                else:
                    is_id_name = any(k in col_name_lower for k in ("id", "_id", "uuid", "pk", "key", "code"))
                    if unique_cnt == row_count and (is_id_name or row_count >= 10):
                        detected_type = "identifier"
                        detailed_type = "identifier"
                        identifier_columns.append(col_name)
                    elif unique_cnt <= 50:
                        detected_type = "categorical"
                        detailed_type = "low_cardinality_categorical"
                    elif row_count > 0 and (unique_cnt < row_count) and (
                        (unique_cnt / row_count) <= 0.85
                        or any(k in col_name_lower for k in ("cat", "city", "state", "dept", "tag", "status", "type", "group", "class", "country", "code", "segment", "region"))
                    ):
                        detected_type = "categorical"
                        detailed_type = "high_cardinality_categorical"
                    else:
                        detected_type = "text"
                        detailed_type = "free_text"

                if unique_cnt <= 1 and col_name not in identifier_columns:
                    detailed_type = "constant"

                # Compute statistics
                stats: dict[str, Any] = {}
                if detected_type == "numeric":
                    num_stats_query = f"""
                        SELECT 
                            AVG({escaped_col}) AS mean_val,
                            STDDEV_SAMP({escaped_col}) AS std_val,
                            MIN({escaped_col}) AS min_val,
                            MAX({escaped_col}) AS max_val,
                            VARIANCE({escaped_col}) AS var_val,
                            MEDIAN({escaped_col}) AS median_val
                        FROM dataset_view
                        WHERE {escaped_col} IS NOT NULL;
                    """
                    num_stats_res = con.execute(num_stats_query).fetchone()
                    if num_stats_res is not None:
                        mean_val, std_val, min_val, max_val, var_val, med_val = num_stats_res
                    else:
                        mean_val, std_val, min_val, max_val, var_val, med_val = None, None, None, None, None, None

                    def _safe_float(v: Any) -> float | None:
                        if v is None:
                            return None
                        try:
                            f = float(v)
                            return None if (math.isnan(f) or math.isinf(f)) else round(f, 4)
                        except (ValueError, TypeError):
                            return None

                    stats = {
                        "mean": _safe_float(mean_val),
                        "median": _safe_float(med_val),
                        "std": _safe_float(std_val) or 0.0,
                        "min": _safe_float(min_val),
                        "max": _safe_float(max_val),
                        "variance": _safe_float(var_val) or 0.0,
                    }
                else:
                    # Categorical / string stats
                    mode_query = f"""
                        SELECT {escaped_col}::VARCHAR AS val, COUNT(*) AS cnt
                        FROM dataset_view
                        WHERE {escaped_col} IS NOT NULL
                        GROUP BY {escaped_col}
                        ORDER BY cnt DESC
                        LIMIT 5;
                    """
                    top_rows = con.execute(mode_query).fetchall()
                    top_val = str(top_rows[0][0]) if top_rows else None
                    top_cnt = int(top_rows[0][1]) if top_rows else None
                    samples = [str(r[0]) for r in top_rows]

                    stats = {
                        "cardinality": unique_cnt,
                        "most_frequent_value": top_val,
                        "frequency_count": top_cnt,
                        "sample_values": samples,
                    }

                stats["detailed_type"] = detailed_type

                # Imputation strategy recommendation
                if missing_cnt > 0:
                    if missing_pct > 60.0:
                        imputation_strategies[col_name] = "drop_feature"
                    elif detected_type == "numeric":
                        if 5.0 <= missing_pct <= 40.0 and len(numeric_columns) >= 3:
                            imputation_strategies[col_name] = "iterative"
                        else:
                            imputation_strategies[col_name] = "median"
                    elif detected_type in ("categorical", "boolean"):
                        imputation_strategies[col_name] = "most_frequent"
                    elif detected_type == "datetime":
                        imputation_strategies[col_name] = "forward_fill"
                    else:
                        imputation_strategies[col_name] = "constant_impute"

                column_profiles.append(
                    ColumnProfile(
                        name=col_name,
                        type=detected_type,
                        detailed_type=detailed_type,
                        nullable=missing_cnt > 0,
                        missing=missing_cnt,
                        missing_percentage=missing_pct,
                        unique=unique_cnt,
                        duplicate_count=dup_cnt,
                        statistics=stats,
                    )
                )

            # 4. Governance & Data Leakage Detection
            leaked_features: list[DataLeakageFinding] = []
            multicollinear_pairs: list[MulticollinearityFinding] = []

            # Identify target column candidates
            candidate_target = None
            for c in column_names:
                if c.lower() in TARGET_CANDIDATE_NAMES:
                    candidate_target = c
                    break

            # If no obvious name, check if last column is numeric or binary
            if not candidate_target and len(column_names) > 1:
                last_col = column_names[-1]
                if last_col in numeric_columns:
                    candidate_target = last_col

            # Target Leakage correlation scan
            if candidate_target and candidate_target in numeric_columns:
                escaped_target = escape_sql_identifier(candidate_target)
                for num_col in numeric_columns:
                    if num_col == candidate_target:
                        continue
                    try:
                        escaped_num = escape_sql_identifier(num_col)
                        corr_res = con.execute(
                            f"SELECT corr({escaped_num}, {escaped_target}) FROM dataset_view;"
                        ).fetchone()
                        corr_val = corr_res[0] if corr_res is not None else None

                        if corr_val is not None:
                            abs_corr = abs(float(corr_val))
                            if abs_corr >= 0.98:
                                leaked_features.append(
                                    DataLeakageFinding(
                                        feature=num_col,
                                        target=candidate_target,
                                        correlation=round(abs_corr, 4),
                                        severity="critical",
                                        recommendation=f"Critical Target Leakage (r={round(abs_corr, 4)}). Feature has near-perfect correlation with target; drop immediately to avoid train/test contamination.",
                                    )
                                )
                            elif abs_corr >= 0.90:
                                leaked_features.append(
                                    DataLeakageFinding(
                                        feature=num_col,
                                        target=candidate_target,
                                        correlation=round(abs_corr, 4),
                                        severity="high",
                                        recommendation=f"High Risk Proxy Leakage (r={round(abs_corr, 4)}). Inspect feature to confirm it is available before outcome occurs.",
                                    )
                                )
                    except Exception as corr_exc:
                        logger.debug("Leakage corr query failed for %s: %s", num_col, corr_exc)

            # Categorical association scan (Cramér's V) to catch derived categorical leakage
            if candidate_target:
                escaped_target = escape_sql_identifier(candidate_target)
                for cat_col in categorical_columns:
                    if cat_col == candidate_target:
                        continue
                    try:
                        escaped_cat = escape_sql_identifier(cat_col)
                        ct_query = f"""
                            SELECT {escaped_cat}::VARCHAR, {escaped_target}::VARCHAR, COUNT(*) 
                            FROM (SELECT * FROM dataset_view LIMIT 10000)
                            WHERE {escaped_cat} IS NOT NULL AND {escaped_target} IS NOT NULL
                            GROUP BY 1, 2;
                        """
                        ct_rows = con.execute(ct_query).fetchall()
                        contingency = {(str(r[0]), str(r[1])): int(r[2]) for r in ct_rows}
                        from app.services.learning_rules import compute_cramers_v_from_contingency
                        v_score = compute_cramers_v_from_contingency(contingency)
                        if v_score >= 0.95:
                            leaked_features.append(
                                DataLeakageFinding(
                                    feature=cat_col,
                                    target=candidate_target,
                                    correlation=round(v_score, 4),
                                    severity="critical",
                                    recommendation=f"Critical Categorical Leakage (Cramér's V={round(v_score, 4)}). Feature nearly deterministically encodes the target; drop immediately.",
                                )
                            )
                        elif v_score >= 0.85:
                            leaked_features.append(
                                DataLeakageFinding(
                                    feature=cat_col,
                                    target=candidate_target,
                                    correlation=round(v_score, 4),
                                    severity="high",
                                    recommendation=f"High Risk Categorical Association (Cramér's V={round(v_score, 4)}). Inspect feature to confirm it is not a derived outcome code.",
                                )
                            )
                    except Exception as cat_exc:
                        logger.debug("Categorical Cramers V scan failed for %s: %s", cat_col, cat_exc)

            # Multicollinearity scan across numeric pairs (cap at first 20 numeric columns for speed)
            tested_numeric = numeric_columns[:20]
            for i in range(len(tested_numeric)):
                for j in range(i + 1, len(tested_numeric)):
                    col_a = tested_numeric[i]
                    col_b = tested_numeric[j]
                    if col_a == candidate_target or col_b == candidate_target:
                        continue
                    try:
                        escaped_a = escape_sql_identifier(col_a)
                        escaped_b = escape_sql_identifier(col_b)
                        pair_res = con.execute(
                            f"SELECT corr({escaped_a}, {escaped_b}) FROM dataset_view;"
                        ).fetchone()
                        pair_corr = pair_res[0] if pair_res is not None else None
                        if pair_corr is not None:
                            abs_pair_corr = abs(float(pair_corr))
                            if abs_pair_corr >= 0.95:
                                multicollinear_pairs.append(
                                    MulticollinearityFinding(
                                        feature_a=col_a,
                                        feature_b=col_b,
                                        correlation=round(abs_pair_corr, 4),
                                        recommendation=f"Redundant Collinear Pair (r={round(abs_pair_corr, 4)}). Features share almost identical variance; consider dropping '{col_b}' to stabilize coefficients.",
                                    )
                                )
                    except Exception as pair_exc:
                        logger.debug("Pair corr failed: %s", pair_exc)

            governance = DataGovernanceReport(
                has_leakage=len(leaked_features) > 0,
                leaked_features=leaked_features,
                multicollinear_pairs=multicollinear_pairs,
                constant_columns=list(set(constant_columns)),
                identifier_columns=list(set(identifier_columns)),
                imputation_strategies=imputation_strategies,
            )

            return DatasetProfileResponse(
                dataset_id=dataset_id,
                filename=filename,
                row_count=row_count,
                column_count=column_count,
                file_format=file_format,
                engine="duckdb",
                version=version,
                content_hash=content_hash,
                memory_usage_bytes=file_size_bytes,
                duplicate_rows=duplicate_rows,
                duplicate_columns=0,
                empty_columns=empty_columns_count,
                total_missing_values=total_missing_values,
                columns=column_profiles,
                governance=governance,
            )

        finally:
            con.close()


duckdb_profiler_service = DuckDBProfilerEngine()
