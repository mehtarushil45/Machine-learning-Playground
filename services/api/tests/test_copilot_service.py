"""Tests for Enterprise AI Copilot Service and Router.

Validates that:
1. No static mock answers or canned sample questions exist.
2. Unconfigured state returns clear setup instructions for Gemini/Groq/OpenAI/Ollama.
3. Configured provider sends user code, dataset schema, and traceback into prompt.
4. FastAPI endpoints (/api/v1/copilot/status, /api/v1/copilot/chat) enforce schema contracts.
"""

import pytest
from unittest.mock import AsyncMock, patch
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.services.copilot_service import CopilotService


@pytest.mark.asyncio
async def test_copilot_status_unconfigured(monkeypatch):
    """When no API key is set, status correctly indicates requires_key."""
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("AI_COPILOT_API_KEY", raising=False)
    monkeypatch.setenv("AI_COPILOT_PROVIDER", "gemini")

    status = CopilotService.get_status()
    assert status["configured"] is False
    assert status["requires_key"] is True
    assert status["provider"] == "gemini"


@pytest.mark.asyncio
async def test_copilot_generate_response_unconfigured_instructions(monkeypatch):
    """When unconfigured, returns instructions rather than fake canned answers."""
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("AI_COPILOT_API_KEY", raising=False)
    monkeypatch.setenv("AI_COPILOT_PROVIDER", "gemini")

    res = await CopilotService.generate_response(prompt="How do I tune hyperparameters?")
    assert res["configured"] is False
    assert "GEMINI_API_KEY" in res["reply"]
    assert "No hardcoded questions or static templates are stored on this platform" in res["reply"]


@pytest.mark.asyncio
async def test_copilot_generate_response_gemini_success(monkeypatch):
    """When Gemini key is configured, calls Gemini endpoint and injects context."""
    monkeypatch.setenv("GEMINI_API_KEY", "test-gemini-key")
    monkeypatch.setenv("AI_COPILOT_PROVIDER", "gemini")

    mock_json_reply = {
        "candidates": [
            {
                "content": {
                    "parts": [
                        {"text": "Use GridSearchCV with param_grid={'n_estimators': [50, 100]}"}
                    ]
                }
            }
        ]
    }

    mock_resp = AsyncMock()
    mock_resp.status_code = 200
    mock_resp.json = lambda: mock_json_reply

    with patch("httpx.AsyncClient.post", return_value=mock_resp) as mock_post:
        res = await CopilotService.generate_response(
            prompt="Optimize my random forest",
            code_context="pipeline.fit(X, y)",
            dataset_name="churn.csv",
            dataset_schema={"features": ["tenure", "monthly_charges"]},
            error_traceback="ValueError: NaN in target",
        )

        assert res["configured"] is True
        assert "GridSearchCV" in res["reply"]
        assert mock_post.called

        # Verify that context was injected into prompt payload
        call_kwargs = mock_post.call_args[1]
        req_json = call_kwargs["json"]
        sys_obj = req_json.get("systemInstruction") or req_json.get("system_instruction") or {}
        sys_instruction = sys_obj.get("parts", [{}])[0].get("text", "")
        assert "churn.csv" in sys_instruction
        assert "pipeline.fit(X, y)" in sys_instruction
        assert "ValueError: NaN in target" in sys_instruction


@pytest.mark.asyncio
async def test_copilot_api_router_endpoints(monkeypatch):
    """Verify HTTP API endpoints /api/v1/copilot/status and /chat."""
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("AI_COPILOT_API_KEY", raising=False)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # GET /status
        st_resp = await client.get("/api/v1/copilot/status")
        assert st_resp.status_code == 200
        data = st_resp.json()
        assert "configured" in data
        assert "provider" in data

        # POST /chat
        chat_resp = await client.post(
            "/api/v1/copilot/chat",
            json={"prompt": "Explain StandardScaler vs MinMaxScaler"},
        )
        assert chat_resp.status_code == 200
        chat_data = chat_resp.json()
        assert "reply" in chat_data
        assert "configured" in chat_data
