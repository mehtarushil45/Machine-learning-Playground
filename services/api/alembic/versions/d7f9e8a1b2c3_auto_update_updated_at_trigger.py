"""Add PostgreSQL trigger to automatically update updated_at on row changes

Revision ID: d7f9e8a1b2c3
Revises: c5e8f9a2b3d4
Create Date: 2026-08-10 23:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd7f9e8a1b2c3'
down_revision: Union[str, None] = 'c5e8f9a2b3d4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Tables with updated_at timestamp columns
TABLES = [
    "users",
    "organisations",
    "workspaces",
    "workspace_members",
    "workspace_settings",
    "datasets",
    "jobs",
    "api_keys",
    "classrooms",
    "assignments",
    "submissions",
    "portfolio_projects",
]


def upgrade() -> None:
    """Create reusable trigger function and attach BEFORE UPDATE triggers."""
    # 1. Create stored procedure / trigger function in PL/pgSQL
    op.execute("""
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = CURRENT_TIMESTAMP;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)

    # 2. Attach BEFORE UPDATE trigger to each table (two separate exec calls —
    #    asyncpg does NOT allow multiple statements in one prepared statement)
    for table_name in TABLES:
        trigger_name = f"update_{table_name}_updated_at"
        op.execute(f"DROP TRIGGER IF EXISTS {trigger_name} ON {table_name};")
        op.execute(
            f"CREATE TRIGGER {trigger_name} "
            f"BEFORE UPDATE ON {table_name} "
            f"FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();"
        )


def downgrade() -> None:
    """Drop attached triggers and trigger function."""
    # 1. Drop triggers
    for table_name in TABLES:
        trigger_name = f"update_{table_name}_updated_at"
        op.execute(f"DROP TRIGGER IF EXISTS {trigger_name} ON {table_name};")

    # 2. Drop trigger function
    op.execute("DROP FUNCTION IF EXISTS update_updated_at_column();")
