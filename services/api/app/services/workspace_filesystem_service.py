"""Enterprise Workspace Filesystem Service -- ML Playground Pillar 2 (Code Studio).

Provides server-side workspace persistence and file lifecycle operations:
  - Per-project isolated directory structure:
      {workspace_root}/
        data/       (Read-only dataset mount)
        outputs/    (Writable execution artifacts directory)
        *.py        (User code files)
  - Path traversal and security guardrails
  - File CRUD operations (list, read, write/autosave, create, rename, delete)
  - Safe dataset mounting
  - Execution sandbox staging and artifact sync-back
"""

from __future__ import annotations

import logging
import os
import re
import shutil
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status

logger = logging.getLogger("apex_ml.workspace_filesystem")

# Base directory for all project workspaces
try:
    from services.worker.core.dataset_loader import UPLOADS_DIR
except ImportError:
    UPLOADS_DIR = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "uploads")
    )

WORKSPACES_ROOT = os.path.join(UPLOADS_DIR, "workspaces")
os.makedirs(WORKSPACES_ROOT, exist_ok=True)

# Whitelist allowed extensions for safety
ALLOWED_EXTENSIONS = {
    ".py", ".json", ".yaml", ".yml", ".txt", ".csv", ".tsv",
    ".md", ".sql", ".ini", ".cfg", ".toml", ".joblib", ".pkl",
    ".onnx", ".png", ".jpg", ".jpeg", ".svg"
}

RESERVED_DIRECTORIES = {"data", "outputs"}


def sanitize_project_id(project_id: Optional[str]) -> str:
    """Sanitize project identifier to prevent path traversal or invalid directory names."""
    if not project_id:
        return "default_project"
    cleaned = re.sub(r"[^a-zA-Z0-9_\-]", "", str(project_id).strip())
    return cleaned if cleaned else "default_project"


def get_project_workspace_root(project_id: Optional[str]) -> Path:
    """Return the absolute path to the project's workspace directory."""
    safe_id = sanitize_project_id(project_id)
    root = (Path(WORKSPACES_ROOT) / safe_id).resolve()
    
    # Ensure standard workspace folders exist
    os.makedirs(root, exist_ok=True)
    os.makedirs(root / "data", exist_ok=True)
    os.makedirs(root / "outputs", exist_ok=True)
    
    return root


def resolve_safe_path(root: Path, rel_path: str) -> Path:
    """Resolve a relative path within the workspace root, preventing path traversal."""
    if not rel_path or not rel_path.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Filename cannot be empty.",
        )
    
    # Disallow null bytes or backslash shenanigans
    if "\0" in rel_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid filename: null byte detected.",
        )
    
    # Normalize separators
    normalized = rel_path.replace("\\", "/").strip().lstrip("/")
    
    # Check for relative traversal components
    parts = normalized.split("/")
    if ".." in parts:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Path traversal detected: '..' is forbidden.",
        )
    
    target = (root / normalized).resolve()
    
    try:
        # Verify target is contained strictly within root
        target.relative_to(root.resolve())
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Access denied: path escapes workspace boundaries.",
        )
    
    return target


def sync_dataset_to_workspace(project_id: str, dataset_id: Optional[str] = None) -> bool:
    """Mount / stage project dataset files into the read-only data/ workspace folder."""
    root = get_project_workspace_root(project_id)
    data_dir = root / "data"
    os.makedirs(data_dir, exist_ok=True)

    src_csv: Optional[str] = None
    if dataset_id:
        try:
            from services.worker.core.dataset_loader import find_dataset_path
            src_csv = find_dataset_path(dataset_id)
        except Exception as exc:
            logger.debug("Dataset lookup for %s failed: %s", dataset_id, exc)

    if not src_csv and os.path.exists(UPLOADS_DIR):
        # Look for any recent dataset CSV
        for fname in os.listdir(UPLOADS_DIR):
            if fname.endswith(".csv") and not fname.startswith("."):
                src_csv = os.path.join(UPLOADS_DIR, fname)
                break

    if src_csv and os.path.isfile(src_csv):
        base_name = os.path.basename(src_csv)
        dest = data_dir / base_name
        dest_canonical = data_dir / "dataset.csv"
        try:
            shutil.copy2(src_csv, dest)
            if dest != dest_canonical:
                shutil.copy2(src_csv, dest_canonical)
            logger.info("Mounted dataset %s into workspace %s data/", base_name, project_id)
            return True
        except Exception as copy_exc:
            logger.warning("Failed to copy dataset to workspace data: %s", copy_exc)
            return False

    return False


def ensure_project_workspace(
    project_id: str,
    dataset_id: Optional[str] = None,
    initial_code: Optional[str] = None,
) -> Dict[str, Any]:
    """Initialize a project workspace with starter files, data mount, and outputs directory."""
    root = get_project_workspace_root(project_id)
    
    # Sync dataset into data/
    sync_dataset_to_workspace(project_id, dataset_id)

    # If no python files exist, create default pipeline_generated.py
    py_files = list(root.glob("*.py"))
    if not py_files:
        default_file = root / "pipeline_generated.py"
        code = initial_code or (
            "# Machine Learning Experiment Pipeline\n"
            "import numpy as np\n"
            "import pandas as pd\n\n"
            "# Read dataset from mounted read-only data directory\n"
            "df = pd.read_csv('data/dataset.csv')\n"
            "print('Dataset shape:', df.shape)\n"
        )
        default_file.write_text(code, encoding="utf-8")

    return {
        "project_id": sanitize_project_id(project_id),
        "workspace_root": str(root),
        "files": list_workspace_files(project_id),
    }


def list_workspace_files(project_id: str) -> List[Dict[str, Any]]:
    """List all files and directories in the project workspace with metadata."""
    root = get_project_workspace_root(project_id)
    items: List[Dict[str, Any]] = []

    for path in sorted(root.rglob("*")):
        try:
            rel = path.relative_to(root).as_posix()
        except ValueError:
            continue

        # Skip hidden files or caches
        if any(part.startswith(".") or part == "__pycache__" for part in path.parts):
            continue

        is_dir = path.is_dir()
        is_readonly = rel.startswith("data/") or rel == "data"
        
        stat = path.stat()
        items.append({
            "name": path.name,
            "path": rel,
            "is_dir": is_dir,
            "is_readonly": is_readonly,
            "size": stat.st_size if not is_dir else 0,
            "modified_at": stat.st_mtime,
        })

    return items


def read_workspace_file(project_id: str, filename: str) -> str:
    """Read UTF-8 content of a file in the project workspace."""
    root = get_project_workspace_root(project_id)
    target = resolve_safe_path(root, filename)

    if not target.exists() or not target.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"File '{filename}' not found in workspace.",
        )

    try:
        return target.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        # Binary file fallback
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File '{filename}' is a binary artifact and cannot be edited as text.",
        )


def write_workspace_file(project_id: str, filename: str, content: str) -> Dict[str, Any]:
    """Write/autosave content to a file in the project workspace."""
    root = get_project_workspace_root(project_id)
    target = resolve_safe_path(root, filename)
    rel = target.relative_to(root).as_posix()

    # Guard: data/ is strictly read-only
    if rel == "data" or rel.startswith("data/"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The 'data/' directory is read-only. Uploaded datasets cannot be modified directly.",
        )

    # Ensure parent folder exists if writing to subfolder
    target.parent.mkdir(parents=True, exist_ok=True)

    try:
        target.write_text(content, encoding="utf-8")
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to write file '{filename}': {exc}",
        )

    stat = target.stat()
    return {
        "filename": rel,
        "size": stat.st_size,
        "modified_at": stat.st_mtime,
        "status": "saved",
    }


def create_workspace_file(
    project_id: str,
    filename: str,
    content: str = "",
    is_dir: bool = False,
) -> Dict[str, Any]:
    """Create a new file or directory in the project workspace."""
    root = get_project_workspace_root(project_id)
    target = resolve_safe_path(root, filename)
    rel = target.relative_to(root).as_posix()

    if rel == "data" or rel.startswith("data/"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot create files inside the read-only 'data/' directory.",
        )

    if target.exists():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A file or directory named '{filename}' already exists.",
        )

    if is_dir:
        target.mkdir(parents=True, exist_ok=True)
        return {"filename": rel, "is_dir": True, "status": "created"}
    else:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        stat = target.stat()
        return {
            "filename": rel,
            "is_dir": False,
            "size": stat.st_size,
            "modified_at": stat.st_mtime,
            "status": "created",
        }


def rename_workspace_file(
    project_id: str,
    old_filename: str,
    new_filename: str,
) -> Dict[str, Any]:
    """Rename a file or directory in the project workspace."""
    root = get_project_workspace_root(project_id)
    old_target = resolve_safe_path(root, old_filename)
    new_target = resolve_safe_path(root, new_filename)

    old_rel = old_target.relative_to(root).as_posix()
    new_rel = new_target.relative_to(root).as_posix()

    if old_rel in RESERVED_DIRECTORIES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Cannot rename reserved directory '{old_rel}'.",
        )

    if old_rel.startswith("data/") or new_rel.startswith("data/"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot rename files into or inside the read-only 'data/' directory.",
        )

    if not old_target.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"File '{old_filename}' does not exist.",
        )

    if new_target.exists():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Target file '{new_filename}' already exists.",
        )

    new_target.parent.mkdir(parents=True, exist_ok=True)
    old_target.rename(new_target)

    return {
        "old_filename": old_rel,
        "new_filename": new_rel,
        "status": "renamed",
    }


def delete_workspace_file(project_id: str, filename: str) -> Dict[str, Any]:
    """Delete a file or empty directory in the project workspace."""
    root = get_project_workspace_root(project_id)
    target = resolve_safe_path(root, filename)
    rel = target.relative_to(root).as_posix()

    if rel in RESERVED_DIRECTORIES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Cannot delete reserved directory '{rel}'.",
        )

    if rel.startswith("data/"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot delete files inside the read-only 'data/' directory.",
        )

    if not target.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"File '{filename}' not found.",
        )

    if target.is_dir():
        shutil.rmtree(target)
    else:
        target.unlink()

    return {"filename": rel, "status": "deleted"}
