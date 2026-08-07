"""Backup Manager — V7B.

Thread-safe, isolated filesystem backup management.
Never overwrites V1–V7A storage.
"""

from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from typing import List

from app.admin._storage import BACKUP_DIR, atomic_write, ensure_dir, get_lock
from app.schemas.admin import BackupResponse


def create_filesystem_backup(components: List[str]) -> BackupResponse:
    """Record a new backup metadata entry."""
    ensure_dir(BACKUP_DIR)
    ts = datetime.now(timezone.utc)
    backup_id = f"backup_{ts.strftime('%Y%m%d%H%M%S')}_{uuid.uuid4().hex[:8]}"

    meta = BackupResponse(
        backup_id=backup_id,
        timestamp=ts,
        size_bytes=1_048_576,  # Placeholder; real impl would walk FS
        components=components,
        is_restorable=True,
    )
    path = os.path.join(BACKUP_DIR, f"{backup_id}.json")
    atomic_write(path, meta.model_dump_json(), "backup")
    return meta


def list_backups() -> List[BackupResponse]:
    """List all recorded backup entries sorted newest first."""
    ensure_dir(BACKUP_DIR)
    backups: List[BackupResponse] = []
    lock = get_lock("backup")
    with lock:
        for fname in sorted(os.listdir(BACKUP_DIR)):
            if not fname.endswith(".json"):
                continue
            path = os.path.join(BACKUP_DIR, fname)
            try:
                with open(path, "r", encoding="utf-8") as f:
                    backups.append(BackupResponse.model_validate_json(f.read()))
            except Exception:
                pass
    backups.sort(key=lambda b: b.timestamp, reverse=True)
    return backups


def restore_backup(backup_id: str, confirm_overwrite: bool = False) -> bool:
    """Simulate restoring a backup. Requires explicit confirmation."""
    if not confirm_overwrite:
        raise ValueError("Overwrite confirmation required to restore a backup. Set confirm_overwrite=true.")
    ensure_dir(BACKUP_DIR)
    path = os.path.join(BACKUP_DIR, f"{backup_id}.json")
    lock = get_lock("backup")
    with lock:
        if not os.path.exists(path):
            raise FileNotFoundError(f"Backup '{backup_id}' not found.")
    # Actual restoration would unzip/copy files here
    return True


def delete_backup(backup_id: str) -> bool:
    """Delete a backup metadata entry."""
    ensure_dir(BACKUP_DIR)
    path = os.path.join(BACKUP_DIR, f"{backup_id}.json")
    lock = get_lock("backup")
    with lock:
        if os.path.exists(path):
            os.remove(path)
            return True
    return False
