"""Shared dataset-file location and loading helpers for API and worker processes.

Provides canonical dataset loading via the project's StorageBackend abstraction
supporting both local filesystem storage and MinIO / S3 object storage with
multi-tenant organisation isolation.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Optional
import uuid

import pandas as pd

logger = logging.getLogger("apex_ml.dataset_loader")

UPLOADS_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "api", "uploads")
)


VALID_DATASET_EXTENSIONS = (".csv", ".parquet", ".pq")


def _read_dataframe_from_path(file_path: str) -> pd.DataFrame:
    """Read dataframe from CSV or Parquet file path."""
    if file_path.lower().endswith((".parquet", ".pq")):
        return pd.read_parquet(file_path)
    return pd.read_csv(file_path)


def find_dataset_path(dataset_id: str) -> str:
    """Find CSV or Parquet file path in uploads directory or storage backend corresponding to dataset_id.

    Searches storage backend (MinIO / S3) first for uploaded datasets, database dataset records,
    and root upload directories (excluding execution sandboxes, workspaces, and hidden benchmarks).

    Raises:
        FileNotFoundError: If no matching CSV or Parquet dataset file is found for dataset_id.
    """
    if not dataset_id:
        raise FileNotFoundError("Empty dataset_id provided to find_dataset_path.")

    target = dataset_id.strip()

    # 1. Direct path check
    if os.path.exists(target) and any(target.lower().endswith(ext) for ext in VALID_DATASET_EXTENSIONS):
        return os.path.abspath(target)

    # 2. Check MinIO / S3 Object Storage backend first (primary storage for uploaded datasets)
    try:
        from app.ingestion.storage_backend import get_configured_backend
        backend: Any = get_configured_backend()
        if backend is not None and hasattr(backend, "download_to_temp"):
            temp_path = backend.download_to_temp(dataset_id=target)
            if temp_path and os.path.exists(temp_path):
                return temp_path
    except Exception as exc:
        logger.debug("MinIO temp lookup in find_dataset_path: %s", exc)

    # 3. Check PostgreSQL database records for Dataset.file_path
    try:
        from sqlalchemy import create_engine, text
        db_url = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/mlplatform")
        if "asyncpg" in db_url:
            db_url = db_url.replace("+asyncpg", "")
        engine = create_engine(db_url, connect_args={"connect_timeout": 2})
        with engine.connect() as conn:
            stmt = text("SELECT file_path FROM datasets WHERE id::text = :ds_id OR name = :name LIMIT 1")
            res = conn.execute(stmt, {"ds_id": target, "name": os.path.basename(target)})
            row = res.fetchone()
            if row and row[0]:
                stored_path = row[0]
                if os.path.exists(stored_path):
                    return stored_path
                # Try downloading from MinIO using the stored object key
                try:
                    from app.ingestion.storage_backend import get_configured_backend
                    backend_db: Any = get_configured_backend()
                    if backend_db is not None and hasattr(backend_db, "download_to_temp"):
                        temp_p = backend_db.download_to_temp(dataset_id=target, filename=os.path.basename(stored_path))
                        if temp_p and os.path.exists(temp_p):
                            return temp_p
                except Exception:
                    pass
    except Exception:
        pass

    # 4. Gather candidate upload roots (excluding workspaces/sandboxes)
    candidate_roots = []
    if os.path.exists(UPLOADS_DIR):
        candidate_roots.append(UPLOADS_DIR)

    alt_dirs = [
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "api", "uploads")),
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "uploads")),
        os.path.abspath("uploads"),
        os.path.abspath("/app/services/api/uploads"),
        os.path.abspath("/app/uploads"),
    ]
    for d in alt_dirs:
        if os.path.exists(d) and d not in candidate_roots:
            candidate_roots.append(d)

    clean_target = os.path.basename(target).lower()
    clean_target_stem = os.path.splitext(clean_target)[0]

    EXCLUDED_DIRS = ("hidden_benchmarks", "prediction_logs", "workspaces", ".git", "__pycache__", "sandboxes")

    # Pass A: Exact filename match across all subdirectories
    for root_dir in candidate_roots:
        for root, _, files in os.walk(root_dir):
            if any(skip in root for skip in EXCLUDED_DIRS):
                continue
            for f in files:
                if any(f.lower().endswith(ext) for ext in VALID_DATASET_EXTENSIONS):
                    if f.lower() == clean_target:
                        return os.path.join(root, f)

    # Pass B: Exact stem match (e.g. "telecom_churn" matches "telecom_churn.csv")
    for root_dir in candidate_roots:
        for root, _, files in os.walk(root_dir):
            if any(skip in root for skip in EXCLUDED_DIRS):
                continue
            for f in files:
                if any(f.lower().endswith(ext) for ext in VALID_DATASET_EXTENSIONS):
                    f_stem = os.path.splitext(f.lower())[0]
                    if f_stem == clean_target_stem:
                        return os.path.join(root, f)

    # Pass C: Substring in filename
    for root_dir in candidate_roots:
        for root, _, files in os.walk(root_dir):
            if any(skip in root for skip in EXCLUDED_DIRS):
                continue
            for f in files:
                if any(f.lower().endswith(ext) for ext in VALID_DATASET_EXTENSIONS):
                    f_lower = f.lower()
                    if len(clean_target_stem) >= 4 and clean_target_stem in f_lower:
                        return os.path.join(root, f)

    raise FileNotFoundError(
        f"No dataset file found for dataset_id='{dataset_id}'. "
        "Please upload a valid CSV dataset before training."
    )


def load_dataset_dataframe(
    dataset_id: str,
    organisation_id: Optional[str | uuid.UUID] = None,
    file_path_hint: Optional[str] = None,
    original_filename: Optional[str] = None,
) -> pd.DataFrame:
    """Load dataset DataFrame via the canonical StorageBackend abstraction.

    Respects ``settings.storage_backend`` (``"local"`` or ``"minio"``), securely
    handling temporary object storage downloads and multi-tenant organisation scoping.

    Args:
        dataset_id: UUID string of the dataset.
        organisation_id: Optional organisation UUID for tenant boundary checks.
        file_path_hint: Optional file path stored in database record.
        original_filename: Optional original dataset filename.

    Returns:
        Loaded pandas DataFrame.

    Raises:
        FileNotFoundError: If the dataset file/object cannot be found.
        ValueError: If CSV parsing fails or data is corrupted.
    """
    org_id_str = str(organisation_id) if organisation_id else None
    dataset_id_str = dataset_id if isinstance(dataset_id, str) else str(dataset_id)
    filename = original_filename or (os.path.basename(file_path_hint) if file_path_hint else "dataset.csv")

    try:
        from app.ingestion.storage_backend import get_configured_backend
        from app.ingestion.minio_backend import MinIOStorageBackend

        backend = get_configured_backend()
    except Exception as exc:
        logger.warning("Could not initialize StorageBackend (%s), falling back to local resolver", exc)
        backend = None

    # ── 1. MinIO / S3 Object Storage Abstraction ──────────────────────────────
    backend_any: Any = backend
    if backend_any is not None and hasattr(backend_any, "download_to_temp"):
        logger.info(
            "Loading dataset '%s' (org=%s) via MinIO object storage abstraction",
            dataset_id_str,
            org_id_str,
        )
        temp_path: Optional[str] = None
        try:
            temp_path = backend_any.download_to_temp(
                dataset_id=dataset_id_str,
                filename=filename,
                organisation_id=org_id_str,
            )
            if temp_path:
                df = _read_dataframe_from_path(temp_path)
                return df
        except Exception as exc:
            logger.warning(
                "MinIO download_to_temp failed for dataset '%s': %s. Checking local fallback...",
                dataset_id_str,
                exc,
            )
            # If MinIO failed, attempt local fallback below
        finally:
            if temp_path and os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except Exception:
                    pass

    # ── 2. Local FileSystem Storage Abstraction ───────────────────────────────
    if file_path_hint and os.path.exists(file_path_hint) and os.path.isfile(file_path_hint):
        return _read_dataframe_from_path(file_path_hint)

    resolved_path = find_dataset_path(dataset_id_str)
    return _read_dataframe_from_path(resolved_path)
