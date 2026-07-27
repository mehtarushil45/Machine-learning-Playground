"""Common / shared API response schemas."""

from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str
    service: str = "ml-platform-api"


class ErrorResponse(BaseModel):
    detail: str


class MessageResponse(BaseModel):
    message: str
