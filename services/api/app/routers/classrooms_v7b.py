"""Classrooms V7B Extension Router — Analytics, Progress & Audit.

New endpoints:
  GET  /api/v1/classrooms/{classroom_id}/dashboard  — Instructor dashboard
  GET  /api/v1/classrooms/{classroom_id}/audit      — Audit report
  GET  /api/v1/classrooms/students/{user_id}/progress — Student progress
"""

from __future__ import annotations

from typing import Any, Dict, List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.models.classroom import Assignment, Classroom, ClassroomMember, Submission
from app.ml.classroom_analytics import (
    compute_classroom_dashboard,
    compute_student_progress,
    generate_classroom_audit_report,
    generate_experiment_grade,
)
from app.ml.experiment_tracker import get_experiment
from app.dependencies import get_current_user

router = APIRouter(
    prefix="/classrooms",
    tags=["Classrooms & Analytics (V7B)"],
    dependencies=[Depends(get_current_user)],  # ← all V7B classroom endpoints require auth
)


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


@router.get("/{classroom_id}/dashboard", response_model=Dict[str, Any], summary="Instructor dashboard")
async def get_classroom_dashboard(classroom_id: UUID, db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    """Instructor analytics dashboard: completion rates, avg scores, top performers."""
    members_res = await db.execute(
        select(ClassroomMember).where(ClassroomMember.classroom_id == classroom_id)
    )
    students = [{"user_id": str(m.user_id)} for m in members_res.scalars().all()]

    assignments_res = await db.execute(
        select(Assignment).where(Assignment.classroom_id == classroom_id)
    )
    assignments = [{"id": str(a.id), "title": a.title} for a in assignments_res.scalars().all()]

    submissions_res = await db.execute(
        select(Submission).where(Submission.classroom_id == classroom_id)
    )
    submissions = [
        {"assignment_id": str(s.assignment_id), "learner_id": str(s.learner_id),
         "score": s.score, "feedback": s.feedback}
        for s in submissions_res.scalars().all()
    ]

    return compute_classroom_dashboard(
        classroom_id=str(classroom_id),
        students=students,
        assignments=assignments,
        submissions=submissions,
    )


@router.get("/{classroom_id}/audit", response_model=Dict[str, Any], summary="Classroom audit report")
async def get_classroom_audit(classroom_id: UUID, db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    """Generate a comprehensive classroom audit report."""
    members_res = await db.execute(
        select(ClassroomMember).where(ClassroomMember.classroom_id == classroom_id)
    )
    students = [{"user_id": str(m.user_id)} for m in members_res.scalars().all()]

    assignments_res = await db.execute(
        select(Assignment).where(Assignment.classroom_id == classroom_id)
    )
    assignments = [{"id": str(a.id), "title": a.title} for a in assignments_res.scalars().all()]

    submissions_res = await db.execute(
        select(Submission).where(Submission.classroom_id == classroom_id)
    )
    submissions = [
        {"assignment_id": str(s.assignment_id), "learner_id": str(s.learner_id),
         "score": s.score, "is_late": False}
        for s in submissions_res.scalars().all()
    ]

    return generate_classroom_audit_report(
        classroom_id=str(classroom_id),
        students=students,
        assignments=assignments,
        submissions=submissions,
    )


@router.get("/students/{user_id}/progress", response_model=Dict[str, Any], summary="Student progress")
async def get_student_progress(user_id: UUID, db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    """Compute individual student progress metrics across all classrooms."""
    submissions_res = await db.execute(
        select(Submission).where(Submission.learner_id == user_id)
    )
    submissions = [
        {"score": s.score, "feedback": s.feedback}
        for s in submissions_res.scalars().all()
    ]

    return compute_student_progress(
        user_id=str(user_id),
        submissions=submissions,
        assignments=[],  # Total assignment count requires classroom context
    )


@router.post("/grade-experiment", response_model=Dict[str, Any], summary="Auto-grade an experiment")
async def grade_experiment(
    experiment_id: str,
    threshold_excellent: float = 0.90,
    threshold_good: float = 0.75,
    threshold_pass: float = 0.60,
) -> Dict[str, Any]:
    """Automatically grade a training experiment based on its performance metrics."""
    experiment = get_experiment(experiment_id)
    rubric = {
        "threshold_excellent": threshold_excellent,
        "threshold_good": threshold_good,
        "threshold_pass": threshold_pass,
    }
    return generate_experiment_grade(experiment, rubric=rubric)
