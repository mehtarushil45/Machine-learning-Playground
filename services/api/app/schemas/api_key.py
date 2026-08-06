"""Pydantic schemas for V7A API Key management."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ApiKeyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    workspace_id: Optional[str] = None
    scopes: Optional[list[str]] = Field(default_factory=list)
    expires_at: Optional[datetime] = None


class ApiKeyCreatedResponse(BaseModel):
    """Returned ONLY on creation. ``raw_key`` is shown once and never stored."""
    key_id: str
    name: str
    key_prefix: str
    raw_key: str = Field(..., description="Full API key. Store this now — it will not be shown again.")
    scopes: list[str]
    workspace_id: Optional[str] = None
    organisation_id: str
    expires_at: Optional[str] = None
    created_at: str
    note: Optional[str] = None


class ApiKeyResponse(BaseModel):
    """Safe key representation — never includes key_hash or raw_key."""
    key_id: str
    name: str
    key_prefix: str
    scopes: list[str]
    workspace_id: Optional[str] = None
    revoked: bool
    expires_at: Optional[str] = None
    last_used_at: Optional[str] = None
    last_ip: Optional[str] = None
    last_user_agent: Optional[str] = None
    created_at: str


class ApiKeyRevokeResponse(BaseModel):
    key_id: str
    key_prefix: str
    revoked: bool
    revoked_at: Optional[str] = None
    revoked_by: str
