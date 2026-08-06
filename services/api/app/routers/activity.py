"""Activity Feed router — V7A immutable audit trail API.

Prefix: /api/v1/activity
"""

from __future__ import annotations

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.rbac import require_permission, WorkspaceContext

router = APIRouter(prefix="/activity", tags=["Activity Feed (V7A)"])

DBSession = Annotated[AsyncSession, Depends(get_db)]


@router.get(
    "/",
    summary="Workspace activity feed",
    response_model=dict,
)
async def get_activity_feed(
    db: DBSession,
    ctx: WorkspaceContext = require_permission("workspace:read"),
    event_type: Optional[str] = Query(None),
    resource_type: Optional[str] = Query(None),
    resource_id: Optional[str] = Query(None),
    correlation_id: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> dict:
    """Return the activity feed for the resolved workspace.

    Supports filtering by event type, resource type, resource ID, and correlation ID.
    """
    from app.ml.activity_feed import get_activity_feed as _get

    if not ctx.workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Workspace context is required for activity feed.",
        )

    events = _get(
        org_id=ctx.organisation_id,
        workspace_id=ctx.workspace_id,
        event_type_filter=event_type,
        resource_type_filter=resource_type,
        resource_id_filter=resource_id,
        correlation_id_filter=correlation_id,
        limit=limit,
        offset=offset,
    )

    return {
        "events": events,
        "total": len(events),
        "limit": limit,
        "offset": offset,
        "workspace_id": ctx.workspace_id,
        "organisation_id": ctx.organisation_id,
    }


@router.get(
    "/resource/{resource_type}/{resource_id}",
    summary="Resource activity history",
    response_model=list,
)
async def get_resource_history(
    resource_type: str,
    resource_id: str,
    db: DBSession,
    ctx: WorkspaceContext = require_permission("workspace:read"),
    limit: int = Query(100, ge=1, le=500),
) -> list:
    """Return all activity events for a specific resource."""
    from app.ml.activity_feed import get_resource_history as _get_history

    return _get_history(
        resource_type=resource_type,
        resource_id=resource_id,
        org_id=ctx.organisation_id,
        workspace_id=ctx.workspace_id or "",
        limit=limit,
    )


@router.get(
    "/trace/{correlation_id}",
    summary="Pipeline trace by correlation ID",
    response_model=list,
)
async def get_pipeline_trace(
    correlation_id: str,
    db: DBSession,
    ctx: WorkspaceContext = require_permission("workspace:read"),
) -> list:
    """Return all events sharing a correlation ID (a complete pipeline trace).

    Returns events in chronological order for pipeline analysis.
    """
    from app.ml.activity_feed import get_pipeline_trace as _trace

    return _trace(
        correlation_id=correlation_id,
        org_id=ctx.organisation_id,
        workspace_id=ctx.workspace_id or "",
    )
