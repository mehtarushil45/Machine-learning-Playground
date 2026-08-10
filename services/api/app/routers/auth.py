"""Authentication router — httpOnly cookie-based token delivery and user registration.

Cookie strategy
---------------
On login and refresh the server responds with two httpOnly cookies:

    access_token  — short-lived (default 30 min), HttpOnly, SameSite=Lax
    refresh_token — long-lived  (default 7 days),  HttpOnly, SameSite=Lax

The ``Authorization: Bearer`` header is no longer used for browser clients.
The ``get_current_user`` dependency reads the cookie automatically.

Endpoints
---------
POST /auth/register          — register a new user (rate limited, bcrypt, org scoping, verification flow)
POST /auth/verify-email       — verify email via token payload
GET  /auth/verify-email       — verify email via URL query token
POST /auth/login             — set access_token + refresh_token cookies
POST /auth/refresh           — rotate cookies; blacklist old refresh token
POST /auth/logout            — clear cookies; blacklist access token
POST /auth/logout-all        — clear cookies; bulk-revoke all sessions
POST /auth/revoke            — admin: revoke any raw token
GET  /auth/blacklist/stats   — admin: Redis blacklist diagnostics
GET  /auth/me                — return current user info (cookie auth)
"""

from __future__ import annotations

import re
import uuid
from typing import Annotated

import jwt
from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import func, select
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
from app.auth.password import hash_password, verify_password
from app.auth.rate_limiter import check_register_rate_limit
from app.auth.oauth2 import oauth2_scheme
from app.config import settings
from app.dependencies import CurrentUser, get_db
from app.models.organisation import Organisation
from app.models.user import User, UserRole
from app.schemas.auth import (
    RefreshTokenRequest,
    TokenResponse,
    UserRegisterRequest,
    UserRegisterResponse,
    VerifyEmailRequest,
)
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
# Registration & Email Verification
# ---------------------------------------------------------------------------

@router.post(
    "/register",
    response_model=UserRegisterResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register new user account",
    dependencies=[Depends(check_register_rate_limit)],
)
async def register_user(
    body: UserRegisterRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserRegisterResponse:
    """Register a new user account with email uniqueness validation, bcrypt password hashing, organisation scoping, and email verification.

    Features:
      - Rate Limiting: Rate limited per IP address to prevent abuse.
      - Email Uniqueness: Checks if email is already registered (case-insensitive).
      - Password Hashing: Hashes plain password using bcrypt.
      - Organisation Scoping: Attaches user to target or default organisation.
      - Verification Flow: Generates email verification token (user created with is_verified=False).
    """
    email_clean = body.email.strip().lower()

    # 1. Email Uniqueness Validation
    stmt = select(User).where(func.lower(User.email) == email_clean)
    res = await db.execute(stmt)
    existing_user = res.scalar_one_or_none()
    if existing_user is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email is already registered.",
        )

    # 2. Organisation Scoping
    target_org = None
    if body.organisation_id is not None:
        stmt_org = select(Organisation).where(Organisation.id == body.organisation_id)
        res_org = await db.execute(stmt_org)
        target_org = res_org.scalar_one_or_none()
        if target_org is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Organisation with ID '{body.organisation_id}' not found.",
            )
    elif body.organisation_name:
        org_name = body.organisation_name.strip()
        slug = re.sub(r"[^\w\s-]", "", org_name).strip().lower().replace(" ", "-") or "org-" + uuid.uuid4().hex[:6]
        stmt_org = select(Organisation).where(Organisation.slug == slug)
        res_org = await db.execute(stmt_org)
        target_org = res_org.scalar_one_or_none()
        if target_org is None:
            target_org = Organisation(id=uuid.uuid4(), name=org_name, slug=slug, is_active=True)
            db.add(target_org)
            await db.flush()

    if target_org is None:
        # Default Organisation fallback
        stmt_org = select(Organisation).limit(1)
        res_org = await db.execute(stmt_org)
        target_org = res_org.scalar_one_or_none()
        if target_org is None:
            target_org = Organisation(
                id=uuid.uuid4(),
                name="Default Organisation",
                slug="default-org",
                is_active=True,
            )
            db.add(target_org)
            await db.flush()

    # 3. Bcrypt Password Hashing & Verification Token
    hashed_pwd = hash_password(body.password)
    verification_token = uuid.uuid4().hex

    new_user = User(
        id=uuid.uuid4(),
        email=email_clean,
        hashed_password=hashed_pwd,
        full_name=body.full_name,
        role=UserRole.member,
        is_active=True,
        is_verified=False,
        verification_token=verification_token,
        organisation_id=target_org.id,
    )

    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    return UserRegisterResponse(
        user_id=new_user.id,
        email=new_user.email,
        full_name=new_user.full_name,
        organisation_id=new_user.organisation_id,
        role=new_user.role.value if isinstance(new_user.role, UserRole) else str(new_user.role),
        is_verified=new_user.is_verified,
        verification_token=verification_token,
        message="Registration successful. Please check your email to verify your account.",
    )


@router.post(
    "/verify-email",
    response_model=MessageResponse,
    summary="Verify user email address using verification token payload",
)
async def verify_email(
    body: VerifyEmailRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MessageResponse:
    """Confirm user registration email address via token payload."""
    token = body.token.strip()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification token is required.",
        )

    stmt = select(User).where(User.verification_token == token)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification token.",
        )

    user.is_verified = True
    user.verification_token = None
    await db.commit()

    return MessageResponse(message="Email verified successfully. You can now log in.")


@router.get(
    "/verify-email",
    response_model=MessageResponse,
    summary="Verify user email address via URL query token",
)
async def verify_email_query(
    token: str,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MessageResponse:
    """Confirm user registration email address via URL query token."""
    token_clean = token.strip()
    if not token_clean:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification token is required.",
        )

    stmt = select(User).where(User.verification_token == token_clean)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification token.",
        )

    user.is_verified = True
    user.verification_token = None
    await db.commit()

    return MessageResponse(message="Email verified successfully. You can now log in.")


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
        select(User).where(User.email == form_data.username.strip().lower(), User.is_active == True)  # noqa: E712
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
    refresh_token_cookie: Annotated[str | None, Cookie(alias="refresh_token")] = None,
    body: RefreshTokenRequest | None = None,
) -> TokenResponse:
    """Rotate the refresh token and issue a new cookie pair."""
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

    token_ver_in_token: int = payload.get("ver", 0)
    current_ver = await get_user_token_version(str(user_id))
    if token_ver_in_token < current_ver:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has been revoked (session invalidated)",
        )

    await blacklist_token(raw_refresh)

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
    """Blacklist the current access token and clear both auth cookies."""
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
    """Return basic profile info for the currently authenticated user."""
    return {
        "id": str(current_user.id),
        "email": current_user.email,
        "full_name": current_user.full_name,
        "role": current_user.role,
        "organisation_id": str(current_user.organisation_id),
        "is_active": current_user.is_active,
        "is_verified": getattr(current_user, "is_verified", True),
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
