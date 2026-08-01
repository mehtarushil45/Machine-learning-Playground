"""Deployment Studio & Embeddable Web Widget Schemas — Phase 5.

Defines Pydantic request and response models for model endpoint deployments,
API key generation, web widget snippets, and public inference.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class DeploymentCreate(BaseModel):
    model_id: str = Field(..., description="Model ID from registry to deploy", example="model-89316c9a")
    deployment_name: str = Field("Production Model Endpoint", description="Display name for deployment", example="Churn Predictor API")
    rate_limit_rpm: int = Field(60, ge=1, le=1000, description="Rate limit in requests per minute")
    allowed_origins: List[str] = Field(default_factory=lambda: ["*"], description="CORS allowed origin domains")
    require_api_key: bool = Field(True, description="If True, requests require X-API-Key header authentication")


class DeploymentResponse(BaseModel):
    deployment_id: str = Field(..., description="Unique deployment identifier")
    model_id: str = Field(..., description="Target model ID")
    deployment_name: str = Field(..., description="Deployment label")
    api_key: str = Field(..., description="Secret API key for authentication")
    endpoint_url: str = Field(..., description="Public REST endpoint URL")
    status: str = Field("ACTIVE", description="Deployment state: 'ACTIVE', 'PAUSED', 'REVOKED'")
    rate_limit_rpm: int = Field(..., description="Configured rate limit RPM")
    total_requests: int = Field(0, description="Total API requests served")
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class IntegrationSnippets(BaseModel):
    curl_snippet: str = Field(..., description="cURL command example")
    python_snippet: str = Field(..., description="Python requests SDK snippet")
    javascript_snippet: str = Field(..., description="JavaScript fetch SDK snippet")
    embeddable_widget_html: str = Field(..., description="Standalone HTML/JS iframe widget code")


class DeploymentPredictRequest(BaseModel):
    features: Dict[str, Any] = Field(..., description="Input feature dictionary for prediction", example={"age": 30, "income": 50000})


class DeploymentPredictResponse(BaseModel):
    prediction: Any = Field(..., description="Predicted class or numerical regression value")
    confidence: Optional[float] = Field(None, description="Confidence score")
    probabilities: Optional[Dict[str, float]] = Field(None, description="Class probabilities if applicable")
    latency_ms: float = Field(..., description="Prediction execution latency in milliseconds")
    deployment_id: str = Field(..., description="Deployment ID processed")
