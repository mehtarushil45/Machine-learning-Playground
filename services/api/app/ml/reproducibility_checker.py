"""Automated Submission Reproducibility Verification Engine — Phase 4.

Re-executes student submissions in a controlled, isolated environment and compares
re-executed metrics against claimed metrics to verify experiment authenticity and detect plagiarism.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.ml.engine import execute_ml_training_pipeline_sync
from app.ml.experiment_tracker import get_experiment
from app.schemas.classroom import (
    MetricDifference,
    ReproducibilityReportResponse,
)

logger = logging.getLogger("apex_ml.reproducibility_checker")


def verify_submission_reproducibility(
    submission_id: str,
    experiment_id: Optional[str] = None,
    tolerance: float = 0.005,
) -> ReproducibilityReportResponse:
    """Automated 1-click verification of learner submission reproducibility.

    Args:
        submission_id: String UUID of submission being audited.
        experiment_id: String UUID of submitted experiment record.
        tolerance: Maximum allowed absolute metric variance (default 0.5%).

    Returns:
        ReproducibilityReportResponse with detailed metric breakdown and audit summary.
    """
    sub_uuid = uuid.UUID(submission_id) if isinstance(submission_id, str) else submission_id

    # 1. Retrieve claimed experiment record
    exp_record = get_experiment(experiment_id) if experiment_id else None
    if not exp_record:
        return ReproducibilityReportResponse(
            submission_id=sub_uuid,
            experiment_id=experiment_id,
            is_reproducible=False,
            verification_status="MISSING_EXPERIMENT_RECORD",
            claimed_metrics={},
            reproduced_metrics={},
            metric_differences=[],
            audit_summary=f"Automated verification failed: Experiment record '{experiment_id}' not found in registry.",
            verified_at=datetime.now(timezone.utc).isoformat(),
        )

    # 2. Extract configuration & claimed metrics (support saved report.json and config.json)
    report = exp_record.get("report") or {}
    saved_config = exp_record.get("config") or {}

    dataset_id = saved_config.get("dataset_id") or exp_record.get("dataset_id")
    target_col = saved_config.get("target_column") or report.get("target_column") or exp_record.get("target_column") or "target"
    feature_cols = saved_config.get("feature_columns") or report.get("feature_columns") or exp_record.get("feature_columns") or []
    algorithm = saved_config.get("algorithm") or report.get("algorithm") or exp_record.get("algorithm") or "Random Forest Classifier"
    random_seed = int(saved_config.get("random_seed") or exp_record.get("random_seed") or 42)
    split_ratio = float(saved_config.get("train_test_split") or exp_record.get("train_test_split") or 0.8)

    claimed_metrics = report.get("metrics") or exp_record.get("metrics_summary") or exp_record.get("metrics") or {}

    if not dataset_id or not feature_cols:
        return ReproducibilityReportResponse(
            submission_id=sub_uuid,
            experiment_id=experiment_id,
            is_reproducible=False,
            verification_status="INVALID_EXPERIMENT_CONFIG",
            claimed_metrics={k: float(v) for k, v in claimed_metrics.items() if isinstance(v, (int, float))},
            reproduced_metrics={},
            metric_differences=[],
            audit_summary="Automated verification failed: Experiment configuration is missing dataset_id or feature_columns.",
            verified_at=datetime.now(timezone.utc).isoformat(),
        )

    # 3. Re-execute pipeline in controlled isolated environment
    audit_job_id = f"audit-{uuid.uuid4().hex[:8]}"
    config: Dict[str, Any] = {
        "dataset_id": dataset_id,
        "target_column": target_col,
        "feature_columns": feature_cols,
        "algorithm": algorithm,
        "train_test_split": split_ratio,
        "random_seed": random_seed,
        "normalization": saved_config.get("normalization", True),
        "enable_cv": False,
        "enable_tuning": False,
    }

    try:
        re_result = execute_ml_training_pipeline_sync(job_id=audit_job_id, config=config)
        reproduced_metrics = re_result.get("metrics") or {}
    except Exception as exc:
        logger.error("Reproducibility re-execution failed for submission %s: %s", submission_id, exc)
        return ReproducibilityReportResponse(
            submission_id=sub_uuid,
            experiment_id=experiment_id,
            is_reproducible=False,
            verification_status="EXECUTION_FAILED",
            claimed_metrics={k: float(v) for k, v in claimed_metrics.items() if isinstance(v, (int, float))},
            reproduced_metrics={},
            metric_differences=[],
            audit_summary=f"Automated verification failed during pipeline execution: {str(exc)}",
            verified_at=datetime.now(timezone.utc).isoformat(),
        )

    # 4. Compare Metrics & Calculate Differences
    diff_list: List[MetricDifference] = []
    all_within_tol = True

    for metric_name, claimed_val in claimed_metrics.items():
        if isinstance(claimed_val, (int, float)) and metric_name in reproduced_metrics:
            c_val = float(claimed_val)
            r_val = float(reproduced_metrics[metric_name])
            diff = round(abs(c_val - r_val), 5)
            ok = diff <= tolerance
            if not ok:
                all_within_tol = False

            diff_list.append(
                MetricDifference(
                    metric_name=metric_name,
                    claimed_value=round(c_val, 4),
                    reproduced_value=round(r_val, 4),
                    difference=diff,
                    within_tolerance=ok,
                )
            )

    status_str = "VERIFIED_REPRODUCIBLE" if all_within_tol else "METRIC_MISMATCH"
    audit_summary = (
        f"Submission VERIFIED: Re-executed pipeline on dataset '{dataset_id}' with seed {random_seed} "
        f"reproduced all metrics within tolerance ({tolerance*100:.1f}%)."
        if all_within_tol
        else f"Submission AUDIT ALERT: Re-executed pipeline produced metric differences exceeding tolerance ({tolerance*100:.1f}%). "
        f"Potential manual metric override or dataset mismatch detected."
    )

    return ReproducibilityReportResponse(
        submission_id=sub_uuid,
        experiment_id=experiment_id,
        is_reproducible=all_within_tol,
        verification_status=status_str,
        claimed_metrics={k: round(float(v), 4) for k, v in claimed_metrics.items() if isinstance(v, (int, float))},
        reproduced_metrics={k: round(float(v), 4) for k, v in reproduced_metrics.items() if isinstance(v, (int, float))},
        metric_differences=diff_list,
        audit_summary=audit_summary,
        verified_at=datetime.now(timezone.utc).isoformat(),
    )
