"""Authentication router.

Endpoints
---------
POST /auth/login    — exchange credentials for access + refresh tokens
POST /auth/refresh  — exchange a valid refresh token for a new access token
POST /auth/logout   — invalidate the current session (stub)

All ML-data endpoints are protected and require a valid access token via
the OAuth2 Bearer scheme defined in ``app.auth.oauth2``.
"""

from __future__ import annotations

from typing import Annotated

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt import (
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
)
from app.auth.password import verify_password
from app.dependencies import get_db
from app.models.user import User
from app.schemas.auth import RefreshTokenRequest, TokenResponse
from app.schemas.common import MessageResponse

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Login with email and password",
)
async def login(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenResponse:
    """Authenticate with ``username`` (email) and ``password``.

    Returns a short-lived **access token** and a long-lived **refresh token**.
    Store the refresh token securely (httpOnly cookie or secure storage).
    """
    result = await db.execute(
        select(User).where(User.email == form_data.username, User.is_active == True)  # noqa: E712
    )
    user = result.scalar_one_or_none()

    if user is None or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return TokenResponse(
        access_token=create_access_token(user.id, user.organisation_id),
        refresh_token=create_refresh_token(user.id, user.organisation_id),
    )


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Refresh access token",
)
async def refresh_token(
    body: RefreshTokenRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenResponse:
    """Exchange a valid **refresh token** for a new access token pair.

    The old refresh token is consumed.  A new pair is returned.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired refresh token",
    )
    try:
        payload = decode_refresh_token(body.refresh_token)
    except jwt.InvalidTokenError:
        raise credentials_exception

    import uuid

    user_id = uuid.UUID(payload["sub"])
    result = await db.execute(
        select(User).where(User.id == user_id, User.is_active == True)  # noqa: E712
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise credentials_exception

    return TokenResponse(
        access_token=create_access_token(user.id, user.organisation_id),
        refresh_token=create_refresh_token(user.id, user.organisation_id),
    )


@router.post(
    "/logout",
    response_model=MessageResponse,
    summary="Logout (stub)",
)
async def logout() -> MessageResponse:
    """Invalidate the current session.

    **Batch 4 TODO:** store the access token JTI in Redis with a TTL matching
    the token expiry so the ``get_current_user`` dependency can reject it even
    before expiry (token blocklist pattern).
    """
    return MessageResponse(message="Logged out successfully.")
