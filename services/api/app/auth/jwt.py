"""JWT token creation and validation.

Two token types are in use:
- **Access token**  — short-lived (default 30 min), sent in Authorization header.
- **Refresh token** — long-lived  (default 7 days), used only at /auth/refresh.

Both tokens embed:
  - ``sub``  — user UUID (str)
  - ``org``  — organisation UUID (str)
  - ``type`` — "access" | "refresh"
  - ``jti``  — unique token ID (UUID4 hex) used by the Redis blacklist
  - ``ver``  — per-user token version (int) for bulk revocation
  - ``exp``  — UNIX expiry timestamp
  - ``iat``  — issued-at timestamp

The ``jti`` claim is the primary handle for single-token revocation.
The ``ver`` claim enables invalidating ALL sessions for a user atomically.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import jwt

from app.config import settings

_ALGORITHM = "HS256"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _new_jti() -> str:
    """Generate a cryptographically unique JWT ID."""
    return uuid.uuid4().hex


def create_access_token(
    user_id: uuid.UUID,
    organisation_id: uuid.UUID,
    *,
    workspace_id: uuid.UUID | None = None,
    expires_delta: timedelta | None = None,
    token_version: int = 0,
) -> str:
    """Return a signed JWT access token.

    Args:
        user_id: The user's UUID.
        organisation_id: The user's organisation UUID.
        workspace_id: Optional default workspace UUID. Encoded as ``wid`` claim.
        expires_delta: Optional custom expiry override.
        token_version: Per-user revocation version (from Redis). Embedded as
            ``ver`` so bulk-revocation via ``blacklist_all_user_tokens()`` works.
    """
    expire = _utcnow() + (
        expires_delta or timedelta(minutes=settings.access_token_expire_minutes)
    )
    payload: dict = {
        "sub": str(user_id),
        "org": str(organisation_id),
        "type": "access",
        "jti": _new_jti(),        # unique token ID — primary blacklist handle
        "ver": token_version,      # per-user version — bulk revocation handle
        "exp": expire,
        "iat": _utcnow(),
    }
    if workspace_id is not None:
        payload["wid"] = str(workspace_id)
    return jwt.encode(payload, settings.secret_key.get_secret_value(), algorithm=_ALGORITHM)


def create_refresh_token(
    user_id: uuid.UUID,
    organisation_id: uuid.UUID,
    *,
    token_version: int = 0,
) -> str:
    """Return a signed JWT refresh token.

    Args:
        user_id: The user's UUID.
        organisation_id: The user's organisation UUID.
        token_version: Per-user revocation version embedded as ``ver`` claim.
    """
    expire = _utcnow() + timedelta(days=settings.refresh_token_expire_days)
    payload: dict = {
        "sub": str(user_id),
        "org": str(organisation_id),
        "type": "refresh",
        "jti": _new_jti(),
        "ver": token_version,
        "exp": expire,
        "iat": _utcnow(),
    }
    return jwt.encode(payload, settings.secret_key.get_secret_value(), algorithm=_ALGORITHM)


def decode_token(token: str) -> dict:
    """Decode and verify a JWT token. Raises ``jwt.InvalidTokenError`` on failure."""
    return jwt.decode(token, settings.secret_key.get_secret_value(), algorithms=[_ALGORITHM])


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
