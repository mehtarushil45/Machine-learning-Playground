"""V7A: Add workspaces, workspace_members, workspace_settings, api_keys tables.

Revision ID: v7a_001_enterprise_orgs
Revises: (initial — alembic/versions was empty)
Create Date: 2026-08-06 18:52:00.000000+00:00

This migration is additive only:
    - Creates 4 new tables (workspaces, workspace_members, workspace_settings, api_keys)
    - Adds workspace_memberships relationship support via workspace_members table
    - Existing tables (organisations, users, datasets, jobs, classrooms) are UNCHANGED

Upgrade path:
    alembic upgrade head

Rollback path:
    alembic downgrade -1
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# Unique revision ID
revision = "v7a_001_enterprise_orgs"
down_revision = None  # First migration in an empty versions/ directory
branch_labels = ("v7a",)
depends_on = None


def upgrade() -> None:
    """Create V7A enterprise tables."""

    # ── workspaces ────────────────────────────────────────────────────────────
    op.create_table(
        "workspaces",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False),
        sa.Column("description", sa.String(500), nullable=True),
        sa.Column(
            "status",
            sa.Enum("ACTIVE", "ARCHIVED", "SUSPENDED", name="workspacestatus"),
            nullable=False,
            server_default="ACTIVE",
        ),
        sa.Column(
            "visibility",
            sa.Enum("PRIVATE", "INTERNAL", "PUBLIC", name="workspacevisibility"),
            nullable=False,
            server_default="INTERNAL",
        ),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("organisation_id", sa.Uuid(), sa.ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_by_user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )
    op.create_index("ix_workspaces_organisation_id", "workspaces", ["organisation_id"])
    op.create_index("ix_workspaces_slug", "workspaces", ["slug"])

    # ── workspace_settings ────────────────────────────────────────────────────
    op.create_table(
        "workspace_settings",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("workspace_id", sa.Uuid(), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column(
            "default_deployment_policy",
            sa.Enum("ALLOW", "ALLOW_WITH_WARNING", "BLOCK", name="defaultdeploymentpolicy"),
            nullable=False,
            server_default="ALLOW_WITH_WARNING",
        ),
        sa.Column("require_approval_for_production", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("monitoring_auto_start", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("monitoring_drift_threshold", sa.Float(), nullable=False, server_default="0.10"),
        sa.Column("monitoring_alert_email", sa.String(500), nullable=True),
        sa.Column("storage_quota_gb", sa.Float(), nullable=True),
        sa.Column("compute_quota_hours", sa.Float(), nullable=True),
        sa.Column("dataset_retention_days", sa.Integer(), nullable=True),
        sa.Column("model_retention_days", sa.Integer(), nullable=True),
        sa.Column("branding_logo_url", sa.String(500), nullable=True),
        sa.Column("branding_primary_color", sa.String(20), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )
    op.create_index("ix_workspace_settings_workspace_id", "workspace_settings", ["workspace_id"])

    # ── workspace_members ─────────────────────────────────────────────────────
    op.create_table(
        "workspace_members",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("workspace_id", sa.Uuid(), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("invited_by_user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column(
            "role",
            sa.Enum(
                "WORKSPACE_ADMIN", "ML_ENGINEER", "DATA_SCIENTIST", "REVIEWER", "VIEWER",
                name="workspacerole",
            ),
            nullable=False,
            server_default="VIEWER",
        ),
        sa.Column(
            "status",
            sa.Enum("INVITED", "ACTIVE", "SUSPENDED", "REMOVED", name="memberstatus"),
            nullable=False,
            server_default="INVITED",
        ),
        sa.Column("invited_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("suspended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("removed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.UniqueConstraint("workspace_id", "user_id", name="uq_workspace_user"),
    )
    op.create_index("ix_workspace_members_workspace_id", "workspace_members", ["workspace_id"])
    op.create_index("ix_workspace_members_user_id", "workspace_members", ["user_id"])

    # ── api_keys ──────────────────────────────────────────────────────────────
    op.create_table(
        "api_keys",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("workspace_id", sa.Uuid(), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=True),
        sa.Column("organisation_id", sa.Uuid(), sa.ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("key_prefix", sa.String(16), nullable=False),
        sa.Column("key_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("scopes", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_ip", sa.String(64), nullable=True),
        sa.Column("last_user_agent", sa.String(512), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )
    op.create_index("ix_api_keys_user_id", "api_keys", ["user_id"])
    op.create_index("ix_api_keys_organisation_id", "api_keys", ["organisation_id"])
    op.create_index("ix_api_keys_workspace_id", "api_keys", ["workspace_id"])
    op.create_index("ix_api_keys_key_hash", "api_keys", ["key_hash"], unique=True)


def downgrade() -> None:
    """Drop V7A enterprise tables (reverse order of creation)."""
    op.drop_table("api_keys")
    op.drop_table("workspace_members")
    op.drop_table("workspace_settings")
    op.drop_table("workspaces")

    # Drop custom enums
    op.execute("DROP TYPE IF EXISTS memberstatus")
    op.execute("DROP TYPE IF EXISTS workspacerole")
    op.execute("DROP TYPE IF EXISTS defaultdeploymentpolicy")
    op.execute("DROP TYPE IF EXISTS workspacevisibility")
    op.execute("DROP TYPE IF EXISTS workspacestatus")
