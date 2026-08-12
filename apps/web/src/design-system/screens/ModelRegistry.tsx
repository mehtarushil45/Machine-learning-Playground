/**
 * Screen 7 — Model Registry & Comparison
 * Filter tabs, model cards side-by-side, metrics comparison table, feature importance chart, deploy panel.
 */
import { useState } from 'react'
import { BrandButton } from '../components/ui/BrandButton'
import { BrandCard, CardLabel } from '../components/ui/BrandCard'
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

const MODELS = [
  {
    id: 'xgb-v3', name: 'XGB-churn-v3', algo: 'XGBoost', status: 'production' as const,
    metrics: { accuracy: 92.4, f1: 0.891, auc: 0.967, precision: 88.3, recall: 90.1, loss: 0.067 },
    trained: 'Aug 10, 2026', dataset: 'customer_churn_data.csv',
  },
  {
    id: 'rf-v2', name: 'RF-churn-v2', algo: 'Random Forest', status: 'staging' as const,
    metrics: { accuracy: 89.7, f1: 0.864, auc: 0.941, precision: 86.2, recall: 87.4, loss: 0.113 },
    trained: 'Aug 08, 2026', dataset: 'customer_churn_data.csv',
  },
]

const METRIC_ROWS = [
  { label: 'Accuracy',  key: 'accuracy', fmt: (v: number) => v.toFixed(1) + '%', higherBetter: true },
  { label: 'F1-Score',  key: 'f1',       fmt: (v: number) => v.toFixed(3),       higherBetter: true },
  { label: 'AUC-ROC',   key: 'auc',      fmt: (v: number) => v.toFixed(3),       higherBetter: true },
  { label: 'Precision', key: 'precision',fmt: (v: number) => v.toFixed(1) + '%', higherBetter: true },
  { label: 'Recall',    key: 'recall',   fmt: (v: number) => v.toFixed(1) + '%', higherBetter: true },
  { label: 'Val Loss',  key: 'loss',     fmt: (v: number) => v.toFixed(3),       higherBetter: false },
]

const FEATURE_IMPORTANCE = [
  { name: 'tenure_months',   score: 100 },
  { name: 'monthly_charges', score: 84  },
  { name: 'num_products',    score: 72  },
  { name: 'plan_type',       score: 61  },
  { name: 'support_calls',   score: 48  },
  { name: 'age',             score: 35  },
  { name: 'contract_type',   score: 22  },
]

type FilterTab = 'all' | 'production' | 'staging' | 'archived'

/* Mini sparkline for model card */
function MiniSparkline({ data }: { data: number[] }) {
  const w = 200, h = 36, pad = 2
  const max = Math.max(...data), min = Math.min(...data)
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2)
    const y = h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2)
    return `${x},${y}`
  })
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <path d={`M ${pts.join(' L ')}`} fill="none" stroke={colors.light} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

const SPARK_DATA = [0.68, 0.55, 0.42, 0.36, 0.30, 0.28, 0.27, 0.22, 0.19, 0.13, 0.09, 0.067]
const SPARK_DATA2 = [0.71, 0.60, 0.50, 0.44, 0.39, 0.36, 0.34, 0.32, 0.30, 0.20, 0.14, 0.113]

export default function ModelRegistry() {
  const [collapsed, setCollapsed] = useState(false)
  const [filter, setFilter]       = useState<FilterTab>('all')
  const [selected, setSelected]   = useState<string[]>(['xgb-v3', 'rf-v2'])

  const FILTERS: FilterTab[] = ['all', 'production', 'staging', 'archived']

  return (
    <div style={{ display: 'flex', height: '100vh', background: colors.base, fontFamily: 'var(--font-ui)', overflow: 'hidden' }} className="ds-root">
      <BrandSidebar items={NAV_ITEMS} activeId="models" onNavigate={() => {}}
        isCollapsed={collapsed} onToggleCollapse={() => setCollapsed((c) => !c)} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <BrandTopBar title="Model Registry" subtitle="Compare, promote, and deploy your models"
          actions={<BrandButton variant="primary" size="sm">Register model</BrandButton>} />

        <main style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>

          {/* Filter tabs */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: '6px 16px',
                  borderRadius: '9999px',
                  border: `1px solid ${filter === f ? colors.primary : colors.border}`,
                  background: filter === f ? colors.faint : 'transparent',
                  color: filter === f ? colors.light : colors.muted,
                  fontSize: 12, fontWeight: filter === f ? 600 : 400,
                  fontFamily: 'var(--font-ui)', cursor: 'pointer',
                  textTransform: 'capitalize', transition: 'all 150ms',
                }}
              >
                {f}
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 240px', gap: 20, alignItems: 'start' }}>
            <div className="flex flex-col gap-6">

              {/* Model cards */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {[
                  { model: MODELS[0], spark: SPARK_DATA },
                  { model: MODELS[1], spark: SPARK_DATA2 },
                ].map(({ model, spark }) => (
                  <BrandCard key={model.id}>
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: colors.text, marginBottom: 4 }}>
                          {model.name}
                        </h3>
                        <span style={{ color: colors.muted, fontSize: 11 }}>{model.algo}</span>
                      </div>
                      <StatusBadge status={model.status} />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                      {Object.entries(model.metrics).slice(0, 4).map(([key, val]) => (
                        <div key={key}>
                          <p style={{ fontSize: 9, color: colors.muted, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600, marginBottom: 2 }}>
                            {key}
                          </p>
                          <p style={{
                            fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 700,
                            color: key === 'accuracy' || key === 'auc' ? colors.gold : colors.text,
                            lineHeight: 1,
                          }}>
                            {key === 'accuracy' || key === 'precision' || key === 'recall'
                              ? val.toFixed(1) + '%'
                              : val.toFixed(3)}
                          </p>
                        </div>
                      ))}
                    </div>

                    <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 12 }}>
                      <p style={{ fontSize: 10, color: colors.muted, marginBottom: 4 }}>Validation loss curve</p>
                      <MiniSparkline data={spark} />
                    </div>
                  </BrandCard>
                ))}
              </div>

              {/* Metrics comparison table */}
              <div>
                <CardLabel>Head-to-Head Comparison</CardLabel>
                <BrandCard noPadding>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: colors.tableHeader }}>
                        <th style={{ padding: '10px 20px', textAlign: 'left', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: colors.muted }}>Metric</th>
                        {MODELS.map((m) => (
                          <th key={m.id} style={{ padding: '10px 20px', textAlign: 'right', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: colors.muted }}>
                            {m.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {METRIC_ROWS.map((row) => {
                        const vals = MODELS.map((m) => m.metrics[row.key as keyof typeof m.metrics] as number)
                        const bestIdx = row.higherBetter
                          ? vals.indexOf(Math.max(...vals))
                          : vals.indexOf(Math.min(...vals))
                        return (
                          <tr key={row.key} className="table-row-zebra" style={{ borderBottom: `1px solid ${colors.border}` }}>
                            <td style={{ padding: '12px 20px', color: colors.muted, fontSize: 13 }}>{row.label}</td>
                            {vals.map((val, i) => (
                              <td key={i} style={{
                                padding: '12px 20px', textAlign: 'right',
                                fontFamily: 'var(--font-mono)', fontSize: 13,
                                color: i === bestIdx ? colors.gold : colors.text,
                                fontWeight: i === bestIdx ? 700 : 400,
                                borderBottom: i === bestIdx ? `1px solid ${colors.goldFaint}` : 'none',
                              }}>
                                {row.fmt(val)}
                              </td>
                            ))}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </BrandCard>
              </div>

              {/* Feature importance */}
              <div>
                <CardLabel>Feature Importance — XGB-churn-v3</CardLabel>
                <BrandCard>
                  <div className="flex flex-col gap-3">
                    {FEATURE_IMPORTANCE.map((f) => (
                      <div key={f.name} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 36px', gap: 10, alignItems: 'center' }}>
                        <span style={{ color: colors.muted, fontSize: 11, fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {f.name}
                        </span>
                        <div style={{ height: 6, background: colors.tableZebra, borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{
                            height: '100%', width: `${f.score}%`,
                            background: `linear-gradient(90deg, ${colors.primary}, ${colors.light})`,
                            borderRadius: 3,
                          }} />
                        </div>
                        <span style={{ color: colors.muted, fontSize: 10, fontFamily: 'var(--font-mono)', textAlign: 'right' }}>
                          {f.score}
                        </span>
                      </div>
                    ))}
                  </div>
                </BrandCard>
              </div>
            </div>

            {/* Deployment panel */}
            <div className="flex flex-col gap-4">
              <BrandCard>
                <CardLabel>Deployment</CardLabel>
                <div className="flex flex-col gap-3">
                  <BrandButton variant="primary" fullWidth>Deploy to Production</BrandButton>
                  <BrandButton variant="secondary" fullWidth>Promote to Staging</BrandButton>
                  <button
                    style={{
                      background: 'none', border: 'none',
                      color: colors.muted, fontSize: 12,
                      fontFamily: 'var(--font-ui)', cursor: 'pointer',
                      textDecoration: 'underline', padding: '6px 0', textAlign: 'center',
                    }}
                    onMouseEnter={(e) => { (e.target as HTMLElement).style.color = colors.error }}
                    onMouseLeave={(e) => { (e.target as HTMLElement).style.color = colors.muted }}
                  >
                    Archive this version
                  </button>
                </div>
              </BrandCard>

              <BrandCard>
                <CardLabel>Model Info</CardLabel>
                <div className="flex flex-col gap-3">
                  {[
                    ['Algorithm', 'XGBoost'],
                    ['Dataset',   'churn_data.csv'],
                    ['Trained',   'Aug 10, 2026'],
                    ['Version',   'v3.0.1'],
                    ['Job ID',    'XGB-2024-1847'],
                  ].map(([label, val]) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: colors.muted, fontSize: 11 }}>{label}</span>
                      <span style={{ color: colors.text, fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 500 }}>{val}</span>
                    </div>
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
