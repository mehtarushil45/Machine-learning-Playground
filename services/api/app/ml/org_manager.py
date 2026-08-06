"""Organisation Manager — V7A organisation CRUD.

Wraps the existing SQLAlchemy ``Organisation`` model with additional
business logic for V7A: default workspace creation, org stats, plan tier.

The Organisation model already exists from V1 (models/organisation.py).
This module extends it with V7A operations without modifying the model.
"""

from __future__ import annotations

import logging
import uuid
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger("apex_ml.org_manager")

SCHEMA_VERSION = "7a.1.0"


def _org_to_dict(org) -> dict:
    return {
        "organisation_id": str(org.id),
        "name": org.name,
        "slug": org.slug,
        "is_active": org.is_active,
        "created_at": org.created_at.isoformat() if org.created_at else None,
        "updated_at": org.updated_at.isoformat() if org.updated_at else None,
        "schema_version": SCHEMA_VERSION,
    }


async def get_organisation(db: AsyncSession, org_id: str) -> Optional[dict]:
    """Return organisation dict or None."""
    from app.models.organisation import Organisation

    result = await db.execute(
        select(Organisation).where(Organisation.id == uuid.UUID(org_id))
    )
    org = result.scalar_one_or_none()
    return _org_to_dict(org) if org else None


async def get_organisation_by_slug(db: AsyncSession, slug: str) -> Optional[dict]:
    """Return organisation dict by slug or None."""
    from app.models.organisation import Organisation

    result = await db.execute(
        select(Organisation).where(Organisation.slug == slug)
    )
    org = result.scalar_one_or_none()
    return _org_to_dict(org) if org else None


async def list_organisations(
    db: AsyncSession,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    """List all organisations (PLATFORM_OWNER only)."""
    from app.models.organisation import Organisation

    result = await db.execute(
        select(Organisation).offset(offset).limit(limit)
    )
    return [_org_to_dict(org) for org in result.scalars().all()]


async def update_organisation(
    db: AsyncSession,
    org_id: str,
    patch: dict,
) -> dict:
    """Update mutable organisation fields (name)."""
    from app.models.organisation import Organisation

    result = await db.execute(
        select(Organisation).where(Organisation.id == uuid.UUID(org_id))
    )
    org = result.scalar_one_or_none()
    if org is None:
        raise KeyError(f"Organisation '{org_id}' not found")

    if "name" in patch:
        org.name = patch["name"]

    await db.commit()
    await db.refresh(org)
    return _org_to_dict(org)


async def get_org_stats(db: AsyncSession, org_id: str) -> dict:
    """Return workspace count, member count, and resource counts for an org."""
    from app.models.workspace import Workspace, WorkspaceStatus
    from app.models.user import User

    ws_result = await db.execute(
        select(Workspace).where(
            Workspace.organisation_id == uuid.UUID(org_id),
            Workspace.status == WorkspaceStatus.ACTIVE,
        )
    )
    workspaces = ws_result.scalars().all()

    user_result = await db.execute(
        select(User).where(
            User.organisation_id == uuid.UUID(org_id),
            User.is_active == True,  # noqa: E712
        )
    )
    users = user_result.scalars().all()

    return {
        "organisation_id": org_id,
        "workspace_count": len(workspaces),
        "active_member_count": len(users),
        "schema_version": SCHEMA_VERSION,
    }


async def ensure_default_workspace(
    db: AsyncSession,
    org_id: str,
    created_by: str,
) -> dict:
    """Ensure the org has a default workspace, creating one if necessary.

    Called after organisation creation. Idempotent.
    """
    from app.models.workspace import Workspace, WorkspaceStatus

    result = await db.execute(
        select(Workspace).where(
            Workspace.organisation_id == uuid.UUID(org_id),
            Workspace.is_default == True,  # noqa: E712
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        return {"workspace_id": str(existing.id), "created": False}

    from app.ml.workspace_manager import create_workspace
    ws = await create_workspace(
        db=db,
        org_id=org_id,
        name="Default Workspace",
        slug="default",
        created_by=created_by,
        description="Auto-created default workspace",
        is_default=True,
    )
    return {"workspace_id": ws["workspace_id"], "created": True}
