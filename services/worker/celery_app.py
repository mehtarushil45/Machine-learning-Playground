"""Celery Worker Application.

Configures Celery instance, Redis broker, result backend, task registration,
heartbeat, and retry policies.
"""

import os
import sys

# Ensure repository root directory is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from celery import Celery

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "apex_ml_worker",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=["services.worker.tasks.training_task"],
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
    worker_pool="solo",
)

if __name__ == "__main__":
    celery_app.start()
