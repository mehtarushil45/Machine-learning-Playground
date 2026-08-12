/**
 * BrandSidebar — persistent left nav.
 * Active item: thin 2px maroon left border, NOT a filled block.
 * Collapses to icon-only (64px) via isCollapsed prop.
 */
import { useState } from 'react'
import { colors } from '../../tokens'

export interface SidebarNavItem {
  id: string
  label: string
  icon: React.ReactNode
  group: string
  badge?: number
}

interface BrandSidebarProps {
  items: SidebarNavItem[]
  activeId: string
  onNavigate: (id: string) => void
  isCollapsed?: boolean
  onToggleCollapse?: () => void
  workspaceName?: string
}

export function BrandSidebar({
  items,
  activeId,
  onNavigate,
  isCollapsed = false,
  onToggleCollapse,
  workspaceName = 'Sentinel Labs',
}: BrandSidebarProps) {
  const groups = Array.from(new Set(items.map((i) => i.group)))

  return (
    <aside
      style={{
        width:           isCollapsed ? 64 : 220,
        background:      colors.surface,
        borderRight:     `1px solid ${colors.border}`,
        display:         'flex',
        flexDirection:   'column',
        flexShrink:      0,
        transition:      'width 280ms cubic-bezier(0.4,0,0.2,1)',
        overflow:        'hidden',
        zIndex:          30,
        fontFamily:      'var(--font-ui)',
      }}
    >
      {/* Workspace switcher */}
      <div
        style={{
          height:     56,
          padding:    '0 12px',
          display:    'flex',
          alignItems: 'center',
          gap:        10,
          borderBottom: `1px solid ${colors.border}`,
          flexShrink: 0,
          cursor:     'pointer',
        }}
      >
        {/* Logo mark */}
        <div style={{
          width: 28, height: 28, borderRadius: '6px',
          background: `linear-gradient(135deg, ${colors.primary}, ${colors.maroon})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="3" cy="3"  r="2" fill="white" fillOpacity="0.9" />
            <circle cx="11" cy="3" r="1.5" fill="white" fillOpacity="0.6" />
            <circle cx="7"  cy="11" r="2" fill="white" fillOpacity="0.8" />
            <line x1="3" y1="3" x2="11" y2="3" stroke="white" strokeOpacity="0.5" strokeWidth="1" />
            <line x1="3" y1="3" x2="7"  y2="11" stroke="white" strokeOpacity="0.5" strokeWidth="1" />
            <line x1="11" y1="3" x2="7" y2="11" stroke="white" strokeOpacity="0.4" strokeWidth="1" />
          </svg>
        </div>

        {!isCollapsed && (
          <div className="flex-1 min-w-0 flex items-center justify-between">
            <span style={{ color: colors.text, fontWeight: 600, fontSize: '13px', truncate: true }}>
              {workspaceName}
            </span>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ color: colors.muted, flexShrink: 0 }}>
              <path d="M4 5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
        )}
      </div>

      {/* Nav items */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
        {groups.map((group) => (
          <div key={group} style={{ marginBottom: 20 }}>
            {!isCollapsed && (
              <p style={{
                fontSize: '9px', fontWeight: 700, letterSpacing: '0.14em',
                textTransform: 'uppercase', color: colors.disabled,
                padding: '0 16px', marginBottom: 4,
              }}>
                {group}
              </p>
            )}

            {items.filter((i) => i.group === group).map((item) => {
              const isActive = item.id === activeId
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  style={{
                    width:         '100%',
                    display:       'flex',
                    alignItems:    'center',
                    gap:           10,
                    padding:       isCollapsed ? '10px 0' : '9px 16px',
                    paddingLeft:   isCollapsed ? 0 : isActive ? 14 : 16,
                    justifyContent: isCollapsed ? 'center' : 'flex-start',
                    background:    isActive ? 'rgba(107,92,166,0.08)' : 'transparent',
                    border:        'none',
                    borderLeft:    isActive ? `2px solid ${colors.maroon}` : '2px solid transparent',
                    color:         isActive ? colors.text : colors.muted,
                    fontFamily:    'var(--font-ui)',
                    fontSize:      '13px',
                    fontWeight:    isActive ? 500 : 400,
                    cursor:        'pointer',
                    transition:    'color 150ms, background 150ms',
                    textAlign:     'left',
                    whiteSpace:    'nowrap',
                  }}
                  title={isCollapsed ? item.label : undefined}
                >
                  <span style={{ flexShrink: 0, opacity: isActive ? 1 : 0.65 }}>
                    {item.icon}
                  </span>
                  {!isCollapsed && (
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.label}
                    </span>
                  )}
                  {!isCollapsed && item.badge && item.badge > 0 && (
                    <span style={{
                      background: colors.maroon, color: colors.text,
                      fontSize: '9px', fontWeight: 700, borderRadius: '9999px',
                      padding: '1px 5px', lineHeight: 1.4,
                    }}>
                      {item.badge}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Collapse toggle */}
      {onToggleCollapse && (
        <button
          onClick={onToggleCollapse}
          style={{
            borderTop:  `1px solid ${colors.border}`,
            padding:    '12px',
            display:    'flex',
            justifyContent: isCollapsed ? 'center' : 'flex-end',
            background: 'transparent',
            border:     `none`,
            borderTop:  `1px solid ${colors.border}`,
            color:      colors.muted,
            cursor:     'pointer',
          }}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            {isCollapsed
              ? <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              : <path d="M10 4L6 8l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            }
          </svg>
        </button>
      )}
    </aside>
  )
}

/** Icon shorthand components for nav items */
export function NavIcon({ path, size = 16 }: { path: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d={path} stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
