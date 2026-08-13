"""add deployments table

Revision ID: f1a2b3c4d5e6
Revises: e8f9a1b2c3d4
Create Date: 2026-08-12

Migrates deployment persistence from the file-based index.json cache
(uploads/deployments/index.json) to a proper PostgreSQL table so that
deployments survive server restarts, work across multiple workers/containers,
and are owned by authenticated users.
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "f1a2b3c4d5e6"
down_revision = "e8f9a1b2c3d4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "deployments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("deployment_name", sa.String(255), nullable=False),
        sa.Column("model_id", sa.String(255), nullable=False),
        sa.Column("api_key", sa.String(512), nullable=False),
        sa.Column("endpoint_url", sa.String(1024), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="ACTIVE"),
        sa.Column("rate_limit_rpm", sa.Integer(), nullable=False, server_default="60"),
        sa.Column("require_api_key", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("total_requests", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("owner_id", sa.String(255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("api_key", name="uq_deployments_api_key"),
    )
    op.create_index("ix_deployments_model_id", "deployments", ["model_id"])
    op.create_index("ix_deployments_owner_id", "deployments", ["owner_id"])


def downgrade() -> None:
    op.drop_index("ix_deployments_owner_id", table_name="deployments")
    op.drop_index("ix_deployments_model_id", table_name="deployments")
    op.drop_table("deployments")
