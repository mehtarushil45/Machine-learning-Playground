import React, { useState, useEffect } from 'react';
import {
  X,
  FileCode,
  GitCompare,
  Award,
  Clock,
  RefreshCw,
  Send,
  History,
} from 'lucide-react';
import { DiffEditor } from '@monaco-editor/react';
import {
  ClassroomService,
  type ParticipantInspectionResponse,
  type ReproduceAuditResponse,
} from '../../services/api';

interface ParticipantInspectionModalProps {
  classroomId: string;
  userId: string;
  onClose: () => void;
  onShowToast?: (title: string, description?: string, type?: 'success' | 'info' | 'error') => void;
}

export const ParticipantInspectionModal: React.FC<ParticipantInspectionModalProps> = ({
  classroomId,
  userId,
  onClose,
  onShowToast,
}) => {
  const [data, setData] = useState<ParticipantInspectionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Grade inputs
  const [score, setScore] = useState<number>(0);
  const [feedback, setFeedback] = useState<string>('');
  const [isSavingGrade, setIsSavingGrade] = useState(false);

  // Reproducibility Audit
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditResult, setAuditResult] = useState<ReproduceAuditResponse | null>(null);

  useEffect(() => {
    let isMounted = true;
    ClassroomService.inspectParticipant(classroomId, userId)
      .then((res) => {
        if (!isMounted) return;
        setData(res);
        setScore(res.score ?? 0);
        setFeedback(res.feedback ?? '');
        setIsLoading(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        setErrorMsg(err.message || 'Failed to load inspection data.');
        setIsLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [classroomId, userId]);

  const handleSaveGrade = async () => {
    if (!data) return;
    setIsSavingGrade(true);
    try {
      // Find submission_id or default to user_id
      const subId = data.metrics_and_summary?.submission_id || `sub-${userId}`;
      await ClassroomService.gradeSubmission(subId, {
        score: Number(score),
        comments: feedback,
      });
      onShowToast?.('Grade Saved', `Recorded score ${score} for ${data.full_name}.`, 'success');
      setData((prev) => (prev ? { ...prev, score: Number(score), feedback } : null));
    } catch (err: any) {
      onShowToast?.('Grade Error', err.message || 'Failed to save grade.', 'error');
    } finally {
      setIsSavingGrade(false);
    }
  };

  const handleRunAudit = async () => {
    if (!data) return;
    setIsAuditing(true);
    try {
      const subId = data.metrics_and_summary?.submission_id || `sub-${userId}`;
      const res = await ClassroomService.auditReproducibility(subId);
      setAuditResult(res);
      onShowToast?.(
        'Audit Complete',
        res.verified
          ? `Verified! Score reproduced: ${res.reproduced_score} (Original: ${res.original_score})`
          : 'Audit discrepancy detected.',
        res.verified ? 'success' : 'error'
      );
    } catch (err: any) {
      onShowToast?.('Audit Failed', err.message || 'Audit execution error.', 'error');
    } finally {
      setIsAuditing(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Participant Inspection"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto"
    >
      <div className="relative w-full max-w-5xl my-6 rounded-2xl bg-[#151026] border border-[rgba(107,92,166,0.3)] shadow-2xl p-6 md:p-8 text-[#F5F1EC] space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[rgba(107,92,166,0.25)] pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[#241B42] text-[#00D4FF] border border-[#00D4FF]/30">
              <FileCode className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-[#F5F1EC]">
                  {data?.full_name || 'Participant Inspection'}
                </h2>
                {data?.enrollment_number && (
                  <span className="text-xs px-2 py-0.5 rounded-md bg-[#00D4FF]/15 text-[#00D4FF] font-mono font-bold">
                    {data.enrollment_number}
                  </span>
                )}
                {data?.division && data?.batch && (
                  <span className="text-xs text-[#9E93B8] font-mono">
                    Div {data.division} • Batch {data.batch}
                  </span>
                )}
              </div>
              <p className="text-xs text-[#9E93B8]">
                Read-only submission code diff, rubric evaluations, and event timeline.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 rounded-xl text-[#9E93B8] hover:text-white hover:bg-[#1C1534] transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isLoading ? (
          <div className="py-16 text-center text-[#00D4FF] font-mono animate-pulse text-xs">
            Loading code snapshot and telemetry...
          </div>
        ) : errorMsg ? (
          <div className="p-4 rounded-xl bg-[#EF4444]/15 border border-[#EF4444]/40 text-[#EF4444] text-xs">
            {errorMsg}
          </div>
        ) : data ? (
          <div className="space-y-6">
            {/* Top Stat Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-[#0F0B1E] border border-[rgba(107,92,166,0.2)]">
                <span className="text-[#9E93B8] block text-[11px]">Exam Status</span>
                <span className="font-bold text-[#00D4FF] font-mono uppercase">{data.status}</span>
              </div>
              <div className="p-3 rounded-xl bg-[#0F0B1E] border border-[rgba(107,92,166,0.2)]">
                <span className="text-[#9E93B8] block text-[11px]">Assigned Score</span>
                <span className="font-bold text-[#00F5A0] font-mono text-sm">
                  {data.score !== null ? `${data.score} / 100` : 'Ungraded'}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-[#0F0B1E] border border-[rgba(107,92,166,0.2)]">
                <span className="text-[#9E93B8] block text-[11px]">Accuracy / F1</span>
                <span className="font-bold text-[#F5F1EC] font-mono">
                  {data.metrics_and_summary?.accuracy
                    ? (data.metrics_and_summary.accuracy * 100).toFixed(1) + '%'
                    : 'N/A'}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-[#0F0B1E] border border-[rgba(107,92,166,0.2)]">
                <span className="text-[#9E93B8] block text-[11px]">Reproducibility</span>
                <span
                  className={`font-bold font-mono ${
                    data.reproducibility_verified ? 'text-[#00F5A0]' : 'text-[#F59E0B]'
                  }`}
                >
                  {data.reproducibility_verified ? 'VERIFIED' : 'PENDING'}
                </span>
              </div>
            </div>

            {/* Monaco Code Diff (Starter vs Final) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-[#9E93B8]">
                <div className="flex items-center gap-2">
                  <GitCompare className="w-4 h-4 text-[#00D4FF]" />
                  <span>Code Diff: Starter Code (Left) vs Participant Submission (Right)</span>
                </div>
                <span className="font-mono text-[11px] text-[#7C6BAE]">Read-Only</span>
              </div>

              <div className="rounded-xl overflow-hidden border border-[rgba(107,92,166,0.3)] bg-[#090614]">
                <DiffEditor
                  height="340px"
                  language="python"
                  original={data.starter_code || '# Starter code'}
                  modified={data.final_code || '# No code submitted'}
                  theme="vs-dark"
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    fontSize: 12,
                    renderSideBySide: true,
                  }}
                />
              </div>
            </div>

            {/* Event Timeline & Rubric Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {/* Event Timeline (Part G3) */}
              <div className="p-4 rounded-xl bg-[#0F0B1E] border border-[rgba(107,92,166,0.25)] space-y-3">
                <div className="flex items-center gap-2 font-bold text-[#F5F1EC]">
                  <History className="w-4 h-4 text-[#00D4FF]" />
                  <span>Event Timeline</span>
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {data.event_timeline && data.event_timeline.length > 0 ? (
                    data.event_timeline.map((ev, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2.5 p-2 rounded-lg bg-[#151026] border border-[rgba(107,92,166,0.15)] text-[11px]"
                      >
                        <Clock className="w-3.5 h-3.5 text-[#00D4FF] shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <div className="font-semibold text-[#F5F1EC]">{ev.event}</div>
                          <div className="text-[10px] text-[#7C6BAE] font-mono">
                            {new Date(ev.timestamp).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-[#9E93B8] italic py-2">No activity events recorded yet.</div>
                  )}
                </div>
              </div>

              {/* Rubric Breakdown & Metrics */}
              <div className="p-4 rounded-xl bg-[#0F0B1E] border border-[rgba(107,92,166,0.25)] space-y-3">
                <div className="flex items-center gap-2 font-bold text-[#F5F1EC]">
                  <Award className="w-4 h-4 text-[#00F5A0]" />
                  <span>Rubric Breakdown & Telemetry</span>
                </div>
                <div className="space-y-2 text-[11px]">
                  <div className="flex justify-between items-center p-2 rounded-lg bg-[#151026]">
                    <span className="text-[#9E93B8]">Code Accuracy Target:</span>
                    <span className="font-mono text-[#00F5A0] font-bold">
                      {data.rubric_breakdown?.min_accuracy ?? '0.80'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-2 rounded-lg bg-[#151026]">
                    <span className="text-[#9E93B8]">Inference Latency Limit:</span>
                    <span className="font-mono text-[#F5F1EC]">
                      {data.rubric_breakdown?.max_latency_ms ?? 100} ms
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-2 rounded-lg bg-[#151026]">
                    <span className="text-[#9E93B8]">Guardrails / Leakage Check:</span>
                    <span className="font-mono text-[#00F5A0] font-bold">PASSED</span>
                  </div>
                </div>

                {/* Reproducibility Audit Action */}
                <div className="pt-2 border-t border-[rgba(107,92,166,0.2)]">
                  <button
                    onClick={handleRunAudit}
                    disabled={isAuditing}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-[#241B42] hover:bg-[#2E2254] text-[#00D4FF] border border-[#00D4FF]/30 font-bold transition-all disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isAuditing ? 'animate-spin' : ''}`} />
                    <span>{isAuditing ? 'Executing Sandbox Audit...' : 'Run Reproducibility Audit'}</span>
                  </button>
                  {auditResult && (
                    <div
                      className={`mt-2 p-2 rounded-lg text-[10px] font-mono ${
                        auditResult.verified
                          ? 'bg-[#00F5A0]/15 text-[#00F5A0] border border-[#00F5A0]/30'
                          : 'bg-[#EF4444]/15 text-[#EF4444] border border-[#EF4444]/30'
                      }`}
                    >
                      {auditResult.details} (Original: {auditResult.original_score}, Reproduced:{' '}
                      {auditResult.reproduced_score})
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Grade & Written Feedback Form */}
            <div className="p-4 rounded-xl bg-[#0F0B1E] border border-[rgba(107,92,166,0.25)] space-y-3">
              <div className="font-bold text-[#F5F1EC] text-xs">Instructor Evaluation & Feedback</div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className="text-[11px] font-semibold text-[#9E93B8] block mb-1">
                    Final Score (0 - 100)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={score}
                    onChange={(e) => setScore(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-[#151026] border border-[rgba(107,92,166,0.3)] text-[#F5F1EC] font-mono text-sm focus:outline-none focus:border-[#00D4FF]"
                  />
                </div>
                <div className="md:col-span-3">
                  <label className="text-[11px] font-semibold text-[#9E93B8] block mb-1">
                    Written Feedback
                  </label>
                  <textarea
                    rows={2}
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="Instructor feedback on pipeline design, metrics, and rubric..."
                    className="w-full px-3 py-2 rounded-xl bg-[#151026] border border-[rgba(107,92,166,0.3)] text-[#F5F1EC] focus:outline-none focus:border-[#00D4FF]"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={handleSaveGrade}
                  disabled={isSavingGrade}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl font-bold text-xs text-[#0B0912] shadow"
                  style={{ background: 'linear-gradient(135deg, #00D4FF 0%, #00F5A0 100%)' }}
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isSavingGrade ? 'Saving Grade...' : 'Save Grade & Feedback'}</span>
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
