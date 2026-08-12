/**
 * Screen 5 — Training Configuration Panel
 * Algorithm picker, hyperparameters, train/test split slider, launch CTA.
 */
import { useState } from 'react'
import { BrandButton } from '../components/ui/BrandButton'
import { BrandCard, CardLabel } from '../components/ui/BrandCard'
import { BrandInput, BrandSelect, FieldLabel } from '../components/ui/BrandInput'
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

const ALGORITHMS = [
  'XGBoost Classifier',
  'Random Forest Classifier',
  'LightGBM Classifier',
  'Logistic Regression',
  'Neural Network (MLP)',
  'Support Vector Machine',
]

const FEATURES = ['age', 'plan_type', 'tenure_months', 'monthly_charges', 'num_products', 'support_calls', 'contract_type']

const HYPER_PARAMS: { key: string; label: string; value: string; hint: string }[] = [
  { key: 'n_estimators', label: 'n_estimators', value: '200',   hint: 'Number of boosting rounds' },
  { key: 'max_depth',    label: 'max_depth',    value: '6',     hint: 'Maximum tree depth' },
  { key: 'learning_rate',label: 'learning_rate',value: '0.01',  hint: 'Step size shrinkage' },
  { key: 'subsample',    label: 'subsample',    value: '0.8',   hint: 'Fraction of samples used' },
]

export default function TrainingConfig() {
  const [collapsed, setCollapsed]           = useState(false)
  const [algorithm, setAlgorithm]           = useState(ALGORITHMS[0])
  const [problemType, setProblemType]       = useState<'classification' | 'regression'>('classification')
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>(['age', 'plan_type', 'tenure_months', 'monthly_charges', 'num_products'])
  const [splitRatio, setSplitRatio]         = useState(80)
  const [kFolds, setKFolds]                 = useState(5)
  const [hyperParams, setHyperParams]       = useState<Record<string, string>>(
    Object.fromEntries(HYPER_PARAMS.map((p) => [p.key, p.value]))
  )
  const [showAdvanced, setShowAdvanced]     = useState(false)
  const [launching, setLaunching]           = useState(false)

  const toggleFeature = (f: string) =>
    setSelectedFeatures((prev) => prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f])

  const handleLaunch = () => {
    setLaunching(true)
    setTimeout(() => setLaunching(false), 2000)
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: colors.base, fontFamily: 'var(--font-ui)', overflow: 'hidden' }} className="ds-root">
      <BrandSidebar items={NAV_ITEMS} activeId="train" onNavigate={() => {}}
        isCollapsed={collapsed} onToggleCollapse={() => setCollapsed((c) => !c)} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <BrandTopBar title="Configure Training Run" subtitle="XGBoost · customer_churn_data.csv" />

        <main style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, maxWidth: 1000 }}>

            {/* ── Left: Experiment Setup ───────────── */}
            <div className="flex flex-col gap-5">
              <BrandCard>
                <CardLabel>Experiment Setup</CardLabel>

                <div className="flex flex-col gap-4">
                  {/* Algorithm */}
                  <div>
                    <FieldLabel htmlFor="algo">Algorithm</FieldLabel>
                    <BrandSelect id="algo" value={algorithm} onChange={(e) => setAlgorithm(e.target.value)}>
                      {ALGORITHMS.map((a) => <option key={a} value={a}>{a}</option>)}
                    </BrandSelect>
                  </div>

                  {/* Problem type toggle */}
                  <div>
                    <FieldLabel>Problem Type</FieldLabel>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {(['classification', 'regression'] as const).map((t) => (
                        <button
                          key={t}
                          onClick={() => setProblemType(t)}
                          style={{
                            flex: 1, padding: '8px 0',
                            borderRadius: '6px 6px 0px 6px',
                            border: `1px solid ${problemType === t ? colors.primary : colors.border}`,
                            background: problemType === t ? colors.faint : 'transparent',
                            color: problemType === t ? colors.text : colors.muted,
                            fontSize: 12, fontWeight: problemType === t ? 600 : 400,
                            fontFamily: 'var(--font-ui)', cursor: 'pointer', textTransform: 'capitalize',
                            transition: 'all 150ms',
                          }}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Dataset */}
                  <div>
                    <FieldLabel htmlFor="dataset">Dataset</FieldLabel>
                    <BrandSelect id="dataset">
                      <option>customer_churn_data.csv</option>
                      <option>fraud_transactions.parquet</option>
                    </BrandSelect>
                  </div>

                  {/* Target column */}
                  <div>
                    <FieldLabel htmlFor="target">Target Column</FieldLabel>
                    <BrandSelect id="target">
                      <option value="churn" style={{ color: colors.gold }}>churn</option>
                      <option>monthly_charges</option>
                      <option>plan_type</option>
                    </BrandSelect>
                  </div>

                  {/* Feature selection */}
                  <div>
                    <FieldLabel>Feature Selection</FieldLabel>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {FEATURES.map((f) => {
                        const active = selectedFeatures.includes(f)
                        return (
                          <button
                            key={f}
                            onClick={() => toggleFeature(f)}
                            style={{
                              padding: '4px 10px',
                              borderRadius: '9999px',
                              border: `1px solid ${active ? colors.primary : colors.border}`,
                              background: active ? colors.faint : 'transparent',
                              color: active ? colors.light : colors.muted,
                              fontSize: 11, fontWeight: active ? 600 : 400,
                              fontFamily: 'var(--font-mono)',
                              cursor: 'pointer', transition: 'all 150ms',
                            }}
                          >
                            {f} {active && '×'}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </BrandCard>
            </div>

            {/* ── Right: Hyperparameters ───────────── */}
            <div className="flex flex-col gap-5">
              <BrandCard>
                <CardLabel>Hyperparameters</CardLabel>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                  {HYPER_PARAMS.map((p) => (
                    <div key={p.key}>
                      <FieldLabel htmlFor={p.key} hint={p.hint}>{p.label}</FieldLabel>
                      <BrandInput
                        id={p.key}
                        type="number"
                        value={hyperParams[p.key]}
                        onChange={(e) => setHyperParams((prev) => ({ ...prev, [p.key]: e.target.value }))}
                        style={{ fontFamily: 'var(--font-mono)' }}
                      />
                    </div>
                  ))}
                </div>

                {/* Train/test split slider */}
                <div style={{ marginBottom: 20 }}>
                  <div className="flex justify-between items-center mb-2">
                    <FieldLabel>Train / Test Split</FieldLabel>
                    <span style={{ color: colors.text, fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                      {splitRatio}% / {100 - splitRatio}%
                    </span>
                  </div>
                  <input
                    type="range" min={60} max={90} step={5}
                    value={splitRatio}
                    onChange={(e) => setSplitRatio(Number(e.target.value))}
                    style={{
                      width: '100%', accentColor: colors.maroon,
                      height: 3, cursor: 'pointer',
                    }}
                  />
                  <div className="flex justify-between mt-1">
                    <span style={{ fontSize: 10, color: colors.muted }}>60%</span>
                    <span style={{ fontSize: 10, color: colors.muted }}>90%</span>
                  </div>
                </div>

                {/* Cross-validation k-folds */}
                <div style={{ marginBottom: 20 }}>
                  <FieldLabel>Cross-validation k-folds</FieldLabel>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[3, 5, 10].map((k) => (
                      <button
                        key={k}
                        onClick={() => setKFolds(k)}
                        style={{
                          padding: '6px 16px',
                          borderRadius: '6px 6px 0px 6px',
                          border: `1px solid ${kFolds === k ? colors.primary : colors.border}`,
                          background: kFolds === k ? colors.faint : 'transparent',
                          color: kFolds === k ? colors.text : colors.muted,
                          fontSize: 12, fontWeight: kFolds === k ? 600 : 400,
                          fontFamily: 'var(--font-mono)', cursor: 'pointer', transition: 'all 150ms',
                        }}
                      >
                        {k}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Advanced Options accordion */}
                <button
                  onClick={() => setShowAdvanced((v) => !v)}
                  style={{
                    width: '100%', padding: '10px 14px',
                    border: `1px solid ${colors.border}`,
                    borderRadius: '6px 6px 0px 6px',
                    background: 'transparent',
                    color: colors.muted, fontSize: 12,
                    fontFamily: 'var(--font-ui)', cursor: 'pointer',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    transition: 'border-color 150ms',
                  }}
                >
                  <span>Advanced Options</span>
                  <span style={{ transform: showAdvanced ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }}>▾</span>
                </button>

                {showAdvanced && (
                  <div style={{ marginTop: 12, padding: 14, background: colors.elevated, borderRadius: '6px 6px 0px 6px', border: `1px solid ${colors.border}` }}>
                    <div className="flex flex-col gap-3">
                      {[['Early stopping rounds', '10'], ['Eval metric', 'logloss'], ['Seed', '42']].map(([label, placeholder]) => (
                        <div key={label}>
                          <FieldLabel>{label}</FieldLabel>
                          <BrandInput placeholder={placeholder} style={{ fontFamily: 'var(--font-mono)' }} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </BrandCard>
            </div>
          </div>

          {/* ── Launch action bar ─────────────────── */}
          <div
            style={{
              display: 'flex', gap: 12, alignItems: 'center',
              marginTop: 28, paddingTop: 24,
              borderTop: `1px solid ${colors.border}`,
              maxWidth: 1000,
            }}
          >
            <BrandButton variant="secondary" size="lg">Save as Template</BrandButton>
            <div style={{ flex: 1 }} />
            <BrandButton variant="ghost" size="lg">Discard</BrandButton>
            <BrandButton variant="primary" size="lg" isLoading={launching} onClick={handleLaunch}>
              Launch Training Job →
            </BrandButton>
          </div>
        </main>
      </div>
    </div>
  )
}
