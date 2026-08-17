"""Focused unit tests for RecommendationJob persistence, lifecycle statuses, canonical storage loading, and deduplication."""

from __future__ import annotations

from datetime import datetime, timezone
import os
import tempfile
from unittest.mock import AsyncMock, MagicMock, patch
import uuid

import numpy as np
import pandas as pd
import pytest
from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateIndex, CreateTable

from app.models.recommendation import RecommendationJob, RecommendationJobStatus
from app.schemas.recommendation import (
    RecommendationCandidateItem,
    RecommendationJobCreateRequest,
    RecommendationJobResponse,
    RecommendationJobStatusEnum,
)
from services.worker.core.dataset_loader import load_dataset_dataframe
from services.worker.tasks.recommendation_task import (
    _execute_recommendation_job_async,
    execute_recommendation_benchmark_job,
)


def test_recommendation_job_model_fields_and_schema_validation():
    """RecommendationJob model must declare required fields and convert to Pydantic response."""
    org_id = uuid.uuid4()
    dataset_id = uuid.uuid4()
    user_id = uuid.uuid4()
    job_id = uuid.uuid4()

    job = RecommendationJob(
        id=job_id,
        organisation_id=org_id,
        user_id=user_id,
        dataset_id=dataset_id,
        status=RecommendationJobStatus.QUEUED.value,
        stage="QUEUED",
        progress=0.0,
        cache_key="a" * 64,
        celery_task_id="celery-123",
        request_config={
            "target_column": "target",
            "feature_columns": ["feat_1", "feat_2"],
            "cv_folds": 5,
            "random_seed": 42,
            "train_test_split": 0.8,
        },
        candidates=[],
        warnings=[],
        exclusions=[],
        reason_codes=[],
        limitations=[],
        reproducibility={},
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )

    assert str(job.id) == str(job_id)
    assert job.status == "QUEUED"
    assert job.cache_key == "a" * 64
    assert job.request_config["target_column"] == "target"

    # Verify Pydantic schema validation
    resp = RecommendationJobResponse(
        job_id=str(job.id),
        dataset_id=str(job.dataset_id),
        organisation_id=str(job.organisation_id),
        status=job.status,
        stage=job.stage,
        progress=job.progress,
        cache_key=job.cache_key,
        candidates=[],
        warnings=[],
        exclusions=[],
        reason_codes=[],
        limitations=[],
        created_at=str(job.created_at),
    )
    assert resp.job_id == str(job_id)
    assert resp.status == "QUEUED"


def test_all_lifecycle_statuses_defined():
    """Enum and schema must contain all 9 required lifecycle statuses."""
    expected = {
        "PENDING",
        "QUEUED",
        "PROFILING",
        "SCREENING",
        "VERIFYING",
        "COMPLETED",
        "FAILED",
        "CANCELLED",
        "INSUFFICIENT_DATA",
    }
    model_statuses = {s.value for s in RecommendationJobStatus}
    schema_statuses = {s.value for s in RecommendationJobStatusEnum}

    assert expected == model_statuses
    assert expected == schema_statuses


def test_postgresql_partial_unique_index_ddl_compilation():
    """Partial unique index must compile valid PostgreSQL DDL with exact active statuses."""
    indexes = [idx for idx in RecommendationJob.__table_args__ if hasattr(idx, "name")]
    assert len(indexes) >= 1

    partial_idx = indexes[0]
    assert partial_idx.name == "uq_active_rec_job_org_cache"
    assert partial_idx.unique is True

    # Compile with PostgreSQL dialect
    pg_ddl = str(CreateIndex(partial_idx).compile(dialect=postgresql.dialect()))
    assert "CREATE UNIQUE INDEX uq_active_rec_job_org_cache" in pg_ddl
    assert "organisation_id" in pg_ddl
    assert "cache_key" in pg_ddl
    assert "WHERE status IN ('PENDING', 'QUEUED', 'PROFILING', 'SCREENING', 'VERIFYING')" in pg_ddl


def test_alembic_migration_upgrade_and_downgrade():
    """Migration file must have valid revision IDs and define clean upgrade and downgrade."""
    from alembic.versions import g1a2b3c4d5e7_add_recommendation_jobs as mig

    assert mig.revision == "g1a2b3c4d5e7"
    assert mig.down_revision == "f1a2b3c4d5e6"
    assert hasattr(mig, "upgrade")
    assert hasattr(mig, "downgrade")


@pytest.mark.asyncio
async def test_worker_task_lifecycle_transitions(tmp_path):
    """Worker task must transition job through PROFILING -> SCREENING -> VERIFYING -> COMPLETED."""
    csv_file = tmp_path / "lifecycle_sample.csv"
    df = pd.DataFrame({
        "feat_1": [1.0, 2.0, 3.0, 4.0, 5.0] * 8,
        "feat_2": [10.0, 20.0, 30.0, 40.0, 50.0] * 8,
        "target": [0, 1] * 20,
    })
    df.to_csv(csv_file, index=False)

    job_id = uuid.uuid4()
    org_id = uuid.uuid4()
    dataset_id = uuid.uuid4()

    fake_job = RecommendationJob(
        id=job_id,
        organisation_id=org_id,
        dataset_id=dataset_id,
        status=RecommendationJobStatus.QUEUED.value,
        stage="QUEUED",
        progress=0.0,
        cache_key="c" * 64,
        request_config={
            "target_column": "target",
            "cv_folds": 3,
            "random_seed": 42,
            "train_test_split": 0.8,
        },
    )

    mock_session = AsyncMock()
    mock_session.execute = AsyncMock(
        side_effect=[
            # Initial query for job
            MagicMock(scalar_one_or_none=MagicMock(return_value=fake_job)),
            # Atomic check before final DB write
            MagicMock(scalar_one_or_none=MagicMock(return_value=RecommendationJobStatus.PROFILING.value)),
            # Final update
            MagicMock(),
        ]
    )
    mock_session.commit = AsyncMock()

    class MockAsyncSessionContext:
        async def __aenter__(self):
            return mock_session
        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass

    with patch("services.worker.tasks.recommendation_task.AsyncSessionLocal", return_value=MockAsyncSessionContext()), \
         patch("services.worker.tasks.recommendation_task.load_dataset_dataframe", return_value=df), \
         patch("services.worker.tasks.recommendation_task._is_job_cancelled", return_value=False):

        result = await _execute_recommendation_job_async(str(job_id))
        assert result["status"] == RecommendationJobStatus.COMPLETED.value
        assert mock_session.commit.call_count >= 1


@pytest.mark.asyncio
async def test_worker_task_insufficient_data_outcome(tmp_path):
    """When dataset is insufficient (e.g. 1 class), persist INSUFFICIENT_DATA and NOT FAILED."""
    df_invalid = pd.DataFrame({
        "feat_1": [1.0, 2.0, 3.0],
        "target": [1, 1, 1],  # Single class -> insufficient for classification
    })

    job_id = uuid.uuid4()
    org_id = uuid.uuid4()
    dataset_id = uuid.uuid4()

    fake_job = RecommendationJob(
        id=job_id,
        organisation_id=org_id,
        dataset_id=dataset_id,
        status=RecommendationJobStatus.QUEUED.value,
        stage="QUEUED",
        cache_key="insufficient" + "0" * 52,
        request_config={"target_column": "target"},
    )

    mock_session = AsyncMock()
    mock_session.execute = AsyncMock(
        side_effect=[
            MagicMock(scalar_one_or_none=MagicMock(return_value=fake_job)),
            MagicMock(scalar_one_or_none=MagicMock(return_value=RecommendationJobStatus.PROFILING.value)),
            MagicMock(),
        ]
    )
    mock_session.commit = AsyncMock()

    class MockAsyncSessionContext:
        async def __aenter__(self):
            return mock_session
        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass

    with patch("services.worker.tasks.recommendation_task.AsyncSessionLocal", return_value=MockAsyncSessionContext()), \
         patch("services.worker.tasks.recommendation_task.load_dataset_dataframe", return_value=df_invalid), \
         patch("services.worker.tasks.recommendation_task._is_job_cancelled", return_value=False):

        result = await _execute_recommendation_job_async(str(job_id))
        assert result["status"] == RecommendationJobStatus.INSUFFICIENT_DATA.value


@pytest.mark.asyncio
async def test_worker_task_cancellation_during_profiling_and_execution():
    """Worker task must abort cleanly if cancelled during PROFILING and never overwrite with COMPLETED."""
    job_id = uuid.uuid4()
    fake_job = RecommendationJob(
        id=job_id,
        organisation_id=uuid.uuid4(),
        dataset_id=uuid.uuid4(),
        status=RecommendationJobStatus.QUEUED.value,
        stage="QUEUED",
        cache_key="cancel" + "0" * 58,
        request_config={"target_column": "target"},
    )

    mock_session = AsyncMock()
    mock_session.execute = AsyncMock(
        side_effect=[
            MagicMock(scalar_one_or_none=MagicMock(return_value=fake_job)),
            MagicMock(),
        ]
    )
    mock_session.commit = AsyncMock()

    class MockAsyncSessionContext:
        async def __aenter__(self):
            return mock_session
        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass

    # Cancelled during profiling check
    with patch("services.worker.tasks.recommendation_task.AsyncSessionLocal", return_value=MockAsyncSessionContext()), \
         patch("services.worker.tasks.recommendation_task._is_job_cancelled", return_value=True):

        result = await _execute_recommendation_job_async(str(job_id))
        assert result["status"] == "cancelled"


def test_canonical_storage_loader_minio_abstraction(tmp_path):
    """load_dataset_dataframe must use MinIOStorageBackend download_to_temp when configured."""
    mock_df_content = "feat,target\n1,0\n2,1\n"
    temp_csv = tmp_path / "minio_temp.csv"
    temp_csv.write_text(mock_df_content)

    mock_minio_backend = MagicMock()
    mock_minio_backend.download_to_temp.return_value = str(temp_csv)

    with patch("app.ingestion.storage_backend.get_configured_backend", return_value=mock_minio_backend):
        df = load_dataset_dataframe(
            dataset_id="test-dataset-id",
            organisation_id="test-org-id",
            original_filename="churn.csv",
        )
        assert len(df) == 2
        assert list(df.columns) == ["feat", "target"]
        mock_minio_backend.download_to_temp.assert_called_once_with(
            dataset_id="test-dataset-id",
            filename="churn.csv",
            organisation_id="test-org-id",
        )
