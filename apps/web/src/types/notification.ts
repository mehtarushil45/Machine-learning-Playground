export type NotificationType = 'info' | 'success' | 'warning' | 'error'

export interface NotificationItem {
  id: string
  user_id: string
  title: string
  message: string
  type: NotificationType
  timestamp: string
  is_read: boolean
  link?: string | null
}

export interface NotificationListResponse {
  unread_count: number
  notifications: NotificationItem[]
}

export interface MarkReadResponse {
  message: string
  unread_count: number
}
