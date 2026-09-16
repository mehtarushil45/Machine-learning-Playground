"""RecommendationJob database model.

Represents an asynchronous algorithm recommendation benchmark job scoped to
an organisation, user, dataset, and cache key with deterministic concurrency
control.
"""

from __future__ import annotations

from datetime import datetime
import enum
from typing import Any
import uuid

from sqlalchemy import (
    DateTime,
    Float,
    ForeignKey,
    Index,
    JSON,
    String,
    Text,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimeStampMixin, UUIDPrimaryKeyMixin


class RecommendationJobStatus(str, enum.Enum):
    """Deterministic Recommendation Job Lifecycle Statuses."""

    PENDING = "PENDING"
    QUEUED = "QUEUED"
    PROFILING = "PROFILING"
    SCREENING = "SCREENING"
    VERIFYING = "VERIFYING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"
    INSUFFICIENT_DATA = "INSUFFICIENT_DATA"


class RecommendationJob(UUIDPrimaryKeyMixin, TimeStampMixin, Base):
    """Asynchronous algorithm recommendation benchmark job."""

    __tablename__ = "recommendation_jobs"

    # ── Multi-tenancy & Ownership ─────────────────────────────────────────────
    organisation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organisations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    dataset_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("datasets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # ── Job Status & Stage ────────────────────────────────────────────────────
    status: Mapped[str] = mapped_column(
        String(32),
        default=RecommendationJobStatus.PENDING.value,
        nullable=False,
        index=True,
    )
    stage: Mapped[str] = mapped_column(
        String(64),
        default="QUEUED",
        nullable=False,
    )
    progress: Mapped[float] = mapped_column(
        Float,
        default=0.0,
        nullable=False,
    )
    message: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    # ── Deduplication & Celery Reference ──────────────────────────────────────
    cache_key: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        index=True,
    )
    celery_task_id: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
        index=True,
    )

    # ── Request Snapshot & Benchmark Results ──────────────────────────────────
    request_config: Mapped[dict[str, Any]] = mapped_column(
        JSON,
        nullable=False,
        default=dict,
    )
    recommendation: Mapped[dict[str, Any] | None] = mapped_column(
        JSON,
        nullable=True,
    )
    candidates: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON,
        nullable=False,
        default=list,
    )
    warnings: Mapped[list[str]] = mapped_column(
        JSON,
        nullable=False,
        default=list,
    )
    exclusions: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON,
        nullable=False,
        default=list,
    )
    reason_codes: Mapped[list[str]] = mapped_column(
        JSON,
        nullable=False,
        default=list,
    )
    limitations: Mapped[list[str]] = mapped_column(
        JSON,
        nullable=False,
        default=list,
    )
    reproducibility: Mapped[dict[str, Any]] = mapped_column(
        JSON,
        nullable=False,
        default=dict,
    )
    error_details: Mapped[dict[str, Any] | None] = mapped_column(
        JSON,
        nullable=True,
    )

    # ── Lifecycle Timestamps ──────────────────────────────────────────────────
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    cancelled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # ── Relationships ─────────────────────────────────────────────────────────
    organisation: Mapped["Organisation"] = relationship("Organisation")  # type: ignore[name-defined]  # noqa: F821
    created_by: Mapped["User | None"] = relationship("User")  # type: ignore[name-defined]  # noqa: F821
    dataset: Mapped["Dataset"] = relationship("Dataset")  # type: ignore[name-defined]  # noqa: F821

    # ── Partial Unique Index for Active Concurrency Deduplication ─────────────
    __table_args__ = (
        Index(
            "uq_active_rec_job_org_cache",
            "organisation_id",
            "cache_key",
            unique=True,
            postgresql_where=text(
                "status IN ('PENDING', 'QUEUED', 'PROFILING', 'SCREENING', 'VERIFYING')"
            ),
            sqlite_where=text(
                "status IN ('PENDING', 'QUEUED', 'PROFILING', 'SCREENING', 'VERIFYING')"
            ),
        ),
    )

    def __repr__(self) -> str:
        return f"<RecommendationJob id={self.id} dataset_id={self.dataset_id} status={self.status} progress={self.progress}%>"
