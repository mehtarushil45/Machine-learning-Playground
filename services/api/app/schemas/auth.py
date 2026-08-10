"""Pydantic schemas for authentication endpoints."""

from __future__ import annotations

from typing import Optional
from uuid import UUID
from pydantic import BaseModel, EmailStr, Field


class TokenResponse(BaseModel):
    """Returned by /auth/login and /auth/refresh."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshTokenRequest(BaseModel):
    """Body for POST /auth/refresh."""

    refresh_token: str


class TokenData(BaseModel):
    """Decoded payload embedded in an access token."""

    user_id: str
    organisation_id: str


class UserRegisterRequest(BaseModel):
    """Payload for POST /auth/register."""

    email: EmailStr = Field(..., description="User email address")
    password: str = Field(..., min_length=8, description="User password (min 8 characters)")
    full_name: Optional[str] = Field(None, description="Full name of user")
    organisation_id: Optional[UUID] = Field(None, description="Target Organisation ID")
    organisation_name: Optional[str] = Field(None, description="Organisation display name")


class UserRegisterResponse(BaseModel):
    """Response returned upon user registration."""

    user_id: UUID
    email: str
    full_name: Optional[str]
    organisation_id: UUID
    role: str
    is_verified: bool
    verification_token: Optional[str] = Field(
        None, description="Verification token for email confirmation flow"
    )
    message: str


class VerifyEmailRequest(BaseModel):
    """Body or query parameter for email verification."""

    token: str = Field(..., description="Email verification token")
