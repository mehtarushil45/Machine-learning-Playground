"""Deployment model.

Represents a live ML model deployment endpoint, including its API key,
rate-limit configuration, status, and request counters.
Scoped to the owning user who created the deployment.
"""

from __future__ import annotations

import enum
from datetime import datetime
from typing import List

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import TimeStampMixin, UUIDPrimaryKeyMixin


class DeploymentStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    PAUSED = "PAUSED"
    REVOKED = "REVOKED"


class Deployment(UUIDPrimaryKeyMixin, TimeStampMixin, Base):
    """A live model endpoint created via the 1-Click Deployment Studio."""

    __tablename__ = "deployments"

    # ── Identity ──────────────────────────────────────────────────────────────
    deployment_name: Mapped[str] = mapped_column(String(255), nullable=False)
    model_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)

    # ── API key & endpoint URL ────────────────────────────────────────────────
    api_key: Mapped[str] = mapped_column(String(512), nullable=False, unique=True)
    endpoint_url: Mapped[str] = mapped_column(String(1024), nullable=False)

    # ── Configuration ─────────────────────────────────────────────────────────
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default=DeploymentStatus.ACTIVE.value
    )
    rate_limit_rpm: Mapped[int] = mapped_column(Integer, nullable=False, default=60)
    require_api_key: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # ── Counters ──────────────────────────────────────────────────────────────
    total_requests: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # ── Ownership ─────────────────────────────────────────────────────────────
    owner_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"<Deployment id={self.id} name={self.deployment_name!r} "
            f"model={self.model_id!r} status={self.status}>"
        )
