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
    """Roles control what a user can do within their organisation."""

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

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email!r} role={self.role}>"
