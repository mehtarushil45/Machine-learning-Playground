"""Common / shared API response schemas."""

from __future__ import annotations

from typing import Dict, Optional
from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str
    service: str = "ml-platform-api"


class ReadinessDependencyStatus(BaseModel):
    status: str
    latency_ms: Optional[float] = None
    path: Optional[str] = None
    error: Optional[str] = None


class ReadinessResponse(BaseModel):
    status: str
    service: str = "ml-platform-api"
    timestamp: str
    dependencies: Dict[str, ReadinessDependencyStatus]


class ErrorResponse(BaseModel):
    detail: str


class MessageResponse(BaseModel):
    message: str
