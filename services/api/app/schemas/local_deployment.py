"""LocalDeployment Pydantic schemas — Enterprise Deployment & Lifecycle Management."""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class LocalDeploymentCreate(BaseModel):
    """Request payload to create a local deployment from a completed training job or registered model."""

    job_id: Optional[str] = Field(None, description="ID of a COMPLETED training job")
    model_id: Optional[str] = Field(None, description="ID of a registered model from ModelRegistry")
    name: str = Field("Local Deployment", max_length=255, description="Display name for the deployment")
    configuration: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Custom serving configuration")


class LocalDeploymentUpdate(BaseModel):
    """Update metadata or configuration for an existing deployment."""

    name: Optional[str] = Field(None, max_length=255)
    configuration: Optional[Dict[str, Any]] = None


class LocalDeploymentRedeploy(BaseModel):
    """Redeploy current deployment, optionally updating to a new model artifact version."""

    job_id: Optional[str] = Field(None, description="Optional new COMPLETED job ID to upgrade model version")
    model_id: Optional[str] = Field(None, description="Optional new model ID from registry")
    name: Optional[str] = Field(None, description="Optional new display name")


class LogEntry(BaseModel):
    ts: str
    msg: str
    event: Optional[str] = None
    severity: Optional[str] = "INFO"


class FeatureSchemaEntry(BaseModel):
    type: str = Field(..., description="'numeric', 'categorical', 'boolean', or 'text'")
    categories: Optional[List[str]] = Field(None, description="Unique values for categorical features")
    min: Optional[float] = Field(None, description="Min value hint for numeric features")
    max: Optional[float] = Field(None, description="Max value hint for numeric features")


class LocalDeploymentResponse(BaseModel):
    """Full deployment record returned to the frontend."""

    deployment_id: str
    job_id: str
    model_id: str
    model_version: str = "v1.0.0"
    artifact_id: str = ""
    name: str
    status: str = Field(..., description="STARTING|RUNNING|READY|FAILED|STOPPING|STOPPED")
    algorithm: str
    problem_type: str
    dataset_id: str
    target_column: str
    feature_columns: List[str]
    input_schema: Dict[str, Any]
    configuration: Dict[str, Any] = Field(default_factory=dict)
    error_message: Optional[str] = None
    started_at: Optional[str] = None
    stopped_at: Optional[str] = None
    created_at: str
    logs: List[Dict[str, Any]]
    total_predictions: int = 0
    endpoint_path: str = Field(..., description="Relative path: /api/v1/local-deployments/{id}/predict")
    sample_inputs: Optional[Dict[str, Any]] = None
    metrics: Optional[Dict[str, Any]] = None
    dataset_name: Optional[str] = None
    algorithm_display_name: Optional[str] = None


class LocalPredictRequest(BaseModel):
    """Feature values for a single-row prediction."""

    inputs: Dict[str, Any] = Field(
        ...,
        description="Feature name -> value dict. All feature_columns must be present.",
        examples=[{"age": 30, "income": 50000, "course": "Science"}],
    )


class LocalPredictResponse(BaseModel):
    """Prediction result returned from a local deployment."""

    inference_id: Optional[str] = None
    deployment_id: str
    job_id: str
    model_id: str
    model_version: str = "v1.0.0"
    prediction: Any
    probabilities: Optional[Dict[str, float]] = None
    confidence: Optional[float] = None
    problem_type: str
    latency_ms: float
    timestamp: str
    status: str = "SUCCESS"


class PredictionHistoryItem(BaseModel):
    """Persisted prediction record for audit and evaluation."""

    id: str
    deployment_id: str
    model_id: str
    model_version: str
    inputs: Dict[str, Any]
    prediction: Any
    confidence: Optional[float] = None
    probabilities: Optional[Dict[str, float]] = None
    latency_ms: float
    status: str
    error_message: Optional[str] = None
    created_at: str


class ModelVersionOption(BaseModel):
    """Available model version in the registry for redeployment."""

    model_id: str
    job_id: Optional[str] = None
    version: str
    algorithm: str
    algorithm_display_name: str
    registered_at: str
    accuracy: Optional[float] = None
    f1: Optional[float] = None
    is_current: bool = False


class LocalBatchPredictRequest(BaseModel):
    """Batch prediction request via JSON record collection."""

    data: List[Dict[str, Any]] = Field(..., description="List of feature name -> value dicts.")
    batch_size: Optional[int] = Field(1000, ge=1, le=10000, description="Processing chunk batch size")
    return_probabilities: Optional[bool] = Field(True, description="Compute probability distributions for classification")


class LocalBatchPredictResponse(BaseModel):
    """Batch prediction outcome summary returned from a local deployment."""

    deployment_id: str
    total_samples: int
    successful_predictions: int
    failed_predictions: int = 0
    predictions_preview: List[Dict[str, Any]] = Field(default_factory=list, description="First N predictions for preview")
    class_distribution: Optional[Dict[str, int]] = Field(None, description="Frequency per predicted class")
    avg_confidence: Optional[float] = Field(None, description="Average prediction confidence")
    latency_ms: float
    download_url: Optional[str] = Field(None, description="URL to download the full enriched CSV")
    status: str = "SUCCESS"
    timestamp: str

