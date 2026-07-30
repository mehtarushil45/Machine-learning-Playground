"""Enterprise ML Model Training Engine.

Executes real scikit-learn model fitting, preprocessing, evaluation, and serialization
pipelines, while providing real-time stage progress updates.
"""

import asyncio
from datetime import datetime, timezone
import logging
import os
import sys
from typing import Any, Dict

from sklearn.pipeline import Pipeline

# Ensure services directory is in PYTHONPATH
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..")))

from app.schemas.job import JobStatusEnum
from services.worker.core.dataset_loader import load_and_preprocess_dataset
from services.worker.core.metrics import compute_metrics
from services.worker.core.model_factory import create_model
from services.worker.core.serialization import save_trained_model

logger = logging.getLogger("apex_ml_engine")
logging.basicConfig(level=logging.INFO)


def update_job_state(
    job_id: str,
    status_val: str,
    pct: float,
    stage_name: str,
    message: str,
    estimated_seconds: float = 0.0,
    error_msg: str | None = None,
    metadata_update: Dict[str, Any] | None = None,
) -> None:
    """Safely updates JobService in-memory and database state."""
    try:
        from app.services.job_service import _JOBS_STORE

        if job_id not in _JOBS_STORE:
            return

        current_job = _JOBS_STORE[job_id]
        if current_job.status == JobStatusEnum.CANCELLED.value:
            return

        now = datetime.now(timezone.utc)
        new_meta = dict(current_job.metadata)
        if metadata_update:
            new_meta.update(metadata_update)

        updated_job = current_job.model_copy(
            update={
                "status": status_val,
                "progress": pct,
                "current_stage": stage_name,
                "message": message,
                "estimated_seconds": estimated_seconds,
                "error_message": error_msg,
                "updated_at": now,
                "completed_at": now if status_val == JobStatusEnum.COMPLETED.value else None,
                "metadata": new_meta,
            }
        )
        _JOBS_STORE[job_id] = updated_job
    except Exception as exc:
        logger.warning(f"Failed to update job state for {job_id}: {exc}")


def execute_ml_training_pipeline_sync(job_id: str, config: Dict[str, Any]) -> Dict[str, Any]:
    """Synchronous core execution routine for scikit-learn model training."""
    logger.info(f"Worker {os.getpid()} starting ML training job {job_id}")

    dataset_id = config.get("dataset_id", "ds-default")
    target_col = config.get("target_column", "target")
    feature_cols = config.get("feature_columns", [])
    algo_name = config.get("algorithm", "Random Forest Classifier")
    split_ratio = float(config.get("train_test_split", 0.8))
    seed = int(config.get("random_seed", 42))
    use_scaling = bool(config.get("normalization", True))

    test_ratio = max(0.05, min(0.5, 1.0 - split_ratio))

    try:
        # Stage 1: Loading Dataset (10%)
        update_job_state(
            job_id,
            JobStatusEnum.STARTING.value,
            10.0,
            "Loading Dataset",
            f"Loading dataset CSV '{dataset_id}'",
            estimated_seconds=8.0,
        )

        # Stage 2: Splitting Dataset & Feature Extraction (25%)
        update_job_state(
            job_id,
            JobStatusEnum.VALIDATING.value,
            25.0,
            "Splitting Dataset",
            "Extracting feature matrix and splitting train/test splits",
            estimated_seconds=6.0,
        )

        X_train, X_test, y_train, y_test, preprocessor, is_classification = load_and_preprocess_dataset(
            dataset_id=dataset_id,
            target_column=target_col,
            feature_columns=feature_cols,
            test_ratio=test_ratio,
            random_seed=seed,
            use_scaling=use_scaling,
        )

        # Stage 3: Preprocessing & Building Estimator (40%)
        update_job_state(
            job_id,
            JobStatusEnum.RUNNING.value,
            40.0,
            "Preprocessing",
            "Building StandardScaler & OneHotEncoder column transformers",
            estimated_seconds=4.5,
        )

        estimator = create_model(algo_name, random_seed=seed)
        model_pipeline = Pipeline([("preprocessor", preprocessor), ("estimator", estimator)])

        # Stage 4: Training Model (65%)
        update_job_state(
            job_id,
            JobStatusEnum.TRAINING.value,
            65.0,
            "Training Model",
            f"Fitting scikit-learn model estimator '{algo_name}'",
            estimated_seconds=2.5,
        )

        model_pipeline.fit(X_train, y_train)

        # Stage 5: Evaluating Model Metrics (85%)
        update_job_state(
            job_id,
            JobStatusEnum.EVALUATING.value,
            85.0,
            "Evaluating Metrics",
            "Computing test set accuracy, precision, recall, MAE, R2 evaluation metrics",
            estimated_seconds=1.0,
        )

        y_pred = model_pipeline.predict(X_test)
        y_prob = None
        if is_classification and hasattr(model_pipeline, "predict_proba"):
            try:
                y_prob = model_pipeline.predict_proba(X_test)
            except Exception:
                y_prob = None

        metrics = compute_metrics(is_classification, y_test, y_pred, y_prob)

        # Stage 6: Serializing & Saving Model Artifact (95%)
        update_job_state(
            job_id,
            JobStatusEnum.SAVING_MODEL.value,
            95.0,
            "Serializing & Saving Model",
            "Saving model binary .joblib artifact and metadata JSON",
            estimated_seconds=0.5,
        )

        save_info = save_trained_model(
            job_id=job_id,
            dataset_id=dataset_id,
            algorithm=algo_name,
            model_pipeline=model_pipeline,
            metrics=metrics,
            feature_columns=feature_cols,
            target_column=target_col,
        )

        # Stage 7: Completed (100%)
        update_job_state(
            job_id,
            JobStatusEnum.COMPLETED.value,
            100.0,
            "Completed",
            f"Model training completed successfully. Model artifact saved as '{save_info['filename']}'",
            estimated_seconds=0.0,
            metadata_update={"metrics": metrics, "model_path": save_info["model_path"]},
        )

        logger.info(f"Job {job_id} completed successfully with metrics: {metrics}")
        return save_info

    except Exception as exc:
        err_msg = str(exc)
        logger.error(f"Job {job_id} failed during execution: {err_msg}")
        update_job_state(
            job_id,
            JobStatusEnum.FAILED.value,
            0.0,
            "Failed",
            f"Job execution failed: {err_msg}",
            error_msg=err_msg,
        )
        raise exc


async def execute_ml_training_pipeline_async(job_id: str, config: Dict[str, Any]) -> None:
    """Asynchronous wrapper running training pipeline in background thread pool."""
    loop = asyncio.get_running_loop()
    try:
        await loop.run_in_executor(None, execute_ml_training_pipeline_sync, job_id, config)
    except Exception as exc:
        logger.error(f"Async training execution error for job {job_id}: {exc}")
