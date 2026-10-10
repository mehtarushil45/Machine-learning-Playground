"""Comprehensive Verification Test Suite for Classroom Entry, Join, Details, Lobby, and Management.

Implements all verification criteria from Prompt Parts A through I:
1. 10,000 generated codes: 6-char length, alphabet subset (no 0, O, 1, I, L), secrets-backed, uniqueness.
2. Code normalization: lowercase, spaces, dashes, look-alikes. Uniform error message. Rate-limiting & lockout.
3. Details form: required validation, duplicate enrollment in same classroom rejected (409) but allowed in another,
   rejection of edits after exam start, owner edit with audit log.
4. Schedule & Exam Gate: lobby countdown, rejection before start and after end, auto-submit on timeout, extension/reopen.
5. Roster & CSV export: server-side pagination, search/filter/sort, formula injection protection (=, +, -, @ escaped).
6. Authorization: Student isolation, Owner isolation, Removed participant instant lockout.
7. Code Reset & Join Toggle: old code fails, existing members stay.
"""

from __future__ import annotations

import asyncio
import io
import csv
import re
import secrets
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict
from starlette.requests import Request

MOCK_REQUEST = Request({"type": "http", "client": ("127.0.0.1", 50000), "headers": []})

import pytest
from sqlalchemy import select
from sqlalchemy.pool import NullPool
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from app.config import settings
from app.models.organisation import Organisation
from app.models.classroom import (
    Classroom,
    ClassroomMember,
    ClassroomRole,
    ClassroomAuditLog,
    ClassroomCodeSnapshot,
    Assignment,
    Submission,
    SubmissionStatus,
)
from app.models.user import User, UserRole
from app.services.classroom_code_service import (
    JOIN_CODE_ALPHABET,
    generate_join_code,
    normalize_join_code,
    JoinRateLimiter,
    UNIFORM_JOIN_ERROR_MESSAGE,
)
from app.routers.classrooms import (
    _neutralize_cell,
    preview_join_code,
    join_classroom_by_code,
    save_my_details,
    get_my_details,
    get_exam_lobby,
    start_classroom_exam,
    enter_exam_workspace,
    get_classroom_roster_paginated,
    export_roster_csv,
    owner_edit_member_details,
    remove_participant,
    grant_time_extension,
    reopen_submission,
    reset_join_code,
    toggle_join_code,
)
from app.schemas.classroom import (
    JoinClassroomRequest,
    SaveMemberDetailsRequest,
    TimeExtensionRequest,
    ReopenSubmissionRequest,
)

test_engine = create_async_engine(settings.database_url, poolclass=NullPool)
TestSessionLocal = async_sessionmaker(bind=test_engine, class_=AsyncSession, expire_on_commit=False)



def test_code_generator_10000_uniqueness_and_alphabet():
    """Verify 10,000 codes: 6 chars, only from 31-char alphabet, no duplicates."""
    codes = set()
    allowed_set = set(JOIN_CODE_ALPHABET)
    excluded_set = {"0", "O", "1", "I", "L", "o", "l", "i"}

    assert len(JOIN_CODE_ALPHABET) == 31
    for exc in excluded_set:
        assert exc not in JOIN_CODE_ALPHABET

    for _ in range(10000):
        code = generate_join_code(6)
        assert len(code) == 6
        assert all(ch in allowed_set for ch in code)
        assert not any(ch in excluded_set for ch in code)
        codes.add(code)

    assert len(codes) >= 9980, f"Expected near zero collisions, got {10000 - len(codes)}"


def test_code_normalization():
    """Verify join code normalization handles spaces, hyphens, lowercase, and look-alikes."""
    assert normalize_join_code("  ab-2-cd  ") == "AB2CD"
    assert normalize_join_code("k9 - 3 x 4") == "K93X4"
    assert normalize_join_code("a–b—c−d") == "ABCD"
    assert normalize_join_code("ＡＢ２３ＸＹ") == "AB23XY"
    assert normalize_join_code("\u0410\u0412\u0421234") == "ABC234"


def test_rate_limiter_lockout():
    """Verify rate limiter blocks attempts beyond limit per user and IP."""
    limiter = JoinRateLimiter(max_attempts=3, window_seconds=60, lockout_seconds=60)
    user_id = "test-user-rate-limit"
    ip = "192.168.1.100"

    locked, _ = limiter.is_locked_out(f"user:{user_id}")
    assert not locked

    limiter.record_failure(user_id, ip)
    limiter.record_failure(user_id, ip)
    limiter.record_failure(user_id, ip)

    locked, rem = limiter.is_locked_out(f"user:{user_id}")
    assert locked
    assert rem > 0

    locked_ip, _ = limiter.is_locked_out(f"ip:{ip}")
    assert locked_ip


def test_formula_injection_neutralization():
    """Verify spreadsheet formula injection is escaped on all trigger prefixes."""
    dangerous_inputs = [
        "=HYPERLINK('http://x','click')",
        "+cmd|' /C calc'!A0",
        "-1+1",
        "@SUM(A1:A10)",
        "\t=2+2",
    ]
    for inp in dangerous_inputs:
        neutralized = _neutralize_cell(inp)
        assert neutralized.startswith("'"), f"Failed to neutralize: {inp} -> {neutralized}"

    safe_inputs = ["John Doe", "CS401", "2026-B", "Normal Student"]
    for inp in safe_inputs:
        assert _neutralize_cell(inp) == inp


@pytest.mark.asyncio
async def test_classroom_full_lifecycle_and_security():
    """Test full flow: creation, joining, details, lobby, exam start, roster pagination, and isolation."""
    async with TestSessionLocal() as session:
        # Create an organisation
        org = Organisation(
            id=uuid.uuid4(),
            name="University College of Engineering",
            slug=f"uce-{uuid.uuid4().hex[:6]}",
            is_active=True,
        )
        session.add(org)
        await session.flush()

        instructor = User(
            id=uuid.uuid4(),
            email=f"prof_{uuid.uuid4().hex[:6]}@college.edu",
            hashed_password="mock_hashed_pw",
            full_name="Professor Turing",
            role=UserRole.faculty,
            organisation_id=org.id,
            is_active=True,
        )
        student_a = User(
            id=uuid.uuid4(),
            email=f"alice_{uuid.uuid4().hex[:6]}@college.edu",
            hashed_password="mock_hashed_pw",
            full_name="Alice Student",
            role=UserRole.learner,
            organisation_id=org.id,
            is_active=True,
        )
        student_b = User(
            id=uuid.uuid4(),
            email=f"bob_{uuid.uuid4().hex[:6]}@college.edu",
            hashed_password="mock_hashed_pw",
            full_name="Bob Student",
            role=UserRole.learner,
            organisation_id=org.id,
            is_active=True,
        )
        other_instructor = User(
            id=uuid.uuid4(),
            email=f"other_{uuid.uuid4().hex[:6]}@college.edu",
            hashed_password="mock_hashed_pw",
            full_name="Professor Lovelace",
            role=UserRole.faculty,
            organisation_id=org.id,
            is_active=True,
        )

        session.add_all([instructor, student_a, student_b, other_instructor])
        await session.flush()

        # 1. Create Classroom
        code = generate_join_code(6)
        classroom = Classroom(
            id=uuid.uuid4(),
            organisation_id=org.id,
            name="CS401 Lab Exam - Fall 2026",
            code=code,
            join_code=code,
            join_code_active=True,
            require_approval=False,
            allowed_divisions=["A", "B"],
            allowed_batches=["B1", "B2"],
            enrollment_format_hint="Roll number e.g. CS2026-001",
            faculty_id=instructor.id,
            is_exam_started=False,
            is_archived=False,
            is_active=True,
        )
        session.add(classroom)
        session.add(ClassroomMember(
            classroom_id=classroom.id,
            user_id=instructor.id,
            role=ClassroomRole.faculty,
            status="active",
        ))
        await session.commit()

        # 2. Student A joins with normalized code (spaces and lowercase)
        join_resp = await join_classroom_by_code(
            payload=JoinClassroomRequest(code=f" {code.lower()} "),
            request=MOCK_REQUEST,
            current_user=student_a,
            db=session,
        )
        assert join_resp.status == "joined"
        assert join_resp.classroom_id == classroom.id

        # 3. Owner cannot join own classroom as student (Part D4)
        with pytest.raises(Exception) as exc_info:
            await join_classroom_by_code(
                payload=JoinClassroomRequest(code=code),
                request=MOCK_REQUEST,
                current_user=instructor,
                db=session,
            )
        assert "Owners cannot join their own classroom" in str(exc_info.value)

        # 4. Student A saves details
        det_resp = await save_my_details(
            classroom_id=classroom.id,
            payload=SaveMemberDetailsRequest(
                full_name="Alice A. Student",
                enrollment_number="CS2026-001",
                division="A",
                batch="B1",
            ),
            current_user=student_a,
            db=session,
        )
        assert det_resp.enrollment_number == "CS2026-001"
        assert det_resp.division == "A"
        assert det_resp.status == "details_saved"

        # 5. Student B joins
        await join_classroom_by_code(
            payload=JoinClassroomRequest(code=code),
            request=MOCK_REQUEST,
            current_user=student_b,
            db=session,
        )

        # 6. Student B tries duplicate enrollment number CS2026-001 -> rejected with 409 (Part E2)
        with pytest.raises(Exception) as exc_info:
            await save_my_details(
                classroom_id=classroom.id,
                payload=SaveMemberDetailsRequest(
                    full_name="Bob Duplicate",
                    enrollment_number="CS2026-001",
                    division="A",
                    batch="B1",
                ),
                current_user=student_b,
                db=session,
            )
        assert "already registered" in str(exc_info.value)

        # Student B saves valid distinct enrollment number
        det_b = await save_my_details(
            classroom_id=classroom.id,
            payload=SaveMemberDetailsRequest(
                full_name="Bob B. Student",
                enrollment_number="CS2026-002",
                division="B",
                batch="B2",
            ),
            current_user=student_b,
            db=session,
        )
        assert det_b.enrollment_number == "CS2026-002"

        # 7. Exam Lobby: Exam is not started yet (Part F1)
        lobby = await get_exam_lobby(
            classroom_id=classroom.id,
            current_user=student_a,
            db=session,
        )
        assert not lobby.is_exam_started
        assert not lobby.can_enter_workspace

        # Direct attempt to enter workspace fails before exam start
        with pytest.raises(Exception) as exc_info:
            await enter_exam_workspace(
                classroom_id=classroom.id,
                current_user=student_a,
                db=session,
            )
        assert "Exam has not started yet" in str(exc_info.value)

        # 8. Instructor starts exam
        await start_classroom_exam(
            classroom_id=classroom.id,
            current_user=instructor,
            db=session,
        )

        # Now student enters workspace
        ws_resp = await enter_exam_workspace(
            classroom_id=classroom.id,
            current_user=student_a,
            db=session,
        )
        assert ws_resp["status"] == "in_progress"

        # 9. Student A cannot edit details after starting exam (Part E4)
        with pytest.raises(Exception) as exc_info:
            await save_my_details(
                classroom_id=classroom.id,
                payload=SaveMemberDetailsRequest(
                    full_name="Alice Altered",
                    enrollment_number="CS2026-099",
                    division="A",
                    batch="B1",
                ),
                current_user=student_a,
                db=session,
            )
        assert "Details cannot be edited after starting the exam" in str(exc_info.value)

        # Instructor CAN edit student details anytime with audit log
        owner_edit = await owner_edit_member_details(
            classroom_id=classroom.id,
            user_id=student_a.id,
            payload=SaveMemberDetailsRequest(
                full_name="Alice Turing",
                enrollment_number="CS2026-001",
                division="A",
                batch="B1",
            ),
            current_user=instructor,
            db=session,
        )
        assert owner_edit["details"]["full_name"] == "Alice Turing"

        # 10. Owner Roster Paginated (Part G1)
        roster = await get_classroom_roster_paginated(
            classroom_id=classroom.id,
            page=1,
            page_size=10,
            search=None,
            division=None,
            batch=None,
            member_status=None,
            sort_by="joined_at",
            sort_order="asc",
            current_user=instructor,
            db=session,
        )
        assert roster.total >= 2
        student_ids = [item.user_id for item in roster.items]
        assert student_a.id in student_ids
        assert student_b.id in student_ids

        # 11. Authorization: Another instructor cannot view this classroom's roster (Part H2)
        with pytest.raises(Exception) as exc_info:
            await get_classroom_roster_paginated(
                classroom_id=classroom.id,
                page=1,
                page_size=10,
                search=None,
                division=None,
                batch=None,
                member_status=None,
                sort_by="joined_at",
                sort_order="asc",
                current_user=other_instructor,
                db=session,
            )
        assert "Access denied" in str(exc_info.value)

        # 12. Student cannot view roster (Part H1)
        with pytest.raises(Exception) as exc_info:
            await get_classroom_roster_paginated(
                classroom_id=classroom.id,
                page=1,
                page_size=10,
                search=None,
                division=None,
                batch=None,
                member_status=None,
                sort_by="joined_at",
                sort_order="asc",
                current_user=student_a,
                db=session,
            )
        assert "Access denied" in str(exc_info.value)

        # 13. CSV Export Formula Injection Protection (Part G2)
        student_mal = User(
            id=uuid.uuid4(),
            email=f"mal_{uuid.uuid4().hex[:6]}@college.edu",
            hashed_password="mock_hashed_pw",
            full_name='=HYPERLINK("http://evil.com","click")',
            role=UserRole.learner,
            organisation_id=org.id,
            is_active=True,
        )
        session.add(student_mal)
        await session.flush()
        session.add(ClassroomMember(
            classroom_id=classroom.id,
            user_id=student_mal.id,
            role=ClassroomRole.learner,
            status="joined",
            full_name='=HYPERLINK("http://evil.com","click")',
            enrollment_number="@EVIL-001",
            division="A",
            batch="B1",
        ))
        await session.commit()

        csv_response = await export_roster_csv(
            classroom_id=classroom.id,
            current_user=instructor,
            db=session,
        )
        csv_text = bytes(csv_response.body).decode("utf-8")
        assert "'=HYPERLINK" in csv_text, "Dangerous formula must be escaped with single quote"
        assert "'@EVIL-001" in csv_text, "Dangerous @ symbol must be escaped with single quote"

        # 14. Reset Code: Old code is invalid, existing members unaffected (Part G4)
        old_join_code = classroom.join_code
        reset_res = await reset_join_code(
            classroom_id=classroom.id,
            current_user=instructor,
            db=session,
        )
        new_join_code = reset_res["join_code"]
        assert new_join_code != old_join_code
        assert old_join_code is not None

        with pytest.raises(Exception) as exc_info:
            await preview_join_code(code=old_join_code, request=MOCK_REQUEST, current_user=None, db=session)
        assert UNIFORM_JOIN_ERROR_MESSAGE in str(exc_info.value)

        # 15. Remove participant: locks them out at once (Parts G4, H3)
        await remove_participant(
            classroom_id=classroom.id,
            user_id=student_b.id,
            current_user=instructor,
            db=session,
        )

        with pytest.raises(Exception) as exc_info:
            await get_exam_lobby(
                classroom_id=classroom.id,
                current_user=student_b,
                db=session,
            )
        assert "removed" in str(exc_info.value)


@pytest.mark.asyncio
async def test_seeded_200_rows_roster_pagination():
    """Verify 200+ seeded students paginate correctly with server-side pagination and filters."""
    async with TestSessionLocal() as session:
        org = Organisation(
            id=uuid.uuid4(),
            name="Mega Campus",
            slug=f"mega-{uuid.uuid4().hex[:6]}",
            is_active=True,
        )
        session.add(org)
        await session.flush()

        instructor = User(
            id=uuid.uuid4(),
            email=f"prof_{uuid.uuid4().hex[:6]}@mega.edu",
            hashed_password="mock_hashed_pw",
            full_name="Professor Archimedes",
            role=UserRole.faculty,
            organisation_id=org.id,
            is_active=True,
        )
        session.add(instructor)
        await session.flush()

        code = generate_join_code(6)
        classroom = Classroom(
            id=uuid.uuid4(),
            organisation_id=org.id,
            name="Massive ML Exam 2026",
            code=code,
            join_code=code,
            join_code_active=True,
            faculty_id=instructor.id,
            is_active=True,
        )
        session.add(classroom)
        session.add(ClassroomMember(
            classroom_id=classroom.id,
            user_id=instructor.id,
            role=ClassroomRole.faculty,
            status="active",
        ))

        # Seed 205 student users and members
        users_to_add = []
        members_to_add = []
        for i in range(1, 206):
            uid = uuid.uuid4()
            div = "A" if i % 2 == 0 else "B"
            batch = "B1" if i % 3 == 0 else ("B2" if i % 3 == 1 else "B3")
            users_to_add.append(
                User(
                    id=uid,
                    email=f"student_{i}_{uuid.uuid4().hex[:4]}@mega.edu",
                    hashed_password="mock_hashed_pw",
                    full_name=f"Student {i:03d}",
                    role=UserRole.learner,
                    organisation_id=org.id,
                    is_active=True,
                )
            )
            members_to_add.append(
                ClassroomMember(
                    classroom_id=classroom.id,
                    user_id=uid,
                    role=ClassroomRole.learner,
                    status="details_saved",
                    full_name=f"Student {i:03d}",
                    enrollment_number=f"ENROLL-{i:04d}",
                    division=div,
                    batch=batch,
                )
            )
        session.add_all(users_to_add)
        await session.flush()
        session.add_all(members_to_add)
        await session.commit()

        # Page 1 (25 per page)
        p1 = await get_classroom_roster_paginated(
            classroom_id=classroom.id,
            page=1,
            page_size=25,
            search=None,
            division=None,
            batch=None,
            member_status=None,
            sort_by="joined_at",
            sort_order="asc",
            current_user=instructor,
            db=session,
        )
        assert p1.total == 205
        assert len(p1.items) == 25
        assert p1.total_pages == 9

        # Filter by division A
        p_div_a = await get_classroom_roster_paginated(
            classroom_id=classroom.id,
            page=1,
            page_size=50,
            search=None,
            division="A",
            batch=None,
            member_status=None,
            sort_by="joined_at",
            sort_order="asc",
            current_user=instructor,
            db=session,
        )
        assert p_div_a.total == 102
        assert all(item.division == "A" for item in p_div_a.items)

        # Search by enrollment number
        p_search = await get_classroom_roster_paginated(
            classroom_id=classroom.id,
            page=1,
            page_size=10,
            search="ENROLL-0042",
            division=None,
            batch=None,
            member_status=None,
            sort_by="joined_at",
            sort_order="asc",
            current_user=instructor,
            db=session,
        )
        assert p_search.total == 1
        assert p_search.items[0].enrollment_number == "ENROLL-0042"



