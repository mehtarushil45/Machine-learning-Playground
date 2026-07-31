"""Dataset model stub.

Represents a CSV (or future tabular) dataset uploaded by a user.
Scoped to both organisation and user for multi-tenant data isolation.
"""

import uuid
import enum

from sqlalchemy import BigInteger, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimeStampMixin, UUIDPrimaryKeyMixin


class DatasetStatus(str, enum.Enum):
    """Lifecycle state of an uploaded dataset."""

    pending = "pending"       # file received, not yet processed
    processing = "processing" # being parsed / profiled
    ready = "ready"           # available for ML jobs
    failed = "failed"         # processing error


class Dataset(UUIDPrimaryKeyMixin, TimeStampMixin, Base):
    __tablename__ = "datasets"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ── Storage location ──────────────────────────────────────────────────────
    file_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)   # object-storage key
    file_size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    original_filename: Mapped[str | None] = mapped_column(String(512), nullable=True)

    # ── Parsed metadata (filled after processing) ─────────────────────────────
    row_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    column_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[DatasetStatus] = mapped_column(default=DatasetStatus.pending, nullable=False)

    # ── Multi-tenancy & ownership FKs ─────────────────────────────────────────
    organisation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organisations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=False,
        index=True,
    )

    # ── Relationships ─────────────────────────────────────────────────────────
    organisation: Mapped["Organisation"] = relationship(back_populates="datasets")  # type: ignore[name-defined]  # noqa: F821
    created_by: Mapped["User"] = relationship(back_populates="datasets")  # type: ignore[name-defined]  # noqa: F821
    jobs: Mapped[list["Job"]] = relationship(back_populates="dataset")  # type: ignore[name-defined]  # noqa: F821

    def __repr__(self) -> str:
        return f"<Dataset id={self.id} name={self.name!r} status={self.status}>"
