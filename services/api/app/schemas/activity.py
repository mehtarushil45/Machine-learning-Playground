"""Pydantic schemas for the V7A Activity Feed."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class ActivityEventResponse(BaseModel):
    event_id: str
    event_type: str
    schema_version: Optional[str] = None
    timestamp: str
    correlation_id: Optional[str] = None
    actor_id: str
    actor_display_name: Optional[str] = None
    organisation_id: str
    workspace_id: str
    resource_type: str
    resource_id: str
    resource_name: Optional[str] = None
    action: Optional[str] = None
    metadata: Optional[dict] = None


class ActivityFeedResponse(BaseModel):
    events: list[ActivityEventResponse]
    total: int
    limit: int
    offset: int
    workspace_id: str
    organisation_id: str
