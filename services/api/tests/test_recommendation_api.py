"""API integration tests for authenticated, organisation-scoped algorithm recommendation endpoints."""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.dependencies import get_current_active_user, get_current_user, get_db
from app.main import app
from app.models.dataset import Dataset, DatasetStatus
from app.models.organisation import Organisation
from app.models.recommendation import RecommendationJob, RecommendationJobStatus
from app.models.user import User


@pytest.fixture
def mock_auth_user():
    org_id = uuid.uuid4()
    user_id = uuid.uuid4()
    return SimpleNamespace(
        id=user_id,
        email="testuser@example.com",
        organisation_id=org_id,
        role="DATA_SCIENTIST",
        is_active=True,
    )


@pytest.mark.asyncio
async def test_create_recommendation_job_authenticated_success(mock_auth_user):
    """POST /api/v1/datasets/{id}/recommendations creates and queues a new job, returning 202."""
    dataset_id = uuid.uuid4()
    fake_dataset = Dataset(
        id=dataset_id,
        name="iris.csv",
        organisation_id=mock_auth_user.organisation_id,
        user_id=mock_auth_user.id,
        status=DatasetStatus.ready,
    )

    mock_db = AsyncMock()
    mock_db.execute = AsyncMock(
        side_effect=[
            # 1. Query dataset
            MagicMock(scalar_one_or_none=MagicMock(return_value=fake_dataset)),
            # 2. Check completed cache
            MagicMock(scalar_one_or_none=MagicMock(return_value=None)),
            # 3. Check active dedup
            MagicMock(scalar_one_or_none=MagicMock(return_value=None)),
            # 4. Celery task id update
            MagicMock(),
        ]
    )
    mock_db.commit = AsyncMock()
    mock_db.refresh = AsyncMock()
    mock_db.add = MagicMock()

    app.dependency_overrides[get_current_user] = lambda: mock_auth_user
    app.dependency_overrides[get_current_active_user] = lambda: mock_auth_user
    app.dependency_overrides[get_db] = lambda: mock_db

    fake_task = MagicMock(id="celery-rec-12345")

    try:
        with patch("app.services.recommendation_job_service._is_redis_broker_available", return_value=True), \
             patch("services.worker.tasks.recommendation_task.execute_recommendation_benchmark_job.delay", return_value=fake_task):

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(
                    f"/api/v1/datasets/{dataset_id}/recommendations",
                    json={
                        "target_column": "species",
                        "feature_columns": ["sepal_length", "sepal_width"],
                        "metric": "macro_f1",
                        "cv_folds": 5,
                        "random_seed": 42,
                        "train_test_split": 0.8,
                        "max_training_seconds": 120,
                        "prefer_interpretable": False,
                    },
                )
                assert resp.status_code == 202
                data = resp.json()
                assert data["cached"] is False
                assert data["deduplicated"] is False
                assert data["job"]["status"] == "QUEUED"
                assert data["job"]["dataset_id"] == str(dataset_id)
                assert mock_db.commit.call_count >= 1
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_create_recommendation_job_unauthorized_dataset_cross_org(mock_auth_user):
    """Attempting to access a dataset from another organisation returns 404."""
    dataset_id = uuid.uuid4()
    mock_db = AsyncMock()
    # Dataset not found in caller's organisation
    mock_db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=None)))

    app.dependency_overrides[get_current_user] = lambda: mock_auth_user
    app.dependency_overrides[get_current_active_user] = lambda: mock_auth_user
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                f"/api/v1/datasets/{dataset_id}/recommendations",
                json={"target_column": "target"},
            )
            assert resp.status_code == 404
            assert resp.json()["detail"] == "Dataset not found."
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_create_recommendation_job_target_in_features_validation(mock_auth_user):
    """Selected target included among feature columns must be rejected with 422."""
    dataset_id = uuid.uuid4()
    fake_dataset = Dataset(id=dataset_id, organisation_id=mock_auth_user.organisation_id)

    mock_db = AsyncMock()
    mock_db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=fake_dataset)))

    app.dependency_overrides[get_current_user] = lambda: mock_auth_user
    app.dependency_overrides[get_current_active_user] = lambda: mock_auth_user
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                f"/api/v1/datasets/{dataset_id}/recommendations",
                json={
                    "target_column": "target",
                    "feature_columns": ["f1", "target"],  # Target in features
                },
            )
            assert resp.status_code == 422
            assert "Target column cannot be included" in resp.json()["detail"]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_create_recommendation_job_unsupported_metric_validation(mock_auth_user):
    """Unsupported metric override must be rejected with 422."""
    dataset_id = uuid.uuid4()
    fake_dataset = Dataset(id=dataset_id, organisation_id=mock_auth_user.organisation_id)

    mock_db = AsyncMock()
    mock_db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=fake_dataset)))

    app.dependency_overrides[get_current_user] = lambda: mock_auth_user
    app.dependency_overrides[get_current_active_user] = lambda: mock_auth_user
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                f"/api/v1/datasets/{dataset_id}/recommendations",
                json={
                    "target_column": "target",
                    "metric": "invalid_unsupported_metric_xyz",
                },
            )
            assert resp.status_code == 422
            assert "Unsupported metric" in resp.json()["detail"]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_create_recommendation_job_cache_hit_returns_200(mock_auth_user):
    """Matching completed recommendation returns HTTP 200 with cached=true."""
    dataset_id = uuid.uuid4()
    job_id = uuid.uuid4()
    fake_dataset = Dataset(id=dataset_id, organisation_id=mock_auth_user.organisation_id)

    cached_job = RecommendationJob(
        id=job_id,
        organisation_id=mock_auth_user.organisation_id,
        dataset_id=dataset_id,
        status=RecommendationJobStatus.COMPLETED.value,
        stage="Completed",
        progress=100.0,
        cache_key="c" * 64,
        request_config={"target_column": "target"},
        recommendation={"algorithm_id": "random_forest_classifier", "display_name": "Random Forest", "category": "tree", "task_type": "classification", "status": "completed", "score": 0.95},
        candidates=[],
        warnings=[],
        exclusions=[],
        reason_codes=["validated_top_score"],
        limitations=[],
        reproducibility={},
        created_at=datetime.now(timezone.utc),
        completed_at=datetime.now(timezone.utc),
    )

    mock_db = AsyncMock()
    mock_db.execute = AsyncMock(
        side_effect=[
            # 1. Dataset check
            MagicMock(scalar_one_or_none=MagicMock(return_value=fake_dataset)),
            # 2. Completed cache check -> HIT
            MagicMock(scalar_one_or_none=MagicMock(return_value=cached_job)),
        ]
    )

    app.dependency_overrides[get_current_user] = lambda: mock_auth_user
    app.dependency_overrides[get_current_active_user] = lambda: mock_auth_user
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                f"/api/v1/datasets/{dataset_id}/recommendations",
                json={"target_column": "target"},
            )
            assert resp.status_code == 200
            data = resp.json()
            assert data["cached"] is True
            assert data["deduplicated"] is False
            assert data["job"]["job_id"] == str(job_id)
            assert data["job"]["status"] == "COMPLETED"
            assert data["job"]["recommendation"]["algorithm_id"] == "random_forest_classifier"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_create_recommendation_job_active_deduplication_returns_202(mock_auth_user):
    """Matching active job in flight returns HTTP 202 with deduplicated=true."""
    dataset_id = uuid.uuid4()
    job_id = uuid.uuid4()
    fake_dataset = Dataset(id=dataset_id, organisation_id=mock_auth_user.organisation_id)

    active_job = RecommendationJob(
        id=job_id,
        organisation_id=mock_auth_user.organisation_id,
        dataset_id=dataset_id,
        status=RecommendationJobStatus.SCREENING.value,
        stage="Screening Tier Candidates",
        progress=35.0,
        cache_key="d" * 64,
        request_config={"target_column": "target"},
        candidates=[],
        warnings=[],
        exclusions=[],
        reproducibility={},
        created_at=datetime.now(timezone.utc),
    )

    mock_db = AsyncMock()
    mock_db.execute = AsyncMock(
        side_effect=[
            # 1. Dataset check
            MagicMock(scalar_one_or_none=MagicMock(return_value=fake_dataset)),
            # 2. Completed cache check -> None
            MagicMock(scalar_one_or_none=MagicMock(return_value=None)),
            # 3. Active dedup check -> Active job found
            MagicMock(scalar_one_or_none=MagicMock(return_value=active_job)),
        ]
    )

    app.dependency_overrides[get_current_user] = lambda: mock_auth_user
    app.dependency_overrides[get_current_active_user] = lambda: mock_auth_user
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                f"/api/v1/datasets/{dataset_id}/recommendations",
                json={"target_column": "target"},
            )
            assert resp.status_code == 202
            data = resp.json()
            assert data["cached"] is False
            assert data["deduplicated"] is True
            assert data["job"]["job_id"] == str(job_id)
            assert data["job"]["status"] == "SCREENING"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_create_recommendation_job_queue_unavailable_returns_503(mock_auth_user):
    """When Celery broker is unavailable, returns 503 and persists FAILED status."""
    dataset_id = uuid.uuid4()
    fake_dataset = Dataset(id=dataset_id, organisation_id=mock_auth_user.organisation_id)

    mock_db = AsyncMock()
    mock_db.execute = AsyncMock(
        side_effect=[
            MagicMock(scalar_one_or_none=MagicMock(return_value=fake_dataset)),
            MagicMock(scalar_one_or_none=MagicMock(return_value=None)),
            MagicMock(scalar_one_or_none=MagicMock(return_value=None)),
            MagicMock(),
        ]
    )
    mock_db.commit = AsyncMock()
    mock_db.refresh = AsyncMock()
    mock_db.add = MagicMock()

    app.dependency_overrides[get_current_user] = lambda: mock_auth_user
    app.dependency_overrides[get_current_active_user] = lambda: mock_auth_user
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        with patch("app.services.recommendation_job_service._is_redis_broker_available", return_value=False):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(
                    f"/api/v1/datasets/{dataset_id}/recommendations",
                    json={"target_column": "target"},
                )
                assert resp.status_code == 503
                assert "queue service is temporarily unavailable" in resp.json()["detail"]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_get_recommendation_job_by_id_scoped_success(mock_auth_user):
    """GET /api/v1/datasets/{dataset_id}/recommendations/{job_id} returns typed job state."""
    dataset_id = uuid.uuid4()
    job_id = uuid.uuid4()

    job = RecommendationJob(
        id=job_id,
        organisation_id=mock_auth_user.organisation_id,
        dataset_id=dataset_id,
        status=RecommendationJobStatus.VERIFYING.value,
        stage="Verification Tier Evaluation",
        progress=75.0,
        cache_key="g" * 64,
        request_config={"target_column": "target"},
        candidates=[],
        warnings=[],
        exclusions=[],
        reproducibility={"engine_version": "2.0.0"},
        created_at=datetime.now(timezone.utc),
    )

    mock_db = AsyncMock()
    mock_db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=job)))

    app.dependency_overrides[get_current_user] = lambda: mock_auth_user
    app.dependency_overrides[get_current_active_user] = lambda: mock_auth_user
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(f"/api/v1/datasets/{dataset_id}/recommendations/{job_id}")
            assert resp.status_code == 200
            data = resp.json()
            assert data["job_id"] == str(job_id)
            assert data["status"] == "VERIFYING"
            assert data["progress"] == 75.0
            assert data["reproducibility"]["engine_version"] == "2.0.0"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_get_recommendation_job_cross_org_returns_404(mock_auth_user):
    """Cross-organisation job lookup returns 404 (never revealing other tenants' job IDs)."""
    dataset_id = uuid.uuid4()
    job_id = uuid.uuid4()

    mock_db = AsyncMock()
    mock_db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=None)))

    app.dependency_overrides[get_current_user] = lambda: mock_auth_user
    app.dependency_overrides[get_current_active_user] = lambda: mock_auth_user
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(f"/api/v1/datasets/{dataset_id}/recommendations/{job_id}")
            assert resp.status_code == 404
            assert resp.json()["detail"] == "Recommendation job not found."
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_cancel_active_recommendation_job_success(mock_auth_user):
    """Cancelling an active job atomically sets status to CANCELLED and writes Redis token."""
    dataset_id = uuid.uuid4()
    job_id = uuid.uuid4()

    job = RecommendationJob(
        id=job_id,
        organisation_id=mock_auth_user.organisation_id,
        dataset_id=dataset_id,
        status=RecommendationJobStatus.SCREENING.value,
        stage="Screening Tier Candidates",
        progress=30.0,
        cache_key="h" * 64,
        celery_task_id="task-cancel-123",
        request_config={"target_column": "target"},
        candidates=[],
        warnings=[],
        exclusions=[],
        reproducibility={},
        created_at=datetime.now(timezone.utc),
    )

    mock_db = AsyncMock()
    mock_db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=job)))
    mock_db.commit = AsyncMock()
    mock_db.refresh = AsyncMock()

    mock_redis = AsyncMock()
    mock_redis.set = AsyncMock()

    app.dependency_overrides[get_current_user] = lambda: mock_auth_user
    app.dependency_overrides[get_current_active_user] = lambda: mock_auth_user
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        with patch("app.services.recommendation_job_service.get_redis", return_value=mock_redis), \
             patch("services.worker.celery_app.celery_app.control.revoke") as mock_revoke:

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(f"/api/v1/datasets/{dataset_id}/recommendations/{job_id}/cancel")
                assert resp.status_code == 200
                data = resp.json()
                assert data["status"] == "CANCELLED"
                assert data["cancelled_at"] is not None
                mock_redis.set.assert_called_once_with(f"recommendation:cancel:{job_id}", "1", ex=86400)
                mock_revoke.assert_called_once_with("task-cancel-123", terminate=False)
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_cancel_already_cancelled_job_is_idempotent(mock_auth_user):
    """Cancelling an already CANCELLED job returns 200 idempotently."""
    dataset_id = uuid.uuid4()
    job_id = uuid.uuid4()

    job = RecommendationJob(
        id=job_id,
        organisation_id=mock_auth_user.organisation_id,
        dataset_id=dataset_id,
        status=RecommendationJobStatus.CANCELLED.value,
        stage="Cancelled",
        cache_key="k" * 64,
        request_config={"target_column": "target"},
        created_at=datetime.now(timezone.utc),
        cancelled_at=datetime.now(timezone.utc),
    )

    mock_db = AsyncMock()
    mock_db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=job)))

    app.dependency_overrides[get_current_user] = lambda: mock_auth_user
    app.dependency_overrides[get_current_active_user] = lambda: mock_auth_user
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(f"/api/v1/datasets/{dataset_id}/recommendations/{job_id}/cancel")
            assert resp.status_code == 200
            assert resp.json()["status"] == "CANCELLED"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_cancel_terminal_job_returns_409_conflict(mock_auth_user):
    """Attempting to cancel COMPLETED or INSUFFICIENT_DATA returns HTTP 409 Conflict."""
    dataset_id = uuid.uuid4()
    job_id = uuid.uuid4()

    job = RecommendationJob(
        id=job_id,
        organisation_id=mock_auth_user.organisation_id,
        dataset_id=dataset_id,
        status=RecommendationJobStatus.COMPLETED.value,
        stage="Completed",
        cache_key="m" * 64,
        request_config={"target_column": "target"},
        created_at=datetime.now(timezone.utc),
        completed_at=datetime.now(timezone.utc),
    )

    mock_db = AsyncMock()
    mock_db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=job)))

    app.dependency_overrides[get_current_user] = lambda: mock_auth_user
    app.dependency_overrides[get_current_active_user] = lambda: mock_auth_user
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(f"/api/v1/datasets/{dataset_id}/recommendations/{job_id}/cancel")
            assert resp.status_code == 409
            assert "Cannot cancel job with terminal status" in resp.json()["detail"]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_get_insufficient_data_job_returns_200(mock_auth_user):
    """GET for INSUFFICIENT_DATA returns a normal 200 with structured reasons."""
    dataset_id = uuid.uuid4()
    job_id = uuid.uuid4()

    job = RecommendationJob(
        id=job_id,
        organisation_id=mock_auth_user.organisation_id,
        dataset_id=dataset_id,
        status=RecommendationJobStatus.INSUFFICIENT_DATA.value,
        stage="Insufficient Data",
        progress=100.0,
        cache_key="n" * 64,
        request_config={"target_column": "target"},
        candidates=[],
        warnings=["Dropped 0 rows with missing target values."],
        exclusions=[],
        reason_codes=["single_class_target"],
        limitations=["Classification target must contain at least 2 distinct classes."],
        reproducibility={},
        created_at=datetime.now(timezone.utc),
        completed_at=datetime.now(timezone.utc),
    )

    mock_db = AsyncMock()
    mock_db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=job)))

    app.dependency_overrides[get_current_user] = lambda: mock_auth_user
    app.dependency_overrides[get_current_active_user] = lambda: mock_auth_user
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(f"/api/v1/datasets/{dataset_id}/recommendations/{job_id}")
            assert resp.status_code == 200
            data = resp.json()
            assert data["status"] == "INSUFFICIENT_DATA"
            assert "single_class_target" in data["reason_codes"]
            assert len(data["limitations"]) > 0
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_legacy_get_dataset_recommendations_contract_compatibility(mock_auth_user):
    """GET /api/v1/datasets/{id}/recommendations preserves all legacy heuristic fields."""
    from app.schemas.dataset import DatasetProfileResponse

    dataset_id = uuid.uuid4()
    fake_profile = DatasetProfileResponse(
        dataset_id=str(dataset_id),
        filename="test.csv",
        row_count=100,
        column_count=4,
        memory_usage_bytes=1024,
        duplicate_rows=0,
        duplicate_columns=0,
        empty_columns=0,
        total_missing_values=0,
        columns=[],
    )

    mock_db = AsyncMock()
    mock_db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=None)))

    app.dependency_overrides[get_current_user] = lambda: mock_auth_user
    app.dependency_overrides[get_current_active_user] = lambda: mock_auth_user
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        with patch("app.routers.datasets.get_dataset_profile", return_value=fake_profile):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.get(f"/api/v1/datasets/{dataset_id}/recommendations")
                assert resp.status_code == 200
                data = resp.json()
                # Verify all legacy contract fields are present
                assert "dataset_id" in data
                assert "overall_readiness" in data
                assert "recommended_problem_type" in data
                assert "problem_type_confidence" in data
                assert "recommended_models" in data
                assert "recommended_preprocessing" in data
                assert "target_suggestions" in data
                assert "feature_recommendations" in data
                assert "warnings" in data
                assert "latest_benchmark" in data  # Optional backwards-compatible field
    finally:
        app.dependency_overrides.clear()
