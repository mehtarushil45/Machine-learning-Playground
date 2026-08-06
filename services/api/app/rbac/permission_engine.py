"""Permission engine — centralized permission evaluation.

This is the ONLY authoritative source for permission decisions.
No router, service, or model may make role-based decisions independently.

Resolution order:
  1. PLATFORM_OWNER → bypass all checks (always GRANT)
  2. User SUSPENDED → always DENY
  3. ORG_ADMIN within own org → evaluated against ORG_ADMIN permission set
  4. Workspace role → evaluated against ROLE_PERMISSIONS[workspace_role]
  5. No membership / wrong org → DENY
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Callable

from fastapi import Depends, HTTPException, status

from app.rbac.roles import (
    ROLE_PERMISSIONS,
    PlatformRole,
)

if TYPE_CHECKING:
    from app.rbac.workspace_context import WorkspaceContext

logger = logging.getLogger("apex_ml.permission_engine")


# ── Core evaluation (synchronous, no DB) ─────────────────────────────────────

def evaluate_permission(
    workspace_context: "WorkspaceContext",
    permission: str,
) -> bool:
    """Evaluate whether the current workspace context grants *permission*.

    This function is pure (no I/O). All DB resolution happens in
    ``get_workspace_context`` before this is called.

    Args:
        workspace_context: Fully-resolved WorkspaceContext for the request.
        permission: Permission string to evaluate (e.g. ``"datasets:read"``).

    Returns:
        True if permission is granted, False otherwise.
    """
    # 1. Platform owner bypasses everything
    if workspace_context.is_platform_owner:
        return True

    # 2. Suspended users are denied regardless of role
    if workspace_context.user_suspended:
        logger.warning(
            "Permission denied — user %s is SUSPENDED",
            workspace_context.user_id,
        )
        return False

    # 3. Org admin within their own org — uses ORG_ADMIN permission set
    if workspace_context.is_org_admin:
        return permission in ROLE_PERMISSIONS.get(PlatformRole.ORG_ADMIN.value, frozenset())

    # 4. Evaluate workspace role
    if workspace_context.user_role:
        granted = permission in ROLE_PERMISSIONS.get(workspace_context.user_role, frozenset())
        if not granted:
            logger.debug(
                "Permission denied: user=%s role=%s permission=%s workspace=%s",
                workspace_context.user_id,
                workspace_context.user_role,
                permission,
                workspace_context.workspace_id,
            )
        return granted

    # 5. No membership → deny
    return False


def evaluate_owner_permission(
    workspace_context: "WorkspaceContext",
    permission: str,
    resource_created_by: str | None,
) -> bool:
    """Evaluate an owner-only permission.

    Some permissions (e.g. ``datasets:delete``) are granted to any
    ML_ENGINEER but only for resources they created; WORKSPACE_ADMIN
    and above may delete any resource regardless of ownership.

    Args:
        workspace_context: Fully-resolved WorkspaceContext.
        permission: Permission string to evaluate.
        resource_created_by: ``user_id`` of the resource creator (or None).

    Returns:
        True if granted, False otherwise.
    """
    # Platform owner and Org admin bypass owner restrictions
    if workspace_context.is_platform_owner or workspace_context.is_org_admin:
        return True

    # Workspace admin bypasses owner restrictions
    if workspace_context.user_role == "WORKSPACE_ADMIN":
        return evaluate_permission(workspace_context, permission)

    # For everyone else, the resource must belong to the requesting user
    is_owner = resource_created_by == workspace_context.user_id
    if not is_owner:
        return False

    return evaluate_permission(workspace_context, permission)


# ── FastAPI Depends factory ───────────────────────────────────────────────────

def require_permission(permission: str) -> Callable:
    """Return a FastAPI dependency that enforces *permission*.

    Usage in a router::

        @router.post("/datasets")
        async def create_dataset(
            ctx: WorkspaceContext = Depends(require_permission("datasets:create")),
        ):
            ...

    The dependency resolves the workspace context first, then evaluates the
    permission.  On denial it raises HTTP 403.

    Args:
        permission: The permission string to require.

    Returns:
        A FastAPI-compatible async dependency callable.
    """
    # Import inside factory to avoid circular imports, but capture the reference
    # immediately so it is available in the Depends() call below.
    from app.rbac.workspace_context import get_workspace_context as _get_ctx  # noqa: PLC0415

    async def _dependency(
        ctx: "WorkspaceContext" = Depends(_get_ctx),
    ) -> "WorkspaceContext":
        if not evaluate_permission(ctx, permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: '{permission}' is required for this action.",
            )
        return ctx

    # Give the dependency a descriptive name for OpenAPI docs
    _dependency.__name__ = f"require_{permission.replace(':', '_')}"
    return Depends(_dependency)
