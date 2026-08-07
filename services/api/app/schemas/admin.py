"""Admin Schemas — Version 7B Part 1"""

from __future__ import annotations
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


# ── Feature Flags ─────────────────────────────────────────────────────────────
class FeatureFlagBase(BaseModel):
    name: str = Field(..., description="Unique flag identifier (e.g., 'enable_gpu_training')")
    description: str
    group: str = Field(..., description="Experimental, Beta, Enterprise, Internal")
    is_enabled: bool = False

class FeatureFlagCreate(FeatureFlagBase):
    pass

class FeatureFlagUpdate(BaseModel):
    description: Optional[str] = None
    group: Optional[str] = None
    is_enabled: Optional[bool] = None

class FeatureFlagResponse(FeatureFlagBase):
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


# ── Maintenance ───────────────────────────────────────────────────────────────
class MaintenanceConfig(BaseModel):
    is_maintenance_mode: bool = False
    is_read_only_mode: bool = False
    message: Optional[str] = None
    scheduled_end: Optional[datetime] = None


# ── System Settings ───────────────────────────────────────────────────────────
class PlatformSettings(BaseModel):
    platform_name: str = "Enterprise ML Platform"
    version: str = "7B.1"
    environment: str = "production"
    max_upload_size_mb: int = 500
    allow_public_registrations: bool = False
    require_email_verification: bool = True
    default_storage_quota_gb: int = 100


# ── Audit Log ─────────────────────────────────────────────────────────────────
class AuditEvent(BaseModel):
    event_id: str
    timestamp: datetime
    actor: str  # user_id or system
    workspace: Optional[str] = None
    organisation: Optional[str] = None
    resource_type: str
    resource_id: Optional[str] = None
    action: str
    result: str  # SUCCESS, FAILURE, DENIED
    ip: Optional[str] = None
    user_agent: Optional[str] = None
    correlation_id: Optional[str] = None
    reason: Optional[str] = None

class AuditLogResponse(BaseModel):
    events: List[AuditEvent]
    total: int


# ── Notifications ─────────────────────────────────────────────────────────────
class NotificationBase(BaseModel):
    title: str
    message: str
    level: str = Field("info", description="info, warning, maintenance, broadcast")
    expires_at: Optional[datetime] = None

class NotificationCreate(NotificationBase):
    pass

class NotificationResponse(NotificationBase):
    id: str
    created_at: datetime
    is_active: bool


# ── Backups ───────────────────────────────────────────────────────────────────
class BackupResponse(BaseModel):
    backup_id: str
    timestamp: datetime
    size_bytes: int
    components: List[str]
    is_restorable: bool


# ── Operations / Jobs ─────────────────────────────────────────────────────────
class WorkerStatus(BaseModel):
    worker_id: str
    status: str
    active_jobs: int
    last_heartbeat: datetime

class OperationsDashboard(BaseModel):
    total_workers: int
    active_workers: int
    queued_jobs: int
    running_jobs: int
    failed_jobs_24h: int


# ── Analytics ─────────────────────────────────────────────────────────────────
class AnalyticsSummary(BaseModel):
    total_organisations: int
    total_workspaces: int
    total_users: int
    total_datasets: int
    total_models: int
    total_deployments: int
    storage_used_bytes: int
    training_jobs_completed: int


# ── Security ──────────────────────────────────────────────────────────────────
class SecurityEvent(BaseModel):
    event_id: str
    timestamp: datetime
    event_type: str  # login_failure, token_revoked, suspicious_ip
    user_id: Optional[str] = None
    ip_address: str
    severity: str  # low, medium, high, critical
    details: Dict[str, Any]

class SecuritySummary(BaseModel):
    failed_logins_24h: int
    active_revoked_tokens: int
    high_severity_events: int


# ── Maintenance History ────────────────────────────────────────────────────────
class MaintenanceHistoryEntry(BaseModel):
    timestamp: datetime
    is_maintenance_mode: bool
    is_read_only_mode: bool
    message: Optional[str] = None

