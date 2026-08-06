"""API Keys router — V7A programmatic access.

Prefix: /api/v1/api-keys

Authentication: X-API-Key header for API key auth (handled in workspace_context).
This router creates/lists/revokes keys for the authenticated user.
"""

from __future__ import annotations

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.rbac.workspace_context import get_workspace_context, WorkspaceContext
from app.schemas.api_key import ApiKeyCreate, ApiKeyCreatedResponse, ApiKeyResponse, ApiKeyRevokeResponse

router = APIRouter(prefix="/api-keys", tags=["API Keys (V7A)"])

DBSession = Annotated[AsyncSession, Depends(get_db)]


@router.post(
    "/",
    summary="Create API key",
    status_code=status.HTTP_201_CREATED,
    response_model=ApiKeyCreatedResponse,
)
async def create_api_key(
    body: ApiKeyCreate,
    db: DBSession,
    ctx: WorkspaceContext = Depends(get_workspace_context),
) -> dict:
    """Create a new API key.

    The ``raw_key`` in the response is shown **once only** and never stored.
    Store it immediately in a secure location.
    """
    from app.ml.api_key_manager import create_api_key as _create
    from app.ml.activity_feed import log_event_nonblocking, ActivityEventType

    result = await _create(
        db=db,
        user_id=ctx.user_id,
        org_id=ctx.organisation_id,
        name=body.name,
        workspace_id=body.workspace_id or ctx.workspace_id,
        scopes=body.scopes or [],
        expires_at=body.expires_at,
    )

    log_event_nonblocking(
        ActivityEventType.API_KEY_CREATED,
        actor_id=ctx.user_id,
        org_id=ctx.organisation_id,
        workspace_id=ctx.workspace_id or "",
        resource_type="workspace",
        resource_id=ctx.workspace_id or ctx.organisation_id,
        actor_display_name=ctx.display_name,
        metadata={"key_id": result["key_id"], "key_prefix": result["key_prefix"]},
        correlation_id=ctx.correlation_id,
    )
    return result


@router.get(
    "/",
    summary="List my API keys",
    response_model=list,
)
async def list_api_keys(
    db: DBSession,
    ctx: WorkspaceContext = Depends(get_workspace_context),
) -> list:
    """Return all API keys for the authenticated user. Never includes key hashes."""
    from app.ml.api_key_manager import list_api_keys as _list

    return await _list(db, ctx.user_id, ctx.workspace_id)


@router.delete(
    "/{key_id}",
    summary="Revoke API key",
    response_model=ApiKeyRevokeResponse,
)
async def revoke_api_key(
    key_id: str,
    db: DBSession,
    ctx: WorkspaceContext = Depends(get_workspace_context),
) -> dict:
    """Revoke an API key permanently."""
    from app.ml.api_key_manager import revoke_api_key as _revoke
    from app.ml.activity_feed import log_event_nonblocking, ActivityEventType

    try:
        result = await _revoke(db, key_id, ctx.user_id)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))

    log_event_nonblocking(
        ActivityEventType.API_KEY_REVOKED,
        actor_id=ctx.user_id,
        org_id=ctx.organisation_id,
        workspace_id=ctx.workspace_id or "",
        resource_type="workspace",
        resource_id=ctx.workspace_id or ctx.organisation_id,
        actor_display_name=ctx.display_name,
        metadata={"key_id": key_id},
        correlation_id=ctx.correlation_id,
    )
    return result


@router.post(
    "/{key_id}/rotate",
    summary="Rotate API key",
    status_code=status.HTTP_201_CREATED,
    response_model=ApiKeyCreatedResponse,
)
async def rotate_api_key(
    key_id: str,
    db: DBSession,
    ctx: WorkspaceContext = Depends(get_workspace_context),
) -> dict:
    """Revoke the existing key and create a replacement with the same configuration."""
    from app.ml.api_key_manager import rotate_api_key as _rotate

    try:
        return await _rotate(db, key_id, ctx.user_id)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
