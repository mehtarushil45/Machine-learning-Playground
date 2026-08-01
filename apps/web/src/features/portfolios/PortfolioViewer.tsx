import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Award,
  Lock,
  ShieldCheck,
  CheckCircle2,
  Copy,
  Check,
  ExternalLink,
  QrCode,
  Sparkles
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
    setLoading(true);
    setError(null);
    try {
      const res = await PortfolioService.verifyCertificate(projectId);
      setVerificationResult(res);
      if (onShowToast) onShowToast('Certificate Verified!', `Status: ${res.verification_status}`);
    } catch (err: any) {
      setError(err.message || 'Certificate verification failed');
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
      className="p-8 max-w-[1600px] mx-auto space-y-8"
    >
      {/* Page Header */}
      <div className="border-b border-slate-800/80 pb-6">
        <h1 className="text-2xl font-extrabold tracking-tight gradient-heading flex items-center gap-2.5">
          <Award className="w-6 h-6 text-purple-400" /> Learner Portfolios & Cryptographic QR Verification
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Verify tamper-proof HMAC-SHA256 digital signatures on student practical project certificates with instant QR seal verification.
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-medium">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left 5 Cols: Form & Security Standards */}
        <div className="lg:col-span-5 space-y-6">
          <div className="glass-panel p-6 rounded-2xl space-y-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Lock className="w-4 h-4 text-purple-400" /> Certificate Authenticator
            </h3>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Project / Certificate UUID</label>
              <input
                type="text"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                placeholder="e.g. proj-sample-001"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-purple-500 font-mono"
              />
            </div>

            <button
              onClick={handleVerifyCertificate}
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-lg shadow-purple-600/30 transition-all cursor-pointer hover:scale-[1.01]"
            >
              {loading ? 'Verifying Digital Signature...' : '🔏 Verify HMAC-SHA256 Signature'}
            </button>
          </div>

          <div className="glass-panel p-6 rounded-2xl space-y-3">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" /> Unforgeable Guarantee
            </h4>
            <div className="space-y-2 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400" /> HMAC-SHA256 payload canonical hashing prevents title tampering.
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" /> Constant-time signature comparison (`secrets.compare_digest`).
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Employer-scannable QR verification links.
              </div>
            </div>
          </div>
        </div>

        {/* Right 7 Cols: Certificate Verification Card Seal */}
        <div className="lg:col-span-7 glass-panel p-8 rounded-2xl border border-purple-500/30 shadow-[0_0_30px_rgba(139,92,246,0.15)] text-center space-y-6">
          {verificationResult ? (
            <div className="space-y-6">
              {/* Stamp Circle */}
              <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-500 mx-auto flex items-center justify-center text-white text-3xl shadow-xl shadow-purple-500/30">
                📜
              </div>

              <div>
                <span className={`px-4 py-1.5 rounded-full text-xs font-extrabold border ${
                  verificationResult.verified
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                    : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                }`}>
                  {verificationResult.verification_status}
                </span>

                <h2 className="text-xl font-extrabold text-white mt-3">{verificationResult.title}</h2>
                <div className="text-xs font-mono text-slate-400 mt-1">
                  Certificate ID: <span className="text-cyan-400">{verificationResult.certificate_id}</span>
                </div>
              </div>

              {verificationResult.qr_code_url && (
                <div className="py-2">
                  <img
                    src={verificationResult.qr_code_url}
                    alt="QR Seal"
                    className="w-36 h-36 mx-auto rounded-xl border-2 border-purple-500/40 p-1.5 bg-white shadow-lg"
                  />
                </div>
              )}

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-left text-xs font-mono text-slate-300 flex items-center justify-between">
                <div className="truncate">
                  <span className="text-slate-400 uppercase font-semibold block text-[10px]">HMAC-SHA256 Digital Signature</span>
                  <span className="text-indigo-300 truncate block mt-0.5">{verificationResult.signature}</span>
                </div>
                <button
                  onClick={copySignature}
                  className="text-slate-400 hover:text-white p-2 rounded hover:bg-slate-800 transition-colors shrink-0 ml-3"
                  title="Copy Signature"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-400 py-24 space-y-2">
              <QrCode className="w-12 h-12 text-slate-600 mx-auto opacity-50" />
              <div>Enter a project UUID on the left to verify cryptographic certificate authenticity.</div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};
