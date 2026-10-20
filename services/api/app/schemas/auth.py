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
    password: str = Field(..., description="User password")
    full_name: Optional[str] = Field(None, description="Full name of user")
    organisation_id: Optional[UUID] = Field(None, description="Target Organisation ID")
    organisation_name: Optional[str] = Field(None, description="Organisation display name")
    role: Optional[str] = Field(None, description="Ignored by server; new accounts always get default member role (Part D4)")


class UserRegisterResponse(BaseModel):
    """Response returned upon user registration (Part D2)."""

    email: str
    message: str


class VerifyEmailRequest(BaseModel):
    """Body or query parameter for email verification."""

    token: str = Field(..., description="Email verification token")


class ResendVerificationRequest(BaseModel):
    """Payload for POST /auth/resend-verification."""

    email: EmailStr = Field(..., description="User email address to resend verification link")


class ForgotPasswordRequest(BaseModel):
    """Payload for POST /auth/forgot-password (Part E1)."""

    email: EmailStr = Field(..., description="Registered account email address")


class ResetPasswordRequest(BaseModel):
    """Payload for POST /auth/reset-password (Part E2)."""

    token: str = Field(..., description="Single-use password reset token")
    new_password: str = Field(..., description="New password matching policy requirements")


class OAuthProvidersResponse(BaseModel):
    """Returned by GET /auth/providers (Part F4)."""

    google: bool = Field(..., description="True if Google OAuth is configured and active")
    microsoft: bool = Field(..., description="True if Microsoft OAuth is configured and active")
    google_client_id: Optional[str] = Field(None, description="Google OAuth Client ID if configured")


class OAuthAuthorizeResponse(BaseModel):
    """Returned by GET /auth/oauth/{provider}/authorize (Part F1)."""

    authorization_url: str = Field(..., description="PKCE-secured OAuth authorization URL")
    provider: str = Field(..., description="OAuth provider name")


class OAuthCallbackRequest(BaseModel):
    """Payload for POST /auth/oauth/{provider}/callback (Part F1)."""

    code: str = Field(..., description="Authorization code from OAuth provider")
    state: str = Field(..., description="Cryptographic state parameter to prevent CSRF")


class OAuthLoginRequest(BaseModel):
    """Payload for POST /auth/oauth/google and /auth/oauth/microsoft."""

    email: EmailStr = Field(..., description="User email from OAuth provider")
    full_name: Optional[str] = Field(None, description="Display name from OAuth provider")
    id_token: Optional[str] = Field(None, description="Optional raw ID token or authorization token")
    provider: str = Field("google", description="OAuth provider: google or microsoft")
    avatar_url: Optional[str] = Field(None, description="Profile picture URL from provider")

