"""Application configuration loaded from environment variables.

All values come from the .env file at the repo root.
See /.env.example for the full list and expected formats.
"""

import os

from pydantic_settings import BaseSettings

# Absolute path to the uploads directory, anchored to this file's location.
# This file lives at: services/api/app/config.py
# uploads/ lives at: services/api/uploads/
# Resolving relative to __file__ makes the path deterministic regardless of
# the CWD used to launch uvicorn (repo root vs services/api/).
_DEFAULT_UPLOAD_DIR: str = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "uploads")
)

# Deterministic search paths for .env relative to config.py location
# Enables pydantic_settings to find .env whether uvicorn runs from
# repo root, services/api/, or services/api/app/.
_ENV_FILE_PATHS: tuple[str, ...] = (
    ".env",
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".env")),
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".env")),
)


class Settings(BaseSettings):
    # ── Database ─────────────────────────────────────────────────────────────
    database_url: str = "postgresql+asyncpg://postgres:postgres@db:5432/mlplatform"

    # ── JWT / Auth ────────────────────────────────────────────────────────────
    secret_key: str = "change-me-in-production"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    # ── Redis ─────────────────────────────────────────────────────────────────
    redis_url: str = "redis://redis:6379/0"

    # ── S3-compatible Object Storage ──────────────────────────────────────────
    s3_endpoint_url: str = "http://minio:9000"
    s3_access_key: str = "minioadmin"
    s3_secret_key: str = "minioadmin"
    s3_bucket_name: str = "ml-datasets"

    # ── Dataset Upload Settings ───────────────────────────────────────────────
    max_upload_size_bytes: int = 50 * 1024 * 1024  # 50 MB
    # upload_dir is an absolute path so it is CWD-independent.
    # Override by setting UPLOAD_DIR=/absolute/path in .env.
    upload_dir: str = _DEFAULT_UPLOAD_DIR

    # ── Storage Backend Selector ──────────────────────────────────────────────
    # Allowed values: "local" | "minio"
    # Set STORAGE_BACKEND=minio in .env to activate the MinIO backend.
    # All other code reads only the StorageBackend Protocol — never this value.
    storage_backend: str = "local"

    model_config = {
        "env_file": _ENV_FILE_PATHS,
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


# Module-level singleton — import this everywhere.
settings = Settings()
