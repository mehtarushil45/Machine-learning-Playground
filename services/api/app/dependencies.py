"""FastAPI dependency providers.

Usage:
    from services.api.app.dependencies import get_db, get_current_user

    @router.get("/me")
    async def me(current_user: User = Depends(get_current_active_user)):
        ...
"""

from __future__ import annotations

import uuid
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from services.api.app.auth.jwt import decode_access_token
from services.api.app.auth.oauth2 import oauth2_scheme
from services.api.app.database import AsyncSessionLocal
from services.api.app.models.user import User


# ── Database session ──────────────────────────────────────────────────────────

async def get_db() -> AsyncSession:  # type: ignore[return]
    """Yield an async database session per request."""
    async with AsyncSessionLocal() as session:
        yield session


DBSession = Annotated[AsyncSession, Depends(get_db)]


# ── Current user ──────────────────────────────────────────────────────────────

async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: DBSession,
) -> User:
    """Decode the Bearer token and return the authenticated User.

    Raises HTTP 401 if the token is invalid, expired, or the user is not found.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_access_token(token)
        user_id_str: str | None = payload.get("sub")
        if user_id_str is None:
            raise credentials_exception
        user_id = uuid.UUID(user_id_str)
    except (jwt.InvalidTokenError, ValueError):
        raise credentials_exception

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
