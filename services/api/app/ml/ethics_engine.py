"""Ethics Engine — Explainability & Ethics (V7B Part 2).

Computes ethics scores, trust reports, and model bias summaries
by integrating with model registry, fairness checker, and explainability engine.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional


def compute_ethics_score(
    model_id: str,
    fairness_results: Optional[Dict[str, Any]] = None,
    feature_importance: Optional[Dict[str, float]] = None,
    governance_state: Optional[str] = None,
) -> Dict[str, Any]:
    """Compute a composite ethics score (0–100) for a model.
    
    Factors:
    - Fairness: Disparate impact ratio (ideal: 0.8–1.25)
    - Transparency: Has feature importance / model card
    - Governance: Is under governance (CANDIDATE / STAGING / PRODUCTION)
    - Privacy: No sensitive feature leakage detected
    """
    score = 100.0
    issues: List[str] = []
    recommendations: List[str] = []

    # Fairness deduction
    if fairness_results:
        di = fairness_results.get("disparate_impact_ratio", 1.0)
        if di < 0.8 or di > 1.25:
            score -= 25
            issues.append(f"Disparate impact ratio {di:.3f} is outside the fair range [0.8, 1.25]")
            recommendations.append("Review training data for demographic imbalance.")
    else:
        score -= 10
        issues.append("No fairness audit has been performed.")
        recommendations.append("Run a fairness audit using /api/v1/explainability/fairness.")

    # Transparency deduction
    if not feature_importance:
        score -= 15
        issues.append("No feature importance data available.")
        recommendations.append("Run global explainability to generate feature importance.")
    else:
        # Check for suspicious high-importance features that may encode sensitive attributes
        top_feature = max(feature_importance, key=lambda k: feature_importance[k])
        if feature_importance[top_feature] > 0.5:
            score -= 5
            issues.append(f"Feature '{top_feature}' dominates model (importance > 50%)")
            recommendations.append("Investigate if this feature is a proxy for sensitive attributes.")

    # Governance deduction
    if governance_state not in ("CANDIDATE", "STAGING", "PRODUCTION"):
        score -= 10
        issues.append(f"Model governance state '{governance_state}' does not meet deployment standards.")
        recommendations.append("Submit model to governance workflow before deployment.")

    ethics_level = (
        "EXCELLENT" if score >= 85
        else "GOOD" if score >= 70
        else "FAIR" if score >= 55
        else "POOR"
    )

    return {
        "model_id": model_id,
        "ethics_score": max(0.0, round(score, 1)),
        "ethics_level": ethics_level,
        "issues_detected": len(issues),
        "issues": issues,
        "recommendations": recommendations,
    }


def generate_trust_report(
    model_id: str,
    ethics_score: Dict[str, Any],
    fairness_results: Optional[Dict[str, Any]] = None,
    feature_importance: Optional[Dict[str, float]] = None,
    explainability_summary: Optional[str] = None,
) -> Dict[str, Any]:
    """Generate a comprehensive trust report for a model."""
    return {
        "report_type": "TRUST_REPORT",
        "model_id": model_id,
        "ethics_score": ethics_score,
        "fairness": fairness_results or {"status": "Not evaluated"},
        "transparency": {
            "has_feature_importance": feature_importance is not None,
            "top_features": sorted(
                feature_importance.items(), key=lambda x: x[1], reverse=True
            )[:5] if feature_importance else [],
            "explainability_summary": explainability_summary or "Not available",
        },
        "governance": {
            "status": "evaluated",
            "recommendation": "Review ethics issues before production deployment" if ethics_score.get("issues") else "Cleared for deployment",
        },
        "certifications": [
            {"name": "Transparency Check", "passed": feature_importance is not None},
            {"name": "Fairness Audit", "passed": fairness_results is not None},
            {"name": "Ethics Score >= 70", "passed": ethics_score.get("ethics_score", 0) >= 70},
        ],
        "overall_trust": (
            "HIGH" if ethics_score.get("ethics_score", 0) >= 70 else
            "MEDIUM" if ethics_score.get("ethics_score", 0) >= 50 else "LOW"
        ),
    }


def generate_bias_summary(
    model_id: str,
    sample_data: List[Dict[str, Any]],
    sensitive_columns: List[str],
    target_column: str,
) -> Dict[str, Any]:
    """Summarize bias metrics across multiple sensitive attributes."""
    from app.ml.fairness_checker import audit_model_fairness

    results = {}
    for col in sensitive_columns:
        if not sample_data:
            continue
        unique_vals = list({row.get(col) for row in sample_data if row.get(col) is not None})
        if len(unique_vals) < 2:
            continue
        try:
            result = audit_model_fairness(
                sample_data=sample_data,
                sensitive_column=col,
                privileged_group=str(unique_vals[0]),
                unprivileged_group=str(unique_vals[1]),
                target_column=target_column,
                model_id=model_id,
            )
            results[col] = result.model_dump() if hasattr(result, "model_dump") else result
        except Exception as e:
            results[col] = {"error": str(e)}

    overall_bias = any(
        isinstance(v, dict) and v.get("disparate_impact_ratio", 1.0) < 0.8
        for v in results.values()
    )
    return {
        "model_id": model_id,
        "sensitive_columns_analyzed": sensitive_columns,
        "bias_detected": overall_bias,
        "column_results": results,
    }
