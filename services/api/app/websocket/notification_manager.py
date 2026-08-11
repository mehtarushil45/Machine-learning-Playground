"""WebSocket Connection Manager & Notification Store."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional
from fastapi import WebSocket

logger = logging.getLogger("apex_notifications")

# In-memory notifications store: user_id -> List[dict]
_NOTIFICATIONS_STORE: Dict[str, List[dict]] = {}


class NotificationConnectionManager:
    """Manages active WebSocket connections grouped by user_id."""

    def __init__(self) -> None:
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: str) -> None:
        """Accept WebSocket connection and register user_id pool."""
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)
        logger.info("WebSocket connected for user %s (%d active connections)", user_id, len(self.active_connections[user_id]))

    def disconnect(self, websocket: WebSocket, user_id: str) -> None:
        """Remove WebSocket connection from user pool."""
        if user_id in self.active_connections:
            if websocket in self.active_connections[user_id]:
                self.active_connections[user_id].remove(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
        logger.info("WebSocket disconnected for user %s", user_id)

    async def send_personal_notification(self, user_id: str, notification: dict) -> None:
        """Push a notification JSON object to all active WebSockets for a specific user_id."""
        # 1. Store in memory store
        if user_id not in _NOTIFICATIONS_STORE:
            _NOTIFICATIONS_STORE[user_id] = []
        _NOTIFICATIONS_STORE[user_id].insert(0, notification)

        # 2. Push real-time WS frame if client is connected
        if user_id in self.active_connections:
            disconnected = []
            for ws in self.active_connections[user_id]:
                try:
                    await ws.send_json({
                        "event": "NOTIFICATION",
                        "data": notification,
                    })
                except Exception as exc:
                    logger.warning("Failed to send WS frame to user %s: %s", user_id, exc)
                    disconnected.append(ws)

            for ws in disconnected:
                self.disconnect(ws, user_id)


notification_manager = NotificationConnectionManager()


def get_user_notifications(user_id: str) -> List[dict]:
    """Retrieve all notifications for a given user_id."""
    return _NOTIFICATIONS_STORE.get(user_id, [])


def create_notification(
    user_id: str,
    title: str,
    message: str,
    type_val: str = "info",
    link: Optional[str] = None,
) -> dict:
    """Create a structured notification dict."""
    return {
        "id": f"notif-{uuid.uuid4().hex[:12]}",
        "user_id": user_id,
        "title": title,
        "message": message,
        "type": type_val,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "is_read": False,
        "link": link,
    }
