"""Visual Pipelines & Code Generation REST API Router — Phase 2.

Endpoints for:
  - Generating Python code from visual pipelines: POST /api/v1/pipelines/generate-code
  - Validating visual pipeline DAGs: POST /api/v1/pipelines/validate
  - Listing pre-built pipeline templates: GET /api/v1/pipelines/templates
"""

from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, status

from app.ml.code_generator import (
    generate_python_code,
    get_preset_pipeline_templates,
    validate_pipeline_dag,
)
from app.schemas.pipeline import (
    CodeGenerationRequest,
    CodeGenerationResponse,
    PipelineDAG,
    PipelineValidationResponse,
)

from app.dependencies import get_current_user

router = APIRouter(
    prefix="/pipelines",
    tags=["Visual Pipelines & Code Studio"],
    dependencies=[Depends(get_current_user)],  # ← all pipeline endpoints require auth
)


@router.post(
    "/generate-code",
    response_model=CodeGenerationResponse,
    summary="Convert visual pipeline DAG to Python code",
)
async def generate_code_endpoint(
    request: CodeGenerationRequest,
) -> CodeGenerationResponse:
    """Convert visual drag-and-drop pipeline nodes into standalone, executable Python script."""
    # 1. Validate DAG structure first
    val_res = validate_pipeline_dag(request.pipeline)
    if not val_res.is_valid:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid pipeline DAG: {'; '.join(val_res.errors)}",
        )

    # 2. Generate code & annotations
    code_res = generate_python_code(
        pipeline=request.pipeline,
        include_comments=request.include_comments,
        include_evaluation=request.include_evaluation,
    )
    return code_res


@router.post(
    "/validate",
    response_model=PipelineValidationResponse,
    summary="Validate visual pipeline DAG configuration",
)
async def validate_pipeline_endpoint(
    pipeline: PipelineDAG,
) -> PipelineValidationResponse:
    """Validate visual node parameters, target column, feature columns, and missing algorithm nodes."""
    return validate_pipeline_dag(pipeline)


@router.get(
    "/templates",
    summary="Get preset visual pipeline templates",
)
async def get_pipeline_templates() -> Dict[str, PipelineDAG]:
    """Retrieve standard pre-configured visual pipeline templates for learning mode."""
    return get_preset_pipeline_templates()
