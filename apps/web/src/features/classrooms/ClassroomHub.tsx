import React, { useState } from 'react';
import { ClassroomService, ReproducibilityReportResponse } from '../../services/api';

export const ClassroomHub: React.FC = () => {
  const [submissionId, setSubmissionId] = useState('sub-sample-001');
  const [tolerance, setTolerance] = useState(0.005);
  const [auditReport, setAuditReport] = useState<ReproducibilityReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleVerify = async () => {
    setLoading(true);
    setError(null);
    try {
      const rep = await ClassroomService.verifyReproducibility(submissionId, tolerance);
      setAuditReport(rep);
    } catch (err: any) {
      setError(err.message || 'Reproducibility verification failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mlp-page mlp-anim-fadeInUp">
      <div className="mlp-page-header">
        <div className="mlp-page-title">🎓 Classroom System & Reproducibility Engine</div>
        <p className="mlp-page-subtitle">
          Faculty and reviewers can 1-click re-execute student submissions in an isolated worker and verify metric reproducibility with variance tolerance controls.
        </p>
      </div>

      {error && <div className="mlp-alert mlp-alert-error" style={{ marginBottom: 24 }}>{error}</div>}

      <div className="mlp-grid-auto">

        {/* Left — Controls panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Audit form */}
          <div className="mlp-card">
            <div className="mlp-section-title">🔬 Audit Learner Submission</div>

            <div style={{ marginBottom: 16 }}>
              <label className="mlp-label">Submission UUID</label>
              <input className="mlp-input" value={submissionId}
                onChange={(e) => setSubmissionId(e.target.value)}
                placeholder="sub-xxxxxxxx-xxxx-xxxx" />
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <label className="mlp-label" style={{ margin: 0 }}>Variance Tolerance</label>
                <span style={{
                  fontSize: 12, fontWeight: 700, fontFamily: 'JetBrains Mono',
                  color: 'var(--brand-violet)', background: 'rgba(124,90,247,0.12)',
                  padding: '2px 8px', borderRadius: 'var(--radius-full)',
                }}>
                  ±{(tolerance * 100).toFixed(1)}%
                </span>
              </div>
              <input type="range" min="0.001" max="0.05" step="0.001" value={tolerance}
                onChange={(e) => setTolerance(parseFloat(e.target.value))} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                <span>0.1% (Strict)</span><span>5.0% (Lenient)</span>
              </div>
            </div>

            <button className="mlp-btn mlp-btn-cyan mlp-btn-full" onClick={handleVerify} disabled={loading}>
              {loading ? '⏳ Re-Executing Pipeline…' : '🔬 Run 1-Click Reproducibility Verification'}
            </button>
          </div>

          {/* Info card */}
          <div className="mlp-card" style={{ padding: '18px 20px' }}>
            <div className="mlp-section-title">How It Works</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { icon: '📥', text: 'Retrieve original submission pipeline and dataset snapshot.' },
                { icon: '⚙️', text: 'Re-execute the full training pipeline in an isolated worker.' },
                { icon: '📊', text: 'Compare claimed vs. re-executed metrics within tolerance.' },
                { icon: '📋', text: 'Generate signed reproducibility audit report.' },
              ].map((step, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{step.icon}</span>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{step.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right — Audit report */}
        <div className="mlp-card">
          {auditReport ? (
            <div className="mlp-anim-fadeIn">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <div className="mlp-section-title" style={{ margin: 0 }}>📋 Reproducibility Audit Report</div>
                <span className={`mlp-badge ${auditReport.is_reproducible ? 'mlp-badge-pass' : 'mlp-badge-fail'}`}
                  style={{ fontSize: 12, padding: '5px 14px' }}>
                  {auditReport.verification_status}
                </span>
              </div>

              <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
                <div style={{
                  flex: 1, padding: '14px 16px', borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                }}>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Submission ID</div>
                  <div style={{ fontSize: 12, fontFamily: 'JetBrains Mono', color: 'var(--brand-cyan)', wordBreak: 'break-all' }}>{auditReport.submission_id}</div>
                </div>
                <div style={{
                  flex: 1, padding: '14px 16px', borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                }}>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Verified At</div>
                  <div style={{ fontSize: 12, fontFamily: 'JetBrains Mono', color: 'var(--text-primary)' }}>
                    {new Date(auditReport.verified_at).toLocaleTimeString()}
                  </div>
                </div>
              </div>

              <div className="mlp-alert mlp-alert-info" style={{ marginBottom: 20 }}>
                <strong>Audit Summary:</strong> {auditReport.audit_summary}
              </div>

              <div className="mlp-section-title">Claimed vs Re-Executed Metric Comparison</div>
              <table className="mlp-table">
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th>Claimed</th>
                    <th>Re-Executed</th>
                    <th>Δ Difference</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {auditReport.metric_differences.map((m) => (
                    <tr key={m.metric_name}>
                      <td style={{ fontWeight: 700 }}>{m.metric_name}</td>
                      <td style={{ fontFamily: 'JetBrains Mono', fontSize: 12 }}>{m.claimed_value.toFixed(4)}</td>
                      <td style={{ fontFamily: 'JetBrains Mono', fontSize: 12 }}>{m.reproduced_value.toFixed(4)}</td>
                      <td style={{
                        fontFamily: 'JetBrains Mono', fontSize: 12,
                        color: m.within_tolerance ? 'var(--brand-green)' : 'var(--brand-red)',
                      }}>
                        {m.difference < 0 ? '' : '+'}{m.difference.toFixed(5)}
                      </td>
                      <td>
                        <span className={`mlp-badge ${m.within_tolerance ? 'mlp-badge-pass' : 'mlp-badge-fail'}`}>
                          {m.within_tolerance ? 'PASS ✓' : 'EXCEEDED ✗'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mlp-empty" style={{ minHeight: 400 }}>
              <span className="mlp-empty-icon">🔬</span>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                No Audit Report Yet
              </div>
              <span className="mlp-empty-text">
                Enter a submission UUID and click "Run 1-Click Reproducibility Verification" to generate a full metric audit report.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
