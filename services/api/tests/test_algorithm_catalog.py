"""Focused unit tests for algorithm catalog, dependency handling, and preprocessing sanitization."""

from __future__ import annotations

from types import SimpleNamespace
import uuid
from unittest.mock import patch

import numpy as np
import pandas as pd
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.ml.algorithm_factory import (
    ALGORITHM_REGISTRY,
    AlgorithmConfigurationError,
    get_algorithm,
    get_supported_algorithms_catalog,
)
from app.ml.preprocessing import (
    detect_identifier_signals,
    sanitize_feature_columns,
)


def test_catalog_contains_all_20_algorithms():
    """Catalog must publish all 20 canonical algorithms with complete metadata."""
    catalog = get_supported_algorithms_catalog()
    assert len(catalog) == 20

    clf_items = [item for item in catalog if item["task_type"] == "classification"]
    reg_items = [item for item in catalog if item["task_type"] == "regression"]

    assert len(clf_items) == 10
    assert len(reg_items) == 10

    categories = {item["category"] for item in catalog}
    assert "tree" in categories
    assert "linear" in categories
    assert "boosting" in categories
    assert "kernel" in categories
    assert "distance" in categories
    assert "naive_bayes" in categories


def test_catalog_metadata_and_resource_constraints():
    """Specific estimators must declare appropriate capability flags and safe limits."""
    catalog_by_key = {item["key"]: item for item in get_supported_algorithms_catalog()}

    # SVC / SVR / KNN must have safe row caps due to O(N^2) / O(N^3) scaling
    assert catalog_by_key["support_vector_classifier"]["max_safe_rows"] == 5000
    assert catalog_by_key["support_vector_regressor"]["max_safe_rows"] == 5000
    assert catalog_by_key["k_nearest_neighbors_classifier"]["max_safe_rows"] == 5000
    assert catalog_by_key["k_nearest_neighbors_regressor"]["max_safe_rows"] == 5000

    # GaussianNB is linear O(N*D) so it should not have a 5k cap
    assert catalog_by_key["gaussian_nb"]["max_safe_rows"] is None

    # Tree and linear models have low/medium cost
    assert catalog_by_key["linear_regression"]["expected_cost"] == "low"
    assert catalog_by_key["random_forest_classifier"]["expected_cost"] == "medium"


def test_simulated_missing_dependency_behavior():
    """Simulated absence of optional libraries (xgboost/lightgbm) must fail gracefully."""
    with patch("app.ml.algorithm_factory.is_package_available", return_value=False):
        catalog = get_supported_algorithms_catalog()
        catalog_by_key = {item["key"]: item for item in catalog}

        # XGBoost and LightGBM should report is_available=False with clear reason
        xgb_clf = catalog_by_key["xgboost_classifier"]
        assert xgb_clf["is_available"] is False
        assert "not installed" in xgb_clf["unavailable_reason"]

        lgb_reg = catalog_by_key["lightgbm_regressor"]
        assert lgb_reg["is_available"] is False
        assert "not installed" in lgb_reg["unavailable_reason"]

        # Standard scikit-learn models must remain available
        assert catalog_by_key["random_forest_classifier"]["is_available"] is True

        # Factory instantiation should raise clear AlgorithmConfigurationError without crashing worker
        with pytest.raises(AlgorithmConfigurationError, match="requires 'xgboost'"):
            get_algorithm("xgboost_classifier", task_type="classification")


def test_multi_signal_identifier_detection():
    """Identifier detection must combine names, uniqueness ratios, sequentiality, and UUID patterns."""
    # 1. UUID column
    uuid_samples = [str(uuid.uuid4()) for _ in range(50)]
    res_uuid = detect_identifier_signals("session_token", uuid_samples, total_rows=50)
    assert res_uuid.is_identifier is True
    assert res_uuid.confidence in ("high", "medium")

    # 2. Sequential integer row ID
    seq_series = pd.Series(list(range(1, 101)), name="id")
    res_seq = detect_identifier_signals("id", seq_series, total_rows=100)
    assert res_seq.is_identifier is True

    # 3. Regular numeric feature with repeated values
    normal_numeric = pd.Series([10.5, 20.0, 10.5, 30.2, 20.0, 15.0, 10.5, 40.0] * 10, name="price")
    res_num = detect_identifier_signals("price", normal_numeric, total_rows=80)
    assert res_num.is_identifier is False

    # 4. Target Safety: Even if target has unique IDs, is_target_column is noted
    res_target = detect_identifier_signals("target_id", seq_series, total_rows=100, is_target=True)
    assert res_target.is_target_column is True


def test_feature_sanitization_rules():
    """Sanitizer must exclude 100% missing, constant, and identifier columns while preserving valid features."""
    df = pd.DataFrame({
        "row_id": list(range(1, 61)),
        "all_nan": [np.nan] * 60,
        "constant_col": ["fixed_val"] * 60,
        "valid_num": [float(i % 5) for i in range(60)],
        "valid_cat": ["cat_a" if i % 2 == 0 else "cat_b" for i in range(60)],
        "target": [0 if i < 30 else 1 for i in range(60)],
    })

    clean_features, exclusions = sanitize_feature_columns(df, target_column="target")

    assert "target" not in clean_features
    assert "valid_num" in clean_features
    assert "valid_cat" in clean_features

    excluded_names = {e.column_name for e in exclusions}
    assert "row_id" in excluded_names
    assert "all_nan" in excluded_names
    assert "constant_col" in excluded_names


@pytest.mark.asyncio
async def test_get_supported_algorithms_endpoint():
    """GET /api/v1/algorithms/supported must return 20 algorithms with auth dependency."""
    from app.dependencies import get_current_active_user, get_current_user

    fake_user = SimpleNamespace(
        id=uuid.uuid4(),
        email="test@example.com",
        organisation_id=uuid.uuid4(),
        role="DATA_SCIENTIST",
        is_active=True,
    )

    app.dependency_overrides[get_current_user] = lambda: fake_user
    app.dependency_overrides[get_current_active_user] = lambda: fake_user

    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/v1/algorithms/supported")
            assert resp.status_code == 200
            data = resp.json()
            assert data["total"] == 20
            assert len(data["algorithms"]) == 20
            first = data["algorithms"][0]
            assert "id" in first
            assert "category" in first
            assert "is_available" in first
            assert "expected_cost" in first
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_current_active_user, None)
