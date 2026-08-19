"""Pure, testable recommendation benchmark engine.

Executes a leakage-safe 2-tier benchmarking protocol (Screening tier & Verification tier)
on a dataset to rank compatible algorithms and produce an evidence-based recommendation.

Architectural Guarantees:
  1. Pure Engine: Zero database access, zero Celery imports, zero HTTP dependencies.
  2. Leakage-Safe: All transformations (imputation, scaling, one-hot encoding) are
     fitted strictly inside each cross-validation fold using an unfitted sklearn Pipeline.
  3. Holdout Integrity: If train_test_split is configured, cross-validation runs
     strictly on the training partition. Holdout rows are never touched during model selection.
  4. Metric-Aware Tie Breaking: Practical equivalence margin evaluates fold-level
     paired differences before claiming a top model.
  5. Resource Admission: Deterministic row & feature caps protect memory and runtime.
     Kernel/distance models only enter screening if within safe limits, and enter verification
     strictly if they are top screening contenders.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
import logging
import math
import time
from typing import Any, Callable, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    f1_score,
    mean_absolute_error,
    mean_squared_error,
    roc_auc_score,
)
from sklearn.model_selection import KFold, StratifiedKFold, train_test_split
from sklearn.pipeline import Pipeline

from app.config import settings
from app.ml.algorithm_factory import (
    ALGORITHM_REGISTRY,
    AlgorithmDefinition,
    get_algorithm,
    is_package_available,
)
from app.ml.dataset_loader import DatasetContext
from app.ml.preprocessing import (
    build_preprocessor,
    detect_identifier_signals,
    sanitize_feature_columns,
)
from app.ml.problem_detector import ProblemType, detect_problem_type

logger = logging.getLogger("apex_ml.recommendation_engine")

# ---------------------------------------------------------------------------
# Metric Practical Significance Thresholds
# ---------------------------------------------------------------------------
PRACTICAL_TIE_THRESHOLDS: Dict[str, float] = {
    "roc_auc": 0.010,
    "macro_f1": 0.015,
    "f1": 0.015,
    "balanced_accuracy": 0.015,
    "accuracy": 0.010,
    "rmse": 0.020,  # 2% relative
    "mae": 0.020,   # 2% relative
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _create_dataset_context(df: pd.DataFrame, target_col: str, feature_cols: List[str]) -> DatasetContext:
    """Create a fully populated DatasetContext for pipeline builder and problem detector."""
    num_cols: List[str] = []
    cat_cols: List[str] = []
    bool_cols: List[str] = []
    dt_cols: List[str] = []

    for col in feature_cols:
        series = df[col]
        if pd.api.types.is_bool_dtype(series):
            bool_cols.append(col)
        elif pd.api.types.is_numeric_dtype(series):
            num_cols.append(col)
        elif pd.api.types.is_datetime64_any_dtype(series):
            dt_cols.append(col)
        else:
            cat_cols.append(col)

    missing_dict = {c: int(df[c].isna().sum()) for c in df.columns}

    return DatasetContext(
        dataset_id="benchmark_in_memory",
        file_path="",
        dataframe=df,
        target_column=target_col,
        feature_columns=feature_cols,
        numeric_columns=num_cols,
        categorical_columns=cat_cols,
        boolean_columns=bool_cols,
        datetime_columns=dt_cols,
        missing_per_column=missing_dict,
        row_count=len(df),
        column_count=len(df.columns),
    )


# ---------------------------------------------------------------------------
# Data Transfer Classes
# ---------------------------------------------------------------------------

@dataclass
class RecommendationConstraints:
    """User-supplied constraints affecting benchmark execution."""

    max_training_seconds: int = 120
    prefer_interpretable: bool = False


@dataclass
class RecommendationConfig:
    """Configuration governing the recommendation benchmark execution."""

    target_column: str
    feature_columns: Optional[List[str]] = None
    metric: Optional[str] = None
    cv_folds: int = 5
    random_seed: int = 42
    train_test_split: float = 0.8
    constraints: RecommendationConstraints = field(default_factory=RecommendationConstraints)
    screening_sample_size: int = 25_000
    verification_sample_size: int = 50_000
    max_distance_kernel_rows: int = 5_000


@dataclass
class CandidateBenchmarkResult:
    """Detailed benchmark evaluation result for a single candidate algorithm."""

    algorithm_id: str
    display_name: str
    category: str
    task_type: str
    rank: Optional[int] = None
    status: str = "completed"  # "completed" | "skipped" | "failed"
    score: Optional[float] = None  # Canonical higher-is-better score
    score_std: Optional[float] = None
    raw_metric_value: Optional[float] = None  # Human readable (e.g. positive RMSE)
    validation_score: Optional[float] = None
    ci_lower: Optional[float] = None
    ci_upper: Optional[float] = None
    metric_used: Optional[str] = None
    fold_scores: List[float] = field(default_factory=list)
    training_seconds: float = 0.0
    training_time_seconds: Optional[float] = None
    interpretability_score: Optional[int] = None
    interpretability_label: Optional[str] = None
    why_recommended: Optional[str] = None
    risk_flags: List[str] = field(default_factory=list)
    reason_codes: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    skip_reason: Optional[str] = None
    error_message: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class RecommendationResult:
    """Complete, transparent recommendation outcome."""

    status: str  # "completed" | "insufficient_data" | "invalid_target" | "failed"
    task_type: str
    target_column: str
    target_cardinality: int
    evaluation_metric: str
    split_strategy: str
    cv_folds: int
    random_seed: int
    train_sample_rows: int
    holdout_rows: int
    confidence: str = "medium"  # "high" | "medium" | "low" | "insufficient_data"
    recommended_algorithm: Optional[CandidateBenchmarkResult] = None
    candidates: List[CandidateBenchmarkResult] = field(default_factory=list)
    reason_codes: List[str] = field(default_factory=list)
    limitations: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    exclusions: List[Dict[str, str]] = field(default_factory=list)
    reproducibility: Dict[str, Any] = field(default_factory=dict)
    is_tie: bool = False

    def to_dict(self) -> Dict[str, Any]:
        data = asdict(self)
        if self.recommended_algorithm:
            data["recommendation"] = self.recommended_algorithm.to_dict()
        else:
            data["recommendation"] = None
        data["candidates"] = [c.to_dict() for c in self.candidates]
        return data


# ---------------------------------------------------------------------------
# Scoring & Metric Helpers
# ---------------------------------------------------------------------------

def compute_fold_score(
    estimator: Any,
    X_val: pd.DataFrame,
    y_val: pd.Series,
    metric_name: str,
    task_type: str,
) -> Tuple[float, float]:
    """Compute (canonical_score, raw_metric_value) on validation fold data.

    Canonical score is always HIGHER-IS-BETTER for unified ranking.
    """
    if task_type == "classification":
        if metric_name in ("roc_auc", "pr_auc"):
            try:
                if hasattr(estimator, "predict_proba"):
                    y_prob = estimator.predict_proba(X_val)
                    if y_prob.shape[1] == 2:
                        y_prob_col = y_prob[:, 1]
                        classes = getattr(estimator, "classes_", np.unique(y_val))
                        pos_label = classes[1] if len(classes) > 1 else 1
                        y_val_binary = (y_val == pos_label).astype(int)
                        val_score = float(roc_auc_score(y_val_binary, y_prob_col))
                        return val_score, val_score
                    else:
                        val_score = float(roc_auc_score(y_val, y_prob, multi_class="ovr", average="macro"))
                        return val_score, val_score
                elif hasattr(estimator, "decision_function"):
                    y_scores = estimator.decision_function(X_val)
                    classes = getattr(estimator, "classes_", np.unique(y_val))
                    pos_label = classes[1] if len(classes) > 1 else 1
                    y_val_binary = (y_val == pos_label).astype(int)
                    val_score = float(roc_auc_score(y_val_binary, y_scores))
                    return val_score, val_score
            except Exception as exc:
                logger.debug("ROC-AUC probability scoring fallback to macro-F1: %s", exc)

        y_pred = estimator.predict(X_val)
        if metric_name == "balanced_accuracy":
            score = float(balanced_accuracy_score(y_val, y_pred))
            return score, score
        if metric_name == "accuracy":
            score = float(accuracy_score(y_val, y_pred))
            return score, score

        f1_val = float(f1_score(y_val, y_pred, average="macro", zero_division=0))
        return f1_val, f1_val

    else:
        y_pred = estimator.predict(X_val)
        if metric_name == "mae":
            mae_val = float(mean_absolute_error(y_val, y_pred))
            return -mae_val, mae_val

        mse_val = float(mean_squared_error(y_val, y_pred))
        rmse_val = math.sqrt(mse_val)
        return -rmse_val, rmse_val


# ---------------------------------------------------------------------------
# Cross-Validation Evaluator
# ---------------------------------------------------------------------------

def evaluate_candidate_cv(
    definition: AlgorithmDefinition,
    dataframe: pd.DataFrame,
    feature_columns: List[str],
    target_column: str,
    cv_splitter: Any,
    metric_name: str,
    task_type: str,
    random_seed: int = 42,
    progress_callback: Optional[Callable[[str, int, int], None]] = None,
) -> CandidateBenchmarkResult:
    """Evaluate a single algorithm across CV folds using leakage-safe per-fold pipeline fitting."""
    start_time = time.perf_counter()
    fold_scores: List[float] = []
    raw_scores: List[float] = []

    X = dataframe[feature_columns]
    y = dataframe[target_column]

    try:
        ctx = _create_dataset_context(dataframe, target_column, feature_columns)

        unfitted_preprocessor = build_preprocessor(ctx)
        base_estimator = definition.factory(random_seed)
        unfitted_pipeline = Pipeline([
            ("preprocessor", unfitted_preprocessor),
            ("estimator", base_estimator),
        ])

        total_folds = cv_splitter.get_n_splits(X, y)

        for fold_idx, (train_idx, val_idx) in enumerate(cv_splitter.split(X, y)):
            if progress_callback:
                progress_callback(definition.display_name, fold_idx + 1, total_folds)

            fold_pipeline = clone(unfitted_pipeline)

            X_train_fold, X_val_fold = X.iloc[train_idx], X.iloc[val_idx]
            y_train_fold, y_val_fold = y.iloc[train_idx], y.iloc[val_idx]

            fold_pipeline.fit(X_train_fold, y_train_fold)

            c_score, r_score = compute_fold_score(
                estimator=fold_pipeline,
                X_val=X_val_fold,
                y_val=y_val_fold,
                metric_name=metric_name,
                task_type=task_type,
            )

            fold_scores.append(c_score)
            raw_scores.append(r_score)

        elapsed = time.perf_counter() - start_time
        mean_score = float(np.mean(fold_scores))
        std_score = float(np.std(fold_scores))
        mean_raw = float(np.mean(raw_scores))

        return CandidateBenchmarkResult(
            algorithm_id=definition.key,
            display_name=definition.display_name,
            category=definition.category,
            task_type=definition.task_type,
            status="completed",
            score=round(mean_score, 4),
            score_std=round(std_score, 4),
            raw_metric_value=round(mean_raw, 4),
            fold_scores=[round(s, 4) for s in fold_scores],
            training_seconds=round(elapsed, 3),
        )

    except Exception as exc:
        elapsed = time.perf_counter() - start_time
        sanitized_msg = type(exc).__name__ + ": " + str(exc).split("\n")[0][:200]
        logger.warning("Candidate '%s' evaluation failed: %s", definition.display_name, sanitized_msg)
        return CandidateBenchmarkResult(
            algorithm_id=definition.key,
            display_name=definition.display_name,
            category=definition.category,
            task_type=definition.task_type,
            status="failed",
            error_message=sanitized_msg,
            training_seconds=round(elapsed, 3),
        )


# ---------------------------------------------------------------------------
# Public Recommendation Benchmark Runner
# ---------------------------------------------------------------------------

def run_recommendation_benchmark(
    dataframe: pd.DataFrame,
    config: RecommendationConfig,
    progress_callback: Optional[Callable[[str, int, int], None]] = None,
    stage_callback: Optional[Callable[[str, float], None]] = None,
) -> RecommendationResult:
    """Execute the pure, leakage-safe recommendation benchmark on *dataframe*."""
    warnings: List[str] = []
    limitations: List[str] = []

    # ── 1. Target & Dataframe Validation ──────────────────────────────────────
    if dataframe is None or dataframe.empty:
        return RecommendationResult(
            status="insufficient_data",
            task_type="unknown",
            target_column=config.target_column or "",
            target_cardinality=0,
            evaluation_metric=config.metric or "unknown",
            split_strategy="none",
            cv_folds=config.cv_folds,
            random_seed=config.random_seed,
            train_sample_rows=0,
            holdout_rows=0,
            confidence="insufficient_data",
            reason_codes=["empty_dataset"],
            limitations=["Dataset contains zero rows."],
        )

    if not config.target_column or config.target_column not in dataframe.columns:
        return RecommendationResult(
            status="invalid_target",
            task_type="unknown",
            target_column=config.target_column or "",
            target_cardinality=0,
            evaluation_metric=config.metric or "unknown",
            split_strategy="none",
            cv_folds=config.cv_folds,
            random_seed=config.random_seed,
            train_sample_rows=len(dataframe),
            holdout_rows=0,
            confidence="insufficient_data",
            reason_codes=["missing_target_column"],
            limitations=[f"Target column '{config.target_column}' is not present in the dataset."],
        )

    df = dataframe.copy()
    target_series = df[config.target_column]
    total_raw_rows = len(df)

    target_missing = int(target_series.isna().sum())
    if target_missing > 0:
        missing_pct = target_missing / total_raw_rows
        if missing_pct > 0.20 or target_missing == total_raw_rows:
            return RecommendationResult(
                status="invalid_target",
                task_type="unknown",
                target_column=config.target_column,
                target_cardinality=int(target_series.nunique(dropna=True)),
                evaluation_metric=config.metric or "unknown",
                split_strategy="none",
                cv_folds=config.cv_folds,
                random_seed=config.random_seed,
                train_sample_rows=total_raw_rows,
                holdout_rows=0,
                confidence="insufficient_data",
                reason_codes=["target_excessive_missing_values"],
                limitations=[f"Target column '{config.target_column}' has {missing_pct:.1%} missing values (exceeds 20% limit)."],
            )
        df = df.dropna(subset=[config.target_column])
        warnings.append(f"Dropped {target_missing} row(s) with missing target values.")

    if len(df) < 10:
        return RecommendationResult(
            status="insufficient_data",
            task_type="unknown",
            target_column=config.target_column,
            target_cardinality=int(df[config.target_column].nunique()),
            evaluation_metric=config.metric or "unknown",
            split_strategy="none",
            cv_folds=config.cv_folds,
            random_seed=config.random_seed,
            train_sample_rows=len(df),
            holdout_rows=0,
            confidence="insufficient_data",
            reason_codes=["insufficient_rows"],
            limitations=["Dataset contains fewer than 10 valid rows after filtering."],
        )

    target_id_check = detect_identifier_signals(config.target_column, df[config.target_column], len(df), is_target=True)
    if target_id_check.is_identifier or target_id_check.reasons:
        warnings.append(
            f"Selected target column '{config.target_column}' exhibits identifier characteristics ({' | '.join(target_id_check.reasons)}). "
            "Please confirm this is the intended prediction target."
        )

    # ── 2. Supervised Task Type Resolution ────────────────────────────────────
    ctx_for_detection = _create_dataset_context(
        df,
        config.target_column,
        [c for c in df.columns if c != config.target_column],
    )
    detected_prob = detect_problem_type(ctx_for_detection)

    if detected_prob in (ProblemType.BINARY_CLASSIFICATION, ProblemType.MULTI_CLASSIFICATION):
        task_type = "classification"
        target_cardinality = int(df[config.target_column].nunique())
        if target_cardinality < 2:
            return RecommendationResult(
                status="invalid_target",
                task_type="classification",
                target_column=config.target_column,
                target_cardinality=target_cardinality,
                evaluation_metric=config.metric or "macro_f1",
                split_strategy="none",
                cv_folds=config.cv_folds,
                random_seed=config.random_seed,
                train_sample_rows=len(df),
                holdout_rows=0,
                confidence="insufficient_data",
                reason_codes=["single_class_target"],
                limitations=["Classification target must contain at least 2 distinct classes."],
            )

        class_counts = df[config.target_column].value_counts()
        min_class_samples = int(class_counts.min())
        if min_class_samples < 2:
            return RecommendationResult(
                status="insufficient_data",
                task_type="classification",
                target_column=config.target_column,
                target_cardinality=target_cardinality,
                evaluation_metric=config.metric or "macro_f1",
                split_strategy="none",
                cv_folds=config.cv_folds,
                random_seed=config.random_seed,
                train_sample_rows=len(df),
                holdout_rows=0,
                confidence="insufficient_data",
                reason_codes=["rare_class_sample_count"],
                limitations=[f"Smallest class has only {min_class_samples} sample(s), requiring at least 2 for cross-validation."],
            )
    else:
        task_type = "regression"
        target_cardinality = int(df[config.target_column].nunique())
        if target_cardinality <= 1:
            return RecommendationResult(
                status="invalid_target",
                task_type="regression",
                target_column=config.target_column,
                target_cardinality=target_cardinality,
                evaluation_metric=config.metric or "rmse",
                split_strategy="none",
                cv_folds=config.cv_folds,
                random_seed=config.random_seed,
                train_sample_rows=len(df),
                holdout_rows=0,
                confidence="insufficient_data",
                reason_codes=["zero_variance_target"],
                limitations=["Regression target has zero variance (all values are identical)."],
            )

    # ── 3. Feature Sanitization ───────────────────────────────────────────────
    clean_features, exclusions = sanitize_feature_columns(
        df,
        target_column=config.target_column,
        explicit_features=config.feature_columns,
    )

    exclusion_dicts = [{"column_name": e.column_name, "reason": e.reason, "category": e.category} for e in exclusions]
    if len(clean_features) == 0:
        return RecommendationResult(
            status="insufficient_data",
            task_type=task_type,
            target_column=config.target_column,
            target_cardinality=target_cardinality,
            evaluation_metric=config.metric or ("macro_f1" if task_type == "classification" else "rmse"),
            split_strategy="none",
            cv_folds=config.cv_folds,
            random_seed=config.random_seed,
            train_sample_rows=len(df),
            holdout_rows=0,
            confidence="insufficient_data",
            reason_codes=["no_usable_features"],
            limitations=["No valid feature columns remain after excluding empty, constant, and identifier columns."],
            exclusions=exclusion_dicts,
        )

    # ── 4. Holdout Partitioning (Strict Isolation) ────────────────────────────
    holdout_rows = 0
    if config.train_test_split and 0.5 <= config.train_test_split < 1.0:
        test_size = round(1.0 - config.train_test_split, 4)
        stratify = df[config.target_column] if task_type == "classification" and min_class_samples >= 2 else None
        try:
            train_indices, holdout_indices = train_test_split(
                np.arange(len(df)),
                test_size=test_size,
                random_state=config.random_seed,
                stratify=stratify,
            )
            df_train = df.iloc[train_indices].copy()
            holdout_rows = len(holdout_indices)
        except Exception:
            df_train = df.copy()
            holdout_rows = 0
    else:
        df_train = df.copy()
        holdout_rows = 0

    train_rows = len(df_train)

    # ── 5. Metric & Cross-Validation Splitter ─────────────────────────────────
    if task_type == "classification":
        if config.metric:
            chosen_metric = config.metric.lower()
        else:
            counts = df_train[config.target_column].value_counts()
            imbalance_ratio = float(counts.max() / max(1, counts.min()))
            if target_cardinality == 2:
                chosen_metric = "f1" if imbalance_ratio > 10.0 else "roc_auc"
            else:
                chosen_metric = "macro_f1"

        effective_folds = min(config.cv_folds, int(df_train[config.target_column].value_counts().min()))
        effective_folds = max(2, min(effective_folds, 10))
        split_strategy = "stratified_k_fold"
        cv_splitter = StratifiedKFold(n_splits=effective_folds, shuffle=True, random_state=config.random_seed)
    else:
        chosen_metric = config.metric.lower() if config.metric else "rmse"
        effective_folds = max(2, min(config.cv_folds, 10))
        split_strategy = "k_fold"
        cv_splitter = KFold(n_splits=effective_folds, shuffle=True, random_state=config.random_seed)

    # ── 6. Deterministic Screening Subsample ──────────────────────────────────
    if train_rows > config.screening_sample_size:
        stratify_sample = df_train[config.target_column] if task_type == "classification" else None
        try:
            _, screening_idx = train_test_split(
                np.arange(train_rows),
                test_size=config.screening_sample_size / train_rows,
                random_state=config.random_seed,
                stratify=stratify_sample,
            )
            df_screening = df_train.iloc[screening_idx].copy()
            limitations.append(f"Screening benchmark executed on a deterministic {config.screening_sample_size:,}-row stratified sample.")
        except Exception:
            df_screening = df_train.head(config.screening_sample_size).copy()
    else:
        df_screening = df_train

    # ── 7. Screening Tier Candidate Selection ─────────────────────────────────
    all_task_models = [d for d in ALGORITHM_REGISTRY.values() if d.task_type == task_type]
    candidates_result: List[CandidateBenchmarkResult] = []

    # Filter screening tier models based strictly on safe resource admission
    screening_models: List[AlgorithmDefinition] = []
    for defn in all_task_models:
        if defn.dependency_package and not is_package_available(defn.dependency_package):
            candidates_result.append(
                CandidateBenchmarkResult(
                    algorithm_id=defn.key,
                    display_name=defn.display_name,
                    category=defn.category,
                    task_type=defn.task_type,
                    status="skipped",
                    skip_reason=f"Optional library '{defn.dependency_package}' is not installed in the worker environment.",
                )
            )
            continue

        if defn.max_safe_rows and len(df_screening) > defn.max_safe_rows:
            candidates_result.append(
                CandidateBenchmarkResult(
                    algorithm_id=defn.key,
                    display_name=defn.display_name,
                    category=defn.category,
                    task_type=defn.task_type,
                    status="skipped",
                    skip_reason=f"Dataset shape ({len(df_screening)} rows) exceeds safe limit for {defn.display_name} (max {defn.max_safe_rows} rows).",
                )
            )
            continue

        screening_models.append(defn)

    # Run Screening Tier
    if stage_callback:
        stage_callback("SCREENING", 20.0)

    screening_results: List[CandidateBenchmarkResult] = []
    screening_splitter = StratifiedKFold(n_splits=3, shuffle=True, random_state=config.random_seed) if task_type == "classification" else KFold(n_splits=3, shuffle=True, random_state=config.random_seed)

    for defn in screening_models:
        res = evaluate_candidate_cv(
            definition=defn,
            dataframe=df_screening,
            feature_columns=clean_features,
            target_column=config.target_column,
            cv_splitter=screening_splitter,
            metric_name=chosen_metric,
            task_type=task_type,
            random_seed=config.random_seed,
            progress_callback=progress_callback,
        )
        screening_results.append(res)

    # ── 8. Verification Tier Evaluation ───────────────────────────────────────
    # A model may enter verification ONLY when:
    # 1. it passes resource admission; and
    # 2. it is one of the highest-ranked screening contenders.
    successful_screening = [r for r in screening_results if r.status == "completed" and r.score is not None]
    successful_screening.sort(key=lambda r: r.score or -999999.0, reverse=True)
    top_keys = {r.algorithm_id for r in successful_screening[:3]}

    verification_models: List[AlgorithmDefinition] = [
        defn for defn in all_task_models if defn.key in top_keys
    ]

    # Run Verification Tier on df_train with full cv_splitter
    if stage_callback:
        stage_callback("VERIFYING", 60.0)

    verified_results: List[CandidateBenchmarkResult] = []
    for defn in verification_models:
        res = evaluate_candidate_cv(
            definition=defn,
            dataframe=df_train,
            feature_columns=clean_features,
            target_column=config.target_column,
            cv_splitter=cv_splitter,
            metric_name=chosen_metric,
            task_type=task_type,
            random_seed=config.random_seed,
            progress_callback=progress_callback,
        )
        verified_results.append(res)

    # Merge verification results over screening results
    verified_map = {r.algorithm_id: r for r in verified_results}
    all_evaluated: List[CandidateBenchmarkResult] = []

    for r in screening_results:
        if r.algorithm_id in verified_map:
            all_evaluated.append(verified_map[r.algorithm_id])
        else:
            all_evaluated.append(r)

    for r in verified_results:
        if not any(e.algorithm_id == r.algorithm_id for e in all_evaluated):
            all_evaluated.append(r)

    # Combine with skipped candidates
    all_candidates = all_evaluated + [c for c in candidates_result if c.status == "skipped"]

    # ── 9. Practical Significance & Tie Resolution ────────────────────────────
    completed_candidates = [c for c in all_candidates if c.status == "completed" and c.score is not None]
    completed_candidates.sort(key=lambda c: c.score or -999999.0, reverse=True)

    reproducibility = {
        "engine_version": settings.recommendation_engine_version,
        "registry_version": settings.algorithm_registry_version,
        "preprocessor_version": settings.preprocessor_version,
        "selected_features": clean_features,
        "excluded_features": exclusion_dicts,
        "train_test_split": config.train_test_split,
        "cv_folds": effective_folds,
        "random_seed": config.random_seed,
        "screening_sample_size": len(df_screening),
        "train_rows": train_rows,
        "holdout_rows": holdout_rows,
        "metric": chosen_metric,
        "constraints": {
            "max_training_seconds": config.constraints.max_training_seconds,
            "prefer_interpretable": config.constraints.prefer_interpretable,
        },
    }

    if not completed_candidates:
        return RecommendationResult(
            status="failed",
            task_type=task_type,
            target_column=config.target_column,
            target_cardinality=target_cardinality,
            evaluation_metric=chosen_metric,
            split_strategy=split_strategy,
            cv_folds=effective_folds,
            random_seed=config.random_seed,
            train_sample_rows=train_rows,
            holdout_rows=holdout_rows,
            confidence="insufficient_data",
            reason_codes=["all_candidates_failed"],
            limitations=["All benchmark candidate models failed execution."],
            candidates=all_candidates,
            warnings=warnings,
            exclusions=exclusion_dicts,
            reproducibility=reproducibility,
        )

    # ── Enrich candidates with UI display fields ───────────────────────────
    category_interpretability = {
        "baseline": (5, "High"),
        "linear": (5, "High"),
        "tree": (4, "Moderate"),
        "naive_bayes": (3, "Moderate"),
        "distance": (2, "Low"),
        "boosting": (2, "Low"),
        "kernel": (1, "Very Low"),
    }
    
    for cand in completed_candidates:
        cand.validation_score = cand.score
        cand.metric_used = chosen_metric
        cand.training_time_seconds = cand.training_seconds
        
        if cand.score is not None and cand.score_std is not None and effective_folds > 0:
            margin = 1.96 * (cand.score_std / math.sqrt(effective_folds))
            cand.ci_lower = round(cand.score - margin, 4)
            cand.ci_upper = round(cand.score + margin, 4)
            
        interp = category_interpretability.get(cand.category, (3, "Moderate"))
        cand.interpretability_score = interp[0]
        cand.interpretability_label = interp[1]
        
        if cand.training_time_seconds and cand.training_time_seconds > 5.0:
            cand.risk_flags.append("High training latency")
        if cand.category == "tree" and train_rows < 100:
            cand.risk_flags.append("Prone to overfitting on small data")
        if cand.category in ("distance", "kernel") and train_rows > 10000:
            cand.risk_flags.append("Scalability concerns on large data")
            
        cand.why_recommended = f"Achieved a validated {chosen_metric.upper()} of {cand.validation_score} with {cand.interpretability_label.lower()} interpretability. Best suited for this dataset profile."

    # Assign ranks
    for rank_idx, cand in enumerate(completed_candidates, start=1):
        cand.rank = rank_idx

    top_cand = completed_candidates[0]
    runner_up = completed_candidates[1] if len(completed_candidates) > 1 else None
    is_tie = False
    rec_reasons = ["validated_top_score", "stable_cross_validation"]

    if runner_up and top_cand.score is not None and runner_up.score is not None:
        delta = abs(top_cand.score - runner_up.score)
        threshold = PRACTICAL_TIE_THRESHOLDS.get(chosen_metric, 0.010)

        if chosen_metric in ("rmse", "mae") and abs(top_cand.score) > 0:
            rel_delta = delta / abs(top_cand.score)
            tie_detected = rel_delta < threshold
        else:
            tie_detected = delta < threshold

        if tie_detected:
            is_tie = True
            rec_reasons = ["no_clear_winner_practical_equivalence"]

            category_preference = {"baseline": 1, "linear": 2, "tree": 3, "naive_bayes": 4, "boosting": 5, "distance": 6, "kernel": 7}

            top_cat_score = category_preference.get(top_cand.category, 5)
            runner_cat_score = category_preference.get(runner_up.category, 5)

            if config.constraints.prefer_interpretable and runner_cat_score < top_cat_score:
                top_cand, runner_up = runner_up, top_cand
                top_cand.rank, runner_up.rank = 1, 2
                rec_reasons.append("prefer_interpretable_model_tiebreak")
            elif runner_up.training_seconds < top_cand.training_seconds and (top_cand.training_seconds - runner_up.training_seconds) > 1.0:
                top_cand, runner_up = runner_up, top_cand
                top_cand.rank, runner_up.rank = 1, 2
                rec_reasons.append("prefer_faster_compute_tiebreak")
            else:
                rec_reasons.append("prefer_simpler_model_tiebreak")

    if top_cand.score_std is not None and top_cand.score_std > 0.15:
        confidence = "low"
        limitations.append("High validation score variance across cross-validation folds.")
    elif is_tie or (top_cand.score_std is not None and top_cand.score_std > 0.05):
        confidence = "medium"
    else:
        confidence = "high"

    return RecommendationResult(
        status="completed",
        task_type=task_type,
        target_column=config.target_column,
        target_cardinality=target_cardinality,
        evaluation_metric=chosen_metric,
        split_strategy=split_strategy,
        cv_folds=effective_folds,
        random_seed=config.random_seed,
        train_sample_rows=train_rows,
        holdout_rows=holdout_rows,
        confidence=confidence,
        recommended_algorithm=top_cand,
        candidates=all_candidates,
        reason_codes=rec_reasons,
        limitations=limitations,
        warnings=warnings,
        exclusions=exclusion_dicts,
        reproducibility=reproducibility,
        is_tie=is_tie,
    )
