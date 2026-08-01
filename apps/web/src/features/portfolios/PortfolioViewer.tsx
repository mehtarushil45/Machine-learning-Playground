import React, { useState } from 'react';
import { PortfolioService, CertificateVerificationResponse } from '../../services/api';

export const PortfolioViewer: React.FC = () => {
  const [projectId, setProjectId] = useState('proj-sample-001');
  const [verificationResult, setVerificationResult] = useState<CertificateVerificationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleVerifyCertificate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await PortfolioService.verifyCertificate(projectId);
      setVerificationResult(res);
    } catch (err: any) {
      setError(err.message || 'Certificate verification failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mlp-page mlp-anim-fadeInUp">
      <div className="mlp-page-header">
        <div className="mlp-page-title">📜 Learner Portfolios & Cryptographic Verification</div>
        <p className="mlp-page-subtitle">
          Verify tamper-proof HMAC-SHA256 digital signatures on student project certificates and inspect learner portfolio credentials.
        </p>
      </div>

      {error && <div className="mlp-alert mlp-alert-error" style={{ marginBottom: 24 }}>{error}</div>}

      <div className="mlp-grid-2">
        {/* Verification Form Card */}
        <div className="mlp-card">
          <div className="mlp-section-title">🔒 Cryptographic Certificate Authenticator</div>

          <div style={{ marginBottom: 20 }}>
            <label className="mlp-label">Project / Certificate UUID</label>
            <input
              className="mlp-input"
              type="text"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              placeholder="e.g. proj-sample-001"
            />
          </div>

          <button
            className="mlp-btn mlp-btn-primary mlp-btn-full"
            onClick={handleVerifyCertificate}
            disabled={loading}
            style={{ marginBottom: 24 }}
          >
            {loading ? '⏳ Verifying Signature...' : '🔏 Verify HMAC-SHA256 Digital Signature'}
          </button>

          <div className="mlp-divider" />

          <div className="mlp-section-title">Security & Authenticity Standard</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13, color: 'var(--text-secondary)' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ color: 'var(--brand-green)', fontSize: 16 }}>✓</span>
              <span>HMAC-SHA256 payload canonical hashing protects against title/user tampering.</span>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ color: 'var(--brand-cyan)', fontSize: 16 }}>✓</span>
              <span>Constant-time signature evaluation (<code style={{ fontSize: 11 }}>secrets.compare_digest</code>) prevents timing attacks.</span>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ color: 'var(--brand-violet)', fontSize: 16 }}>✓</span>
              <span>Dynamic QR verification link provided for external employer audits.</span>
            </div>
          </div>
        </div>

        {/* Certificate Card Preview */}
        <div>
          {verificationResult ? (
            <div className="mlp-cert-card">
              <div className="mlp-cert-stamp">
                📜
              </div>

              <span className={`mlp-badge ${verificationResult.verified ? 'mlp-badge-pass' : 'mlp-badge-fail'}`} style={{ fontSize: 13, padding: '6px 16px', marginBottom: 16 }}>
                {verificationResult.verification_status}
              </span>

              <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>
                {verificationResult.title}
              </h2>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
                Certificate ID: <code style={{ color: 'var(--brand-cyan)' }}>{verificationResult.certificate_id}</code>
              </div>

              {verificationResult.qr_code_url && (
                <div style={{ margin: '20px 0' }}>
                  <img
                    src={verificationResult.qr_code_url}
                    alt="QR Code Certificate Seal"
                    style={{
                      width: 140,
                      height: 140,
                      border: '2px solid var(--border-brand)',
                      borderRadius: 'var(--radius-md)',
                      padding: 6,
                      background: '#ffffff',
                      boxShadow: 'var(--shadow-glow)',
                    }}
                  />
                </div>
              )}

              <div style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                padding: '12px 14px',
                fontSize: 11,
                fontFamily: 'JetBrains Mono',
                color: 'var(--text-secondary)',
                textOverflow: 'ellipsis',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                marginTop: 16,
              }}>
                <strong style={{ color: 'var(--text-primary)' }}>HMAC-SHA256 Signature:</strong> {verificationResult.signature}
              </div>
            </div>
          ) : (
            <div className="mlp-card" style={{ minHeight: 420, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div className="mlp-empty">
                <span className="mlp-empty-icon">🔏</span>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                  Verification Desk
                </div>
                <span className="mlp-empty-text">
                  Enter a project UUID on the left to verify cryptographic certificate authenticity.
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
