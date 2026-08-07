"""Enterprise Administration & Operations Center — Version 7B Part 2

This package provides a comprehensive, isolated administration layer for the
entire ML platform. All storage is append-only and isolated under uploads/admin/.
"""

from .admin_manager import get_platform_metadata, get_platform_settings
from .operations_manager import get_operations_dashboard, list_active_workers
from .audit_manager import export_audit_logs_csv, get_audit_logs, log_audit_event
from .security_manager import get_security_summary, log_security_event
from .analytics_manager import generate_global_analytics
from .backup_manager import create_filesystem_backup, delete_backup, list_backups, restore_backup
from .notification_manager import broadcast_notification, get_active_notifications
from .feature_flags import get_feature_flag, list_feature_flags, set_feature_flag
from .maintenance_manager import (
    get_maintenance_config,
    get_maintenance_history,
    is_maintenance_active,
    is_read_only_active,
    set_maintenance_config,
)

__all__ = [
    # Admin
    "get_platform_settings",
    "get_platform_metadata",
    # Operations
    "get_operations_dashboard",
    "list_active_workers",
    # Audit
    "log_audit_event",
    "get_audit_logs",
    "export_audit_logs_csv",
    # Security
    "log_security_event",
    "get_security_summary",
    # Analytics
    "generate_global_analytics",
    # Backups
    "create_filesystem_backup",
    "list_backups",
    "restore_backup",
    "delete_backup",
    # Notifications
    "broadcast_notification",
    "get_active_notifications",
    # Feature Flags
    "get_feature_flag",
    "list_feature_flags",
    "set_feature_flag",
    # Maintenance
    "get_maintenance_config",
    "set_maintenance_config",
    "is_maintenance_active",
    "is_read_only_active",
    "get_maintenance_history",
]
