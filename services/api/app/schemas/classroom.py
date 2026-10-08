"""Classroom, Lab Exam, Code Deployment, and Evaluation Pydantic Schemas.

Defines request payloads and response models for university ML practical lab exams.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.classroom import ClassroomRole, SubmissionStatus


# ── Course & Classroom Schemas ───────────────────────────────────────────────

class CourseCreate(BaseModel):
    code: str = Field(..., examples=["CS401"], description="Course code identifier")
    title: str = Field(..., examples=["Applied Machine Learning"], description="Course title")
    description: Optional[str] = Field(None, description="Detailed course abstract")


class CourseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organisation_id: UUID
    code: str
    title: str
    description: Optional[str] = None
    created_at: datetime


class ClassroomCreate(BaseModel):
    course_id: UUID = Field(..., description="Target Course UUID")
    name: str = Field(..., examples=["Fall 2026 Batch A"], description="Classroom batch name")
    code: str = Field(..., examples=["ML-2026-A"], description="Unique classroom access code")
    term: str = Field("Fall 2026", description="Academic term or semester")


class ClassroomMemberAdd(BaseModel):
    user_id: UUID = Field(..., description="User UUID to add to classroom")
    role: ClassroomRole = Field(ClassroomRole.learner, description="Assigned classroom role")


class ClassroomResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organisation_id: UUID
    course_id: UUID
    name: str
    code: str
    term: str
    faculty_id: UUID
    is_active: bool
    created_at: datetime


class AssignmentCreate(BaseModel):
    classroom_id: UUID = Field(..., description="Target Classroom UUID")
    title: str = Field(..., examples=["Lab 3: Binary Classification"], description="Assignment title")
    description: str = Field(..., description="Assignment instructions & criteria")
    dataset_id: Optional[str] = Field(None, description="Attached dataset ID")
    due_date: Optional[datetime] = Field(None, description="Submission deadline")
    rubric: Optional[Dict[str, Any]] = Field(None, description="Evaluation rubric criteria")
    max_score: float = Field(100.0, ge=0.0, description="Maximum assignment score")


class AssignmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

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


class SubmissionCreate(BaseModel):
    assignment_id: UUID = Field(..., description="Target Assignment UUID")
    experiment_id: Optional[str] = Field(None, description="Submitted experiment UUID")
    model_id: Optional[str] = Field(None, description="Submitted model ID")
    pipeline_id: Optional[str] = Field(None, description="Submitted pipeline ID")
    code_draft: Optional[str] = Field(None, description="Student code draft")
    active_deployment_id: Optional[str] = Field(None, description="Student deployed model endpoint")


class FeedbackCreate(BaseModel):
    score: float = Field(..., ge=0.0, description="Evaluation score")
    comments: str = Field(..., description="Detailed faculty/reviewer feedback")


class SubmissionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organisation_id: UUID
    assignment_id: UUID
    learner_id: UUID
    experiment_id: Optional[str] = None
    model_id: Optional[str] = None
    pipeline_id: Optional[str] = None
    code_draft: Optional[str] = None
    active_deployment_id: Optional[str] = None
    version_count: int = 1
    grade_score: Optional[float] = None
    status: SubmissionStatus
    submitted_at: datetime
    reproducibility_verified: bool
    metrics_summary: Optional[Dict[str, Any]] = None


# ── University Lab Exam Schemas ──────────────────────────────────────────────

class LabExamInfo(BaseModel):
    """University Practical ML Lab Exam definition."""
    id: str = Field(..., description="Exam identifier")
    title: str = Field(..., description="Exam title")
    course_code: str = Field("CS401", description="Course code")
    duration_minutes: int = Field(90, description="Exam allotted time in minutes")
    problem_type: str = Field("classification", description="Problem type (classification | regression)")
    dataset_name: str = Field(..., description="Dataset file name")
    dataset_id: str = Field(..., description="Dataset ID")
    target_column: str = Field(..., description="Target column to predict")
    feature_columns: List[str] = Field(default_factory=list, description="Expected feature columns")
    description: str = Field(..., description="Detailed lab problem statement")
    rubric: Dict[str, Any] = Field(default_factory=dict, description="Grading rubric thresholds")
    starter_code: str = Field(..., description="Python starter code for student")


class LabExamSessionResponse(BaseModel):
    """Active student exam session state."""
    exam_id: str
    student_id: str
    active_deployment_id: Optional[str] = None
    code_draft: Optional[str] = None
    version_count: int = 1
    status: str = "IN_PROGRESS"
    grade_score: Optional[float] = None
    submitted_at: Optional[str] = None


class LabDeployRequest(BaseModel):
    """Deploy / redeploy model from lab exam code execution."""
    model_id: Optional[str] = Field(None, description="Registered model ID from code execution")
    code: Optional[str] = Field(None, description="Current student Python code")
    name: Optional[str] = Field(None, description="Deployment slot display name")


class LabDeployResponse(BaseModel):
    """Result of deploying or in-place updating a lab model."""
    deployment_id: str
    model_id: str
    model_version: str
    is_updated_in_place: bool
    status: str
    endpoint_path: str
    sample_inputs: Dict[str, Any] = Field(default_factory=dict)
    input_schema: Dict[str, Any] = Field(default_factory=dict)
    metrics: Dict[str, float] = Field(default_factory=dict)
    version_count: int = 1
    logs: List[Dict[str, Any]] = Field(default_factory=list)


class LabEvaluateRequest(BaseModel):
    """Request automated grading evaluation against lab test rubric."""
    deployment_id: str


class RubricCriterionResult(BaseModel):
    criterion: str
    description: str
    target: str
    actual: str
    passed: bool
    points_awarded: float
    max_points: float


class LabEvaluateResponse(BaseModel):
    """Automated benchmark test results."""
    score: float
    max_score: float
    percentage: float
    passed: bool
    criteria_results: List[RubricCriterionResult]
    summary: str


class LabSubmitRequest(BaseModel):
    """Final submission of student lab exam."""
    code: str
    deployment_id: Optional[str] = None


class LabSubmitResponse(BaseModel):
    """Confirmation of locked exam submission."""
    submission_id: str
    status: str
    grade_score: float
    percentage: float
    passed: bool
    submitted_at: str
    message: str
