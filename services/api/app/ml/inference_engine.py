"""Enterprise Prediction & Inference Engine — Sprint 6 Part 1, 6, 7.

Orchestrates real-time model loading, thread-safe caching, feature validation,
preprocessing, scikit-learn pipeline inference, postprocessing, batch CSV streaming,
prediction audit logging, and operational telemetry.

Architecture Dependency DAG:
    prediction_router -> inference_engine -> artifact_manager -> model_registry ...

Public API:
    load_model(model_id, algorithm, dataset_id)      -> ModelContainer
    predict(data, model_id, algorithm, ...)          -> Dict[str, Any]
    predict_batch(data, model_id, ..., batch_size)   -> Dict[str, Any]
    predict_proba(data, model_id, ...)               -> Dict[str, Any]
    validate_input(df, feature_columns)              -> ValidationResult
    preprocess_input(data, feature_columns)          -> pd.DataFrame
    postprocess_prediction(preds, probas, prob_type) -> List[Dict[str, Any]]
    clear_model_cache()                              -> None
    get_cached_models()                              -> List[Dict[str, Any]]
"""

from __future__ import annotations

import io
import json
import logging
import os
import sys
import threading
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple, Union
import uuid

import joblib
import numpy as np
import pandas as pd

# sys.path bootstrap
_repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
if _repo_root not in sys.path:
    sys.path.insert(0, _repo_root)

# Sprint 5A modules
from app.ml.artifact_manager import load_artifact
from app.ml.model_registry import (
    get_active_model,
    get_latest_model,
    get_model_by_id,
    list_models,
)

# Sprint 6 modules
from app.ml.inference_metrics import record_model_load, record_request
from app.ml.prediction_logger import log_prediction

logger = logging.getLogger("apex_ml.inference_engine")

# Directory for saving generated batch prediction CSVs
_PREDICTIONS_OUTPUT_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "uploads", "predictions")
)


# ---------------------------------------------------------------------------
# Custom Exception Classes
# ---------------------------------------------------------------------------

class ModelNotFoundError(Exception):
    """Raised when requested model ID or active model cannot be resolved."""
    pass


class InferenceValidationError(Exception):
    """Raised when input feature data fails schema, missing column, or type validation."""
    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(message)
        self.details = details or {}


# ---------------------------------------------------------------------------
# Container & Result Data Classes
# ---------------------------------------------------------------------------

class ModelContainer:
    """Thread-safe container holding an in-memory loaded model and its metadata."""

    def __init__(
        self,
        model_id: str,
        model_pipeline: Any,
        metadata: Dict[str, Any],
    ):
        self.model_id: str = model_id
        self.pipeline: Any = model_pipeline
        self.metadata: Dict[str, Any] = metadata
        self.algorithm: str = metadata.get("algorithm", "Unknown")
        self.model_version: str = metadata.get("model_version") or metadata.get("version", "v1.0.0")
        self.experiment_id: Optional[str] = metadata.get("experiment_id")
        self.problem_type: str = metadata.get("problem_type", "BinaryClassification")
        self.feature_columns: List[str] = metadata.get("feature_columns", [])
        self.target_column: str = metadata.get("target_column", "target")
        self.dataset_version: Optional[str] = metadata.get("dataset_version")
        self.classes_: Optional[np.ndarray] = getattr(model_pipeline, "classes_", None)
        self.loaded_at: str = datetime.now(timezone.utc).isoformat()


class ValidationResult:
    """Outcome of feature schema and data validation."""

    def __init__(
        self,
        is_valid: bool,
        cleaned_df: pd.DataFrame,
        errors: List[str],
        warnings: List[str],
        missing_columns: List[str],
        unexpected_columns: List[str],
    ):
        self.is_valid: bool = is_valid
        self.cleaned_df: pd.DataFrame = cleaned_df
        self.errors: List[str] = errors
        self.warnings: List[str] = warnings
        self.missing_columns: List[str] = missing_columns
        self.unexpected_columns: List[str] = unexpected_columns


# ---------------------------------------------------------------------------
# Global In-Memory Model Cache & Locks
# ---------------------------------------------------------------------------
_MODEL_CACHE: Dict[str, ModelContainer] = {}
_CACHE_LOCK = threading.Lock()


# ---------------------------------------------------------------------------
# Part 1: Model Loading & Caching
# ---------------------------------------------------------------------------

def load_model(
    model_id: Optional[str] = None,
    algorithm: Optional[str] = None,
    dataset_id: Optional[str] = None,
) -> ModelContainer:
    """Thread-safe, lazy-loading model retriever with in-memory caching.

    If model_id is not specified, automatically retrieves the active model
    (or latest model) matching algorithm/dataset_id filters.

    Args:
        model_id: Exact model_id from registry.
        algorithm: Optional algorithm name filter.
        dataset_id: Optional dataset_id filter.

    Returns:
        ModelContainer with loaded sklearn Pipeline and full metadata.

    Raises:
        ModelNotFoundError: If no matching model is found in registry or disk.
    """
    resolved_id = model_id

    # 1. Resolve model metadata from registry if model_id not supplied directly
    if not resolved_id:
        active_meta = get_active_model(algorithm=algorithm, dataset_id=dataset_id)
        if active_meta:
            resolved_id = active_meta["model_id"]
        else:
            latest_meta = get_latest_model(algorithm=algorithm, dataset_id=dataset_id)
            if latest_meta:
                resolved_id = latest_meta["model_id"]

    if not resolved_id:
        filters_str = f"algorithm='{algorithm}', dataset_id='{dataset_id}'" if (algorithm or dataset_id) else "any"
        raise ModelNotFoundError(f"No active or registered model found for {filters_str}.")

    # 2. Check in-memory cache
    with _CACHE_LOCK:
        if resolved_id in _MODEL_CACHE:
            return _MODEL_CACHE[resolved_id]

    # 3. Cache miss — load from disk via metadata and artifact manager
    meta = get_model_by_id(resolved_id)
    if not meta:
        raise ModelNotFoundError(f"Model metadata for '{resolved_id}' not found in registry.")

    model_path = meta.get("model_path")
    if not model_path or not os.path.exists(model_path):
        # Fallback to artifact manager
        model_path = load_artifact("model", model_id=resolved_id)

    if not model_path or not os.path.exists(model_path):
        raise ModelNotFoundError(
            f"Binary model file missing on disk for '{resolved_id}' (path: {model_path})."
        )

    try:
        pipeline = joblib.load(model_path)
    except Exception as exc:
        logger.error("Failed to load joblib binary for %s: %s", resolved_id, exc)
        raise ModelNotFoundError(f"Corrupted or unreadable model binary for '{resolved_id}': {exc}")

    # Robust fallback for feature_columns & target_column if missing in registry metadata
    if "feature_columns" not in meta or not meta["feature_columns"]:
        job_id = meta.get("job_id")
        if job_id:
            sidecar_path = os.path.join(os.path.dirname(model_path), f"{job_id}_metadata.json")
            if os.path.exists(sidecar_path):
                try:
                    with open(sidecar_path, "r", encoding="utf-8") as fh:
                        sidecar = json.load(fh)
                        meta["feature_columns"] = sidecar.get("feature_columns", [])
                        meta["target_column"] = sidecar.get("target_column", "target")
                except Exception:
                    pass

    if "feature_columns" not in meta or not meta["feature_columns"]:
        if hasattr(pipeline, "feature_names_in_"):
            meta["feature_columns"] = list(pipeline.feature_names_in_)

    container = ModelContainer(
        model_id=resolved_id,
        model_pipeline=pipeline,
        metadata=meta,
    )

    with _CACHE_LOCK:
        _MODEL_CACHE[resolved_id] = container

    record_model_load(resolved_id)
    logger.info("Successfully loaded and cached model %s (algo=%s)", resolved_id, container.algorithm)
    return container


def get_cached_models() -> List[Dict[str, Any]]:
    """Return summary of all currently cached in-memory models."""
    with _CACHE_LOCK:
        return [
            {
                "model_id": c.model_id,
                "algorithm": c.algorithm,
                "model_version": c.model_version,
                "problem_type": c.problem_type,
                "feature_count": len(c.feature_columns),
                "loaded_at": c.loaded_at,
            }
            for c in _MODEL_CACHE.values()
        ]


def clear_model_cache() -> None:
    """Clear all models from the in-memory cache."""
    with _CACHE_LOCK:
        _MODEL_CACHE.clear()
    logger.info("Cleared in-memory inference model cache.")


# ---------------------------------------------------------------------------
# Part 7: Input Preprocessing & Schema Validation
# ---------------------------------------------------------------------------

def preprocess_input(
    data: Any,
    feature_columns: List[str],
) -> pd.DataFrame:
    """Convert raw input data into a sanitized pandas DataFrame matching feature_columns ordering.

    Supports:
        - dict of single row
        - list of feature dicts
        - list of lists (matching feature_columns order)
        - pandas DataFrame

    Args:
        data: Raw input data.
        feature_columns: Expected list of feature column names.

    Returns:
        pd.DataFrame with columns strictly ordered by feature_columns.
    """
    if isinstance(data, pd.DataFrame):
        df = data.copy()
    elif isinstance(data, dict):
        df = pd.DataFrame([data])
    elif isinstance(data, list):
        if not data:
            df = pd.DataFrame(columns=feature_columns)
        elif isinstance(data[0], dict):
            df = pd.DataFrame(data)
        elif isinstance(data[0], (list, tuple)):
            df = pd.DataFrame(data, columns=feature_columns[: len(data[0])])
        else:
            # Single list of values
            df = pd.DataFrame([data], columns=feature_columns[: len(data)])
    else:
        df = pd.DataFrame(data)

    # Reorder or select expected feature columns
    existing_cols = [c for c in feature_columns if c in df.columns]
    missing_cols = [c for c in feature_columns if c not in df.columns]

    # Initialize missing columns with NaN
    for col in missing_cols:
        df[col] = np.nan

    # Reorder columns strictly to match training expectations
    return df[feature_columns]


def validate_input(
    df: pd.DataFrame,
    feature_columns: List[str],
) -> ValidationResult:
    """Validate DataFrame against feature columns and schema expectations.

    Checks:
        - Missing columns
        - Unexpected extra columns
        - Non-numeric or un-coercible numeric values
        - Infinities / overflow
        - Missing values (NaN handling)

    Returns:
        ValidationResult object.
    """
    errors: List[str] = []
    warnings: List[str] = []

    missing_cols = [c for c in feature_columns if c not in df.columns]
    if missing_cols:
        errors.append(f"Missing required feature columns: {missing_cols}")

    unexpected_cols = [c for c in df.columns if c not in feature_columns]
    if unexpected_cols:
        warnings.append(f"Input contains unexpected extra columns (ignored): {unexpected_cols[:5]}")

    cleaned_df = df.copy()

    # Numeric coercion and validation
    for col in feature_columns:
        if col in cleaned_df.columns:
            s = cleaned_df[col]
            # Try converting strings to numeric where possible
            if s.dtype == object:
                s_numeric = pd.to_numeric(s, errors="coerce")
                # If non-null string entries failed to parse completely, warn/impute
                non_null_orig = s.notna().sum()
                non_null_num = s_numeric.notna().sum()
                if non_null_orig > 0 and non_null_num < non_null_orig:
                    warnings.append(
                        f"Column '{col}' contains non-numeric strings that were coerced to NaN."
                    )
                cleaned_df[col] = s_numeric

            # Check infinities
            inf_mask = np.isinf(cleaned_df[col].astype(float))
            if inf_mask.any():
                warnings.append(f"Column '{col}' contains infinite values replaced with NaN.")
                cleaned_df.loc[inf_mask, col] = np.nan

            # Impute remaining NaNs with 0.0 to prevent scikit-learn fit/predict crash if missing
            if cleaned_df[col].isna().any():
                cleaned_df[col] = cleaned_df[col].fillna(0.0)

    is_valid = len(errors) == 0
    return ValidationResult(
        is_valid=is_valid,
        cleaned_df=cleaned_df,
        errors=errors,
        warnings=warnings,
        missing_columns=missing_cols,
        unexpected_columns=unexpected_cols,
    )


# ---------------------------------------------------------------------------
# Output Postprocessing
# ---------------------------------------------------------------------------

def postprocess_prediction(
    predictions: np.ndarray,
    probas: Optional[np.ndarray] = None,
    problem_type: str = "BinaryClassification",
    class_names: Optional[List[Any]] = None,
) -> List[Dict[str, Any]]:
    """Format raw scikit-learn model outputs into clean prediction dictionaries.

    Returns list of dicts with:
        - prediction (label or float)
        - confidence (float probability or None)
        - probabilities (dict of {class_name: prob} or None)
    """
    is_classification = "classification" in problem_type.lower()
    results: List[Dict[str, Any]] = []

    for i in range(len(predictions)):
        raw_pred = predictions[i]

        # Format label/value
        if is_classification:
            pred_val = str(raw_pred)
        else:
            try:
                pred_val = round(float(raw_pred), 6)
            except (ValueError, TypeError):
                pred_val = raw_pred

        confidence: Optional[float] = None
        prob_dict: Optional[Dict[str, float]] = None

        if is_classification and probas is not None and i < len(probas):
            row_p = probas[i]
            # Max probability = confidence
            confidence = round(float(np.max(row_p)), 6)

            # Build probability dictionary
            prob_dict = {}
            for cls_idx, p_val in enumerate(row_p):
                if class_names is not None and cls_idx < len(class_names):
                    c_name = str(class_names[cls_idx])
                else:
                    c_name = f"Class_{cls_idx}"
                prob_dict[c_name] = round(float(p_val), 6)

        results.append(
            {
                "prediction": pred_val,
                "confidence": confidence,
                "probabilities": prob_dict,
            }
        )

    return results


# ---------------------------------------------------------------------------
# Part 1 & 3: Single & Small Payload Prediction API
# ---------------------------------------------------------------------------

def predict(
    data: Any,
    model_id: Optional[str] = None,
    algorithm: Optional[str] = None,
    dataset_id: Optional[str] = None,
    return_probabilities: bool = True,
) -> Dict[str, Any]:
    """Execute end-to-end inference pipeline for a single sample or list of samples.

    Args:
        data: Feature dict, list of dicts, or DataFrame.
        model_id: Optional specific model ID.
        algorithm: Optional algorithm name filter if model_id is omitted.
        dataset_id: Optional dataset ID filter if model_id is omitted.
        return_probabilities: Whether to return class probability dictionary.

    Returns:
        Structured prediction response dictionary.

    Raises:
        ModelNotFoundError: If model cannot be loaded.
        InferenceValidationError: If feature inputs are invalid.
    """
    t0 = time.monotonic()
    pred_uuid = str(uuid.uuid4())

    try:
        # 1. Load model
        container = load_model(model_id=model_id, algorithm=algorithm, dataset_id=dataset_id)

        # 2. Preprocess input DataFrame
        df_raw = preprocess_input(data, container.feature_columns)

        # 3. Validate feature columns & types
        val_res = validate_input(df_raw, container.feature_columns)
        if not val_res.is_valid:
            raise InferenceValidationError(
                f"Feature validation failed: {'; '.join(val_res.errors)}",
                details={"missing_columns": val_res.missing_columns, "errors": val_res.errors},
            )

        X_input = val_res.cleaned_df

        # 4. Model Prediction
        preds = container.pipeline.predict(X_input)

        # 5. Model Probabilities
        probas: Optional[np.ndarray] = None
        if (
            return_probabilities
            and "classification" in container.problem_type.lower()
            and hasattr(container.pipeline, "predict_proba")
        ):
            try:
                probas = container.pipeline.predict_proba(X_input)
            except Exception as exc:
                logger.warning("predict_proba failed for %s: %s", container.model_id, exc)

        # 6. Postprocess
        formatted_preds = postprocess_prediction(
            preds,
            probas=probas,
            problem_type=container.problem_type,
            class_names=container.classes_,
        )

        latency_ms = round((time.monotonic() - t0) * 1000.0, 3)

        # Record metrics & audit log
        record_request(
            latency_ms=latency_ms,
            success=True,
            model_id=container.model_id,
        )

        first_res = formatted_preds[0] if formatted_preds else {}
        log_prediction(
            {
                "prediction_id": pred_uuid,
                "model_id": container.model_id,
                "model_version": container.model_version,
                "experiment_id": container.experiment_id,
                "algorithm": container.algorithm,
                "latency_ms": latency_ms,
                "prediction": first_res.get("prediction"),
                "confidence": first_res.get("confidence"),
                "feature_count": len(container.feature_columns),
                "dataset_version": container.dataset_version,
                "status": "success",
                "sample_count": len(X_input),
            }
        )

        metadata = {
            "prediction_id": pred_uuid,
            "model_id": container.model_id,
            "model_version": container.model_version,
            "experiment_id": container.experiment_id,
            "algorithm": container.algorithm,
            "problem_type": container.problem_type,
            "latency_ms": latency_ms,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "feature_count": len(container.feature_columns),
        }

        if len(X_input) == 1:
            return {
                "prediction": first_res.get("prediction"),
                "confidence": first_res.get("confidence"),
                "probabilities": first_res.get("probabilities"),
                "metadata": metadata,
            }

        return {
            "total_samples": len(X_input),
            "successful_predictions": len(formatted_preds),
            "failed_predictions": 0,
            "predictions": formatted_preds,
            "latency_ms": latency_ms,
            "metadata": metadata,
        }

    except Exception as exc:
        latency_ms = round((time.monotonic() - t0) * 1000.0, 3)
        record_request(
            latency_ms=latency_ms,
            success=False,
            model_id=model_id or "unknown",
            error=str(exc),
        )
        log_prediction(
            {
                "prediction_id": pred_uuid,
                "model_id": model_id or "unknown",
                "model_version": "unknown",
                "latency_ms": latency_ms,
                "status": "error",
                "error_message": str(exc),
            }
        )
        raise


def predict_proba(
    data: Any,
    model_id: Optional[str] = None,
    algorithm: Optional[str] = None,
    dataset_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Dedicated endpoint helper returning class probabilities."""
    res = predict(
        data=data,
        model_id=model_id,
        algorithm=algorithm,
        dataset_id=dataset_id,
        return_probabilities=True,
    )
    return res


# ---------------------------------------------------------------------------
# Part 6: Batch & CSV Inference Service
# ---------------------------------------------------------------------------

def predict_batch(
    data: Any,
    model_id: Optional[str] = None,
    algorithm: Optional[str] = None,
    dataset_id: Optional[str] = None,
    return_probabilities: bool = True,
    batch_size: int = 1000,
    save_csv: bool = False,
) -> Dict[str, Any]:
    """Batch inference service supporting large JSON arrays, DataFrames, and CSV file streams.

    Args:
        data: List of feature dicts, DataFrame, or CSV file path / bytes.
        model_id: Target model ID.
        algorithm: Optional algorithm name filter.
        dataset_id: Optional dataset ID filter.
        return_probabilities: Include probability distributions.
        batch_size: Chunk size for processing large datasets.
        save_csv: If True, exports predictions to a downloadable CSV file.

    Returns:
        BatchPredictionResponse dictionary.
    """
    t0 = time.monotonic()
    pred_uuid = str(uuid.uuid4())

    container = load_model(model_id=model_id, algorithm=algorithm, dataset_id=dataset_id)

    # Resolve data into a pandas DataFrame or iterable chunk reader
    if isinstance(data, str) and os.path.exists(data):
        df_input = pd.read_csv(data)
    elif isinstance(data, bytes):
        df_input = pd.read_csv(io.BytesIO(data))
    else:
        df_input = preprocess_input(data, container.feature_columns)

    total_samples = len(df_input)
    if total_samples == 0:
        return {
            "total_samples": 0,
            "successful_predictions": 0,
            "failed_predictions": 0,
            "predictions": [],
            "latency_ms": 0.0,
            "metadata": {
                "prediction_id": pred_uuid,
                "model_id": container.model_id,
                "model_version": container.model_version,
                "experiment_id": container.experiment_id,
                "algorithm": container.algorithm,
                "problem_type": container.problem_type,
                "latency_ms": 0.0,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "feature_count": len(container.feature_columns),
            },
            "csv_download_url": None,
        }

    formatted_all: List[Dict[str, Any]] = []
    raw_predictions: List[Any] = []
    raw_confidences: List[Optional[float]] = []

    # Process in chunks of batch_size
    for start_idx in range(0, total_samples, batch_size):
        end_idx = min(start_idx + batch_size, total_samples)
        chunk_df = df_input.iloc[start_idx:end_idx]

        val_res = validate_input(chunk_df, container.feature_columns)
        X_chunk = val_res.cleaned_df

        chunk_preds = container.pipeline.predict(X_chunk)
        chunk_probas: Optional[np.ndarray] = None
        if (
            return_probabilities
            and "classification" in container.problem_type.lower()
            and hasattr(container.pipeline, "predict_proba")
        ):
            try:
                chunk_probas = container.pipeline.predict_proba(X_chunk)
            except Exception:
                chunk_probas = None

        chunk_formatted = postprocess_prediction(
            chunk_preds,
            probas=chunk_probas,
            problem_type=container.problem_type,
            class_names=container.classes_,
        )

        formatted_all.extend(chunk_formatted)
        for item in chunk_formatted:
            raw_predictions.append(item["prediction"])
            raw_confidences.append(item["confidence"])

    latency_ms = round((time.monotonic() - t0) * 1000.0, 3)

    record_request(
        latency_ms=latency_ms,
        success=True,
        model_id=container.model_id,
    )

    log_prediction(
        {
            "prediction_id": pred_uuid,
            "model_id": container.model_id,
            "model_version": container.model_version,
            "experiment_id": container.experiment_id,
            "algorithm": container.algorithm,
            "latency_ms": latency_ms,
            "prediction": "batch",
            "feature_count": len(container.feature_columns),
            "status": "success",
            "is_batch": True,
            "sample_count": total_samples,
        }
    )

    # Optional CSV Export
    csv_url: Optional[str] = None
    if save_csv:
        os.makedirs(_PREDICTIONS_OUTPUT_DIR, exist_ok=True)
        csv_filename = f"prediction_{pred_uuid[:8]}.csv"
        csv_path = os.path.join(_PREDICTIONS_OUTPUT_DIR, csv_filename)

        output_df = df_input.copy()
        output_df["prediction"] = raw_predictions
        if any(c is not None for c in raw_confidences):
            output_df["confidence"] = raw_confidences

        output_df.to_csv(csv_path, index=False)
        csv_url = f"/api/v1/predict/download/{csv_filename}"

    metadata = {
        "prediction_id": pred_uuid,
        "model_id": container.model_id,
        "model_version": container.model_version,
        "experiment_id": container.experiment_id,
        "algorithm": container.algorithm,
        "problem_type": container.problem_type,
        "latency_ms": latency_ms,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "feature_count": len(container.feature_columns),
    }

    return {
        "total_samples": total_samples,
        "successful_predictions": len(formatted_all),
        "failed_predictions": 0,
        "predictions": formatted_all,
        "latency_ms": latency_ms,
        "metadata": metadata,
        "csv_download_url": csv_url,
    }
