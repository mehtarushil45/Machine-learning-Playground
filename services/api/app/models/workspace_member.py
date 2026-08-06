"""WorkspaceMember model.

Association between a User and a Workspace with an explicit role and status.
A user may be a member of multiple workspaces.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimeStampMixin, UUIDPrimaryKeyMixin


class WorkspaceRole(str, enum.Enum):
    """Roles that a user may hold within a single workspace."""

    WORKSPACE_ADMIN = "WORKSPACE_ADMIN"
    ML_ENGINEER = "ML_ENGINEER"
    DATA_SCIENTIST = "DATA_SCIENTIST"
    REVIEWER = "REVIEWER"
    VIEWER = "VIEWER"


class MemberStatus(str, enum.Enum):
    INVITED = "INVITED"
    ACTIVE = "ACTIVE"
    SUSPENDED = "SUSPENDED"
    REMOVED = "REMOVED"


class WorkspaceMember(UUIDPrimaryKeyMixin, TimeStampMixin, Base):
    """Membership record linking a User to a Workspace."""

    __tablename__ = "workspace_members"
    __table_args__ = (
        UniqueConstraint("workspace_id", "user_id", name="uq_workspace_user"),
    )

    # ── Foreign keys ──────────────────────────────────────────────────────────
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    invited_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # ── Role & state ──────────────────────────────────────────────────────────
    role: Mapped[WorkspaceRole] = mapped_column(
        default=WorkspaceRole.VIEWER, nullable=False
    )
    status: Mapped[MemberStatus] = mapped_column(
        default=MemberStatus.INVITED, nullable=False
    )

    # ── Lifecycle timestamps ──────────────────────────────────────────────────
    invited_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    joined_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    suspended_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    removed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # ── Relationships ─────────────────────────────────────────────────────────
    workspace: Mapped["Workspace"] = relationship(  # type: ignore[name-defined]  # noqa: F821
        back_populates="members"
    )
    user: Mapped["User"] = relationship(  # type: ignore[name-defined]  # noqa: F821
        foreign_keys=[user_id], back_populates="workspace_memberships"
    )
    invited_by: Mapped["User | None"] = relationship(  # type: ignore[name-defined]  # noqa: F821
        foreign_keys=[invited_by_user_id]
    )

    def __repr__(self) -> str:
        return (
            f"<WorkspaceMember workspace={self.workspace_id} "
            f"user={self.user_id} role={self.role} status={self.status}>"
        )
