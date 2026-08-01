import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  GraduationCap,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  FileText,
  Sliders,
  ShieldCheck,
  Search,
  Activity
} from 'lucide-react';
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
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="p-8 max-w-[1600px] mx-auto space-y-8"
    >
      {/* Page Header */}
      <div className="border-b border-slate-800/80 pb-6">
        <h1 className="text-2xl font-extrabold tracking-tight gradient-heading flex items-center gap-2.5">
          <GraduationCap className="w-6 h-6 text-cyan-400" /> Classroom System & Submission Reproducibility Engine
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Faculty & reviewers can 1-click re-execute learner submissions in isolated worker containers to verify metric reproducibility and prevent plagiarism.
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-medium">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left 5 Cols: Controls & Process Explainer */}
        <div className="lg:col-span-5 space-y-6">
          <div className="glass-panel p-6 rounded-2xl space-y-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Search className="w-4 h-4 text-cyan-400" /> Audit Learner Submission
            </h3>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Submission UUID</label>
              <input
                type="text"
                value={submissionId}
                onChange={(e) => setSubmissionId(e.target.value)}
                placeholder="sub-sample-001"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-cyan-400 font-mono"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold mb-1.5">
                <span className="text-slate-300">Variance Tolerance Threshold</span>
                <span className="text-cyan-400 font-mono">±{(tolerance * 100).toFixed(1)}%</span>
              </div>
              <input
                type="range"
                min="0.001"
                max="0.05"
                step="0.001"
                value={tolerance}
                onChange={(e) => setTolerance(parseFloat(e.target.value))}
                className="w-full accent-cyan-400"
              />
              <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
                <span>0.1% (Strict Audit)</span>
                <span>5.0% (Lenient)</span>
              </div>
            </div>

            <button
              onClick={handleVerify}
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-lg shadow-cyan-600/30 transition-all cursor-pointer hover:scale-[1.01]"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Re-Executing Pipeline Worker...
                </>
              ) : (
                '🔬 Run 1-Click Reproducibility Verification'
              )}
            </button>
          </div>

          <div className="glass-panel p-6 rounded-2xl space-y-3">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Automated Verification Protocol</h4>
            <div className="space-y-2 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" /> Snapshot dataset version and hyperparameters.
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" /> Spawn isolated async training worker.
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Compute metric variance vs claimed metrics.
              </div>
            </div>
          </div>
        </div>

        {/* Right 7 Cols: Metric Audit Table & Verification Report */}
        <div className="lg:col-span-7 glass-panel p-6 rounded-2xl space-y-6">
          {auditReport ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <FileText className="w-4 h-4 text-cyan-400" /> Submission Audit Report
                  </h3>
                  <div className="text-xs text-slate-400 font-mono mt-0.5">{auditReport.submission_id}</div>
                </div>

                <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
                  auditReport.is_reproducible
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                }`}>
                  {auditReport.verification_status}
                </span>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-300">
                <strong className="text-white">Audit Summary:</strong> {auditReport.audit_summary}
              </div>

              {/* Metric Difference Table */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Claimed vs Re-Executed Metrics</h4>
                <div className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900 text-slate-400 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-800">
                      <tr>
                        <th className="p-3">Metric Name</th>
                        <th className="p-3">Claimed</th>
                        <th className="p-3">Re-Executed</th>
                        <th className="p-3">Δ Variance</th>
                        <th className="p-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {auditReport.metric_differences.map((m) => (
                        <tr key={m.metric_name} className="hover:bg-slate-900/40">
                          <td className="p-3 font-semibold text-slate-200">{m.metric_name}</td>
                          <td className="p-3 font-mono text-slate-300">{m.claimed_value.toFixed(4)}</td>
                          <td className="p-3 font-mono text-slate-300">{m.reproduced_value.toFixed(4)}</td>
                          <td className={`p-3 font-mono ${m.within_tolerance ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {m.difference < 0 ? '' : '+'}{m.difference.toFixed(5)}
                          </td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              m.within_tolerance ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                            }`}>
                              {m.within_tolerance ? 'PASS ✓' : 'EXCEEDED ✗'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-400 text-center py-20">
              Enter a submission UUID and click verification button to re-execute student pipeline.
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};
