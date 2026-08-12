/**
 * Screen 9 — Empty States & Error States
 * Shows all three states side-by-side:
 *   1. No Datasets Yet   (unconnected nodes)
 *   2. Job Failed         (broken connection, maroon)
 *   3. 404 / Lost         (ghost nodes)
 */
import { ThreadNode } from '../components/ui/ThreadNode'
import { BrandButton } from '../components/ui/BrandButton'
import { BrandCard } from '../components/ui/BrandCard'
import { BrandSidebar, NavIcon } from '../components/layout/BrandSidebar'
import { BrandTopBar } from '../components/layout/BrandTopBar'
import { colors } from '../tokens'

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard',  icon: <NavIcon path="M2 12L8 2l6 10H2z" />,              group: 'Workspace' },
  { id: 'datasets',  label: 'Datasets',   icon: <NavIcon path="M3 4h10M3 8h8M3 12h6" />,           group: 'Workspace' },
  { id: 'train',     label: 'Train',      icon: <NavIcon path="M2 14L8 2l6 12" />,                  group: 'ML' },
  { id: 'jobs',      label: 'Jobs',       icon: <NavIcon path="M4 4h8v8H4z" />,                     group: 'ML' },
  { id: 'models',    label: 'Models',     icon: <NavIcon path="M8 2l6 4-6 4-6-4z" />,              group: 'ML' },
  { id: 'settings',  label: 'Settings',   icon: <NavIcon path="M8 5a3 3 0 100 6 3 3 0 000-6z" />,  group: 'Account' },
]

const TRACEBACK = `Traceback (most recent call last):
  File "train.py", line 89, in run_job
    model.fit(X_train, y_train)
  File "xgboost/core.py", line 1441, in fit
    self._validate_features(data)
RuntimeError: Feature mismatch — expected 7
  columns, got 6 in validation set.`

function EmptyDatasets() {
  return (
    <BrandCard style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '48px 32px', flex: 1 }}>
      <div style={{ marginBottom: 24 }}>
        <ThreadNode variant="empty" style={{ width: 220, height: 160 }} />
      </div>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 600, color: colors.text, marginBottom: 10, letterSpacing: '-0.01em' }}>
        No datasets yet
      </h2>
      <p style={{ color: colors.muted, fontSize: 13, lineHeight: 1.65, maxWidth: 260, marginBottom: 28 }}>
        Upload your first dataset to connect the dots and start training models.
      </p>
      <BrandButton variant="primary">Upload Dataset</BrandButton>
    </BrandCard>
  )
}

function JobFailed() {
  return (
    <div
      style={{
        border: `1px solid ${colors.maroonBorder}`,
        borderRadius: '12px 12px 0px 12px',
        borderLeft: `3px solid ${colors.maroon}`,
        background: colors.surface,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', textAlign: 'center',
        padding: '48px 32px',
        flex: 1,
      }}
    >
      <div style={{ marginBottom: 20 }}>
        <ThreadNode variant="error" style={{ width: 220, height: 140 }} />
      </div>
      <span style={{
        display: 'inline-block', marginBottom: 10,
        padding: '2px 10px', borderRadius: '9999px',
        background: colors.errorFaint, color: colors.error,
        fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
      }}>
        Runtime Error
      </span>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 600, color: colors.text, marginBottom: 16, letterSpacing: '-0.01em' }}>
        Job Failed
      </h2>

      {/* Traceback block */}
      <div style={{
        width: '100%', background: colors.base,
        border: `1px solid ${colors.border}`,
        borderLeft: `2px solid ${colors.error}`,
        borderRadius: '4px 4px 0px 4px',
        padding: '12px 14px', marginBottom: 24,
        textAlign: 'left', maxHeight: 160, overflowY: 'auto',
      }}>
        <pre style={{
          fontFamily: 'var(--font-mono)', fontSize: 10,
          color: colors.muted, lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {TRACEBACK.split('\n').map((line, i) => (
            <span key={i} style={{ display: 'block', color: line.startsWith('RuntimeError') ? colors.error : colors.muted }}>
              {line}
            </span>
          ))}
        </pre>
      </div>

      <div className="flex gap-3">
        <button
          style={{
            background: 'none', border: 'none',
            color: colors.light, fontSize: 12,
            fontFamily: 'var(--font-ui)', cursor: 'pointer',
            textDecoration: 'underline',
          }}
        >
          View Full Logs
        </button>
        <BrandButton variant="primary" size="sm">Retry Job</BrandButton>
      </div>
    </div>
  )
}

function NotFound404() {
  return (
    <BrandCard style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '48px 32px', flex: 1 }}>
      <div style={{ marginBottom: 24 }}>
        <ThreadNode variant="ghost" style={{ width: 220, height: 160 }} />
      </div>
      <p style={{
        fontFamily: 'var(--font-display)', fontSize: '4rem', fontWeight: 700,
        color: colors.disabled, lineHeight: 1, marginBottom: 12, letterSpacing: '-0.04em',
      }}>
        404
      </p>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 600, color: colors.text, marginBottom: 10, letterSpacing: '-0.01em' }}>
        You seem lost
      </h2>
      <p style={{ color: colors.muted, fontSize: 13, lineHeight: 1.65, maxWidth: 240, marginBottom: 28 }}>
        The page you're looking for has drifted into the void. The nodes can't find it either.
      </p>
      <BrandButton variant="secondary">Return to Dashboard</BrandButton>
    </BrandCard>
  )
}

export default function EmptyErrorStates() {
  return (
    <div style={{ display: 'flex', height: '100vh', background: colors.base, fontFamily: 'var(--font-ui)', overflow: 'hidden' }} className="ds-root">
      <BrandSidebar items={NAV_ITEMS} activeId="datasets" onNavigate={() => {}} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <BrandTopBar title="Empty & Error States" subtitle="Brand motif applied to all states" />

        <main style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>
          <p style={{ color: colors.muted, fontSize: 12, marginBottom: 24, maxWidth: 500, lineHeight: 1.6 }}>
            The thread-and-node motif appears here in its three interpretations:
            <strong style={{ color: colors.text }}> unconnected</strong> (empty),
            <strong style={{ color: colors.error }}> broken</strong> (failure), and
            <strong style={{ color: colors.disabled }}> faded</strong> (lost / 404).
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
            <EmptyDatasets />
            <JobFailed />
            <NotFound404 />
          </div>

          {/* Toast examples */}
          <div style={{ marginTop: 40 }}>
            <p style={{ color: colors.muted, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 16 }}>
              Toast Notifications (color-coded left border)
            </p>
            <div className="flex flex-col gap-3" style={{ maxWidth: 360 }}>
              {[
                { accent: colors.gold,    level: 'success', icon: '✓', title: 'Model deployed', body: 'XGB-churn-v3 is now live in production.' },
                { accent: colors.error,   level: 'error',   icon: '✕', title: 'Training failed',  body: 'Job XGB-2024-1847 encountered an error.' },
                { accent: colors.light,   level: 'info',    icon: 'ℹ', title: 'Job queued',        body: 'Your training job will start shortly.' },
                { accent: '#D4882E',      level: 'warning', icon: '⚠', title: 'Low accuracy',      body: 'Production model dropped below threshold.' },
              ].map((t) => (
                <div
                  key={t.level}
                  style={{
                    background: colors.elevated,
                    borderRadius: '8px 8px 0px 8px',
                    borderLeft: `3px solid ${t.accent}`,
                    padding: '12px 16px',
                    display: 'flex', gap: 12, alignItems: 'flex-start',
                  }}
                >
                  <span style={{ color: t.accent, fontSize: 13, lineHeight: 1.2, flexShrink: 0, marginTop: 1 }}>{t.icon}</span>
                  <div>
                    <p style={{ color: colors.text, fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{t.title}</p>
                    <p style={{ color: colors.muted, fontSize: 11 }}>{t.body}</p>
                  </div>
                  <button style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', fontSize: 14, marginLeft: 'auto', lineHeight: 1 }}>×</button>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
