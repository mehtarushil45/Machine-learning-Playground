"""Health-check router.

GET /health       — Liveness probe (200 while process is running).
GET /health/ready — Readiness probe (PostgreSQL SELECT 1, Redis ping, disk space, upload storage test).
"""

from __future__ import annotations

import asyncio
import os
import shutil
import time
import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.dependencies import get_db
from app.schemas.common import (
    HealthResponse,
    ReadinessDependencyStatus,
    ReadinessResponse,
)

router = APIRouter(tags=["Health"])


async def _check_database_ping(db: AsyncSession | None) -> ReadinessDependencyStatus:
    """Perform PostgreSQL connectivity check with a SELECT 1 query."""
    start_time = time.perf_counter()
    try:
        if db is not None:
            await asyncio.wait_for(db.execute(text("SELECT 1")), timeout=2.0)
        else:
            from app.database import AsyncSessionLocal
            async with AsyncSessionLocal() as session:
                await asyncio.wait_for(session.execute(text("SELECT 1")), timeout=2.0)

        latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
        return ReadinessDependencyStatus(status="ok", latency_ms=latency_ms)

    except asyncio.TimeoutError:
        return ReadinessDependencyStatus(
            status="unhealthy", error="Database ping timed out (2.0s limit)"
        )
    except Exception as exc:
        return ReadinessDependencyStatus(status="unhealthy", error=str(exc))


async def _check_redis_ping() -> ReadinessDependencyStatus:
    """Perform Redis connectivity check via PING command."""
    start_time = time.perf_counter()
    try:
        import redis.asyncio as aioredis
        client = aioredis.from_url(
            settings.redis_url, socket_connect_timeout=2.0, socket_timeout=2.0
        )
        pong = await asyncio.wait_for(client.ping(), timeout=2.0)
        await client.aclose()
        latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
        if pong:
            return ReadinessDependencyStatus(status="ok", latency_ms=latency_ms)
        return ReadinessDependencyStatus(status="unhealthy", error="Redis ping returned False")
    except Exception as exc:
        return ReadinessDependencyStatus(status="unhealthy", error=str(exc))


async def _check_disk_space() -> ReadinessDependencyStatus:
    """Perform disk space availability check on upload directory storage mount."""
    start_time = time.perf_counter()
    upload_dir = settings.upload_dir
    try:
        os.makedirs(upload_dir, exist_ok=True)
        total, used, free = shutil.disk_usage(upload_dir)
        latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
        free_mb = round(free / (1024 * 1024), 2)

        # Enforce minimum 100 MB free space threshold
        min_free_bytes = 100 * 1024 * 1024
        if free >= min_free_bytes:
            return ReadinessDependencyStatus(
                status="ok",
                latency_ms=latency_ms,
                path=upload_dir,
                free_mb=free_mb,
            )
        return ReadinessDependencyStatus(
            status="unhealthy",
            path=upload_dir,
            free_mb=free_mb,
            error=f"Insufficient disk space: {free_mb} MB free (minimum 100 MB required)",
        )
    except Exception as exc:
        return ReadinessDependencyStatus(
            status="unhealthy", path=upload_dir, error=str(exc)
        )


async def _check_storage_write() -> ReadinessDependencyStatus:
    """Perform upload directory write/read/delete verification test."""
    start_time = time.perf_counter()
    upload_dir = settings.upload_dir
    test_filepath = None
    try:
        os.makedirs(upload_dir, exist_ok=True)
        test_filename = f".health_probe_{uuid.uuid4().hex[:8]}.tmp"
        test_filepath = os.path.join(upload_dir, test_filename)

        with open(test_filepath, "w", encoding="utf-8") as f:
            f.write("probe")
            f.flush()
            os.fsync(f.fileno())

        with open(test_filepath, "r", encoding="utf-8") as f:
            content = f.read()

        if os.path.exists(test_filepath):
            os.remove(test_filepath)

        latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
        if content == "probe":
            return ReadinessDependencyStatus(
                status="ok", latency_ms=latency_ms, path=upload_dir
            )
        return ReadinessDependencyStatus(
            status="unhealthy",
            path=upload_dir,
            error="Storage write verification mismatch",
        )
    except Exception as exc:
        if test_filepath and os.path.exists(test_filepath):
            try:
                os.remove(test_filepath)
            except Exception:
                pass
        return ReadinessDependencyStatus(
            status="unhealthy", path=upload_dir, error=str(exc)
        )


@router.get("/health", response_model=HealthResponse, summary="Liveness probe")
async def health() -> HealthResponse:
    """Returns ``{"status": "ok"}`` as long as the API process is running."""
    return HealthResponse(status="ok")


@router.get(
    "/health/ready",
    response_model=ReadinessResponse,
    summary="Readiness probe — checks PostgreSQL, Redis, disk space, and storage dependencies",
)
async def readiness_check(
    response: Response,
    db: Annotated[AsyncSession | None, Depends(get_db)] = None,
) -> ReadinessResponse:
    """Readiness probe checking PostgreSQL connectivity (SELECT 1), Redis ping, disk space, and storage write.

    - **PostgreSQL**: `SELECT 1` query execution with 100ms timeout.
    - **Redis**: PING command to configured Redis URL.
    - **Disk Space**: Disk free space check (minimum 100MB threshold).
    - **Storage**: Directory write, read, and delete test in `settings.upload_dir`.

    Returns HTTP 200 OK when all dependencies are healthy.
    Returns HTTP 503 Service Unavailable when any critical dependency fails.
    """
    timestamp = datetime.now(timezone.utc).isoformat()

    db_dep = await _check_database_ping(db)
    redis_dep = await _check_redis_ping()
    disk_dep = await _check_disk_space()
    storage_dep = await _check_storage_write()

    dependencies = {
        "database": db_dep,
        "redis": redis_dep,
        "disk": disk_dep,
        "storage": storage_dep,
    }

    all_ok = all(dep.status == "ok" for dep in dependencies.values())
    overall_status = "ok" if all_ok else "unhealthy"

    if not all_ok:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return ReadinessResponse(
        status=overall_status,
        service="ml-platform-api",
        timestamp=timestamp,
        dependencies=dependencies,
    )
