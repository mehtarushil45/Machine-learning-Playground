"""Add composite unique constraint on (organisation_id, slug) to workspaces table

Revision ID: e8f9a1b2c3d4
Revises: d7f9e8a1b2c3
Create Date: 2026-08-11 17:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e8f9a1b2c3d4'
down_revision: Union[str, None] = 'd7f9e8a1b2c3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Drop existing non-unique index on slug
    op.drop_index('ix_workspaces_slug', table_name='workspaces')

    # 2. Create composite unique constraint on (organisation_id, slug)
    op.create_unique_constraint(
        'uq_workspaces_organisation_id_slug',
        'workspaces',
        ['organisation_id', 'slug']
    )


def downgrade() -> None:
    # 1. Drop composite unique constraint
    op.drop_constraint('uq_workspaces_organisation_id_slug', 'workspaces', type_='unique')

    # 2. Re-create original non-unique index on slug
    op.create_index('ix_workspaces_slug', 'workspaces', ['slug'], unique=False)
