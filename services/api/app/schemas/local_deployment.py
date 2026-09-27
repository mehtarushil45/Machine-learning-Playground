"""LocalDeployment Pydantic schemas — Prototype 4."""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class LocalDeploymentCreate(BaseModel):
    """Request payload to create a local deployment from a completed training job."""

    job_id: str = Field(..., description="ID of a COMPLETED training job")
    name: str = Field("Local Deployment", max_length=255, description="Display name for the deployment")


class LogEntry(BaseModel):
    ts: str
    msg: str


class FeatureSchemaEntry(BaseModel):
    type: str = Field(..., description="'numeric' or 'categorical'")
    categories: Optional[List[str]] = Field(None, description="Unique values for categorical features")
    min: Optional[float] = Field(None, description="Min value hint for numeric features")
    max: Optional[float] = Field(None, description="Max value hint for numeric features")


class LocalDeploymentResponse(BaseModel):
    """Full deployment record returned to the frontend."""

    deployment_id: str
    job_id: str
    model_id: str
    name: str
    status: str = Field(..., description="CREATED|DEPLOYING|READY|FAILED|STOPPING|STOPPED")
    algorithm: str
    problem_type: str
    dataset_id: str
    target_column: str
    feature_columns: List[str]
    input_schema: Dict[str, Any]
    error_message: Optional[str] = None
    started_at: Optional[str] = None
    stopped_at: Optional[str] = None
    created_at: str
    logs: List[Dict[str, str]]
    total_predictions: int = 0
    endpoint_path: str = Field(..., description="Relative path: /api/v1/local-deployments/{id}/predict")


class LocalPredictRequest(BaseModel):
    """Feature values for a single-row prediction."""

    inputs: Dict[str, Any] = Field(
        ...,
        description="Feature name -> value dict. All feature_columns must be present.",
        examples=[{"age": 30, "income": 50000, "category": "A"}],
    )


class LocalPredictResponse(BaseModel):
    """Prediction result returned from a local deployment."""

    deployment_id: str
    job_id: str
    model_id: str
    prediction: Any
    probabilities: Optional[Dict[str, float]] = None
    confidence: Optional[float] = None
    problem_type: str
    latency_ms: float
    timestamp: str
