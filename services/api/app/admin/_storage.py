"""Shared storage utilities for the admin package.

Extracted from individual managers to eliminate duplication.
Provides atomic, thread-safe filesystem primitives.
"""

import os
import threading
from typing import Optional

from app.config import settings

# Module-level root for all admin isolated storage
ADMIN_ROOT: str = os.path.join(settings.upload_dir, "admin")

# Sub-directory constants
AUDIT_DIR: str = os.path.join(ADMIN_ROOT, "audit")
SECURITY_DIR: str = os.path.join(ADMIN_ROOT, "security")
BACKUP_DIR: str = os.path.join(ADMIN_ROOT, "backups")
NOTIFICATIONS_DIR: str = os.path.join(ADMIN_ROOT, "notifications")
FEATURE_FLAGS_DIR: str = os.path.join(ADMIN_ROOT, "feature_flags")
MAINTENANCE_DIR: str = os.path.join(ADMIN_ROOT, "maintenance")
OPERATIONS_DIR: str = os.path.join(ADMIN_ROOT, "operations")

# Per-domain locks (never reuse a lock across domains)
_LOCKS: dict[str, threading.Lock] = {
    "audit":         threading.Lock(),
    "security":      threading.Lock(),
    "backup":        threading.Lock(),
    "notifications": threading.Lock(),
    "feature_flags": threading.Lock(),
    "maintenance":   threading.Lock(),
    "operations":    threading.Lock(),
}


def get_lock(domain: str) -> threading.Lock:
    """Return the threading lock for a given storage domain."""
    if domain not in _LOCKS:
        raise KeyError(f"Unknown admin storage domain: '{domain}'")
    return _LOCKS[domain]


def ensure_dir(path: str) -> None:
    """Idempotently ensure a directory exists. Thread-safe via exist_ok."""
    os.makedirs(path, exist_ok=True)


def atomic_write(path: str, content: str, domain: str) -> None:
    """Write content atomically to a file using the domain's lock.
    
    Writes to a temp file then renames to ensure no partial writes are visible.
    """
    lock = get_lock(domain)
    tmp_path = path + ".tmp"
    with lock:
        with open(tmp_path, "w", encoding="utf-8") as f:
            f.write(content)
        os.replace(tmp_path, path)


def read_locked(path: str, domain: str) -> Optional[str]:
    """Read file content under the domain's lock, returns None if missing."""
    lock = get_lock(domain)
    with lock:
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                return f.read()
    return None


def append_locked(path: str, line: str, domain: str) -> None:
    """Append a line to a file under the domain's lock."""
    lock = get_lock(domain)
    with lock:
        with open(path, "a", encoding="utf-8") as f:
            f.write(line + "\n")
