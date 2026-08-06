"""Organisation model.

An Organisation is the top-level multi-tenant boundary.
Every Dataset, Job, and User belongs to exactly one Organisation.
"""

import uuid

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimeStampMixin, UUIDPrimaryKeyMixin


class Organisation(UUIDPrimaryKeyMixin, TimeStampMixin, Base):
    __tablename__ = "organisations"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)

    # ── Relationships (back-populates defined on child side) ──────────────────
    users: Mapped[list["User"]] = relationship(back_populates="organisation")  # type: ignore[name-defined]  # noqa: F821
    datasets: Mapped[list["Dataset"]] = relationship(back_populates="organisation")  # type: ignore[name-defined]  # noqa: F821
    jobs: Mapped[list["Job"]] = relationship(back_populates="organisation")  # type: ignore[name-defined]  # noqa: F821
    # V7A: workspace hierarchy
    workspaces: Mapped[list["Workspace"]] = relationship(  # type: ignore[name-defined]  # noqa: F821
        back_populates="organisation", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Organisation id={self.id} slug={self.slug!r}>"
