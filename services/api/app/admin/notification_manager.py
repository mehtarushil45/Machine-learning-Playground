"""Notification Manager — V7B.

Global broadcast and maintenance notification state management.
"""

from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from typing import List

from app.admin._storage import NOTIFICATIONS_DIR, atomic_write, ensure_dir, get_lock
from app.schemas.admin import NotificationCreate, NotificationResponse


def broadcast_notification(data: NotificationCreate) -> NotificationResponse:
    """Create a new platform-wide notification."""
    ensure_dir(NOTIFICATIONS_DIR)
    notif_id = str(uuid.uuid4())
    notif = NotificationResponse(
        id=notif_id,
        title=data.title,
        message=data.message,
        level=data.level,
        expires_at=data.expires_at,
        created_at=datetime.now(timezone.utc),
        is_active=True,
    )
    path = os.path.join(NOTIFICATIONS_DIR, f"{notif_id}.json")
    atomic_write(path, notif.model_dump_json(), "notifications")
    return notif


def get_active_notifications() -> List[NotificationResponse]:
    """Return all currently active (non-expired) notifications."""
    ensure_dir(NOTIFICATIONS_DIR)
    notifications: List[NotificationResponse] = []
    now = datetime.now(timezone.utc)
    lock = get_lock("notifications")
    with lock:
        for fname in os.listdir(NOTIFICATIONS_DIR):
            if not fname.endswith(".json"):
                continue
            path = os.path.join(NOTIFICATIONS_DIR, fname)
            try:
                with open(path, "r", encoding="utf-8") as f:
                    notif = NotificationResponse.model_validate_json(f.read())
                if notif.is_active and (notif.expires_at is None or notif.expires_at > now):
                    notifications.append(notif)
            except Exception:
                pass
    notifications.sort(key=lambda n: n.created_at, reverse=True)
    return notifications


def get_all_notifications() -> List[NotificationResponse]:
    """Return all notifications regardless of active state."""
    ensure_dir(NOTIFICATIONS_DIR)
    notifications: List[NotificationResponse] = []
    lock = get_lock("notifications")
    with lock:
        for fname in os.listdir(NOTIFICATIONS_DIR):
            if not fname.endswith(".json"):
                continue
            path = os.path.join(NOTIFICATIONS_DIR, fname)
            try:
                with open(path, "r", encoding="utf-8") as f:
                    notifications.append(NotificationResponse.model_validate_json(f.read()))
            except Exception:
                pass
    notifications.sort(key=lambda n: n.created_at, reverse=True)
    return notifications


def dismiss_notification(notif_id: str) -> bool:
    """Mark a notification as inactive (dismissed)."""
    ensure_dir(NOTIFICATIONS_DIR)
    path = os.path.join(NOTIFICATIONS_DIR, f"{notif_id}.json")
    lock = get_lock("notifications")
    with lock:
        if not os.path.exists(path):
            return False
        try:
            with open(path, "r", encoding="utf-8") as f:
                notif = NotificationResponse.model_validate_json(f.read())
        except Exception:
            return False
        notif.is_active = False
    # atomic_write outside read lock to avoid deadlock
    atomic_write(path, notif.model_dump_json(), "notifications")
    return True
