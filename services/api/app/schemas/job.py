"""Pydantic schemas for Machine Learning Job Management and Training Configuration."""

import enum
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator, model_validator

ALLOWED_ALGORITHMS = {
    "logistic regression",
    "random forest classifier",
    "random forest",
    "decision tree classifier",
    "decision tree",
    "gradient boosting classifier",
    "gradient boosting",
    "xgboost classifier",
    "xgboost",
    "lightgbm classifier",
    "lightgbm",
    "support vector machine (svm)",
    "svm classifier",
    "svm",
    "k-nearest neighbors (knn)",
    "knn classifier",
    "knn",
    "multi-layer perceptron (mlp)",
    "mlp classifier",
    "mlp",
    "ridge classifier",
    "ridge",
    "lasso classifier",
    "linear regression",
    "random forest regressor",
    "decision tree regressor",
    "gradient boosting regressor",
    "xgboost regressor",
    "lightgbm regressor",
    "support vector regression (svr)",
    "svr regressor",
    "k-nearest neighbors regressor (knn)",
    "knn regressor",
    "multi-layer perceptron regressor (mlp)",
    "mlp regressor",
    "ridge regressor",
    "lasso",
    "lasso regressor",
}


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
    algorithm: str = Field("Random Forest Classifier", description="ML model algorithm")
    scaler: str | None = Field("StandardScaler", description="Feature scaling strategy")
    imputer: str | None = Field("Median", description="Missing value imputation strategy")
    train_test_split: float = Field(0.8, description="Train / Test split ratio (0.5 to 0.95)")
    random_seed: int | None = Field(42, description="Random seed for reproducibility")
    cross_validation: int | None = Field(5, description="Cross validation folds count")
    cv_n_splits: int | None = Field(None, description="Alias for cross validation folds count")
    normalization: bool | None = Field(True, description="Apply StandardScaler normalization (backward-compatible)")
    feature_selection: str | None = Field("all", description="Feature selection strategy")
    class_weight: str | None = Field("balanced", description="Class weighting mode")
    notes: str | None = Field("", description="Optional user notes")

    @field_validator("algorithm")
    @classmethod
    def validate_algorithm(cls, algo: str) -> str:
        if not algo or algo.strip().lower() not in ALLOWED_ALGORITHMS:
            raise ValueError(f"Algorithm '{algo}' is not in the allowed algorithms list.")
        return algo

    @field_validator("feature_columns")
    @classmethod
    def validate_features(cls, features: list[str]) -> list[str]:
        if not features or len(features) == 0:
            raise ValueError("Feature list cannot be empty. Select at least one input feature.")
        if len(features) != len(set(features)):
            raise ValueError("Feature list contains duplicate column names.")
        return features

    @field_validator("train_test_split")
    @classmethod
    def validate_split(cls, split: float) -> float:
        if split < 0.5 or split > 0.95:
            raise ValueError("Train/Test split ratio must be between 0.50 and 0.95.")
        return split

    @model_validator(mode="after")
    def validate_target_not_in_features(self) -> "TrainingRequest":
        if self.target_column in self.feature_columns:
            raise ValueError(
                f"Target column '{self.target_column}' cannot be included inside feature columns."
            )
        return self

    def model_post_init(self, __context: Any) -> None:
        if self.target_column in self.feature_columns:
            raise ValueError(
                f"Target column '{self.target_column}' cannot be included inside feature columns."
            )


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
