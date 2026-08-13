import { useState, useRef, useEffect, useLayoutEffect } from 'react'
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

  const [isOpen, setIsOpen]     = useState(false)
  const [filter, setFilter]     = useState<'all' | 'unread'>('all')
  const popoverRef              = useRef<HTMLDivElement>(null)
  const buttonRef               = useRef<HTMLButtonElement>(null)
  const [popoverPos, setPopoverPos] = useState({ top: 0, right: 0 })

  // Compute popover position from button's screen coordinates
  useLayoutEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setPopoverPos({
        top:   rect.bottom + 8,
        right: window.innerWidth - rect.right,
      })
    }
  }, [isOpen])

  // Close popover on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        popoverRef.current && !popoverRef.current.contains(event.target as Node) &&
        buttonRef.current  && !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    if (isOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  const filteredNotifications = notifications.filter((n) =>
    filter === 'unread' ? !n.is_read : true
  )

  const formatTimeAgo = (isoString: string) => {
    try {
      const diffMs   = Date.now() - new Date(isoString).getTime()
      const diffMins = Math.floor(diffMs / 60000)
      if (diffMins < 1)  return 'Just now'
      if (diffMins < 60) return `${diffMins}m ago`
      const diffHours = Math.floor(diffMins / 60)
      if (diffHours < 24) return `${diffHours}h ago`
      return `${Math.floor(diffHours / 24)}d ago`
    } catch { return 'Recently' }
  }

  const renderIcon = (type: NotificationItem['type']) => {
    switch (type) {
      case 'success': return <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: '#C9A24B' }} />
      case 'warning': return <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
      case 'error':   return <AlertOctagon  className="w-4 h-4 shrink-0" style={{ color: '#B23A4E' }} />
      default:        return <Info          className="w-4 h-4 shrink-0" style={{ color: '#6C5CA6' }} />
    }
  }

  return (
    <div className="relative">
      {/* Bell trigger */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative p-2 transition-all duration-150 cursor-pointer select-none"
        style={{
          color: '#9E93B8',
          borderRadius: '8px 8px 0 8px',
          border: '1px solid transparent',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = '#F5F1EC'
          e.currentTarget.style.background = 'rgba(107,92,166,0.10)'
          e.currentTarget.style.borderColor = 'rgba(107,92,166,0.20)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = '#9E93B8'
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.borderColor = 'transparent'
        }}
        title="Notifications"
        aria-label="Notifications"
      >
        <Bell className="w-4 h-4" />

        {/* WebSocket status dot — gold = connected */}
        <span
          className="absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full"
          style={{ background: isConnected ? '#C9A24B' : '#9E93B8' }}
          title={isConnected ? 'Real-time connected' : 'Reconnecting…'}
        />

        {/* Unread count badge */}
        {unreadCount > 0 && (
          <span
            className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold"
            style={{
              background: '#6E1423',
              color: '#F5F1EC',
              lineHeight: 1,
              fontFamily: 'var(--font-mono)',
            }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Popover — fixed positioning to escape all overflow:hidden ancestors */}
      {isOpen && (
        <div
          ref={popoverRef}
          className="w-80 sm:w-96 animate-in fade-in slide-in-from-top-2 duration-150"
          style={{
            position: 'fixed',
            top:    popoverPos.top,
            right:  popoverPos.right,
            zIndex: 9000,   // above everything: z-index scale Dropdowns(40) → 9000 for portalled fixed
            background: 'rgba(27,21,48,0.97)',
            border: '1px solid rgba(107,92,166,0.22)',
            borderRadius: '12px 12px 0 12px',
            backdropFilter: 'blur(18px)',
            boxShadow: '0 16px 40px rgba(0,0,0,0.45)',
          }}
        >
          {/* Header */}
          <div
            className="p-3.5 flex items-center justify-between"
            style={{ borderBottom: '1px solid rgba(107,92,166,0.12)' }}
          >
            <div className="flex items-center gap-2">
              <h4
                className="text-xs font-bold text-[#F5F1EC] uppercase tracking-wider"
                style={{ fontFamily: 'var(--font-ui)' }}
              >
                Notifications
              </h4>
              {unreadCount > 0 && (
                <span
                  className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                  style={{
                    background: 'rgba(110,20,35,0.20)',
                    color: '#B23A4E',
                    border: '1px solid rgba(110,20,35,0.30)',
                  }}
                >
                  {unreadCount} new
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* WS indicator */}
              <div
                className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded"
                style={{
                  color: isConnected ? '#C9A24B' : '#9E93B8',
                  background: isConnected ? 'rgba(201,162,75,0.10)' : 'rgba(158,147,184,0.10)',
                }}
              >
                {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                <span>{isConnected ? 'Live' : 'Offline'}</span>
              </div>

              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="flex items-center gap-1 text-[11px] transition-colors cursor-pointer"
                  style={{ color: '#6C5CA6' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#F5F1EC' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#6C5CA6' }}
                  title="Mark all as read"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>Mark read</span>
                </button>
              )}

              <button
                onClick={() => setIsOpen(false)}
                className="transition-colors cursor-pointer"
                style={{ color: '#5E5480' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#F5F1EC' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#5E5480' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Filter tabs */}
          <div
            className="flex px-3"
            style={{ background: '#0B0912', borderBottom: '1px solid rgba(107,92,166,0.10)' }}
          >
            {(['all', 'unread'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                className="py-2 px-3 text-xs font-medium border-b-2 transition-colors capitalize cursor-pointer"
                style={{
                  borderColor: filter === tab ? '#4B3B7C' : 'transparent',
                  color: filter === tab ? '#6C5CA6' : '#9E93B8',
                  fontFamily: 'var(--font-ui)',
                }}
              >
                {tab === 'all'
                  ? `All (${notifications.length})`
                  : `Unread (${unreadCount})`}
              </button>
            ))}
          </div>

          {/* Notification list */}
          <div
            className="max-h-80 overflow-y-auto divide-y"
            style={{ '--tw-divide-color': 'rgba(107,92,166,0.06)' } as React.CSSProperties}
          >
            {filteredNotifications.length === 0 ? (
              <div className="p-8 text-center">
                <Bell className="w-8 h-8 mx-auto mb-2" style={{ color: '#3D3558' }} />
                <p className="text-xs" style={{ color: '#5E5480' }}>No notifications found.</p>
              </div>
            ) : (
              filteredNotifications.map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => !notif.is_read && markAsRead(notif.id)}
                  className="p-3.5 flex items-start gap-3 transition-colors cursor-pointer"
                  style={{
                    background: notif.is_read
                      ? 'transparent'
                      : 'rgba(42,34,71,0.50)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(107,92,166,0.08)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = notif.is_read
                      ? 'transparent'
                      : 'rgba(42,34,71,0.50)'
                  }}
                >
                  <div className="mt-0.5">{renderIcon(notif.type)}</div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <h5
                        className={`text-xs ${notif.is_read ? 'font-medium text-[#9E93B8]' : 'font-bold text-[#F5F1EC]'}`}
                        style={{ fontFamily: 'var(--font-ui)' }}
                      >
                        {notif.title}
                      </h5>
                      <span className="text-[10px] whitespace-nowrap" style={{ color: '#5E5480' }}>
                        {formatTimeAgo(notif.timestamp)}
                      </span>
                    </div>
                    <p className="text-[11px] leading-relaxed line-clamp-2" style={{ color: '#9E93B8' }}>
                      {notif.message}
                    </p>
                    {notif.link && (
                      <span
                        className="inline-flex items-center gap-1 text-[10px] mt-1.5 font-medium"
                        style={{ color: '#6C5CA6' }}
                      >
                        <span>View details</span>
                        <ExternalLink className="w-3 h-3" />
                      </span>
                    )}
                  </div>

                  {!notif.is_read && (
                    <span
                      className="w-2 h-2 rounded-full shrink-0 mt-1"
                      style={{ background: '#4B3B7C' }}
                      title="Unread"
                    />
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div
            className="p-2.5 flex items-center justify-between"
            style={{
              background: '#0B0912',
              borderTop: '1px solid rgba(107,92,166,0.10)',
            }}
          >
            <span className="text-[10px]" style={{ color: '#5E5480' }}>
              Real-Time Telemetry Stream
            </span>
            <button
              onClick={() => triggerDemoNotification()}
              className="px-2.5 py-1 text-[11px] font-medium flex items-center gap-1.5 transition-all cursor-pointer"
              style={{
                background: 'rgba(107,92,166,0.12)',
                border: '1px solid rgba(107,92,166,0.25)',
                borderRadius: '6px 6px 0 6px',
                color: '#6C5CA6',
                fontFamily: 'var(--font-ui)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(107,92,166,0.22)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(107,92,166,0.12)'
              }}
            >
              <Sparkles className="w-3 h-3" style={{ color: '#C9A24B' }} />
              <span>Simulate Alert</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
