"""add is_verified and verification_token to users table

Revision ID: h1a2b3c4d5e8
Revises: g1a2b3c4d5e7
Create Date: 2026-08-17
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "h1a2b3c4d5e8"
down_revision = "g1a2b3c4d5e7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Use batch_alter_table or add_column
    op.add_column(
        "users",
        sa.Column("is_verified", sa.Boolean(), server_default="true", nullable=False),
    )
    op.add_column(
        "users",
        sa.Column("verification_token", sa.String(length=255), nullable=True),
    )
    op.create_index(
        op.f("ix_users_verification_token"),
        "users",
        ["verification_token"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_users_verification_token"), table_name="users")
    op.drop_column("users", "verification_token")
    op.drop_column("users", "is_verified")
