"""add learning_aids_enabled column to assignments table

Revision ID: m1a2b3c4d5e3
Revises: l1a2b3c4d5e2
Create Date: 2026-10-10

Adds learning_aids_enabled column to assignments table if not present.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "m1a2b3c4d5e3"
down_revision = "l1a2b3c4d5e2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    cols = [c["name"] for c in insp.get_columns("assignments")]
    if "learning_aids_enabled" not in cols:
        op.add_column(
            "assignments",
            sa.Column("learning_aids_enabled", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        )


def downgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    cols = [c["name"] for c in insp.get_columns("assignments")]
    if "learning_aids_enabled" in cols:
        op.drop_column("assignments", "learning_aids_enabled")
