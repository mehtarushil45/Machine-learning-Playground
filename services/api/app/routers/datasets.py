"""Datasets router.

Provides endpoints for uploading, validating, profiling, health scoring, recommendations, and managing datasets.

Authentication & Multi-tenancy
-------------------------------
All endpoints require a valid Bearer token / httpOnly cookie via ``CurrentUser``.
Read and write operations are strictly scoped to ``current_user.organisation_id``.

Core Endpoints:
    POST /upload              — upload + validate + parse + store
    POST /                    — alias for /upload
    GET  /                    — list organization datasets
    GET  /{dataset_id}        — get dataset metadata by ID
    GET  /{dataset_id}/profile
    GET  /{dataset_id}/health
    GET  /{dataset_id}/recommendations
"""

import csv
import io
import logging
import os
import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.config import settings
from typing import Annotated
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import CurrentUser, get_db
from app.models.dataset import Dataset, DatasetStatus
from app.schemas.dataset import (
    DatasetHealthResponse,
    DatasetListResponse,
    DatasetProfileResponse,
    DatasetRecommendationResponse,
    DatasetResponse,
    DatasetUploadResponse,
    DatasetUploadV2Response,
)
from app.ingestion.storage_backend import StorageError, get_configured_backend
from app.services.health import health_service
from app.services.ingestion_service import ingestion_service
from app.services.profiler import TabularDataContainer, profiler_service
from app.services.recommendation import recommendation_service


def sanitize_filename(filename: str) -> str:
    """Return a safe filename stripped of path traversal characters."""
    base = os.path.basename(filename)
    cleaned = re.sub(r"[^\w\.-]", "_", base)
    return cleaned or "dataset.csv"


router = APIRouter(prefix="/datasets", tags=["Datasets"])

logger = logging.getLogger("apex_ingestion.router")


@router.get("", response_model=DatasetListResponse, summary="List organization datasets (paginated)")
async def list_datasets(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    skip: int = 0,
    limit: int = 50,
) -> DatasetListResponse:
    """List datasets registered in active organization session, paginated and scoped to current user's organisation_id.

    - **Pagination**: `skip` (offset) and `limit` (page size).
    - **Multi-tenancy**: Strictly filtered by `current_user.organisation_id`.
    """
    skip_val = max(0, skip)
    limit_val = max(1, min(100, limit))
    org_id = current_user.organisation_id

    if db is None:
        return DatasetListResponse(total=0, skip=skip_val, limit=limit_val, datasets=[])

    try:
        # Total count query filtered by organisation_id
        count_stmt = (
            select(func.count())
            .select_from(Dataset)
            .where(Dataset.organisation_id == org_id)
        )
        total_res = await db.execute(count_stmt)
        total_count = total_res.scalar_one_or_none() or 0

        # Paginated items query
        items_stmt = (
            select(Dataset)
            .where(Dataset.organisation_id == org_id)
            .order_by(Dataset.created_at.desc())
            .offset(skip_val)
            .limit(limit_val)
        )
        res = await db.execute(items_stmt)
        dataset_rows = res.scalars().all()

        dataset_responses = [
            DatasetResponse(
                id=ds.id,
                name=ds.name,
                description=ds.description,
                original_filename=ds.original_filename,
                file_size_bytes=ds.file_size_bytes,
                row_count=ds.row_count,
                column_count=ds.column_count,
                status=ds.status.value if hasattr(ds.status, "value") else str(ds.status),
                organisation_id=ds.organisation_id,
                user_id=ds.user_id,
                created_at=ds.created_at,
                updated_at=ds.updated_at,
            )
            for ds in dataset_rows
        ]

        return DatasetListResponse(
            total=total_count,
            skip=skip_val,
            limit=limit_val,
            datasets=dataset_responses,
        )
    except Exception as exc:
        logger.warning("DB query failed in list_datasets: %s", exc)
        return DatasetListResponse(total=0, skip=skip_val, limit=limit_val, datasets=[])


@router.get(
    "/{dataset_id}",
    response_model=DatasetResponse,
    summary="Get dataset metadata by ID",
)
async def get_dataset_by_id(
    dataset_id: str,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> DatasetResponse:
    """Retrieve basic dataset metadata from PostgreSQL table, including status, row/column counts, file size, and created_at.

    - **Security**: Strictly scoped to `current_user.organisation_id`. Returns 404 if dataset is not found or belongs to another organisation.
    - **Error Handling**: 404 Not Found if dataset does not exist.
    """
    try:
        ds_uuid = uuid.UUID(dataset_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Dataset with ID '{dataset_id}' not found.",
        )

    if db is not None:
        try:
            stmt = select(Dataset).where(
                Dataset.id == ds_uuid,
                Dataset.organisation_id == current_user.organisation_id,
            )
            res = await db.execute(stmt)
            ds = res.scalar_one_or_none()
            if ds is not None:
                return DatasetResponse(
                    id=ds.id,
                    name=ds.name,
                    description=ds.description,
                    original_filename=ds.original_filename,
                    file_size_bytes=ds.file_size_bytes,
                    row_count=ds.row_count,
                    column_count=ds.column_count,
                    status=ds.status.value if hasattr(ds.status, "value") else str(ds.status),
                    organisation_id=ds.organisation_id,
                    user_id=ds.user_id,
                    created_at=ds.created_at,
                    updated_at=ds.updated_at,
                )
        except HTTPException:
            raise
        except Exception as exc:
            logger.warning("Database query error in get_dataset_by_id: %s", exc)

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Dataset with ID '{dataset_id}' not found.",
    )


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
    current_user: CurrentUser,
    file: UploadFile = File(...),
) -> DatasetUploadResponse:
    """Validate, parse metadata from, and securely store an uploaded CSV dataset.

    - **Validation**: CSV extension, MIME type, max size (50MB), non-empty file, non-corrupted structure.
    - **Isolation**: Stored under organisation-scoped path for multi-tenant isolation.
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

    # 5. Safe Filename & Storage — delegated to StorageBackend with Organisation Scoping
    dataset_id = uuid.uuid4()
    safe_filename = sanitize_filename(file.filename)
    org_id_str = str(current_user.organisation_id)
    backend = get_configured_backend()

    logger.info(
        "POST /upload — selected StorageBackend: %s (type=%s, org=%s)",
        type(backend).__name__,
        getattr(backend, "_backend", type(backend).__name__),
        org_id_str,
    )

    try:
        location = backend.save_stream(
            chunks=[content],
            dataset_id=str(dataset_id),
            filename=safe_filename,
            organisation_id=org_id_str,
        )
    except StorageError as exc:
        logger.error(
            "POST /upload — storage FAILED backend=%s file='%s': %s",
            type(backend).__name__,
            safe_filename,
            exc,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to store uploaded dataset: {exc}",
        ) from exc
    except OSError as exc:
        logger.error(
            "POST /upload — OSError backend=%s file='%s': %s",
            type(backend).__name__,
            safe_filename,
            exc,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to store uploaded dataset on server: {exc}",
        ) from exc

    logger.info(
        "POST /upload — stored OK backend=%s path='%s' size=%d bytes",
        location.backend,
        location.path,
        location.size_bytes,
    )

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
async def get_dataset_profile(
    dataset_id: str,
    current_user: CurrentUser,
) -> DatasetProfileResponse:
    """Analyze and return comprehensive schema, statistics, and quality profile for a dataset."""
    org_id_str = str(current_user.organisation_id)
    org_dir = os.path.join(settings.upload_dir, org_id_str)

    matched_filename = None
    matched_file_path = None
    prefix = f"{dataset_id}_"

    # 1. Search in organisation-scoped upload directory
    if os.path.exists(org_dir):
        for fname in os.listdir(org_dir):
            if fname == dataset_id or fname.startswith(prefix):
                matched_filename = fname[len(prefix) :] if fname.startswith(prefix) else fname
                matched_file_path = os.path.join(org_dir, fname)
                break

    # 2. Fallback search in base upload_dir for legacy unscoped datasets
    if not matched_file_path and os.path.exists(settings.upload_dir):
        for fname in os.listdir(settings.upload_dir):
            fpath = os.path.join(settings.upload_dir, fname)
            if os.path.isfile(fpath) and (fname == dataset_id or fname.startswith(prefix)):
                matched_filename = fname[len(prefix) :] if fname.startswith(prefix) else fname
                matched_file_path = fpath
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
async def get_dataset_health(
    dataset_id: str,
    current_user: CurrentUser,
) -> DatasetHealthResponse:
    """Evaluate and return dataset health score, grade, warnings, issues, and recommendations.

    Consumes DatasetProfileResponse (single source of truth). Does NOT re-parse raw files.
    """
    profile = await get_dataset_profile(dataset_id, current_user)
    return health_service.evaluate_health(profile)


@router.get(
    "/{dataset_id}/recommendations",
    response_model=DatasetRecommendationResponse,
    summary="Get ML problem type, model architectures, and preprocessing recommendations",
)
async def get_dataset_recommendations(
    dataset_id: str,
    current_user: CurrentUser,
) -> DatasetRecommendationResponse:
    """Produce ML task recommendations, candidate targets, feature actions, and model choices.

    Consumes DatasetProfileResponse and DatasetHealthResponse (sources of truth).
    """
    profile = await get_dataset_profile(dataset_id, current_user)
    health = health_service.evaluate_health(profile)
    return recommendation_service.generate_recommendations(profile, health)


# ---------------------------------------------------------------------------
# Version 2 — Streaming ingestion endpoint
# ---------------------------------------------------------------------------


@router.post(
    "/upload/v2",
    response_model=DatasetUploadV2Response,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Stream-upload a CSV dataset via the v2 ingestion pipeline",
    description=(
        "Upload a CSV file using the Version 2 enterprise ingestion pipeline. "
        "The endpoint performs a fast pre-screen (extension, MIME, header row) "
        "and streams the file to storage in 64 KB chunks — the full file content "
        "is never loaded into memory simultaneously. "
        "Returns HTTP 202 Accepted immediately. "
        "The background pipeline (Celery or daemon thread fallback) runs CSV "
        "validation, schema fingerprinting, and statistical profiling. "
        "Poll the returned ``poll_url`` for live progress via the existing "
        "``GET /api/v1/jobs/{job_id}/progress`` endpoint."
    ),
    response_description=(
        "202 Accepted — ingestion job queued. "
        "Poll poll_url for status; dataset_id is available for profile/health "
        "endpoints once the job reaches COMPLETED status."
    ),
)
async def upload_dataset_v2(
    current_user: CurrentUser,
    file: UploadFile = File(
        ...,
        description="CSV file to ingest (max 50 MB, UTF-8 or ISO-8859-1 encoded).",
    ),
) -> DatasetUploadV2Response:
    """Stream-ingest a CSV file and queue a background validation + profiling job.

    Unlike the v1 ``/upload`` endpoint which blocks until parsing completes,
    this endpoint returns immediately after the file is safely on disk.
    The background job performs:

    1. Full streaming CSV validation (encoding, delimiter, header, row count).
    2. Deterministic schema fingerprint generation from column metadata.
    3. Statistical column profiling via the shared ``profiler_service``.

    **HTTP Statuses**:
    - ``202 Accepted``: File stored; ingestion pipeline queued.
    - ``400 Bad Request``: Invalid extension, MIME type, or encoding.
    - ``413 Payload Too Large``: File exceeds the 50 MB limit.
    - ``422 Unprocessable Entity``: Missing or blank CSV header row.
    - ``500 Internal Server Error``: Disk write failure.
    """
    return await ingestion_service.create_ingestion_job(
        file,
        user_id=str(current_user.id),
        organisation_id=str(current_user.organisation_id),
    )
