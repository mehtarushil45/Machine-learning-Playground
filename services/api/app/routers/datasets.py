"""Datasets router.

Provides endpoints for uploading, validating, profiling, health scoring, recommendations, and managing datasets.
"""

import csv
from datetime import datetime, timezone
import io
import os
import re
import uuid

from fastapi import APIRouter, File, HTTPException, UploadFile, status

from services.api.app.config import settings
from services.api.app.schemas.common import MessageResponse
from services.api.app.schemas.dataset import (
    DatasetHealthResponse,
    DatasetProfileResponse,
    DatasetRecommendationResponse,
    DatasetUploadResponse,
)
from services.api.app.services.health import health_service
from services.api.app.services.profiler import TabularDataContainer, profiler_service
from services.api.app.services.recommendation import recommendation_service

router = APIRouter(prefix="/datasets", tags=["Datasets"])


def sanitize_filename(filename: str) -> str:
    """Return a safe filename stripped of path traversal characters."""
    base = os.path.basename(filename)
    cleaned = re.sub(r"[^\w\.-]", "_", base)
    return cleaned or "dataset.csv"


@router.get("", response_model=MessageResponse, summary="List datasets")
async def list_datasets() -> MessageResponse:
    """List datasets registered in active organization session."""
    return MessageResponse(message="Datasets listing endpoint.")


@router.post(
    "/upload",
    response_model=DatasetUploadResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload and validate a CSV dataset",
)
@router.post(
    "",
    response_model=DatasetUploadResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload and validate a CSV dataset (alias)",
)
async def upload_dataset(
    file: UploadFile = File(...),
) -> DatasetUploadResponse:
    """Validate, parse metadata from, and securely store an uploaded CSV dataset.

    - **Validation**: CSV extension, MIME type, max size (50MB), non-empty file, non-corrupted structure.
    - **HTTP Statuses**:
        - 400 Bad Request: Unsupported format, invalid encoding, empty file.
        - 413 Payload Too Large: Size > 50MB.
        - 422 Unprocessable Entity: Missing headers or no data rows.
        - 500 Internal Server Error: Storage failure.
    """
    if not file or not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No file was provided in the upload request.",
        )

    # 1. Extension Validation
    filename_lower = file.filename.lower()
    if not filename_lower.endswith(".csv"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported file format. Only CSV (.csv) files are allowed.",
        )

    # 2. MIME Type Validation (if header provided)
    allowed_mimes = {
        "text/csv",
        "text/plain",
        "application/csv",
        "application/x-csv",
        "text/x-csv",
        "application/vnd.ms-excel",
        "application/octet-stream",
    }
    if file.content_type and file.content_type.lower() not in allowed_mimes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid MIME type '{file.content_type}'. Only CSV files are supported.",
        )

    # 3. Read Content & Size Validation
    try:
        content = await file.read()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to read uploaded file: {str(exc)}",
        ) from exc

    size_bytes = len(content)
    if size_bytes == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded CSV file is empty (0 bytes).",
        )

    if size_bytes > settings.max_upload_size_bytes:
        max_mb = settings.max_upload_size_bytes // (1024 * 1024)
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File size ({size_bytes} bytes) exceeds maximum limit of {max_mb} MB.",
        )

    # 4. Decode Content & Parse CSV Structure
    decoded_text = ""
    for encoding in ["utf-8-sig", "utf-8", "iso-8859-1"]:
        try:
            decoded_text = content.decode(encoding)
            break
        except UnicodeDecodeError:
            continue

    if not decoded_text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Malformed CSV file: Unable to decode file content with UTF-8 or ISO-8859-1.",
        )

    try:
        sample_stream = io.StringIO(decoded_text)
        reader = csv.reader(sample_stream)

        # Read header row
        header = next(reader, None)
        if not header or not any(col.strip() for col in header):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Invalid CSV structure: File is missing a valid header row.",
            )

        columns = [col.strip() for col in header if col.strip()]

        # Read data rows
        data_rows = [row for row in reader if row and any(cell.strip() for cell in row)]
        row_count = len(data_rows)

        if row_count == 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Invalid CSV structure: File contains headers but no valid data rows.",
            )

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Malformed CSV: Failed to parse tabular structure ({str(exc)}).",
        ) from exc

    # 5. Safe Filename & Storage
    dataset_id = uuid.uuid4()
    safe_filename = sanitize_filename(file.filename)

    try:
        os.makedirs(settings.upload_dir, exist_ok=True)
        file_path = os.path.join(settings.upload_dir, f"{dataset_id}_{safe_filename}")

        with open(file_path, "wb") as f:
            f.write(content)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to store uploaded dataset on server: {str(exc)}",
        ) from exc

    uploaded_at = datetime.now(timezone.utc)

    return DatasetUploadResponse(
        dataset_id=dataset_id,
        filename=safe_filename,
        size_bytes=size_bytes,
        uploaded_at=uploaded_at,
        status="uploaded",
        row_count=row_count,
        column_count=len(columns),
        columns=columns,
    )


@router.get(
    "/{dataset_id}/profile",
    response_model=DatasetProfileResponse,
    summary="Get comprehensive statistical and quality profile of a dataset",
)
async def get_dataset_profile(dataset_id: str) -> DatasetProfileResponse:
    """Analyze and return comprehensive schema, statistics, and quality profile for a dataset."""
    if not os.path.exists(settings.upload_dir):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Dataset with ID '{dataset_id}' not found.",
        )

    # Locate dataset file matching prefix {dataset_id}_
    matched_filename = None
    matched_file_path = None
    prefix = f"{dataset_id}_"

    for fname in os.listdir(settings.upload_dir):
        if fname == dataset_id or fname.startswith(prefix):
            matched_filename = fname[len(prefix) :] if fname.startswith(prefix) else fname
            matched_file_path = os.path.join(settings.upload_dir, fname)
            break

    if not matched_file_path or not os.path.isfile(matched_file_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Dataset with ID '{dataset_id}' was not found on server.",
        )

    try:
        size_bytes = os.path.getsize(matched_file_path)
        with open(matched_file_path, "r", encoding="utf-8-sig", errors="replace") as f:
            reader = csv.DictReader(f)
            columns = reader.fieldnames or []
            rows = [dict(r) for r in reader]

        container = TabularDataContainer(
            dataset_id=dataset_id,
            filename=matched_filename or "dataset.csv",
            columns=columns,
            rows=rows,
            memory_usage_bytes=size_bytes,
        )

        return profiler_service.profile(container)

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to profile dataset '{dataset_id}': {str(exc)}",
        ) from exc


@router.get(
    "/{dataset_id}/health",
    response_model=DatasetHealthResponse,
    summary="Get enterprise quality health score and audit report for a dataset",
)
async def get_dataset_health(dataset_id: str) -> DatasetHealthResponse:
    """Evaluate and return dataset health score, grade, warnings, issues, and recommendations.

    Consumes DatasetProfileResponse (single source of truth). Does NOT re-parse raw files.
    """
    profile = await get_dataset_profile(dataset_id)
    return health_service.evaluate_health(profile)


@router.get(
    "/{dataset_id}/recommendations",
    response_model=DatasetRecommendationResponse,
    summary="Get ML problem type, model architectures, and preprocessing recommendations",
)
async def get_dataset_recommendations(dataset_id: str) -> DatasetRecommendationResponse:
    """Produce ML task recommendations, candidate targets, feature actions, and model choices.

    Consumes DatasetProfileResponse and DatasetHealthResponse (sources of truth).
    """
    profile = await get_dataset_profile(dataset_id)
    health = health_service.evaluate_health(profile)
    return recommendation_service.generate_recommendations(profile, health)
