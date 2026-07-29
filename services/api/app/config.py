"""Application configuration loaded from environment variables.

All values come from the .env file at the repo root.
See /.env.example for the full list and expected formats.
"""

from pydantic_settings import BaseSettings


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
    upload_dir: str = "uploads"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


# Module-level singleton — import this everywhere.
settings = Settings()
