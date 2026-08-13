import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { useAuthContext, getInitials } from '../../providers/AuthContext'
import { LogOut, User as UserIcon, Shield } from 'lucide-react'

export interface SidebarUserAvatarProps {
  isCollapsed?: boolean
  className?: string
}

export function SidebarUserAvatar({ isCollapsed = false, className = '' }: SidebarUserAvatarProps) {
  const { user, logout, isAuthenticated } = useAuthContext()
  const [showMenu, setShowMenu] = useState(false)
  const triggerRef              = useRef<HTMLDivElement>(null)
  const menuRef                 = useRef<HTMLDivElement>(null)
  const [menuPos, setMenuPos]   = useState({ bottom: 0, left: 0 })

  const displayName  = user?.full_name || user?.email?.split('@')[0] || 'Mehta R.'
  const displayEmail = user?.email || 'mehta.r@ml-platform.internal'
  const displayRole  = (user?.role || 'Admin').toUpperCase()
  const initials     = isAuthenticated ? getInitials(user?.full_name, user?.email) : 'MR'

  // Compute popover position from trigger's screen coordinates
  useLayoutEffect(() => {
    if (showMenu && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      setMenuPos({
        bottom: window.innerHeight - rect.top + 8,   // appear ABOVE the trigger
        left:   rect.left,
      })
    }
  }, [showMenu])

  // Close menu on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        menuRef.current    && !menuRef.current.contains(event.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(event.target as Node)
      ) {
        setShowMenu(false)
      }
    }
    if (showMenu) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showMenu])

  return (
    <div className={`relative ${className}`}>
      <div
        ref={triggerRef}
        onClick={() => setShowMenu((prev) => !prev)}
        className={`flex items-center gap-3 p-2 transition-all duration-200 cursor-pointer select-none ${
          isCollapsed ? 'justify-center p-1.5' : ''
        }`}
        style={{
          borderRadius: '8px 8px 0 8px',
          border: '1px solid transparent',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'rgba(107,92,166,0.20)'
          e.currentTarget.style.background = 'rgba(42,34,71,0.60)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'transparent'
          e.currentTarget.style.background = 'transparent'
        }}
        title={isCollapsed ? `${displayName} (${displayRole})` : undefined}
      >
        {/* Avatar circle — blueberry gradient */}
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-[#F5F1EC] text-xs font-bold shrink-0 tracking-wider"
          style={{
            background: 'linear-gradient(135deg, #4B3B7C, #6E1423)',
            boxShadow: '0 0 0 2px rgba(107,92,166,0.35)',
          }}
        >
          {initials}
        </div>

        {/* User Details */}
        {!isCollapsed && (
          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1">
              <span className="text-xs font-semibold text-[#F5F1EC] truncate">{displayName}</span>
              <span
                className="text-[9px] font-mono px-1.5 py-0.5 rounded shrink-0"
                style={{
                  background: 'rgba(107,92,166,0.15)',
                  color: '#6C5CA6',
                  border: '1px solid rgba(107,92,166,0.25)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {displayRole}
              </span>
            </div>
            <span className="text-[10px] text-[#9E93B8] truncate">{displayEmail}</span>
          </div>
        )}
      </div>

      {/* Popover User Menu — fixed positioning to escape sidebar overflow clipping */}
      {showMenu && (
        <div
          ref={menuRef}
          className="w-56 p-2 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-150"
          style={{
            position: 'fixed',
            bottom:   menuPos.bottom,
            left:     menuPos.left,
            zIndex:   9000,
            background: 'rgba(27,21,48,0.97)',
            border: '1px solid rgba(107,92,166,0.25)',
            borderRadius: '10px 10px 0 10px',
            backdropFilter: 'blur(16px)',
          }}
        >
          <div
            className="px-3 py-2 mb-1"
            style={{ borderBottom: '1px solid rgba(107,92,166,0.12)' }}
          >
            <p className="text-xs font-bold text-[#F5F1EC]">{displayName}</p>
            <p className="text-[10px] text-[#9E93B8] truncate">{displayEmail}</p>
          </div>

          <div className="space-y-0.5">
            <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-[#9E93B8] rounded-lg hover:bg-[rgba(107,92,166,0.10)] transition-colors">
              <Shield className="w-3.5 h-3.5 text-[#C9A24B]" />
              <span>Role: <strong className="text-[#F5F1EC]">{displayRole}</strong></span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-[#9E93B8] rounded-lg hover:bg-[rgba(107,92,166,0.10)] transition-colors">
              <UserIcon className="w-3.5 h-3.5 text-[#6C5CA6]" />
              <span>Status: <strong className="text-[#C9A24B]">Authenticated</strong></span>
            </div>
            <button
              onClick={async () => {
                setShowMenu(false)
                await logout()
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-[#B23A4E] rounded-lg hover:bg-[rgba(178,58,78,0.10)] transition-colors mt-1 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
