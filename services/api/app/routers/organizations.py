"""Organizations router — V7A enterprise multi-tenant API.

Prefix: /api/v1/organizations

All endpoints require authentication. Permission checks use the centralized
permission engine via ``require_permission``. Org admin operations are restricted
to users with ``org:manage`` permission.
"""

from __future__ import annotations

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.rbac import require_permission, WorkspaceContext
from app.rbac.workspace_context import get_workspace_context

router = APIRouter(prefix="/organizations", tags=["Organizations (V7A)"])

DBSession = Annotated[AsyncSession, Depends(get_db)]


@router.get(
    "/{org_id}",
    summary="Get organisation",
    response_model=dict,
)
async def get_organisation(
    org_id: str,
    db: DBSession,
    ctx: WorkspaceContext = require_permission("org:read"),
) -> dict:
    """Return organisation details.

    Requires ``org:read`` permission within the organisation.
    """
    from app.ml.org_manager import get_organisation

    org = await get_organisation(db, org_id)
    if org is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Organisation '{org_id}' not found.",
        )
    return org


@router.patch(
    "/{org_id}",
    summary="Update organisation",
    response_model=dict,
)
async def update_organisation(
    org_id: str,
    patch: dict,
    db: DBSession,
    ctx: WorkspaceContext = require_permission("org:manage"),
) -> dict:
    """Update mutable organisation fields (name)."""
    from app.ml.org_manager import update_organisation

    try:
        return await update_organisation(db, org_id, patch)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.get(
    "/{org_id}/workspaces",
    summary="List org workspaces",
    response_model=list,
)
async def list_org_workspaces(
    org_id: str,
    db: DBSession,
    ctx: WorkspaceContext = require_permission("org:read"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> list:
    """List all workspaces in an organisation."""
    from app.ml.workspace_manager import list_workspaces

    return await list_workspaces(db, org_id, limit=limit, offset=offset)


@router.get(
    "/{org_id}/members",
    summary="List org members",
    response_model=list,
)
async def list_org_members(
    org_id: str,
    db: DBSession,
    ctx: WorkspaceContext = require_permission("org:read"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> list:
    """List all users in an organisation."""
    from app.ml.user_directory import search_users_in_org

    return await search_users_in_org(db, org_id, query="", limit=limit)


@router.get(
    "/{org_id}/stats",
    summary="Organisation statistics",
    response_model=dict,
)
async def get_org_stats(
    org_id: str,
    db: DBSession,
    ctx: WorkspaceContext = require_permission("org:read"),
) -> dict:
    """Return workspace count, member count for the organisation."""
    from app.ml.org_manager import get_org_stats

    return await get_org_stats(db, org_id)


@router.get(
    "/{org_id}/activity",
    summary="Organisation activity feed",
    response_model=list,
)
async def get_org_activity(
    org_id: str,
    db: DBSession,
    ctx: WorkspaceContext = require_permission("org:read"),
    workspace_id: Optional[str] = Query(None),
    event_type: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> list:
    """Return activity feed for an organisation, optionally filtered by workspace."""
    from app.ml.activity_feed import get_activity_feed

    ws_id = workspace_id or ctx.workspace_id or ""
    return get_activity_feed(
        org_id=org_id,
        workspace_id=ws_id,
        event_type_filter=event_type,
        limit=limit,
        offset=offset,
    )
