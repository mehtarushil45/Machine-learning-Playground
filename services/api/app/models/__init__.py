"""Model registry.

Import every model here so that:
1. Alembic's ``env.py`` discovers all tables via ``Base.metadata``.
2. SQLAlchemy relationship resolution works across modules.

Order matters: import parent tables before child tables.
"""

from app.models.organisation import Organisation  # noqa: F401
from app.models.user import User  # noqa: F401
from app.models.dataset import Dataset  # noqa: F401
from app.models.job import Job  # noqa: F401

__all__ = ["Organisation", "User", "Dataset", "Job"]
