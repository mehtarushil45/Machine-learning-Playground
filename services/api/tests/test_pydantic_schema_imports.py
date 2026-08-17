"""Pydantic V2 Schema Imports Regression Test.

Verifies that:
1. `app.schemas` imports cleanly without any PydanticUserError or Config conflicts.
2. `app.main` (FastAPI application and all routers) imports cleanly.
3. `services.worker.tasks` (Celery worker task modules) imports cleanly.
4. All BaseModel classes in `app.schemas` generate valid JSON schemas without error.
"""

import importlib
import inspect
import pytest
from pydantic import BaseModel


def test_app_schemas_import_cleanly():
    """Verify that app.schemas can be imported without PydanticUserError."""
    import app.schemas
    assert app.schemas is not None


def test_app_main_import_cleanly():
    """Verify that app.main (FastAPI app) imports all schemas and routers cleanly."""
    import app.main
    assert app.main.app is not None


def test_worker_tasks_import_cleanly():
    """Verify that services.worker.tasks imports cleanly without schema errors."""
    import services.worker.tasks
    assert services.worker.tasks is not None


def test_all_schemas_json_schema_generation():
    """Inspect all exported classes in app.schemas and ensure json_schema generates."""
    import app.schemas

    checked_models = 0
    for name, obj in inspect.getmembers(app.schemas):
        if inspect.isclass(obj) and issubclass(obj, BaseModel):
            # Verify JSON schema generation works without Pydantic configuration errors
            schema = obj.model_json_schema()
            assert isinstance(schema, dict)
            assert "title" in schema or "properties" in schema or "type" in schema
            checked_models += 1

    assert checked_models > 20, f"Expected >20 BaseModel schemas checked, found {checked_models}"
