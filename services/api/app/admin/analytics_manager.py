"""Analytics Manager — V7B.

Generates read-only, real-time global platform analytics by querying the DB.
"""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.dataset import Dataset
from app.models.job import Job
from app.models.organisation import Organisation
from app.models.user import User
from app.models.workspace import Workspace
from app.schemas.admin import AnalyticsSummary


async def generate_global_analytics(db: AsyncSession) -> AnalyticsSummary:
    """Compute real-time platform-wide analytics using DB aggregations."""
    total_orgs = (await db.scalar(select(func.count()).select_from(Organisation))) or 0
    total_workspaces = (await db.scalar(select(func.count()).select_from(Workspace))) or 0
    total_users = (await db.scalar(select(func.count()).select_from(User))) or 0
    total_datasets = (await db.scalar(select(func.count()).select_from(Dataset))) or 0
    training_completed = (
        await db.scalar(
            select(func.count()).select_from(Job).where(Job.status == "COMPLETED")
        )
    ) or 0

    return AnalyticsSummary(
        total_organisations=total_orgs,
        total_workspaces=total_workspaces,
        total_users=total_users,
        total_datasets=total_datasets,
        total_models=0,          # Filesystem registry — counted by registry module
        total_deployments=0,     # Filesystem registry — counted by deployment module
        storage_used_bytes=0,    # MinIO — would be fetched from storage backend
        training_jobs_completed=training_completed,
    )
