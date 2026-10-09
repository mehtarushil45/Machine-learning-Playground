"""Student Learning Layer Router.

Provides endpoints for:
- Part C: Guided Lesson Path & student progress persistence
- Part D: Pitfall datasets catalog ("Start with a story") & story loading
- Part F: Minimal, private pilot telemetry signals
- Part B: Server-side AST preprocessing leakage checks
"""

from __future__ import annotations

import json
import logging
import os
import shutil
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import OptionalCurrentUser, get_db
from app.services.learning_rules import (
    compute_baseline_metric,
    compute_wilson_interval,
    detect_preprocessing_leakage_ast,
)

logger = logging.getLogger("apex_learning.router")
router = APIRouter(prefix="/learning", tags=["Learning Layer"])

LESSONS_FILE = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "content", "lessons", "lessons.json")
)
STORIES_CATALOG_FILE = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "uploads", "pitfalls", "catalog.json")
)
STORIES_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "uploads", "pitfalls")
)
PROJECT_UPLOADS_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "uploads")
)

# In-memory student progress storage (keyed by f"{student_id}:{lesson_id}")
# In multi-tenant, persistable or cached per student
_STUDENT_LESSON_PROGRESS: Dict[str, Dict[str, Any]] = {}

# Minimal private pilot telemetry event log
_PILOT_SIGNALS_LOG: List[Dict[str, Any]] = []


def _resolve_student_id(request: Request, current_user: OptionalCurrentUser) -> str:
    """Resolve student identifier safely from auth or client headers."""
    if current_user and getattr(current_user, "id", None):
        return str(current_user.id)
    if request:
        return (
            request.headers.get("x-user-id")
            or request.headers.get("x-student-id")
            or "pilot-student-01"
        )
    return "pilot-student-01"


# --- Schemas ---

class LessonCheckDetails(BaseModel):
    metric: Optional[str] = None
    description: Optional[str] = None
    question: Optional[str] = None
    options: Optional[List[str]] = None
    correct_index: Optional[int] = None
    explanation: Optional[str] = None


class LessonItem(BaseModel):
    id: str
    number: int
    title: str
    page_route: str
    goal: str
    short_explanation: str
    task: str
    check_type: str
    check_details: Dict[str, Any]
    why_it_matters: str
    primary_source: str
    needs_instructor_review: bool = True


class CompleteLessonRequest(BaseModel):
    selected_option: Optional[int] = None
    platform_state_evidence: Optional[Dict[str, Any]] = None


class LessonProgressResponse(BaseModel):
    student_id: str
    completed_lessons: List[str]
    last_updated: str


class InstructorProgressSummary(BaseModel):
    total_students_active: int
    lesson_completion_counts: Dict[str, int]


class PilotSignalRequest(BaseModel):
    event_type: str = Field(..., description="lesson_started | lesson_completed | card_shown | card_dismissed | learning_mode_toggled")
    lesson_id: Optional[str] = None
    card_id: Optional[str] = None
    learning_mode_enabled: Optional[bool] = None
    context_page: Optional[str] = None


class CodeLintRequest(BaseModel):
    code: str = Field(..., description="Python student pipeline code to inspect for AST preprocessing leakage")


# --- Endpoints ---

@router.get("/lessons", response_model=List[LessonItem], summary="Get guided lesson catalog")
async def get_lessons() -> List[LessonItem]:
    """Retrieve the 10 guided ML lessons with primary sources and honest checks."""
    if not os.path.exists(LESSONS_FILE):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lesson content file not found.")
    try:
        with open(LESSONS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            return [LessonItem(**item) for item in data]
    except Exception as exc:
        logger.error("Failed to read lessons file: %s", exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Unable to load lessons.")


@router.get("/progress", response_model=LessonProgressResponse, summary="Get student lesson progress")
async def get_student_progress(
    request: Request,
    current_user: OptionalCurrentUser = None,
) -> LessonProgressResponse:
    """Retrieve list of completed lesson IDs for active student."""
    student_id = _resolve_student_id(request, current_user)
    completed: List[str] = []
    prefix = f"{student_id}:"
    for key, val in _STUDENT_LESSON_PROGRESS.items():
        if key.startswith(prefix) and val.get("completed"):
            completed.append(val.get("lesson_id", key.split(":", 1)[1]))
    return LessonProgressResponse(
        student_id=student_id,
        completed_lessons=sorted(completed),
        last_updated=datetime.now(timezone.utc).isoformat(),
    )


@router.post("/progress/{lesson_id}", response_model=Dict[str, Any], summary="Complete a lesson with check validation")
async def complete_lesson(
    lesson_id: str,
    payload: CompleteLessonRequest,
    request: Request,
    current_user: OptionalCurrentUser = None,
) -> Dict[str, Any]:
    """Complete a lesson only if the required check (knowledge question or platform state) passes."""
    student_id = _resolve_student_id(request, current_user)

    # Read lessons file to get check details
    if not os.path.exists(LESSONS_FILE):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lesson file missing.")
    with open(LESSONS_FILE, "r", encoding="utf-8") as f:
        lessons = json.load(f)

    target_lesson = next((item for item in lessons if item["id"] == lesson_id), None)
    if not target_lesson:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Lesson '{lesson_id}' not found.")

    check_type = target_lesson.get("check_type")
    check_details = target_lesson.get("check_details", {})

    if check_type == "knowledge_check":
        correct_idx = check_details.get("correct_index")
        if payload.selected_option is None or payload.selected_option != correct_idx:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Incorrect answer. Review the explanation: {check_details.get('explanation')}",
            )
    elif check_type == "platform_state":
        # Honest platform state check: client must present non-empty evidence
        evidence = payload.platform_state_evidence or {}
        if not evidence.get("verified", False):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Platform task verification requirement not satisfied: {check_details.get('description')}",
            )

    key = f"{student_id}:{lesson_id}"
    now_iso = datetime.now(timezone.utc).isoformat()
    _STUDENT_LESSON_PROGRESS[key] = {
        "student_id": student_id,
        "lesson_id": lesson_id,
        "completed": True,
        "completed_at": now_iso,
    }

    # Record telemetry signal
    _PILOT_SIGNALS_LOG.append({
        "timestamp": now_iso,
        "student_id": student_id,
        "event_type": "lesson_completed",
        "lesson_id": lesson_id,
    })

    return {
        "status": "success",
        "lesson_id": lesson_id,
        "message": f"Lesson '{target_lesson['title']}' completed successfully.",
        "completed_at": now_iso,
    }


@router.get("/progress/instructor-summary", response_model=InstructorProgressSummary, summary="Instructor progress view (C4)")
async def get_instructor_summary() -> InstructorProgressSummary:
    """Read-only minimal completion counts for Classroom instructor view."""
    students = set()
    counts: Dict[str, int] = {}

    for val in _STUDENT_LESSON_PROGRESS.values():
        if val.get("completed"):
            sid = val.get("student_id")
            lid = val.get("lesson_id")
            if sid:
                students.add(sid)
            if lid:
                counts[lid] = counts.get(lid, 0) + 1

    return InstructorProgressSummary(
        total_students_active=len(students),
        lesson_completion_counts=counts,
    )


@router.post("/signals", response_model=Dict[str, Any], summary="Log minimal private pilot telemetry (Part F)")
async def log_pilot_signal(
    payload: PilotSignalRequest,
    request: Request,
    current_user: OptionalCurrentUser = None,
) -> Dict[str, Any]:
    """Log minimal student struggle indicators without ever capturing code or dataset contents."""
    student_id = _resolve_student_id(request, current_user)
    now_iso = datetime.now(timezone.utc).isoformat()

    entry = {
        "timestamp": now_iso,
        "student_id": student_id,
        "event_type": payload.event_type,
        "lesson_id": payload.lesson_id,
        "card_id": payload.card_id,
        "learning_mode_enabled": payload.learning_mode_enabled,
        "context_page": payload.context_page,
    }
    _PILOT_SIGNALS_LOG.append(entry)

    logger.info("Pilot signal: student=%s event=%s card=%s lesson=%s", student_id, payload.event_type, payload.card_id, payload.lesson_id)
    return {"status": "recorded", "timestamp": now_iso}


@router.post("/code-lint", response_model=Dict[str, Any], summary="AST preprocessing leakage code audit (B7)")
async def audit_code_preprocessing(payload: CodeLintRequest) -> Dict[str, Any]:
    """Inspect Python code for preprocessing leakage using AST before training/submission."""
    diagnosis = detect_preprocessing_leakage_ast(payload.code)
    return diagnosis


# --- Pitfall Dataset Catalog Endpoints (Part D) ---

@router.get("/stories", response_model=List[Dict[str, Any]], summary="Get pitfall dataset stories (Part D)")
async def get_pitfall_stories() -> List[Dict[str, Any]]:
    """Retrieve catalog of synthetic pitfall datasets with educational stories, hints, and reveals."""
    if not os.path.exists(STORIES_CATALOG_FILE):
        return []
    try:
        with open(STORIES_CATALOG_FILE, "r", encoding="utf-8") as f:
            catalog = json.load(f)
            return catalog
    except Exception as e:
        logger.error("Failed to read stories catalog: %s", e)
        return []


@router.post("/stories/{story_id}/load", response_model=Dict[str, Any], summary="Load story dataset into workspace")
async def load_story_dataset(story_id: str) -> Dict[str, Any]:
    """Copy a pitfall story dataset into the active uploads directory so student can profile/train immediately."""
    if not os.path.exists(STORIES_CATALOG_FILE):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stories catalog missing.")

    with open(STORIES_CATALOG_FILE, "r", encoding="utf-8") as f:
        catalog = json.load(f)

    target_story = next((s for s in catalog if s["id"] == story_id), None)
    if not target_story:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Story dataset '{story_id}' not found.")

    src_path = os.path.join(STORIES_DIR, target_story["filename"])
    if not os.path.exists(src_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Dataset file '{target_story['filename']}' not found.")

    os.makedirs(PROJECT_UPLOADS_DIR, exist_ok=True)
    dest_path = os.path.join(PROJECT_UPLOADS_DIR, target_story["filename"])
    shutil.copyfile(src_path, dest_path)

    return {
        "status": "ready",
        "dataset_id": target_story["filename"],
        "filename": target_story["filename"],
        "title": target_story["title"],
        "target": target_story["target"],
        "problem_type": target_story["problem_type"],
        "hint": target_story["hint"],
        "reveal": target_story["reveal"],
        "row_count": target_story["row_count"],
        "columns": target_story["columns"],
    }
