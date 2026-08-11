import { useState, useEffect, useCallback, useRef } from 'react'
import type { NotificationItem, NotificationListResponse } from '../types/notification'
import { useAuthContext } from '../providers/AuthContext'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1'
const WS_BASE = API_BASE.replace(/^http/, 'ws')

export function useNotifications() {
  const { user } = useAuthContext()
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState<number>(0)
  const [isConnected, setIsConnected] = useState<boolean>(false)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<number | null>(null)

  const userId = user?.id || 'demo-user'

  // Fetch initial notifications from REST API
  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/notifications`, {
        credentials: 'include',
      })
      if (res.ok) {
        const data: NotificationListResponse = await res.json()
        setNotifications(data.notifications)
        setUnreadCount(data.unread_count)
      }
    } catch {
      // Endpoint unauthenticated or offline — initialize with sample notifications if empty
      setNotifications((prev) =>
        prev.length === 0
          ? [
              {
                id: 'notif-sample-1',
                user_id: userId,
                title: 'Model Training Completed',
                message: 'RandomForest Classifier trained with 94.8% F1-Score.',
                type: 'success',
                timestamp: new Date().toISOString(),
                is_read: false,
                link: '/models',
              },
              {
                id: 'notif-sample-2',
                user_id: userId,
                title: 'Dataset Ingestion Notice',
                message: 'Churn_Dataset.csv validated and loaded (10,000 rows).',
                type: 'info',
                timestamp: new Date(Date.now() - 3600000).toISOString(),
                is_read: true,
              },
            ]
          : prev
      )
      setUnreadCount((prev) => (prev === 0 ? 1 : prev))
    }
  }, [userId])

  // WebSocket real-time connection manager with automatic retry
  const connectWebSocket = useCallback(() => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return
    }

    try {
      const ws = new WebSocket(`${WS_BASE}/notifications/ws?user_id=${encodeURIComponent(userId)}`)
      wsRef.current = ws

      ws.onopen = () => {
        setIsConnected(true)
      }

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          if (message.event === 'NOTIFICATION' && message.data) {
            const newNotif: NotificationItem = message.data
            setNotifications((prev) => [newNotif, ...prev.filter((n) => n.id !== newNotif.id)])
            setUnreadCount((prev) => prev + 1)
          }
        } catch {
          // Non-JSON frame (e.g. pong)
        }
      }

      ws.onclose = () => {
        setIsConnected(false)
        wsRef.current = null
        reconnectTimeoutRef.current = window.setTimeout(connectWebSocket, 5000)
      }

      ws.onerror = () => {
        ws.close()
      }
    } catch {
      setIsConnected(false)
    }
  }, [userId])

  useEffect(() => {
    fetchNotifications()
    connectWebSocket()

    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [fetchNotifications, connectWebSocket])

  // Mark single notification as read
  const markAsRead = useCallback(async (notificationId: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n))
    )
    setUnreadCount((prev) => Math.max(0, prev - 1))

    try {
      await fetch(`${API_BASE}/notifications/${notificationId}/read`, {
        method: 'PATCH',
        credentials: 'include',
      })
    } catch {
      // Local state optimistic update retained
    }
  }, [])

  // Mark all notifications as read
  const markAllAsRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
    setUnreadCount(0)

    try {
      await fetch(`${API_BASE}/notifications/mark-all-read`, {
        method: 'POST',
        credentials: 'include',
      })
    } catch {
      // Local state optimistic update retained
    }
  }, [])

  // Trigger demo notification
  const triggerDemoNotification = useCallback(async (title?: string, message?: string, typeVal: string = 'success') => {
    try {
      const query = new URLSearchParams({
        title: title || 'Live Real-Time Alert',
        message: message || 'FastAPI WebSocket dispatched real-time telemetry frame.',
        type_val: typeVal,
        user_id: userId,
      })
      await fetch(`${API_BASE}/notifications/send-demo?${query.toString()}`, {
        method: 'POST',
        credentials: 'include',
      })
    } catch {
      // Fallback local insertion if API offline
      const fallbackNotif: NotificationItem = {
        id: `notif-demo-${Date.now()}`,
        user_id: userId,
        title: title || 'Live Real-Time Alert',
        message: message || 'Real-time notification dispatched.',
        type: typeVal as any,
        timestamp: new Date().toISOString(),
        is_read: false,
      }
      setNotifications((prev) => [fallbackNotif, ...prev])
      setUnreadCount((prev) => prev + 1)
    }
  }, [userId])

  return {
    notifications,
    unreadCount,
    isConnected,
    markAsRead,
    markAllAsRead,
    triggerDemoNotification,
    refresh: fetchNotifications,
  }
}
