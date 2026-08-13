import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Award,
  Lock,
  ShieldCheck,
  Copy,
  Check,
  QrCode
} from 'lucide-react';
import { PortfolioService, CertificateVerificationResponse } from '../../services/api';

interface PortfolioViewerProps {
  onShowToast?: (title: string, description?: string) => void;
}

export const PortfolioViewer: React.FC<PortfolioViewerProps> = ({ onShowToast }) => {
  const [projectId, setProjectId] = useState('proj-sample-001');
  const [verificationResult, setVerificationResult] = useState<CertificateVerificationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleVerifyCertificate = async () => {
    if (!projectId.trim()) {
      setError('Please enter a Project ID');
      return;
    }

    setLoading(true);
    setError(null);
    setVerificationResult(null);
    try {
      const res = await PortfolioService.verifyCertificate(projectId);
      setVerificationResult(res);
      if (onShowToast) onShowToast('Certificate Verified!', `Status: ${res.verification_status}`);
    } catch (err: any) {
      const detail: string =
        err?.detail ??
        err?.message ??
        'Certificate not found or verification service unavailable. Check the Project ID and try again.';
      setError(detail);
      if (onShowToast) onShowToast('Verification Failed', detail);
    } finally {
      setLoading(false);
    }
  };

  const copySignature = () => {
    if (verificationResult?.signature) {
      navigator.clipboard.writeText(verificationResult.signature);
      setCopied(true);
      if (onShowToast) onShowToast('Signature Copied!', 'HMAC-SHA256 hash copied.');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-8"
    >
      {/* Page Header */}
      <div className="border-b border-[rgba(0,212,255,0.08)] pb-6">
        <h1 className="heading-display text-2xl flex items-center gap-2.5">
          <Award className="w-6 h-6 text-[#7B5CF5]" /> Learner Portfolios & Cryptographic QR Verification
        </h1>
        <p className="text-sm text-[#94A3B8] mt-1">
          Verify tamper-proof HMAC-SHA256 digital signatures on student practical project certificates with instant QR seal verification.
        </p>
      </div>

      {error && (
        <div className="badge-failed p-4 border rounded-xl text-xs font-medium">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left 5 Cols: Form & Security Standards */}
        <div className="lg:col-span-5 space-y-6">
          <div className="quantum-card space-y-5">
            <h3 className="micro-label flex items-center gap-2">
              <Lock className="w-4 h-4 text-[#7B5CF5]" /> Certificate Authenticator
            </h3>

            <div>
              <label className="micro-label block mb-1.5">Project / Certificate UUID</label>
              <input
                type="text"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                placeholder="e.g. proj-sample-001"
                className="quantum-input"
              />
            </div>

            <button
              onClick={handleVerifyCertificate}
              disabled={loading}
              className="btn-primary w-full"
            >
              {loading ? 'Verifying Digital Signature...' : '🔏 Verify HMAC-SHA256 Signature'}
            </button>
          </div>

          <div className="quantum-card space-y-3">
            <h4 className="micro-label flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#00F5A0]" /> Unforgeable Guarantee
            </h4>
            <div className="space-y-2 text-xs text-[#94A3B8]">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#7B5CF5]" /> HMAC-SHA256 payload canonical hashing prevents title tampering.
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00D4FF]" /> Constant-time signature comparison (`secrets.compare_digest`).
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00F5A0]" /> Employer-scannable QR verification links.
              </div>
            </div>
          </div>
        </div>

        {/* Right 7 Cols: Certificate Verification Card Seal */}
        <div className="lg:col-span-7 quantum-glass-hero p-8 rounded-2xl text-center space-y-6">
          {verificationResult ? (
            <div className="space-y-6">
              {/* Stamp Circle */}
              <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-[#00D4FF] to-[#7B5CF5] mx-auto flex items-center justify-center text-white text-3xl shadow-[0_0_24px_rgba(123,92,245,0.5)]">
                📜
              </div>

              <div>
                <span className={verificationResult.verified ? 'badge-running' : 'badge-failed'}>
                  {verificationResult.verification_status}
                </span>

                <h2 className="font-display text-xl font-bold text-white mt-3">{verificationResult.title}</h2>
                <div className="text-xs font-mono text-[#94A3B8] mt-1">
                  Certificate ID: <span className="text-[#00D4FF]">{verificationResult.certificate_id}</span>
                </div>
              </div>

              {verificationResult.qr_code_url && (
                <div className="py-2">
                  <img
                    src={verificationResult.qr_code_url}
                    alt="QR Seal"
                    className="w-36 h-36 mx-auto rounded-xl border-2 border-[#7B5CF5]/40 p-1.5 bg-white shadow-lg"
                  />
                </div>
              )}

              <div className="p-4 rounded-xl bg-[#040912] border border-[#152540] text-left text-xs font-mono text-[#94A3B8] flex items-center justify-between">
                <div className="truncate">
                  <span className="micro-label block">HMAC-SHA256 Digital Signature</span>
                  <span className="text-[#00D4FF] truncate block mt-0.5">{verificationResult.signature}</span>
                </div>
                <button
                  onClick={copySignature}
                  className="btn-icon !p-1.5 ml-3"
                  title="Copy Signature"
                >
                  {copied ? <Check className="w-4 h-4 text-[#00F5A0]" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
          ) : (
            <div className="text-xs text-[#475569] py-24 space-y-2">
              <QrCode className="w-12 h-12 text-[#334155] mx-auto opacity-50" />
              <div>Enter a project UUID on the left to verify cryptographic certificate authenticity.</div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};
