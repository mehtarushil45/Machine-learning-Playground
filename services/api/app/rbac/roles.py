"""Role definitions and permission matrix for V7A RBAC.

This module is the single source of truth for all permission grants.
No hardcoded role logic exists inside any router.

Architecture:
    Platform Roles (org-level): PLATFORM_OWNER, ORG_ADMIN
    Workspace Roles (workspace-level): WORKSPACE_ADMIN, ML_ENGINEER,
        DATA_SCIENTIST, REVIEWER, VIEWER

Permission strings use the format: ``resource:action``
"""

from __future__ import annotations

import enum


# ── Role enumerations ─────────────────────────────────────────────────────────

class PlatformRole(str, enum.Enum):
    """Org-level platform roles (encoded in JWT / User.role)."""

    PLATFORM_OWNER = "platform_owner"
    ORG_ADMIN = "org_admin"
    MEMBER = "member"  # default — workspace role governs permissions


class WorkspaceRole(str, enum.Enum):
    """Workspace-level roles (stored in WorkspaceMember.role)."""

    WORKSPACE_ADMIN = "WORKSPACE_ADMIN"
    ML_ENGINEER = "ML_ENGINEER"
    DATA_SCIENTIST = "DATA_SCIENTIST"
    REVIEWER = "REVIEWER"
    VIEWER = "VIEWER"


# ── All permission strings ─────────────────────────────────────────────────────

class Permission(str, enum.Enum):
    """Exhaustive set of all platform permission strings."""

    # Datasets
    DATASETS_READ = "datasets:read"
    DATASETS_CREATE = "datasets:create"
    DATASETS_DELETE = "datasets:delete"

    # Training
    TRAINING_START = "training:start"
    TRAINING_STOP = "training:stop"
    TRAINING_READ = "training:read"

    # Experiments
    EXPERIMENTS_READ = "experiments:read"
    EXPERIMENTS_CREATE = "experiments:create"

    # Models
    MODELS_READ = "models:read"
    MODELS_REGISTER = "models:register"
    MODELS_DELETE = "models:delete"

    # Governance
    GOVERNANCE_READ = "governance:read"
    GOVERNANCE_TRANSITION = "governance:transition"
    GOVERNANCE_OVERRIDE = "governance:override"

    # Deployments
    DEPLOYMENTS_READ = "deployments:read"
    DEPLOYMENTS_CREATE = "deployments:create"
    DEPLOYMENTS_PROMOTE = "deployments:promote"
    DEPLOYMENTS_ROLLBACK = "deployments:rollback"
    DEPLOYMENTS_ARCHIVE = "deployments:archive"

    # Monitoring
    MONITORING_READ = "monitoring:read"
    MONITORING_CREATE = "monitoring:create"
    MONITORING_START = "monitoring:start"
    MONITORING_CHECK = "monitoring:check"
    MONITORING_ACTUALS = "monitoring:actuals"

    # Alerts
    ALERTS_READ = "alerts:read"
    ALERTS_RESOLVE = "alerts:resolve"

    # Retraining
    RETRAINING_READ = "retraining:read"
    RETRAINING_TRIGGER = "retraining:trigger"
    RETRAINING_APPROVE = "retraining:approve"

    # Reports
    REPORTS_READ = "reports:read"
    REPORTS_CREATE = "reports:create"

    # Workspace management
    WORKSPACE_READ = "workspace:read"
    WORKSPACE_UPDATE = "workspace:update"
    WORKSPACE_MANAGE_MEMBERS = "workspace:manage_members"
    WORKSPACE_SETTINGS = "workspace:settings"
    WORKSPACE_DELETE = "workspace:delete"

    # Organisation
    ORG_READ = "org:read"
    ORG_MANAGE = "org:manage"

    # Administration
    ADMIN_IMPERSONATE = "admin:impersonate"


# ── Permission sets per role ───────────────────────────────────────────────────

_P = Permission  # alias for brevity

# Viewer: read-only across all domain areas
_VIEWER_PERMISSIONS: frozenset[str] = frozenset({
    _P.DATASETS_READ,
    _P.TRAINING_READ,
    _P.EXPERIMENTS_READ,
    _P.MODELS_READ,
    _P.GOVERNANCE_READ,
    _P.DEPLOYMENTS_READ,
    _P.MONITORING_READ,
    _P.ALERTS_READ,
    _P.RETRAINING_READ,
    _P.REPORTS_READ,
    _P.WORKSPACE_READ,
})

# Reviewer: can approve governance transitions and alert resolution; no create
_REVIEWER_PERMISSIONS: frozenset[str] = _VIEWER_PERMISSIONS | frozenset({
    _P.GOVERNANCE_TRANSITION,
    _P.ALERTS_RESOLVE,
    _P.RETRAINING_APPROVE,
    _P.DEPLOYMENTS_PROMOTE,  # can promote to production as approver
    _P.REPORTS_CREATE,
})

# Data Scientist: uploads, experiments, actuals submission
_DATA_SCIENTIST_PERMISSIONS: frozenset[str] = _VIEWER_PERMISSIONS | frozenset({
    _P.DATASETS_CREATE,
    _P.DATASETS_DELETE,       # own datasets only — engine enforces "owner" check
    _P.TRAINING_START,
    _P.TRAINING_STOP,
    _P.EXPERIMENTS_CREATE,
    _P.MONITORING_ACTUALS,
    _P.REPORTS_CREATE,
})

# ML Engineer: full ML lifecycle; no workspace admin
_ML_ENGINEER_PERMISSIONS: frozenset[str] = _DATA_SCIENTIST_PERMISSIONS | frozenset({
    _P.MODELS_REGISTER,
    _P.MODELS_DELETE,         # own models only
    _P.GOVERNANCE_TRANSITION,
    _P.DEPLOYMENTS_CREATE,
    _P.DEPLOYMENTS_PROMOTE,
    _P.DEPLOYMENTS_ROLLBACK,
    _P.DEPLOYMENTS_ARCHIVE,
    _P.MONITORING_CREATE,
    _P.MONITORING_START,
    _P.MONITORING_CHECK,
    _P.ALERTS_RESOLVE,
    _P.RETRAINING_TRIGGER,
    _P.RETRAINING_APPROVE,
    _P.ORG_READ,
})

# Workspace Admin: full workspace control
_WORKSPACE_ADMIN_PERMISSIONS: frozenset[str] = _ML_ENGINEER_PERMISSIONS | frozenset({
    _P.GOVERNANCE_OVERRIDE,
    _P.WORKSPACE_UPDATE,
    _P.WORKSPACE_MANAGE_MEMBERS,
    _P.WORKSPACE_SETTINGS,
    _P.WORKSPACE_DELETE,
    _P.ORG_READ,
})

# Org Admin: all workspace permissions + org management
_ORG_ADMIN_PERMISSIONS: frozenset[str] = _WORKSPACE_ADMIN_PERMISSIONS | frozenset({
    _P.ORG_MANAGE,
})

# Platform Owner: all permissions
_PLATFORM_OWNER_PERMISSIONS: frozenset[str] = frozenset(p.value for p in _P)


# ── Public mapping ─────────────────────────────────────────────────────────────

ROLE_PERMISSIONS: dict[str, frozenset[str]] = {
    # Workspace roles
    WorkspaceRole.WORKSPACE_ADMIN.value: _WORKSPACE_ADMIN_PERMISSIONS,
    WorkspaceRole.ML_ENGINEER.value:      _ML_ENGINEER_PERMISSIONS,
    WorkspaceRole.DATA_SCIENTIST.value:   _DATA_SCIENTIST_PERMISSIONS,
    WorkspaceRole.REVIEWER.value:         _REVIEWER_PERMISSIONS,
    WorkspaceRole.VIEWER.value:           _VIEWER_PERMISSIONS,

    # Platform roles (checked by permission_engine before workspace role)
    PlatformRole.PLATFORM_OWNER.value:   _PLATFORM_OWNER_PERMISSIONS,
    PlatformRole.ORG_ADMIN.value:        _ORG_ADMIN_PERMISSIONS,
    PlatformRole.MEMBER.value:           _VIEWER_PERMISSIONS,  # floor for members
}


def has_permission(role: str, permission: str) -> bool:
    """Return True if *role* includes *permission*.

    Args:
        role: A WorkspaceRole or PlatformRole string value.
        permission: A Permission string value (e.g. ``"datasets:read"``).

    Returns:
        True if the role's permission set contains the requested permission.
    """
    perm_set = ROLE_PERMISSIONS.get(role, frozenset())
    return permission in perm_set
