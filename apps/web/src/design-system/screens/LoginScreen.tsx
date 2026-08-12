/**
 * Screen 2 — Login / Sign-Up
 * Split layout: left = thread-node motif hero, right = form panel.
 */
import { useState } from 'react'
import { ThreadNode } from '../components/ui/ThreadNode'
import { BrandButton } from '../components/ui/BrandButton'
import { BrandInput, FieldLabel } from '../components/ui/BrandInput'
import { colors } from '../tokens'

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'login' | 'signup'>('login')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setTimeout(() => setLoading(false), 1800)
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: colors.base, fontFamily: 'var(--font-ui)' }} className="ds-root">

      {/* ── Left panel — motif hero ─────────────────── */}
      <div
        style={{
          flex: '0 0 58%',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '32px 48px',
          overflow: 'hidden',
        }}
        className="hidden md:flex"
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: `linear-gradient(135deg, ${colors.primary}, ${colors.maroon})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
              <circle cx="3" cy="3" r="2" fill="white" fillOpacity="0.9"/>
              <circle cx="11" cy="3" r="1.5" fill="white" fillOpacity="0.6"/>
              <circle cx="7" cy="11" r="2" fill="white" fillOpacity="0.8"/>
              <line x1="3" y1="3" x2="11" y2="3" stroke="white" strokeOpacity="0.4" strokeWidth="1"/>
              <line x1="3" y1="3" x2="7" y2="11" stroke="white" strokeOpacity="0.4" strokeWidth="1"/>
              <line x1="11" y1="3" x2="7" y2="11" stroke="white" strokeOpacity="0.4" strokeWidth="1"/>
            </svg>
          </div>
          <span style={{ fontWeight: 700, fontSize: 15, color: colors.text }}>ML Platform</span>
        </div>

        {/* Centered motif */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ThreadNode variant="empty" style={{ width: 340, height: 250 }} />
        </div>

        {/* Pull quote */}
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 420 }}>
          <p style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(1.1rem, 2vw, 1.5rem)',
            fontWeight: 400,
            color: colors.muted,
            lineHeight: 1.5,
            fontStyle: 'italic',
          }}>
            "The platform that connects your data to decisions — with precision and speed."
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 20 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: colors.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
              AR
            </div>
            <div>
              <p style={{ color: colors.text, fontSize: 12, fontWeight: 600, margin: 0 }}>Avery R.</p>
              <p style={{ color: colors.muted, fontSize: 11, margin: 0 }}>Head of Data Science, Axiom Group</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Right panel — form ──────────────────────── */}
      <div
        style={{
          flex: 1,
          background: colors.surface,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 32px',
          borderLeft: `1px solid ${colors.border}`,
        }}
      >
        <div style={{ width: '100%', maxWidth: 360 }}>
          {/* Heading */}
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: '2rem',
            fontWeight: 600,
            color: colors.text,
            marginBottom: 6,
            letterSpacing: '-0.02em',
          }}>
            {mode === 'login' ? 'Welcome back' : 'Create account'}
          </h1>
          <p style={{ color: colors.muted, fontSize: 13, marginBottom: 32 }}>
            {mode === 'login'
              ? 'Sign in to your workspace to continue.'
              : 'Set up your ML Platform workspace.'}
          </p>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div>
              <FieldLabel htmlFor="email">Email address</FieldLabel>
              <BrandInput
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <FieldLabel htmlFor="password">Password</FieldLabel>
                {mode === 'login' && (
                  <button
                    type="button"
                    style={{
                      background: 'none', border: 'none',
                      color: colors.muted, fontSize: 11, cursor: 'pointer',
                      fontFamily: 'var(--font-ui)',
                      textDecoration: 'underline',
                      textDecorationColor: 'transparent',
                      transition: 'color 150ms, text-decoration-color 150ms',
                    }}
                    onMouseEnter={(e) => {
                      (e.target as HTMLElement).style.color = colors.maroon
                      ;(e.target as HTMLElement).style.textDecorationColor = colors.maroon
                    }}
                    onMouseLeave={(e) => {
                      ;(e.target as HTMLElement).style.color = colors.muted
                      ;(e.target as HTMLElement).style.textDecorationColor = 'transparent'
                    }}
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <BrandInput
                id="password"
                type="password"
                placeholder="••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </div>

            {mode === 'signup' && (
              <div>
                <FieldLabel htmlFor="workspace">Workspace name</FieldLabel>
                <BrandInput id="workspace" placeholder="Acme Corp — ML Team" />
              </div>
            )}

            <BrandButton variant="primary" size="lg" fullWidth isLoading={loading} type="submit">
              {mode === 'login' ? 'Continue' : 'Create workspace'}
            </BrandButton>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div style={{ flex: 1, height: 1, background: colors.border }} />
            <span style={{ color: colors.placeholder, fontSize: 11 }}>or continue with</span>
            <div style={{ flex: 1, height: 1, background: colors.border }} />
          </div>

          {/* SSO options */}
          <div className="flex gap-3">
            {['Google SSO', 'SAML / Okta'].map((label) => (
              <button
                key={label}
                style={{
                  flex: 1, padding: '9px 12px',
                  border: `1px solid ${colors.border}`,
                  borderRadius: '8px 8px 0px 8px',
                  background: 'transparent',
                  color: colors.muted,
                  fontSize: 12, fontWeight: 500,
                  fontFamily: 'var(--font-ui)',
                  cursor: 'pointer',
                  transition: 'border-color 150ms, background 150ms',
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget
                  el.style.borderColor = colors.light
                  el.style.background = colors.faint
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget
                  el.style.borderColor = colors.border
                  el.style.background = 'transparent'
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Mode toggle */}
          <p style={{ color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: 28 }}>
            {mode === 'login' ? "New to the platform? " : "Already have an account? "}
            <button
              type="button"
              onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
              style={{
                background: 'none', border: 'none',
                color: colors.gold, fontSize: 12,
                fontFamily: 'var(--font-ui)', cursor: 'pointer', fontWeight: 600,
              }}
            >
              {mode === 'login' ? 'Request access' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
