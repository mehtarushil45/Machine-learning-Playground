"""Enterprise ML Recommendation Engine Service.

Analyzes DatasetProfileResponse and DatasetHealthResponse (sources of truth)
and produces deterministic, explainable, and reproducible ML recommendations.

No LLM calls. No randomness. Pure, deterministic recommendation algorithms.
"""

from app.schemas.dataset import (
    DatasetHealthResponse,
    DatasetProfileResponse,
    DatasetRecommendationResponse,
    FeatureRecommendation,
    TargetSuggestion,
)


class RecommendationEngineService:
    """Enterprise ML Recommendation Engine."""

    def generate_recommendations(
        self, profile: DatasetProfileResponse, health: DatasetHealthResponse
    ) -> DatasetRecommendationResponse:
        """Produce deterministic ML recommendations from Profiler + Health Engine outputs."""
        warnings: list[str] = list(health.warnings)

        # ── 1. Overall Readiness Evaluation ──────────────────────────────────
        if health.health_score >= 85 and profile.empty_columns == 0:
            overall_readiness = "Ready for Training"
            readiness_reasoning = (
                f"Dataset health score is excellent ({health.health_score}/100) with zero empty columns "
                f"and clean feature distributions."
            )
        elif health.health_score >= 50:
            overall_readiness = "Needs Cleaning"
            readiness_reasoning = (
                f"Dataset health score is {health.health_score}/100 ({health.grade}). "
                f"Preprocessing (imputation, deduplication, or column removal) is recommended before model training."
            )
        else:
            overall_readiness = "Critical Remediation Required"
            readiness_reasoning = (
                f"Dataset health score is critical ({health.health_score}/100). "
                f"Remediate data quality defects ({health.summary}) prior to running ML pipelines."
            )

        # ── 2. Target Variable Suggestions ───────────────────────────────────
        target_suggestions: list[TargetSuggestion] = []
        target_keywords = {"target", "label", "class", "y", "response", "outcome", "status", "price", "sales"}

        for col in profile.columns:
            col_name_lower = col.name.lower()

            if col.type == "identifier":
                continue

            # High confidence target match via explicit name
            if col_name_lower in target_keywords or any(kw in col_name_lower for kw in ("target", "label", "class_")):
                task = "Classification" if col.type in ("categorical", "boolean") else "Regression"
                target_suggestions.append(
                    TargetSuggestion(
                        column_name=col.name,
                        confidence="High",
                        suggested_task=task,
                        reasoning=f"Column name '{col.name}' explicitly matches standard machine learning target keywords.",
                    )
                )
            # High confidence binary/discrete target
            elif col.type in ("categorical", "boolean") and 2 <= col.unique <= 20:
                target_suggestions.append(
                    TargetSuggestion(
                        column_name=col.name,
                        confidence="High" if col.name == profile.columns[-1].name else "Medium",
                        suggested_task="Classification",
                        reasoning=f"Discrete target candidate with {col.unique} unique category values.",
                    )
                )
            # Continuous numeric target
            elif col.type == "numeric" and col.unique > 10:
                target_suggestions.append(
                    TargetSuggestion(
                        column_name=col.name,
                        confidence="High" if col.name == profile.columns[-1].name else "Medium",
                        suggested_task="Regression",
                        reasoning=f"Continuous numeric target candidate with range [{col.statistics.get('min')}, {col.statistics.get('max')}].",
                    )
                )

        # Fallback if no target suggestions generated
        if not target_suggestions and profile.columns:
            last_col = profile.columns[-1]
            task = "Classification" if last_col.type in ("categorical", "boolean") else "Regression"
            target_suggestions.append(
                TargetSuggestion(
                    column_name=last_col.name,
                    confidence="Medium",
                    suggested_task=task,
                    reasoning=f"Positioned as the final column in dataset '{last_col.name}'.",
                )
            )

        # Sort target suggestions by confidence (High first)
        target_suggestions.sort(key=lambda t: 0 if t.confidence == "High" else 1)

        # ── 3. Problem Type & Model Architecture Recommendations ──────────────
        primary_target = target_suggestions[0] if target_suggestions else None
        datetime_cols = [c.name for c in profile.columns if c.type == "datetime"]

        if primary_target and primary_target.suggested_task == "Classification":
            recommended_problem_type = "Classification"
            problem_type_confidence = 0.95
            problem_type_reasoning = f"Primary target candidate '{primary_target.column_name}' is discrete classification."
            recommended_models = [
                "Random Forest Classifier",
                "XGBoost Classifier",
                "Logistic Regression",
                "Gradient Boosting Classifier",
            ]
        elif primary_target and primary_target.suggested_task == "Regression":
            recommended_problem_type = "Regression"
            problem_type_confidence = 0.90
            problem_type_reasoning = f"Primary target candidate '{primary_target.column_name}' is continuous numerical regression."
            recommended_models = [
                "Random Forest Regressor",
                "XGBoost Regressor",
                "Ridge / Lasso Regression",
                "Gradient Boosting Regressor",
            ]
        elif datetime_cols:
            recommended_problem_type = "Time Series"
            problem_type_confidence = 0.85
            problem_type_reasoning = f"Dataset contains datetime temporal feature '{datetime_cols[0]}'."
            recommended_models = [
                "ARIMA / SARIMAX",
                "Prophet",
                "LSTM / GRU Neural Network",
            ]
        else:
            recommended_problem_type = "Clustering"
            problem_type_confidence = 0.75
            problem_type_reasoning = "No explicit target variable specified; unsupervised feature clustering recommended."
            recommended_models = [
                "K-Means Clustering",
                "DBSCAN",
                "Hierarchical Agglomerative Clustering",
            ]

        # ── 4. Recommended Preprocessing Pipeline ─────────────────────────────
        recommended_preprocessing: list[str] = []

        if profile.duplicate_rows > 0:
            recommended_preprocessing.append("Duplicate Row Removal")

        if profile.empty_columns > 0:
            recommended_preprocessing.append("Empty Column Removal")

        if any(c.type == "identifier" for c in profile.columns):
            recommended_preprocessing.append("Identifier Column Dropping")

        if profile.total_missing_values > 0:
            recommended_preprocessing.append("Missing Value Imputation (Median / Mode)")

        if any(c.type in ("categorical", "boolean") for c in profile.columns):
            recommended_preprocessing.append("One-Hot / Target Encoding")

        if any(c.type == "numeric" for c in profile.columns):
            recommended_preprocessing.append("StandardScaler Feature Normalization")

        # ── 5. Feature Action Recommendations ─────────────────────────────────
        feature_recommendations: list[FeatureRecommendation] = []

        for col in profile.columns:
            if col.type == "identifier":
                feature_recommendations.append(
                    FeatureRecommendation(
                        column_name=col.name,
                        recommended_action="drop",
                        reasoning="Primary key identifier column provides zero generalizable predictive signal.",
                    )
                )
            elif col.missing_percentage >= 100.0:
                feature_recommendations.append(
                    FeatureRecommendation(
                        column_name=col.name,
                        recommended_action="drop",
                        reasoning="Column is 100% empty.",
                    )
                )
            elif col.unique == 1:
                feature_recommendations.append(
                    FeatureRecommendation(
                        column_name=col.name,
                        recommended_action="drop",
                        reasoning="Zero-variance constant feature contains identical values across all rows.",
                    )
                )
            elif col.type in ("categorical", "boolean"):
                feature_recommendations.append(
                    FeatureRecommendation(
                        column_name=col.name,
                        recommended_action="encode",
                        reasoning=f"Categorical feature with {col.unique} unique values requires One-Hot or Ordinal encoding.",
                    )
                )
            elif col.type == "numeric":
                feature_recommendations.append(
                    FeatureRecommendation(
                        column_name=col.name,
                        recommended_action="scale" if col.missing == 0 else "impute",
                        reasoning=f"Continuous numeric feature (range: [{col.statistics.get('min', '—')}, {col.statistics.get('max', '—')}]) requires scaling/imputation.",
                    )
                )
            else:
                feature_recommendations.append(
                    FeatureRecommendation(
                        column_name=col.name,
                        recommended_action="keep",
                        reasoning="Feature formatted appropriately.",
                    )
                )

        return DatasetRecommendationResponse(
            dataset_id=profile.dataset_id,
            filename=profile.filename,
            overall_readiness=overall_readiness,
            readiness_reasoning=readiness_reasoning,
            recommended_problem_type=recommended_problem_type,
            problem_type_confidence=round(problem_type_confidence, 2),
            problem_type_reasoning=problem_type_reasoning,
            recommended_models=recommended_models,
            recommended_preprocessing=recommended_preprocessing,
            target_suggestions=target_suggestions,
            feature_recommendations=feature_recommendations,
            warnings=warnings,
        )


# Singleton instance
recommendation_service = RecommendationEngineService()
