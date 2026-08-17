"""Pydantic schemas for Machine Learning Job Management and Training Configuration."""

import enum
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator, model_validator

from app.ml.algorithm_factory import ALGORITHM_REGISTRY
from app.ml.imputer_factory import IMPUTER_REGISTRY
from app.ml.scaler_factory import SCALER_REGISTRY


class JobStatusEnum(str, enum.Enum):
    """Deterministic Job Lifecycle Statuses."""

    PENDING = "PENDING"
    QUEUED = "QUEUED"
    STARTING = "STARTING"
    RUNNING = "RUNNING"
    VALIDATING = "VALIDATING"
    TRAINING = "TRAINING"
    EVALUATING = "EVALUATING"
    SAVING_MODEL = "SAVING_MODEL"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"
    RETRYING = "RETRYING"


class TrainingRequest(BaseModel):
    """Payload schema for POST /api/v1/jobs/train."""

    dataset_id: str = Field(..., description="ID of the uploaded dataset")
    target_column: str = Field(..., description="Target column variable name")
    feature_columns: list[str] = Field(..., description="List of feature column names")
    algorithm: str = Field("random_forest_classifier", description="Canonical ML model algorithm key")
    scaler: str | None = Field("standard_scaler", description="Canonical feature scaling strategy key")
    imputer: str | None = Field("median", description="Canonical missing-value imputation strategy key")
    train_test_split: float = Field(0.8, description="Train / Test split ratio (0.5 to 0.95)")
    random_seed: int | None = Field(42, description="Random seed for reproducibility")
    cross_validation: int | None = Field(5, description="Cross validation folds count")
    cv_n_splits: int | None = Field(None, description="Alias for cross validation folds count")
    normalization: bool | None = Field(True, description="Apply StandardScaler normalization (backward-compatible)")
    feature_selection: str | None = Field("all", description="Feature selection strategy")
    class_weight: str | None = Field("balanced", description="Class weighting mode")
    notes: str | None = Field("", description="Optional user notes")
    recommendation_job_id: str | None = Field(
        None, description="Originating recommendation benchmark job ID for provenance tracking"
    )
    selection_source: str = Field(
        "default",
        pattern=r"^(recommended|manual|default)$",
        description="Provenance of algorithm selection: 'recommended', 'manual', or 'default'",
    )

    @field_validator("algorithm")
    @classmethod
    def validate_algorithm(cls, algo: str) -> str:
        if algo not in ALGORITHM_REGISTRY:
            raise ValueError(f"Algorithm '{algo}' is not a published training option.")
        return algo

    @field_validator("scaler")
    @classmethod
    def validate_scaler(cls, scaler: str | None) -> str | None:
        if scaler is not None and scaler not in SCALER_REGISTRY:
            raise ValueError(f"Scaler '{scaler}' is not a published training option.")
        return scaler

    @field_validator("imputer")
    @classmethod
    def validate_imputer(cls, imputer: str | None) -> str | None:
        if imputer is not None and imputer not in IMPUTER_REGISTRY:
            raise ValueError(f"Imputer '{imputer}' is not a published training option.")
        return imputer

    @field_validator("train_test_split")
    @classmethod
    def validate_split(cls, split: float) -> float:
        if split < 0.5 or split > 0.95:
            raise ValueError("Train/Test split ratio must be between 0.50 and 0.95.")
        return split

    @model_validator(mode="after")
    def validate_features_and_target(self) -> "TrainingRequest":
        if self.feature_selection != "all" and (not self.feature_columns or len(self.feature_columns) == 0):
            raise ValueError("Feature list cannot be empty. Select at least one input feature.")
        if self.feature_columns and len(self.feature_columns) != len(set(self.feature_columns)):
            raise ValueError("Feature list contains duplicate column names.")
        if self.feature_columns and self.target_column in self.feature_columns:
            raise ValueError(
                f"Target column '{self.target_column}' cannot be included inside feature columns."
            )
        return self


class JobResponse(BaseModel):
    """Structured response schema representing an ML Job entity."""

    job_id: str
    dataset_id: str
    status: str
    created_at: datetime
    updated_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None
    cancelled_at: datetime | None = None
    job_type: str = "training"
    algorithm: str
    target_column: str
    feature_columns: list[str] = Field(default_factory=list)
    progress: float = 0.0
    current_stage: str = "Initialized"
    message: str | None = None
    estimated_seconds: float | None = 0.0
    worker_id: str | None = None
    error_message: str | None = None
    retry_count: int = 0
    owner_id: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)

    model_config = {"from_attributes": True}


class JobProgressResponse(BaseModel):
    """Real-time progress response schema for GET /api/v1/jobs/{job_id}/progress."""

    job_id: str
    status: str
    progress: float
    current_stage: str
    message: str | None = None
    estimated_seconds_remaining: float | None = 0.0


class JobListResponse(BaseModel):
    """Paginated list response for GET /api/v1/jobs."""

    total: int
    jobs: list[JobResponse] = Field(default_factory=list)


class JobCancelResponse(BaseModel):
    """Response schema for POST /api/v1/jobs/{job_id}/cancel."""

    job_id: str
    status: str = "CANCELLED"
    cancelled_at: datetime
    message: str


class JobRetryResponse(BaseModel):
    """Response schema for POST /api/v1/jobs/{job_id}/retry."""

    original_job_id: str
    new_job_id: str
    status: str = "QUEUED"
    retry_count: int
    message: str
