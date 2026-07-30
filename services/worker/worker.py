"""Celery Worker Entrypoint.

Run from CLI:
    python services/worker/worker.py
Or via celery CLI:
    celery -A services.worker.celery_app worker --loglevel=info
"""

import sys
import os

# Ensure root directory is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from services.worker.celery_app import celery_app

if __name__ == "__main__":
    celery_app.start(argv=["worker", "--loglevel=info"])
