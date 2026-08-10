"""User model.

Users belong to an Organisation and are scoped to it for all data access.
"""

import uuid
import enum

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimeStampMixin, UUIDPrimaryKeyMixin


class UserRole(str, enum.Enum):
    """Roles control what a user can do within their organisation and institution."""

    # V7A Platform roles
    platform_owner = "platform_owner"    # superuser across all orgs
    org_admin      = "org_admin"         # full control within own org

    # V1 legacy roles (preserved for backward compat)
    platform_admin = "platform_admin"    # alias for platform_owner
    faculty = "faculty"
    lab_coordinator = "lab_coordinator"
    reviewer = "reviewer"
    learner = "learner"
    owner = "owner"
    admin = "admin"
    member = "member"
    viewer = "viewer"


class User(UUIDPrimaryKeyMixin, TimeStampMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role: Mapped[UserRole] = mapped_column(default=UserRole.member, nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    is_verified: Mapped[bool] = mapped_column(default=False, nullable=False)
    verification_token: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)

    # ── Multi-tenancy foreign key ──────────────────────────────────────────────
    organisation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organisations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # ── Relationships ─────────────────────────────────────────────────────────
    organisation: Mapped["Organisation"] = relationship(back_populates="users")  # type: ignore[name-defined]  # noqa: F821
    datasets: Mapped[list["Dataset"]] = relationship(back_populates="created_by")  # type: ignore[name-defined]  # noqa: F821
    jobs: Mapped[list["Job"]] = relationship(back_populates="created_by")  # type: ignore[name-defined]  # noqa: F821
    # V7A: workspace memberships (back-populated by WorkspaceMember)
    workspace_memberships: Mapped[list["WorkspaceMember"]] = relationship(  # type: ignore[name-defined]  # noqa: F821
        back_populates="user",
        foreign_keys="[WorkspaceMember.user_id]",
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email!r} role={self.role}>"
