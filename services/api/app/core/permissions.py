"""Role-Based Access Control (RBAC) & Multi-Tenant Permission Checker.

Defines fine-grained permissions, maps permissions to user roles, and provides
FastAPI dependency guards for endpoint authorization.
"""

import enum
from typing import Dict, Set

from fastapi import Depends, HTTPException, status

from app.models.user import User, UserRole


class Permission(str, enum.Enum):
    # Organisation Management
    ORG_READ = "org:read"
    ORG_MANAGE = "org:manage"
    USER_MANAGE = "user:manage"

    # Classroom & Course Management
    COURSE_CREATE = "course:create"
    CLASSROOM_CREATE = "classroom:create"
    CLASSROOM_MANAGE = "classroom:manage"
    CLASSROOM_JOIN = "classroom:join"

    # Assignment & Learner Submission
    ASSIGNMENT_CREATE = "assignment:create"
    ASSIGNMENT_VIEW = "assignment:view"
    ASSIGNMENT_SUBMIT = "assignment:submit"
    SUBMISSION_VIEW = "submission:view"
    SUBMISSION_REVIEW = "submission:review"
    SUBMISSION_EVALUATE = "submission:evaluate"

    # ML Workbench & Training
    DATASET_UPLOAD = "dataset:upload"
    MODEL_TRAIN = "model:train"
    MODEL_DEPLOY = "model:deploy"
    MODEL_COMPARE = "model:compare"

    # Portfolio & Certificates
    PORTFOLIO_CREATE = "portfolio:create"
    PORTFOLIO_VIEW = "portfolio:view"
    PORTFOLIO_PUBLISH = "portfolio:publish"


# ---------------------------------------------------------------------------
# Permission Matrix mapping User Roles to Permission Sets
# ---------------------------------------------------------------------------
ROLE_PERMISSIONS: Dict[UserRole, Set[Permission]] = {
    UserRole.platform_admin: set(Permission),  # All permissions
    UserRole.owner: set(Permission),
    UserRole.org_admin: {
        Permission.ORG_READ,
        Permission.ORG_MANAGE,
        Permission.USER_MANAGE,
        Permission.COURSE_CREATE,
        Permission.CLASSROOM_CREATE,
        Permission.CLASSROOM_MANAGE,
        Permission.ASSIGNMENT_CREATE,
        Permission.ASSIGNMENT_VIEW,
        Permission.SUBMISSION_VIEW,
        Permission.SUBMISSION_REVIEW,
        Permission.SUBMISSION_EVALUATE,
        Permission.DATASET_UPLOAD,
        Permission.MODEL_TRAIN,
        Permission.MODEL_DEPLOY,
        Permission.MODEL_COMPARE,
        Permission.PORTFOLIO_CREATE,
        Permission.PORTFOLIO_VIEW,
        Permission.PORTFOLIO_PUBLISH,
    },
    UserRole.admin: {
        Permission.ORG_READ,
        Permission.ORG_MANAGE,
        Permission.USER_MANAGE,
        Permission.COURSE_CREATE,
        Permission.CLASSROOM_CREATE,
        Permission.CLASSROOM_MANAGE,
        Permission.ASSIGNMENT_CREATE,
        Permission.ASSIGNMENT_VIEW,
        Permission.SUBMISSION_VIEW,
        Permission.SUBMISSION_REVIEW,
        Permission.SUBMISSION_EVALUATE,
        Permission.DATASET_UPLOAD,
        Permission.MODEL_TRAIN,
        Permission.MODEL_DEPLOY,
        Permission.MODEL_COMPARE,
        Permission.PORTFOLIO_CREATE,
        Permission.PORTFOLIO_VIEW,
        Permission.PORTFOLIO_PUBLISH,
    },
    UserRole.faculty: {
        Permission.ORG_READ,
        Permission.COURSE_CREATE,
        Permission.CLASSROOM_CREATE,
        Permission.CLASSROOM_MANAGE,
        Permission.ASSIGNMENT_CREATE,
        Permission.ASSIGNMENT_VIEW,
        Permission.SUBMISSION_VIEW,
        Permission.SUBMISSION_REVIEW,
        Permission.SUBMISSION_EVALUATE,
        Permission.DATASET_UPLOAD,
        Permission.MODEL_TRAIN,
        Permission.MODEL_DEPLOY,
        Permission.MODEL_COMPARE,
        Permission.PORTFOLIO_CREATE,
        Permission.PORTFOLIO_VIEW,
        Permission.PORTFOLIO_PUBLISH,
    },
    UserRole.lab_coordinator: {
        Permission.ORG_READ,
        Permission.CLASSROOM_MANAGE,
        Permission.ASSIGNMENT_VIEW,
        Permission.SUBMISSION_VIEW,
        Permission.DATASET_UPLOAD,
        Permission.MODEL_TRAIN,
        Permission.MODEL_COMPARE,
        Permission.PORTFOLIO_VIEW,
    },
    UserRole.reviewer: {
        Permission.ORG_READ,
        Permission.ASSIGNMENT_VIEW,
        Permission.SUBMISSION_VIEW,
        Permission.SUBMISSION_REVIEW,
        Permission.SUBMISSION_EVALUATE,
        Permission.MODEL_COMPARE,
        Permission.PORTFOLIO_VIEW,
    },
    UserRole.learner: {
        Permission.ORG_READ,
        Permission.CLASSROOM_JOIN,
        Permission.ASSIGNMENT_VIEW,
        Permission.ASSIGNMENT_SUBMIT,
        Permission.SUBMISSION_VIEW,
        Permission.DATASET_UPLOAD,
        Permission.MODEL_TRAIN,
        Permission.MODEL_COMPARE,
        Permission.PORTFOLIO_CREATE,
        Permission.PORTFOLIO_VIEW,
        Permission.PORTFOLIO_PUBLISH,
    },
    UserRole.member: {
        Permission.ORG_READ,
        Permission.CLASSROOM_JOIN,
        Permission.ASSIGNMENT_VIEW,
        Permission.ASSIGNMENT_SUBMIT,
        Permission.SUBMISSION_VIEW,
        Permission.DATASET_UPLOAD,
        Permission.MODEL_TRAIN,
        Permission.MODEL_COMPARE,
        Permission.PORTFOLIO_CREATE,
        Permission.PORTFOLIO_VIEW,
        Permission.PORTFOLIO_PUBLISH,
    },
    UserRole.viewer: {
        Permission.ORG_READ,
        Permission.ASSIGNMENT_VIEW,
        Permission.SUBMISSION_VIEW,
        Permission.PORTFOLIO_VIEW,
    },
}


def has_permission(role: UserRole, permission: Permission) -> bool:
    """Check if a user role grants a specific permission."""
    perms = ROLE_PERMISSIONS.get(role, set())
    return permission in perms


def check_user_permission(user: User, permission: Permission) -> None:
    """Raise HTTP 403 Forbidden if user role lacks permission."""
    if not has_permission(user.role, permission):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Role '{user.role.value}' does not possess required permission '{permission.value}'.",
        )
