"""Celery Tasks module."""

from services.worker.tasks.training_task import execute_ml_training_job

__all__ = ["execute_ml_training_job"]
