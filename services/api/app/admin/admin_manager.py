"""Global Configuration & Metadata Management — V7B.

Provides read-only system metadata and platform-wide configuration settings.
Settings are evaluated lazily to prevent module-level import failures.
"""

from __future__ import annotations

import platform
import sys
from typing import Dict

from app.config import settings
from app.schemas.admin import PlatformSettings


def get_platform_settings() -> PlatformSettings:
    """Return the global platform settings, evaluated at call time."""
    max_mb = settings.max_upload_size_bytes // (1024 * 1024)
    env = settings.database_url.split("://")[0].replace("+asyncpg", "")
    return PlatformSettings(
        platform_name="Enterprise ML Platform",
        version="7B.2",
        environment=env,
        max_upload_size_mb=max_mb,
        allow_public_registrations=False,
        require_email_verification=True,
        default_storage_quota_gb=100,
    )


def get_platform_metadata() -> Dict[str, str]:
    """Return system information and metadata."""
    return {
        "python_version": sys.version.split(" ")[0],
        "os_platform": platform.platform(),
        "architecture": platform.machine(),
        "storage_backend": settings.storage_backend,
        "database_dialect": settings.database_url.split(":")[0].replace("+asyncpg", ""),
        "upload_dir": settings.upload_dir,
        "s3_endpoint": settings.s3_endpoint_url,
        "platform_version": "7B.2",
    }
