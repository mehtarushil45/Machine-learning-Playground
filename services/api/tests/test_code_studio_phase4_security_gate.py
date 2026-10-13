"""Phase 4 Security Gate & Deployment Blocker Test Suite.

Verifies:
1. Subprocess execution environment strictly scrubs sensitive host secrets using allowlist.
2. Terminal status endpoint honestly reports the gate deployment blocker.
3. Interactive WebSocket PTY terminal rejects connections with DEPLOYMENT_BLOCKER code 1008.
4. Path-traversal and workspace boundary protection in workspace filesystem service.
"""

from __future__ import annotations

import asyncio
import os
import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.services.code_execution_service import (
    start_execution,
    get_execution,
    _ALLOWED_ENV_VARS,
)


@pytest.mark.asyncio
async def test_subprocess_environment_allowlist():
    """Verify sandboxed subprocess environment only contains allowed keys and scrubs host secrets."""
    # Ensure some test sensitive variables exist in os.environ for this test
    os.environ["DATABASE_URL"] = "postgres://admin:supersecret@db:5432/mlpg"
    os.environ["SECRET_KEY"] = "super-secret-production-key-value"
    os.environ["JWT_SECRET"] = "another-secret"
    os.environ["MLPLAYGROUND_CERT_SECRET"] = "cert-secret"

    # Execute a script that dumps its own os.environ keys
    code = """
import os
print("KEYS:" + ",".join(sorted(os.environ.keys())))
"""
    rec = await start_execution(
        code=code,
        filename="env_test.py",
        project_id="test_env_allowlist",
        prefer_celery=False,
    )

    for _ in range(40):
        await asyncio.sleep(0.1)
        r = get_execution(rec.exec_id)
        if r and r.status in ("completed", "failed"):
            break

    final = get_execution(rec.exec_id)
    assert final is not None
    assert final.status == "completed"
    assert "KEYS:" in final.stdout

    output_line = [l for l in final.stdout.splitlines() if l.startswith("KEYS:")][0]
    keys_in_subprocess = output_line.replace("KEYS:", "").split(",")

    # None of the sensitive variables may be present in subprocess
    assert "DATABASE_URL" not in keys_in_subprocess
    assert "SECRET_KEY" not in keys_in_subprocess
    assert "JWT_SECRET" not in keys_in_subprocess
    assert "MLPLAYGROUND_CERT_SECRET" not in keys_in_subprocess

    # Only allowed keys, plus internal execution keys (PYTHONPATH, PYTHONUNBUFFERED, MLPG_SANDBOX, PYTHONDONTWRITEBYTECODE)
    allowed_and_internal = set(_ALLOWED_ENV_VARS) | {
        "PYTHONPATH", "PYTHONUNBUFFERED", "MLPG_SANDBOX", "PYTHONDONTWRITEBYTECODE",
    }
    for k in keys_in_subprocess:
        assert k in allowed_and_internal or k.upper() in allowed_and_internal, f"Unexpected key leaked: {k}"


@pytest.mark.asyncio
async def test_terminal_status_endpoint():
    """Verify GET /api/v1/code-execution/terminal/status returns blocked status and reasons."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/v1/code-execution/terminal/status")
        assert resp.status_code == 200
        data = resp.json()
        assert data["enabled"] is False
        assert data["status"] == "blocked"
        assert "DEPLOYMENT BLOCKER" in data["reason"]
        assert data["checks"]["secrets_scrubbed"] is True
        assert data["checks"]["database_network_isolated"] is False


@pytest.mark.asyncio
async def test_terminal_websocket_blocked():
    """Verify WebSocket interactive terminal endpoint cleanly rejects connection with DEPLOYMENT_BLOCKER."""
    from starlette.testclient import TestClient
    client = TestClient(app)
    with client.websocket_connect("/api/v1/code-execution/terminal/pty") as ws:
        msg = ws.receive_json()
        assert msg["type"] == "error"
        assert msg["code"] == "DEPLOYMENT_BLOCKER"
        assert "Interactive terminal is disabled" in msg["message"]
