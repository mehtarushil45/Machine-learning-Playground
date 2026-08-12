/**
 * Screen 4 — Dataset Upload & Profiling
 * Upload dropzone with thread-node empty state, column health cards, data preview table.
 */
import { useState, useCallback } from 'react'
import { ThreadNode } from '../components/ui/ThreadNode'
import { BrandButton } from '../components/ui/BrandButton'
import { BrandCard, CardLabel } from '../components/ui/BrandCard'
import { DataTypeBadge } from '../components/ui/StatusBadge'
import { ProgressBar } from '../components/ui/ProgressBar'
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

type ColumnType = 'numeric' | 'categorical' | 'datetime' | 'boolean' | 'identifier'
interface ColumnProfile {
  name: string
  type: ColumnType
  completeness: number
  missing: string
  unique: number
}

const COLUMNS: ColumnProfile[] = [
  { name: 'customer_id',    type: 'identifier',  completeness: 100, missing: '0.00%', unique: 47832 },
  { name: 'age',            type: 'numeric',     completeness: 98,  missing: '2.04%', unique: 67    },
  { name: 'plan_type',      type: 'categorical', completeness: 100, missing: '0.00%', unique: 5     },
  { name: 'tenure_months',  type: 'numeric',     completeness: 97,  missing: '3.21%', unique: 72    },
  { name: 'signup_date',    type: 'datetime',    completeness: 100, missing: '0.00%', unique: 2104  },
  { name: 'churn',          type: 'boolean',     completeness: 100, missing: '0.00%', unique: 2     },
]

const PREVIEW_ROWS = [
  ['A00001', '34', 'Pro',   '24', '2021-03-12', 'false'],
  ['A00002', '52', 'Basic', '5',  '2023-08-01', 'true' ],
  ['A00003', '28', 'Pro',   '36', '2020-11-19', 'false'],
  ['A00004', '—',  'Pro',   '12', '2022-05-30', 'false'],
  ['A00005', '41', 'Basic', '3',  '2024-01-15', 'true' ],
]

export default function DatasetUpload() {
  const [collapsed, setCollapsed] = useState(false)
  const [uploaded, setUploaded]   = useState(true)   // show profiled state by default
  const [dragging, setDragging]   = useState(false)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    setUploaded(true)
  }, [])

  return (
    <div style={{ display: 'flex', height: '100vh', background: colors.base, fontFamily: 'var(--font-ui)', overflow: 'hidden' }} className="ds-root">
      <BrandSidebar items={NAV_ITEMS} activeId="datasets" onNavigate={() => {}}
        isCollapsed={collapsed} onToggleCollapse={() => setCollapsed((c) => !c)} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <BrandTopBar title="Datasets" subtitle="Upload and inspect your data" />

        <main style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 24, alignItems: 'start' }}>

            {/* ── Left column ──────────────────────── */}
            <div className="flex flex-col gap-5">
              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                style={{
                  border: `1.5px dashed ${dragging ? colors.primary : colors.border}`,
                  borderRadius: '12px 12px 0px 12px',
                  background: dragging ? colors.faint : 'transparent',
                  padding: '36px 24px',
                  textAlign: 'center',
                  transition: 'border-color 200ms, background 200ms',
                  cursor: 'pointer',
                }}
              >
                <div style={{ width: 200, height: 150, margin: '0 auto 20px' }}>
                  <ThreadNode variant="empty" style={{ width: 200, height: 150 }} />
                </div>
                <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.125rem', fontWeight: 600, color: colors.text, marginBottom: 6 }}>
                  Drop your dataset here
                </p>
                <p style={{ color: colors.muted, fontSize: 12, marginBottom: 20 }}>
                  .csv · .parquet · .json · .xlsx
                </p>
                <BrandButton variant="primary" size="sm" onClick={() => setUploaded(true)}>
                  Browse files
                </BrandButton>
              </div>

              {/* Uploaded file metadata */}
              {uploaded && (
                <BrandCard>
                  <div className="flex items-start gap-3">
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: colors.faint, border: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <rect x="2" y="2" width="12" height="12" rx="2" stroke={colors.light} strokeWidth="1.4"/>
                        <path d="M5 6h6M5 9h4" stroke={colors.light} strokeWidth="1.2" strokeLinecap="round"/>
                      </svg>
                    </div>
                    <div>
                      <p style={{ color: colors.text, fontWeight: 600, fontSize: 13, fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
                        customer_churn_data.csv
                      </p>
                      <p style={{ color: colors.muted, fontSize: 11 }}>
                        47,832 rows · 23 columns · 2.1 MB
                      </p>
                    </div>
                  </div>
                  <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${colors.border}` }}>
                    <div className="flex justify-between text-xs mb-2">
                      <span style={{ color: colors.muted }}>Profiling complete</span>
                      <span style={{ color: colors.gold, fontWeight: 600 }}>100%</span>
                    </div>
                    <ProgressBar value={100} height={2} />
                  </div>
                </BrandCard>
              )}
            </div>

            {/* ── Right column ─────────────────────── */}
            {uploaded && (
              <div className="flex flex-col gap-6">
                {/* Column health cards */}
                <div>
                  <CardLabel>Column Health Dashboard</CardLabel>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
                    {COLUMNS.map((col) => (
                      <BrandCard key={col.name} style={{ padding: '16px' }}>
                        <div className="flex items-center justify-between mb-3">
                          <span style={{ color: colors.text, fontWeight: 600, fontSize: 12, fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>
                            {col.name}
                          </span>
                          <DataTypeBadge type={col.type} />
                        </div>
                        <ProgressBar
                          value={col.completeness}
                          height={3}
                          colorOverride={col.completeness < 90 ? 'error' : undefined}
                        />
                        <div className="flex justify-between mt-2">
                          <span style={{ fontSize: 10, color: colors.muted }}>Missing {col.missing}</span>
                          <span style={{ fontSize: 10, color: colors.muted }}>{col.unique.toLocaleString()} unique</span>
                        </div>
                      </BrandCard>
                    ))}
                  </div>
                </div>

                {/* Data preview table */}
                <div>
                  <CardLabel>Data Preview — first 5 rows</CardLabel>
                  <BrandCard noPadding>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: colors.tableHeader }}>
                            {['customer_id', 'age', 'plan_type', 'tenure_months', 'signup_date', 'churn'].map((h) => (
                              <th key={h} style={{
                                padding: '10px 18px', textAlign: 'left',
                                fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
                                textTransform: 'uppercase', color: colors.muted,
                                whiteSpace: 'nowrap',
                              }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {PREVIEW_ROWS.map((row, i) => (
                            <tr key={i} className="table-row-zebra" style={{ borderBottom: `1px solid ${colors.border}` }}>
                              {row.map((cell, j) => (
                                <td key={j} style={{
                                  padding: '10px 18px',
                                  color: cell === '—' ? colors.placeholder : colors.text,
                                  fontSize: 12,
                                  fontFamily: 'var(--font-mono)',
                                  fontStyle: cell === '—' ? 'italic' : 'normal',
                                }}>
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </BrandCard>
                </div>

                {/* CTA */}
                <div className="flex gap-3">
                  <BrandButton variant="primary">Train a model on this dataset</BrandButton>
                  <BrandButton variant="secondary">Download profile report</BrandButton>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
