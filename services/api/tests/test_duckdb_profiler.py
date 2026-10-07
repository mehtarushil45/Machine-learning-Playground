"""Unit and integration tests for DuckDB out-of-core profiler and governance engine."""

from __future__ import annotations

import os
import tempfile
import uuid
import pandas as pd
import pytest

from app.services.duckdb_profiler import duckdb_profiler_service, duckdb

pytestmark = pytest.mark.skipif(duckdb is None, reason="duckdb engine not available on this platform")


def test_duckdb_profiler_csv_basic():
    """Verify DuckDB correctly profiles CSV and detects column types and stats."""
    with tempfile.NamedTemporaryFile(suffix=".csv", delete=False, mode="w") as f:
        df = pd.DataFrame({
            "age": [25, 30, 35, 40, 45],
            "income": [50000.0, 60000.0, 75000.0, 80000.0, 110000.0],
            "city": ["New York", "London", "Tokyo", "London", "Paris"],
            "is_active": [True, False, True, True, False],
            "user_id": [101, 102, 103, 104, 105],
        })
        df.to_csv(f.name, index=False)
        csv_path = f.name

    try:
        profile = duckdb_profiler_service.profile_file(
            file_path=csv_path,
            dataset_id=str(uuid.uuid4()),
            filename="customers.csv",
            version="v1",
            content_hash="abc123hash",
        )

        assert profile.row_count == 5
        assert profile.column_count == 5
        assert profile.file_format == "csv"
        assert profile.engine == "duckdb"
        assert profile.version == "v1"
        assert profile.content_hash == "abc123hash"

        cols_by_name = {c.name: c for c in profile.columns}
        assert cols_by_name["age"].type == "numeric"
        assert cols_by_name["income"].type == "numeric"
        assert cols_by_name["city"].type == "categorical"
        assert cols_by_name["user_id"].type == "identifier"

        assert cols_by_name["age"].statistics["mean"] == 35.0
        assert cols_by_name["age"].statistics["min"] == 25.0
        assert cols_by_name["age"].statistics["max"] == 45.0
    finally:
        if os.path.exists(csv_path):
            os.remove(csv_path)


def test_duckdb_profiler_parquet_and_leakage_detection():
    """Verify DuckDB correctly profiles Parquet, detects target leakage (>0.98), constant columns, and collinearity (>0.95)."""
    with tempfile.NamedTemporaryFile(suffix=".parquet", delete=False) as f:
        parquet_path = f.name

    # Create dataset with intentional leakage and multicollinearity
    n = 200
    target = [i % 2 for i in range(n)]
    # Feature leaking target almost 1-to-1
    leaking_feature = [float(t) + 0.001 * (i % 5) for i, t in enumerate(target)]
    # Collinear pair
    feat_x = [float(i * 2) for i in range(n)]
    feat_y = [float(i * 2) + 0.0001 for i in range(n)]
    # Constant col
    const_col = [99 for _ in range(n)]
    # Normal feature
    normal_feat = [float(i % 17) for i in range(n)]

    df = pd.DataFrame({
        "id": list(range(1, n + 1)),
        "target": target,
        "leaking_feature": leaking_feature,
        "feat_x": feat_x,
        "feat_y": feat_y,
        "constant_column": const_col,
        "normal_feat": normal_feat,
    })
    try:
        import duckdb
        conn = duckdb.connect()
        conn.register("df_data", df)
        safe_parquet_path = parquet_path.replace("\\", "/")
        conn.execute(f"COPY df_data TO '{safe_parquet_path}' (FORMAT PARQUET)")
        conn.close()
    except Exception:
        pytest.skip("DuckDB parquet write is unavailable in this environment")

    try:
        profile = duckdb_profiler_service.profile_file(
            file_path=parquet_path,
            dataset_id=str(uuid.uuid4()),
            filename="audit_data.parquet",
            version="v1",
            content_hash="sha256_mock_hash",
        )

        assert profile.row_count == n
        assert profile.column_count == 7
        assert profile.file_format == "parquet"
        assert profile.engine == "duckdb"

        gov = profile.governance
        assert gov.has_leakage is True
        assert len(gov.leaked_features) >= 1
        assert gov.leaked_features[0].feature == "leaking_feature"
        assert gov.leaked_features[0].correlation >= 0.98
        assert gov.leaked_features[0].severity == "critical"

        # Check multicollinear pairs
        assert len(gov.multicollinear_pairs) >= 1
        collinear_features = {gov.multicollinear_pairs[0].feature_a, gov.multicollinear_pairs[0].feature_b}
        assert "feat_x" in collinear_features and "feat_y" in collinear_features

        # Check constant columns
        assert "constant_column" in gov.constant_columns

        # Check identifier
        assert "id" in gov.identifier_columns
    finally:
        if os.path.exists(parquet_path):
            os.remove(parquet_path)


def test_duckdb_profiler_imputation_recommendations():
    """Verify imputation recommendations for missing values."""
    with tempfile.NamedTemporaryFile(suffix=".csv", delete=False, mode="w") as f:
        csv_path = f.name
        f.write("num_col,cat_col,empty_col\n")
        f.write("10,apple,\n")
        f.write(",banana,\n")
        f.write("30,,\n")
        f.write("40,apple,\n")
        f.write("50,orange,\n")

    try:
        profile = duckdb_profiler_service.profile_file(
            file_path=csv_path,
            dataset_id=str(uuid.uuid4()),
            filename="missing_test.csv",
        )

        gov = profile.governance
        assert "num_col" in gov.imputation_strategies
        assert gov.imputation_strategies["num_col"] == "median"

        assert "cat_col" in gov.imputation_strategies
        assert gov.imputation_strategies["cat_col"] == "most_frequent"

        assert "empty_col" in gov.imputation_strategies
        assert gov.imputation_strategies["empty_col"] == "drop_feature"
    finally:
        if os.path.exists(csv_path):
            os.remove(csv_path)
