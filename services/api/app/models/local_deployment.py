"""LocalDeployment model — Prototype 4.

Represents a local model deployment that is explicitly linked to a
training job and its immutable model artifact.  This ensures that:

- Changing Page 1 configuration after training never changes deployed model.
- Multiple training runs each produce independent, isolated deployments.
- Artifact lifecycle (model file) and deployment lifecycle are separate.

Status lifecycle:
    CREATED   -> DEPLOYING -> READY
                              |
                         STOPPING -> STOPPED
                         (can redeploy STOPPED -> DEPLOYING -> READY)

    FAILED  -- terminal; artifact intact; can attempt redeploy
"""

from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import DateTime, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import TimeStampMixin, UUIDPrimaryKeyMixin


class LocalDeploymentStatus(str, enum.Enum):
    CREATED   = "CREATED"
    STARTING  = "STARTING"
    DEPLOYING = "STARTING"
    RUNNING   = "RUNNING"
    READY     = "RUNNING"
    STOPPING  = "STOPPING"
    STOPPED   = "STOPPED"
    FAILED    = "FAILED"


class LocalDeployment(UUIDPrimaryKeyMixin, TimeStampMixin, Base):
    """A local model deployment linked to a specific, immutable training run artifact."""

    __tablename__ = "local_deployments"

    # Training Run Link (immutability anchor)
    job_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    model_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    model_version: Mapped[str] = mapped_column(String(64), nullable=False, default="v1.0.0")
    artifact_id: Mapped[str] = mapped_column(String(255), nullable=False, default="")

    # Display & Configuration
    name: Mapped[str] = mapped_column(String(255), nullable=False, default="Local Deployment")
    configuration: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)

    # Lifecycle
    status: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default=LocalDeploymentStatus.CREATED.value,
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Immutable Artifact Snapshot (captured at deploy time)
    algorithm: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    problem_type: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    dataset_id: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    target_column: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    feature_columns: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    model_path: Mapped[str] = mapped_column(String(1024), nullable=False, default="")

    # Input Schema (feature -> {type, categories?, min?, max?})
    input_schema: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)

    # Telemetry
    total_predictions: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Deployment Logs [{ts: str, msg: str}]
    logs: Mapped[list] = mapped_column(JSON, default=list, nullable=False)

    # Timestamps
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    stopped_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Ownership
    owner_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"<LocalDeployment id={self.id} job={self.job_id!r} "
            f"model={self.model_id!r} status={self.status}>"
        )
