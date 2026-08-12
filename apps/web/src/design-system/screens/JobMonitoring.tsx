/**
 * Screen 6 — Live Job Monitoring
 * Progress timeline (thread-node motif), circular progress ring, live metrics, log panel, resource bars.
 */
import { useState, useEffect } from 'react'
import { ThreadNode } from '../components/ui/ThreadNode'
import { BrandButton } from '../components/ui/BrandButton'
import { BrandCard, CardLabel } from '../components/ui/BrandCard'
import { CircleProgress, ProgressBar } from '../components/ui/ProgressBar'
import { StatusBadge } from '../components/ui/StatusBadge'
import { BrandSidebar, NavIcon } from '../components/layout/BrandSidebar'
import { BrandTopBar } from '../components/layout/BrandTopBar'
import { colors } from '../tokens'

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard',  icon: <NavIcon path="M2 12L8 2l6 10H2z" />,              group: 'Workspace' },
  { id: 'datasets',  label: 'Datasets',   icon: <NavIcon path="M3 4h10M3 8h8M3 12h6" />,           group: 'Workspace' },
  { id: 'train',     label: 'Train',      icon: <NavIcon path="M2 14L8 2l6 12" />,                  group: 'ML' },
  { id: 'jobs',      label: 'Jobs',       icon: <NavIcon path="M4 4h8v8H4z" />,                     group: 'ML', badge: 2 },
  { id: 'models',    label: 'Models',     icon: <NavIcon path="M8 2l6 4-6 4-6-4z" />,              group: 'ML' },
  { id: 'settings',  label: 'Settings',   icon: <NavIcon path="M8 5a3 3 0 100 6 3 3 0 000-6z" />,  group: 'Account' },
]

const STAGES = [
  { id: 'validate',   label: 'Data Validation',     state: 'done' },
  { id: 'features',   label: 'Feature Engineering', state: 'done' },
  { id: 'training',   label: 'Model Training',      state: 'active' },
  { id: 'cv',         label: 'Cross-Validation',    state: 'pending' },
  { id: 'eval',       label: 'Evaluation',          state: 'pending' },
]

const INITIAL_LOGS = [
  { time: '00:04:12', level: 'INFO',    msg: 'Training started: XGBoost, 200 estimators.' },
  { time: '00:04:13', level: 'DEBUG',   msg: 'Feature matrix shape: (38265, 7)' },
  { time: '00:04:14', level: 'DEBUG',   msg: 'XGBoost DMatrix created successfully.' },
  { time: '00:04:15', level: 'INFO',    msg: 'Epoch 1 — train_loss: 0.6892, val_loss: 0.6941' },
  { time: '00:04:28', level: 'INFO',    msg: 'Epoch 50 — train_loss: 0.3812, val_loss: 0.3980' },
  { time: '00:04:41', level: 'WARNING', msg: 'Subsample ratio low — consider increasing for stability.' },
  { time: '00:04:55', level: 'INFO',    msg: 'Epoch 100 — train_loss: 0.2901, val_loss: 0.3134' },
  { time: '00:05:08', level: 'DEBUG',   msg: 'Checkpoint saved: /models/xgb-2024-1847-ckpt-100.json' },
  { time: '00:05:21', level: 'INFO',    msg: 'Epoch 134 — train_loss: 0.2847, val_loss: 0.2980' },
]

const levelColor: Record<string, string> = {
  INFO:    colors.text,
  DEBUG:   colors.muted,
  WARNING: colors.maroonHover ?? '#8E2A3C',
  ERROR:   colors.error,
}

export default function JobMonitoring() {
  const [collapsed, setCollapsed]   = useState(false)
  const [progress, setProgress]     = useState(67)
  const [epoch, setEpoch]           = useState(134)
  const [loss, setLoss]             = useState(0.2847)
  const [valAcc, setValAcc]         = useState(89.34)
  const [logs, setLogs]             = useState(INITIAL_LOGS)

  /* Simulate live updates */
  useEffect(() => {
    const timer = setInterval(() => {
      setProgress((p) => Math.min(p + 0.5, 99))
      setEpoch((e) => Math.min(e + 1, 200))
      setLoss((l) => Math.max(l - 0.001, 0.21))
      setValAcc((a) => Math.min(a + 0.03, 93))
    }, 1200)
    return () => clearInterval(timer)
  }, [])

  return (
    <div style={{ display: 'flex', height: '100vh', background: colors.base, fontFamily: 'var(--font-ui)', overflow: 'hidden' }} className="ds-root">
      <BrandSidebar items={NAV_ITEMS} activeId="jobs" onNavigate={() => {}}
        isCollapsed={collapsed} onToggleCollapse={() => setCollapsed((c) => !c)} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <BrandTopBar
          title="Training Job · XGB-2024-1847"
          subtitle="XGBoost Classifier · Launched 4 minutes ago"
          actions={
            <div className="flex gap-2">
              <BrandButton variant="secondary" size="sm">Pause</BrandButton>
              <BrandButton variant="danger" size="sm">Cancel</BrandButton>
            </div>
          }
        />

        <main style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>

          {/* Status + stage timeline */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
            <StatusBadge status="running" pulse />
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              {STAGES.map((stage, i) => (
                <div key={stage.id} style={{ display: 'flex', alignItems: 'center', gap: 0, flex: i < STAGES.length - 1 ? 1 : 'none' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <div style={{
                      width: stage.state === 'active' ? 18 : 12,
                      height: stage.state === 'active' ? 18 : 12,
                      borderRadius: '50%',
                      background: stage.state === 'done' ? colors.gold : stage.state === 'active' ? colors.light : colors.disabled,
                      border: stage.state === 'active' ? `3px solid rgba(107,92,166,0.35)` : 'none',
                      boxShadow: stage.state === 'active' ? `0 0 10px ${colors.light}66` : 'none',
                      transition: 'all 300ms',
                      flexShrink: 0,
                    }} />
                    <span style={{
                      fontSize: 10, fontWeight: stage.state === 'active' ? 600 : 400,
                      color: stage.state === 'done' ? colors.gold : stage.state === 'active' ? colors.text : colors.disabled,
                      whiteSpace: 'nowrap',
                    }}>
                      {stage.label} {stage.state === 'done' && '✓'}
                    </span>
                  </div>
                  {i < STAGES.length - 1 && (
                    <div style={{
                      flex: 1, height: 1,
                      background: stage.state === 'done' ? colors.gold : colors.border,
                      margin: '0 8px',
                      marginBottom: 20,
                      transition: 'background 600ms',
                    }} />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Three-column content */}
          <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 280px', gap: 20, marginBottom: 20 }}>

            {/* Progress ring card */}
            <BrandCard style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
              <CardLabel>Progress</CardLabel>
              <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <CircleProgress value={progress} size={148} strokeWidth={10} />
                <div style={{ position: 'absolute', textAlign: 'center' }}>
                  <p style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 700, color: colors.text, margin: 0, lineHeight: 1 }}>
                    {Math.round(progress)}%
                  </p>
                </div>
              </div>
              <div className="text-center">
                <p style={{ color: colors.muted, fontSize: 12 }}>Epoch <span style={{ color: colors.text, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{epoch}</span> / 200</p>
                <p style={{ color: colors.muted, fontSize: 12 }}>ETA <span style={{ color: colors.text, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>2m 18s</span></p>
              </div>
            </BrandCard>

            {/* Live metrics */}
            <div className="flex flex-col gap-4">
              {[
                { label: 'Current Loss',    value: loss.toFixed(4),         good: false, unit: '', highlight: false },
                { label: 'Validation Acc',  value: valAcc.toFixed(2) + '%', good: true,  unit: '',  highlight: true  },
                { label: 'Learning Rate',   value: '0.0087',                good: false, unit: '',  highlight: false },
              ].map((m) => (
                <BrandCard key={m.label} style={{ padding: '16px 20px' }}>
                  <p style={{ color: colors.muted, fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
                    {m.label}
                  </p>
                  <div className="flex items-baseline gap-2">
                    <span style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '1.75rem', fontWeight: 700,
                      color: m.highlight ? colors.gold : colors.text,
                      lineHeight: 1,
                    }}>
                      {m.value}
                    </span>
                    {m.good && <span style={{ color: colors.gold, fontSize: 14 }}>↓ improving</span>}
                  </div>
                </BrandCard>
              ))}
            </div>

            {/* Logs */}
            <BrandCard noPadding>
              <div style={{ padding: '14px 16px', borderBottom: `1px solid ${colors.border}` }}>
                <CardLabel>Live Logs</CardLabel>
              </div>
              <div style={{ overflowY: 'auto', maxHeight: 260, padding: '10px 0', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                {logs.map((log, i) => (
                  <div key={i} style={{ padding: '4px 14px', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <span style={{ color: colors.primary, flexShrink: 0, fontSize: 10 }}>{log.time}</span>
                    <span style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                      color: levelColor[log.level] ?? colors.muted,
                      flexShrink: 0, paddingTop: 1,
                    }}>
                      {log.level}
                    </span>
                    <span style={{ color: levelColor[log.level] ?? colors.muted, lineHeight: 1.5 }}>{log.msg}</span>
                  </div>
                ))}
              </div>
            </BrandCard>
          </div>

          {/* Resource usage bars */}
          <BrandCard style={{ padding: '16px 24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div>
                <div className="flex justify-between mb-2">
                  <span style={{ fontSize: 11, color: colors.muted, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>CPU</span>
                  <span style={{ fontSize: 12, color: colors.text, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>76%</span>
                </div>
                <ProgressBar value={76} height={4} />
              </div>
              <div>
                <div className="flex justify-between mb-2">
                  <span style={{ fontSize: 11, color: colors.muted, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Memory</span>
                  <span style={{ fontSize: 12, color: colors.text, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>4.2 GB / 8 GB</span>
                </div>
                <ProgressBar value={52} height={4} />
              </div>
            </div>
          </BrandCard>
        </main>
      </div>
    </div>
  )
}
