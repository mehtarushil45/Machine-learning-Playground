"""Admin Router — Version 7B Part 2

Enterprise Administration & Operations Center.
Base Path: /api/v1/admin  (registered via main.py with API_V1_PREFIX)
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, AdminUser
from app.admin import (
    broadcast_notification,
    create_filesystem_backup,
    delete_backup,
    export_audit_logs_csv,
    generate_global_analytics,
    get_active_notifications,
    get_audit_logs,
    get_feature_flag,
    get_maintenance_config,
    get_operations_dashboard,
    get_platform_metadata,
    get_platform_settings,
    list_active_workers,
    list_backups,
    list_feature_flags,
    log_audit_event,
    log_security_event,
    restore_backup,
    set_feature_flag,
    set_maintenance_config,
    get_security_summary,
    is_maintenance_active,
)
from app.admin.feature_flags import update_feature_flag
from app.admin.maintenance_manager import get_maintenance_history, is_read_only_active
from app.admin.notification_manager import dismiss_notification, get_all_notifications
from app.admin.operations_manager import cancel_job, get_failed_jobs, get_running_jobs, retry_job
from app.admin.security_manager import get_security_events

from app.schemas.admin import (
    AnalyticsSummary,
    AuditLogResponse,
    BackupResponse,
    FeatureFlagCreate,
    FeatureFlagResponse,
    FeatureFlagUpdate,
    MaintenanceConfig,
    MaintenanceHistoryEntry,
    NotificationCreate,
    NotificationResponse,
    OperationsDashboard,
    PlatformSettings,
    SecurityEvent,
    SecuritySummary,
    WorkerStatus,
)

router = APIRouter(
    prefix="/admin",
    tags=["Enterprise Admin"],
    dependencies=[Depends(AdminUser)],  # ← all admin endpoints require admin role
)


# ── System ────────────────────────────────────────────────────────────────────

@router.get("/system/metadata", response_model=Dict[str, str], summary="Get system metadata")
async def read_platform_metadata() -> Dict[str, str]:
    """Retrieve OS, Python, storage backend, and platform metadata."""
    return get_platform_metadata()


@router.get("/system/settings", response_model=PlatformSettings, summary="Get platform settings")
async def read_platform_settings() -> PlatformSettings:
    """Retrieve global platform configuration."""
    return get_platform_settings()


@router.get("/dashboard", response_model=Dict[str, Any], summary="Administration dashboard")
async def read_admin_dashboard(db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    """Unified admin dashboard: analytics + operations + security + maintenance."""
    analytics = await generate_global_analytics(db)
    ops = get_operations_dashboard()
    security = get_security_summary()
    maintenance = get_maintenance_config()
    return {
        "analytics": analytics.model_dump(),
        "operations": ops.model_dump(),
        "security": security.model_dump(),
        "maintenance": maintenance.model_dump(),
        "maintenance_active": is_maintenance_active(),
        "read_only_active": is_read_only_active(),
    }


# ── Operations ─────────────────────────────────────────────────────────────────

@router.get("/operations/dashboard", response_model=OperationsDashboard, summary="Operations dashboard")
async def read_operations_dashboard() -> OperationsDashboard:
    return get_operations_dashboard()


@router.get("/operations/workers", response_model=List[WorkerStatus], summary="List active workers")
async def read_active_workers() -> List[WorkerStatus]:
    return list_active_workers()


@router.get("/operations/jobs/running", response_model=List[Dict[str, Any]], summary="Running jobs")
async def read_running_jobs() -> List[Dict[str, Any]]:
    return get_running_jobs()


@router.get("/operations/jobs/failed", response_model=List[Dict[str, Any]], summary="Failed jobs")
async def read_failed_jobs() -> List[Dict[str, Any]]:
    return get_failed_jobs()


@router.post(
    "/operations/jobs/{job_id}/cancel",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Signal job cancellation",
)
async def request_job_cancellation(job_id: str) -> Dict[str, str]:
    cancel_job(job_id)
    return {"status": "Cancellation requested", "job_id": job_id}


@router.post(
    "/operations/jobs/{job_id}/retry",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Signal job retry",
)
async def request_job_retry(job_id: str) -> Dict[str, str]:
    retry_job(job_id)
    return {"status": "Retry requested", "job_id": job_id}


# ── Audit ──────────────────────────────────────────────────────────────────────

@router.get("/audit", response_model=AuditLogResponse, summary="List audit logs")
async def read_audit_logs(
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    actor: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    result: Optional[str] = Query(None, description="SUCCESS | FAILURE | DENIED"),
    resource_type: Optional[str] = Query(None),
    organisation: Optional[str] = Query(None),
    workspace: Optional[str] = Query(None),
) -> AuditLogResponse:
    """Retrieve paginated, filtered audit events (newest first)."""
    return get_audit_logs(
        limit=limit,
        offset=offset,
        actor=actor,
        action=action,
        result=result,
        resource_type=resource_type,
        organisation=organisation,
        workspace=workspace,
    )


@router.get("/audit/export", summary="Export audit log as CSV")
async def export_audit_csv(month: Optional[str] = Query(None, description="YYYY-MM, default=current")):
    """Download current (or specified) month's audit log as CSV."""
    csv_file = export_audit_logs_csv(month_str=month)
    if not csv_file:
        raise HTTPException(status_code=404, detail="No audit logs available for the requested period.")
    return FileResponse(csv_file, media_type="text/csv", filename="audit_export.csv")


# ── Security ───────────────────────────────────────────────────────────────────

@router.get("/security/summary", response_model=SecuritySummary, summary="Security metrics summary")
async def read_security_summary() -> SecuritySummary:
    return get_security_summary()


@router.get("/security/events", response_model=List[SecurityEvent], summary="List security events")
async def read_security_events(
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    event_type: Optional[str] = Query(None, description="login_failure | token_revoked | suspicious_ip"),
    severity: Optional[str] = Query(None, description="low | medium | high | critical"),
    user_id: Optional[str] = Query(None),
) -> List[SecurityEvent]:
    """Retrieve individual security events with optional filters."""
    return get_security_events(limit=limit, offset=offset, event_type=event_type, severity=severity, user_id=user_id)


# ── Analytics ──────────────────────────────────────────────────────────────────

@router.get("/analytics", response_model=AnalyticsSummary, summary="Global platform analytics")
async def read_global_analytics(db: AsyncSession = Depends(get_db)) -> AnalyticsSummary:
    return await generate_global_analytics(db)


# ── Backups ────────────────────────────────────────────────────────────────────

@router.get("/backups", response_model=List[BackupResponse], summary="List backups")
async def read_backups() -> List[BackupResponse]:
    return list_backups()


@router.post("/backups/create", response_model=BackupResponse, summary="Create filesystem backup")
async def create_backup(components: List[str]) -> BackupResponse:
    return create_filesystem_backup(components)


@router.post("/backups/{backup_id}/restore", summary="Restore a backup")
async def restore_existing_backup(backup_id: str, confirm_overwrite: bool = False) -> Dict[str, Any]:
    """Restore a backup. Requires explicit confirm_overwrite=true."""
    try:
        success = restore_backup(backup_id, confirm_overwrite)
        return {"restored": success, "backup_id": backup_id}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/backups/{backup_id}", summary="Delete a backup")
async def delete_existing_backup(backup_id: str) -> Dict[str, bool]:
    success = delete_backup(backup_id)
    if not success:
        raise HTTPException(status_code=404, detail="Backup not found.")
    return {"deleted": True}


# ── Notifications ──────────────────────────────────────────────────────────────

@router.get("/notifications", response_model=List[NotificationResponse], summary="Active notifications")
async def read_active_notifications() -> List[NotificationResponse]:
    return get_active_notifications()


@router.get("/notifications/all", response_model=List[NotificationResponse], summary="All notifications (incl. dismissed)")
async def read_all_notifications() -> List[NotificationResponse]:
    return get_all_notifications()


@router.post("/notifications/broadcast", response_model=NotificationResponse, summary="Create broadcast notification")
async def create_broadcast_notification(data: NotificationCreate) -> NotificationResponse:
    return broadcast_notification(data)


@router.post("/notifications/{notif_id}/dismiss", summary="Dismiss a notification")
async def dismiss_global_notification(notif_id: str) -> Dict[str, bool]:
    success = dismiss_notification(notif_id)
    if not success:
        raise HTTPException(status_code=404, detail="Notification not found.")
    return {"dismissed": True}


# ── Feature Flags ──────────────────────────────────────────────────────────────

@router.get("/feature-flags", response_model=List[FeatureFlagResponse], summary="List feature flags")
async def read_feature_flags(
    group: Optional[str] = Query(None, description="Experimental | Beta | Enterprise | Internal"),
) -> List[FeatureFlagResponse]:
    return list_feature_flags(group=group)


@router.post("/feature-flags", response_model=FeatureFlagResponse, summary="Create/replace feature flag")
async def create_feature_flag(data: FeatureFlagCreate) -> FeatureFlagResponse:
    try:
        return set_feature_flag(data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/feature-flags/{name}", response_model=FeatureFlagResponse, summary="Get feature flag")
async def read_feature_flag(name: str) -> FeatureFlagResponse:
    flag = get_feature_flag(name)
    if not flag:
        raise HTTPException(status_code=404, detail=f"Feature flag '{name}' not found.")
    return flag


@router.patch("/feature-flags/{name}", response_model=FeatureFlagResponse, summary="Update feature flag")
async def update_feature_flag_endpoint(name: str, updates: FeatureFlagUpdate) -> FeatureFlagResponse:
    try:
        flag = update_feature_flag(name, updates)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not flag:
        raise HTTPException(status_code=404, detail=f"Feature flag '{name}' not found.")
    return flag


# ── Maintenance ────────────────────────────────────────────────────────────────

@router.get("/maintenance", response_model=MaintenanceConfig, summary="Get maintenance config")
async def read_maintenance_config() -> MaintenanceConfig:
    return get_maintenance_config()


@router.post("/maintenance", response_model=MaintenanceConfig, summary="Set maintenance config")
async def update_maintenance_config(config: MaintenanceConfig) -> MaintenanceConfig:
    return set_maintenance_config(config)


@router.get(
    "/maintenance/history",
    response_model=List[MaintenanceHistoryEntry],
    summary="Maintenance change history",
)
async def read_maintenance_history() -> List[MaintenanceHistoryEntry]:
    """Return historical log of maintenance configuration changes."""
    return get_maintenance_history()
