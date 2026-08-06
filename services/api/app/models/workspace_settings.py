"""WorkspaceSettings model.

One-to-one configuration record for a Workspace.
Controls default policies, quotas, and retention.
"""

from __future__ import annotations

import enum
import uuid

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimeStampMixin, UUIDPrimaryKeyMixin


class DefaultDeploymentPolicy(str, enum.Enum):
    ALLOW = "ALLOW"
    ALLOW_WITH_WARNING = "ALLOW_WITH_WARNING"
    BLOCK = "BLOCK"


class WorkspaceSettings(UUIDPrimaryKeyMixin, TimeStampMixin, Base):
    """Configuration and quota settings for a Workspace (1:1)."""

    __tablename__ = "workspace_settings"

    # ── Parent workspace ──────────────────────────────────────────────────────
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    # ── Deployment defaults ───────────────────────────────────────────────────
    default_deployment_policy: Mapped[DefaultDeploymentPolicy] = mapped_column(
        default=DefaultDeploymentPolicy.ALLOW_WITH_WARNING,
        nullable=False,
    )
    require_approval_for_production: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )

    # ── Monitoring defaults ───────────────────────────────────────────────────
    monitoring_auto_start: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    monitoring_drift_threshold: Mapped[float] = mapped_column(
        Float, default=0.10, nullable=False
    )
    monitoring_alert_email: Mapped[str | None] = mapped_column(
        String(500), nullable=True
    )

    # ── Quotas (None = unlimited; advisory only — never block) ────────────────
    storage_quota_gb: Mapped[float | None] = mapped_column(Float, nullable=True)
    compute_quota_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    dataset_retention_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    model_retention_days: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # ── Branding (arch only — no render logic) ────────────────────────────────
    branding_logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    branding_primary_color: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # ── Relationships ─────────────────────────────────────────────────────────
    workspace: Mapped["Workspace"] = relationship(  # type: ignore[name-defined]  # noqa: F821
        back_populates="settings"
    )

    def __repr__(self) -> str:
        return f"<WorkspaceSettings workspace={self.workspace_id} policy={self.default_deployment_policy}>"
