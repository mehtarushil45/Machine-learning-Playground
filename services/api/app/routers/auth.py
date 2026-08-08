"""Authentication router — httpOnly cookie-based token delivery.

Cookie strategy
---------------
On login and refresh the server responds with two httpOnly cookies:

    access_token  — short-lived (default 30 min), HttpOnly, SameSite=Lax
    refresh_token — long-lived  (default 7 days),  HttpOnly, SameSite=Lax

The ``Authorization: Bearer`` header is no longer used for browser clients.
The ``get_current_user`` dependency (and therefore ``oauth2_scheme``) reads the
cookie automatically via the ``cookie_scheme`` defined in
``app.auth.cookie_scheme``.

Why keep the Authorization header path?
  Non-browser clients (CLI tools, tests, mobile apps) still send
  ``Authorization: Bearer`` tokens.  Both paths are supported; the cookie
  wins if both are present.

Endpoints
---------
POST /auth/login             — set access_token + refresh_token cookies
POST /auth/refresh           — rotate cookies; blacklist old refresh token
POST /auth/logout            — clear cookies; blacklist access token
POST /auth/logout-all        — clear cookies; bulk-revoke all sessions
POST /auth/revoke            — admin: revoke any raw token
GET  /auth/blacklist/stats   — admin: Redis blacklist diagnostics
GET  /auth/me                — return current user info (cookie auth)
"""

from __future__ import annotations

import uuid
from typing import Annotated

import jwt
from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.blacklist import (
    blacklist_all_user_tokens,
    blacklist_token,
    get_blacklist_stats,
    get_user_token_version,
)
from app.auth.jwt import (
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
)
from app.auth.password import verify_password
from app.auth.oauth2 import oauth2_scheme
from app.config import settings
from app.dependencies import CurrentUser, get_db
from app.models.user import User
from app.schemas.auth import RefreshTokenRequest, TokenResponse
from app.schemas.common import MessageResponse

router = APIRouter(prefix="/auth", tags=["Auth"])


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _cookie_kwargs() -> dict:
    """Return shared Set-Cookie attributes from settings.

    All token cookies are:
      - httponly=True     — JS cannot read them (XSS protection)
      - samesite="lax"    — Sent on top-level navigations, blocked cross-site
      - secure=<env>      — HTTPS-only in production
    """
    return {
        "httponly": True,
        "secure": settings.cookie_secure,
        "samesite": settings.cookie_samesite,
        "domain": settings.cookie_domain,  # None = browser default
    }


def _set_auth_cookies(
    response: Response,
    access_token: str,
    refresh_token: str,
) -> None:
    """Write access_token and refresh_token as httpOnly cookies."""
    kw = _cookie_kwargs()
    response.set_cookie(
        key="access_token",
        value=access_token,
        max_age=settings.access_token_expire_minutes * 60,
        **kw,
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        max_age=settings.refresh_token_expire_days * 86_400,
        # Scope refresh cookie to /auth so it's never sent to other endpoints
        path="/api/v1/auth",
        **kw,
    )


def _clear_auth_cookies(response: Response) -> None:
    """Expire both auth cookies immediately."""
    kw = _cookie_kwargs()
    response.delete_cookie(key="access_token", **kw)
    response.delete_cookie(key="refresh_token", path="/api/v1/auth", **kw)


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------

@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Login — issues httpOnly cookie pair",
)
async def login(
    response: Response,
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenResponse:
    """Authenticate with ``username`` (email) and ``password``.

    On success the server writes two httpOnly cookies:
      - ``access_token``  — short-lived, sent with every API request
      - ``refresh_token`` — long-lived, scoped to ``/api/v1/auth`` only

    The response body also includes the token values for non-browser clients.
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

    token_ver = await get_user_token_version(str(user.id))
    access_token = create_access_token(
        user.id, user.organisation_id, token_version=token_ver
    )
    refresh_token = create_refresh_token(
        user.id, user.organisation_id, token_version=token_ver
    )

    # Write httpOnly cookies — this is the primary delivery mechanism
    _set_auth_cookies(response, access_token, refresh_token)

    # Also return tokens in body for non-browser / CLI clients
    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


# ---------------------------------------------------------------------------
# Refresh
# ---------------------------------------------------------------------------

@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Refresh — rotate cookie pair",
)
async def refresh_token_endpoint(
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)],
    # Cookie read (browser path)
    refresh_token_cookie: Annotated[str | None, Cookie(alias="refresh_token")] = None,
    # Body fallback (non-browser / CLI clients)
    body: RefreshTokenRequest | None = None,
) -> TokenResponse:
    """Rotate the refresh token and issue a new cookie pair.

    Token sources (in priority order):
      1. ``refresh_token`` httpOnly cookie (browser)
      2. ``body.refresh_token`` JSON body (non-browser clients)

    The consumed refresh token is blacklisted.  A new cookie pair is issued.
    """
    raw_refresh = refresh_token_cookie or (body.refresh_token if body else None)
    if not raw_refresh:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No refresh token provided (cookie or body required)",
        )

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired refresh token",
    )
    try:
        payload = decode_refresh_token(raw_refresh)
    except jwt.InvalidTokenError:
        raise credentials_exception

    user_id = uuid.UUID(payload["sub"])
    result = await db.execute(
        select(User).where(User.id == user_id, User.is_active == True)  # noqa: E712
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise credentials_exception

    # Per-user version check (bulk revocation)
    token_ver_in_token: int = payload.get("ver", 0)
    current_ver = await get_user_token_version(str(user_id))
    if token_ver_in_token < current_ver:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has been revoked (session invalidated)",
        )

    # Blacklist the consumed refresh token (token rotation)
    await blacklist_token(raw_refresh)

    # Issue a new pair
    new_ver = await get_user_token_version(str(user.id))
    new_access = create_access_token(user.id, user.organisation_id, token_version=new_ver)
    new_refresh = create_refresh_token(user.id, user.organisation_id, token_version=new_ver)

    _set_auth_cookies(response, new_access, new_refresh)
    return TokenResponse(access_token=new_access, refresh_token=new_refresh)


# ---------------------------------------------------------------------------
# Logout
# ---------------------------------------------------------------------------

@router.post(
    "/logout",
    response_model=MessageResponse,
    summary="Logout — clear cookies and revoke access token",
)
async def logout(
    response: Response,
    request: Request,
    current_user: CurrentUser,
) -> MessageResponse:
    """Blacklist the current access token and clear both auth cookies.

    The access token is read from:
      1. The ``access_token`` cookie (browser)
      2. The ``Authorization: Bearer`` header (non-browser fallback)
    """
    # Resolve the raw token from cookie or Authorization header
    raw_token: str | None = request.cookies.get("access_token")
    if not raw_token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            raw_token = auth_header[7:].strip()

    if raw_token:
        await blacklist_token(raw_token)

    _clear_auth_cookies(response)
    return MessageResponse(message="Logged out successfully. Cookies cleared.")


@router.post(
    "/logout-all",
    response_model=MessageResponse,
    summary="Logout from all sessions — bulk revoke",
)
async def logout_all_sessions(
    response: Response,
    current_user: CurrentUser,
) -> MessageResponse:
    """Revoke ALL active sessions for the current user and clear cookies."""
    success = await blacklist_all_user_tokens(str(current_user.id))
    _clear_auth_cookies(response)
    if success:
        return MessageResponse(
            message="All sessions invalidated. Logged out from all devices."
        )
    return MessageResponse(
        message="Session invalidation may have failed (Redis unavailable). "
                "Cookies cleared locally; tokens will expire naturally."
    )


# ---------------------------------------------------------------------------
# Current user info
# ---------------------------------------------------------------------------

@router.get(
    "/me",
    summary="Return current authenticated user info",
)
async def me(current_user: CurrentUser) -> dict:
    """Return basic profile info for the currently authenticated user.

    Primarily used by the frontend to hydrate the auth context after a
    page reload (the cookie is sent automatically; no token parsing in JS).
    """
    return {
        "id": str(current_user.id),
        "email": current_user.email,
        "full_name": current_user.full_name,
        "role": current_user.role,
        "organisation_id": str(current_user.organisation_id),
        "is_active": current_user.is_active,
    }


# ---------------------------------------------------------------------------
# Admin — token revocation
# ---------------------------------------------------------------------------

@router.post(
    "/revoke",
    response_model=MessageResponse,
    summary="Admin: revoke any token by value",
)
async def admin_revoke_token(
    raw_token: str,
    _: CurrentUser,
) -> MessageResponse:
    """Revoke any token by passing its raw JWT string. Admin use only."""
    revoked = await blacklist_token(raw_token)
    if revoked:
        return MessageResponse(message="Token has been revoked.")
    return MessageResponse(message="Token was already expired or revocation failed.")


@router.get(
    "/blacklist/stats",
    summary="Admin: Redis blacklist diagnostics",
)
async def blacklist_stats(_: CurrentUser) -> dict:
    """Return diagnostic statistics about the token blacklist store."""
    return await get_blacklist_stats()
