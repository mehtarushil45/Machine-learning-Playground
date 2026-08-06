"""Workspace context resolution — FastAPI dependency.

Resolves the effective workspace context for every request by reading
(in priority order):
  1. Header: ``X-Workspace-ID``
  2. Query param: ``workspace_id``
  3. JWT claim ``wid`` (V7A+ tokens)
  4. Default: the authenticated user's default workspace

The resolved context is a pure dataclass — no ORM objects escape this module.

Backward compatibility guarantee:
    All pre-V7A requests that don't provide any workspace signal are served
    via the user's default workspace. If no default workspace exists, the
    context is returned with ``workspace_id=None`` (for optional contexts).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Optional

import jwt as _jwt
from fastapi import Depends, Header, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.oauth2 import oauth2_scheme
from app.auth.jwt import decode_access_token
from app.dependencies import get_db
from app.models.user import User
from app.rbac.roles import PlatformRole

logger = logging.getLogger("apex_ml.workspace_context")


@dataclass(frozen=True)
class WorkspaceContext:
    """Immutable resolved context for a single request.

    Attributes:
        user_id: String UUID of the authenticated user.
        organisation_id: String UUID of the user's organisation.
        workspace_id: String UUID of the resolved workspace (may be None for
            optional contexts or when no default workspace exists).
        user_role: Effective WorkspaceRole string within this workspace
            (e.g. ``"ML_ENGINEER"``). None if user has no workspace membership.
        is_platform_owner: True if the user is a PLATFORM_OWNER.
        is_org_admin: True if the user is an ORG_ADMIN in this organisation.
        user_suspended: True if the user account is suspended.
        display_name: Human-readable name for activity feed events.
        correlation_id: Optional request-level correlation UUID for tracing.
    """

    user_id: str
    organisation_id: str
    workspace_id: Optional[str] = None
    user_role: Optional[str] = None
    is_platform_owner: bool = False
    is_org_admin: bool = False
    user_suspended: bool = False
    display_name: str = ""
    correlation_id: Optional[str] = None

    def to_dict(self) -> dict:
        """Serialise to a plain dict (for logging / response headers)."""
        return {
            "user_id": self.user_id,
            "organisation_id": self.organisation_id,
            "workspace_id": self.workspace_id,
            "user_role": self.user_role,
            "is_platform_owner": self.is_platform_owner,
            "is_org_admin": self.is_org_admin,
        }


# ── Internal helper ───────────────────────────────────────────────────────────

async def _resolve_workspace_role(
    user_id: str,
    workspace_id: str,
    db: AsyncSession,
) -> Optional[str]:
    """Return the workspace role string for *user_id* in *workspace_id*, or None."""
    try:
        from app.models.workspace_member import WorkspaceMember, MemberStatus  # lazy import

        import uuid
        result = await db.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == uuid.UUID(workspace_id),
                WorkspaceMember.user_id == uuid.UUID(user_id),
                WorkspaceMember.status == MemberStatus.ACTIVE,
            )
        )
        member = result.scalar_one_or_none()
        return member.role.value if member else None
    except Exception as exc:
        logger.debug("workspace role resolution error: %s", exc)
        return None


async def _get_default_workspace_id(
    user_id: str,
    organisation_id: str,
    db: AsyncSession,
) -> Optional[str]:
    """Return the default workspace ID for this user's org, or None."""
    try:
        from app.models.workspace import Workspace, WorkspaceStatus  # lazy import
        import uuid

        result = await db.execute(
            select(Workspace).where(
                Workspace.organisation_id == uuid.UUID(organisation_id),
                Workspace.is_default == True,  # noqa: E712
                Workspace.status == WorkspaceStatus.ACTIVE,
            )
        )
        workspace = result.scalar_one_or_none()
        return str(workspace.id) if workspace else None
    except Exception as exc:
        logger.debug("default workspace lookup error: %s", exc)
        return None


# ── Core resolution logic ─────────────────────────────────────────────────────

async def _build_context(
    token: str,
    workspace_id_hint: Optional[str],
    db: AsyncSession,
    request: Optional[Request] = None,
) -> WorkspaceContext:
    """Build a WorkspaceContext from a JWT token + optional workspace hint."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # 1. Decode JWT
    try:
        payload = decode_access_token(token)
        user_id_str: str | None = payload.get("sub")
        org_id_str: str | None = payload.get("org")
        jwt_workspace_id: str | None = payload.get("wid")  # V7A+ optional claim
        if not user_id_str or not org_id_str:
            raise credentials_exception
    except _jwt.InvalidTokenError:
        raise credentials_exception

    # 2. Load user from DB
    import uuid
    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id_str)))
    user = result.scalar_one_or_none()
    if user is None:
        raise credentials_exception

    # 3. Determine platform-level role
    platform_role = getattr(user, "role", None)
    is_owner = str(platform_role) in (PlatformRole.PLATFORM_OWNER.value, "platform_admin")
    is_admin = str(platform_role) in (PlatformRole.ORG_ADMIN.value, "org_admin")
    is_suspended = not getattr(user, "is_active", True)

    # 4. Resolve workspace (priority: header/param > JWT claim > default)
    workspace_id = workspace_id_hint or jwt_workspace_id
    if not workspace_id:
        workspace_id = await _get_default_workspace_id(user_id_str, org_id_str, db)

    # 5. Resolve workspace role
    workspace_role: Optional[str] = None
    if workspace_id:
        workspace_role = await _resolve_workspace_role(user_id_str, workspace_id, db)
        # Org admins and platform owners always get full access regardless of membership
        if workspace_role is None and (is_owner or is_admin):
            workspace_role = "WORKSPACE_ADMIN"

    # 6. Extract correlation_id from request headers (set by client or gateway)
    correlation_id: Optional[str] = None
    if request:
        correlation_id = request.headers.get("X-Correlation-ID")

    display_name = getattr(user, "full_name", None) or getattr(user, "email", user_id_str)

    return WorkspaceContext(
        user_id=user_id_str,
        organisation_id=org_id_str,
        workspace_id=workspace_id,
        user_role=workspace_role,
        is_platform_owner=is_owner,
        is_org_admin=is_admin,
        user_suspended=is_suspended,
        display_name=str(display_name),
        correlation_id=correlation_id,
    )


# ── FastAPI dependencies ──────────────────────────────────────────────────────

async def get_workspace_context(
    request: Request,
    token: str = Depends(oauth2_scheme),
    x_workspace_id: Optional[str] = Header(None, alias="X-Workspace-ID"),
    workspace_id_query: Optional[str] = Query(None, alias="workspace_id"),
    db: AsyncSession = Depends(get_db),
) -> WorkspaceContext:
    """Resolve and return the fully-authenticated workspace context.

    This is the primary authentication/authorisation dependency for all V7A
    endpoints.  Raises HTTP 401 on invalid tokens, HTTP 403 on suspension.

    The workspace is resolved from (in order):
    ``X-Workspace-ID`` header → ``workspace_id`` query param → JWT ``wid`` claim
    → user's default workspace.
    """
    workspace_hint = x_workspace_id or workspace_id_query
    ctx = await _build_context(token, workspace_hint, db, request)

    if ctx.user_suspended:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is suspended.",
        )
    return ctx


async def get_optional_workspace_context(
    request: Request,
    token: Optional[str] = Depends(oauth2_scheme),
    x_workspace_id: Optional[str] = Header(None, alias="X-Workspace-ID"),
    workspace_id_query: Optional[str] = Query(None, alias="workspace_id"),
    db: AsyncSession = Depends(get_db),
) -> Optional[WorkspaceContext]:
    """Like ``get_workspace_context`` but returns None instead of raising on
    missing/invalid tokens.

    Used on V1–V6B endpoints where workspace context is advisory (backward compat).
    """
    if not token:
        return None
    try:
        workspace_hint = x_workspace_id or workspace_id_query
        return await _build_context(token, workspace_hint, db, request)
    except HTTPException:
        return None
    except Exception as exc:
        logger.debug("optional context resolution failed: %s", exc)
        return None
