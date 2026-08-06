"""ApiKey model.

A hashed API key allowing programmatic access to the platform.

Security contract:
- The full key is generated once on creation and returned in the response.
- Only the SHA-256 hash (key_hash) is persisted — never the plaintext.
- Prefix (key_prefix) is stored for display: shows first 12 chars only.
- Audit metadata (last_ip, last_user_agent) is updated on each use.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, JSON, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimeStampMixin, UUIDPrimaryKeyMixin


class ApiKey(UUIDPrimaryKeyMixin, TimeStampMixin, Base):
    """Hashed API key for programmatic platform access."""

    __tablename__ = "api_keys"

    # ── Foreign keys ──────────────────────────────────────────────────────────
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    workspace_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    organisation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organisations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # ── Key identity ──────────────────────────────────────────────────────────
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    key_prefix: Mapped[str] = mapped_column(String(16), nullable=False)  # display only
    key_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    scopes: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)

    # ── Lifecycle ─────────────────────────────────────────────────────────────
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # ── Audit metadata ────────────────────────────────────────────────────────
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)  # IPv4/IPv6
    last_user_agent: Mapped[str | None] = mapped_column(String(512), nullable=True)

    # ── Relationships ─────────────────────────────────────────────────────────
    user: Mapped["User"] = relationship(  # type: ignore[name-defined]  # noqa: F821
        foreign_keys=[user_id]
    )
    workspace: Mapped["Workspace | None"] = relationship(  # type: ignore[name-defined]  # noqa: F821
        foreign_keys=[workspace_id]
    )

    def __repr__(self) -> str:
        return f"<ApiKey id={self.id} prefix={self.key_prefix!r} revoked={self.revoked}>"
