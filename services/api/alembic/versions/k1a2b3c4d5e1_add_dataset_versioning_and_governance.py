"""add dataset versioning and file format columns

Revision ID: k1a2b3c4d5e1
Revises: j1a2b3c4d5e0
Create Date: 2026-10-06

Adds version, content_hash, and file_format to datasets table
to support immutable dataset versioning, out-of-core profiling,
and multi-format ingestion (Parquet/CSV).
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "k1a2b3c4d5e1"
down_revision = "j1a2b3c4d5e0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "datasets",
        sa.Column("version", sa.String(32), nullable=False, server_default="v1"),
    )
    op.add_column(
        "datasets",
        sa.Column("content_hash", sa.String(64), nullable=True),
    )
    op.add_column(
        "datasets",
        sa.Column("file_format", sa.String(16), nullable=False, server_default="csv"),
    )


def downgrade() -> None:
    op.drop_column("datasets", "file_format")
    op.drop_column("datasets", "content_hash")
    op.drop_column("datasets", "version")
