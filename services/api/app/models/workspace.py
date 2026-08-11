"""Workspace model.

A Workspace is a collaboration boundary within an Organisation.
Each workspace groups Members, Datasets, Models, Deployments,
Monitoring configs, Experiments and Reports under a unified context.
"""

from __future__ import annotations

import enum
import uuid

from sqlalchemy import Boolean, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimeStampMixin, UUIDPrimaryKeyMixin


class WorkspaceStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    ARCHIVED = "ARCHIVED"
    SUSPENDED = "SUSPENDED"


class WorkspaceVisibility(str, enum.Enum):
    PRIVATE = "PRIVATE"    # creator only
    INTERNAL = "INTERNAL"  # all workspace members
    PUBLIC = "PUBLIC"      # all org members (read-only outside)


class Workspace(UUIDPrimaryKeyMixin, TimeStampMixin, Base):
    """A collaboration workspace within an Organisation."""

    __tablename__ = "workspaces"
    __table_args__ = (
        UniqueConstraint("organisation_id", "slug", name="uq_workspaces_organisation_id_slug"),
    )

    # ── Identity ──────────────────────────────────────────────────────────────
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # ── State ─────────────────────────────────────────────────────────────────
    status: Mapped[WorkspaceStatus] = mapped_column(
        default=WorkspaceStatus.ACTIVE, nullable=False
    )
    visibility: Mapped[WorkspaceVisibility] = mapped_column(
        default=WorkspaceVisibility.INTERNAL, nullable=False
    )
    is_default: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )

    # ── Foreign keys ──────────────────────────────────────────────────────────
    organisation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organisations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # ── Relationships ─────────────────────────────────────────────────────────
    organisation: Mapped["Organisation"] = relationship(  # type: ignore[name-defined]  # noqa: F821
        back_populates="workspaces"
    )
    members: Mapped[list["WorkspaceMember"]] = relationship(  # type: ignore[name-defined]  # noqa: F821
        back_populates="workspace", cascade="all, delete-orphan"
    )
    settings: Mapped["WorkspaceSettings | None"] = relationship(  # type: ignore[name-defined]  # noqa: F821
        back_populates="workspace",
        uselist=False,
        cascade="all, delete-orphan",
    )
    created_by: Mapped["User | None"] = relationship(  # type: ignore[name-defined]  # noqa: F821
        foreign_keys=[created_by_user_id]
    )

    def __repr__(self) -> str:
        return f"<Workspace id={self.id} slug={self.slug!r} status={self.status}>"
