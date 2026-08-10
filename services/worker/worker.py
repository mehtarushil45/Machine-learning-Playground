"""Celery Worker Entrypoint.

Run from repository root:
    PYTHONPATH=. python services/worker/worker.py
Or via celery CLI:
    PYTHONPATH=. celery -A services.worker.celery_app worker --loglevel=info
"""

from services.worker.celery_app import celery_app, get_celery_config

if __name__ == "__main__":
    config = get_celery_config()
    argv = [
        "worker",
        f"--pool={config['worker_pool']}",
        f"--concurrency={config['worker_concurrency']}",
        "--loglevel=info",
    ]
    celery_app.start(argv=argv)
