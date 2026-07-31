"""Enterprise Dataset Health Engine.

Consumes a DatasetProfileResponse (single source of truth from Profiler)
and evaluates dataset quality using a deterministic scoring formula.

Flow:
    DatasetProfileResponse -> DatasetHealthService -> DatasetHealthResponse
"""

from services.api.app.schemas.dataset import (
    DatasetHealthResponse,
    DatasetProfileResponse,
    HealthIssue,
)


class DatasetHealthService:
    """Enterprise Health Scoring Engine."""

    def evaluate_health(self, profile: DatasetProfileResponse) -> DatasetHealthResponse:
        """Calculate deterministic health score, grade, warnings, issues, and recommendations."""
        base_score = 100.0
        deductions = 0.0

        warnings: list[str] = []
        recommendations: list[str] = []
        issues: list[HealthIssue] = []

        total_cells = profile.row_count * profile.column_count
        row_cnt = profile.row_count

        # ── 1. Missing Values Evaluation ──────────────────────────────────────
        if total_cells > 0 and profile.total_missing_values > 0:
            overall_missing_pct = (profile.total_missing_values / total_cells) * 100.0

            # Deduction: -1 point per 1% overall missing cells
            missing_deduction = min(30.0, overall_missing_pct * 1.0)
            deductions += missing_deduction

            warnings.append(
                f"{profile.total_missing_values} missing cells detected across dataset ({overall_missing_pct:.1f}% of total data)."
            )

        # Per-column missingness check
        high_missing_cols = []
        for col in profile.columns:
            if col.missing_percentage >= 100.0:
                # Handled under empty_columns, but add column issue
                issues.append(
                    HealthIssue(
                        severity="critical",
                        message=f"Column '{col.name}' is 100% empty.",
                        column_name=col.name,
                    )
                )
            elif col.missing_percentage > 50.0:
                high_missing_cols.append(col.name)
                # Deduction: -10 points per column with > 50% missing values
                deductions += 10.0
                issues.append(
                    HealthIssue(
                        severity="high",
                        message=f"Column '{col.name}' has very high missingness ({col.missing_percentage:.1f}%).",
                        column_name=col.name,
                    )
                )

        if high_missing_cols:
            recommendations.append(
                f"Consider dropping or imputing columns with >50% missingness: {', '.join(high_missing_cols)}."
            )

        # ── 2. Duplicate Rows Evaluation ──────────────────────────────────────
        if profile.duplicate_rows > 0:
            dup_row_pct = (profile.duplicate_rows / row_cnt * 100.0) if row_cnt > 0 else 0.0
            # Deduction: -2 points minimum + -1 point per 2% duplicate ratio (max 20 points)
            dup_deduction = min(20.0, 2.0 + (dup_row_pct * 0.5))
            deductions += dup_deduction

            issues.append(
                HealthIssue(
                    severity="warning" if dup_row_pct < 5.0 else "high",
                    message=f"Duplicate rows detected: {profile.duplicate_rows} rows ({dup_row_pct:.1f}%) are identical.",
                )
            )
            warnings.append(f"{profile.duplicate_rows} duplicate rows detected.")
            recommendations.append("Deduplicate dataset rows before splitting train/test sets to prevent data leakage.")

        # ── 3. Duplicate Columns Evaluation ───────────────────────────────────
        if profile.duplicate_columns > 0:
            dup_col_deduction = profile.duplicate_columns * 5.0
            deductions += dup_col_deduction
            issues.append(
                HealthIssue(
                    severity="high",
                    message=f"{profile.duplicate_columns} duplicate column names or identical series detected.",
                )
            )
            recommendations.append("Rename or remove redundant duplicate columns.")

        # ── 4. Empty Columns Evaluation ───────────────────────────────────────
        if profile.empty_columns > 0:
            empty_col_deduction = profile.empty_columns * 15.0
            deductions += empty_col_deduction
            warnings.append(f"{profile.empty_columns} column(s) contain 100% missing values.")
            recommendations.append("Remove completely empty columns from the feature matrix.")

        # ── 5. Constant Columns (Zero Variance) ──────────────────────────────
        constant_cols = []
        for col in profile.columns:
            if col.unique == 1 and col.missing < row_cnt:
                constant_cols.append(col.name)
                deductions += 5.0
                issues.append(
                    HealthIssue(
                        severity="warning",
                        message=f"Column '{col.name}' is constant (zero variance, 1 unique value).",
                        column_name=col.name,
                    )
                )

        if constant_cols:
            recommendations.append(f"Remove zero-variance constant columns: {', '.join(constant_cols)}.")

        # ── 6. Identifier Columns Check ───────────────────────────────────────
        id_cols = [col.name for col in profile.columns if col.type == "identifier"]
        if id_cols:
            issues.append(
                HealthIssue(
                    severity="info",
                    message=f"Identifier columns detected: {', '.join(id_cols)}.",
                )
            )
            recommendations.append(f"Exclude primary key/identifier columns from model features: {', '.join(id_cols)}.")

        # ── 7. Score Clamping & Grade Assignment ──────────────────────────────
        final_score = max(0, min(100, round(base_score - deductions)))

        if final_score >= 95:
            grade = "Excellent"
            summary = "Dataset is in excellent condition and ready for machine learning model training."
        elif final_score >= 85:
            grade = "Good"
            summary = "Dataset is suitable for machine learning with minor data quality considerations."
        elif final_score >= 70:
            grade = "Fair"
            summary = "Dataset has moderate quality issues that may require cleaning prior to modeling."
        elif final_score >= 50:
            grade = "Poor"
            summary = "Dataset contains significant missingness or duplication that impacts model quality."
        else:
            grade = "Critical"
            summary = "Dataset has critical quality defects and is not recommended for training without remediation."

        if not warnings:
            warnings.append("No major quality warnings detected.")

        if not recommendations:
            recommendations.append("Dataset features are well-formatted for ML experimentation.")

        return DatasetHealthResponse(
            dataset_id=profile.dataset_id,
            filename=profile.filename,
            health_score=final_score,
            grade=grade,
            summary=summary,
            warnings=warnings,
            recommendations=recommendations,
            issues=issues,
        )


# Singleton instance
health_service = DatasetHealthService()
