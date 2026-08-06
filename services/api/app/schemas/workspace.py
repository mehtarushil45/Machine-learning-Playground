"""Pydantic schemas for Workspace, WorkspaceMember, and WorkspaceSettings."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


# ── Workspace schemas ─────────────────────────────────────────────────────────

class WorkspaceCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=1, max_length=100, pattern=r'^[a-z0-9-]+$')
    description: Optional[str] = Field(None, max_length=500)
    visibility: Optional[str] = Field("INTERNAL", pattern=r'^(PRIVATE|INTERNAL|PUBLIC)$')


class WorkspaceUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=500)
    visibility: Optional[str] = Field(None, pattern=r'^(PRIVATE|INTERNAL|PUBLIC)$')


class WorkspaceResponse(BaseModel):
    workspace_id: str
    name: str
    slug: str
    description: Optional[str] = None
    status: str
    visibility: str
    is_default: bool
    organisation_id: str
    created_by_user_id: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    schema_version: Optional[str] = None


# ── Member schemas ───────────────────────────────────────────────────────────

class WorkspaceInviteRequest(BaseModel):
    user_id: str = Field(..., description="UUID of the user to invite")
    role: str = Field(
        ...,
        pattern=r'^(WORKSPACE_ADMIN|ML_ENGINEER|DATA_SCIENTIST|REVIEWER|VIEWER)$',
    )


class WorkspaceInviteResponse(BaseModel):
    member_id: str
    workspace_id: str
    user_id: str
    role: str
    status: str
    invited_at: Optional[str] = None


class RoleUpdateRequest(BaseModel):
    role: str = Field(
        ...,
        pattern=r'^(WORKSPACE_ADMIN|ML_ENGINEER|DATA_SCIENTIST|REVIEWER|VIEWER)$',
    )


class WorkspaceMemberResponse(BaseModel):
    member_id: str
    workspace_id: str
    user_id: str
    role: str
    status: str
    invited_at: Optional[str] = None
    joined_at: Optional[str] = None
    suspended_at: Optional[str] = None
    removed_at: Optional[str] = None
    created_at: Optional[str] = None


# ── Settings schemas ─────────────────────────────────────────────────────────

class WorkspaceSettingsUpdate(BaseModel):
    default_deployment_policy: Optional[str] = Field(
        None, pattern=r'^(ALLOW|ALLOW_WITH_WARNING|BLOCK)$'
    )
    require_approval_for_production: Optional[bool] = None
    monitoring_auto_start: Optional[bool] = None
    monitoring_drift_threshold: Optional[float] = Field(None, ge=0.0, le=1.0)
    monitoring_alert_email: Optional[str] = None
    storage_quota_gb: Optional[float] = Field(None, ge=0)
    compute_quota_hours: Optional[float] = Field(None, ge=0)
    dataset_retention_days: Optional[int] = Field(None, ge=1)
    model_retention_days: Optional[int] = Field(None, ge=1)
    branding_logo_url: Optional[str] = None
    branding_primary_color: Optional[str] = None


class WorkspaceSettingsResponse(BaseModel):
    settings_id: str
    workspace_id: str
    default_deployment_policy: str
    require_approval_for_production: bool
    monitoring_auto_start: bool
    monitoring_drift_threshold: float
    monitoring_alert_email: Optional[str] = None
    storage_quota_gb: Optional[float] = None
    compute_quota_hours: Optional[float] = None
    dataset_retention_days: Optional[int] = None
    model_retention_days: Optional[int] = None
    branding_logo_url: Optional[str] = None
    branding_primary_color: Optional[str] = None
    updated_at: Optional[str] = None


# ── Dashboard schema ──────────────────────────────────────────────────────────

class KpiScores(BaseModel):
    health_score: int = Field(..., ge=0, le=100)
    governance_score: int = Field(..., ge=0, le=100)
    deployment_score: int = Field(..., ge=0, le=100)
    monitoring_score: int = Field(..., ge=0, le=100)
    score_description: Optional[dict] = None


class WorkspaceDashboardResponse(BaseModel):
    workspace_id: str
    organisation_id: str
    generated_at: str
    schema_version: Optional[str] = None
    kpi_scores: KpiScores
    members: dict
    datasets: dict
    models: dict
    deployments: dict
    monitoring: dict
    experiments: dict
    retraining: dict
    storage: dict
    recent_activity: list
