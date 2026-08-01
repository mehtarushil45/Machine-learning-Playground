"""Prediction & Inference REST API Router — Sprint 6 Part 3.

Provides REST endpoints for:
  - Single & row-wise model inference: POST /api/v1/predict
  - Batch JSON and CSV file inference: POST /api/v1/predict/batch
  - Inference-ready model discovery: GET /api/v1/predict/models
  - Model inference metadata schema: GET /api/v1/predict/models/{id}
  - Inference engine telemetry & health: GET /api/v1/predict/health
  - Prediction CSV download: GET /api/v1/predict/download/{filename}
"""

from __future__ import annotations

import io
import os
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse, JSONResponse

from app.ml.inference_engine import (
    InferenceValidationError,
    ModelNotFoundError,
    get_cached_models,
    load_model,
    predict,
    predict_batch,
    _PREDICTIONS_OUTPUT_DIR,
)
from app.ml.inference_metrics import get_metrics_summary
from app.ml.model_registry import get_active_model, get_model_by_id, list_models
from app.ml.prediction_logger import get_recent_logs
from app.schemas.prediction import (
    BatchPredictionRequest,
    BatchPredictionResponse,
    PredictionRequest,
    PredictionResponse,
    ValidationErrorResponse,
)

router = APIRouter(prefix="/predict", tags=["Prediction & Inference"])


# ---------------------------------------------------------------------------
# 1. Single / Row-wise Inference Endpoint
# ---------------------------------------------------------------------------

@router.post(
    "",
    summary="Execute real-time model inference",
    response_model=None,
)
async def predict_endpoint(request: PredictionRequest) -> Dict[str, Any]:
    """Run real-time inference on a feature dictionary or list of feature dicts."""
    try:
        res = predict(
            data=request.data,
            model_id=request.model_id,
            algorithm=request.algorithm,
            dataset_id=request.dataset_id,
            return_probabilities=request.return_probabilities,
        )
        return res

    except ModelNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        )
    except InferenceValidationError as exc:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "error_type": "ValidationError",
                "message": str(exc),
                "details": exc.details,
            },
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Inference execution failed: {str(exc)}",
        )


# ---------------------------------------------------------------------------
# 2. Batch & CSV File Inference Endpoint
# ---------------------------------------------------------------------------

@router.post(
    "/batch",
    summary="Execute batch inference (JSON array or CSV file upload)",
    response_model=None,
)
async def predict_batch_endpoint(
    request: Optional[BatchPredictionRequest] = None,
    file: Optional[UploadFile] = File(None),
    model_id: Optional[str] = Form(None),
    algorithm: Optional[str] = Form(None),
    dataset_id: Optional[str] = Form(None),
    batch_size: int = Form(1000),
    return_probabilities: bool = Form(True),
) -> Dict[str, Any]:
    """Execute high-throughput batch predictions via JSON payload or uploaded CSV file."""
    try:
        # Case A: CSV File Upload
        if file is not None:
            if not file.filename.endswith(".csv"):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Batch upload must be a valid .csv file.",
                )
            content = await file.read()
            res = predict_batch(
                data=content,
                model_id=model_id,
                algorithm=algorithm,
                dataset_id=dataset_id,
                return_probabilities=return_probabilities,
                batch_size=batch_size,
                save_csv=True,
            )
            return res

        # Case B: JSON Request Payload
        if request is not None:
            res = predict_batch(
                data=request.data,
                model_id=request.model_id or model_id,
                algorithm=request.algorithm or algorithm,
                dataset_id=request.dataset_id or dataset_id,
                return_probabilities=request.return_probabilities,
                batch_size=request.batch_size or batch_size,
                save_csv=False,
            )
            return res

        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide either a JSON body or multipart CSV file.",
        )

    except ModelNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        )
    except InferenceValidationError as exc:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "error_type": "ValidationError",
                "message": str(exc),
                "details": exc.details,
            },
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Batch inference failed: {str(exc)}",
        )


# ---------------------------------------------------------------------------
# 3. Model Discovery Endpoints
# ---------------------------------------------------------------------------

@router.get(
    "/models",
    summary="List active models available for prediction",
)
async def list_inference_models(
    algorithm: Optional[str] = Query(None),
    dataset_id: Optional[str] = Query(None),
) -> Dict[str, Any]:
    """List registered ACTIVE models ready for inference."""
    active_models = list_models(
        status="ACTIVE",
        algorithm=algorithm,
        dataset_id=dataset_id,
    )
    return {
        "total_active_models": len(active_models),
        "models": active_models,
    }


@router.get(
    "/models/{model_id}",
    summary="Get inference schema & metadata for a model",
)
async def get_inference_model_schema(model_id: str) -> Dict[str, Any]:
    """Retrieve expected input feature schema, target column, and problem type for model_id."""
    meta = get_model_by_id(model_id)
    if not meta:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Model '{model_id}' not found in registry.",
        )
    return {
        "model_id": meta.get("model_id"),
        "algorithm": meta.get("algorithm"),
        "model_version": meta.get("model_version") or meta.get("version"),
        "problem_type": meta.get("problem_type"),
        "dataset_id": meta.get("dataset_id"),
        "target_column": meta.get("target_column"),
        "feature_columns": meta.get("feature_columns", []),
        "status": meta.get("status"),
        "metrics": meta.get("metrics"),
    }


# ---------------------------------------------------------------------------
# 4. Engine Health & Operational Metrics
# ---------------------------------------------------------------------------

@router.get(
    "/health",
    summary="Inference engine health & telemetry statistics",
)
async def inference_engine_health() -> Dict[str, Any]:
    """Return operational metrics, rolling latencies, error breakdown, and cached models status."""
    cached = get_cached_models()
    metrics = get_metrics_summary(cached_model_count=len(cached))
    recent_logs = get_recent_logs(limit=10)

    return {
        "status": "HEALTHY",
        "cached_models": cached,
        "telemetry": metrics,
        "recent_audit_logs": recent_logs,
    }


# ---------------------------------------------------------------------------
# 5. Batch CSV File Download Endpoint
# ---------------------------------------------------------------------------

@router.get(
    "/download/{filename}",
    summary="Download batch prediction CSV file",
)
async def download_prediction_csv(filename: str):
    """Download a generated batch prediction CSV file."""
    clean_name = os.path.basename(filename)
    csv_path = os.path.join(_PREDICTIONS_OUTPUT_DIR, clean_name)

    if not os.path.exists(csv_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Prediction CSV file '{clean_name}' not found or expired.",
        )

    return FileResponse(
        path=csv_path,
        media_type="text/csv",
        filename=clean_name,
    )
