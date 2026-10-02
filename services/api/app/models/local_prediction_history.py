"""LocalPredictionHistory model.

Persists every inference request executed against a local deployment,
providing an immutable audit log, latency tracking, and confidence history.
"""

from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy import Float, ForeignKey, JSON, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import TimeStampMixin, UUIDPrimaryKeyMixin


class LocalPredictionHistory(UUIDPrimaryKeyMixin, TimeStampMixin, Base):
    """Historical record of an individual inference against a LocalDeployment."""

    __tablename__ = "local_prediction_history"

    deployment_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("local_deployments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    model_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    model_version: Mapped[str] = mapped_column(String(64), nullable=False, default="v1.0.0")

    # Inputs payload provided for prediction
    inputs: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)

    # Outcomes
    prediction: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    probabilities: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    # Execution telemetry
    latency_ms: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="SUCCESS")
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Ownership & Tenant isolation
    owner_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"<LocalPredictionHistory id={self.id} deployment_id={self.deployment_id} "
            f"prediction={self.prediction!r} status={self.status}>"
        )
