"""migrate job dataset_id to uuid fk

Revision ID: c5e8f9a2b3d4
Revises: 044fc835c788
Create Date: 2026-08-10 22:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c5e8f9a2b3d4'
down_revision: Union[str, None] = '044fc835c788'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Drop existing index on jobs.dataset_id
    op.drop_index(op.f('ix_jobs_dataset_id'), table_name='jobs')

    # 2. Alter dataset_id column type from VARCHAR(255) to UUID with safe PostgreSQL type coercion
    op.alter_column(
        'jobs',
        'dataset_id',
        existing_type=sa.String(length=255),
        type_=sa.Uuid(),
        existing_nullable=True,
        postgresql_using='dataset_id::uuid',
    )

    # 3. Create Foreign Key constraint pointing to datasets.id with referential integrity (SET NULL on delete)
    op.create_foreign_key(
        'fk_jobs_dataset_id_datasets',
        'jobs',
        'datasets',
        ['dataset_id'],
        ['id'],
        ondelete='SET NULL',
    )

    # 4. Re-create index on jobs.dataset_id
    op.create_index(op.f('ix_jobs_dataset_id'), 'jobs', ['dataset_id'], unique=False)


def downgrade() -> None:
    # 1. Drop Foreign Key constraint
    op.drop_constraint('fk_jobs_dataset_id_datasets', 'jobs', type_='foreignkey')

    # 2. Drop index
    op.drop_index(op.f('ix_jobs_dataset_id'), table_name='jobs')

    # 3. Alter dataset_id column type back from UUID to VARCHAR(255)
    op.alter_column(
        'jobs',
        'dataset_id',
        existing_type=sa.Uuid(),
        type_=sa.String(length=255),
        existing_nullable=True,
        postgresql_using='dataset_id::text',
    )

    # 4. Re-create index
    op.create_index(op.f('ix_jobs_dataset_id'), 'jobs', ['dataset_id'], unique=False)
