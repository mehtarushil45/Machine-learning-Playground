"""Tests for Code Execution with Distributed Celery Sandbox & WebSocket/SSE Streaming.

Milestone 5 (Pillar 2: Enterprise Code Studio) verification.
"""

from __future__ import annotations

import asyncio
import os
import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import patch, MagicMock

from app.main import app
from app.services.code_execution_service import (
    start_execution,
    get_execution,
    stop_execution,
    stream_execution_events,
)
from services.worker.tasks.code_execution_task import execute_code_sandbox


@pytest.mark.asyncio
async def test_local_sandbox_execution_success():
    """Verify local sandboxed execution runs code, streams stdout, and records status."""
    code = """
print("Starting training job...")
x = 2 + 2
print(f"Result: {x}")
"""
    rec = await start_execution(code=code, filename="test_train.py", prefer_celery=False)
    assert rec.exec_id is not None
    assert rec.status in ("queued", "running")

    # Wait for execution to finish
    for _ in range(30):
        await asyncio.sleep(0.1)
        r = get_execution(rec.exec_id)
        if r and r.status in ("completed", "failed"):
            break

    final = get_execution(rec.exec_id)
    assert final is not None
    assert final.status == "completed"
    assert final.exit_code == 0
    assert "Result: 4" in final.stdout


@pytest.mark.asyncio
async def test_local_sandbox_model_auto_registration():
    """Verify that models trained and saved to disk are auto-registered into Model Registry."""
    code = """
import joblib
from sklearn.dummy import DummyClassifier

clf = DummyClassifier(strategy="most_frequent")
clf.fit([[1], [2]], [0, 1])
joblib.dump(clf, "model.joblib")
print("Model saved to model.joblib")
"""
    rec = await start_execution(code=code, filename="train_model.py", prefer_celery=False)
    for _ in range(80):
        await asyncio.sleep(0.1)
        r = get_execution(rec.exec_id)
        if r and r.status in ("completed", "failed"):
            break

    final = get_execution(rec.exec_id)
    assert final is not None
    assert final.status == "completed"
    assert "model.joblib" in final.artifacts
    assert final.registered_model_id is not None
    assert final.registered_model_id.startswith("model-exec-")


@pytest.mark.asyncio
async def test_celery_worker_sandbox_task():
    """Verify Celery execute_code_sandbox synchronous worker task."""
    code = """
import sys
print("Celery Worker Sandbox running...")
sys.stderr.write("Sample warning message\\n")
"""
    exec_id = "test-celery-worker-exec-001"
    res = execute_code_sandbox(
        exec_id,
        code,
        filename="train_worker.py",
        timeout=10,
    )
    assert res["status"] == "completed"
    assert res["exit_code"] == 0
    assert "Celery Worker Sandbox running..." in res["stdout"]


@pytest.mark.asyncio
async def test_code_execution_api_routes():
    """Verify HTTP API endpoints for code execution submission and status."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Submit code
        resp = await client.post(
            "/api/v1/code-execution/execute",
            json={
                "code": "print('API Test Exec')",
                "filename": "api_test.py",
                "timeout": 30,
            },
        )
        assert resp.status_code == 202
        data = resp.json()
        exec_id = data["exec_id"]
        assert exec_id

        # Check result
        await asyncio.sleep(0.5)
        res_get = await client.get(f"/api/v1/code-execution/{exec_id}")
        assert res_get.status_code == 200
        res_data = res_get.json()
        assert res_data["exec_id"] == exec_id


@pytest.mark.asyncio
async def test_code_execution_stop_endpoint():
    """Verify stop endpoint terminates a running script."""
    code = """
import time
print("Sleeping...")
time.sleep(20)
print("Finished sleeping")
"""
    rec = await start_execution(code=code, filename="long_task.py", prefer_celery=False)
    await asyncio.sleep(0.2)
    stopped = await stop_execution(rec.exec_id)
    assert stopped is True
    r = get_execution(rec.exec_id)
    assert r is not None
    assert r.status == "stopped"
