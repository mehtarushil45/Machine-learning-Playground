"""JWT token creation and validation.

Two token types are in use:
- **Access token**  — short-lived (default 30 min), sent in Authorization header.
- **Refresh token** — long-lived  (default 7 days), used only at /auth/refresh.

Both tokens embed ``sub`` (user UUID as str), ``org`` (organisation UUID as str),
and ``type`` ("access" | "refresh") so the API can reject tokens used on the
wrong endpoint.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import jwt

from services.api.app.config import settings

_ALGORITHM = "HS256"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def create_access_token(
    user_id: uuid.UUID,
    organisation_id: uuid.UUID,
    *,
    expires_delta: timedelta | None = None,
) -> str:
    """Return a signed JWT access token."""
    expire = _utcnow() + (
        expires_delta or timedelta(minutes=settings.access_token_expire_minutes)
    )
    payload: dict = {
        "sub": str(user_id),
        "org": str(organisation_id),
        "type": "access",
        "exp": expire,
        "iat": _utcnow(),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=_ALGORITHM)


def create_refresh_token(
    user_id: uuid.UUID,
    organisation_id: uuid.UUID,
) -> str:
    """Return a signed JWT refresh token."""
    expire = _utcnow() + timedelta(days=settings.refresh_token_expire_days)
    payload: dict = {
        "sub": str(user_id),
        "org": str(organisation_id),
        "type": "refresh",
        "exp": expire,
        "iat": _utcnow(),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=_ALGORITHM)


def decode_token(token: str) -> dict:
    """Decode and verify a JWT token.  Raises ``jwt.InvalidTokenError`` on failure."""
    return jwt.decode(token, settings.secret_key, algorithms=[_ALGORITHM])


def decode_access_token(token: str) -> dict:
    """Decode and verify an *access* token specifically."""
    payload = decode_token(token)
    if payload.get("type") != "access":
        raise jwt.InvalidTokenError("Not an access token")
    return payload


def decode_refresh_token(token: str) -> dict:
    """Decode and verify a *refresh* token specifically."""
    payload = decode_token(token)
    if payload.get("type") != "refresh":
        raise jwt.InvalidTokenError("Not a refresh token")
    return payload
