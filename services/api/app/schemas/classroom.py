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
    learning_aids_enabled: bool = Field(True, description="Whether heads-up mistake cards & learning aids are enabled")


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
    learning_aids_enabled: bool = True
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
    copilot_policy: str = Field("full", description="Copilot policy: off | explain-only | full")
    learning_aids_enabled: bool = Field(True, description="Whether learning aids/heads-up cards are enabled")
    open_time: Optional[datetime] = Field(None, description="Exam window open time")
    close_time: Optional[datetime] = Field(None, description="Exam window close deadline")
    is_closed: bool = Field(False, description="Whether exam is past close time")
    protected_regions: List[str] = Field(default_factory=list, description="Protected starter code snippets")


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
    is_locked: bool = False
    submission_receipt: Optional[Dict[str, Any]] = None


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
    hint: Optional[str] = None


class LabEvaluateResponse(BaseModel):
    """Automated benchmark test results."""
    score: float
    max_score: float
    percentage: float
    passed: bool
    criteria_results: List[RubricCriterionResult]
    summary: str
    guardrail_warnings: List[str] = Field(default_factory=list)
    latency_method: str = "Warm-up (2 calls) + Median of 5 serving process calls"


class LabSubmitRequest(BaseModel):
    """Final submission of student lab exam."""
    code: Optional[str] = None
    deployment_id: Optional[str] = None


class LabSubmitResponse(BaseModel):
    """Confirmation of locked exam submission."""
    submission_id: str
    status: str
    grade_score: float
    percentage: float
    passed: bool
    submitted_at: str
    code_sha256: str
    model_sha256: Optional[str] = None
    rubric_snapshot: Optional[Any] = None
    reproducibility_verified: bool = False
    guardrail_flags: List[str] = Field(default_factory=list)
    message: str


# ── Student Draft & Integrity Schemas ────────────────────────────────────────

class StudentDraftRequest(BaseModel):
    code: str = Field(..., description="Draft Python source code")


class StudentDraftResponse(BaseModel):
    exam_id: str
    student_id: str
    saved_at: str
    code_length: int
    message: str


class CopilotProxyRequest(BaseModel):
    prompt: str = Field(..., description="Student query to Copilot")
    code_context: Optional[str] = Field(None, description="Current student editor code context")


class CopilotProxyResponse(BaseModel):
    reply: str
    policy: str
    allowed: bool


# ── Instructor Dashboard & Grading Schemas ───────────────────────────────────

class ClassroomInviteRequest(BaseModel):
    email: Optional[str] = Field(None, description="Student email to invite")
    invite_code: Optional[str] = Field(None, description="Classroom join code")
    role: ClassroomRole = Field(ClassroomRole.learner, description="Role")


class ClassroomRosterMember(BaseModel):
    user_id: UUID
    email: str
    full_name: Optional[str] = None
    role: ClassroomRole
    joined_at: datetime


class SubmissionDashboardItem(BaseModel):
    submission_id: str
    learner_id: str
    learner_name: str
    learner_email: str
    status: str
    grade_score: Optional[float] = None
    submitted_at: Optional[str] = None
    reproducibility_verified: bool = False
    code_sha256: Optional[str] = None
    model_sha256: Optional[str] = None
    guardrail_flags: List[str] = Field(default_factory=list)
    code_snippet: Optional[str] = None


class ReproduceAuditResponse(BaseModel):
    submission_id: str
    original_score: float
    reproduced_score: float
    tolerance: float = 0.05
    verified: bool
    reproduced_metrics: Dict[str, Any] = Field(default_factory=dict)
    details: str


class ManualGradeRequest(BaseModel):
    score: float = Field(..., ge=0.0, le=100.0, description="Manual adjusted score")
    comments: str = Field(..., description="Instructor feedback comments")


class AssignmentTemplateCreate(BaseModel):
    title: str
    description: str
    problem_type: str = "classification"
    dataset_name: str
    dataset_id: str
    target_column: str
    feature_columns: List[str] = Field(default_factory=list)
    starter_code: str
    rubric: Dict[str, Any]
    copilot_policy: str = "full"


# ── Entry, Join, Details, Lobby & Roster Schemas ───────────────────────────────

class ClassroomCreateEnhanced(BaseModel):
    name: str = Field(..., min_length=2, max_length=255, description="Classroom name")
    course_id: Optional[UUID] = Field(None, description="Optional Course UUID")
    description: Optional[str] = Field(None, max_length=2000, description="Optional description")
    term: str = Field("Fall 2026", max_length=100)
    require_approval: bool = Field(False, description="Require instructor approval to join")
    allowed_divisions: Optional[List[str]] = Field(None, description="Pre-configured division list")
    allowed_batches: Optional[List[str]] = Field(None, description="Pre-configured batch list")
    enrollment_format_hint: Optional[str] = Field(None, max_length=255, description="Enrollment number format hint")
    enrollment_pattern: Optional[str] = Field(None, max_length=255, description="Regex pattern for enrollment number")
    exam_start_time: Optional[datetime] = None
    exam_end_time: Optional[datetime] = None
    assignment_id: Optional[UUID] = None
    exam_template_id: Optional[str] = None


class ClassroomSummary(BaseModel):
    id: UUID
    name: str
    description: Optional[str] = None
    term: str
    join_code: Optional[str] = None
    join_code_active: bool = True
    require_approval: bool = False
    role: str
    status: str
    is_owner: bool
    is_exam_started: bool
    exam_start_time: Optional[datetime] = None
    exam_end_time: Optional[datetime] = None
    created_at: datetime
    member_count: int = 0
    assignment_title: Optional[str] = None


class MyClassroomsResponse(BaseModel):
    owned: List[ClassroomSummary]
    joined: List[ClassroomSummary]
    active_exam_resume: Optional[Dict[str, Any]] = None


class JoinPreviewResponse(BaseModel):
    classroom_id: UUID
    name: str
    owner_name: str
    term: str
    description: Optional[str] = None
    require_approval: bool = False
    allowed_divisions: Optional[List[str]] = None
    allowed_batches: Optional[List[str]] = None
    enrollment_format_hint: Optional[str] = None


class JoinClassroomRequest(BaseModel):
    code: str = Field(..., min_length=1, max_length=32, description="Join code")


class JoinClassroomResponse(BaseModel):
    classroom_id: UUID
    status: str
    require_approval: bool
    message: str


class SaveMemberDetailsRequest(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=255)
    enrollment_number: str = Field(..., min_length=1, max_length=100)
    division: str = Field(..., min_length=1, max_length=50)
    batch: str = Field(..., min_length=1, max_length=50)


class MemberDetailsResponse(BaseModel):
    classroom_id: UUID
    user_id: UUID
    full_name: str
    enrollment_number: str
    division: str
    batch: str
    status: str
    can_edit: bool


class ExamLobbyResponse(BaseModel):
    classroom_id: UUID
    classroom_name: str
    is_exam_started: bool
    exam_start_time: Optional[datetime] = None
    exam_end_time: Optional[datetime] = None
    server_time: datetime
    student_status: str
    time_remaining_seconds: Optional[int] = None
    can_enter_workspace: bool = False


class RosterMemberItem(BaseModel):
    id: UUID
    user_id: UUID
    full_name: Optional[str] = None
    enrollment_number: Optional[str] = None
    division: Optional[str] = None
    batch: Optional[str] = None
    role: str
    status: str
    score: Optional[float] = None
    submission_time: Optional[datetime] = None
    last_activity: Optional[datetime] = None
    joined_at: datetime
    has_submission: bool = False
    submission_id: Optional[UUID] = None


class RosterPaginationResponse(BaseModel):
    items: List[RosterMemberItem]
    total: int
    page: int
    page_size: int
    total_pages: int


class ParticipantInspectionResponse(BaseModel):
    user_id: UUID
    full_name: Optional[str] = None
    enrollment_number: Optional[str] = None
    division: Optional[str] = None
    batch: Optional[str] = None
    status: str
    grade_score: Optional[float] = None
    final_code: Optional[str] = None
    starter_code: Optional[str] = None
    rubric_breakdown: Optional[Dict[str, Any]] = None
    metrics_summary: Optional[Dict[str, Any]] = None
    timeline: List[Dict[str, Any]] = Field(default_factory=list)
    reproducibility_verified: bool = False
    submission_id: Optional[UUID] = None
    comments: Optional[str] = None


class TimeExtensionRequest(BaseModel):
    extension_minutes: int = Field(..., ge=1, le=240, description="Minutes to extend exam")


class ReopenSubmissionRequest(BaseModel):
    reason: Optional[str] = Field(None, max_length=500)


class ApprovalActionRequest(BaseModel):
    action: str = Field(..., pattern="^(approve|decline)$")


