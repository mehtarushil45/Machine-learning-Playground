"""Classroom, Course, Assignment, Submission, and Portfolio Pydantic Schemas.

Defines request payloads and response models for institutional learning workflows.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.classroom import ClassroomRole, SubmissionStatus


# ── Course Schemas ────────────────────────────────────────────────────────────

class CourseCreate(BaseModel):
    code: str = Field(..., example="CS401", description="Course code identifier")
    title: str = Field(..., example="Applied Machine Learning", description="Course title")
    description: Optional[str] = Field(None, description="Detailed course abstract")


class CourseResponse(BaseModel):
    id: UUID
    organisation_id: UUID
    code: str
    title: str
    description: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ── Classroom Schemas ─────────────────────────────────────────────────────────

class ClassroomCreate(BaseModel):
    course_id: UUID = Field(..., description="Target Course UUID")
    name: str = Field(..., example="Fall 2026 Batch A", description="Classroom batch name")
    code: str = Field(..., example="ML-2026-A", description="Unique classroom access code")
    term: str = Field("Fall 2026", description="Academic term or semester")


class ClassroomMemberAdd(BaseModel):
    user_id: UUID = Field(..., description="User UUID to add to classroom")
    role: ClassroomRole = Field(ClassroomRole.learner, description="Assigned classroom role")


class ClassroomResponse(BaseModel):
    id: UUID
    organisation_id: UUID
    course_id: UUID
    name: str
    code: str
    term: str
    faculty_id: UUID
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ── Assignment Schemas ────────────────────────────────────────────────────────

class AssignmentCreate(BaseModel):
    classroom_id: UUID = Field(..., description="Target Classroom UUID")
    title: str = Field(..., example="Lab 3: Binary Classification", description="Assignment title")
    description: str = Field(..., description="Assignment instructions & criteria")
    dataset_id: Optional[str] = Field(None, description="Attached dataset ID")
    due_date: Optional[datetime] = Field(None, description="Submission deadline")
    rubric: Optional[Dict[str, Any]] = Field(None, description="Evaluation rubric criteria")
    max_score: float = Field(100.0, ge=0.0, description="Maximum assignment score")


class AssignmentResponse(BaseModel):
    id: UUID
    organisation_id: UUID
    classroom_id: UUID
    title: str
    description: str
    dataset_id: Optional[str] = None
    due_date: Optional[datetime] = None
    rubric: Optional[Dict[str, Any]] = None
    max_score: float
    created_by_id: UUID
    created_at: datetime

    class Config:
        from_attributes = True


# ── Submission & Review Schemas ───────────────────────────────────────────────

class SubmissionCreate(BaseModel):
    assignment_id: UUID = Field(..., description="Target Assignment UUID")
    experiment_id: Optional[str] = Field(None, description="Submitted experiment UUID")
    model_id: Optional[str] = Field(None, description="Submitted model ID")
    pipeline_id: Optional[str] = Field(None, description="Submitted pipeline ID")


class FeedbackCreate(BaseModel):
    score: float = Field(..., ge=0.0, description="Evaluation score")
    comments: str = Field(..., description="Detailed faculty/reviewer feedback")


class SubmissionResponse(BaseModel):
    id: UUID
    organisation_id: UUID
    assignment_id: UUID
    learner_id: UUID
    experiment_id: Optional[str] = None
    model_id: Optional[str] = None
    pipeline_id: Optional[str] = None
    status: SubmissionStatus
    submitted_at: datetime
    reproducibility_verified: bool
    metrics_summary: Optional[Dict[str, Any]] = None

    class Config:
        from_attributes = True


# ── Portfolio Schemas ─────────────────────────────────────────────────────────

class PortfolioProjectCreate(BaseModel):
    submission_id: Optional[UUID] = Field(None, description="Approved submission UUID")
    title: str = Field(..., example="Customer Churn Predictor", description="Portfolio project title")
    description: str = Field(..., description="Project abstract and findings")
    model_id: Optional[str] = Field(None, description="Model ID")
    experiment_id: Optional[str] = Field(None, description="Experiment ID")
    is_public: bool = Field(True, description="Public shareable flag")


class PortfolioProjectResponse(BaseModel):
    id: UUID
    organisation_id: UUID
    user_id: UUID
    submission_id: Optional[UUID] = None
    title: str
    description: str
    model_id: Optional[str] = None
    experiment_id: Optional[str] = None
    is_public: bool
    certificate_qr_code: Optional[str] = None
    published_at: datetime

    class Config:
        from_attributes = True


# ── Reproducibility Audit Schemas ─────────────────────────────────────────────

class ReproducibilityAuditRequest(BaseModel):
    submission_id: UUID = Field(..., description="Target Submission UUID")
    tolerance: float = Field(0.005, ge=0.0, le=0.1, description="Allowed metric difference tolerance threshold")


class MetricDifference(BaseModel):
    metric_name: str = Field(..., description="Name of metric evaluated (e.g. 'accuracy', 'f1_score')")
    claimed_value: float = Field(..., description="Learner's submitted metric value")
    reproduced_value: float = Field(..., description="Re-executed worker metric value")
    difference: float = Field(..., description="Absolute metric difference")
    within_tolerance: bool = Field(..., description="True if difference <= tolerance")


class ReproducibilityReportResponse(BaseModel):
    submission_id: UUID = Field(..., description="Submission UUID analyzed")
    experiment_id: Optional[str] = Field(None, description="Experiment ID verified")
    is_reproducible: bool = Field(..., description="True if all metrics re-executed within tolerance")
    verification_status: str = Field(..., description="'VERIFIED_REPRODUCIBLE', 'METRIC_MISMATCH', or 'EXECUTION_FAILED'")
    claimed_metrics: Dict[str, float] = Field(default_factory=dict, description="Learner's claimed metrics")
    reproduced_metrics: Dict[str, float] = Field(default_factory=dict, description="Worker re-executed metrics")
    metric_differences: List[MetricDifference] = Field(default_factory=list, description="Per-metric difference audit list")
    audit_summary: str = Field(..., description="Summary explanation for faculty review")
    verified_at: str = Field(..., description="Timestamp of verification execution")
