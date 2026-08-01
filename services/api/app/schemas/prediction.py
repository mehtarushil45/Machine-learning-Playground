"""Prediction Pydantic Schemas — Sprint 6.

Defines all input and output request/response models for single, batch,
and CSV inference API endpoints.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Union
from pydantic import BaseModel, Field


class PredictionRequest(BaseModel):
    """Payload for single record or row-wise inference requests."""

    data: Union[Dict[str, Any], List[Dict[str, Any]], List[Any]] = Field(
        ...,
        description="Feature dictionary for a single sample or list of samples",
    )
    model_id: Optional[str] = Field(
        None,
        description="Registered model ID. If omitted, the latest ACTIVE model is used.",
    )
    algorithm: Optional[str] = Field(
        None,
        description="Algorithm filter when model_id is omitted (e.g. 'Random Forest Classifier')",
    )
    dataset_id: Optional[str] = Field(
        None,
        description="Dataset ID filter when model_id is omitted",
    )
    return_probabilities: bool = Field(
        True,
        description="If True, includes class probability distributions for classification tasks",
    )


class BatchPredictionRequest(BaseModel):
    """Payload for batch JSON inference requests."""

    data: List[Dict[str, Any]] = Field(
        ...,
        description="List of feature dictionaries to run inference on",
    )
    model_id: Optional[str] = Field(
        None,
        description="Registered model ID. If omitted, the latest ACTIVE model is used.",
    )
    algorithm: Optional[str] = Field(None, description="Algorithm filter")
    dataset_id: Optional[str] = Field(None, description="Dataset ID filter")
    return_probabilities: bool = Field(True, description="Include class probabilities")
    batch_size: int = Field(
        1000,
        ge=1,
        le=50000,
        description="Chunk size for batch processing",
    )


class PredictionProbability(BaseModel):
    """Single class probability entry."""

    class_name: str = Field(..., description="Class name or label")
    probability: float = Field(..., description="Estimated class probability [0.0 - 1.0]")


class PredictionMetadata(BaseModel):
    """Metadata attached to an inference response."""

    prediction_id: str = Field(..., description="Unique UUID for this prediction request")
    model_id: str = Field(..., description="Model ID used for inference")
    model_version: str = Field(..., description="Model semantic version string")
    experiment_id: Optional[str] = Field(None, description="Associated experiment UUID")
    algorithm: str = Field(..., description="Model algorithm name")
    problem_type: str = Field(..., description="Resolved ML problem type")
    latency_ms: float = Field(..., description="Inference execution duration in milliseconds")
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    feature_count: int = Field(..., description="Number of input features used")


class PredictionResponse(BaseModel):
    """Response structure for a single inference request."""

    prediction: Any = Field(..., description="Predicted class label or regression value")
    confidence: Optional[float] = Field(
        None,
        description="Highest class probability or prediction confidence score",
    )
    probabilities: Optional[Dict[str, float]] = Field(
        None,
        description="Class probability dictionary {class_label: probability}",
    )
    metadata: PredictionMetadata


class BatchPredictionResponse(BaseModel):
    """Response structure for batch inference requests."""

    total_samples: int = Field(..., description="Total number of input samples processed")
    successful_predictions: int = Field(..., description="Count of successfully predicted samples")
    failed_predictions: int = Field(..., description="Count of failed samples")
    predictions: List[PredictionResponse] = Field(..., description="List of prediction results")
    latency_ms: float = Field(..., description="Total batch inference latency in milliseconds")
    metadata: PredictionMetadata
    csv_download_url: Optional[str] = Field(
        None,
        description="URL or endpoint path to download output CSV if batch export was requested",
    )


class ValidationErrorResponse(BaseModel):
    """Structured error payload for feature schema or validation failures."""

    error_type: str = Field(..., description="Validation error classification")
    message: str = Field(..., description="Human-readable error summary")
    details: Dict[str, Any] = Field(
        default_factory=dict,
        description="Detailed list of missing/corrupted columns or invalid types",
    )
