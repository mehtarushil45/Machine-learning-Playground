"""Users router (V7A) — user profile and directory API.

Prefix: /api/v1/users

Named users_v7a.py to avoid conflict with the existing auth.py router.
"""

from __future__ import annotations

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.rbac import require_permission, WorkspaceContext
from app.rbac.workspace_context import get_workspace_context

router = APIRouter(prefix="/users", tags=["Users (V7A)"])

DBSession = Annotated[AsyncSession, Depends(get_db)]


@router.get("/me", summary="My profile", response_model=dict)
async def get_my_profile(
    db: DBSession,
    ctx: WorkspaceContext = Depends(get_workspace_context),
) -> dict:
    """Return the authenticated user's profile."""
    from app.ml.user_directory import get_user_profile

    profile = await get_user_profile(db, ctx.user_id)
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    return {**profile, "workspace_context": ctx.to_dict()}


@router.patch("/me", summary="Update my profile", response_model=dict)
async def update_my_profile(
    patch: dict,
    db: DBSession,
    ctx: WorkspaceContext = Depends(get_workspace_context),
) -> dict:
    """Update the authenticated user's mutable profile fields."""
    from app.ml.user_directory import update_user_profile

    try:
        return await update_user_profile(db, ctx.user_id, patch)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.get("/me/workspaces", summary="My workspace memberships", response_model=list)
async def get_my_workspaces(
    db: DBSession,
    ctx: WorkspaceContext = Depends(get_workspace_context),
) -> list:
    """Return all workspace memberships for the authenticated user."""
    from app.ml.user_directory import get_user_memberships

    return await get_user_memberships(db, ctx.user_id)


@router.get("/me/activity", summary="My activity", response_model=list)
async def get_my_activity(
    db: DBSession,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    limit: int = Query(50, ge=1, le=200),
) -> list:
    """Return recent activity by the authenticated user."""
    from app.ml.user_directory import get_user_activity_summary

    summary = await get_user_activity_summary(
        db,
        ctx.user_id,
        ctx.organisation_id,
        ctx.workspace_id,
    )
    return summary.get("recent_events", [])[:limit]


@router.get("/{user_id}", summary="Get user profile", response_model=dict)
async def get_user_profile(
    user_id: str,
    db: DBSession,
    ctx: WorkspaceContext = require_permission("workspace:read"),
) -> dict:
    """Return a user's profile within the workspace context."""
    from app.ml.user_directory import get_user_profile as _get

    profile = await _get(db, user_id)
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    return profile


@router.post("/{user_id}/suspend", summary="Suspend user", response_model=dict)
async def suspend_user(
    user_id: str,
    db: DBSession,
    ctx: WorkspaceContext = require_permission("org:manage"),
    reason: str = Query(""),
) -> dict:
    """Deactivate a user account (org admin only)."""
    from app.ml.user_directory import suspend_user as _suspend

    try:
        return await _suspend(db, user_id, ctx.user_id, reason=reason)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.post("/{user_id}/restore", summary="Restore user", response_model=dict)
async def restore_user(
    user_id: str,
    db: DBSession,
    ctx: WorkspaceContext = require_permission("org:manage"),
) -> dict:
    """Reactivate a suspended user account (org admin only)."""
    from app.ml.user_directory import restore_user as _restore

    try:
        return await _restore(db, user_id, ctx.user_id)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
