"""FastAPI dependency providers.

Token resolution order
----------------------
``get_current_user`` resolves the Bearer token from two sources, in order:

  1. ``access_token`` httpOnly cookie — set by ``POST /auth/login``.
     Browser clients use this path automatically.

  2. ``Authorization: Bearer <token>`` header — for non-browser clients
     (CLI tools, mobile apps, integration tests).

If neither source provides a token, FastAPI returns 401 via the OAuth2 scheme.

Blacklist check
---------------
After token verification, two Redis checks are performed:

  1. Per-token blacklist check (``jti`` key) — was this token explicitly revoked?
  2. Per-user version check (``ver`` claim) — was a bulk-revocation issued?

Both checks fail-open (Redis downtime does not block login).
"""

from __future__ import annotations

import uuid
from typing import Annotated

import jwt
from fastapi import Cookie, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.blacklist import get_user_token_version, is_token_blacklisted
from app.auth.jwt import decode_access_token
from app.database import AsyncSessionLocal
from app.models.user import User


# ── Database session ───────────────────────────────────────────────────────────

async def get_db() -> AsyncSession:  # type: ignore[return]
    """Yield an async database session per request."""
    try:
        async with AsyncSessionLocal() as session:
            yield session
    except Exception:
        yield None


DBSession = Annotated[AsyncSession, Depends(get_db)]


# ── Token extraction — cookie-first, header fallback ──────────────────────────

# The OAuth2PasswordBearer scheme is kept as a fallback for non-browser clients
# and for the OpenAPI docs UI.  auto_error=False means FastAPI won't 401 when
# the header is absent — we handle that ourselves below after checking the cookie.
_bearer_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


async def _resolve_token(
    request: Request,
    bearer_token: Annotated[str | None, Depends(_bearer_scheme)] = None,
    access_token_cookie: Annotated[str | None, Cookie(alias="access_token")] = None,
) -> str:
    """Extract the raw JWT from cookie (priority) or Authorization header.

    Cookie wins because it is httpOnly and therefore XSS-safe.
    The Authorization header is kept for non-browser clients.
    """
    raw = access_token_cookie or bearer_token
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return raw


# ── Current user (with blacklist check) ───────────────────────────────────────

async def get_current_user(
    raw_token: Annotated[str, Depends(_resolve_token)],
    db: DBSession,
) -> User:
    """Decode the token, check the blacklist, and return the User.

    Raises HTTP 401 if:
      - The token signature is invalid or expired.
      - The token's ``jti`` appears in the Redis blacklist (explicitly revoked).
      - The token's ``ver`` claim is behind the user's current token version.
      - No user record matches the ``sub`` claim.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    revoked_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token has been revoked",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # ── Step 1: Verify JWT signature and expiry ───────────────────────────────
    try:
        payload = decode_access_token(raw_token)
        user_id_str: str | None = payload.get("sub")
        if user_id_str is None:
            raise credentials_exception
        user_id = uuid.UUID(user_id_str)
    except (jwt.InvalidTokenError, ValueError):
        raise credentials_exception

    # ── Step 2: Redis blacklist — single token check (jti) ───────────────────
    if await is_token_blacklisted(raw_token):
        raise revoked_exception

    # ── Step 3: Per-user bulk-revocation version check ────────────────────────
    token_ver: int = payload.get("ver", 0)
    current_ver = await get_user_token_version(str(user_id))
    if token_ver < current_ver:
        raise revoked_exception

    # ── Step 4: Load user from DB ─────────────────────────────────────────────
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise credentials_exception

    return user


async def get_current_active_user(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    """Like ``get_current_user`` but also checks ``is_active``."""
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user",
        )
    return current_user


CurrentUser = Annotated[User, Depends(get_current_active_user)]
