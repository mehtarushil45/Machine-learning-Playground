/**
 * Screen 3 — Main Workspace Dashboard
 * KPI cards, recent experiments table, activity sparkline, quick actions.
 */
import { useState } from 'react'
import { BrandCard, CardLabel, CardMetric } from '../components/ui/BrandCard'
import { BrandButton } from '../components/ui/BrandButton'
import { StatusBadge, StatusDot } from '../components/ui/StatusBadge'
import { BrandSidebar, NavIcon } from '../components/layout/BrandSidebar'
import { BrandTopBar } from '../components/layout/BrandTopBar'
import { colors } from '../tokens'
import type { StatusKey } from '../tokens'

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard',  icon: <NavIcon path="M2 12L8 2l6 10H2z" />, group: 'Workspace' },
  { id: 'datasets',  label: 'Datasets',   icon: <NavIcon path="M3 4h10M3 8h8M3 12h6" />, group: 'Workspace' },
  { id: 'train',     label: 'Train',      icon: <NavIcon path="M2 14L8 2l6 12" />, group: 'ML' },
  { id: 'jobs',      label: 'Jobs',       icon: <NavIcon path="M4 4h8v8H4z" />, group: 'ML', badge: 2 },
  { id: 'models',    label: 'Models',     icon: <NavIcon path="M8 2l6 4-6 4-6-4z" />, group: 'ML' },
  { id: 'settings',  label: 'Settings',   icon: <NavIcon path="M8 5a3 3 0 100 6 3 3 0 000-6zM2 8h1M13 8h1M8 2v1M8 13v1" />, group: 'Account' },
]

const KPIS = [
  { value: 14, label: 'Active Datasets', trend: '+2 this week', accent: true },
  { value: 7,  label: 'Running Jobs',    trend: '3 queued',     accent: true },
  { value: 3,  label: 'Deployed Models', trend: '1 staging',    accent: true },
]

type ExperimentStatus = 'complete' | 'running' | 'failed' | 'pending'

const EXPERIMENTS: { name: string; algo: string; status: ExperimentStatus; accuracy: string; date: string }[] = [
  { name: 'churn-xgb-v4',       algo: 'XGBoost',       status: 'complete', accuracy: '92.4%', date: 'Aug 11' },
  { name: 'ltv-rf-baseline',    algo: 'Random Forest',  status: 'running',  accuracy: '—',     date: 'Aug 11' },
  { name: 'fraud-lgbm-exp',     algo: 'LightGBM',       status: 'complete', accuracy: '97.1%', date: 'Aug 10' },
  { name: 'recsys-mf-cold',     algo: 'Matrix Factor',  status: 'failed',   accuracy: '—',     date: 'Aug 10' },
  { name: 'sentiment-lr-v2',    algo: 'Logistic Reg.',  status: 'complete', accuracy: '84.7%', date: 'Aug 09' },
  { name: 'demand-xgb-weekly',  algo: 'XGBoost',        status: 'running',  accuracy: '—',     date: 'Aug 09' },
  { name: 'churn-nn-v1',        algo: 'Neural Net',     status: 'pending',  accuracy: '—',     date: 'Aug 08' },
]

/* Mini sparkline data */
const SPARK = [24, 31, 18, 42, 38, 55, 47, 60, 53, 71, 65, 78]

function Sparkline() {
  const w = 280, h = 80, pad = 8
  const max = Math.max(...SPARK), min = Math.min(...SPARK)
  const pts = SPARK.map((v, i) => {
    const x = pad + (i / (SPARK.length - 1)) * (w - pad * 2)
    const y = h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2)
    return `${x},${y}`
  })
  const pathD = `M ${pts.join(' L ')}`

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#4B3B7C" />
          <stop offset="100%" stopColor="#6C5CA6" />
        </linearGradient>
        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#4B3B7C" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#4B3B7C" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${pathD} L ${w - pad},${h - pad} L ${pad},${h - pad} Z`} fill="url(#sparkFill)" />
      <path d={pathD} fill="none" stroke="url(#sparkGrad)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {/* Gold peak dot */}
      {(() => {
        const maxIdx = SPARK.indexOf(max)
        const [px, py] = pts[maxIdx].split(',').map(Number)
        return <circle cx={px} cy={py} r={4} fill={colors.gold} style={{ filter: 'drop-shadow(0 0 4px rgba(201,162,75,0.6))' }} />
      })()}
    </svg>
  )
}

export default function Dashboard() {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div style={{ display: 'flex', height: '100vh', background: colors.base, fontFamily: 'var(--font-ui)', overflow: 'hidden' }} className="ds-root">
      <BrandSidebar
        items={NAV_ITEMS}
        activeId="dashboard"
        onNavigate={() => {}}
        isCollapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        workspaceName="Sentinel Labs"
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <BrandTopBar
          title="Workspace — Sentinel Labs"
          subtitle="Last updated 2 minutes ago"
          user={{ initials: 'SL', name: 'Sarah L.', role: 'Admin' }}
          actions={<BrandButton variant="primary" size="sm">New Experiment</BrandButton>}
        />

        <main style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }} className="ds-root">

          {/* KPI row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20, marginBottom: 28 }}>
            {KPIS.map((k) => (
              <BrandCard key={k.label} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <CardLabel>{k.label}</CardLabel>
                <CardMetric value={k.value} label={k.trend} accent />
              </BrandCard>
            ))}
          </div>

          {/* Two-column content */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'start' }}>

            {/* Experiments table */}
            <BrandCard noPadding>
              <div style={{ padding: '20px 24px 16px', borderBottom: `1px solid ${colors.border}` }}>
                <div className="flex items-center justify-between">
                  <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 600, color: colors.text, margin: 0 }}>
                    Recent Experiments
                  </h2>
                  <BrandButton variant="ghost" size="sm">View all</BrandButton>
                </div>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: colors.tableHeader }}>
                    {['Name', 'Algorithm', 'Status', 'Accuracy', 'Date'].map((h) => (
                      <th key={h} style={{
                        padding: '10px 24px', textAlign: 'left',
                        fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
                        textTransform: 'uppercase', color: colors.muted,
                        whiteSpace: 'nowrap',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {EXPERIMENTS.map((exp, i) => (
                    <tr
                      key={exp.name}
                      className="table-row-zebra"
                      style={{ borderBottom: `1px solid ${colors.border}`, cursor: 'pointer' }}
                    >
                      <td style={{ padding: '12px 24px' }}>
                        <span style={{ color: colors.text, fontSize: 13, fontWeight: 500, fontFamily: 'var(--font-mono)' }}>
                          {exp.name}
                        </span>
                      </td>
                      <td style={{ padding: '12px 24px', color: colors.muted, fontSize: 12 }}>{exp.algo}</td>
                      <td style={{ padding: '12px 24px' }}>
                        <StatusBadge status={exp.status as StatusKey} pulse={exp.status === 'running'} />
                      </td>
                      <td style={{ padding: '12px 24px', color: exp.accuracy !== '—' ? colors.gold : colors.muted, fontSize: 13, fontWeight: 600 }}>
                        {exp.accuracy}
                      </td>
                      <td style={{ padding: '12px 24px', color: colors.muted, fontSize: 12 }}>{exp.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </BrandCard>

            {/* Right column */}
            <div className="flex flex-col gap-5">
              {/* Sparkline chart */}
              <BrandCard>
                <CardLabel>Training Activity</CardLabel>
                <Sparkline />
                <div className="flex justify-between mt-3">
                  <span style={{ fontSize: 11, color: colors.muted }}>Past 12 weeks</span>
                  <span style={{ fontSize: 11, color: colors.gold, fontWeight: 600 }}>↑ 23%</span>
                </div>
              </BrandCard>

              {/* Quick actions */}
              <BrandCard>
                <CardLabel>Quick Actions</CardLabel>
                <div className="flex flex-col gap-2">
                  {['Upload dataset', 'Start training run', 'Compare models', 'Deploy to staging'].map((action) => (
                    <button
                      key={action}
                      style={{
                        background: 'transparent',
                        border: `1px solid ${colors.border}`,
                        borderRadius: '6px 6px 0px 6px',
                        color: colors.muted,
                        fontSize: 12, fontWeight: 500,
                        fontFamily: 'var(--font-ui)',
                        padding: '9px 14px',
                        textAlign: 'left',
                        cursor: 'pointer',
                        transition: 'border-color 150ms, color 150ms',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = colors.primary
                        e.currentTarget.style.color = colors.text
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = colors.border
                        e.currentTarget.style.color = colors.muted
                      }}
                    >
                      {action}
                      <span style={{ opacity: 0.4 }}>→</span>
                    </button>
                  ))}
                </div>
              </BrandCard>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
