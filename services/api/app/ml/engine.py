"""Training Pipeline Engine — Sprint 3 Module 3.5, extended in Sprint 4.

Orchestrates the end-to-end ML training pipeline by composing Sprint 3 and
Sprint 4 modules in the correct order:

    load_dataset_context()           → DatasetContext             [S3]
        ↓
    detect_problem_type()            → ProblemType                [S3]
        ↓
    build_preprocessor()             → ColumnTransformer          [S3]
        ↓
    train_test_split()               → X/y splits                 [S3]
        ↓
    start_experiment()               → experiment_id              [S4]
        ↓
    run_hyperparameter_search()      → best Pipeline + params     [S4]
        ↓
    cross_validate_pipeline()        → cv_results                 [S4]
        ↓
    model_pipeline.fit()             → fitted Pipeline            [S3]
        ↓
    compute_metrics()                → metrics dict               [S2]
        ↓
    compute_feature_importance()     → ranked importance list     [S4]
        ↓
    generate_training_report()       → serialisable report        [S4]
        ↓
    save_trained_model()             → save_info dict             [S2]
        ↓
    register_model()                 → model_id                   [S4]
        ↓
    save_experiment()                → persisted experiment       [S4]

Public API (UNCHANGED from Sprint 2 and Sprint 3):
    execute_ml_training_pipeline_sync(job_id, config)  → Dict[str, Any]
    execute_ml_training_pipeline_async(job_id, config) → None  (coroutine)

All job-state progress updates use update_job_state() which writes
into the in-memory _JOBS_STORE for live frontend polling.

Sprint 4 config keys consumed (all optional, backward-compatible):
  enable_cv          bool  (default True)
  enable_tuning      bool  (default True)
  cv_n_splits        int   (default 5)
  cv_strategy        str   (default None — automatic)
  tuning_strategy    str   (default None — automatic)
  tuning_n_iter      int   (default 20)
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import logging
import os
import sys
import time
from typing import Any, Dict, List, Optional
import uuid

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import LabelEncoder
from xgboost import XGBClassifier

# Sprint 3 modules
from app.ml.dataset_loader import DatasetContext, DatasetValidationError, load_dataset_context
from app.ml.algorithm_factory import ALGORITHM_REGISTRY, get_algorithm
from app.ml.preprocessing import build_preprocessor
from app.ml.problem_detector import ProblemType, detect_problem_type
from app.schemas.job import JobStatusEnum

# Sprint 4 modules
from app.ml.cross_validator import cross_validate_pipeline
from app.ml.experiment_tracker import save_experiment, start_experiment
from app.ml.feature_importance import compute_feature_importance
from app.ml.model_registry import register_model
from app.ml.training_report import (
    build_dataset_version,
    build_model_version,
    generate_training_report,
)

# Sprint 5A modules
from app.ml.artifact_manager import list_artifacts

# V5A modules
from app.ml.model_version_manager import next_version as allocate_version, _family_key as _mv_family_key
from app.ml.model_lineage import build_lineage, record_lineage

# Cross-package helpers — Sprint 2, untouched
from services.worker.core.metrics import compute_metrics
from services.worker.core.serialization import save_trained_model

logger = logging.getLogger("apex_ml_engine")
logging.basicConfig(level=logging.INFO)


# ---------------------------------------------------------------------------
# Job state helper  (unchanged from Sprint 3)
# ---------------------------------------------------------------------------

def update_job_state(
    job_id: str,
    status_val: str,
    pct: float,
    stage_name: str,
    message: str,
    estimated_seconds: float = 0.0,
    error_msg: Optional[str] = None,
    metadata_update: Optional[Dict[str, Any]] = None,
) -> None:
    """Write a progress snapshot into the in-memory _JOBS_STORE.

    Silently no-ops if the job has been cancelled or does not exist.
    """
    try:
        # LAZY IMPORT: Deferred inside function body to eliminate top-level circular import with job_service.py
        from app.services.job_service import _JOBS_STORE  # noqa: PLC0415

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
                "completed_at": (
                    now if status_val == JobStatusEnum.COMPLETED.value else None
                ),
                "metadata": new_meta,
            }
        )
        _JOBS_STORE[job_id] = updated_job
    except Exception as exc:
        logger.warning("Failed to update job state for %s: %s", job_id, exc)


# ---------------------------------------------------------------------------
# Synchronous training pipeline
# ---------------------------------------------------------------------------

def execute_ml_training_pipeline_sync(
    job_id: str, config: Dict[str, Any]
) -> Dict[str, Any]:
    """Run the full ML training pipeline synchronously and return save_info.

    Sprint 4 additions (controlled by config flags):
      - Hyperparameter search (GridSearchCV / RandomizedSearchCV)
      - Cross-validation (StratifiedKFold / KFold / TimeSeriesSplit)
      - Feature importance computation
      - Training report generation
      - Model registry registration
      - Experiment tracking

    Progress milestones (extended from Sprint 3):
         5%  — Experiment Started
        10%  — Loading Dataset
        20%  — Problem Detection
        30%  — Building Preprocessing Pipeline
        38%  — Train/Test Split
        45%  — Hyperparameter Search
        60%  — Cross Validation
        68%  — Assembling Final Pipeline
        76%  — Training Final Model
        84%  — Evaluating Metrics + Feature Importance
        90%  — Generating Training Report
        95%  — Saving Artifacts (model + registry + experiment)
       100%  — Completed
    """
    pipeline_start_time = time.monotonic()
    logger.info("Worker %d starting ML training job %s", os.getpid(), job_id)

    # ── Extract config ────────────────────────────────────────────────────────
    dataset_id: str = config.get("dataset_id", "ds-default")
    target_col: str = config.get("target_column", "target")
    feature_cols: List[str] = config.get("feature_columns", [])
    algo_key: str = config.get("algorithm", "random_forest_classifier")
    split_ratio: float = float(config.get("train_test_split", 0.8))
    seed: int = int(config.get("random_seed") or 42)
    use_scaling: bool = bool(config.get("normalization", True))
    scaler_name: str = config.get("scaler", "standard_scaler") or "standard_scaler"
    imputer_name: str = config.get("imputer", "median") or "median"
    rec_task: Optional[str] = config.get("recommended_task")

    # Sprint 4 flags (backward-compatible defaults)
    enable_cv: bool = bool(config.get("enable_cv", True))
    enable_tuning: bool = bool(config.get("enable_tuning", True))
    cv_n_splits: int = int(config.get("cross_validation") or config.get("cv_n_splits") or 5)
    cv_strategy: Optional[str] = config.get("cv_strategy")
    tuning_strategy: Optional[str] = config.get("tuning_strategy")
    tuning_n_iter: int = int(config.get("tuning_n_iter", 20))

    test_ratio: float = max(0.05, min(0.5, 1.0 - split_ratio))

    experiment_id: str = str(uuid.uuid4())

    try:
        # ── Stage 0: Start Experiment ─────────────────────────────────────────
        update_job_state(
            job_id,
            JobStatusEnum.STARTING.value,
            5.0,
            "Starting Experiment",
            f"Initialising experiment tracker for job '{job_id}'",
            estimated_seconds=10.0,
        )
        experiment_id = start_experiment(job_id=job_id, config=config)

        # ── Stage 1: Load Dataset ─────────────────────────────────────────────
        update_job_state(
            job_id,
            JobStatusEnum.STARTING.value,
            10.0,
            "Loading Dataset",
            f"Loading and validating dataset CSV '{dataset_id}'",
            estimated_seconds=8.0,
        )

        ctx: DatasetContext = load_dataset_context(
            dataset_id=dataset_id,
            target_column=target_col,
            feature_columns=feature_cols,
        )
        dataset_version = build_dataset_version(ctx)

        # ── Stage 2: Problem Detection ────────────────────────────────────────
        update_job_state(
            job_id,
            JobStatusEnum.VALIDATING.value,
            20.0,
            "Detecting Problem Type",
            "Classifying ML task (Binary/Multi Classification vs Regression)",
            estimated_seconds=6.0,
        )

        problem_type: ProblemType = detect_problem_type(ctx, recommendation_task=rec_task)
        is_classification: bool = problem_type in (
            ProblemType.BINARY_CLASSIFICATION,
            ProblemType.MULTI_CLASSIFICATION,
        )
        task_type = "classification" if is_classification else "regression"
        algorithm_definition = ALGORITHM_REGISTRY[algo_key]
        algo_name = algorithm_definition.display_name
        estimator = get_algorithm(
            key=algo_key,
            task_type=task_type,
            random_state=seed,
        )
        logger.info("Detected problem type: %s", problem_type.value)

        # ── Stage 3: Build Preprocessing Pipeline ────────────────────────────
        update_job_state(
            job_id,
            JobStatusEnum.RUNNING.value,
            30.0,
            "Building Preprocessing Pipeline",
            f"Constructing ColumnTransformer (imputer={imputer_name}, scaler={scaler_name})",
            estimated_seconds=4.5,
        )
        preprocessor = build_preprocessor(
            ctx, use_scaling=use_scaling, scaler=scaler_name, imputer=imputer_name
        )

        # ── Stage 4: Train/Test Split ─────────────────────────────────────────
        update_job_state(
            job_id,
            JobStatusEnum.RUNNING.value,
            38.0,
            "Splitting Dataset",
            f"Splitting {ctx.row_count} rows: train {split_ratio:.0%} / test {test_ratio:.0%}",
            estimated_seconds=3.0,
        )

        X: Any = ctx.dataframe[ctx.feature_columns]
        class_labels: Optional[List[str]] = None
        if is_classification:
            y: Any = ctx.dataframe[ctx.target_column].astype(str)
            # XGBoost's sklearn API requires consecutive integer class labels;
            # the rest of the registry correctly accepts the platform's native
            # string labels. Keep the source labels in job metadata so clients
            # can map XGBoost predictions back to the uploaded target values.
            if isinstance(estimator, XGBClassifier):
                label_encoder = LabelEncoder()
                class_labels = label_encoder.fit(y).classes_.astype(str).tolist()
                y = label_encoder.transform(y)
        else:
            y = (
                ctx.dataframe[ctx.target_column]
                .apply(lambda v: pd.to_numeric(v, errors="coerce"))
                .fillna(0.0)
            )

        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=test_ratio, random_state=seed
        )

        # ── Stage 5: Hyperparameter Search ───────────────────────────────────
        best_params: Dict[str, Any] = {}
        search_summary: Dict[str, Any] = {}

        if enable_tuning and len(X_train) >= 10:
            update_job_state(
                job_id,
                JobStatusEnum.RUNNING.value,
                45.0,
                "Hyperparameter Search",
                f"Searching best hyperparameters for '{algo_name}'",
                estimated_seconds=15.0,
            )
            # Hyperparameter search module pruned per A2
            search_summary = {"skipped": True, "reason": "Tuning pruned in favor of baseline pipeline"}
            model_pipeline = None
        else:
            if not enable_tuning:
                search_summary = {"skipped": True, "reason": "disabled via config"}
            else:
                search_summary = {"skipped": True, "reason": "insufficient training samples"}
            model_pipeline = None

        # If tuning was skipped or failed, build and fit baseline pipeline
        if model_pipeline is None:
            model_pipeline = Pipeline(
                steps=[("preprocessor", preprocessor), ("estimator", estimator)]
            )

        # ── Stage 6: Cross Validation ────────────────────────────────────────
        cv_results: Optional[Dict[str, Any]] = None

        if enable_cv and len(X_train) >= 6:
            update_job_state(
                job_id,
                JobStatusEnum.RUNNING.value,
                60.0,
                "Cross Validation",
                f"Running {cv_n_splits}-fold cross-validation",
                estimated_seconds=10.0,
            )
            try:
                cv_results = cross_validate_pipeline(
                    pipeline=model_pipeline,
                    X=X_train,
                    y=y_train,
                    problem_type=problem_type,
                    n_splits=min(cv_n_splits, max(2, len(X_train) // 2)),
                    cv_strategy=cv_strategy,
                )
                logger.info(
                    "CV complete: mean=%.4f std=%.4f",
                    cv_results["mean_score"],
                    cv_results["std_score"],
                )
            except Exception as exc:
                logger.warning("Cross-validation failed; skipping: %s", exc)
                cv_results = {"skipped": True, "reason": str(exc)}
        else:
            if not enable_cv:
                cv_results = {"skipped": True, "reason": "disabled via config"}
            else:
                cv_results = {"skipped": True, "reason": "insufficient training samples"}

        # ── Stage 7: Assemble and Fit Final Model ────────────────────────────
        # If the model was already fitted by hyperparameter search, skip fitting.
        pipeline_already_fitted = enable_tuning and not search_summary.get("skipped", True)

        if not pipeline_already_fitted:
            update_job_state(
                job_id,
                JobStatusEnum.TRAINING.value,
                76.0,
                "Training Final Model",
                f"Fitting '{algo_name}' on {len(X_train)} training samples",
                estimated_seconds=4.0,
            )
            model_pipeline.fit(X_train, y_train)
        else:
            update_job_state(
                job_id,
                JobStatusEnum.TRAINING.value,
                76.0,
                "Using Tuned Model",
                f"Best model from hyperparameter search applied (already fitted)",
                estimated_seconds=0.5,
            )

        # ── Stage 8: Evaluation + Feature Importance ─────────────────────────
        update_job_state(
            job_id,
            JobStatusEnum.EVALUATING.value,
            84.0,
            "Evaluating Metrics & Feature Importance",
            "Computing metrics, confusion matrix, ROC AUC, feature rankings",
            estimated_seconds=3.0,
        )

        y_pred = model_pipeline.predict(X_test)
        y_prob: Optional[Any] = None
        if is_classification and hasattr(model_pipeline, "predict_proba"):
            try:
                y_prob = model_pipeline.predict_proba(X_test)
            except Exception:
                y_prob = None

        metrics = compute_metrics(is_classification, y_test, y_pred, y_prob)
        logger.info("Job %s metrics: %s", job_id, metrics)

        feature_importance = compute_feature_importance(
            fitted_pipeline=model_pipeline,
            X_train=X_train,
            y_train=y_train,
            feature_columns=ctx.feature_columns,
        )

        # ── Stage 9: Generate Training Report ────────────────────────────────
        update_job_state(
            job_id,
            JobStatusEnum.EVALUATING.value,
            90.0,
            "Generating Training Report",
            "Assembling experiment report, metrics, CV scores, feature importance",
            estimated_seconds=1.5,
        )

        training_duration = time.monotonic() - pipeline_start_time
        model_version = build_model_version(algo_name, experiment_id)
        dataset_version_str = build_dataset_version(ctx)

        training_report = generate_training_report(
            job_id=job_id,
            ctx=ctx,
            problem_type=problem_type,
            algorithm=algo_name,
            random_seed=seed,
            training_duration_seconds=training_duration,
            fitted_pipeline=model_pipeline,
            X_test=X_test,
            y_test=y_test,
            y_pred=y_pred,
            y_prob=y_prob,
            metrics=metrics,
            cv_results=cv_results,
            best_params=best_params,
            feature_importance=feature_importance,
            model_version=model_version,
            dataset_version=dataset_version_str,
            experiment_id=experiment_id,
        )

        # ── Stage 10: Save Artifacts ──────────────────────────────────────────
        update_job_state(
            job_id,
            JobStatusEnum.SAVING_MODEL.value,
            95.0,
            "Saving Artifacts",
            "Saving model binary, registry entry and experiment record",
            estimated_seconds=1.0,
        )

        save_info = save_trained_model(
            job_id=job_id,
            dataset_id=dataset_id,
            algorithm=algo_name,
            model_pipeline=model_pipeline,
            metrics=metrics,
            feature_columns=ctx.feature_columns,
            target_column=ctx.target_column,
        )

        # ── V5A: Semantic Version + Lineage ────────────────────────────────
        provisional_model_id = f"model-{job_id[:8]}"
        semantic_version = allocate_version(
            algorithm=algo_name,
            dataset_id=dataset_id,
            model_id=provisional_model_id,
            bump="patch",
        )
        model_family = _mv_family_key(algo_name, dataset_id)

        # Pull V4 DatasetValidationContext advisory data (non-blocking)
        validation_score: float | None = None
        ml_task_type: str | None = None
        validation_context_summary: dict | None = None
        try:
            from app.ingestion.validation_context import get_validation_context  # noqa: PLC0415
            vctx = get_validation_context(dataset_id)
            if vctx is not None:
                validation_score = vctx.validation_score
                ml_task_type = vctx.ml_task_type
                validation_context_summary = {
                    "row_count":          vctx.row_count,
                    "column_count":       vctx.column_count,
                    "encoding":           vctx.encoding,
                    "delimiter":          vctx.delimiter,
                    "schema_version":     vctx.schema_version,
                    "validation_passed":  vctx.validation_report.passed,
                }
        except Exception as _vctx_exc:
            logger.debug("V4 validation context not available: %s", _vctx_exc)

        lineage = build_lineage(
            model_id=provisional_model_id,
            job_id=job_id,
            experiment_id=experiment_id,
            algorithm=algo_name,
            dataset_id=dataset_id,
            dataset_version=dataset_version_str,
            problem_type=problem_type.value,
            semantic_version=semantic_version,
            model_family=model_family,
            training_timestamp=training_report["training_timestamp"],
            hyperparameters=best_params,
            metrics=metrics,
            feature_columns=ctx.feature_columns,
            target_column=ctx.target_column,
            numeric_columns=ctx.numeric_columns,
            categorical_columns=ctx.categorical_columns,
            cv_results=cv_results,
            pipeline_hash=training_report["pipeline_hash"],
            random_seed=seed,
            created_by="system",
            validation_score=validation_score,
            ml_task_type=ml_task_type,
            validation_context_summary=validation_context_summary,
        )
        record_lineage(lineage)

        # Register in model registry
        model_id = register_model(
            {
                "model_id":         provisional_model_id,
                "job_id":           job_id,
                "experiment_id":    experiment_id,
                "algorithm":        algo_name,
                "dataset_id":       dataset_id,
                "problem_type":     problem_type.value,
                "model_version":    model_version,
                "dataset_version":  dataset_version_str,
                "model_path":       save_info["model_path"],
                "feature_columns":  ctx.feature_columns,
                "target_column":    ctx.target_column,
                "metrics":          metrics,
                "best_params":      best_params,
                "training_timestamp": training_report["training_timestamp"],
                "pipeline_hash":    training_report["pipeline_hash"],
                # V5A additions
                "semantic_version": semantic_version,
                "model_family":     model_family,
                "lineage":          lineage,
            }
        )

        # Persist experiment
        save_experiment(
            experiment_id=experiment_id,
            report=training_report,
            model_id=model_id,
            model_path=save_info["model_path"],
        )

        # ── V5B: Governance Initialisation (non-blocking) ─────────────────────
        try:
            from app.ml.model_governance import initialise_governance  # noqa: PLC0415
            initialise_governance(model_id=model_id, lineage=lineage)
        except Exception as _gov_exc:
            logger.warning(
                "V5B governance init failed for job %s (non-blocking): %s",
                job_id, _gov_exc,
            )

        # ── Stage 11: Completed ───────────────────────────────────────────────
        update_job_state(
            job_id,
            JobStatusEnum.COMPLETED.value,
            100.0,
            "Completed",
            (
                f"Training complete. Model: '{save_info['filename']}'. "
                f"Experiment: {experiment_id}."
            ),
            estimated_seconds=0.0,
            metadata_update={
                "metrics": metrics,
                "algorithm_key": algo_key,
                "algorithm_display_name": algo_name,
                "estimator_type": type(estimator).__name__,
                "class_labels": class_labels,
                "scaler": scaler_name if use_scaling else None,
                "imputer": imputer_name,
                "model_path": save_info["model_path"],
                "problem_type": problem_type.value,
                "experiment_id": experiment_id,
                "model_id":        model_id,
                "cv_mean_score": cv_results.get("mean_score") if cv_results and not cv_results.get("skipped") else None,
                "feature_importance": feature_importance[:5] if feature_importance else [],
                # Sprint 5A additions
                "model_version":   model_version,
                # V5A additions
                "semantic_version": semantic_version,
                "model_family":     model_family,
                "artifact_manifest": list_artifacts(
                    model_id=model_id,
                    experiment_id=experiment_id,
                ),
            },
        )

        logger.info(
            "Job %s completed. problem_type=%s metrics=%s experiment=%s model=%s",
            job_id,
            problem_type.value,
            metrics,
            experiment_id,
            model_id,
        )

        # Augment save_info with Sprint 4 + Sprint 5A metadata for callers
        save_info["experiment_id"] = experiment_id
        save_info["model_id"] = model_id
        save_info["model_version"] = model_version
        save_info["cv_results"] = cv_results
        save_info["feature_importance"] = feature_importance
        save_info["training_report"] = training_report
        save_info["artifact_manifest"] = list_artifacts(
            model_id=model_id, experiment_id=experiment_id
        )

        return save_info

    except FileNotFoundError as exc:
        _fail_job(job_id, f"Dataset not found: {exc}")
        raise
    except DatasetValidationError as exc:
        _fail_job(job_id, str(exc))
        raise
    except Exception as exc:
        _fail_job(job_id, str(exc))
        raise


# ---------------------------------------------------------------------------
# Async wrapper  (unchanged)
# ---------------------------------------------------------------------------

async def execute_ml_training_pipeline_async(
    job_id: str, config: Dict[str, Any]
) -> None:
    """Async wrapper running the synchronous pipeline in a thread pool executor."""
    loop = asyncio.get_running_loop()
    try:
        await loop.run_in_executor(
            None, execute_ml_training_pipeline_sync, job_id, config
        )
    except Exception as exc:
        logger.error("Async training error for job %s: %s", job_id, exc)
        _fail_job(job_id, str(exc))
        raise RuntimeError(
            f"Async ML training pipeline failed for job '{job_id}': {exc}"
        ) from exc


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _fail_job(job_id: str, error_message: str) -> None:
    """Transition job to FAILED state with an error message."""
    logger.error("Job %s failed: %s", job_id, error_message)
    update_job_state(
        job_id,
        JobStatusEnum.FAILED.value,
        0.0,
        "Failed",
        f"Job execution failed: {error_message}",
        error_msg=error_message,
    )
