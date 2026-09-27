"""add local_deployments table

Revision ID: i1a2b3c4d5e9
Revises: h1a2b3c4d5e8
Create Date: 2026-09-27

Adds the local_deployments table for Prototype 4: Deployment Studio.
Each record is explicitly linked to a job_id and stores an immutable
snapshot of the model artifact's metadata (model_path, feature_columns,
target_column, input_schema) captured at deployment creation time.
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "i1a2b3c4d5e9"
down_revision = "h1a2b3c4d5e8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "local_deployments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("job_id", sa.String(255), nullable=False),
        sa.Column("model_id", sa.String(255), nullable=False),
        sa.Column("name", sa.String(255), nullable=False, server_default="Local Deployment"),
        sa.Column("status", sa.String(32), nullable=False, server_default="CREATED"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("algorithm", sa.String(255), nullable=False, server_default=""),
        sa.Column("problem_type", sa.String(64), nullable=False, server_default=""),
        sa.Column("dataset_id", sa.String(255), nullable=False, server_default=""),
        sa.Column("target_column", sa.String(255), nullable=False, server_default=""),
        sa.Column("feature_columns", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("model_path", sa.String(1024), nullable=False, server_default=""),
        sa.Column("input_schema", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("total_predictions", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("logs", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("stopped_at", sa.DateTime(timezone=True), nullable=True),
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
    )
    op.create_index("ix_local_deployments_job_id", "local_deployments", ["job_id"])
    op.create_index("ix_local_deployments_model_id", "local_deployments", ["model_id"])
    op.create_index("ix_local_deployments_owner_id", "local_deployments", ["owner_id"])


def downgrade() -> None:
    op.drop_index("ix_local_deployments_owner_id", table_name="local_deployments")
    op.drop_index("ix_local_deployments_model_id", table_name="local_deployments")
    op.drop_index("ix_local_deployments_job_id", table_name="local_deployments")
    op.drop_table("local_deployments")
