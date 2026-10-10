"""AI Copilot Router — Dedicated endpoints for real-time AI assistance across the workbench.

Provides:
- POST /api/v1/copilot/chat: Real-time LLM inference with active studio code/dataset context.
- GET  /api/v1/copilot/status: AI provider and readiness status.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from app.dependencies import get_current_user_optional
from app.models.user import User
from app.services.copilot_service import CopilotService

router = APIRouter(prefix="/copilot", tags=["AI Copilot"])


class CopilotChatRequest(BaseModel):
    prompt: str = Field(..., description="User question or coding prompt")
    code: Optional[str] = Field(None, description="Active Python code in editor")
    dataset_name: Optional[str] = Field(None, description="Currently loaded dataset name")
    dataset_schema: Optional[Dict[str, Any]] = Field(None, description="Features and column metadata")
    error_traceback: Optional[str] = Field(None, description="Recent execution error traceback")
    chat_history: Optional[List[Dict[str, str]]] = Field(None, description="Recent conversation turns")
    policy: str = Field("full", description="Copilot policy: 'full' | 'explain-only'")


class CopilotChatResponse(BaseModel):
    reply: str
    provider: str
    model: str
    configured: bool
    allowed: bool = True


class CopilotStatusResponse(BaseModel):
    configured: bool
    provider: str
    model: str
    requires_key: bool


@router.get("/status", response_model=CopilotStatusResponse, summary="Get AI Copilot readiness status")
async def get_copilot_status() -> CopilotStatusResponse:
    """Return whether the AI Copilot has an active LLM provider configured."""
    status = CopilotService.get_status()
    return CopilotStatusResponse(**status)


@router.post("/chat", response_model=CopilotChatResponse, summary="Send query to AI Copilot")
async def chat_with_copilot(
    payload: CopilotChatRequest,
    current_user: Optional[User] = Depends(get_current_user_optional),
) -> CopilotChatResponse:
    """Generate real-time AI response with dynamic code & dataset context."""
    res = await CopilotService.generate_response(
        prompt=payload.prompt,
        code_context=payload.code,
        dataset_name=payload.dataset_name,
        dataset_schema=payload.dataset_schema,
        error_traceback=payload.error_traceback,
        chat_history=payload.chat_history,
        policy=payload.policy,
    )
    return CopilotChatResponse(
        reply=res.get("reply", ""),
        provider=res.get("provider", "unknown"),
        model=res.get("model", "unknown"),
        configured=res.get("configured", False),
        allowed=res.get("allowed", True),
    )
