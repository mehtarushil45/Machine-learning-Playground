"""Pydantic schemas for Notification system."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional
from pydantic import BaseModel, Field


class NotificationSchema(BaseModel):
    id: str = Field(..., description="Unique notification identifier")
    user_id: str = Field(..., description="Recipient user ID")
    title: str = Field(..., description="Notification title")
    message: str = Field(..., description="Notification message body")
    type: str = Field("info", description="Notification type: info, success, warning, error")
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_read: bool = Field(False, description="Read status flag")
    link: Optional[str] = Field(None, description="Optional action URL/link")


class NotificationListResponse(BaseModel):
    unread_count: int = Field(..., description="Total unread notifications count")
    notifications: List[NotificationSchema] = Field(..., description="List of notifications")


class MarkReadResponse(BaseModel):
    message: str
    unread_count: int
