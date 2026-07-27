"""Pydantic schemas for authentication endpoints."""

from pydantic import BaseModel


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
