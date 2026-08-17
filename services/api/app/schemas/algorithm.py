"""Pydantic schemas for the Supported Algorithms Catalog."""

from __future__ import annotations

from typing import Any, Optional
from pydantic import BaseModel, Field


class SupportedAlgorithmItem(BaseModel):
    """Catalog metadata and availability for a single algorithm."""

    id: str = Field(..., description="Stable machine-readable algorithm identifier")
    key: str = Field(..., description="Algorithm key (alias for id)")
    display_name: str = Field(..., description="Human-readable algorithm name")
    task_type: str = Field(..., description="Supported supervised task ('classification' or 'regression')")
    category: str = Field(..., description="Algorithmic family/category")
    supports_sparse_input: bool = Field(default=True, description="Whether estimator accepts sparse matrices")
    supports_missing_values: bool = Field(default=False, description="Whether estimator natively handles NaN/missing values")
    supports_multiclass: bool = Field(default=True, description="Whether estimator supports multiclass classification")
    expected_cost: str = Field(default="medium", description="Expected compute cost tier ('low', 'medium', 'high')")
    default_hyperparameters: dict[str, Any] = Field(default_factory=dict, description="Default hyperparameter map")
    recommendation_tier: str = Field(default="screening_default", description="Benchmark tier ('screening_default', 'verification_only', 'manual_only')")
    max_safe_rows: Optional[int] = Field(default=None, description="Safe maximum row limit before expensive memory/time scaling")
    is_available: bool = Field(default=True, description="Whether required runtime dependencies are installed")
    unavailable_reason: Optional[str] = Field(default=None, description="Explanation if algorithm is currently unavailable")

    model_config = {"from_attributes": True}


class SupportedAlgorithmsResponse(BaseModel):
    """Response returned by GET /api/v1/algorithms/supported."""

    total: int = Field(..., description="Total count of registered algorithms")
    algorithms: list[SupportedAlgorithmItem] = Field(default_factory=list, description="List of algorithm definitions")

    model_config = {"from_attributes": True}
