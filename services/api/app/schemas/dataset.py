"""Pydantic schemas for Dataset resources, Profiler output, Health Engine, and Recommendation Engine."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class DatasetUploadResponse(BaseModel):
    """Structured response returned by POST /api/v1/datasets/upload."""

    dataset_id: uuid.UUID
    filename: str
    size_bytes: int
    uploaded_at: datetime
    status: str = "uploaded"
    row_count: int | None = None
    column_count: int | None = None
    columns: list[str] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class NumericStatistics(BaseModel):
    """Statistical summary for numeric columns."""

    mean: float | None = None
    median: float | None = None
    std: float | None = None
    min: float | None = None
    max: float | None = None
    variance: float | None = None


class CategoricalStatistics(BaseModel):
    """Statistical summary for categorical, boolean, text, or identifier columns."""

    cardinality: int = 0
    most_frequent_value: str | None = None
    frequency_count: int | None = None
    sample_values: list[str] = Field(default_factory=list)


class ColumnProfile(BaseModel):
    """Detailed profile for an individual dataset column."""

    name: str
    type: str  # numeric | categorical | boolean | datetime | text | identifier
    nullable: bool
    missing: int
    missing_percentage: float
    unique: int
    duplicate_count: int
    statistics: dict[str, Any] = Field(default_factory=dict)


class DatasetProfileResponse(BaseModel):
    """Structured profile response returned by GET /api/v1/datasets/{dataset_id}/profile."""

    dataset_id: str
    filename: str
    row_count: int
    column_count: int
    memory_usage_bytes: int
    duplicate_rows: int
    duplicate_columns: int
    empty_columns: int
    total_missing_values: int
    columns: list[ColumnProfile] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class HealthIssue(BaseModel):
    """Individual dataset quality issue item with severity level."""

    severity: str  # "info" | "warning" | "high" | "critical"
    message: str
    column_name: str | None = None


class DatasetHealthResponse(BaseModel):
    """Structured health report response returned by GET /api/v1/datasets/{dataset_id}/health."""

    dataset_id: str
    filename: str
    health_score: int
    grade: str  # "Excellent" | "Good" | "Fair" | "Poor" | "Critical"
    summary: str
    warnings: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
    issues: list[HealthIssue] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class TargetSuggestion(BaseModel):
    """Candidate target column suggestion with confidence and reasoning."""

    column_name: str
    confidence: str  # "High" | "Medium" | "Low"
    suggested_task: str  # "Classification" | "Regression"
    reasoning: str


class FeatureRecommendation(BaseModel):
    """Specific action recommendation for an individual dataset feature."""

    column_name: str
    recommended_action: str  # "keep" | "drop" | "encode" | "scale" | "impute"
    reasoning: str


class DatasetRecommendationResponse(BaseModel):
    """Structured response returned by GET /api/v1/datasets/{dataset_id}/recommendations."""

    dataset_id: str
    filename: str
    overall_readiness: str  # "Ready for Training" | "Needs Cleaning" | "Critical Remediation Required"
    readiness_reasoning: str
    recommended_problem_type: str  # "Classification" | "Regression" | "Clustering" | "Anomaly Detection" | "Time Series"
    problem_type_confidence: float
    problem_type_reasoning: str
    recommended_models: list[str] = Field(default_factory=list)
    recommended_preprocessing: list[str] = Field(default_factory=list)
    target_suggestions: list[TargetSuggestion] = Field(default_factory=list)
    feature_recommendations: list[FeatureRecommendation] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)

    model_config = {"from_attributes": True}
