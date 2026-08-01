"""Classroom, Course, Assignment, Submission, Feedback, and Portfolio domain models.

Implements multi-tenant educational practical workflow for MLPlayground:
  Course -> Classroom -> Assignment -> Submission -> Feedback -> PortfolioProject
"""

import enum
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, JSON
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
    course_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    term: Mapped[str] = mapped_column(String(100), nullable=False, default="Fall 2026")
    faculty_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Relationships
    course: Mapped["Course"] = relationship(back_populates="classrooms")
    members: Mapped[List["ClassroomMember"]] = relationship(back_populates="classroom", cascade="all, delete-orphan")
    assignments: Mapped[List["Assignment"]] = relationship(back_populates="classroom", cascade="all, delete-orphan")


class ClassroomMember(UUIDPrimaryKeyMixin, TimeStampMixin, Base):
    __tablename__ = "classroom_members"

    classroom_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("classrooms.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[ClassroomRole] = mapped_column(default=ClassroomRole.learner, nullable=False)
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    classroom: Mapped["Classroom"] = relationship(back_populates="members")


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

    assignment: Mapped["Assignment"] = relationship(back_populates="submissions")
    feedbacks: Mapped[List["Feedback"]] = relationship(back_populates="submission", cascade="all, delete-orphan")
    portfolio_project: Mapped[Optional["PortfolioProject"]] = relationship(back_populates="submission")


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


class PortfolioProject(UUIDPrimaryKeyMixin, TimeStampMixin, Base):
    __tablename__ = "portfolio_projects"

    organisation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    submission_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("submissions.id", ondelete="SET NULL"), nullable=True, unique=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    model_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    experiment_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_public: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    certificate_qr_code: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    published_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    submission: Mapped[Optional["Submission"]] = relationship(back_populates="portfolio_project")
