"""Pydantic schemas for Recommendation Jobs."""

from __future__ import annotations

import enum
from typing import Any, List, Optional
from pydantic import BaseModel, Field


class RecommendationJobStatusEnum(str, enum.Enum):
    """Lifecycle status of a recommendation job."""

    PENDING = "PENDING"
    QUEUED = "QUEUED"
    PROFILING = "PROFILING"
    SCREENING = "SCREENING"
    VERIFYING = "VERIFYING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"
    INSUFFICIENT_DATA = "INSUFFICIENT_DATA"


class RecommendationJobCreateRequest(BaseModel):
    """Payload for submitting an automatic algorithm recommendation job."""

    target_column: str = Field(..., min_length=1, description="Target column to predict")
    feature_columns: Optional[List[str]] = Field(None, description="Explicit feature columns subset (optional)")
    metric: Optional[str] = Field(None, description="Optimization metric override (e.g. roc_auc, macro_f1, rmse, mae)")
    cv_folds: int = Field(default=5, ge=2, le=10, description="Cross-validation fold count")
    random_seed: int = Field(default=42, description="Random state seed for reproducible partitions")
    train_test_split: float = Field(default=0.8, ge=0.5, le=1.0, description="Train / holdout partition ratio")
    max_training_seconds: Optional[int] = Field(default=120, ge=10, le=600, description="Cooperative time budget limit in seconds")
    prefer_interpretable: bool = Field(default=False, description="Whether to favor linear/tree models during practical equivalence ties")


class RecommendationCandidateItem(BaseModel):
    """Detailed candidate evaluation result."""

    algorithm_id: str
    display_name: str
    category: str
    task_type: str
    rank: Optional[int] = None
    status: str = "completed"
    score: Optional[float] = None
    score_std: Optional[float] = None
    raw_metric_value: Optional[float] = None
    validation_score: Optional[float] = None
    ci_lower: Optional[float] = None
    ci_upper: Optional[float] = None
    metric_used: Optional[str] = None
    fold_scores: List[float] = Field(default_factory=list)
    training_seconds: float = 0.0
    training_time_seconds: Optional[float] = None
    interpretability_score: Optional[int] = None
    interpretability_label: Optional[str] = None
    why_recommended: Optional[str] = None
    risk_flags: List[str] = Field(default_factory=list)
    reason_codes: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    skip_reason: Optional[str] = None
    error_message: Optional[str] = None

    model_config = {"from_attributes": True}


class RecommendationJobResponse(BaseModel):
    """Complete representation of a recommendation job."""

    job_id: str
    dataset_id: str
    organisation_id: str
    status: str
    stage: str
    progress: float
    message: Optional[str] = None
    cache_key: str
    created_at: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    cancelled_at: Optional[str] = None
    recommendation: Optional[RecommendationCandidateItem] = None
    candidates: List[RecommendationCandidateItem] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    exclusions: List[dict[str, Any]] = Field(default_factory=list)
    reason_codes: List[str] = Field(default_factory=list)
    limitations: List[str] = Field(default_factory=list)
    reproducibility: Optional[dict[str, Any]] = None
    error_details: Optional[dict[str, Any]] = None

    model_config = {"from_attributes": True}


class RecommendationJobCreateResponse(BaseModel):
    """Response returned upon submitting a recommendation job."""

    job: RecommendationJobResponse
    cached: bool = Field(default=False, description="Whether this response was served from a previously completed benchmark cache")
    deduplicated: bool = Field(default=False, description="Whether this response joined an existing active benchmark job")

    model_config = {"from_attributes": True}


class LatestBenchmarkSummary(BaseModel):
    """Safe summary of the latest completed evidence-based benchmark for legacy endpoints."""

    job_id: str
    status: str
    algorithm_id: Optional[str] = None
    algorithm_name: Optional[str] = None
    score: Optional[float] = None
    metric: Optional[str] = None
    completed_at: Optional[str] = None

    model_config = {"from_attributes": True}
