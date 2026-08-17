"""add recommendation_jobs table

Revision ID: g1a2b3c4d5e7
Revises: f1a2b3c4d5e6
Create Date: 2026-08-16

Adds the recommendation_jobs table for persisting asynchronous automatic
algorithm recommendation benchmark jobs, including partial unique index
on (organisation_id, cache_key) for active concurrency deduplication.
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "g1a2b3c4d5e7"
down_revision = "f1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "recommendation_jobs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "organisation_id",
            sa.Uuid(),
            sa.ForeignKey("organisations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "dataset_id",
            sa.Uuid(),
            sa.ForeignKey("datasets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("status", sa.String(32), nullable=False, server_default="PENDING"),
        sa.Column("stage", sa.String(64), nullable=False, server_default="QUEUED"),
        sa.Column("progress", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("cache_key", sa.String(64), nullable=False),
        sa.Column("celery_task_id", sa.String(255), nullable=True),
        sa.Column("request_config", sa.JSON(), nullable=False),
        sa.Column("recommendation", sa.JSON(), nullable=True),
        sa.Column("candidates", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("warnings", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("exclusions", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("reason_codes", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("limitations", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("reproducibility", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("error_details", sa.JSON(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index("ix_recommendation_jobs_organisation_id", "recommendation_jobs", ["organisation_id"])
    op.create_index("ix_recommendation_jobs_user_id", "recommendation_jobs", ["user_id"])
    op.create_index("ix_recommendation_jobs_dataset_id", "recommendation_jobs", ["dataset_id"])
    op.create_index("ix_recommendation_jobs_status", "recommendation_jobs", ["status"])
    op.create_index("ix_recommendation_jobs_cache_key", "recommendation_jobs", ["cache_key"])
    op.create_index("ix_recommendation_jobs_celery_task_id", "recommendation_jobs", ["celery_task_id"])

    # Partial unique index for active concurrency deduplication across all active states
    op.create_index(
        "uq_active_rec_job_org_cache",
        "recommendation_jobs",
        ["organisation_id", "cache_key"],
        unique=True,
        postgresql_where=sa.text("status IN ('PENDING', 'QUEUED', 'PROFILING', 'SCREENING', 'VERIFYING')"),
        sqlite_where=sa.text("status IN ('PENDING', 'QUEUED', 'PROFILING', 'SCREENING', 'VERIFYING')"),
    )


def downgrade() -> None:
    op.drop_index("uq_active_rec_job_org_cache", table_name="recommendation_jobs")
    op.drop_index("ix_recommendation_jobs_celery_task_id", table_name="recommendation_jobs")
    op.drop_index("ix_recommendation_jobs_cache_key", table_name="recommendation_jobs")
    op.drop_index("ix_recommendation_jobs_status", table_name="recommendation_jobs")
    op.drop_index("ix_recommendation_jobs_dataset_id", table_name="recommendation_jobs")
    op.drop_index("ix_recommendation_jobs_user_id", table_name="recommendation_jobs")
    op.drop_index("ix_recommendation_jobs_organisation_id", table_name="recommendation_jobs")
    op.drop_table("recommendation_jobs")
