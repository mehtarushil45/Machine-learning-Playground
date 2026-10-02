"""add deployment lifecycle columns and local_prediction_history table

Revision ID: j1a2b3c4d5e0
Revises: i1a2b3c4d5e9
Create Date: 2026-10-01

Adds model_version, artifact_id, configuration to local_deployments table
and creates the local_prediction_history table for auditing, telemetry,
and real prediction history.
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "j1a2b3c4d5e0"
down_revision = "i1a2b3c4d5e9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add lifecycle columns to local_deployments
    op.add_column(
        "local_deployments",
        sa.Column("model_version", sa.String(64), nullable=False, server_default="v1.0.0"),
    )
    op.add_column(
        "local_deployments",
        sa.Column("artifact_id", sa.String(255), nullable=False, server_default=""),
    )
    op.add_column(
        "local_deployments",
        sa.Column("configuration", sa.JSON(), nullable=False, server_default="{}"),
    )

    # 2. Create local_prediction_history table
    op.create_table(
        "local_prediction_history",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("deployment_id", sa.Uuid(), nullable=False),
        sa.Column("model_id", sa.String(255), nullable=False),
        sa.Column("model_version", sa.String(64), nullable=False, server_default="v1.0.0"),
        sa.Column("inputs", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("prediction", sa.String(255), nullable=False, server_default=""),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("probabilities", sa.JSON(), nullable=True),
        sa.Column("latency_ms", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("status", sa.String(32), nullable=False, server_default="SUCCESS"),
        sa.Column("error_message", sa.Text(), nullable=True),
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
        sa.ForeignKeyConstraint(
            ["deployment_id"],
            ["local_deployments.id"],
            ondelete="CASCADE",
        ),
    )
    op.create_index(
        "ix_local_prediction_history_deployment_id",
        "local_prediction_history",
        ["deployment_id"],
    )
    op.create_index(
        "ix_local_prediction_history_owner_id",
        "local_prediction_history",
        ["owner_id"],
    )
    op.create_index(
        "ix_local_prediction_history_created_at",
        "local_prediction_history",
        ["created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_local_prediction_history_created_at", table_name="local_prediction_history")
    op.drop_index("ix_local_prediction_history_owner_id", table_name="local_prediction_history")
    op.drop_index("ix_local_prediction_history_deployment_id", table_name="local_prediction_history")
    op.drop_table("local_prediction_history")

    op.drop_column("local_deployments", "configuration")
    op.drop_column("local_deployments", "artifact_id")
    op.drop_column("local_deployments", "model_version")
