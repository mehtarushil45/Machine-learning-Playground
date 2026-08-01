"""Explainability, Fairness & What-If Analyzer Schemas — Phase 3.

Defines Pydantic request and response contracts for:
  - Global Model Explainability & SHAP feature importances
  - Local Prediction Force/Waterfall explanations & student summaries
  - Demographic Fairness & Bias Auditing
  - Counterfactual "What-If" prediction simulations
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


# ── 1. Global Explainability Schemas ──────────────────────────────────────────

class GlobalExplainabilityRequest(BaseModel):

    model_id: Optional[str] = Field(None, description="Model ID to analyze. If omitted, latest ACTIVE model is used.")
    sample_data: Optional[List[Dict[str, Any]]] = Field(None, description="Optional background dataset samples for SHAP/Permutation calculation.")


class FeatureImpact(BaseModel):

    feature_name: str = Field(..., description="Feature column name")
    importance_score: float = Field(..., description="Normalized feature importance score [0.0 - 1.0]")
    impact_percentage: float = Field(..., description="Percentage contribution to model decisions")
    direction: str = Field("neutral", description="Overall direction: 'positive', 'negative', or 'neutral'")


class GlobalExplainabilityResponse(BaseModel):

    model_id: str = Field(..., description="Model ID analyzed")
    algorithm: str = Field(..., description="Algorithm name")
    problem_type: str = Field(..., description="ML problem type")
    global_feature_importance: List[FeatureImpact] = Field(..., description="Sorted feature importances")
    summary_explanation: str = Field(..., description="Plain-language summary of global model behavior")


# ── 2. Local Explainability Schemas ───────────────────────────────────────────

class LocalExplainabilityRequest(BaseModel):

    sample: Dict[str, Any] = Field(..., description="Single sample record feature values", example={"age": 45, "income": 65000})
    model_id: Optional[str] = Field(None, description="Target model ID")
    target_class: Optional[str] = Field(None, description="Specific target class label for classification")


class FeatureContribution(BaseModel):

    feature_name: str = Field(..., description="Feature name")
    feature_value: Any = Field(..., description="Original value of the feature in this record")
    contribution_score: float = Field(..., description="SHAP / Local contribution weight (+ or -)")
    impact_direction: str = Field(..., description="'increases_prediction' or 'decreases_prediction'")
    plain_language_reason: str = Field(..., description="Educational explanation for learners")


class LocalExplainabilityResponse(BaseModel):

    prediction_id: str = Field(..., description="Unique ID for local explanation request")
    model_id: str = Field(..., description="Model ID used")
    prediction: Any = Field(..., description="Predicted class or regression value")
    confidence: Optional[float] = Field(None, description="Confidence score")
    base_value: float = Field(..., description="Baseline expected value for model")
    contributions: List[FeatureContribution] = Field(..., description="Local feature force contributions")
    student_summary: str = Field(..., description="Non-technical student-friendly explanation of prediction drivers")


# ── 3. Fairness & Bias Audit Schemas ──────────────────────────────────────────

class FairnessAuditRequest(BaseModel):

    sample_data: List[Dict[str, Any]] = Field(..., description="Dataset records to evaluate for bias")
    sensitive_column: str = Field(..., description="Protected attribute column (e.g. 'gender', 'age_group')")
    privileged_group: Any = Field(..., description="Privileged group value (e.g. 'Male', 'Young')")
    unprivileged_group: Any = Field(..., description="Unprivileged group value (e.g. 'Female', 'Senior')")
    target_column: Optional[str] = Field(None, description="Ground truth target column if available")
    model_id: Optional[str] = Field(None, description="Target model ID")


class FairnessMetricItem(BaseModel):

    metric_name: str = Field(..., description="Name of fairness metric (e.g. 'Disparate Impact Ratio')")
    value: float = Field(..., description="Computed metric value")
    threshold: float = Field(..., description="Ideal target threshold")
    status: str = Field(..., description="'PASS', 'WARNING', or 'FAIL'")
    explanation: str = Field(..., description="Explanation of fairness implications")


class FairnessAuditResponse(BaseModel):

    sensitive_column: str = Field(..., description="Protected attribute evaluated")
    privileged_group: str = Field(..., description="Privileged group label")
    unprivileged_group: str = Field(..., description="Unprivileged group label")
    disparate_impact_ratio: float = Field(..., description="Disparate Impact Ratio (80% rule standard)")
    equal_opportunity_difference: float = Field(..., description="True positive rate difference")
    demographic_parity_ratio: float = Field(..., description="Ratio of selection rates")
    overall_status: str = Field(..., description="Overall bias assessment: 'PASS', 'WARNING', or 'FAIL'")
    metrics: List[FairnessMetricItem] = Field(..., description="Detailed fairness metric breakdown")
    recommendation: str = Field(..., description="Actionable recommendation for mitigation")


# ── 4. What-If Counterfactual Schemas ─────────────────────────────────────────

class WhatIfRequest(BaseModel):

    sample: Dict[str, Any] = Field(..., description="Baseline feature sample")
    desired_outcome: Any = Field(..., description="Target desired prediction outcome (e.g. 'Approved', 1, or 750)")
    model_id: Optional[str] = Field(None, description="Model ID")
    mutable_features: Optional[List[str]] = Field(None, description="Features allowed to be modified")


class FeatureChange(BaseModel):

    feature_name: str = Field(..., description="Feature name changed")
    original_value: Any = Field(..., description="Baseline value")
    new_value: Any = Field(..., description="Required new value")
    delta: float = Field(..., description="Numeric difference (+/-)")
    impact: str = Field(..., description="Impact description")


class WhatIfResponse(BaseModel):

    original_prediction: Any = Field(..., description="Baseline prediction before change")
    desired_prediction: Any = Field(..., description="Target outcome requested")
    is_outcome_achieved: bool = Field(..., description="True if counterfactual achieved desired outcome")
    new_confidence: float = Field(..., description="Confidence level under modified features")
    suggested_changes: List[FeatureChange] = Field(..., description="Minimal feature modifications required")
    explanation: str = Field(..., description="Plain-language counterfactual summary")
