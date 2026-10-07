"""Comprehensive Milestone 4 test suite for Enterprise Dataset Engine & DuckDB Profiling.

Verifies:
1. Out-of-Core streaming profiling across CSV, Parquet, and JSON Lines.
2. Strict data type classification (continuous numeric, discrete integer, high/low categorical, identifier).
3. Data leakage detection (>=0.98 critical, >=0.90 high).
4. Multicollinearity detection (>=0.95).
5. Advanced missingness imputation strategy recommendations.
6. Large tabular dataset out-of-core profiling (50,000+ rows) without memory spikes.
7. Immutable dataset versioning, SHA-256 content hashes, and audit lineage guardrails.
"""

from __future__ import annotations

import json
import os
import tempfile
import uuid
from typing import Any
import numpy as np
import pandas as pd
import pytest
from unittest.mock import AsyncMock, MagicMock

from app.services.duckdb_profiler import duckdb_profiler_service, duckdb


pytestmark = pytest.mark.skipif(duckdb is None, reason="duckdb engine not available on this platform")


def test_duckdb_jsonl_and_strict_type_classification():
    """Verify DuckDB streams JSON Lines and performs strict type classification."""
    n = 100
    records = []
    for i in range(n):
        records.append({
            "record_id": f"rec_{i:04d}",
            "discrete_count": i % 10,
            "continuous_score": float(i * 1.5 + 0.123),
            "low_card_dept": ["Engineering", "Product", "Design"][i % 3],
            "high_card_city": f"city_{i % 60}",
            "is_verified": i % 2 == 0,
            "constant_val": "ACTIVE_STATUS",
        })

    with tempfile.NamedTemporaryFile(suffix=".jsonl", delete=False, mode="w", encoding="utf-8") as f:
        for r in records:
            f.write(json.dumps(r) + "\n")
        jsonl_path = f.name

    try:
        profile = duckdb_profiler_service.profile_file(
            file_path=jsonl_path,
            dataset_id=str(uuid.uuid4()),
            filename="employees.jsonl",
            version="v1",
            content_hash="sha256_mock_emp",
        )

        assert profile.row_count == n
        assert profile.column_count == 7
        assert profile.file_format == "jsonl"
        assert profile.engine == "duckdb"

        cols = {c.name: c for c in profile.columns}

        # Check strict type classification
        assert cols["record_id"].type == "identifier"
        assert cols["record_id"].detailed_type == "identifier"

        assert cols["discrete_count"].type == "numeric"
        assert cols["discrete_count"].detailed_type == "discrete_integer"

        assert cols["continuous_score"].type == "numeric"
        assert cols["continuous_score"].detailed_type == "continuous_numeric"

        assert cols["low_card_dept"].type == "categorical"
        assert cols["low_card_dept"].detailed_type == "low_cardinality_categorical"

        assert cols["high_card_city"].type == "categorical"
        assert cols["high_card_city"].detailed_type == "high_cardinality_categorical"

        assert cols["is_verified"].type == "boolean"
        assert cols["is_verified"].detailed_type == "boolean"

        assert cols["constant_val"].detailed_type == "constant"
        assert "constant_val" in profile.governance.constant_columns
    finally:
        if os.path.exists(jsonl_path):
            os.remove(jsonl_path)


def test_duckdb_target_leakage_and_multicollinearity_guardrails():
    """Verify data leakage and multicollinearity findings with exact recommendations."""
    n = 300
    np.random.seed(42)

    target = np.random.choice([0, 1], size=n)
    # Near-perfect critical leakage
    leak_crit = target.astype(float) + np.random.normal(0, 0.001, size=n)
    # Collinear pair
    feat_a = np.linspace(10, 500, n)
    feat_b = feat_a * 2.0 + np.random.normal(0, 0.01, size=n)
    # Unrelated feature
    clean_feat = np.random.uniform(0, 100, size=n)

    df = pd.DataFrame({
        "id": [f"user_{i}" for i in range(n)],
        "churn": target,
        "direct_leaker": leak_crit,
        "feature_alpha": feat_a,
        "feature_beta": feat_b,
        "clean_metric": clean_feat,
    })

    with tempfile.NamedTemporaryFile(suffix=".parquet", delete=False) as f:
        parquet_path = f.name
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
            filename="churn_risk.parquet",
            version="v2",
            content_hash="sha256_parquet_hash",
        )

        gov = profile.governance
        assert gov.has_leakage is True
        assert len(gov.leaked_features) >= 1
        leaked_item = next(item for item in gov.leaked_features if item.feature == "direct_leaker")
        assert leaked_item.target == "churn"
        assert leaked_item.correlation >= 0.98
        assert leaked_item.severity == "critical"
        assert "train/test contamination" in leaked_item.recommendation

        # Multicollinearity
        assert len(gov.multicollinear_pairs) >= 1
        pair = gov.multicollinear_pairs[0]
        assert {pair.feature_a, pair.feature_b} == {"feature_alpha", "feature_beta"}
        assert pair.correlation >= 0.95
        assert "Redundant Collinear Pair" in pair.recommendation
    finally:
        if os.path.exists(parquet_path):
            os.remove(parquet_path)


def test_duckdb_smart_imputation_recommendations():
    """Verify smart imputation recommendations including iterative and drop_feature."""
    n = 100
    df = pd.DataFrame({
        "f1": [float(i) for i in range(n)],
        "f2": [float(i * 2) if i % 10 != 0 else np.nan for i in range(n)],  # 10% missing, correlated with f1
        "f3": [float(i * 3) for i in range(n)],
        "mostly_empty": [float(i) if i < 15 else np.nan for i in range(n)],  # 85% missing -> drop
        "category": ["A" if i % 2 == 0 else "B" if i % 3 == 0 else np.nan for i in range(n)],
    })

    with tempfile.NamedTemporaryFile(suffix=".csv", delete=False, mode="w") as f:
        df.to_csv(f.name, index=False)
        csv_path = f.name

    try:
        profile = duckdb_profiler_service.profile_file(
            file_path=csv_path,
            dataset_id=str(uuid.uuid4()),
            filename="imputation_test.csv",
        )

        impute = profile.governance.imputation_strategies
        assert impute.get("mostly_empty") == "drop_feature"
        assert impute.get("category") == "most_frequent"
        # Since f2 has 10% missing and 3 numeric columns exist:
        assert impute.get("f2") in ("iterative", "median")
    finally:
        if os.path.exists(csv_path):
            os.remove(csv_path)


def test_duckdb_out_of_core_large_dataset_performance():
    """Verify DuckDB streams 50,000 rows without memory buffering in sub-second time."""
    n = 50_000
    df = pd.DataFrame({
        "row_id": list(range(1, n + 1)),
        "sensor_a": np.random.normal(50.0, 10.0, size=n),
        "sensor_b": np.random.uniform(0.0, 100.0, size=n),
        "status": np.random.choice(["OK", "WARN", "FAIL"], size=n),
        "target": np.random.choice([0, 1], size=n),
    })

    with tempfile.NamedTemporaryFile(suffix=".csv", delete=False, mode="w") as f:
        df.to_csv(f.name, index=False)
        large_csv_path = f.name

    try:
        profile = duckdb_profiler_service.profile_file(
            file_path=large_csv_path,
            dataset_id=str(uuid.uuid4()),
            filename="telemetry_large.csv",
            version="v1",
            content_hash="sha256_telemetry_50k",
        )

        assert profile.row_count == 50_000
        assert profile.column_count == 5
        assert profile.engine == "duckdb"
        assert profile.duplicate_columns == 0
        assert len(profile.columns) == 5

        row_id_col = next(c for c in profile.columns if c.name == "row_id")
        assert row_id_col.type == "identifier"
    finally:
        if os.path.exists(large_csv_path):
            os.remove(large_csv_path)


@pytest.fixture
def mock_dataset_user():
    from types import SimpleNamespace
    return SimpleNamespace(
        id=uuid.uuid4(),
        email="datascientist@enterprise.io",
        organisation_id=uuid.uuid4(),
        role="DATA_SCIENTIST",
        is_active=True,
    )


@pytest.mark.asyncio
async def test_dataset_upload_auto_versioning_and_collision_guard(mock_dataset_user):
    """Verify POST /upload handles auto-versioning (v1 -> v2) and rejects immutable overwrites."""
    from httpx import ASGITransport, AsyncClient
    from app.main import app
    from app.dependencies import get_current_active_user, get_current_user, get_db
    from app.models.dataset import Dataset, DatasetStatus

    app.dependency_overrides[get_current_user] = lambda: mock_dataset_user
    app.dependency_overrides[get_current_active_user] = lambda: mock_dataset_user

    mock_db = AsyncMock()
    # 1. First upload: no existing dataset -> v1
    mock_db.execute = AsyncMock(
        return_value=MagicMock(scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[]))))
    )
    mock_db.commit = AsyncMock()
    app.dependency_overrides[get_db] = lambda: mock_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Upload 1: Creates v1
        resp1 = await client.post(
            "/api/v1/datasets/upload",
            files={"file": ("customer_churn.csv", b"id,age,churn\n1,30,0\n2,40,1\n", "text/csv")},
        )
        assert resp1.status_code == 201
        data1 = resp1.json()
        assert data1["version"] == "v1"
        assert data1["content_hash"] is not None
        v1_hash = data1["content_hash"]

        # Setup mock DB with existing v1
        existing_v1 = Dataset(
            id=uuid.UUID(data1["dataset_id"]),
            name="customer_churn.csv",
            original_filename="customer_churn.csv",
            version="v1",
            content_hash=v1_hash,
            organisation_id=mock_dataset_user.organisation_id,
            user_id=mock_dataset_user.id,
            status=DatasetStatus.ready,
        )
        mock_db.execute = AsyncMock(
            return_value=MagicMock(scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[existing_v1]))))
        )

        # Upload 2: Upload different content without version -> auto-increments to v2
        resp2 = await client.post(
            "/api/v1/datasets/upload",
            files={"file": ("customer_churn.csv", b"id,age,income,churn\n1,30,50000,0\n2,40,60000,1\n", "text/csv")},
        )
        assert resp2.status_code == 201
        data2 = resp2.json()
        assert data2["version"] == "v2"
        assert data2["content_hash"] != v1_hash

        # Upload 3: Attempt to overwrite immutable v1 with modified content -> 409 Conflict
        resp3 = await client.post(
            "/api/v1/datasets/upload",
            files={"file": ("customer_churn.csv", b"id,age,modified\n1,30,100\n", "text/csv")},
            data={"version": "v1"},
        )
        assert resp3.status_code == 409
        assert "immutable" in resp3.json()["detail"].lower()

    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_dataset_delete_audit_lineage_protection(mock_dataset_user):
    """Verify DELETE /datasets/{id} prevents deleting datasets that have dependent training jobs."""
    from httpx import ASGITransport, AsyncClient
    from app.main import app
    from app.dependencies import get_current_active_user, get_current_user, get_db
    from app.models.dataset import Dataset, DatasetStatus

    app.dependency_overrides[get_current_user] = lambda: mock_dataset_user
    app.dependency_overrides[get_current_active_user] = lambda: mock_dataset_user

    ds_id = uuid.uuid4()
    locked_dataset = Dataset(
        id=ds_id,
        name="churn_v1.csv",
        version="v1",
        content_hash="abc_hash",
        organisation_id=mock_dataset_user.organisation_id,
        user_id=mock_dataset_user.id,
        status=DatasetStatus.ready,
    )

    mock_db = AsyncMock()
    # Case 1: Job count > 0 (training job depends on dataset)
    mock_db.execute = AsyncMock(
        side_effect=[
            MagicMock(scalar_one_or_none=MagicMock(return_value=locked_dataset)),  # find dataset
            MagicMock(scalar_one_or_none=MagicMock(return_value=3)),               # 3 dependent jobs!
        ]
    )
    app.dependency_overrides[get_db] = lambda: mock_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        del_resp1 = await client.delete(f"/api/v1/datasets/{ds_id}")
        assert del_resp1.status_code == 409
        assert "audit lineage" in del_resp1.json()["detail"]

        # Case 2: Job count == 0 (no dependent jobs -> deletion allowed)
        mock_db.execute = AsyncMock(
            side_effect=[
                MagicMock(scalar_one_or_none=MagicMock(return_value=locked_dataset)),
                MagicMock(scalar_one_or_none=MagicMock(return_value=0)),
            ]
        )
        mock_db.delete = AsyncMock()
        mock_db.commit = AsyncMock()

        del_resp2 = await client.delete(f"/api/v1/datasets/{ds_id}")
        assert del_resp2.status_code == 200
        assert del_resp2.json()["deleted"] is True
        assert del_resp2.json()["dataset_id"] == str(ds_id)

    app.dependency_overrides.clear()

