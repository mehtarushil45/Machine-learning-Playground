/**
 * BrandTopBar — persistent top header bar.
 * Shows page title (display serif), breadcrumb, user avatar pill.
 */
import { colors } from '../../tokens'

interface BrandTopBarProps {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  user?: { initials: string; name: string; role?: string }
}

export function BrandTopBar({ title, subtitle, actions, user = { initials: 'SL', name: 'Sentinel Labs' } }: BrandTopBarProps) {
  return (
    <header
      style={{
        height:         56,
        flexShrink:     0,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        padding:        '0 28px',
        borderBottom:   `1px solid ${colors.border}`,
        background:     colors.base,
        gap:            16,
      }}
    >
      {/* Title */}
      <div className="flex flex-col min-w-0">
        <h1
          style={{
            fontFamily:  'var(--font-display)',
            fontSize:    '1.125rem',
            fontWeight:  600,
            color:       colors.text,
            lineHeight:  1.2,
            letterSpacing: '-0.01em',
            margin:      0,
            whiteSpace:  'nowrap',
            overflow:    'hidden',
            textOverflow:'ellipsis',
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p style={{ color: colors.muted, fontSize: '11px', fontFamily: 'var(--font-ui)', margin: 0 }}>
            {subtitle}
          </p>
        )}
      </div>

      {/* Right slot */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {actions}

        {/* Notification bell */}
        <button
          style={{
            background: 'transparent',
            border: 'none',
            color: colors.muted,
            cursor: 'pointer',
            padding: 6,
            borderRadius: 6,
            position: 'relative',
          }}
          title="Notifications"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M9 2a5.5 5.5 0 0 1 5.5 5.5c0 3.5 1.5 4.5 1.5 5H2c0-.5 1.5-1.5 1.5-5A5.5 5.5 0 0 1 9 2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
            <path d="M7.5 15a1.5 1.5 0 0 0 3 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          {/* Unread ping */}
          <span style={{
            position: 'absolute', top: 5, right: 5,
            width: 5, height: 5, borderRadius: '50%',
            background: colors.maroon,
          }} />
        </button>

        {/* User avatar */}
        <div
          style={{
            display:        'flex',
            alignItems:     'center',
            gap:            8,
            padding:        '5px 10px',
            borderRadius:   '8px 8px 0px 8px',
            border:         `1px solid ${colors.border}`,
            cursor:         'pointer',
          }}
        >
          <span
            style={{
              width:           28,
              height:          28,
              borderRadius:    '50%',
              background:      `linear-gradient(135deg, ${colors.primary}, ${colors.maroon})`,
              display:         'flex',
              alignItems:      'center',
              justifyContent:  'center',
              fontSize:        '11px',
              fontWeight:      700,
              color:           colors.text,
              fontFamily:      'var(--font-ui)',
              flexShrink:      0,
            }}
          >
            {user.initials}
          </span>
          <div className="hidden sm:flex flex-col">
            <span style={{ color: colors.text, fontSize: '12px', fontWeight: 500, fontFamily: 'var(--font-ui)', lineHeight: 1.2 }}>
              {user.name}
            </span>
            {user.role && (
              <span style={{ color: colors.muted, fontSize: '10px', fontFamily: 'var(--font-ui)' }}>
                {user.role}
              </span>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
