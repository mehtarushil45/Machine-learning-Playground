import { useState } from 'react';
import { Award, Lock, ShieldCheck, Copy, Check, QrCode, AlertCircle } from 'lucide-react';
import { PortfolioService, type CertificateVerificationResponse } from '../../services/api';

/* ── BB brand tokens (matches App.tsx) ────────────────────────────────── */
const BB = {
  base:         '#0B0912',
  surface:      '#1B1530',
  elevated:     '#2A2247',
  border:       'rgba(107,92,166,0.18)',
  borderHover:  'rgba(107,92,166,0.35)',
  primary:      '#4B3B7C',
  primaryLight: '#6C5CA6',
  maroon:       '#6E1423',
  maroonLight:  '#B23A4E',
  gold:         '#C9A24B',
  text:         '#F5F1EC',
  muted:        '#9E93B8',
  disabled:     '#3D3558',
  success:      '#22c55e',
} as const;

interface PortfolioViewerProps {
  onShowToast?: (title: string, description?: string, type?: 'success' | 'info' | 'error') => void;
}

export function PortfolioViewer({ onShowToast }: PortfolioViewerProps) {
  const [projectId, setProjectId]           = useState('proj-sample-001');
  const [verificationResult, setResult]     = useState<CertificateVerificationResponse | null>(null);
  const [loading, setLoading]               = useState(false);
  const [error, setError]                   = useState<string | null>(null);
  const [copied, setCopied]                 = useState(false);

  const handleVerify = async () => {
    if (!projectId.trim()) { setError('Please enter a Project ID'); return; }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await PortfolioService.verifyCertificate(projectId);
      setResult(res);
      onShowToast?.('Certificate Verified!', `Status: ${res.verification_status}`, 'success');
    } catch (err: any) {
      const detail: string =
        err?.detail ?? err?.message ?? 'Certificate not found or verification service unavailable.';
      setError(detail);
      onShowToast?.('Verification Failed', detail, 'error');
    } finally {
      setLoading(false);
    }
  };

  const copySignature = () => {
    if (verificationResult?.signature) {
      navigator.clipboard.writeText(verificationResult.signature);
      setCopied(true);
      onShowToast?.('Signature Copied!', 'HMAC-SHA256 hash copied to clipboard.', 'success');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      style={{
        animation: 'fadeInUp 0.3s ease-out',
        fontFamily: 'var(--font-ui)',
        color: BB.text,
      }}
    >
      {/* Page header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 24,
          paddingBottom: 20,
          borderBottom: `1px solid ${BB.border}`,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: `linear-gradient(135deg, ${BB.primary}, ${BB.maroon})`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Award style={{ width: 18, height: 18, color: BB.text }} />
        </div>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, lineHeight: 1.2 }}>
            Portfolios &amp; Cryptographic Verification
          </h1>
          <p style={{ fontSize: 12, color: BB.muted, margin: '2px 0 0' }}>
            Verify tamper-proof HMAC-SHA256 digital signatures on student certificates.
          </p>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            padding: '12px 16px',
            borderRadius: 10,
            border: `1px solid rgba(178,58,78,0.35)`,
            background: 'rgba(110,20,35,0.15)',
            marginBottom: 20,
            fontSize: 12,
            color: BB.maroonLight,
          }}
        >
          <AlertCircle style={{ width: 16, height: 16, flexShrink: 0, marginTop: 1 }} />
          <span>{error}</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 20, alignItems: 'start' }}>

        {/* ── LEFT: Form + Security Standards ─────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Certificate Authenticator */}
          <div
            style={{
              background: BB.surface,
              border: `1px solid ${BB.border}`,
              borderRadius: 12,
              padding: '20px 20px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Lock style={{ width: 14, height: 14, color: BB.primaryLight }} />
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: BB.muted }}>
                Certificate Authenticator
              </span>
            </div>

            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: BB.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Project / Certificate UUID
            </label>
            <input
              type="text"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleVerify(); }}
              placeholder="e.g. proj-sample-001"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                border: `1px solid ${BB.border}`,
                background: BB.elevated,
                color: BB.text,
                fontSize: 12,
                fontFamily: 'var(--font-mono)',
                outline: 'none',
                boxSizing: 'border-box',
                marginBottom: 14,
                transition: 'border-color 150ms',
              }}
              onFocus={(e) => { e.target.style.borderColor = BB.primaryLight; }}
              onBlur={(e)  => { e.target.style.borderColor = BB.border; }}
            />

            <button
              onClick={handleVerify}
              disabled={loading}
              style={{
                width: '100%',
                padding: '11px 0',
                borderRadius: 8,
                border: 'none',
                background: loading ? BB.disabled : `linear-gradient(135deg, ${BB.primary}, ${BB.maroon})`,
                color: BB.text,
                fontSize: 13,
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--font-ui)',
                transition: 'opacity 150ms',
              }}
            >
              {loading ? 'Verifying…' : '🔏 Verify HMAC-SHA256 Signature'}
            </button>
          </div>

          {/* Unforgeable Guarantee */}
          <div
            style={{
              background: BB.surface,
              border: `1px solid ${BB.border}`,
              borderRadius: 12,
              padding: '18px 20px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <ShieldCheck style={{ width: 14, height: 14, color: BB.success }} />
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: BB.muted }}>
                Unforgeable Guarantee
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {[
                { color: BB.primaryLight, text: 'HMAC-SHA256 payload canonical hashing prevents title tampering.' },
                { color: BB.gold,         text: 'Constant-time signature comparison (secrets.compare_digest).' },
                { color: BB.success,      text: 'Employer-scannable QR verification links with revocation support.' },
              ].map(({ color, text }) => (
                <div key={text} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 11, color: BB.muted }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0, marginTop: 3 }} />
                  {text}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── RIGHT: Certificate Seal ──────────────────────────────────────── */}
        <div
          style={{
            background: `linear-gradient(135deg, rgba(75,59,124,0.12), rgba(110,20,35,0.08))`,
            border: `1px solid ${BB.border}`,
            borderRadius: 16,
            padding: '32px 28px',
            textAlign: 'center',
          }}
        >
          {verificationResult ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, alignItems: 'center' }}>
              {/* Stamp */}
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: '50%',
                  background: `linear-gradient(135deg, ${BB.primary}, ${BB.maroon})`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 28,
                  boxShadow: `0 0 24px rgba(107,92,166,0.4)`,
                }}
              >
                📜
              </div>

              {/* Status badge */}
              <div>
                <span
                  style={{
                    display: 'inline-block',
                    padding: '4px 14px',
                    borderRadius: 20,
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    background: verificationResult.verified
                      ? 'rgba(34,197,94,0.15)'
                      : 'rgba(178,58,78,0.15)',
                    color: verificationResult.verified ? BB.success : BB.maroonLight,
                    border: `1px solid ${verificationResult.verified ? 'rgba(34,197,94,0.3)' : 'rgba(178,58,78,0.3)'}`,
                  }}
                >
                  {verificationResult.verification_status}
                </span>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: BB.text, margin: '12px 0 4px' }}>
                  {verificationResult.title}
                </h2>
                <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: BB.muted }}>
                  Certificate ID:{' '}
                  <span style={{ color: BB.primaryLight }}>{verificationResult.certificate_id}</span>
                </div>
              </div>

              {/* QR code */}
              {verificationResult.qr_code_url && (
                <img
                  src={verificationResult.qr_code_url}
                  alt="QR Seal"
                  style={{
                    width: 128,
                    height: 128,
                    borderRadius: 12,
                    border: `2px solid ${BB.border}`,
                    padding: 6,
                    background: '#fff',
                  }}
                />
              )}

              {/* Signature */}
              <div
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  borderRadius: 10,
                  background: BB.base,
                  border: `1px solid ${BB.border}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  textAlign: 'left',
                }}
              >
                <div style={{ overflow: 'hidden' }}>
                  <span style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: BB.muted, marginBottom: 4 }}>
                    HMAC-SHA256 Digital Signature
                  </span>
                  <span style={{ display: 'block', fontSize: 11, fontFamily: 'var(--font-mono)', color: BB.primaryLight, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {verificationResult.signature}
                  </span>
                </div>
                <button
                  onClick={copySignature}
                  title="Copy Signature"
                  style={{
                    flexShrink: 0,
                    padding: 8,
                    borderRadius: 6,
                    border: `1px solid ${BB.border}`,
                    background: 'transparent',
                    color: BB.muted,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 150ms',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = BB.primaryLight; e.currentTarget.style.color = BB.text; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = BB.border; e.currentTarget.style.color = BB.muted; }}
                >
                  {copied
                    ? <Check style={{ width: 14, height: 14, color: BB.success }} />
                    : <Copy style={{ width: 14, height: 14 }} />
                  }
                </button>
              </div>
            </div>
          ) : (
            <div style={{ padding: '60px 0', color: BB.disabled }}>
              <QrCode style={{ width: 48, height: 48, margin: '0 auto 12px', opacity: 0.5 }} />
              <p style={{ fontSize: 12, lineHeight: 1.6, margin: 0 }}>
                Enter a project UUID on the left to verify<br />cryptographic certificate authenticity.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
