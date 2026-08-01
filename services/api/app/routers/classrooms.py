"""Classroom, Course, Assignment & Submission REST Router — Phase 1.

Endpoints for managing institutional ML courses, classrooms, assignments, learner submissions,
reproducibility audits, and faculty evaluations.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.permissions import Permission, check_user_permission
from app.database import AsyncSessionLocal
from app.dependencies import get_current_user
from app.models.classroom import (
    Assignment,
    Classroom,
    ClassroomMember,
    ClassroomRole,
    Course,
    Feedback,
    Submission,
    SubmissionStatus,
)
from app.models.user import User
from app.schemas.classroom import (
    AssignmentCreate,
    AssignmentResponse,
    ClassroomCreate,
    ClassroomMemberAdd,
    ClassroomResponse,
    CourseCreate,
    CourseResponse,
    FeedbackCreate,
    SubmissionCreate,
    SubmissionResponse,
)

router = APIRouter(prefix="/classrooms", tags=["Classrooms & Assignments"])


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


# ---------------------------------------------------------------------------
# Course Endpoints
# ---------------------------------------------------------------------------

@router.post(
    "/courses",
    response_model=CourseResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new course",
)
async def create_course(
    payload: CourseCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CourseResponse:
    """Create a new academic ML course within the user's organization."""
    check_user_permission(current_user, Permission.COURSE_CREATE)

    course = Course(
        organisation_id=current_user.organisation_id,
        code=payload.code,
        title=payload.title,
        description=payload.description,
        created_by_id=current_user.id,
    )
    db.add(course)
    await db.commit()
    await db.refresh(course)
    return course


@router.get(
    "/courses",
    response_model=List[CourseResponse],
    summary="List organization courses",
)
async def list_courses(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[CourseResponse]:
    """List all courses registered under current organization."""
    stmt = select(Course).where(Course.organisation_id == current_user.organisation_id)
    res = await db.execute(stmt)
    return list(res.scalars().all())


# ---------------------------------------------------------------------------
# Classroom Endpoints
# ---------------------------------------------------------------------------

@router.post(
    "",
    response_model=ClassroomResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a classroom batch",
)
async def create_classroom(
    payload: ClassroomCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ClassroomResponse:
    """Create a new classroom batch for a course."""
    check_user_permission(current_user, Permission.CLASSROOM_CREATE)

    classroom = Classroom(
        organisation_id=current_user.organisation_id,
        course_id=payload.course_id,
        name=payload.name,
        code=payload.code,
        term=payload.term,
        faculty_id=current_user.id,
    )
    db.add(classroom)
    await db.commit()
    await db.refresh(classroom)
    return classroom


@router.get(
    "",
    response_model=List[ClassroomResponse],
    summary="List active classrooms",
)
async def list_classrooms(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[ClassroomResponse]:
    """List all active classrooms in the organization."""
    stmt = select(Classroom).where(Classroom.organisation_id == current_user.organisation_id)
    res = await db.execute(stmt)
    return list(res.scalars().all())


@router.post(
    "/{classroom_id}/members",
    summary="Enroll user into classroom",
)
async def add_classroom_member(
    classroom_id: UUID,
    payload: ClassroomMemberAdd,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """Enroll a learner, faculty, or lab coordinator into a classroom."""
    check_user_permission(current_user, Permission.CLASSROOM_MANAGE)

    member = ClassroomMember(
        classroom_id=classroom_id,
        user_id=payload.user_id,
        role=payload.role,
    )
    db.add(member)
    await db.commit()
    return {"message": "User enrolled successfully", "classroom_id": str(classroom_id), "user_id": str(payload.user_id)}


# ---------------------------------------------------------------------------
# Assignment & Submission Endpoints
# ---------------------------------------------------------------------------

@router.post(
    "/assignments",
    response_model=AssignmentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a classroom ML assignment",
)
async def create_assignment(
    payload: AssignmentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AssignmentResponse:
    """Faculty endpoint to publish a practical ML assignment with deadlines & rubric."""
    check_user_permission(current_user, Permission.ASSIGNMENT_CREATE)

    assignment = Assignment(
        organisation_id=current_user.organisation_id,
        classroom_id=payload.classroom_id,
        title=payload.title,
        description=payload.description,
        dataset_id=payload.dataset_id,
        due_date=payload.due_date,
        rubric=payload.rubric,
        max_score=payload.max_score,
        created_by_id=current_user.id,
    )
    db.add(assignment)
    await db.commit()
    await db.refresh(assignment)
    return assignment


@router.get(
    "/assignments",
    response_model=List[AssignmentResponse],
    summary="List classroom assignments",
)
async def list_assignments(
    classroom_id: Optional[UUID] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[AssignmentResponse]:
    """List assignments for an organization or classroom."""
    stmt = select(Assignment).where(Assignment.organisation_id == current_user.organisation_id)
    if classroom_id:
        stmt = stmt.where(Assignment.classroom_id == classroom_id)
    res = await db.execute(stmt)
    return list(res.scalars().all())


@router.post(
    "/submissions",
    response_model=SubmissionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit ML project assignment",
)
async def submit_assignment(
    payload: SubmissionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SubmissionResponse:
    """Learner endpoint to submit a trained experiment and model for assignment evaluation."""
    check_user_permission(current_user, Permission.ASSIGNMENT_SUBMIT)

    submission = Submission(
        organisation_id=current_user.organisation_id,
        assignment_id=payload.assignment_id,
        learner_id=current_user.id,
        experiment_id=payload.experiment_id,
        model_id=payload.model_id,
        pipeline_id=payload.pipeline_id,
        status=SubmissionStatus.submitted,
        reproducibility_verified=True,
    )
    db.add(submission)
    await db.commit()
    await db.refresh(submission)
    return submission


@router.post(
    "/submissions/{submission_id}/review",
    summary="Faculty evaluation & grading",
)
async def review_submission(
    submission_id: UUID,
    payload: FeedbackCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """Faculty endpoint to grade a submission and provide feedback."""
    check_user_permission(current_user, Permission.SUBMISSION_EVALUATE)

    stmt = select(Submission).where(Submission.id == submission_id)
    res = await db.execute(stmt)
    sub = res.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")

    sub.status = SubmissionStatus.evaluated

    fb = Feedback(
        submission_id=submission_id,
        evaluator_id=current_user.id,
        score=payload.score,
        comments=payload.comments,
    )
    db.add(fb)
    await db.commit()
    return {"message": "Submission evaluated successfully", "submission_id": str(submission_id), "score": payload.score}


# ---------------------------------------------------------------------------
# Automated Submission Reproducibility Audit Endpoints
# ---------------------------------------------------------------------------

from app.ml.reproducibility_checker import verify_submission_reproducibility
from app.schemas.classroom import ReproducibilityAuditRequest, ReproducibilityReportResponse


@router.post(
    "/submissions/{submission_id}/verify-reproducibility",
    response_model=ReproducibilityReportResponse,
    summary="Run 1-click automated submission reproducibility audit",
)
async def verify_submission_reproducibility_endpoint(
    submission_id: UUID,
    payload: Optional[ReproducibilityAuditRequest] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ReproducibilityReportResponse:
    """Faculty & Reviewer endpoint to re-execute a student submission and verify metric reproducibility."""
    check_user_permission(current_user, Permission.SUBMISSION_REVIEW)

    stmt = select(Submission).where(Submission.id == submission_id)
    res = await db.execute(stmt)
    sub = res.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Submission '{submission_id}' not found.")

    exp_id = sub.experiment_id
    tolerance = payload.tolerance if payload else 0.005

    report = verify_submission_reproducibility(
        submission_id=str(submission_id),
        experiment_id=exp_id,
        tolerance=tolerance,
    )

    # Update submission reproducibility status in DB
    sub.reproducibility_verified = report.is_reproducible
    sub.metrics_summary = report.reproduced_metrics
    await db.commit()

    return report


@router.get(
    "/submissions/{submission_id}/reproducibility-report",
    response_model=ReproducibilityReportResponse,
    summary="Get stored reproducibility audit report",
)
async def get_reproducibility_report_endpoint(
    submission_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ReproducibilityReportResponse:
    """Get stored or live reproducibility audit report for a submission."""
    check_user_permission(current_user, Permission.SUBMISSION_VIEW)

    stmt = select(Submission).where(Submission.id == submission_id)
    res = await db.execute(stmt)
    sub = res.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Submission '{submission_id}' not found.")

    report = verify_submission_reproducibility(
        submission_id=str(submission_id),
        experiment_id=sub.experiment_id,
        tolerance=0.005,
    )
    return report
