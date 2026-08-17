"""End-to-end integration and schema contract tests for Phase 6 training orchestration."""

import os
import uuid
import pytest
import pandas as pd
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.main import app
from app.ml.dataset_loader import DatasetValidationError, load_dataset_context, read_dataset_header
from app.models.dataset import Dataset, DatasetStatus
from app.models.organisation import Organisation
from app.models.recommendation import RecommendationJob, RecommendationJobStatus
from app.models.user import User
from app.schemas.job import TrainingRequest
from app.services.job_service import job_service


@pytest.fixture
def sample_csv_dataset(tmp_path):
    """Create a sample CSV dataset on disk for testing."""
    uploads_dir = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "uploads")
    )
    os.makedirs(uploads_dir, exist_ok=True)
    dataset_id = f"test-contract-{uuid.uuid4().hex[:8]}"
    file_path = os.path.join(uploads_dir, f"{dataset_id}.csv")

    df = pd.DataFrame({
        "feature_a": [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0],
        "feature_b": [10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0, 90.0, 100.0],
        "feature_c": ["cat", "dog", "cat", "dog", "cat", "dog", "cat", "dog", "cat", "dog"],
        "target": [0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
    })
    df.to_csv(file_path, index=False)
    yield dataset_id, file_path
    if os.path.exists(file_path):
        os.remove(file_path)


def test_read_dataset_header_lightweight(sample_csv_dataset):
    """Verify read_dataset_header only reads the column names without loading rows."""
    dataset_id, _ = sample_csv_dataset
    header = read_dataset_header(dataset_id)
    assert header == ["feature_a", "feature_b", "feature_c", "target"]


def test_strict_dataset_loader_rejects_missing_target(sample_csv_dataset):
    """Verify load_dataset_context raises DatasetValidationError when target is missing (no silent fallback)."""
    dataset_id, _ = sample_csv_dataset
    with pytest.raises(DatasetValidationError, match="Target column 'nonexistent_target' does not exist"):
        load_dataset_context(
            dataset_id=dataset_id,
            target_column="nonexistent_target",
            feature_columns=["feature_a", "feature_b"],
        )


def test_strict_dataset_loader_rejects_missing_feature(sample_csv_dataset):
    """Verify load_dataset_context raises DatasetValidationError when a feature is missing (no fallback to all)."""
    dataset_id, _ = sample_csv_dataset
    with pytest.raises(DatasetValidationError, match="Requested feature column\\(s\\) not found"):
        load_dataset_context(
            dataset_id=dataset_id,
            target_column="target",
            feature_columns=["feature_a", "missing_feat"],
        )


def test_strict_dataset_loader_rejects_target_in_features(sample_csv_dataset):
    """Verify load_dataset_context rejects target column inside features."""
    dataset_id, _ = sample_csv_dataset
    with pytest.raises(DatasetValidationError, match="cannot be included inside feature columns"):
        load_dataset_context(
            dataset_id=dataset_id,
            target_column="target",
            feature_columns=["feature_a", "target"],
        )


def test_strict_dataset_loader_rejects_empty_features(sample_csv_dataset):
    """Verify load_dataset_context rejects empty feature list."""
    dataset_id, _ = sample_csv_dataset
    with pytest.raises(DatasetValidationError, match="Feature columns list cannot be empty"):
        load_dataset_context(
            dataset_id=dataset_id,
            target_column="target",
            feature_columns=[],
        )


@pytest.mark.asyncio
async def test_job_service_resolves_feature_selection_all(sample_csv_dataset):
    """Verify feature_selection='all' resolves and persists the exact non-target feature list."""
    dataset_id, _ = sample_csv_dataset
    req = TrainingRequest(
        dataset_id=dataset_id,
        target_column="target",
        feature_columns=["feature_a"],  # placeholder that will be resolved to all non-target
        algorithm="random_forest_classifier",
        feature_selection="all",
    )
    # Clear feature_columns to test 'all' resolution
    req.feature_columns = []
    
    resp = await job_service.create_job(req, user_id=str(uuid.uuid4()), db=None)
    assert resp.status == "QUEUED"
    assert resp.feature_columns == ["feature_a", "feature_b", "feature_c"]
    assert resp.target_column == "target"
    assert resp.metadata["feature_columns"] == ["feature_a", "feature_b", "feature_c"]


@pytest.mark.asyncio
async def test_job_service_rejects_unknown_feature_in_request(sample_csv_dataset):
    """Verify job_service rejects unknown feature column before job creation."""
    dataset_id, _ = sample_csv_dataset
    req = TrainingRequest(
        dataset_id=dataset_id,
        target_column="target",
        feature_columns=["feature_a", "totally_fake_col"],
        algorithm="random_forest_classifier",
        feature_selection="manual",
    )
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc_info:
        await job_service.create_job(req, user_id=str(uuid.uuid4()), db=None)
    assert exc_info.value.status_code == 422
    assert "totally_fake_col" in exc_info.value.detail


@pytest.mark.asyncio
async def test_job_service_rejects_missing_dataset():
    """Verify job_service returns 404 when dataset does not exist."""
    req = TrainingRequest(
        dataset_id="nonexistent-dataset-id",
        target_column="target",
        feature_columns=["feature_a"],
        algorithm="random_forest_classifier",
    )
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc_info:
        await job_service.create_job(req, user_id=str(uuid.uuid4()), db=None)
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_job_service_recommendation_provenance_validation(sample_csv_dataset):
    """Verify provenance checks: matching recommendation succeeds, mismatched/stale fails."""
    from unittest.mock import AsyncMock, MagicMock, patch
    from fastapi import HTTPException

    dataset_id, _ = sample_csv_dataset
    org_id = uuid.uuid4()
    user_id = uuid.uuid4()
    dataset_uuid = uuid.uuid4()
    rec_job_id = uuid.uuid4()

    rec_job = RecommendationJob(
        id=rec_job_id,
        organisation_id=org_id,
        user_id=user_id,
        dataset_id=dataset_uuid,
        status=RecommendationJobStatus.COMPLETED.value,
        cache_key=f"cache-{rec_job_id.hex[:12]}",
        request_config={
            "target_column": "target",
            "feature_columns": ["feature_a", "feature_b"],
            "cv_folds": 5,
            "train_test_split": 0.8,
        },
        recommendation={
            "algorithm_id": "gradient_boosting_classifier",
            "display_name": "Gradient Boosting",
            "score": 0.95,
            "metric": "roc_auc",
        },
    )

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = rec_job
    mock_db.execute.return_value = mock_result
    mock_db.commit = AsyncMock()
    mock_db.refresh = AsyncMock()
    mock_db.add = MagicMock()

    # 1. Valid recommendation provenance
    valid_req = TrainingRequest(
        dataset_id=str(dataset_uuid),
        target_column="target",
        feature_columns=["feature_a", "feature_b"],
        algorithm="gradient_boosting_classifier",
        recommendation_job_id=str(rec_job_id),
        selection_source="recommended",
    )
    with patch("app.services.job_service.read_dataset_header", return_value=["feature_a", "feature_b", "target"]), \
         patch("app.services.job_service.find_dataset_path", return_value=sample_csv_dataset[1]):
        job_resp = await job_service.create_job(
            valid_req,
            user_id=str(user_id),
            organisation_id=str(org_id),
            db=mock_db,
        )
        assert job_resp.status == "QUEUED"
        assert job_resp.metadata["recommendation_job_id"] == str(rec_job_id)
        assert job_resp.metadata["selection_source"] == "recommended"

    # 2. Algorithm mismatch with selection_source='recommended' -> 422
    mismatched_algo_req = TrainingRequest(
        dataset_id=str(dataset_uuid),
        target_column="target",
        feature_columns=["feature_a", "feature_b"],
        algorithm="logistic_regression",  # Different from gradient_boosting_classifier
        recommendation_job_id=str(rec_job_id),
        selection_source="recommended",
    )
    with patch("app.services.job_service.read_dataset_header", return_value=["feature_a", "feature_b", "target"]), \
         patch("app.services.job_service.find_dataset_path", return_value=sample_csv_dataset[1]):
        with pytest.raises(HTTPException) as exc_info:
            await job_service.create_job(
                mismatched_algo_req,
                user_id=str(user_id),
                organisation_id=str(org_id),
                db=mock_db,
            )
        assert exc_info.value.status_code == 422
        assert "does not match recommended algorithm" in exc_info.value.detail

    # 3. Manual override with recommendation_job_id -> succeeds with selection_source='manual'
    manual_req = TrainingRequest(
        dataset_id=str(dataset_uuid),
        target_column="target",
        feature_columns=["feature_a", "feature_b"],
        algorithm="logistic_regression",
        recommendation_job_id=str(rec_job_id),
        selection_source="manual",
    )
    with patch("app.services.job_service.read_dataset_header", return_value=["feature_a", "feature_b", "target"]), \
         patch("app.services.job_service.find_dataset_path", return_value=sample_csv_dataset[1]):
        manual_resp = await job_service.create_job(
            manual_req,
            user_id=str(user_id),
            organisation_id=str(org_id),
            db=mock_db,
        )
        assert manual_resp.status == "QUEUED"
        assert manual_resp.metadata["selection_source"] == "manual"
        assert manual_resp.metadata["recommendation_job_id"] == str(rec_job_id)

    # 4. Cross-organisation / nonexistent recommendation_job_id -> 404
    mock_not_found = MagicMock()
    mock_not_found.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = mock_not_found

    with patch("app.services.job_service.read_dataset_header", return_value=["feature_a", "feature_b", "target"]), \
         patch("app.services.job_service.find_dataset_path", return_value=sample_csv_dataset[1]):
        with pytest.raises(HTTPException) as exc_info:
            await job_service.create_job(
                valid_req,
                user_id=str(user_id),
                organisation_id=str(uuid.uuid4()),
                db=mock_db,
            )
        assert exc_info.value.status_code == 404
