"""Model registry.

Import every model here so that:
1. Alembic's ``env.py`` discovers all tables via ``Base.metadata``.
2. SQLAlchemy relationship resolution works across modules.

Order matters: import parent tables before child tables.
"""

from app.models.organisation import Organisation  # noqa: F401
from app.models.user import User, UserRole  # noqa: F401
from app.models.dataset import Dataset  # noqa: F401
from app.models.job import Job  # noqa: F401
from app.models.classroom import (  # noqa: F401
    Assignment,
    Classroom,
    ClassroomMember,
    ClassroomRole,
    Course,
    Feedback,
    PortfolioProject,
    Submission,
    SubmissionStatus,
)

__all__ = [
    "Organisation",
    "User",
    "UserRole",
    "Dataset",
    "Job",
    "Course",
    "Classroom",
    "ClassroomMember",
    "ClassroomRole",
    "Assignment",
    "Submission",
    "SubmissionStatus",
    "Feedback",
    "PortfolioProject",
]
