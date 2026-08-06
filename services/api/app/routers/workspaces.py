"""Workspaces router — V7A workspace lifecycle and membership API.

Prefix: /api/v1/workspaces

18 endpoints covering workspace CRUD, settings, dashboard, activity,
member management, and resource listing.
"""

from __future__ import annotations

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.rbac import require_permission, WorkspaceContext
from app.rbac.workspace_context import get_workspace_context
from app.schemas.workspace import (
    WorkspaceCreate,
    WorkspaceUpdate,
    WorkspaceResponse,
    WorkspaceSettingsUpdate,
    WorkspaceSettingsResponse,
    WorkspaceDashboardResponse,
    WorkspaceInviteRequest,
    WorkspaceMemberResponse,
    RoleUpdateRequest,
)

router = APIRouter(prefix="/workspaces", tags=["Workspaces (V7A)"])

DBSession = Annotated[AsyncSession, Depends(get_db)]


# ── Workspace CRUD ────────────────────────────────────────────────────────────

@router.post(
    "/",
    summary="Create workspace",
    status_code=status.HTTP_201_CREATED,
    response_model=dict,
)
async def create_workspace(
    body: WorkspaceCreate,
    db: DBSession,
    ctx: WorkspaceContext = require_permission("org:manage"),
) -> dict:
    """Create a new workspace within the authenticated user's organisation."""
    from app.ml.workspace_manager import create_workspace as _create
    from app.ml.activity_feed import log_event_nonblocking, ActivityEventType

    try:
        ws = await _create(
            db=db,
            org_id=ctx.organisation_id,
            name=body.name,
            slug=body.slug,
            created_by=ctx.user_id,
            description=body.description,
            visibility=body.visibility or "INTERNAL",
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))

    log_event_nonblocking(
        ActivityEventType.WORKSPACE_CREATED,
        actor_id=ctx.user_id,
        org_id=ctx.organisation_id,
        workspace_id=ws["workspace_id"],
        resource_type="workspace",
        resource_id=ws["workspace_id"],
        actor_display_name=ctx.display_name,
        resource_name=body.name,
        correlation_id=ctx.correlation_id,
    )
    return ws


@router.get(
    "/",
    summary="List accessible workspaces",
    response_model=list,
)
async def list_workspaces(
    db: DBSession,
    ctx: WorkspaceContext = require_permission("workspace:read"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> list:
    """List all workspaces the authenticated user is a member of."""
    from app.ml.workspace_manager import list_workspaces as _list

    user_filter = ctx.user_id if not ctx.is_org_admin else None
    return await _list(
        db=db,
        org_id=ctx.organisation_id,
        user_id=user_filter,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/{workspace_id}",
    summary="Get workspace",
    response_model=dict,
)
async def get_workspace(
    workspace_id: str,
    db: DBSession,
    ctx: WorkspaceContext = require_permission("workspace:read"),
) -> dict:
    """Return workspace details."""
    from app.ml.workspace_manager import get_workspace as _get

    ws = await _get(db, workspace_id)
    if ws is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found.")
    return ws


@router.patch(
    "/{workspace_id}",
    summary="Update workspace",
    response_model=dict,
)
async def update_workspace(
    workspace_id: str,
    body: WorkspaceUpdate,
    db: DBSession,
    ctx: WorkspaceContext = require_permission("workspace:update"),
) -> dict:
    """Update workspace name, description, or visibility."""
    from app.ml.workspace_manager import update_workspace as _update

    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    try:
        return await _update(db, workspace_id, patch, ctx.user_id)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.post(
    "/{workspace_id}/archive",
    summary="Archive workspace",
    response_model=dict,
)
async def archive_workspace(
    workspace_id: str,
    db: DBSession,
    ctx: WorkspaceContext = require_permission("workspace:delete"),
) -> dict:
    """Archive a workspace. Cannot archive the default workspace."""
    from app.ml.workspace_manager import archive_workspace as _archive

    try:
        return await _archive(db, workspace_id, ctx.user_id)
    except (KeyError, ValueError) as exc:
        code = status.HTTP_400_BAD_REQUEST if isinstance(exc, ValueError) else status.HTTP_404_NOT_FOUND
        raise HTTPException(status_code=code, detail=str(exc))


@router.post(
    "/{workspace_id}/restore",
    summary="Restore archived workspace",
    response_model=dict,
)
async def restore_workspace(
    workspace_id: str,
    db: DBSession,
    ctx: WorkspaceContext = require_permission("org:manage"),
) -> dict:
    """Restore an ARCHIVED or SUSPENDED workspace to ACTIVE."""
    from app.ml.workspace_manager import restore_workspace as _restore

    try:
        return await _restore(db, workspace_id, ctx.user_id)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


# ── Settings ──────────────────────────────────────────────────────────────────

@router.get(
    "/{workspace_id}/settings",
    summary="Get workspace settings",
    response_model=dict,
)
async def get_workspace_settings(
    workspace_id: str,
    db: DBSession,
    ctx: WorkspaceContext = require_permission("workspace:read"),
) -> dict:
    """Return workspace configuration settings."""
    from app.ml.workspace_manager import get_workspace_settings as _get_settings

    settings = await _get_settings(db, workspace_id)
    if settings is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Settings not found.")
    return settings


@router.patch(
    "/{workspace_id}/settings",
    summary="Update workspace settings",
    response_model=dict,
)
async def update_workspace_settings(
    workspace_id: str,
    body: WorkspaceSettingsUpdate,
    db: DBSession,
    ctx: WorkspaceContext = require_permission("workspace:settings"),
) -> dict:
    """Update workspace configuration (deployment policy, quotas, monitoring defaults)."""
    from app.ml.workspace_manager import update_workspace_settings as _update_settings
    from app.ml.activity_feed import log_event_nonblocking, ActivityEventType

    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    try:
        result = await _update_settings(db, workspace_id, patch, ctx.user_id)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))

    log_event_nonblocking(
        ActivityEventType.SETTINGS_UPDATED,
        actor_id=ctx.user_id,
        org_id=ctx.organisation_id,
        workspace_id=workspace_id,
        resource_type="workspace",
        resource_id=workspace_id,
        actor_display_name=ctx.display_name,
        metadata=patch,
        correlation_id=ctx.correlation_id,
    )
    return result


# ── Dashboard & Activity ──────────────────────────────────────────────────────

@router.get(
    "/{workspace_id}/dashboard",
    summary="Workspace dashboard",
    response_model=dict,
)
async def get_workspace_dashboard(
    workspace_id: str,
    db: DBSession,
    ctx: WorkspaceContext = require_permission("workspace:read"),
) -> dict:
    """Return aggregated workspace dashboard with executive KPI scores."""
    from app.ml.workspace_dashboard import get_dashboard

    return await get_dashboard(db, workspace_id, ctx.organisation_id)


@router.get(
    "/{workspace_id}/activity",
    summary="Workspace activity feed",
    response_model=list,
)
async def get_workspace_activity(
    workspace_id: str,
    db: DBSession,
    ctx: WorkspaceContext = require_permission("workspace:read"),
    event_type: Optional[str] = Query(None),
    resource_type: Optional[str] = Query(None),
    correlation_id: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> list:
    """Return the activity feed for a workspace."""
    from app.ml.activity_feed import get_activity_feed

    return get_activity_feed(
        org_id=ctx.organisation_id,
        workspace_id=workspace_id,
        event_type_filter=event_type,
        resource_type_filter=resource_type,
        correlation_id_filter=correlation_id,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/{workspace_id}/resources",
    summary="List workspace resources",
    response_model=list,
)
async def list_workspace_resources(
    workspace_id: str,
    db: DBSession,
    ctx: WorkspaceContext = require_permission("workspace:read"),
    resource_type: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> list:
    """List all resources owned by this workspace."""
    from app.ml.resource_ownership import list_workspace_resources as _list

    return _list(workspace_id, resource_type=resource_type, limit=limit, offset=offset)


# ── Member Management ─────────────────────────────────────────────────────────

@router.post(
    "/{workspace_id}/members/invite",
    summary="Invite user to workspace",
    status_code=status.HTTP_201_CREATED,
    response_model=dict,
)
async def invite_member(
    workspace_id: str,
    body: WorkspaceInviteRequest,
    db: DBSession,
    ctx: WorkspaceContext = require_permission("workspace:manage_members"),
) -> dict:
    """Invite a user to the workspace. Creates an INVITED membership."""
    from app.ml.workspace_manager import invite_member as _invite
    from app.ml.activity_feed import log_event_nonblocking, ActivityEventType

    try:
        result = await _invite(db, workspace_id, body.user_id, body.role, ctx.user_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))

    log_event_nonblocking(
        ActivityEventType.MEMBER_INVITED,
        actor_id=ctx.user_id,
        org_id=ctx.organisation_id,
        workspace_id=workspace_id,
        resource_type="workspace",
        resource_id=workspace_id,
        actor_display_name=ctx.display_name,
        metadata={"invited_user_id": body.user_id, "role": body.role},
        correlation_id=ctx.correlation_id,
    )
    return result


@router.post(
    "/{workspace_id}/members/accept",
    summary="Accept workspace invitation",
    response_model=dict,
)
async def accept_invitation(
    workspace_id: str,
    db: DBSession,
    ctx: WorkspaceContext = Depends(get_workspace_context),
) -> dict:
    """Accept a pending workspace invitation for the authenticated user."""
    from app.ml.workspace_manager import accept_invitation as _accept
    from app.ml.activity_feed import log_event_nonblocking, ActivityEventType

    try:
        result = await _accept(db, workspace_id, ctx.user_id)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))

    log_event_nonblocking(
        ActivityEventType.MEMBER_JOINED,
        actor_id=ctx.user_id,
        org_id=ctx.organisation_id,
        workspace_id=workspace_id,
        resource_type="workspace",
        resource_id=workspace_id,
        actor_display_name=ctx.display_name,
        correlation_id=ctx.correlation_id,
    )
    return result


@router.get(
    "/{workspace_id}/members",
    summary="List workspace members",
    response_model=list,
)
async def list_members(
    workspace_id: str,
    db: DBSession,
    ctx: WorkspaceContext = require_permission("workspace:read"),
    status_filter: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> list:
    """List all members of the workspace."""
    from app.ml.workspace_manager import list_members as _list

    return await _list(db, workspace_id, status_filter=status_filter, limit=limit, offset=offset)


@router.get(
    "/{workspace_id}/members/{user_id}",
    summary="Get workspace member",
    response_model=dict,
)
async def get_member(
    workspace_id: str,
    user_id: str,
    db: DBSession,
    ctx: WorkspaceContext = require_permission("workspace:read"),
) -> dict:
    """Return membership details for a specific user."""
    from app.ml.workspace_manager import get_member as _get

    member = await _get(db, workspace_id, user_id)
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found.")
    return member


@router.patch(
    "/{workspace_id}/members/{user_id}/role",
    summary="Update member role",
    response_model=dict,
)
async def update_member_role(
    workspace_id: str,
    user_id: str,
    body: RoleUpdateRequest,
    db: DBSession,
    ctx: WorkspaceContext = require_permission("workspace:manage_members"),
) -> dict:
    """Update the workspace role for a member."""
    from app.ml.workspace_manager import update_member_role as _update_role

    try:
        return await _update_role(db, workspace_id, user_id, body.role, ctx.user_id)
    except (KeyError, ValueError) as exc:
        code = status.HTTP_400_BAD_REQUEST if isinstance(exc, ValueError) else status.HTTP_404_NOT_FOUND
        raise HTTPException(status_code=code, detail=str(exc))


@router.post(
    "/{workspace_id}/members/{user_id}/suspend",
    summary="Suspend workspace member",
    response_model=dict,
)
async def suspend_member(
    workspace_id: str,
    user_id: str,
    db: DBSession,
    ctx: WorkspaceContext = require_permission("workspace:manage_members"),
) -> dict:
    """Suspend a workspace member."""
    from app.ml.workspace_manager import suspend_member as _suspend

    try:
        return await _suspend(db, workspace_id, user_id, ctx.user_id)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.post(
    "/{workspace_id}/members/{user_id}/restore",
    summary="Restore suspended member",
    response_model=dict,
)
async def restore_member(
    workspace_id: str,
    user_id: str,
    db: DBSession,
    ctx: WorkspaceContext = require_permission("workspace:manage_members"),
) -> dict:
    """Restore a suspended workspace member."""
    from app.ml.workspace_manager import restore_member as _restore

    try:
        return await _restore(db, workspace_id, user_id, ctx.user_id)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.delete(
    "/{workspace_id}/members/{user_id}",
    summary="Remove workspace member",
    response_model=dict,
)
async def remove_member(
    workspace_id: str,
    user_id: str,
    db: DBSession,
    ctx: WorkspaceContext = require_permission("workspace:manage_members"),
) -> dict:
    """Soft-remove a member from the workspace."""
    from app.ml.workspace_manager import remove_member as _remove
    from app.ml.activity_feed import log_event_nonblocking, ActivityEventType

    try:
        result = await _remove(db, workspace_id, user_id, ctx.user_id)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))

    log_event_nonblocking(
        ActivityEventType.MEMBER_REMOVED,
        actor_id=ctx.user_id,
        org_id=ctx.organisation_id,
        workspace_id=workspace_id,
        resource_type="workspace",
        resource_id=workspace_id,
        actor_display_name=ctx.display_name,
        metadata={"removed_user_id": user_id},
        correlation_id=ctx.correlation_id,
    )
    return result
