"""Portfolio Manager — V7B Part 2.

Extended portfolio capabilities: achievements, skill summaries,
public profiles, and recruiter views.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional


def compute_skill_summary(
    portfolio_projects: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Derive a skill summary from a student's portfolio projects."""
    algorithms_used: set = set()
    problem_types: set = set()
    total_projects = len(portfolio_projects)
    deployment_count = 0
    cert_count = 0

    for p in portfolio_projects:
        if p.get("certificate_qr_code"):
            cert_count += 1
        if p.get("model_id"):
            deployment_count += 1
        # Extract from experiment metadata if available
        for key in ("algorithm", "experiment_algorithm"):
            if p.get(key):
                algorithms_used.add(p[key])
        for key in ("problem_type", "experiment_problem_type"):
            if p.get(key):
                problem_types.add(p[key])

    skill_level = (
        "ADVANCED" if total_projects >= 5
        else "INTERMEDIATE" if total_projects >= 2
        else "BEGINNER"
    )

    return {
        "total_projects": total_projects,
        "certified_projects": cert_count,
        "deployed_models": deployment_count,
        "algorithms_demonstrated": sorted(algorithms_used),
        "problem_types": sorted(problem_types),
        "skill_level": skill_level,
        "badges": _compute_badges(
            total_projects, cert_count, deployment_count, algorithms_used
        ),
    }


def _compute_badges(
    total: int, certs: int, deployments: int, algorithms: set
) -> List[Dict[str, str]]:
    badges = []
    if total >= 1:
        badges.append({"id": "first_project", "name": "First Project", "icon": "🏆"})
    if total >= 5:
        badges.append({"id": "portfolio_builder", "name": "Portfolio Builder", "icon": "📚"})
    if certs >= 1:
        badges.append({"id": "certified", "name": "Certified ML Practitioner", "icon": "🎓"})
    if deployments >= 1:
        badges.append({"id": "deployed", "name": "Model Deployer", "icon": "🚀"})
    if len(algorithms) >= 3:
        badges.append({"id": "versatile", "name": "Versatile Engineer", "icon": "⚡"})
    return badges


def build_public_profile(
    user_id: str,
    user_name: str,
    portfolio_projects: List[Dict[str, Any]],
    bio: Optional[str] = None,
) -> Dict[str, Any]:
    """Build a shareable public profile for a student/ML practitioner."""
    skill_summary = compute_skill_summary(portfolio_projects)
    public_projects = [
        {
            "project_id": str(p.get("id", "")),
            "title": p.get("title", ""),
            "description": p.get("description", ""),
            "model_id": p.get("model_id"),
            "certificate_url": p.get("certificate_qr_code"),
            "is_public": p.get("is_public", False),
        }
        for p in portfolio_projects
        if p.get("is_public")
    ]

    return {
        "user_id": user_id,
        "user_name": user_name,
        "bio": bio or "",
        "public_projects": public_projects,
        "skill_summary": skill_summary,
        "achievements": skill_summary.get("badges", []),
        "profile_completeness_pct": min(
            100,
            20 * (
                bool(bio) +
                bool(public_projects) +
                bool(skill_summary["certified_projects"]) +
                bool(skill_summary["deployed_models"]) +
                (len(skill_summary["algorithms_demonstrated"]) >= 2)
            ),
        ),
    }


def build_recruiter_view(
    user_id: str,
    user_name: str,
    portfolio_projects: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Generate a recruiter-friendly view highlighting key ML accomplishments."""
    skill_summary = compute_skill_summary(portfolio_projects)
    highlights = []
    if skill_summary["certified_projects"]:
        highlights.append(f"{skill_summary['certified_projects']} verified ML project(s) with certificates")
    if skill_summary["deployed_models"]:
        highlights.append(f"{skill_summary['deployed_models']} model(s) deployed to production")
    if skill_summary["algorithms_demonstrated"]:
        highlights.append(f"Experience with: {', '.join(skill_summary['algorithms_demonstrated'][:5])}")

    return {
        "candidate_id": user_id,
        "candidate_name": user_name,
        "headline": f"{skill_summary['skill_level'].title()} ML Practitioner",
        "highlights": highlights,
        "total_verified_projects": skill_summary["certified_projects"],
        "skill_level": skill_summary["skill_level"],
        "badges": skill_summary["badges"],
        "portfolio_url": f"/api/v1/portfolios/user/{user_id}",
    }
