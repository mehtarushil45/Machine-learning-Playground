"""Operations Manager — V7B.

Read-only insights into jobs and worker states.
Retry/cancel signals are written atomically to isolated admin storage.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any, Dict, List
from uuid import uuid4

from app.admin._storage import OPERATIONS_DIR, atomic_write, ensure_dir
from app.schemas.admin import OperationsDashboard, WorkerStatus


def get_operations_dashboard() -> OperationsDashboard:
    """Return operations dashboard stats.
    
    Real deployments would inspect Celery/Redis inspect APIs here.
    """
    return OperationsDashboard(
        total_workers=3,
        active_workers=2,
        queued_jobs=12,
        running_jobs=4,
        failed_jobs_24h=1,
    )


def list_active_workers() -> List[WorkerStatus]:
    """Return list of active worker node states."""
    now = datetime.now(timezone.utc)
    return [
        WorkerStatus(worker_id="worker-node-1", status="active", active_jobs=2, last_heartbeat=now),
        WorkerStatus(worker_id="worker-node-2", status="active", active_jobs=2, last_heartbeat=now),
    ]


def get_running_jobs() -> List[Dict[str, Any]]:
    """Return list of running job summaries (read-only from job store)."""
    return [{"job_id": "job-1", "status": "running", "worker": "worker-node-1"}]


def get_failed_jobs() -> List[Dict[str, Any]]:
    """Return list of recently failed job summaries."""
    return [{"job_id": "job-2", "status": "failed", "worker": "worker-node-2"}]


def _signal_job(job_id: str, action: str) -> None:
    """Write an atomic job signal file — append-only, does not mutate job store."""
    ensure_dir(OPERATIONS_DIR)
    signal_id = uuid4().hex[:8]
    path = os.path.join(OPERATIONS_DIR, f"{job_id}_{action}_{signal_id}.json")
    payload = json.dumps(
        {"job_id": job_id, "action": action, "timestamp": datetime.now(timezone.utc).isoformat()}
    )
    atomic_write(path, payload, "operations")


def cancel_job(job_id: str) -> None:
    """Issue a cancel signal for a job."""
    _signal_job(job_id, "cancel")


def retry_job(job_id: str) -> None:
    """Issue a retry signal for a job."""
    _signal_job(job_id, "retry")
