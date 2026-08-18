"""Shared dataset-file location and loading helpers for API and worker processes.

Provides canonical dataset loading via the project's StorageBackend abstraction
supporting both local filesystem storage and MinIO / S3 object storage with
multi-tenant organisation isolation.
"""

from __future__ import annotations

import logging
import os
from typing import Optional
import uuid

import pandas as pd

logger = logging.getLogger("apex_ml.dataset_loader")

UPLOADS_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "api", "uploads")
)


def find_dataset_path(dataset_id: str) -> str:
    """Find CSV file path in uploads directory corresponding to dataset_id.

    Searches both the root upload directory and organisation-scoped subdirectories.

    Raises:
        FileNotFoundError: If no matching CSV dataset file is found for dataset_id.
    """
    if os.path.exists(dataset_id) and dataset_id.endswith(".csv"):
        return dataset_id

    if os.path.exists(UPLOADS_DIR):
        # 1. Search root upload directory
        for fname in os.listdir(UPLOADS_DIR):
            fpath = os.path.join(UPLOADS_DIR, fname)
            if os.path.isfile(fpath) and (dataset_id in fname and fname.endswith(".csv")):
                return fpath
            # 2. Search organisation-scoped subdirectories
            if os.path.isdir(fpath):
                for sub_fname in os.listdir(fpath):
                    if dataset_id in sub_fname and sub_fname.endswith(".csv"):
                        return os.path.join(fpath, sub_fname)

    # 3. Check MinIO / S3 Object Storage backend
    try:
        from app.ingestion.storage_backend import get_configured_backend
        backend = get_configured_backend()
        if backend is not None and hasattr(backend, "download_to_temp"):
            temp_path = backend.download_to_temp(dataset_id=dataset_id)
            if temp_path and os.path.exists(temp_path):
                return temp_path
    except Exception as exc:
        logger.debug("MinIO temp lookup in find_dataset_path: %s", exc)

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
    dataset_id_str = str(dataset_id)
    filename = original_filename or (os.path.basename(file_path_hint) if file_path_hint else "dataset.csv")

    try:
        from app.ingestion.storage_backend import get_configured_backend
        from app.ingestion.minio_backend import MinIOStorageBackend

        backend = get_configured_backend()
    except Exception as exc:
        logger.warning("Could not initialize StorageBackend (%s), falling back to local resolver", exc)
        backend = None

    # ── 1. MinIO / S3 Object Storage Abstraction ──────────────────────────────
    if backend is not None and hasattr(backend, "download_to_temp"):
        logger.info(
            "Loading dataset '%s' (org=%s) via MinIO object storage abstraction",
            dataset_id_str,
            org_id_str,
        )
        temp_path: Optional[str] = None
        try:
            temp_path = backend.download_to_temp(
                dataset_id=dataset_id_str,
                filename=filename,
                organisation_id=org_id_str,
            )
            df = pd.read_csv(temp_path)
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
        return pd.read_csv(file_path_hint)

    resolved_path = find_dataset_path(dataset_id_str)
    return pd.read_csv(resolved_path)
