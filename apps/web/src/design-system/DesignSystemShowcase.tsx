/**
 * Design System Showcase — navigates between all 9 screens.
 * Import this component and render it at a route like /design-system.
 *
 * It lazy-loads each screen and injects the design system CSS theme.
 */
import { lazy, Suspense, useState } from 'react'
import './theme.css'
import { colors } from './tokens'

const SCREENS = [
  { id: 'landing',   label: 'Landing Page',         emoji: '🏠', component: lazy(() => import('./screens/LandingPage'))        },
  { id: 'login',     label: 'Login / Sign-Up',       emoji: '🔐', component: lazy(() => import('./screens/LoginScreen'))        },
  { id: 'dashboard', label: 'Dashboard',             emoji: '📊', component: lazy(() => import('./screens/Dashboard'))          },
  { id: 'upload',    label: 'Dataset Upload',        emoji: '📁', component: lazy(() => import('./screens/DatasetUpload'))      },
  { id: 'train',     label: 'Training Config',       emoji: '⚙️',  component: lazy(() => import('./screens/TrainingConfig'))    },
  { id: 'monitor',   label: 'Job Monitoring',        emoji: '📡', component: lazy(() => import('./screens/JobMonitoring'))      },
  { id: 'registry',  label: 'Model Registry',        emoji: '🗂️', component: lazy(() => import('./screens/ModelRegistry'))      },
  { id: 'settings',  label: 'Settings',              emoji: '🔧', component: lazy(() => import('./screens/SettingsPage'))       },
  { id: 'states',    label: 'Empty & Error States',  emoji: '🌐', component: lazy(() => import('./screens/EmptyErrorStates'))   },
] as const

type ScreenId = typeof SCREENS[number]['id']

function Loader() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: colors.base,
      fontFamily: 'var(--font-ui)', color: colors.muted, fontSize: 13,
      gap: 12,
    }}>
      <span style={{
        width: 14, height: 14, borderRadius: '50%',
        border: `2px solid ${colors.primary}`,
        borderTopColor: 'transparent',
        display: 'inline-block',
        animation: 'spin 0.8s linear infinite',
      }} />
      Loading screen…
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

export default function DesignSystemShowcase() {
  const [activeId, setActiveId] = useState<ScreenId>('landing')
  const [showNav, setShowNav]   = useState(true)

  const ActiveScreen = SCREENS.find((s) => s.id === activeId)?.component

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'var(--font-ui)', background: colors.base, overflow: 'hidden' }} className="ds-root">

      {/* ── Picker sidebar ────────────────────────── */}
      {showNav && (
        <div
          style={{
            width: 228,
            background: '#100D1F',
            borderRight: `1px solid ${colors.border}`,
            display: 'flex', flexDirection: 'column',
            flexShrink: 0, zIndex: 100,
          }}
        >
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${colors.border}` }}>
            <p style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.16em',
              textTransform: 'uppercase', color: colors.disabled, margin: 0,
            }}>
              Design System
            </p>
            <p style={{ color: colors.text, fontSize: 13, fontWeight: 600, margin: '4px 0 0' }}>
              Blueberry & Maroon
            </p>
          </div>

          <nav style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
            <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: colors.disabled, padding: '0 20px', marginBottom: 8 }}>
              Screens
            </p>
            {SCREENS.map((screen, i) => {
              const isActive = screen.id === activeId
              return (
                <button
                  key={screen.id}
                  onClick={() => setActiveId(screen.id)}
                  style={{
                    width: '100%',
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 20px',
                    paddingLeft: isActive ? 18 : 20,
                    background: isActive ? 'rgba(107,92,166,0.10)' : 'transparent',
                    border: 'none',
                    borderLeft: isActive ? `2px solid ${colors.maroon}` : '2px solid transparent',
                    color: isActive ? colors.text : colors.muted,
                    fontFamily: 'var(--font-ui)',
                    fontSize: 12, fontWeight: isActive ? 500 : 400,
                    cursor: 'pointer', textAlign: 'left',
                    transition: 'all 150ms',
                  }}
                >
                  <span style={{ fontSize: 14, flexShrink: 0 }}>{screen.emoji}</span>
                  <span style={{ lineHeight: 1.3 }}>
                    <span style={{ display: 'block', fontSize: 9, color: colors.disabled, fontWeight: 600, letterSpacing: '0.06em' }}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    {screen.label}
                  </span>
                </button>
              )
            })}
          </nav>

          {/* Token reference link */}
          <div style={{ padding: '14px 20px', borderTop: `1px solid ${colors.border}` }}>
            <p style={{ color: colors.muted, fontSize: 10, lineHeight: 1.6 }}>
              Design tokens in{' '}
              <code style={{ color: colors.light, fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                design-system/tokens.ts
              </code>
            </p>
          </div>
        </div>
      )}

      {/* ── Screen preview ────────────────────────── */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {/* Toggle nav button */}
        <button
          onClick={() => setShowNav((v) => !v)}
          title={showNav ? 'Hide navigator' : 'Show navigator'}
          style={{
            position: 'absolute', top: 12, right: 12, zIndex: 200,
            background: colors.surface, border: `1px solid ${colors.border}`,
            borderRadius: '6px 6px 0px 6px',
            color: colors.muted, fontSize: 11,
            fontFamily: 'var(--font-ui)',
            padding: '5px 10px', cursor: 'pointer',
          }}
        >
          {showNav ? '← Hide nav' : '→ Show nav'}
        </button>

        <Suspense fallback={<Loader />}>
          {ActiveScreen && <ActiveScreen />}
        </Suspense>
      </div>
    </div>
  )
}
