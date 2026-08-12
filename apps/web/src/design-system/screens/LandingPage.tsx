/**
 * Screen 1 — Landing / Marketing Page
 * Hero with thread-node motif, stat blocks, feature cards, nav bar.
 */
import { useState } from 'react'
import { ThreadNode } from '../components/ui/ThreadNode'
import { BrandButton } from '../components/ui/BrandButton'
import { BrandCard } from '../components/ui/BrandCard'
import { colors } from '../tokens'

const STATS = [
  { value: '2.4M',    label: 'Models trained' },
  { value: '99.97%',  label: 'Platform uptime' },
  { value: '<50ms',   label: 'Inference latency' },
]

const FEATURES = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="5" cy="5" r="2" stroke="#6C5CA6" strokeWidth="1.4"/>
        <circle cx="15" cy="5" r="2" stroke="#6C5CA6" strokeWidth="1.4"/>
        <circle cx="10" cy="15" r="2" stroke="#6E1423" strokeWidth="1.4"/>
        <line x1="5" y1="5" x2="15" y2="5" stroke="#6C5CA6" strokeWidth="1" strokeOpacity="0.5"/>
        <line x1="5" y1="5" x2="10" y2="15" stroke="#6C5CA6" strokeWidth="1" strokeOpacity="0.5"/>
        <line x1="15" y1="5" x2="10" y2="15" stroke="#6C5CA6" strokeWidth="1" strokeOpacity="0.5"/>
      </svg>
    ),
    title: 'Intelligent Experiment Tracking',
    body: 'Every run is versioned, compared, and searchable. Reproduce any experiment with one click.',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="3" y="8" width="14" height="9" rx="2" stroke="#6C5CA6" strokeWidth="1.4"/>
        <path d="M7 8V6a3 3 0 016 0v2" stroke="#6C5CA6" strokeWidth="1.4" strokeLinecap="round"/>
        <circle cx="10" cy="13" r="1.5" fill="#6E1423"/>
      </svg>
    ),
    title: 'Enterprise-Grade Security',
    body: 'Role-based access, audit logs, SSO, and data residency controls built into every tier.',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M3 10h14M10 3v14" stroke="#6C5CA6" strokeWidth="1.4" strokeLinecap="round"/>
        <circle cx="10" cy="10" r="3" stroke="#C9A24B" strokeWidth="1.4"/>
      </svg>
    ),
    title: 'One-Click Deployment',
    body: 'Promote any model from registry to production endpoint in seconds, with canary and rollback support.',
  },
]

export default function LandingPage() {
  const [hovered, setHovered] = useState<number | null>(null)

  return (
    <div
      style={{ background: colors.base, minHeight: '100vh', fontFamily: 'var(--font-ui)', color: colors.text }}
      className="ds-root"
    >
      {/* ── Nav bar ─────────────────────────────────── */}
      <nav
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 40px', height: 60,
          background: 'rgba(11,9,18,0.85)',
          backdropFilter: 'blur(12px)',
          borderBottom: `1px solid ${colors.border}`,
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div style={{
            width: 28, height: 28, borderRadius: 6,
            background: `linear-gradient(135deg, ${colors.primary}, ${colors.maroon})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="3" cy="3" r="2" fill="white" fillOpacity="0.9"/>
              <circle cx="11" cy="3" r="1.5" fill="white" fillOpacity="0.6"/>
              <circle cx="7" cy="11" r="2" fill="white" fillOpacity="0.8"/>
              <line x1="3" y1="3" x2="11" y2="3" stroke="white" strokeOpacity="0.4" strokeWidth="1"/>
              <line x1="3" y1="3" x2="7" y2="11" stroke="white" strokeOpacity="0.4" strokeWidth="1"/>
              <line x1="11" y1="3" x2="7" y2="11" stroke="white" strokeOpacity="0.4" strokeWidth="1"/>
            </svg>
          </div>
          <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: '-0.01em' }}>ML Platform</span>
        </div>

        {/* Links */}
        <div className="hidden md:flex items-center gap-8">
          {['Product', 'Docs', 'Pricing', 'Enterprise'].map((l) => (
            <a key={l} href="#" style={{ color: colors.muted, fontSize: 13, textDecoration: 'none' }}
               className="hover:text-[#F5F1EC] transition-colors duration-150">{l}</a>
          ))}
        </div>

        {/* CTAs */}
        <div className="flex items-center gap-3">
          <BrandButton variant="ghost" size="sm">Sign in</BrandButton>
          <BrandButton variant="primary" size="sm">Request access</BrandButton>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────── */}
      <section style={{ position: 'relative', paddingTop: 140, paddingBottom: 80, textAlign: 'center', overflow: 'hidden' }}>
        {/* Motif background */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <ThreadNode variant="hero" style={{ width: '100%', maxWidth: 840 }} />
        </div>

        <div style={{ position: 'relative', zIndex: 1, maxWidth: 720, margin: '0 auto', padding: '0 24px' }}>
          {/* Eyebrow */}
          <span style={{
            display: 'inline-block', marginBottom: 24,
            background: colors.faint, border: `1px solid ${colors.border}`,
            borderRadius: '9999px', padding: '4px 14px',
            fontSize: 11, fontWeight: 600, letterSpacing: '0.1em',
            textTransform: 'uppercase', color: colors.light,
          }}>
            Enterprise Machine Learning Platform
          </span>

          {/* Headline */}
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(2.5rem, 6vw, 4.5rem)',
            fontWeight: 700,
            lineHeight: 1.08,
            letterSpacing: '-0.03em',
            color: colors.text,
            margin: '0 0 24px',
          }}>
            Train smarter.<br />
            <span style={{ color: colors.muted }}>Deploy with confidence.</span>
          </h1>

          <p style={{ color: colors.muted, fontSize: '1.0625rem', lineHeight: 1.65, maxWidth: 520, margin: '0 auto 40px' }}>
            From raw data to production model in a single platform. Built for teams that can't afford to guess.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <BrandButton variant="primary" size="lg">Start free trial</BrandButton>
            <BrandButton variant="secondary" size="lg">View documentation</BrandButton>
          </div>
        </div>
      </section>

      {/* ── Stats ────────────────────────────────────── */}
      <section style={{ padding: '60px 40px', borderTop: `1px solid ${colors.border}`, borderBottom: `1px solid ${colors.border}` }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 40 }}>
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <p style={{ fontFamily: 'var(--font-display)', fontSize: '3rem', fontWeight: 700, color: colors.gold, lineHeight: 1, marginBottom: 6, letterSpacing: '-0.02em' }}>
                {s.value}
              </p>
              <p style={{ color: colors.muted, fontSize: 13 }}>{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ─────────────────────────────────── */}
      <section style={{ padding: '80px 40px', maxWidth: 1100, margin: '0 auto' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 600, textAlign: 'center', marginBottom: 48, letterSpacing: '-0.02em' }}>
          Everything your ML team needs
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
          {FEATURES.map((f, i) => (
            <BrandCard
              key={f.title}
              style={{
                transition: 'background 200ms',
                background: hovered === i ? colors.elevated : colors.surface,
              }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              <div style={{ marginBottom: 16 }}>{f.icon}</div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.125rem', fontWeight: 600, marginBottom: 10, color: colors.text }}>
                {f.title}
              </h3>
              <p style={{ color: colors.muted, fontSize: 13, lineHeight: 1.65 }}>{f.body}</p>
            </BrandCard>
          ))}
        </div>
      </section>

      {/* ── Footer CTA ───────────────────────────────── */}
      <section style={{ padding: '80px 40px', textAlign: 'center', borderTop: `1px solid ${colors.border}` }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '2.25rem', fontWeight: 600, marginBottom: 16, letterSpacing: '-0.02em' }}>
          Ready to move faster?
        </h2>
        <p style={{ color: colors.muted, fontSize: 14, marginBottom: 32 }}>
          Join 300+ data science teams already shipping models with confidence.
        </p>
        <BrandButton variant="primary" size="lg">Request access →</BrandButton>
      </section>
    </div>
  )
}
