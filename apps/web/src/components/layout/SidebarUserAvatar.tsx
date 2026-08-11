import { useState } from 'react'
import { useAuthContext, getInitials } from '../../providers/AuthContext'
import { LogOut, User as UserIcon, Shield } from 'lucide-react'

export interface SidebarUserAvatarProps {
  isCollapsed?: boolean
  className?: string
}

export function SidebarUserAvatar({ isCollapsed = false, className = '' }: SidebarUserAvatarProps) {
  const { user, logout, isAuthenticated } = useAuthContext()
  const [showMenu, setShowMenu] = useState(false)

  // Determine display name and email with default fallback for presentation
  const displayName = user?.full_name || user?.email?.split('@')[0] || 'Mehta R.'
  const displayEmail = user?.email || 'mehta.r@apex-ml.internal'
  const displayRole = (user?.role || 'QUANTUM ML').toUpperCase()
  
  // Calculate dynamic initials from user profile
  const initials = isAuthenticated
    ? getInitials(user?.full_name, user?.email)
    : 'MR'

  return (
    <div className={`relative ${className}`}>
      <div
        onClick={() => setShowMenu((prev) => !prev)}
        className={`flex items-center gap-3 p-2 rounded-xl transition-all duration-200 cursor-pointer select-none border border-transparent hover:border-[rgba(0,212,255,0.15)] hover:bg-[#101E36]/80 ${
          isCollapsed ? 'justify-center p-1.5' : ''
        }`}
        title={isCollapsed ? `${displayName} (${displayRole})` : undefined}
      >
        {/* Dynamic Initials Avatar Circle with Neon Glow */}
        <div className="w-8 h-8 rounded-full bg-[#101E36] border-2 border-[#7B5CF5] flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-[0_0_12px_rgba(123,92,245,0.4)] tracking-wider transition-transform duration-200 hover:scale-105">
          {initials}
        </div>

        {/* User Details (Visible when Sidebar is Expanded) */}
        {!isCollapsed && (
          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1">
              <span className="text-xs font-semibold text-slate-200 truncate">{displayName}</span>
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#7B5CF5]/20 text-[#00D4FF] border border-[#7B5CF5]/30">
                {displayRole}
              </span>
            </div>
            <span className="text-[10px] text-[#64748B] truncate">{displayEmail}</span>
          </div>
        )}
      </div>

      {/* Popover User Menu */}
      {showMenu && (
        <div className="absolute bottom-full left-0 mb-2 w-56 p-2 rounded-xl bg-[#0C1A30]/95 border border-[rgba(0,212,255,0.2)] shadow-2xl backdrop-blur-xl z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <div className="px-3 py-2 border-b border-[rgba(255,255,255,0.06)] mb-1">
            <p className="text-xs font-bold text-slate-100">{displayName}</p>
            <p className="text-[10px] text-[#64748B] truncate">{displayEmail}</p>
          </div>

          <div className="space-y-0.5">
            <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-300 rounded-lg hover:bg-white/5 transition-colors">
              <Shield className="w-3.5 h-3.5 text-[#00F5A0]" />
              <span>Role: <strong className="text-slate-100">{displayRole}</strong></span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-300 rounded-lg hover:bg-white/5 transition-colors">
              <UserIcon className="w-3.5 h-3.5 text-[#00D4FF]" />
              <span>Status: <strong className="text-[#00F5A0]">Authenticated</strong></span>
            </div>
            <button
              onClick={async () => {
                setShowMenu(false)
                await logout()
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-rose-400 rounded-lg hover:bg-rose-500/10 transition-colors mt-1"
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
