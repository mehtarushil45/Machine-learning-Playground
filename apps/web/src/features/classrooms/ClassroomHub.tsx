import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  GraduationCap,
  RefreshCw,
  FileText,
  Search
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
      className="space-y-8"
    >
      {/* Page Header */}
      <div className="border-b border-[rgba(0,212,255,0.08)] pb-6">
        <h1 className="heading-display text-2xl flex items-center gap-2.5">
          <GraduationCap className="w-6 h-6 text-[#00D4FF]" /> Classroom System & Submission Reproducibility Engine
        </h1>
        <p className="text-sm text-[#94A3B8] mt-1">
          Faculty & reviewers can 1-click re-execute learner submissions in isolated worker containers to verify metric reproducibility and prevent plagiarism.
        </p>
      </div>

      {error && (
        <div className="badge-failed p-4 border rounded-xl text-xs font-medium">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left 5 Cols: Controls & Process Explainer */}
        <div className="lg:col-span-5 space-y-6">
          <div className="quantum-card space-y-5">
            <h3 className="micro-label flex items-center gap-2">
              <Search className="w-4 h-4 text-[#00D4FF]" /> Audit Learner Submission
            </h3>

            <div>
              <label className="micro-label block mb-1.5">Submission UUID</label>
              <input
                type="text"
                value={submissionId}
                onChange={(e) => setSubmissionId(e.target.value)}
                placeholder="sub-sample-001"
                className="quantum-input"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold mb-1.5">
                <span className="text-[#94A3B8]">Variance Tolerance Threshold</span>
                <span className="text-[#00D4FF] font-mono">±{(tolerance * 100).toFixed(1)}%</span>
              </div>
              <input
                type="range"
                min="0.001"
                max="0.05"
                step="0.001"
                value={tolerance}
                onChange={(e) => setTolerance(parseFloat(e.target.value))}
                className="w-full accent-[#00D4FF]"
              />
              <div className="flex justify-between text-[10px] text-[#475569] mt-1 font-mono">
                <span>0.1% (Strict Audit)</span>
                <span>5.0% (Lenient)</span>
              </div>
            </div>

            <button
              onClick={handleVerify}
              disabled={loading}
              className="btn-primary w-full"
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

          <div className="quantum-card space-y-3">
            <h4 className="micro-label">Automated Verification Protocol</h4>
            <div className="space-y-2 text-xs text-[#94A3B8]">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00D4FF]" /> Snapshot dataset version and hyperparameters.
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#7B5CF5]" /> Spawn isolated async training worker.
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00F5A0]" /> Compute metric variance vs claimed metrics.
              </div>
            </div>
          </div>
        </div>

        {/* Right 7 Cols: Metric Audit Table & Verification Report */}
        <div className="lg:col-span-7 quantum-card space-y-6">
          {auditReport ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-[#152540] pb-4">
                <div>
                  <h3 className="font-display text-sm font-bold text-white flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#00D4FF]" /> Submission Audit Report
                  </h3>
                  <div className="text-xs text-[#64748B] font-mono mt-0.5">{auditReport.submission_id}</div>
                </div>

                <span className={auditReport.is_reproducible ? 'badge-running' : 'badge-failed'}>
                  {auditReport.verification_status}
                </span>
              </div>

              <div className="p-4 rounded-xl bg-[#040912] border border-[#152540] text-xs text-[#E2E8F0]">
                <strong className="text-white">Audit Summary:</strong> {auditReport.audit_summary}
              </div>

              {/* Metric Difference Table */}
              <div className="space-y-3">
                <h4 className="micro-label">Claimed vs Re-Executed Metrics</h4>
                <div className="overflow-x-auto rounded-xl border border-[#152540]">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#040912] text-[#64748B] uppercase font-semibold text-[10px] tracking-wider border-b border-[#152540]">
                      <tr>
                        <th className="p-3">Metric Name</th>
                        <th className="p-3">Claimed</th>
                        <th className="p-3">Re-Executed</th>
                        <th className="p-3">Δ Variance</th>
                        <th className="p-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#152540] bg-[#070E1C]/60">
                      {auditReport.metric_differences.map((m) => (
                        <tr key={m.metric_name} className="hover:bg-[#101E36]">
                          <td className="p-3 font-semibold text-slate-200">{m.metric_name}</td>
                          <td className="p-3 font-mono text-slate-300">{m.claimed_value.toFixed(4)}</td>
                          <td className="p-3 font-mono text-slate-300">{m.reproduced_value.toFixed(4)}</td>
                          <td className={`p-3 font-mono ${m.within_tolerance ? 'text-[#00F5A0]' : 'text-[#FF4D6D]'}`}>
                            {m.difference < 0 ? '' : '+'}{m.difference.toFixed(5)}
                          </td>
                          <td className="p-3">
                            <span className={m.within_tolerance ? 'badge-running' : 'badge-failed'}>
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
            <div className="text-xs text-[#475569] text-center py-20">
              Enter a submission UUID and click verification button to re-execute student pipeline.
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};
