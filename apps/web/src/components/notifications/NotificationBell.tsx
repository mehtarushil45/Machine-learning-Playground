import { useState, useRef, useEffect } from 'react'
import {
  Bell,
  CheckCircle2,
  AlertTriangle,
  Info,
  AlertOctagon,
  CheckCheck,
  Sparkles,
  X,
  ExternalLink,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { useNotifications } from '../../hooks/useNotifications'
import type { NotificationItem } from '../../types/notification'

export function NotificationBell() {
  const {
    notifications,
    unreadCount,
    isConnected,
    markAsRead,
    markAllAsRead,
    triggerDemoNotification,
  } = useNotifications()

  const [isOpen, setIsOpen] = useState(false)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const popoverRef = useRef<HTMLDivElement>(null)

  // Close popover when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const filteredNotifications = notifications.filter((n) => {
    if (filter === 'unread') return !n.is_read
    return true
  })

  // Format relative timestamp
  const formatTimeAgo = (isoString: string) => {
    try {
      const diffMs = Date.now() - new Date(isoString).getTime()
      const diffMins = Math.floor(diffMs / 60000)
      if (diffMins < 1) return 'Just now'
      if (diffMins < 60) return `${diffMins}m ago`
      const diffHours = Math.floor(diffMins / 60)
      if (diffHours < 24) return `${diffHours}h ago`
      return `${Math.floor(diffHours / 24)}d ago`
    } catch {
      return 'Recently'
    }
  }

  // Type icon mapping
  const renderIcon = (type: NotificationItem['type']) => {
    switch (type) {
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-[#00F5A0] shrink-0" />
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
      case 'error':
        return <AlertOctagon className="w-4 h-4 text-rose-400 shrink-0" />
      default:
        return <Info className="w-4 h-4 text-[#00D4FF] shrink-0" />
    }
  }

  return (
    <div className="relative" ref={popoverRef}>
      {/* Bell Icon Trigger Button */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative p-2 rounded-xl text-[#94A3B8] hover:text-slate-100 hover:bg-[#101E36] transition-all duration-150 cursor-pointer select-none"
        title="Notifications"
        aria-label="Notifications"
      >
        <Bell className="w-4 h-4" />

        {/* WebSocket Connection Status Pulse Dot */}
        <span
          className={`absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full ${
            isConnected ? 'bg-[#00F5A0]' : 'bg-amber-400'
          }`}
          title={isConnected ? 'WebSocket Real-Time Connected' : 'WebSocket Reconnecting...'}
        />

        {/* Unread Count Counter Badge */}
        {unreadCount > 0 && (
          <>
            <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-[#00D4FF] animate-ping" />
            <span className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full bg-[#00D4FF] text-[#070E1C] text-[10px] font-bold shadow-[0_0_10px_#00D4FF]">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          </>
        )}
      </button>

      {/* Notifications Popover Window */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-[#0C1A30]/95 border border-[rgba(0,212,255,0.2)] shadow-2xl backdrop-blur-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Header */}
          <div className="p-3.5 border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-bold text-slate-100 uppercase tracking-wider">Notifications</h4>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-[#00D4FF]/20 text-[#00D4FF] text-[10px] font-bold border border-[#00D4FF]/30">
                  {unreadCount} new
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* WebSocket Indicator */}
              <div
                className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded ${
                  isConnected ? 'text-[#00F5A0] bg-[#00F5A0]/10' : 'text-amber-400 bg-amber-400/10'
                }`}
              >
                {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                <span>{isConnected ? 'Live WS' : 'Offline'}</span>
              </div>

              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="flex items-center gap-1 text-[11px] text-[#00D4FF] hover:underline"
                  title="Mark all as read"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>Mark read</span>
                </button>
              )}

              <button
                onClick={() => setIsOpen(false)}
                className="text-[#64748B] hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex border-b border-[rgba(255,255,255,0.06)] px-3 bg-[#081224]">
            <button
              onClick={() => setFilter('all')}
              className={`py-2 px-3 text-xs font-medium border-b-2 transition-colors ${
                filter === 'all'
                  ? 'border-[#00D4FF] text-[#00D4FF]'
                  : 'border-transparent text-[#64748B] hover:text-slate-300'
              }`}
            >
              All ({notifications.length})
            </button>
            <button
              onClick={() => setFilter('unread')}
              className={`py-2 px-3 text-xs font-medium border-b-2 transition-colors ${
                filter === 'unread'
                  ? 'border-[#00D4FF] text-[#00D4FF]'
                  : 'border-transparent text-[#64748B] hover:text-slate-300'
              }`}
            >
              Unread ({unreadCount})
            </button>
          </div>

          {/* Notification Items List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-[rgba(255,255,255,0.04)]">
            {filteredNotifications.length === 0 ? (
              <div className="p-8 text-center text-[#64748B]">
                <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-xs">No notifications found.</p>
              </div>
            ) : (
              filteredNotifications.map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => !notif.is_read && markAsRead(notif.id)}
                  className={`p-3.5 flex items-start gap-3 transition-colors cursor-pointer ${
                    notif.is_read ? 'bg-transparent hover:bg-white/5' : 'bg-[#101E36]/60 hover:bg-[#101E36]'
                  }`}
                >
                  <div className="mt-0.5">{renderIcon(notif.type)}</div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <h5 className={`text-xs ${notif.is_read ? 'font-medium text-slate-300' : 'font-bold text-slate-100'}`}>
                        {notif.title}
                      </h5>
                      <span className="text-[10px] text-[#64748B] whitespace-nowrap">
                        {formatTimeAgo(notif.timestamp)}
                      </span>
                    </div>

                    <p className="text-[11px] text-[#94A3B8] leading-relaxed line-clamp-2">
                      {notif.message}
                    </p>

                    {notif.link && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-[#00D4FF] mt-1.5 font-medium hover:underline">
                        <span>View details</span>
                        <ExternalLink className="w-3 h-3" />
                      </span>
                    )}
                  </div>

                  {!notif.is_read && (
                    <span className="w-2 h-2 rounded-full bg-[#00D4FF] shrink-0 mt-1" title="Unread" />
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer Action — Live Demo Trigger */}
          <div className="p-2.5 bg-[#081224] border-t border-[rgba(255,255,255,0.06)] flex items-center justify-between">
            <span className="text-[10px] text-[#64748B]">Real-Time Telemetry Stream</span>
            <button
              onClick={() => triggerDemoNotification()}
              className="px-2.5 py-1 rounded-lg bg-[#7B5CF5]/20 hover:bg-[#7B5CF5]/30 text-[#00D4FF] border border-[#7B5CF5]/40 text-[11px] font-medium flex items-center gap-1.5 transition-all"
            >
              <Sparkles className="w-3 h-3 text-[#00F5A0]" />
              <span>Simulate Real-Time Alert</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
