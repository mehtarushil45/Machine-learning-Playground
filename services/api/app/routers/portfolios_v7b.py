"""Portfolios V7B Extension Router — Achievements, Public Profiles & Recruiter Views.

New endpoints:
  GET  /api/v1/portfolios/user/{user_id}/profile       — Public profile
  GET  /api/v1/portfolios/user/{user_id}/recruiter     — Recruiter view
  GET  /api/v1/portfolios/user/{user_id}/skills        — Skill summary
  GET  /api/v1/portfolios/user/{user_id}/achievements  — Badges / achievements
"""

from __future__ import annotations

from typing import Any, Dict, List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.models.classroom import PortfolioProject
from app.ml.portfolio_manager import build_public_profile, build_recruiter_view, compute_skill_summary

router = APIRouter(prefix="/portfolios", tags=["Portfolio & Verification (V7B)"])


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


async def _get_user_projects(user_id: UUID, db: AsyncSession) -> List[Dict[str, Any]]:
    """Helper to load portfolio projects for a user."""
    stmt = select(PortfolioProject).where(PortfolioProject.user_id == user_id)
    res = await db.execute(stmt)
    projects = res.scalars().all()
    return [
        {
            "id": str(p.id),
            "title": p.title,
            "description": p.description,
            "model_id": p.model_id,
            "experiment_id": p.experiment_id,
            "is_public": p.is_public,
            "certificate_qr_code": p.certificate_qr_code,
        }
        for p in projects
    ]


@router.get("/user/{user_id}/skills", response_model=Dict[str, Any], summary="Student skill summary")
async def get_skill_summary(user_id: UUID, db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    """Derive a skill summary from a student's portfolio projects."""
    projects = await _get_user_projects(user_id, db)
    return compute_skill_summary(projects)


@router.get("/user/{user_id}/achievements", response_model=List[Dict[str, str]], summary="Student badges/achievements")
async def get_achievements(user_id: UUID, db: AsyncSession = Depends(get_db)) -> List[Dict[str, str]]:
    """Return earned badges and achievements for a student."""
    projects = await _get_user_projects(user_id, db)
    summary = compute_skill_summary(projects)
    return summary.get("badges", [])


@router.get("/user/{user_id}/profile", response_model=Dict[str, Any], summary="Public student profile")
async def get_public_profile(user_id: UUID, db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    """Generate a shareable public ML practitioner profile."""
    projects = await _get_user_projects(user_id, db)
    return build_public_profile(
        user_id=str(user_id),
        user_name="ML Practitioner",
        portfolio_projects=projects,
    )


@router.get("/user/{user_id}/recruiter", response_model=Dict[str, Any], summary="Recruiter view")
async def get_recruiter_view(user_id: UUID, db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    """Generate a recruiter-optimized view of a student's ML accomplishments."""
    projects = await _get_user_projects(user_id, db)
    return build_recruiter_view(
        user_id=str(user_id),
        user_name="ML Practitioner",
        portfolio_projects=projects,
    )
