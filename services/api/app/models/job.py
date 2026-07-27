"""Job model stub.

Represents an ML training or processing job dispatched to the Celery worker.
Scoped to both organisation and user.
"""

import uuid
import enum
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimeStampMixin, UUIDPrimaryKeyMixin


class JobType(str, enum.Enum):
    """Type of ML operation."""

    training = "training"
    evaluation = "evaluation"
    prediction = "prediction"
    profiling = "profiling"


class JobStatus(str, enum.Enum):
    """Celery task lifecycle states."""

    queued = "queued"
    running = "running"
    succeeded = "succeeded"
    failed = "failed"
    cancelled = "cancelled"


class Job(UUIDPrimaryKeyMixin, TimeStampMixin, Base):
    __tablename__ = "jobs"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    job_type: Mapped[JobType] = mapped_column(nullable=False)
    status: Mapped[JobStatus] = mapped_column(default=JobStatus.queued, nullable=False)

    # ── Celery task reference ─────────────────────────────────────────────────
    celery_task_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)

    # ── Result / error ────────────────────────────────────────────────────────
    result_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)  # object-storage key
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # ── Input FK ─────────────────────────────────────────────────────────────
    dataset_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("datasets.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

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
    organisation: Mapped["Organisation"] = relationship(back_populates="jobs")  # type: ignore[name-defined]  # noqa: F821
    created_by: Mapped["User"] = relationship(back_populates="jobs")  # type: ignore[name-defined]  # noqa: F821
    dataset: Mapped["Dataset"] = relationship(back_populates="jobs")  # type: ignore[name-defined]  # noqa: F821

    def __repr__(self) -> str:
        return f"<Job id={self.id} type={self.job_type} status={self.status}>"
