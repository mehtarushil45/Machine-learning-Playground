"""Celery Worker Entrypoint.

Run from repository root:
    PYTHONPATH=. python services/worker/worker.py
Or via celery CLI:
    PYTHONPATH=. celery -A services.worker.celery_app worker --loglevel=info
"""

from services.worker.celery_app import celery_app

if __name__ == "__main__":
    celery_app.start(
        argv=[
            "worker",
            "--pool=solo",
            "--loglevel=info",
        ]
    )
