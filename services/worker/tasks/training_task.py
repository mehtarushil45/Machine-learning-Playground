"""Celery ML Training Task.

Executes asynchronous Machine Learning training jobs in Celery worker processes.
"""

import sys
import os
from typing import Any, Dict

# Ensure project root is in PYTHONPATH
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..")))

from services.worker.celery_app import celery_app
from app.ml.engine import execute_ml_training_pipeline_sync


@celery_app.task(name="execute_ml_training_job", bind=True, max_retries=2)
def execute_ml_training_job(self: Any, job_id: str, config: Dict[str, Any]) -> Dict[str, Any]:
    """Celery task executing scikit-learn model training pipeline."""
    try:
        return execute_ml_training_pipeline_sync(job_id, config)
    except Exception as exc:
        raise self.retry(exc=exc, countdown=5)
