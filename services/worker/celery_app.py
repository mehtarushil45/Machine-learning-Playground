"""Celery Worker Application.

Configures Celery instance for multi-environment execution:
- Solo pool in development (with memory:// or Redis broker).
- Prefork pool in production (with Redis broker).
- Environment variable overrides for pool type, concurrency, and broker URLs.
- Health check task for active monitoring.
"""

from __future__ import annotations

import os
from typing import Any, Dict
from celery import Celery


def mask_url(url: str) -> str:
    """Mask sensitive credentials in connection strings for safe logging."""
    if not url:
        return ""
    if "@" in url and "://" in url:
        scheme, rest = url.split("://", 1)
        _, host_path = rest.split("@", 1)
        return f"{scheme}://***@{host_path}"
    return url


def get_celery_config() -> Dict[str, Any]:
    """Compute Celery configuration dynamically based on environment and env vars.

    Environment variables:
        ENVIRONMENT / APP_ENV / CELERY_ENV: 'development' | 'production' | 'staging'
        CELERY_WORKER_POOL / CELERY_POOL: Overrides default pool ('solo', 'prefork', etc.)
        CELERY_WORKER_CONCURRENCY / CELERY_CONCURRENCY: Overrides worker concurrency count
        CELERY_BROKER_URL / REDIS_URL / BROKER_URL: Custom broker connection string
        CELERY_RESULT_BACKEND / REDIS_URL / RESULT_BACKEND: Custom result backend connection string
    """
    raw_env = (
        os.environ.get("ENVIRONMENT")
        or os.environ.get("APP_ENV")
        or os.environ.get("CELERY_ENV")
        or "development"
    ).strip().lower()

    is_prod = raw_env in ("production", "prod", "staging")
    env_name = "production" if is_prod else "development"

    # Pool type configuration: solo for dev, prefork for prod (overrideable via env)
    pool_override = os.environ.get("CELERY_WORKER_POOL") or os.environ.get("CELERY_POOL")
    if pool_override and pool_override.strip():
        worker_pool = pool_override.strip().lower()
    else:
        worker_pool = "prefork" if is_prod else "solo"

    # Concurrency configuration: cpu_count or 4 for prod prefork, 1 for dev solo (overrideable via env)
    concurrency_override = os.environ.get("CELERY_WORKER_CONCURRENCY") or os.environ.get("CELERY_CONCURRENCY")
    if concurrency_override and concurrency_override.strip():
        try:
            worker_concurrency = int(concurrency_override.strip())
        except ValueError:
            worker_concurrency = os.cpu_count() or 4
    else:
        if is_prod and worker_pool == "prefork":
            worker_concurrency = os.cpu_count() or 4
        else:
            worker_concurrency = 1

    # Broker and Result Backend configuration: Redis in prod, memory/RPC fallback in dev unless Redis URL is provided
    default_redis = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

    broker_url = (
        os.environ.get("CELERY_BROKER_URL")
        or os.environ.get("REDIS_URL")
        or os.environ.get("BROKER_URL")
    )
    if not broker_url:
        broker_url = default_redis if is_prod else "memory://"

    backend_url = (
        os.environ.get("CELERY_RESULT_BACKEND")
        or os.environ.get("REDIS_URL")
        or os.environ.get("RESULT_BACKEND")
    )
    if not backend_url:
        backend_url = default_redis if is_prod else "rpc://"

    return {
        "environment": env_name,
        "worker_pool": worker_pool,
        "worker_concurrency": worker_concurrency,
        "broker_url": broker_url,
        "backend_url": backend_url,
        "is_prod": is_prod,
    }


# Initial configuration resolution
config = get_celery_config()

celery_app = Celery(
    "apex_ml_worker",
    broker=config["broker_url"],
    backend=config["backend_url"],
    include=[
        "services.worker.tasks.training_task",
        "services.worker.tasks.ingestion_task",
        "services.worker.tasks.health_task",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    broker_connection_retry_on_startup=True,
    task_track_started=True,
    task_time_limit=3600,
    task_soft_time_limit=3300,
    worker_prefetch_multiplier=1,
    worker_pool=config["worker_pool"],
    worker_concurrency=config["worker_concurrency"],
)

if __name__ == "__main__":
    celery_app.start()
