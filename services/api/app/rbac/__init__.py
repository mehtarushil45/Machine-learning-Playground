"""RBAC — Role-Based Access Control for the enterprise ML platform.

Public exports:
    ROLE_PERMISSIONS  — Immutable role → permission mapping
    require_permission — FastAPI Depends factory
    WorkspaceContext  — Resolved request context dataclass
    get_workspace_context — FastAPI dependency
"""

from app.rbac.roles import ROLE_PERMISSIONS, WorkspaceRole, PlatformRole  # noqa: F401
from app.rbac.permission_engine import require_permission, evaluate_permission  # noqa: F401
from app.rbac.workspace_context import WorkspaceContext, get_workspace_context, get_optional_workspace_context  # noqa: F401

__all__ = [
    "ROLE_PERMISSIONS",
    "WorkspaceRole",
    "PlatformRole",
    "require_permission",
    "evaluate_permission",
    "WorkspaceContext",
    "get_workspace_context",
    "get_optional_workspace_context",
]
