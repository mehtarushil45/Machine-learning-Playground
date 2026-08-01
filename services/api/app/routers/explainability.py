"""Explainability, Fairness & What-If REST API Router — Phase 3.

Provides REST endpoints for:
  - Global Feature Importance & SHAP: POST /api/v1/explainability/global
  - Local Prediction Force Waterfall: POST /api/v1/explainability/local
  - Demographic Fairness & Bias Audit: POST /api/v1/explainability/fairness
  - Counterfactual "What-If" Simulation: POST /api/v1/explainability/what-if
"""

from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, HTTPException, status

from app.ml.explainability_engine import (
    compute_global_explainability,
    compute_local_explainability,
)
from app.ml.fairness_checker import (
    audit_model_fairness,
    simulate_what_if_counterfactual,
)
from app.schemas.explainability import (
    FairnessAuditRequest,
    FairnessAuditResponse,
    GlobalExplainabilityRequest,
    GlobalExplainabilityResponse,
    LocalExplainabilityRequest,
    LocalExplainabilityResponse,
    WhatIfRequest,
    WhatIfResponse,
)

router = APIRouter(prefix="/explainability", tags=["Explainability & Fairness Suite"])


@router.post(
    "/global",
    response_model=GlobalExplainabilityResponse,
    summary="Compute global feature importance & model explanation",
)
async def global_explainability_endpoint(
    request: GlobalExplainabilityRequest,
) -> GlobalExplainabilityResponse:
    """Retrieve global model feature importances, impact percentages, and student summary."""
    try:
        return compute_global_explainability(
            model_id=request.model_id,
            sample_data=request.sample_data,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Global explainability calculation failed: {str(exc)}",
        )


@router.post(
    "/local",
    response_model=LocalExplainabilityResponse,
    summary="Compute local prediction SHAP/waterfall forces",
)
async def local_explainability_endpoint(
    request: LocalExplainabilityRequest,
) -> LocalExplainabilityResponse:
    """Compute local feature contribution forces for a single prediction record."""
    try:
        return compute_local_explainability(
            sample=request.sample,
            model_id=request.model_id,
            target_class=request.target_class,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Local explainability calculation failed: {str(exc)}",
        )


@router.post(
    "/fairness",
    response_model=FairnessAuditResponse,
    summary="Audit model predictions for demographic bias & fairness",
)
async def fairness_audit_endpoint(
    request: FairnessAuditRequest,
) -> FairnessAuditResponse:
    """Audit model predictions across demographic subgroups for Disparate Impact and Parity metrics."""
    try:
        return audit_model_fairness(
            sample_data=request.sample_data,
            sensitive_column=request.sensitive_column,
            privileged_group=request.privileged_group,
            unprivileged_group=request.unprivileged_group,
            target_column=request.target_column,
            model_id=request.model_id,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Fairness audit failed: {str(exc)}",
        )


@router.post(
    "/what-if",
    response_model=WhatIfResponse,
    summary="Simulate counterfactual feature modifications",
)
async def what_if_simulation_endpoint(
    request: WhatIfRequest,
) -> WhatIfResponse:
    """Simulate minimal feature changes required to achieve a desired model prediction outcome."""
    try:
        return simulate_what_if_counterfactual(
            sample=request.sample,
            desired_outcome=request.desired_outcome,
            model_id=request.model_id,
            mutable_features=request.mutable_features,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"What-If counterfactual simulation failed: {str(exc)}",
        )
