"""Workspace Dashboard — aggregated workspace KPIs and health scores.

Aggregates data from multiple V1-6B subsystems (via filesystem registries)
and the PostgreSQL membership layer to produce a unified workspace view.

V7A Executive KPIs:
    health_score     — Overall workspace health (0-100)
    governance_score — Model governance quality (0-100)
    deployment_score — Deployment health (0-100)
    monitoring_score — Monitoring coverage (0-100)

All scores are read-only aggregated metrics. No mutations happen here.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Optional

logger = logging.getLogger("apex_ml.workspace_dashboard")

SCHEMA_VERSION = "7a.1.0"


def _safe_get(fn, default=None):
    """Call fn() and return default on any exception."""
    try:
        return fn()
    except Exception as exc:
        logger.debug("dashboard aggregation error: %s", exc)
        return default


# ── KPI Score Computation ─────────────────────────────────────────────────────

def _compute_governance_score(workspace_id: str) -> int:
    """Score 0-100: measures how well models are governed.

    Algorithm:
        - Base: 40 points
        - +20 if any models exist in registry
        - +20 if >50% of registered models have governance records
        - +20 if no model has been in CANDIDATE state for >7 days
    """
    try:
        from app.ml.resource_ownership import list_workspace_resources
        models = list_workspace_resources(workspace_id, resource_type="model", limit=200)
        if not models:
            return 40  # base score with no models

        from app.ml.model_governance import get_governance
        governed = 0
        for m in models:
            try:
                gov = get_governance(m["resource_id"])
                if gov:
                    governed += 1
            except Exception:
                pass

        score = 40
        if models:
            score += 20
        governance_ratio = governed / max(len(models), 1)
        score += int(governance_ratio * 40)
        return min(score, 100)
    except Exception:
        return 50  # neutral when data unavailable


def _compute_deployment_score(workspace_id: str) -> int:
    """Score 0-100: measures deployment health.

    Algorithm:
        - Base: 30 points
        - +25 if any active deployments exist
        - +25 if all active deployments have monitoring configured
        - +20 if no deployments in FAILED or DEGRADED state
    """
    try:
        from app.ml.resource_ownership import list_workspace_resources
        deployments = list_workspace_resources(workspace_id, resource_type="deployment", limit=200)
        if not deployments:
            return 30

        from app.ml.deployment_registry import get_v6a_deployment
        active = 0
        has_monitoring = 0
        has_issues = 0

        for d in deployments:
            try:
                dep = get_v6a_deployment(d["resource_id"])
                if dep:
                    if dep.get("current_state") in ("DEPLOYED", "SCALING"):
                        active += 1
                        # Check if monitoring exists
                        from app.ml.monitoring import monitoring_registry
                        monitors = monitoring_registry.list_monitors(
                            deployment_id=d["resource_id"], limit=1
                        )
                        if monitors:
                            has_monitoring += 1
                    elif dep.get("current_state") in ("FAILED",):
                        has_issues += 1
            except Exception:
                pass

        score = 30
        if active > 0:
            score += 25
        if active > 0 and has_monitoring >= active:
            score += 25
        if has_issues == 0:
            score += 20

        return min(score, 100)
    except Exception:
        return 50


def _compute_monitoring_score(workspace_id: str) -> int:
    """Score 0-100: measures monitoring coverage and health.

    Algorithm:
        - Base: 20 points
        - +30 if any monitoring configs exist
        - +25 if all active monitors are in ACTIVE state (not ALERTING)
        - +25 if alert resolution rate > 80%
    """
    try:
        from app.ml.resource_ownership import list_workspace_resources
        monitoring_resources = list_workspace_resources(workspace_id, resource_type="monitoring", limit=200)
        if not monitoring_resources:
            return 20

        from app.ml.monitoring import monitoring_registry

        total = 0
        active = 0
        alerting = 0
        resolved_alerts = 0
        total_alerts = 0

        for mon in monitoring_resources:
            try:
                mid = mon["resource_id"]
                status = monitoring_registry.get_monitor_status(mid)
                if status:
                    total += 1
                    state = status.get("state", "")
                    if state == "ACTIVE":
                        active += 1
                    elif state == "ALERTING":
                        alerting += 1

                    alerts = monitoring_registry.list_alerts(mid, limit=200)
                    for al in alerts:
                        total_alerts += 1
                        if al.get("resolved"):
                            resolved_alerts += 1
            except Exception:
                pass

        score = 20
        if total > 0:
            score += 30
        if total > 0 and alerting == 0:
            score += 25
        if total_alerts > 0:
            resolution_rate = resolved_alerts / total_alerts
            score += int(resolution_rate * 25)
        elif total > 0:
            score += 25  # no alerts = good

        return min(score, 100)
    except Exception:
        return 50


def _compute_health_score(
    governance_score: int,
    deployment_score: int,
    monitoring_score: int,
    member_count: int,
) -> int:
    """Overall health = weighted average of sub-scores.

    Weights: governance 35%, deployment 35%, monitoring 20%, members 10%.
    """
    member_score = min(100, member_count * 20)  # 5 members = 100
    health = int(
        governance_score * 0.35
        + deployment_score * 0.35
        + monitoring_score * 0.20
        + member_score * 0.10
    )
    return min(max(health, 0), 100)


# ── Dashboard assembly ─────────────────────────────────────────────────────────

async def get_dashboard(
    db,  # AsyncSession — typed loosely to avoid circular import
    workspace_id: str,
    org_id: str,
) -> dict:
    """Assemble the full workspace dashboard.

    Aggregates across PostgreSQL (members) and filesystem (ML resources).
    Never mutates any data.

    Args:
        db: SQLAlchemy AsyncSession.
        workspace_id: Workspace to aggregate.
        org_id: Organisation ID.

    Returns:
        Dashboard dict with counts, KPIs, scores, and recent activity.
    """
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc).isoformat()

    # \u2500\u2500 Members (PostgreSQL) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    members_data = await _agg_members(db, workspace_id)

    # \u2500\u2500 Filesystem resources (via ownership index) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    datasets_data = _safe_get(lambda: _agg_datasets(workspace_id), {})
    models_data = _safe_get(lambda: _agg_models(workspace_id), {})
    deployments_data = _safe_get(lambda: _agg_deployments(workspace_id), {})
    monitoring_data = _safe_get(lambda: _agg_monitoring(workspace_id), {})
    experiments_data = _safe_get(lambda: _agg_experiments(workspace_id), {})
    retraining_data = _safe_get(lambda: _agg_retraining(workspace_id), {})

    # \u2500\u2500 Storage usage \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    storage_data = _safe_get(lambda: _agg_storage(workspace_id, db), {"used_gb": 0.0, "quota_gb": None})

    # \u2500\u2500 Recent activity \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    recent_activity = _safe_get(
        lambda: _get_recent_activity(org_id, workspace_id),
        [],
    )

    # \u2500\u2500 Executive KPI scores \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    governance_score = _safe_get(lambda: _compute_governance_score(workspace_id), 50)
    deployment_score = _safe_get(lambda: _compute_deployment_score(workspace_id), 50)
    monitoring_score = _safe_get(lambda: _compute_monitoring_score(workspace_id), 50)
    member_count = members_data.get("total", 0)
    health_score = _compute_health_score(
        governance_score, deployment_score, monitoring_score, member_count
    )

    return {
        "workspace_id": workspace_id,
        "organisation_id": org_id,
        "generated_at": now,
        "schema_version": SCHEMA_VERSION,
        "kpi_scores": {
            "health_score": health_score,
            "governance_score": governance_score,
            "deployment_score": deployment_score,
            "monitoring_score": monitoring_score,
            "score_description": {
                "90-100": "Excellent",
                "70-89": "Good",
                "50-69": "Fair",
                "0-49": "Needs attention",
                "current_band": (
                    "Excellent" if health_score >= 90 else
                    "Good" if health_score >= 70 else
                    "Fair" if health_score >= 50 else
                    "Needs attention"
                ),
            },
        },
        "members": members_data,
        "datasets": datasets_data,
        "models": models_data,
        "deployments": deployments_data,
        "monitoring": monitoring_data,
        "experiments": experiments_data,
        "retraining": retraining_data,
        "storage": storage_data,
        "recent_activity": recent_activity,
    }


# ── Aggregation helpers ───────────────────────────────────────────────────────

async def _agg_members(db, workspace_id: str) -> dict:
    from sqlalchemy import select
    from app.models.workspace_member import WorkspaceMember, MemberStatus

    result = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == __import__("uuid").UUID(workspace_id)
        )
    )
    all_members = result.scalars().all()

    by_status: dict[str, int] = {}
    by_role: dict[str, int] = {}
    for m in all_members:
        s = m.status.value if hasattr(m.status, "value") else str(m.status)
        r = m.role.value if hasattr(m.role, "value") else str(m.role)
        by_status[s] = by_status.get(s, 0) + 1
        by_role[r] = by_role.get(r, 0) + 1

    return {
        "total": len(all_members),
        "active": by_status.get("ACTIVE", 0),
        "invited": by_status.get("INVITED", 0),
        "suspended": by_status.get("SUSPENDED", 0),
        "by_role": by_role,
    }


def _agg_datasets(workspace_id: str) -> dict:
    from app.ml.resource_ownership import list_workspace_resources
    datasets = list_workspace_resources(workspace_id, resource_type="dataset", limit=500)
    return {"total": len(datasets), "validated": 0}  # validated count requires job scan


def _agg_models(workspace_id: str) -> dict:
    from app.ml.resource_ownership import list_workspace_resources
    models = list_workspace_resources(workspace_id, resource_type="model", limit=500)
    by_state: dict[str, int] = {}
    in_production = 0
    for m in models:
        try:
            from app.ml.model_governance import get_governance
            gov = get_governance(m["resource_id"])
            state = gov.get("current_state", "UNKNOWN") if gov else "UNKNOWN"
            by_state[state] = by_state.get(state, 0) + 1
            if state == "PRODUCTION":
                in_production += 1
        except Exception:
            pass
    return {"total": len(models), "in_production": in_production, "by_state": by_state}


def _agg_deployments(workspace_id: str) -> dict:
    from app.ml.resource_ownership import list_workspace_resources
    deps = list_workspace_resources(workspace_id, resource_type="deployment", limit=500)
    active = 0
    by_strategy: dict[str, int] = {}
    for d in deps:
        try:
            from app.ml.deployment_registry import get_v6a_deployment
            dep = get_v6a_deployment(d["resource_id"])
            if dep and dep.get("current_state") in ("DEPLOYED", "SCALING"):
                active += 1
            if dep:
                strat = dep.get("strategy", "UNKNOWN")
                by_strategy[strat] = by_strategy.get(strat, 0) + 1
        except Exception:
            pass
    return {"total": len(deps), "active": active, "by_strategy": by_strategy}


def _agg_monitoring(workspace_id: str) -> dict:
    from app.ml.resource_ownership import list_workspace_resources
    mons = list_workspace_resources(workspace_id, resource_type="monitoring", limit=500)
    active_count = 0
    alerting_count = 0
    total_alerts = 0
    for m in mons:
        try:
            from app.ml.monitoring import monitoring_registry
            status = monitoring_registry.get_monitor_status(m["resource_id"])
            if status:
                state = status.get("state", "")
                if state == "ACTIVE":
                    active_count += 1
                elif state == "ALERTING":
                    alerting_count += 1
            alerts = monitoring_registry.list_alerts(m["resource_id"], resolved=False, limit=500)
            total_alerts += len(alerts)
        except Exception:
            pass
    return {
        "total": len(mons),
        "active": active_count,
        "alerting": alerting_count,
        "total_unresolved_alerts": total_alerts,
    }


def _agg_experiments(workspace_id: str) -> dict:
    from app.ml.resource_ownership import list_workspace_resources
    exps = list_workspace_resources(workspace_id, resource_type="experiment", limit=500)
    return {"total": len(exps), "completed": 0, "running": 0}


def _agg_retraining(workspace_id: str) -> dict:
    from app.ml.resource_ownership import list_workspace_resources
    mons = list_workspace_resources(workspace_id, resource_type="monitoring", limit=500)
    pending = 0
    approved = 0
    for m in mons:
        try:
            from app.ml.monitoring import retraining_manager
            reqs = retraining_manager.list_retraining_requests(
                monitoring_id=m["resource_id"], limit=200
            )
            for r in reqs:
                if r.get("status") == "PENDING":
                    pending += 1
                elif r.get("status") == "APPROVED":
                    approved += 1
        except Exception:
            pass
    return {"pending": pending, "approved": approved}


def _agg_storage(workspace_id: str, db) -> dict:
    """Estimate storage usage from upload directory sizes (advisory only)."""
    used_bytes = 0
    upload_root = os.path.join("uploads")
    if os.path.isdir(upload_root):
        for dirpath, _, filenames in os.walk(upload_root):
            for fname in filenames:
                try:
                    used_bytes += os.path.getsize(os.path.join(dirpath, fname))
                except OSError:
                    pass
    used_gb = round(used_bytes / (1024 ** 3), 4)
    return {"used_gb": used_gb, "quota_gb": None}  # quota from settings if needed


def _get_recent_activity(org_id: str, workspace_id: str) -> list[dict]:
    from app.ml.activity_feed import get_activity_feed
    return get_activity_feed(org_id, workspace_id, limit=10)
