"""Job model.

Represents an ML training or processing job managed by the Job Orchestration Layer.
Scoped to both organisation and user.
"""

import enum
from datetime import datetime
from typing import Any
import uuid

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimeStampMixin, UUIDPrimaryKeyMixin


class JobStatusEnum(str, enum.Enum):
    """Deterministic Job Lifecycle Statuses."""

    PENDING = "PENDING"
    QUEUED = "QUEUED"
    STARTING = "STARTING"
    RUNNING = "RUNNING"
    VALIDATING = "VALIDATING"
    TRAINING = "TRAINING"
    EVALUATING = "EVALUATING"
    SAVING_MODEL = "SAVING_MODEL"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"
    RETRYING = "RETRYING"


class JobType(str, enum.Enum):
    """Type of ML operation."""

    training = "training"
    evaluation = "evaluation"
    prediction = "prediction"
    profiling = "profiling"


class Job(UUIDPrimaryKeyMixin, TimeStampMixin, Base):
    __tablename__ = "jobs"

    name: Mapped[str] = mapped_column(String(255), nullable=False, default="ML Training Job")
    job_type: Mapped[str] = mapped_column(String(64), nullable=False, default="training")
    status: Mapped[str] = mapped_column(String(64), default=JobStatusEnum.PENDING.value, nullable=False)

    # ── Job Configuration & Details ──────────────────────────────────────────
    dataset_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    algorithm: Mapped[str | None] = mapped_column(String(255), nullable=True)
    target_column: Mapped[str | None] = mapped_column(String(255), nullable=True)
    feature_columns: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)

    # ── Progress & Execution Stage ────────────────────────────────────────────
    progress: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    current_stage: Mapped[str] = mapped_column(String(255), default="Initialized", nullable=False)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    estimated_seconds: Mapped[float | None] = mapped_column(Float, nullable=True, default=0.0)
    worker_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # ── Timestamps & Lifecycle ────────────────────────────────────────────────
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # ── Error & Retries ───────────────────────────────────────────────────────
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # ── Celery & Storage references ───────────────────────────────────────────
    celery_task_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    result_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)

    # ── Ownership & Metadata ──────────────────────────────────────────────────
    owner_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    job_metadata: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)

    # ── Foreign Keys & Multi-tenancy ──────────────────────────────────────────
    organisation_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("organisations.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    def __repr__(self) -> str:
        return f"<Job id={self.id} algorithm={self.algorithm} status={self.status} progress={self.progress}%>"
