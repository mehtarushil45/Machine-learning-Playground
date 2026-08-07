"""Classroom Analytics Engine — V7B Part 2.

Student progress, instructor dashboards, team workspace analytics,
experiment grading, and audit reports.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional


def compute_student_progress(
    user_id: str,
    submissions: List[Dict[str, Any]],
    assignments: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Compute individual student progress metrics."""
    total_assignments = len(assignments)
    submitted = len(submissions)
    graded = [s for s in submissions if s.get("feedback")]
    avg_score = (
        sum(s.get("score", 0) for s in graded) / len(graded) if graded else 0.0
    )
    completion_rate = (submitted / total_assignments * 100) if total_assignments else 0.0

    return {
        "user_id": user_id,
        "total_assignments": total_assignments,
        "submitted": submitted,
        "graded": len(graded),
        "completion_rate_pct": round(completion_rate, 1),
        "average_score": round(avg_score, 2),
        "performance_level": (
            "EXCELLENT" if avg_score >= 85
            else "GOOD" if avg_score >= 70
            else "SATISFACTORY" if avg_score >= 55
            else "NEEDS_IMPROVEMENT"
        ),
    }


def compute_classroom_dashboard(
    classroom_id: str,
    students: List[Dict[str, Any]],
    submissions: List[Dict[str, Any]],
    assignments: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Compute instructor dashboard metrics for a classroom."""
    total_students = len(students)
    total_assignments = len(assignments)
    total_submissions = len(submissions)
    graded_submissions = [s for s in submissions if s.get("feedback")]

    completion_rate = (
        total_submissions / (total_students * total_assignments) * 100
        if total_students and total_assignments
        else 0.0
    )
    avg_score = (
        sum(s.get("score", 0) for s in graded_submissions) / len(graded_submissions)
        if graded_submissions else 0.0
    )

    # Per-student progress
    student_progress = []
    for student in students:
        uid = str(student.get("user_id") or student.get("id", ""))
        student_subs = [s for s in submissions if str(s.get("learner_id")) == uid]
        student_progress.append(
            compute_student_progress(uid, student_subs, assignments)
        )

    return {
        "classroom_id": classroom_id,
        "total_students": total_students,
        "total_assignments": total_assignments,
        "submissions_received": total_submissions,
        "submissions_graded": len(graded_submissions),
        "completion_rate_pct": round(completion_rate, 1),
        "average_class_score": round(avg_score, 2),
        "top_performers": sorted(
            student_progress, key=lambda s: s["average_score"], reverse=True
        )[:5],
        "students_needing_support": [
            s for s in student_progress if s["performance_level"] == "NEEDS_IMPROVEMENT"
        ],
    }


def generate_experiment_grade(
    experiment: Optional[Dict[str, Any]],
    rubric: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Auto-grade a training experiment based on metrics rubric."""
    if not experiment:
        return {"score": 0, "feedback": "Experiment not found."}

    report = experiment.get("report") or {}
    metrics = report.get("metrics") or {}
    accuracy = metrics.get("accuracy", metrics.get("r2", 0.0))

    default_rubric = rubric or {"threshold_excellent": 0.90, "threshold_good": 0.75, "threshold_pass": 0.60}
    te = default_rubric.get("threshold_excellent", 0.90)
    tg = default_rubric.get("threshold_good", 0.75)
    tp = default_rubric.get("threshold_pass", 0.60)

    if accuracy >= te:
        score, grade, feedback = 100, "A", "Excellent model performance."
    elif accuracy >= tg:
        score, grade, feedback = 80, "B", "Good model performance. Consider hyperparameter tuning."
    elif accuracy >= tp:
        score, grade, feedback = 65, "C", "Satisfactory. Review feature engineering."
    else:
        score, grade, feedback = 40, "F", f"Model performance below pass threshold ({tp:.0%}). Significant improvement needed."

    return {
        "experiment_id": experiment.get("experiment_id"),
        "key_metric": accuracy,
        "score": score,
        "grade": grade,
        "feedback": feedback,
        "metrics_snapshot": metrics,
    }


def generate_classroom_audit_report(
    classroom_id: str,
    students: List[Dict[str, Any]],
    assignments: List[Dict[str, Any]],
    submissions: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Generate a comprehensive audit report for a classroom period."""
    dashboard = compute_classroom_dashboard(classroom_id, students, submissions, assignments)

    late_submissions = [s for s in submissions if s.get("is_late", False)]
    missing_submissions = [
        {"assignment_id": a.get("id"), "title": a.get("title")}
        for a in assignments
        if not any(str(s.get("assignment_id")) == str(a.get("id")) for s in submissions)
    ]

    return {
        "report_type": "CLASSROOM_AUDIT",
        "classroom_id": classroom_id,
        "summary": dashboard,
        "late_submissions": len(late_submissions),
        "missing_submissions": len(missing_submissions),
        "missing_assignment_details": missing_submissions[:10],
        "grade_distribution": {
            "A (>=90)": len([p for p in dashboard["students_needing_support"] if p["average_score"] >= 90]),
            "B (75–90)": len([p for p in dashboard["top_performers"] if 75 <= p["average_score"] < 90]),
            "C (60–75)": 0,
            "F (<60)": len(dashboard["students_needing_support"]),
        },
    }
