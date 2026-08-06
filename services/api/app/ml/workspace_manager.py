"""Workspace Manager — V7A workspace lifecycle and membership management.

Provides CRUD for workspaces, workspace settings, and member invitations.
All workspace/member data lives in PostgreSQL (via SQLAlchemy).
ML resources belong to workspaces via the filesystem ownership overlay
in ``resource_ownership.py``.

Lifecycle states:
    INACTIVE → ACTIVE (on first member join or settings update)
    ACTIVE   ↔ SUSPENDED (org admin action)
    ACTIVE   → ARCHIVED  (workspace admin or org admin)
    ARCHIVED → ACTIVE    (restore — org admin only)

Invitation flow (REST-based, no email):
    invite_member:   status = INVITED
    accept_invite:   status = ACTIVE, joined_at = now
    suspend_member:  status = SUSPENDED
    restore_member:  status = ACTIVE
    remove_member:   status = REMOVED (soft delete)
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger("apex_ml.workspace_manager")

SCHEMA_VERSION = "7a.1.0"


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


# ── Serialisation helpers ─────────────────────────────────────────────────────

def _workspace_to_dict(ws: Any) -> dict:
    """Convert a Workspace ORM object to a serialisable dict."""
    return {
        "workspace_id": str(ws.id),
        "name": ws.name,
        "slug": ws.slug,
        "description": ws.description,
        "status": ws.status.value if hasattr(ws.status, "value") else ws.status,
        "visibility": ws.visibility.value if hasattr(ws.visibility, "value") else ws.visibility,
        "is_default": ws.is_default,
        "organisation_id": str(ws.organisation_id),
        "created_by_user_id": str(ws.created_by_user_id) if ws.created_by_user_id else None,
        "created_at": ws.created_at.isoformat() if ws.created_at else None,
        "updated_at": ws.updated_at.isoformat() if ws.updated_at else None,
        "schema_version": SCHEMA_VERSION,
    }


def _member_to_dict(m: Any) -> dict:
    """Convert a WorkspaceMember ORM object to a serialisable dict."""
    return {
        "member_id": str(m.id),
        "workspace_id": str(m.workspace_id),
        "user_id": str(m.user_id),
        "role": m.role.value if hasattr(m.role, "value") else m.role,
        "status": m.status.value if hasattr(m.status, "value") else m.status,
        "invited_at": m.invited_at.isoformat() if m.invited_at else None,
        "joined_at": m.joined_at.isoformat() if m.joined_at else None,
        "suspended_at": m.suspended_at.isoformat() if m.suspended_at else None,
        "removed_at": m.removed_at.isoformat() if m.removed_at else None,
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }


def _settings_to_dict(s: Any) -> dict:
    """Convert a WorkspaceSettings ORM object to a serialisable dict."""
    return {
        "settings_id": str(s.id),
        "workspace_id": str(s.workspace_id),
        "default_deployment_policy": (
            s.default_deployment_policy.value
            if hasattr(s.default_deployment_policy, "value")
            else s.default_deployment_policy
        ),
        "require_approval_for_production": s.require_approval_for_production,
        "monitoring_auto_start": s.monitoring_auto_start,
        "monitoring_drift_threshold": s.monitoring_drift_threshold,
        "monitoring_alert_email": s.monitoring_alert_email,
        "storage_quota_gb": s.storage_quota_gb,
        "compute_quota_hours": s.compute_quota_hours,
        "dataset_retention_days": s.dataset_retention_days,
        "model_retention_days": s.model_retention_days,
        "branding_logo_url": s.branding_logo_url,
        "branding_primary_color": s.branding_primary_color,
        "updated_at": s.updated_at.isoformat() if s.updated_at else None,
    }


# ── Workspace CRUD ────────────────────────────────────────────────────────────

async def create_workspace(
    db: AsyncSession,
    org_id: str,
    name: str,
    slug: str,
    created_by: str,
    *,
    description: Optional[str] = None,
    visibility: str = "INTERNAL",
    is_default: bool = False,
    settings_override: Optional[dict] = None,
) -> dict:
    """Create a new workspace within an organisation.

    Also creates default WorkspaceSettings and makes the creator a WORKSPACE_ADMIN.

    Args:
        db: Async DB session.
        org_id: Organisation UUID string.
        name: Display name.
        slug: URL-safe identifier (must be unique within org).
        created_by: User ID of the creator.
        description: Optional description.
        visibility: PRIVATE | INTERNAL | PUBLIC.
        is_default: True if this is the org's default workspace.
        settings_override: Optional dict to override default settings.

    Returns:
        Workspace dict with embedded settings.

    Raises:
        ValueError: If slug is already taken within the org.
    """
    from app.models.workspace import Workspace, WorkspaceStatus, WorkspaceVisibility
    from app.models.workspace_settings import WorkspaceSettings, DefaultDeploymentPolicy
    from app.models.workspace_member import WorkspaceMember, WorkspaceRole, MemberStatus

    # Check slug uniqueness within org
    existing = await db.execute(
        select(Workspace).where(
            Workspace.organisation_id == uuid.UUID(org_id),
            Workspace.slug == slug,
        )
    )
    if existing.scalar_one_or_none():
        raise ValueError(f"Workspace slug '{slug}' already exists in this organisation.")

    vis_map = {
        "PRIVATE": WorkspaceVisibility.PRIVATE,
        "INTERNAL": WorkspaceVisibility.INTERNAL,
        "PUBLIC": WorkspaceVisibility.PUBLIC,
    }

    workspace = Workspace(
        id=uuid.uuid4(),
        organisation_id=uuid.UUID(org_id),
        name=name,
        slug=slug,
        description=description,
        status=WorkspaceStatus.ACTIVE,
        visibility=vis_map.get(visibility, WorkspaceVisibility.INTERNAL),
        is_default=is_default,
        created_by_user_id=uuid.UUID(created_by),
    )
    db.add(workspace)
    await db.flush()  # get workspace.id

    # Create default settings
    override = settings_override or {}
    settings = WorkspaceSettings(
        id=uuid.uuid4(),
        workspace_id=workspace.id,
        default_deployment_policy=DefaultDeploymentPolicy(
            override.get("default_deployment_policy", "ALLOW_WITH_WARNING")
        ),
        require_approval_for_production=override.get("require_approval_for_production", True),
        monitoring_auto_start=override.get("monitoring_auto_start", False),
        monitoring_drift_threshold=override.get("monitoring_drift_threshold", 0.10),
        monitoring_alert_email=override.get("monitoring_alert_email"),
        storage_quota_gb=override.get("storage_quota_gb"),
        compute_quota_hours=override.get("compute_quota_hours"),
        dataset_retention_days=override.get("dataset_retention_days"),
        model_retention_days=override.get("model_retention_days"),
    )
    db.add(settings)

    # Add creator as WORKSPACE_ADMIN
    member = WorkspaceMember(
        id=uuid.uuid4(),
        workspace_id=workspace.id,
        user_id=uuid.UUID(created_by),
        role=WorkspaceRole.WORKSPACE_ADMIN,
        status=MemberStatus.ACTIVE,
        invited_at=_utc_now(),
        joined_at=_utc_now(),
    )
    db.add(member)
    await db.commit()
    await db.refresh(workspace)

    result = _workspace_to_dict(workspace)
    result["settings"] = _settings_to_dict(settings)
    return result


async def get_workspace(db: AsyncSession, workspace_id: str) -> Optional[dict]:
    """Return workspace dict or None."""
    from app.models.workspace import Workspace

    result = await db.execute(
        select(Workspace).where(Workspace.id == uuid.UUID(workspace_id))
    )
    ws = result.scalar_one_or_none()
    return _workspace_to_dict(ws) if ws else None


async def list_workspaces(
    db: AsyncSession,
    org_id: str,
    *,
    user_id: Optional[str] = None,
    status_filter: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    """List workspaces in an org. Optionally filter to workspaces the user is a member of."""
    from app.models.workspace import Workspace, WorkspaceStatus
    from app.models.workspace_member import WorkspaceMember, MemberStatus

    query = select(Workspace).where(Workspace.organisation_id == uuid.UUID(org_id))

    if status_filter:
        try:
            query = query.where(Workspace.status == WorkspaceStatus(status_filter))
        except ValueError:
            pass

    if user_id:
        # Subquery: only workspaces where the user is an active member
        member_ws_ids = select(WorkspaceMember.workspace_id).where(
            WorkspaceMember.user_id == uuid.UUID(user_id),
            WorkspaceMember.status == MemberStatus.ACTIVE,
        )
        query = query.where(Workspace.id.in_(member_ws_ids))

    query = query.offset(offset).limit(limit)
    result = await db.execute(query)
    return [_workspace_to_dict(ws) for ws in result.scalars().all()]


async def update_workspace(
    db: AsyncSession,
    workspace_id: str,
    patch: dict,
    updated_by: str,
) -> dict:
    """Update mutable workspace fields (name, description, visibility)."""
    from app.models.workspace import Workspace, WorkspaceVisibility

    result = await db.execute(
        select(Workspace).where(Workspace.id == uuid.UUID(workspace_id))
    )
    ws = result.scalar_one_or_none()
    if ws is None:
        raise KeyError(f"Workspace '{workspace_id}' not found")

    allowed = {"name", "description", "visibility"}
    for key, value in patch.items():
        if key == "visibility" and key in allowed:
            try:
                setattr(ws, "visibility", WorkspaceVisibility(value))
            except ValueError:
                pass
        elif key in allowed:
            setattr(ws, key, value)

    await db.commit()
    await db.refresh(ws)
    return _workspace_to_dict(ws)


async def archive_workspace(db: AsyncSession, workspace_id: str, archived_by: str) -> dict:
    """Archive a workspace (ACTIVE → ARCHIVED)."""
    from app.models.workspace import Workspace, WorkspaceStatus

    result = await db.execute(
        select(Workspace).where(Workspace.id == uuid.UUID(workspace_id))
    )
    ws = result.scalar_one_or_none()
    if ws is None:
        raise KeyError(f"Workspace '{workspace_id}' not found")
    if ws.is_default:
        raise ValueError("Cannot archive the default workspace.")

    ws.status = WorkspaceStatus.ARCHIVED
    await db.commit()
    return _workspace_to_dict(ws)


async def restore_workspace(db: AsyncSession, workspace_id: str, restored_by: str) -> dict:
    """Restore an ARCHIVED or SUSPENDED workspace to ACTIVE."""
    from app.models.workspace import Workspace, WorkspaceStatus

    result = await db.execute(
        select(Workspace).where(Workspace.id == uuid.UUID(workspace_id))
    )
    ws = result.scalar_one_or_none()
    if ws is None:
        raise KeyError(f"Workspace '{workspace_id}' not found")

    ws.status = WorkspaceStatus.ACTIVE
    await db.commit()
    return _workspace_to_dict(ws)


async def get_workspace_settings(db: AsyncSession, workspace_id: str) -> Optional[dict]:
    """Return workspace settings or None."""
    from app.models.workspace_settings import WorkspaceSettings

    result = await db.execute(
        select(WorkspaceSettings).where(
            WorkspaceSettings.workspace_id == uuid.UUID(workspace_id)
        )
    )
    s = result.scalar_one_or_none()
    return _settings_to_dict(s) if s else None


async def update_workspace_settings(
    db: AsyncSession,
    workspace_id: str,
    patch: dict,
    updated_by: str,
) -> dict:
    """Update workspace settings fields."""
    from app.models.workspace_settings import WorkspaceSettings, DefaultDeploymentPolicy

    result = await db.execute(
        select(WorkspaceSettings).where(
            WorkspaceSettings.workspace_id == uuid.UUID(workspace_id)
        )
    )
    s = result.scalar_one_or_none()
    if s is None:
        raise KeyError(f"Settings not found for workspace '{workspace_id}'")

    allowed = {
        "default_deployment_policy", "require_approval_for_production",
        "monitoring_auto_start", "monitoring_drift_threshold",
        "monitoring_alert_email", "storage_quota_gb", "compute_quota_hours",
        "dataset_retention_days", "model_retention_days",
        "branding_logo_url", "branding_primary_color",
    }
    for key, value in patch.items():
        if key == "default_deployment_policy" and key in allowed:
            try:
                setattr(s, key, DefaultDeploymentPolicy(value))
            except ValueError:
                pass
        elif key in allowed:
            setattr(s, key, value)

    await db.commit()
    await db.refresh(s)
    return _settings_to_dict(s)


# ── Membership CRUD ────────────────────────────────────────────────────────────

async def invite_member(
    db: AsyncSession,
    workspace_id: str,
    user_id: str,
    role: str,
    invited_by: str,
) -> dict:
    """Create a workspace member invitation (status = INVITED).

    The user must accept via ``accept_invitation`` to become ACTIVE.

    Raises:
        ValueError: If user is already a member.
    """
    from app.models.workspace_member import WorkspaceMember, WorkspaceRole, MemberStatus

    # Check for existing membership (including removed)
    existing = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == uuid.UUID(workspace_id),
            WorkspaceMember.user_id == uuid.UUID(user_id),
        )
    )
    ex = existing.scalar_one_or_none()
    if ex and ex.status != "REMOVED":
        raise ValueError(f"User '{user_id}' is already a member of this workspace.")

    try:
        ws_role = WorkspaceRole(role)
    except ValueError:
        raise ValueError(f"Invalid workspace role: '{role}'")

    member = WorkspaceMember(
        id=uuid.uuid4(),
        workspace_id=uuid.UUID(workspace_id),
        user_id=uuid.UUID(user_id),
        invited_by_user_id=uuid.UUID(invited_by),
        role=ws_role,
        status=MemberStatus.INVITED,
        invited_at=_utc_now(),
    )
    db.add(member)
    await db.commit()
    await db.refresh(member)
    return _member_to_dict(member)


async def accept_invitation(db: AsyncSession, workspace_id: str, user_id: str) -> dict:
    """Accept a workspace invitation (INVITED → ACTIVE)."""
    from app.models.workspace_member import WorkspaceMember, MemberStatus

    result = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == uuid.UUID(workspace_id),
            WorkspaceMember.user_id == uuid.UUID(user_id),
            WorkspaceMember.status == MemberStatus.INVITED,
        )
    )
    member = result.scalar_one_or_none()
    if member is None:
        raise KeyError(f"No pending invitation for user '{user_id}' in workspace '{workspace_id}'")

    member.status = MemberStatus.ACTIVE
    member.joined_at = _utc_now()
    await db.commit()
    return _member_to_dict(member)


async def remove_member(db: AsyncSession, workspace_id: str, user_id: str, removed_by: str) -> dict:
    """Soft-remove a workspace member (status → REMOVED)."""
    from app.models.workspace_member import WorkspaceMember, MemberStatus

    result = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == uuid.UUID(workspace_id),
            WorkspaceMember.user_id == uuid.UUID(user_id),
        )
    )
    member = result.scalar_one_or_none()
    if member is None:
        raise KeyError(f"Member '{user_id}' not found in workspace '{workspace_id}'")

    member.status = MemberStatus.REMOVED
    member.removed_at = _utc_now()
    await db.commit()
    return _member_to_dict(member)


async def suspend_member(db: AsyncSession, workspace_id: str, user_id: str, suspended_by: str) -> dict:
    """Suspend an ACTIVE member."""
    from app.models.workspace_member import WorkspaceMember, MemberStatus

    result = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == uuid.UUID(workspace_id),
            WorkspaceMember.user_id == uuid.UUID(user_id),
        )
    )
    member = result.scalar_one_or_none()
    if member is None:
        raise KeyError(f"Member '{user_id}' not found in workspace '{workspace_id}'")

    member.status = MemberStatus.SUSPENDED
    member.suspended_at = _utc_now()
    await db.commit()
    return _member_to_dict(member)


async def restore_member(db: AsyncSession, workspace_id: str, user_id: str, restored_by: str) -> dict:
    """Restore a SUSPENDED member to ACTIVE."""
    from app.models.workspace_member import WorkspaceMember, MemberStatus

    result = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == uuid.UUID(workspace_id),
            WorkspaceMember.user_id == uuid.UUID(user_id),
        )
    )
    member = result.scalar_one_or_none()
    if member is None:
        raise KeyError(f"Member '{user_id}' not found in workspace '{workspace_id}'")

    member.status = MemberStatus.ACTIVE
    member.suspended_at = None
    await db.commit()
    return _member_to_dict(member)


async def update_member_role(
    db: AsyncSession,
    workspace_id: str,
    user_id: str,
    new_role: str,
    updated_by: str,
) -> dict:
    """Update the workspace role for a member."""
    from app.models.workspace_member import WorkspaceMember, WorkspaceRole

    result = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == uuid.UUID(workspace_id),
            WorkspaceMember.user_id == uuid.UUID(user_id),
        )
    )
    member = result.scalar_one_or_none()
    if member is None:
        raise KeyError(f"Member '{user_id}' not found in workspace '{workspace_id}'")

    try:
        member.role = WorkspaceRole(new_role)
    except ValueError:
        raise ValueError(f"Invalid workspace role: '{new_role}'")

    await db.commit()
    return _member_to_dict(member)


async def list_members(
    db: AsyncSession,
    workspace_id: str,
    *,
    status_filter: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
) -> list[dict]:
    """List workspace members with optional status filter."""
    from app.models.workspace_member import WorkspaceMember, MemberStatus

    query = select(WorkspaceMember).where(
        WorkspaceMember.workspace_id == uuid.UUID(workspace_id)
    )
    if status_filter:
        try:
            query = query.where(WorkspaceMember.status == MemberStatus(status_filter))
        except ValueError:
            pass

    query = query.offset(offset).limit(limit)
    result = await db.execute(query)
    return [_member_to_dict(m) for m in result.scalars().all()]


async def get_member(
    db: AsyncSession,
    workspace_id: str,
    user_id: str,
) -> Optional[dict]:
    """Return membership record for a specific user, or None."""
    from app.models.workspace_member import WorkspaceMember

    result = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == uuid.UUID(workspace_id),
            WorkspaceMember.user_id == uuid.UUID(user_id),
        )
    )
    m = result.scalar_one_or_none()
    return _member_to_dict(m) if m else None
