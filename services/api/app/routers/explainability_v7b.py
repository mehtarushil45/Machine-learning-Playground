"""Extended Explainability & Ethics Router — V7B Part 2.

Additional endpoints:
  POST /api/v1/explainability/ethics        — Ethics score
  POST /api/v1/explainability/trust-report  — Full trust report
  POST /api/v1/explainability/bias-summary  — Multi-attribute bias summary
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status

from app.ml.ethics_engine import (
    compute_ethics_score,
    generate_bias_summary,
    generate_trust_report,
)

from app.dependencies import CurrentUser

router = APIRouter(
    prefix="/explainability",
    tags=["Explainability & Ethics (V7B)"],
    dependencies=[Depends(CurrentUser)],  # ← all ethics/trust endpoints require auth
)


class EthicsRequest:
    pass  # Defined inline below using Pydantic


from pydantic import BaseModel, Field


class EthicsScoreRequest(BaseModel):
    model_id: str
    governance_state: Optional[str] = None
    fairness_results: Optional[Dict[str, Any]] = None
    feature_importance: Optional[Dict[str, float]] = None


class TrustReportRequest(BaseModel):
    model_id: str
    governance_state: Optional[str] = None
    fairness_results: Optional[Dict[str, Any]] = None
    feature_importance: Optional[Dict[str, float]] = None
    explainability_summary: Optional[str] = None


class BiasSummaryRequest(BaseModel):
    model_id: str
    sample_data: List[Dict[str, Any]] = Field(..., description="Labeled dataset rows")
    sensitive_columns: List[str] = Field(..., description="Columns to audit for bias")
    target_column: str = Field(..., description="Target/outcome column name")


@router.post("/ethics", response_model=Dict[str, Any], summary="Compute model ethics score")
async def compute_model_ethics(request: EthicsScoreRequest) -> Dict[str, Any]:
    """Compute a composite ethics score based on fairness, transparency, and governance."""
    try:
        return compute_ethics_score(
            model_id=request.model_id,
            fairness_results=request.fairness_results,
            feature_importance=request.feature_importance,
            governance_state=request.governance_state,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ethics score computation failed: {str(exc)}",
        )


@router.post("/trust-report", response_model=Dict[str, Any], summary="Generate model trust report")
async def generate_model_trust_report(request: TrustReportRequest) -> Dict[str, Any]:
    """Generate a comprehensive trust report covering ethics, fairness, and governance."""
    try:
        ethics = compute_ethics_score(
            model_id=request.model_id,
            fairness_results=request.fairness_results,
            feature_importance=request.feature_importance,
            governance_state=request.governance_state,
        )
        return generate_trust_report(
            model_id=request.model_id,
            ethics_score=ethics,
            fairness_results=request.fairness_results,
            feature_importance=request.feature_importance,
            explainability_summary=request.explainability_summary,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Trust report generation failed: {str(exc)}",
        )


@router.post("/bias-summary", response_model=Dict[str, Any], summary="Multi-attribute bias summary")
async def compute_bias_summary(request: BiasSummaryRequest) -> Dict[str, Any]:
    """Audit a model across multiple sensitive attributes for bias detection."""
    try:
        return generate_bias_summary(
            model_id=request.model_id,
            sample_data=request.sample_data,
            sensitive_columns=request.sensitive_columns,
            target_column=request.target_column,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Bias summary failed: {str(exc)}",
        )
