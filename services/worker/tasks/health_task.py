"""Celery Worker Health Check Task.

Provides active health monitoring and system metadata reporting for Celery workers.
"""

from __future__ import annotations

from datetime import datetime, timezone
import os
import sys
from typing import Any, Dict

import celery
from services.worker.celery_app import celery_app, get_celery_config, mask_url


@celery_app.task(name="celery_health_check", bind=True)
def health_check_task(self: Any) -> Dict[str, Any]:
    """Execute health check and return detailed worker telemetry and configuration status."""
    config = get_celery_config()
    now = datetime.now(timezone.utc)

    task_id = self.request.id if (hasattr(self, "request") and self.request) else None

    return {
        "status": "healthy",
        "timestamp": now.isoformat(),
        "task_id": task_id,
        "environment": config["environment"],
        "worker_pool": config["worker_pool"],
        "worker_concurrency": config["worker_concurrency"],
        "broker_url": mask_url(config["broker_url"]),
        "backend_url": mask_url(config["backend_url"]),
        "celery_version": celery.__version__,
        "python_version": sys.version.split()[0],
        "pid": os.getpid(),
        "registered_tasks": sorted(list(celery_app.tasks.keys())),
    }
