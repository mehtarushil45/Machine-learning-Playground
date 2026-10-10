"""add classroom entry and roster management schema

Revision ID: l1a2b3c4d5e2
Revises: k1a2b3c4d5e1
Create Date: 2026-10-10

Adds join_code, join_code_active, require_approval, division/batch configurations,
exam scheduling to classrooms table;
Adds participant details, status, exam_started_at, time_extension to classroom_members table;
Creates classroom_audit_logs and classroom_code_snapshots tables.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "l1a2b3c4d5e2"
down_revision = "k1a2b3c4d5e1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Alter course_id in classrooms to nullable
    op.alter_column("classrooms", "course_id", existing_type=sa.UUID(), nullable=True)

    # 2. Add new columns to classrooms
    op.add_column("classrooms", sa.Column("description", sa.Text(), nullable=True))
    op.add_column("classrooms", sa.Column("join_code", sa.String(16), nullable=True))
    op.add_column("classrooms", sa.Column("join_code_active", sa.Boolean(), server_default=sa.text("true"), nullable=False))
    op.add_column("classrooms", sa.Column("require_approval", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.add_column("classrooms", sa.Column("allowed_divisions", sa.JSON(), nullable=True))
    op.add_column("classrooms", sa.Column("allowed_batches", sa.JSON(), nullable=True))
    op.add_column("classrooms", sa.Column("enrollment_format_hint", sa.String(255), nullable=True))
    op.add_column("classrooms", sa.Column("enrollment_pattern", sa.String(255), nullable=True))
    op.add_column("classrooms", sa.Column("exam_start_time", sa.DateTime(timezone=True), nullable=True))
    op.add_column("classrooms", sa.Column("exam_end_time", sa.DateTime(timezone=True), nullable=True))
    op.add_column("classrooms", sa.Column("is_exam_started", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.add_column("classrooms", sa.Column("is_archived", sa.Boolean(), server_default=sa.text("false"), nullable=False))

    op.create_index("ix_classrooms_join_code", "classrooms", ["join_code"], unique=True)

    # 3. Add columns to classroom_members
    op.add_column("classroom_members", sa.Column("status", sa.String(50), server_default="joined", nullable=False))
    op.add_column("classroom_members", sa.Column("full_name", sa.String(255), nullable=True))
    op.add_column("classroom_members", sa.Column("enrollment_number", sa.String(100), nullable=True))
    op.add_column("classroom_members", sa.Column("division", sa.String(50), nullable=True))
    op.add_column("classroom_members", sa.Column("batch", sa.String(50), nullable=True))
    op.add_column("classroom_members", sa.Column("exam_started_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("classroom_members", sa.Column("time_extension_minutes", sa.Integer(), server_default="0", nullable=False))
    op.add_column("classroom_members", sa.Column("is_reopened", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.add_column("classroom_members", sa.Column("last_activity_at", sa.DateTime(timezone=True), nullable=True))

    op.execute(
        """
        DELETE FROM classroom_members a
        USING classroom_members b
        WHERE a.created_at > b.created_at
          AND a.classroom_id = b.classroom_id
          AND a.user_id = b.user_id
        """
    )

    op.create_unique_constraint("uq_classroom_member_user", "classroom_members", ["classroom_id", "user_id"])
    op.create_unique_constraint("uq_classroom_member_enrollment", "classroom_members", ["classroom_id", "enrollment_number"])


    # 4. Create classroom_audit_logs
    op.create_table(
        "classroom_audit_logs",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("classroom_id", sa.UUID(), nullable=False),
        sa.Column("actor_id", sa.UUID(), nullable=False),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("target_user_id", sa.UUID(), nullable=True),
        sa.Column("details", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["classroom_id"], ["classrooms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["target_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_classroom_audit_logs_classroom_id", "classroom_audit_logs", ["classroom_id"])
    op.create_index("ix_classroom_audit_logs_actor_id", "classroom_audit_logs", ["actor_id"])

    # 5. Create classroom_code_snapshots
    op.create_table(
        "classroom_code_snapshots",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("classroom_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("event_type", sa.String(50), nullable=False),
        sa.Column("code", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["classroom_id"], ["classrooms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_classroom_code_snapshots_classroom_id", "classroom_code_snapshots", ["classroom_id"])
    op.create_index("ix_classroom_code_snapshots_user_id", "classroom_code_snapshots", ["user_id"])


def downgrade() -> None:
    op.drop_table("classroom_code_snapshots")
    op.drop_table("classroom_audit_logs")
    op.drop_constraint("uq_classroom_member_enrollment", "classroom_members", type_="unique")
    op.drop_constraint("uq_classroom_member_user", "classroom_members", type_="unique")
    op.drop_column("classroom_members", "last_activity_at")
    op.drop_column("classroom_members", "is_reopened")
    op.drop_column("classroom_members", "time_extension_minutes")
    op.drop_column("classroom_members", "exam_started_at")
    op.drop_column("classroom_members", "batch")
    op.drop_column("classroom_members", "division")
    op.drop_column("classroom_members", "enrollment_number")
    op.drop_column("classroom_members", "full_name")
    op.drop_column("classroom_members", "status")

    op.drop_index("ix_classrooms_join_code", table_name="classrooms")
    op.drop_column("classrooms", "is_archived")
    op.drop_column("classrooms", "is_exam_started")
    op.drop_column("classrooms", "exam_end_time")
    op.drop_column("classrooms", "exam_start_time")
    op.drop_column("classrooms", "enrollment_pattern")
    op.drop_column("classrooms", "enrollment_format_hint")
    op.drop_column("classrooms", "allowed_batches")
    op.drop_column("classrooms", "allowed_divisions")
    op.drop_column("classrooms", "require_approval")
    op.drop_column("classrooms", "join_code_active")
    op.drop_column("classrooms", "join_code")
    op.drop_column("classrooms", "description")
    op.alter_column("classrooms", "course_id", existing_type=sa.UUID(), nullable=False)
