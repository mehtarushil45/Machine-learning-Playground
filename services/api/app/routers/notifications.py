"""Notifications Router & WebSocket Endpoint."""

from __future__ import annotations

import asyncio
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, WebSocket, WebSocketDisconnect, status
from fastapi.responses import JSONResponse

from app.dependencies import CurrentUser
from app.schemas.notification import MarkReadResponse, NotificationListResponse, NotificationSchema
from app.websocket.notification_manager import (
    _NOTIFICATIONS_STORE,
    create_notification,
    get_user_notifications,
    notification_manager,
)

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("", response_model=NotificationListResponse, summary="List user notifications")
async def list_notifications(current_user: CurrentUser) -> NotificationListResponse:
    """Retrieve all notifications for the authenticated user."""
    user_id = str(current_user.id)
    notifs = get_user_notifications(user_id)
    unread_count = sum(1 for n in notifs if not n.get("is_read", False))
    return NotificationListResponse(
        unread_count=unread_count,
        notifications=[NotificationSchema(**n) for n in notifs],
    )


@router.patch("/{notification_id}/read", response_model=MarkReadResponse, summary="Mark notification as read")
async def mark_notification_read(
    notification_id: str,
    current_user: CurrentUser,
) -> MarkReadResponse:
    """Mark a specific notification as read by ID."""
    user_id = str(current_user.id)
    notifs = get_user_notifications(user_id)
    found = False
    for n in notifs:
        if n["id"] == notification_id:
            n["is_read"] = True
            found = True
            break

    if not found:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Notification '{notification_id}' not found.",
        )

    unread_count = sum(1 for n in notifs if not n.get("is_read", False))
    return MarkReadResponse(message="Notification marked as read", unread_count=unread_count)


@router.post("/mark-all-read", response_model=MarkReadResponse, summary="Mark all notifications as read")
async def mark_all_notifications_read(current_user: CurrentUser) -> MarkReadResponse:
    """Mark all notifications as read for current user."""
    user_id = str(current_user.id)
    notifs = get_user_notifications(user_id)
    for n in notifs:
        n["is_read"] = True

    return MarkReadResponse(message="All notifications marked as read", unread_count=0)


@router.post("/send-demo", summary="Trigger a demo notification")
async def trigger_demo_notification(
    title: str = Query("Job Completed", description="Notification title"),
    message: str = Query("RandomForest model training completed with 94.2% accuracy.", description="Message body"),
    type_val: str = Query("success", description="info, success, warning, error"),
    user_id: str = Query("demo-user", description="Target user ID"),
) -> dict:
    """Send a demo real-time notification via WebSocket."""
    notif = create_notification(
        user_id=user_id,
        title=title,
        message=message,
        type_val=type_val,
        link="/models/training",
    )
    await notification_manager.send_personal_notification(user_id, notif)
    return {"message": "Notification dispatched", "notification": notif}


@router.websocket("/ws")
async def notifications_websocket(
    websocket: WebSocket,
    user_id: str = Query("default-user", description="User ID for WS session"),
):
    """WebSocket endpoint for real-time notification streaming."""
    await notification_manager.connect(websocket, user_id)
    try:
        # Send initial ping/connection confirmation frame
        await websocket.send_json({
            "event": "CONNECTED",
            "message": f"Real-time notifications connected for user '{user_id}'.",
        })
        while True:
            # Keep connection alive and listen for ping/pong
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        notification_manager.disconnect(websocket, user_id)
    except Exception:
        notification_manager.disconnect(websocket, user_id)
