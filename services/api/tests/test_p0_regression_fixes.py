"""Regression tests for P0 bug fixes:
1. MinIO / StorageBackend resolution in get_dataset_profile.
2. Celery worker configuration loads .env and resolves Redis broker in dev.
3. Training job execution with study_hours regression pipeline.
"""

from unittest.mock import AsyncMock, MagicMock, patch
import os
import pytest
from fastapi import HTTPException

from app.schemas.job import TrainingRequest
from app.services.job_service import job_service
from services.worker.celery_app import get_celery_config


def test_celery_config_uses_redis_broker():
    """Verify Celery configuration resolves Redis broker rather than in-memory broker in dev."""
    config = get_celery_config()
    assert config["broker_url"].startswith("redis://"), (
        f"Expected broker_url to start with 'redis://', got '{config['broker_url']}'"
    )
    assert config["backend_url"].startswith("redis://"), (
        f"Expected backend_url to start with 'redis://', got '{config['backend_url']}'"
    )


@pytest.mark.asyncio
async def test_get_dataset_profile_resolves_via_find_dataset_path(tmp_path, monkeypatch):
    """Verify get_dataset_profile falls back to find_dataset_path when file is not in local upload_dir."""
    from app.routers.datasets import get_dataset_profile
    import pandas as pd

    # Create a test CSV in a temp location outside settings.upload_dir
    csv_file = tmp_path / "minio_temp_dataset.csv"
    df = pd.DataFrame({
        "student_id": [101, 102, 103],
        "study_hours": [2.5, 3.5, 4.0],
        "final_score": [75.0, 82.0, 90.0],
    })
    df.to_csv(str(csv_file), index=False)

    # Mock CurrentUser
    mock_user = MagicMock()
    mock_user.organisation_id = "00000000-0000-0000-0000-000000000000"

    # Mock find_dataset_path to return our temp file
    with patch("services.worker.core.dataset_loader.find_dataset_path", return_value=str(csv_file)):
        profile = await get_dataset_profile("test-uuid-minio", current_user=mock_user)
        assert profile.dataset_id == "test-uuid-minio"
        assert profile.row_count == 3
        assert profile.column_count == 3
        col_names = [c.name for c in profile.columns]
        assert "study_hours" in col_names


@pytest.mark.asyncio
async def test_create_training_job_regression_study_hours(tmp_path, monkeypatch):
    """Verify creating a training job on study_hours with random_forest_regressor succeeds."""
    import pandas as pd

    csv_file = tmp_path / "study_hours_test.csv"
    df = pd.DataFrame({
        "age": [18, 19, 20, 21, 19, 20, 18, 21, 20, 19],
        "study_hours": [2.5, 3.0, 4.5, 5.0, 3.5, 6.0, 1.5, 7.0, 4.0, 5.5],
        "final_score": [60, 65, 75, 80, 70, 85, 55, 90, 72, 82],
    })
    df.to_csv(str(csv_file), index=False)

    with patch("services.worker.core.dataset_loader.find_dataset_path", return_value=str(csv_file)), \
         patch("services.worker.tasks.training_task.execute_ml_training_job.delay") as mock_delay:
        req = TrainingRequest(
            dataset_id="test-study-hours-ds",
            target_column="study_hours",
            feature_columns=["age", "final_score"],
            algorithm="random_forest_regressor",
            scaler="standard_scaler",
            imputer="median",
            train_test_split=0.8,
            random_seed=42,
            cross_validation=5,
            normalization=True,
            feature_selection="all",
            notes="Test study hours regression",
            recommendation_job_id=None,
            selection_source="manual",
        )

        job_resp = await job_service.create_job(
            req,
            user_id="65a0ca20-95b2-40d4-81c9-ae3861892478",
            organisation_id=None,
            db=None,
        )
        assert job_resp.status == "QUEUED"
        assert job_resp.algorithm == "Random Forest Regressor"
        assert job_resp.target_column == "study_hours"
        mock_delay.assert_called_once()
