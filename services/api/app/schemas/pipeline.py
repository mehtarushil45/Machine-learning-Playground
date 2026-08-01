"""Visual Pipeline & Code Generation Pydantic Schemas — Phase 2.

Defines request/response contracts for visual drag-and-drop ML pipeline DAGs,
node validation, and "View as Code" Python code generation.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class PipelineNodeConfig(BaseModel):
    """Configuration for a single block/node in a visual ML pipeline."""

    node_id: str = Field(..., description="Unique node identifier in canvas", example="node-1")
    type: str = Field(
        ...,
        description="Node type category",
        example="missing_value_handler",
    )
    name: str = Field(..., description="Display label for the node", example="Impute Missing Values")
    params: Dict[str, Any] = Field(
        default_factory=dict,
        description="Parameters for this node (e.g. strategy='median', scaler_type='standard')",
    )


class PipelineConnection(BaseModel):
    """Directed connection between two visual nodes."""

    from_node: str = Field(..., description="Source node_id")
    to_node: str = Field(..., description="Destination node_id")


class PipelineDAG(BaseModel):
    """Complete visual pipeline Directed Acyclic Graph payload."""

    dataset_name: str = Field("dataset.csv", description="CSV file path or dataset name")
    target_column: str = Field(..., description="Target column name to predict", example="target")
    feature_columns: List[str] = Field(
        ...,
        description="List of feature columns to include",
        example=["age", "income", "credit_score"],
    )
    nodes: List[PipelineNodeConfig] = Field(..., description="Ordered or linked pipeline nodes")
    connections: List[PipelineConnection] = Field(
        default_factory=list,
        description="Optional directed edges between nodes",
    )


class CodeGenerationRequest(BaseModel):
    """Request payload for converting a visual pipeline into executable Python code."""

    pipeline: PipelineDAG = Field(..., description="Visual pipeline DAG specification")
    include_comments: bool = Field(True, description="Include detailed code comments")
    include_evaluation: bool = Field(True, description="Include model evaluation & metrics block")


class CodeStepExplanation(BaseModel):
    """Step-by-step plain language explanation matching a generated code block."""

    step_number: int = Field(..., description="Sequential step index")
    node_id: str = Field(..., description="Associated visual node ID")
    node_type: str = Field(..., description="Node category")
    title: str = Field(..., description="Step title")
    explanation: str = Field(..., description="Plain-language educational explanation of what this step does")
    code_snippet: str = Field(..., description="Corresponding Python code snippet")


class CodeGenerationResponse(BaseModel):
    """Response containing complete generated Python code and educational annotations."""

    python_code: str = Field(..., description="Fully executable standalone Python script")
    steps_explanation: List[CodeStepExplanation] = Field(
        ...,
        description="Annotated step-by-step breakdown for learning mode",
    )
    is_valid_syntax: bool = Field(..., description="True if generated Python code passed AST compilation")
    imports: List[str] = Field(..., description="List of required Python library imports")
    generated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class PipelineValidationResponse(BaseModel):
    """Response structure for visual pipeline validation."""

    is_valid: bool = Field(..., description="True if pipeline DAG has no critical errors")
    errors: List[str] = Field(default_factory=list, description="Critical structural or missing node errors")
    warnings: List[str] = Field(default_factory=list, description="Optimization or best-practice warnings")
