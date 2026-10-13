"""Phase 3 Test Suite -- Isolated Execution Sandbox & Output Streaming.

Verifies:
  - Sandboxed execution with timeout handling and process tree killing
  - Concurrency queuing per project
  - Stop kills running process tree with status 'cancelled'
  - Raw output download endpoint
"""

from __future__ import annotations

import asyncio
import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.services.code_execution_service import (
    start_execution,
    get_execution,
    stop_execution,
    list_executions,
)


@pytest.mark.asyncio
async def test_execution_success_and_lifecycle():
    """Verify normal script completes, captures stdout and produces exit code 0."""
    code = """
print("Phase 3 Execution Verified")
total = sum([1, 2, 3, 4, 5])
print(f"SUM={total}")
"""
    rec = await start_execution(
        code=code,
        filename="verify_phase3.py",
        project_id="test_proj_p3_success",
        prefer_celery=False,
    )
    assert rec.exec_id is not None

    for _ in range(40):
        await asyncio.sleep(0.1)
        r = get_execution(rec.exec_id)
        if r and r.status in ("completed", "failed", "cancelled", "timed_out"):
            break

    final = get_execution(rec.exec_id)
    assert final is not None
    assert final.status == "completed"
    assert final.exit_code == 0
    assert "SUM=15" in final.stdout


@pytest.mark.asyncio
async def test_execution_timeout_kills_process_tree():
    """Verify runaway loops are killed on timeout with status 'timed_out' and exit code 124."""
    code = """
import time
while True:
    time.sleep(0.05)
"""
    rec = await start_execution(
        code=code,
        filename="infinite_loop.py",
        project_id="test_proj_p3_timeout",
        timeout=2,
        prefer_celery=False,
    )

    for _ in range(50):
        await asyncio.sleep(0.1)
        r = get_execution(rec.exec_id)
        if r and r.status in ("timed_out", "failed", "completed"):
            break

    final = get_execution(rec.exec_id)
    assert final is not None
    assert final.status == "timed_out"
    assert final.exit_code == 124
    assert final.error is not None
    assert "TIMEOUT after 2s" in final.error or "timed out" in final.error


@pytest.mark.asyncio
async def test_execution_stop_kills_process_tree():
    """Verify manual stop cancels running process tree and records status 'cancelled'."""
    code = """
import time
print("Loop started")
for i in range(100):
    time.sleep(0.5)
print("Finished")
"""
    rec = await start_execution(
        code=code,
        filename="stoppable_script.py",
        project_id="test_proj_p3_stop",
        prefer_celery=False,
    )

    await asyncio.sleep(0.3)
    stopped = await stop_execution(rec.exec_id)
    assert stopped is True

    final = get_execution(rec.exec_id)
    assert final is not None
    assert final.status == "cancelled"
    assert final.exit_code == 130


@pytest.mark.asyncio
async def test_project_concurrency_queue():
    """Verify concurrent runs on the same project are queued with position and auto-dequeued."""
    proj = "test_proj_p3_queue"

    # Job 1 runs for ~1s
    job1_code = "import time; time.sleep(0.8); print('Job 1 done')"
    rec1 = await start_execution(code=job1_code, project_id=proj, prefer_celery=False)
    assert rec1.status in ("running", "queued")

    # Job 2 is submitted immediately for the same project
    job2_code = "print('Job 2 done')"
    rec2 = await start_execution(code=job2_code, project_id=proj, prefer_celery=False)

    # Job 2 must be queued with position 1
    assert rec2.status == "queued"
    assert rec2.queue_position == 1

    # Wait for Job 1 to finish and Job 2 to auto-dequeue and complete
    for _ in range(60):
        await asyncio.sleep(0.1)
        r2 = get_execution(rec2.exec_id)
        if r2 and r2.status in ("completed", "failed"):
            break

    final2 = get_execution(rec2.exec_id)
    assert final2 is not None
    assert final2.status == "completed"
    assert "Job 2 done" in final2.stdout


@pytest.mark.asyncio
async def test_download_raw_output_endpoint():
    """Verify GET /api/v1/code-execution/{exec_id}/output/download returns raw text file."""
    code = "print('Line A'); print('Line B')"
    rec = await start_execution(code=code, filename="output_test.py", project_id="test_proj_p3_dl", prefer_celery=False)

    for _ in range(30):
        await asyncio.sleep(0.1)
        r = get_execution(rec.exec_id)
        if r and r.status == "completed":
            break

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get(f"/api/v1/code-execution/{rec.exec_id}/output/download")
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("text/plain")
        assert "attachment" in resp.headers["content-disposition"]
        assert "Line A" in resp.text
        assert "Line B" in resp.text
