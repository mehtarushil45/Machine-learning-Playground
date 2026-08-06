"""User Directory — V7A user profile and cross-workspace directory.

Provides read/update operations for user profiles and workspace membership
summaries. All data lives in PostgreSQL (via SQLAlchemy async).

This module is READ-ONLY for the most part. User creation is handled by
the existing auth router. Suspension/restore are admin-only operations.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger("apex_ml.user_directory")

SCHEMA_VERSION = "7a.1.0"


def _user_to_dict(user) -> dict:
    """Convert a User ORM object to a serialisable dict."""
    role = getattr(user, "role", None)
    return {
        "user_id": str(user.id),
        "email": user.email,
        "display_name": getattr(user, "full_name", None) or user.email,
        "role": role.value if hasattr(role, "value") else str(role),
        "is_active": user.is_active,
        "organisation_id": str(user.organisation_id),
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "updated_at": user.updated_at.isoformat() if user.updated_at else None,
        "schema_version": SCHEMA_VERSION,
    }


async def get_user_profile(db: AsyncSession, user_id: str) -> Optional[dict]:
    """Return user profile dict or None."""
    import uuid
    from app.models.user import User

    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    return _user_to_dict(user) if user else None


async def update_user_profile(
    db: AsyncSession,
    user_id: str,
    patch: dict,
) -> dict:
    """Update mutable profile fields (full_name only for now)."""
    import uuid
    from app.models.user import User

    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if user is None:
        raise KeyError(f"User '{user_id}' not found")

    if "display_name" in patch and hasattr(user, "full_name"):
        user.full_name = patch["display_name"]

    await db.commit()
    await db.refresh(user)
    return _user_to_dict(user)


async def get_user_memberships(
    db: AsyncSession,
    user_id: str,
) -> list[dict]:
    """Return all workspace memberships for a user."""
    import uuid
    from app.models.workspace_member import WorkspaceMember, MemberStatus

    result = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.user_id == uuid.UUID(user_id),
            WorkspaceMember.status != MemberStatus.REMOVED,
        )
    )
    members = result.scalars().all()
    return [
        {
            "membership_id": str(m.id),
            "workspace_id": str(m.workspace_id),
            "role": m.role.value if hasattr(m.role, "value") else str(m.role),
            "status": m.status.value if hasattr(m.status, "value") else str(m.status),
            "joined_at": m.joined_at.isoformat() if m.joined_at else None,
        }
        for m in members
    ]


async def search_users_in_org(
    db: AsyncSession,
    org_id: str,
    query: str,
    limit: int = 20,
) -> list[dict]:
    """Search users in an org by email or name prefix."""
    import uuid
    from app.models.user import User
    from sqlalchemy import or_

    result = await db.execute(
        select(User).where(
            User.organisation_id == uuid.UUID(org_id),
            or_(
                User.email.ilike(f"%{query}%"),
                User.full_name.ilike(f"%{query}%") if hasattr(User, "full_name") else User.email.ilike(f"%{query}%"),
            ),
        ).limit(limit)
    )
    users = result.scalars().all()
    return [_user_to_dict(u) for u in users]


async def suspend_user(
    db: AsyncSession,
    user_id: str,
    suspended_by: str,
    reason: str = "",
) -> dict:
    """Deactivate a user account (is_active = False)."""
    import uuid
    from app.models.user import User

    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if user is None:
        raise KeyError(f"User '{user_id}' not found")

    user.is_active = False
    await db.commit()
    return {**_user_to_dict(user), "suspended_by": suspended_by, "reason": reason}


async def restore_user(
    db: AsyncSession,
    user_id: str,
    restored_by: str,
) -> dict:
    """Reactivate a suspended user account."""
    import uuid
    from app.models.user import User

    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if user is None:
        raise KeyError(f"User '{user_id}' not found")

    user.is_active = True
    await db.commit()
    return {**_user_to_dict(user), "restored_by": restored_by}


async def get_user_activity_summary(
    db: AsyncSession,
    user_id: str,
    org_id: str,
    workspace_id: Optional[str] = None,
    days: int = 30,
) -> dict:
    """Return a summary of recent activity for a user."""
    from app.ml.activity_feed import get_activity_feed

    events = get_activity_feed(
        org_id=org_id,
        workspace_id=workspace_id or "",
        actor_id_filter=user_id,
        limit=100,
    )
    by_type: dict[str, int] = {}
    for e in events:
        t = e.get("event_type", "UNKNOWN")
        by_type[t] = by_type.get(t, 0) + 1

    return {
        "user_id": user_id,
        "total_events": len(events),
        "by_event_type": by_type,
        "recent_events": events[:10],
    }
