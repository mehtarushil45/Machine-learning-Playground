import React, { useState, useEffect } from 'react';
import { ExplainabilityService, GlobalExplainabilityResponse, FairnessAuditResponse, WhatIfResponse } from '../../services/api';

export const ExplainabilityHub: React.FC = () => {
  const [globalExp, setGlobalExp] = useState<GlobalExplainabilityResponse | null>(null);
  const [fairnessAudit, setFairnessAudit] = useState<FairnessAuditResponse | null>(null);
  const [whatIfResult, setWhatIfResult] = useState<WhatIfResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const [feat0, setFeat0] = useState(0.8);
  const [feat1, setFeat1] = useState(-1.2);
  const [feat2, setFeat2] = useState(2.1);
  const [feat3, setFeat3] = useState(0.4);
  const [desiredOutcome, setDesiredOutcome] = useState('1');

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const glob = await ExplainabilityService.getGlobalExplainability();
      setGlobalExp(glob);
      const sampleData = Array.from({ length: 40 }, (_, i) => ({
        feat_0: Math.random(), feat_1: Math.random(), feat_2: Math.random(), feat_3: Math.random(),
        gender: i % 2 === 0 ? 'Male' : 'Female',
      }));
      const fair = await ExplainabilityService.auditFairness(sampleData, 'gender', 'Male', 'Female');
      setFairnessAudit(fair);
      await runWhatIf();
    } catch (err) {
      console.error('Explainability load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const runWhatIf = async () => {
    try {
      const sample = { feat_0: feat0, feat_1: feat1, feat_2: feat2, feat_3: feat3 };
      const res = await ExplainabilityService.simulateWhatIf(sample, desiredOutcome);
      setWhatIfResult(res);
    } catch (err) {
      console.error('What-If error:', err);
    }
  };

  useEffect(() => { runWhatIf(); }, [feat0, feat1, feat2, feat3, desiredOutcome]);

  const statusClass = (status: string) =>
    status === 'PASS' ? 'mlp-badge-pass' : status === 'WARNING' ? 'mlp-badge-warning' : 'mlp-badge-fail';

  return (
    <div className="mlp-page mlp-anim-fadeInUp">
      <div className="mlp-page-header">
        <div className="mlp-page-title">🧬 Explainability, Bias & What-If Studio</div>
        <p className="mlp-page-subtitle">
          Audit your ML models for transparency and legal demographic fairness (EEOC 80% rule). Run interactive counterfactual simulations to understand decision boundaries.
        </p>
      </div>

      {loading && (
        <div className="mlp-alert mlp-alert-info" style={{ marginBottom: 24 }}>
          ⏳ Loading model audit data from the inference engine…
        </div>
      )}

      <div className="mlp-grid-2" style={{ marginBottom: 24 }}>

        {/* Card 1 — Global Feature Importance */}
        <div className="mlp-card">
          <div className="mlp-section-title">📊 Global Feature Importance (SHAP)</div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
            {globalExp?.summary_explanation ?? 'Loading SHAP global importance scores…'}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {(globalExp?.global_feature_importance ?? []).map((item, idx) => (
              <div key={item.feature_name}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{item.feature_name}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand-violet)' }}>
                    {item.impact_percentage.toFixed(1)}%
                  </span>
                </div>
                <div className="mlp-bar-track">
                  <div className="mlp-bar-fill" style={{
                    width: `${item.impact_percentage}%`,
                    background: idx === 0
                      ? 'var(--grad-brand)'
                      : `hsl(${220 + idx * 30}, 70%, 60%)`,
                  }} />
                </div>
              </div>
            ))}
            {!globalExp && (
              <>
                <div className="mlp-skeleton" style={{ height: 32 }} />
                <div className="mlp-skeleton" style={{ height: 32 }} />
                <div className="mlp-skeleton" style={{ height: 32 }} />
              </>
            )}
          </div>
        </div>

        {/* Card 2 — Demographic Fairness Scorecard */}
        <div className="mlp-card">
          <div className="mlp-section-title">⚖️ Demographic Bias & Fairness Scorecard</div>

          {fairnessAudit ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <span className={`mlp-badge ${statusClass(fairnessAudit.overall_status)}`} style={{ fontSize: 12, padding: '5px 14px' }}>
                  {fairnessAudit.overall_status}
                </span>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  Disparate Impact Ratio: <strong style={{ color: 'var(--text-primary)' }}>{fairnessAudit.disparate_impact_ratio.toFixed(2)}</strong>
                  <span style={{ color: 'var(--text-tertiary)' }}> (EEOC 80% Rule)</span>
                </span>
              </div>

              <div className="mlp-alert mlp-alert-info" style={{ marginBottom: 16 }}>
                <strong>Recommendation:</strong> {fairnessAudit.recommendation}
              </div>

              <div className="mlp-section-title" style={{ marginBottom: 10 }}>Metric Audits</div>
              <table className="mlp-table">
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th>Value</th>
                    <th>Threshold</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {fairnessAudit.metrics.map((m) => (
                    <tr key={m.metric_name}>
                      <td style={{ fontWeight: 600 }}>{m.metric_name}</td>
                      <td>{m.value.toFixed(3)}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{m.threshold.toFixed(2)}</td>
                      <td><span className={`mlp-badge ${statusClass(m.status)}`}>{m.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mlp-empty">
              <span className="mlp-empty-icon">⚖️</span>
              <span className="mlp-empty-text">Fairness audit data loading…</span>
            </div>
          )}
        </div>
      </div>

      {/* What-If Simulator */}
      <div className="mlp-card">
        <div className="mlp-section-title">🔮 Interactive "What-If" Counterfactual Simulator</div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
          Adjust feature values to discover the minimal changes required to flip a prediction to your desired outcome.
        </p>

        <div className="mlp-grid-2">
          {/* Sliders */}
          <div>
            {[
              { label: 'feat_0', value: feat0, setter: setFeat0 },
              { label: 'feat_1', value: feat1, setter: setFeat1 },
              { label: 'feat_2', value: feat2, setter: setFeat2 },
              { label: 'feat_3', value: feat3, setter: setFeat3 },
            ].map(({ label, value, setter }) => (
              <div key={label} style={{ marginBottom: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <label className="mlp-label" style={{ margin: 0 }}>{label}</label>
                  <span style={{
                    fontSize: 12, fontWeight: 700, fontFamily: 'JetBrains Mono',
                    color: value >= 0 ? 'var(--brand-green)' : 'var(--brand-red)',
                    background: value >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)',
                    padding: '2px 8px', borderRadius: 'var(--radius-full)',
                  }}>
                    {value >= 0 ? '+' : ''}{value.toFixed(2)}
                  </span>
                </div>
                <input type="range" min="-3" max="3" step="0.1" value={value}
                  onChange={(e) => setter(parseFloat(e.target.value))} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>
                  <span>-3.0</span><span>+3.0</span>
                </div>
              </div>
            ))}

            <div style={{ marginTop: 4 }}>
              <label className="mlp-label">Desired Outcome</label>
              <select className="mlp-select" value={desiredOutcome} onChange={(e) => setDesiredOutcome(e.target.value)}>
                <option value="0">Class 0 (Negative)</option>
                <option value="1">Class 1 (Positive)</option>
              </select>
            </div>
          </div>

          {/* Outcome card */}
          <div>
            {whatIfResult ? (
              <div style={{
                background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-lg)', padding: 24, height: '100%',
              }}>
                <div className="mlp-section-title" style={{ marginBottom: 16 }}>Simulation Outcome</div>

                <div style={{ display: 'flex', gap: 20, marginBottom: 20 }}>
                  <div style={{ textAlign: 'center', flex: 1 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Original</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)' }}>{whatIfResult.original_prediction}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', color: 'var(--text-tertiary)', fontSize: 20 }}>→</div>
                  <div style={{ textAlign: 'center', flex: 1 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Desired</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--brand-violet)' }}>{whatIfResult.desired_prediction}</div>
                  </div>
                </div>

                <div style={{ textAlign: 'center', marginBottom: 16 }}>
                  <span className={`mlp-badge ${whatIfResult.is_outcome_achieved ? 'mlp-badge-pass' : 'mlp-badge-fail'}`}
                    style={{ fontSize: 13, padding: '6px 16px' }}>
                    {whatIfResult.is_outcome_achieved ? '✓ Outcome Achieved' : '✗ Not Yet Achieved'}
                  </span>
                </div>

                <div style={{
                  padding: '12px 14px', background: 'var(--bg-elevated)',
                  borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6,
                }}>
                  {whatIfResult.explanation}
                </div>

                <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-tertiary)' }}>
                  <span>Confidence</span>
                  <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'JetBrains Mono' }}>
                    {(whatIfResult.new_confidence * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="mlp-bar-track" style={{ marginTop: 6 }}>
                  <div className="mlp-bar-fill" style={{ width: `${whatIfResult.new_confidence * 100}%` }} />
                </div>
              </div>
            ) : (
              <div className="mlp-empty" style={{ height: '100%' }}>
                <span className="mlp-empty-icon">🔮</span>
                <span className="mlp-empty-text">Adjust sliders to run a counterfactual simulation.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
