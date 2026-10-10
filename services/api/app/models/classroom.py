"""Classroom, Course, Assignment, Submission, Feedback, and Portfolio domain models.

Implements multi-tenant educational practical workflow for MLPlayground:
  Course -> Classroom -> Assignment -> Submission -> Feedback -> PortfolioProject
"""

import enum
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, JSON, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimeStampMixin, UUIDPrimaryKeyMixin


class ClassroomRole(str, enum.Enum):
    faculty = "faculty"
    lab_coordinator = "lab_coordinator"
    reviewer = "reviewer"
    learner = "learner"


class SubmissionStatus(str, enum.Enum):
    draft = "draft"
    submitted = "submitted"
    evaluating = "evaluating"
    evaluated = "evaluated"
    rejected = "rejected"


class Course(UUIDPrimaryKeyMixin, TimeStampMixin, Base):
    __tablename__ = "courses"

    organisation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    # Relationships
    classrooms: Mapped[List["Classroom"]] = relationship(back_populates="course", cascade="all, delete-orphan")


class Classroom(UUIDPrimaryKeyMixin, TimeStampMixin, Base):
    __tablename__ = "classrooms"

    organisation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    course_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    code: Mapped[str] = mapped_column(String(50), unique=False, nullable=True, index=True)
    term: Mapped[str] = mapped_column(String(100), nullable=False, default="Fall 2026")
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    join_code: Mapped[Optional[str]] = mapped_column(String(16), unique=True, nullable=True, index=True)
    join_code_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    require_approval: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    allowed_divisions: Mapped[Optional[List[str]]] = mapped_column(JSON, nullable=True)
    allowed_batches: Mapped[Optional[List[str]]] = mapped_column(JSON, nullable=True)
    enrollment_format_hint: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    enrollment_pattern: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    exam_start_time: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    exam_end_time: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    is_exam_started: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    faculty_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Relationships
    course: Mapped[Optional["Course"]] = relationship(back_populates="classrooms")
    members: Mapped[List["ClassroomMember"]] = relationship(back_populates="classroom", cascade="all, delete-orphan")
    assignments: Mapped[List["Assignment"]] = relationship(back_populates="classroom", cascade="all, delete-orphan")
    audit_logs: Mapped[List["ClassroomAuditLog"]] = relationship(back_populates="classroom", cascade="all, delete-orphan")
    code_snapshots: Mapped[List["ClassroomCodeSnapshot"]] = relationship(back_populates="classroom", cascade="all, delete-orphan")


class ClassroomMember(UUIDPrimaryKeyMixin, TimeStampMixin, Base):
    __tablename__ = "classroom_members"
    __table_args__ = (
        UniqueConstraint("classroom_id", "user_id", name="uq_classroom_member_user"),
        UniqueConstraint("classroom_id", "enrollment_number", name="uq_classroom_member_enrollment"),
    )

    classroom_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("classrooms.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[ClassroomRole] = mapped_column(default=ClassroomRole.learner, nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="joined", nullable=False)
    full_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    enrollment_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    division: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    batch: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    exam_started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    time_extension_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_reopened: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    last_activity_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    classroom: Mapped["Classroom"] = relationship(back_populates="members")


class ClassroomAuditLog(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "classroom_audit_logs"

    classroom_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("classrooms.id", ondelete="CASCADE"), nullable=False, index=True
    )
    actor_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    target_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    details: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    classroom: Mapped["Classroom"] = relationship(back_populates="audit_logs")


class ClassroomCodeSnapshot(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "classroom_code_snapshots"

    classroom_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("classrooms.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    code: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    classroom: Mapped["Classroom"] = relationship(back_populates="code_snapshots")


class Assignment(UUIDPrimaryKeyMixin, TimeStampMixin, Base):
    __tablename__ = "assignments"

    organisation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    classroom_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("classrooms.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    dataset_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    due_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    rubric: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    max_score: Mapped[float] = mapped_column(Float, default=100.0, nullable=False)
    learning_aids_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )

    classroom: Mapped["Classroom"] = relationship(back_populates="assignments")
    submissions: Mapped[List["Submission"]] = relationship(back_populates="assignment", cascade="all, delete-orphan")


class Submission(UUIDPrimaryKeyMixin, TimeStampMixin, Base):
    __tablename__ = "submissions"

    organisation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    assignment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("assignments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    learner_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    experiment_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    model_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    pipeline_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    status: Mapped[SubmissionStatus] = mapped_column(default=SubmissionStatus.submitted, nullable=False)
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    reproducibility_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    metrics_summary: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)

    code_draft: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    active_deployment_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    version_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    grade_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    assignment: Mapped["Assignment"] = relationship(back_populates="submissions")
    feedbacks: Mapped[List["Feedback"]] = relationship(back_populates="submission", cascade="all, delete-orphan")


class Feedback(UUIDPrimaryKeyMixin, TimeStampMixin, Base):
    __tablename__ = "feedbacks"

    submission_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("submissions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    evaluator_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    score: Mapped[float] = mapped_column(Float, nullable=False)
    comments: Mapped[str] = mapped_column(Text, nullable=False)
    evaluated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    submission: Mapped["Submission"] = relationship(back_populates="feedbacks")
