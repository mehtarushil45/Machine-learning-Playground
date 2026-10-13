"""Tests for Code Studio Server-side Workspace & Persistence (Phase 2)."""

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_workspace_lifecycle_and_crud():
    project_id = "test_phase2_proj"

    # 1. Initialize & list workspace
    resp = client.get(f"/api/v1/code-execution/workspaces/{project_id}/files")
    assert resp.status_code == 200
    data = resp.json()
    assert data["project_id"] == project_id
    paths = [f["path"] for f in data["files"]]
    assert "data" in paths
    assert "outputs" in paths
    assert any(p.endswith(".py") for p in paths)

    # 2. Create new file
    create_resp = client.post(
        f"/api/v1/code-execution/workspaces/{project_id}/create-file",
        json={"filename": "feature_engineering.py", "content": "import pandas as pd\n"},
    )
    assert create_resp.status_code == 200

    # 3. Save / autosave file
    updated_content = "import pandas as pd\ndef add_features(df):\n    return df\n"
    save_resp = client.post(
        f"/api/v1/code-execution/workspaces/{project_id}/file",
        json={"filename": "feature_engineering.py", "content": updated_content},
    )
    assert save_resp.status_code == 200

    # 4. Read file content
    read_resp = client.get(
        f"/api/v1/code-execution/workspaces/{project_id}/file",
        params={"filename": "feature_engineering.py"},
    )
    assert read_resp.status_code == 200
    assert read_resp.json()["content"] == updated_content

    # 5. Rename file
    rename_resp = client.post(
        f"/api/v1/code-execution/workspaces/{project_id}/rename-file",
        json={"old_filename": "feature_engineering.py", "new_filename": "features.py"},
    )
    assert rename_resp.status_code == 200

    # 6. Verify old file is gone and new exists
    read_old = client.get(
        f"/api/v1/code-execution/workspaces/{project_id}/file",
        params={"filename": "feature_engineering.py"},
    )
    assert read_old.status_code == 404

    read_new = client.get(
        f"/api/v1/code-execution/workspaces/{project_id}/file",
        params={"filename": "features.py"},
    )
    assert read_new.status_code == 200
    assert read_new.json()["content"] == updated_content

    # 7. Delete file
    del_resp = client.delete(
        f"/api/v1/code-execution/workspaces/{project_id}/file",
        params={"filename": "features.py"},
    )
    assert del_resp.status_code == 200


def test_workspace_security_guardrails():
    project_id = "test_phase2_security"

    # 1. Path traversal defense on read
    resp = client.get(
        f"/api/v1/code-execution/workspaces/{project_id}/file",
        params={"filename": "../../app/main.py"},
    )
    assert resp.status_code == 400

    # 2. Path traversal defense on write
    resp = client.post(
        f"/api/v1/code-execution/workspaces/{project_id}/file",
        json={"filename": "../../../escaped.py", "content": "malicious"},
    )
    assert resp.status_code == 400

    # 3. Read-only guard: writing into data/ is forbidden
    resp = client.post(
        f"/api/v1/code-execution/workspaces/{project_id}/file",
        json={"filename": "data/dataset.csv", "content": "overwrite"},
    )
    assert resp.status_code == 403

    # 4. Read-only guard: deleting data directory or files inside is forbidden
    resp = client.delete(
        f"/api/v1/code-execution/workspaces/{project_id}/file",
        params={"filename": "data"},
    )
    assert resp.status_code == 403
