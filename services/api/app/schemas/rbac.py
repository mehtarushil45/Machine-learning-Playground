"""Pydantic schemas for V7A RBAC and workspace context."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class WorkspaceContextResponse(BaseModel):
    """Current user's effective workspace context."""
    user_id: str
    organisation_id: str
    workspace_id: Optional[str] = None
    user_role: Optional[str] = None
    is_platform_owner: bool = False
    is_org_admin: bool = False
    display_name: str = ""


class PermissionCheckRequest(BaseModel):
    permission: str
    workspace_id: Optional[str] = None


class PermissionCheckResponse(BaseModel):
    permission: str
    granted: bool
    user_id: str
    workspace_id: Optional[str] = None
    effective_role: Optional[str] = None
