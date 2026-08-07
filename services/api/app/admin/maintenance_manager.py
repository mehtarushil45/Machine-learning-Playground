"""Maintenance Manager — V7B.

Platform-wide maintenance mode, read-only mode, scheduled windows, and history.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import List, Optional

from app.admin._storage import MAINTENANCE_DIR, atomic_write, ensure_dir, get_lock
from app.schemas.admin import MaintenanceConfig, MaintenanceHistoryEntry

_CONFIG_FILE = os.path.join(MAINTENANCE_DIR, "config.json")
_HISTORY_FILE = os.path.join(MAINTENANCE_DIR, "history.jsonl")


def get_maintenance_config() -> MaintenanceConfig:
    """Return the current maintenance configuration."""
    ensure_dir(MAINTENANCE_DIR)
    lock = get_lock("maintenance")
    with lock:
        if os.path.exists(_CONFIG_FILE):
            try:
                with open(_CONFIG_FILE, "r", encoding="utf-8") as f:
                    return MaintenanceConfig.model_validate_json(f.read())
            except Exception:
                pass
    return MaintenanceConfig()


def set_maintenance_config(config: MaintenanceConfig) -> MaintenanceConfig:
    """Persist the updated maintenance configuration and append history entry."""
    ensure_dir(MAINTENANCE_DIR)
    entry = MaintenanceHistoryEntry(
        timestamp=datetime.now(timezone.utc),
        is_maintenance_mode=config.is_maintenance_mode,
        is_read_only_mode=config.is_read_only_mode,
        message=config.message,
    )
    atomic_write(_CONFIG_FILE, config.model_dump_json(), "maintenance")
    # Append to history (outside lock since atomic_write already serialises)
    lock = get_lock("maintenance")
    with lock:
        with open(_HISTORY_FILE, "a", encoding="utf-8") as f:
            f.write(entry.model_dump_json() + "\n")
    return config


def get_maintenance_history() -> List[MaintenanceHistoryEntry]:
    """Return historical maintenance config changes (newest first)."""
    ensure_dir(MAINTENANCE_DIR)
    entries: List[MaintenanceHistoryEntry] = []
    lock = get_lock("maintenance")
    with lock:
        if os.path.exists(_HISTORY_FILE):
            with open(_HISTORY_FILE, "r", encoding="utf-8") as f:
                for line in f:
                    if line.strip():
                        try:
                            entries.append(MaintenanceHistoryEntry.model_validate_json(line))
                        except Exception:
                            pass
    entries.reverse()
    return entries


def is_maintenance_active() -> bool:
    """Quick helper — returns True if platform is in maintenance mode."""
    return get_maintenance_config().is_maintenance_mode


def is_read_only_active() -> bool:
    """Returns True if platform is in read-only mode."""
    return get_maintenance_config().is_read_only_mode
