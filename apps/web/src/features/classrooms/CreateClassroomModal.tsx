import React, { useState } from 'react';
import { X, Plus, Copy, Check, Presentation, Clock, BookOpen } from 'lucide-react';
import { ClassroomService, type ClassroomCreateEnhanced } from '../../services/api';

interface CreateClassroomModalProps {
  onClose: () => void;
  onCreated: (classroom: any) => void;
  onOpenProjector: (code: string, name: string, courseId?: string) => void;
  onShowToast?: (title: string, description?: string, type?: 'success' | 'info' | 'error') => void;
}

export const CreateClassroomModal: React.FC<CreateClassroomModalProps> = ({
  onClose,
  onCreated,
  onOpenProjector,
  onShowToast,
}) => {
  const [name, setName] = useState('');
  const [courseId, setCourseId] = useState('');
  const [description, setDescription] = useState('');
  const [assignmentTitle, setAssignmentTitle] = useState('End-Semester ML Lab Practical Examination');
  const [instructions, setInstructions] = useState(
    'Train a classification estimator on the provided dataset. Ensure accuracy >= 0.80 and deploy model slot.'
  );
  const [starterCode, setStarterCode] = useState(
    `# Python starter code\nimport pandas as pd\nimport numpy as np\nfrom sklearn.ensemble import RandomForestClassifier\n\n# Your code here\n`
  );
  const [minAccuracy, setMinAccuracy] = useState('0.80');
  const [maxLatency, setMaxLatency] = useState('100');
  const [allowedDivisions, setAllowedDivisions] = useState('A, B, C');
  const [allowedBatches, setAllowedBatches] = useState('B1, B2, B3');
  const [enrollmentHint, setEnrollmentHint] = useState('Format: e.g. CS2026101');
  const [enrollmentPattern, setEnrollmentPattern] = useState('');
  const [requireApproval, setRequireApproval] = useState(false);
  const [examStartTime, setExamStartTime] = useState('');
  const [examEndTime, setExamEndTime] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdResult, setCreatedResult] = useState<{
    id: string;
    name: string;
    course_id?: string;
    join_code: string;
  } | null>(null);

  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      onShowToast?.('Missing Name', 'Please enter a classroom name.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: ClassroomCreateEnhanced = {
        name: name.trim(),
        course_id: courseId.trim() || undefined,
        description: description.trim() || undefined,
        assignment_title: assignmentTitle.trim() || undefined,
        instructions: instructions.trim() || undefined,
        starter_code: starterCode || undefined,
        rubric_json: {
          min_accuracy: parseFloat(minAccuracy) || 0.8,
          max_latency_ms: parseFloat(maxLatency) || 100,
          max_score: 100.0,
        },
        allowed_divisions: allowedDivisions
          ? allowedDivisions.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
          : undefined,
        allowed_batches: allowedBatches
          ? allowedBatches.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
          : undefined,
        enrollment_format_hint: enrollmentHint.trim() || undefined,
        enrollment_pattern: enrollmentPattern.trim() || undefined,
        require_approval: requireApproval,
        exam_start_time: examStartTime ? new Date(examStartTime).toISOString() : undefined,
        exam_end_time: examEndTime ? new Date(examEndTime).toISOString() : undefined,
      };

      const res = await ClassroomService.createClassroomEnhanced(payload);
      setCreatedResult({
        id: res.id,
        name: res.name,
        course_id: res.course_id,
        join_code: res.join_code,
      });
      onCreated(res);
      onShowToast?.(
        'Classroom Created',
        `Classroom "${res.name}" created with join code ${res.join_code}.`,
        'success'
      );
    } catch (err: any) {
      onShowToast?.('Creation Failed', err.message || 'Could not create classroom.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const inviteLink = createdResult
    ? `${window.location.origin}/classroom?join=${createdResult.join_code}`
    : '';

  const handleCopyCode = () => {
    if (!createdResult) return;
    navigator.clipboard.writeText(createdResult.join_code).then(() => {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    });
  };

  const handleCopyLink = () => {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Create Classroom"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto"
    >
      <div className="relative w-full max-w-2xl my-8 rounded-2xl bg-[#151026] border border-[rgba(107,92,166,0.3)] shadow-2xl p-6 md:p-8 text-[#F5F1EC] space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[rgba(107,92,166,0.25)] pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[#241B42] text-[#00D4FF] border border-[#00D4FF]/30">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#F5F1EC]">Create Classroom & Exam</h2>
              <p className="text-xs text-[#9E93B8]">
                Setup a lab section, configure student join policies, and define assignment rubric.
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

        {/* If classroom already created, show success & code actions */}
        {createdResult ? (
          <div className="space-y-6 py-4 text-center">
            <div className="p-4 rounded-2xl bg-[#00F5A0]/10 border border-[#00F5A0]/30 text-[#00F5A0] text-sm font-semibold">
              Classroom &quot;{createdResult.name}&quot; successfully initialized!
            </div>

            <div className="space-y-2">
              <div className="text-xs uppercase font-mono tracking-wider text-[#9E93B8]">
                6-Character Join Code
              </div>
              <div
                data-testid="created-join-code"
                className="font-mono font-black text-5xl md:text-6xl tracking-[0.2em] text-[#00D4FF] py-4 px-6 rounded-2xl bg-[#1C1534] border border-[#00D4FF]/40 inline-block shadow-lg"
              >
                {createdResult.join_code}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                onClick={handleCopyCode}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#241B42] hover:bg-[#2E2254] text-xs font-bold text-[#F5F1EC] border border-[rgba(107,92,166,0.3)] transition-all"
              >
                {copiedCode ? <Check className="w-4 h-4 text-[#00F5A0]" /> : <Copy className="w-4 h-4 text-[#00D4FF]" />}
                <span>{copiedCode ? 'Code Copied!' : 'Copy Code'}</span>
              </button>

              <button
                onClick={handleCopyLink}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#241B42] hover:bg-[#2E2254] text-xs font-bold text-[#F5F1EC] border border-[rgba(107,92,166,0.3)] transition-all"
              >
                {copiedLink ? <Check className="w-4 h-4 text-[#00F5A0]" /> : <Copy className="w-4 h-4 text-[#00F5A0]" />}
                <span>{copiedLink ? 'Link Copied!' : 'Copy Invite Link'}</span>
              </button>

              <button
                onClick={() => {
                  onClose();
                  onOpenProjector(createdResult.join_code, createdResult.name, createdResult.course_id);
                }}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-[#00D4FF] to-[#00F5A0] text-xs font-bold text-[#0B0912] shadow transition-all hover:opacity-90"
              >
                <Presentation className="w-4 h-4" />
                <span>Open Projector View</span>
              </button>
            </div>

            <div className="pt-4 border-t border-[rgba(107,92,166,0.2)]">
              <button
                onClick={onClose}
                className="px-6 py-2.5 rounded-xl bg-[#1C1534] hover:bg-[#241B42] text-xs font-bold text-[#F5F1EC] border border-[rgba(107,92,166,0.3)]"
              >
                Done / Back to Roster
              </button>
            </div>
          </div>
        ) : (
          /* Create Form */
          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="font-semibold text-[#9E93B8] block mb-1">
                  Classroom / Lab Section Name *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. CS401 Lab - Division A (Spring 2026)"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F0B1E] border border-[rgba(107,92,166,0.3)] text-[#F5F1EC] focus:outline-none focus:border-[#00D4FF]"
                />
              </div>

              <div>
                <label className="font-semibold text-[#9E93B8] block mb-1">
                  Course ID / Code (Optional)
                </label>
                <input
                  type="text"
                  value={courseId}
                  onChange={(e) => setCourseId(e.target.value)}
                  placeholder="e.g. CS401-LAB"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F0B1E] border border-[rgba(107,92,166,0.3)] text-[#F5F1EC] focus:outline-none focus:border-[#00D4FF]"
                />
              </div>
            </div>

            <div>
              <label className="font-semibold text-[#9E93B8] block mb-1">Description (Optional)</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief section details or instructor notes..."
                className="w-full px-3.5 py-2 rounded-xl bg-[#0F0B1E] border border-[rgba(107,92,166,0.3)] text-[#F5F1EC] focus:outline-none focus:border-[#00D4FF]"
              />
            </div>

            {/* Division & Batch lists & Enrollment hint/pattern */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-3.5 rounded-xl bg-[#1C1534]/50 border border-[rgba(107,92,166,0.2)]">
              <div>
                <label className="font-semibold text-[#9E93B8] block mb-1">
                  Allowed Divisions
                </label>
                <input
                  type="text"
                  value={allowedDivisions}
                  onChange={(e) => setAllowedDivisions(e.target.value)}
                  placeholder="A, B, C"
                  className="w-full px-3 py-1.5 rounded-lg bg-[#0F0B1E] border border-[rgba(107,92,166,0.3)] text-[#F5F1EC] focus:outline-none focus:border-[#00D4FF]"
                />
              </div>

              <div>
                <label className="font-semibold text-[#9E93B8] block mb-1">
                  Allowed Batches
                </label>
                <input
                  type="text"
                  value={allowedBatches}
                  onChange={(e) => setAllowedBatches(e.target.value)}
                  placeholder="B1, B2, B3"
                  className="w-full px-3 py-1.5 rounded-lg bg-[#0F0B1E] border border-[rgba(107,92,166,0.3)] text-[#F5F1EC] focus:outline-none focus:border-[#00D4FF]"
                />
              </div>

              <div>
                <label className="font-semibold text-[#9E93B8] block mb-1">
                  Enrollment Hint
                </label>
                <input
                  type="text"
                  value={enrollmentHint}
                  onChange={(e) => setEnrollmentHint(e.target.value)}
                  placeholder="e.g. CS2026XXX"
                  className="w-full px-3 py-1.5 rounded-lg bg-[#0F0B1E] border border-[rgba(107,92,166,0.3)] text-[#F5F1EC] focus:outline-none focus:border-[#00D4FF]"
                />
              </div>

              <div>
                <label className="font-semibold text-[#9E93B8] block mb-1">
                  Pattern (Regex)
                </label>
                <input
                  type="text"
                  value={enrollmentPattern}
                  onChange={(e) => setEnrollmentPattern(e.target.value)}
                  placeholder="^CS2026\d{3}$"
                  className="w-full px-3 py-1.5 rounded-lg bg-[#0F0B1E] border border-[rgba(107,92,166,0.3)] text-[#F5F1EC] focus:outline-none focus:border-[#00D4FF]"
                />
              </div>
            </div>

            {/* Schedule Window & Approval Gate */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
              <div>
                <label className="font-semibold text-[#9E93B8] block mb-1 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-[#00D4FF]" />
                  <span>Exam Start Time</span>
                </label>
                <input
                  type="datetime-local"
                  value={examStartTime}
                  onChange={(e) => setExamStartTime(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-[#0F0B1E] border border-[rgba(107,92,166,0.3)] text-[#F5F1EC] focus:outline-none focus:border-[#00D4FF]"
                />
              </div>

              <div>
                <label className="font-semibold text-[#9E93B8] block mb-1 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-[#F59E0B]" />
                  <span>Exam End Time</span>
                </label>
                <input
                  type="datetime-local"
                  value={examEndTime}
                  onChange={(e) => setExamEndTime(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-[#0F0B1E] border border-[rgba(107,92,166,0.3)] text-[#F5F1EC] focus:outline-none focus:border-[#00D4FF]"
                />
              </div>

              <div className="pt-4">
                <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg bg-[#1C1534] border border-[rgba(107,92,166,0.3)]">
                  <input
                    type="checkbox"
                    checked={requireApproval}
                    onChange={(e) => setRequireApproval(e.target.checked)}
                    className="rounded bg-[#0F0B1E] border-[rgba(107,92,166,0.3)] text-[#00D4FF]"
                  />
                  <span className="font-medium text-[#F5F1EC]">Require Approval to Join</span>
                </label>
              </div>
            </div>

            {/* Assignment & Rubric Section */}
            <div className="p-3.5 rounded-xl bg-[#0F0B1E] border border-[rgba(107,92,166,0.25)] space-y-3">
              <div className="flex items-center gap-2 font-bold text-[#F5F1EC]">
                <BookOpen className="w-4 h-4 text-[#00D4FF]" />
                <span>Assignment & Automated Rubric (Part C1)</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <label className="font-semibold text-[#9E93B8] block mb-1">Assignment Title</label>
                  <input
                    type="text"
                    value={assignmentTitle}
                    onChange={(e) => setAssignmentTitle(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-[#151026] border border-[rgba(107,92,166,0.3)] text-[#F5F1EC] focus:outline-none focus:border-[#00D4FF]"
                  />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="font-semibold text-[#9E93B8] block mb-1">Min Acc/F1</label>
                    <input
                      type="number"
                      step="0.05"
                      value={minAccuracy}
                      onChange={(e) => setMinAccuracy(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[#151026] border border-[rgba(107,92,166,0.3)] text-[#F5F1EC]"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="font-semibold text-[#9E93B8] block mb-1">Max Lat (ms)</label>
                    <input
                      type="number"
                      step="5"
                      value={maxLatency}
                      onChange={(e) => setMaxLatency(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[#151026] border border-[rgba(107,92,166,0.3)] text-[#F5F1EC]"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="font-semibold text-[#9E93B8] block mb-1">Instructions</label>
                <textarea
                  rows={2}
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-[#151026] border border-[rgba(107,92,166,0.3)] text-[#F5F1EC] focus:outline-none focus:border-[#00D4FF]"
                />
              </div>

              <div>
                <label className="font-semibold text-[#9E93B8] block mb-1">Starter Code (Python)</label>
                <textarea
                  rows={3}
                  value={starterCode}
                  onChange={(e) => setStarterCode(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-[#090614] border border-[rgba(107,92,166,0.3)] text-[#F5F1EC] font-mono text-[11px] focus:outline-none focus:border-[#00D4FF]"
                />
              </div>
            </div>

            {/* Form Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[rgba(107,92,166,0.2)]">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#9E93B8] hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2.5 rounded-xl text-xs font-bold text-[#0B0912] shadow transition-all hover:opacity-90 disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #00D4FF 0%, #00F5A0 100%)' }}
              >
                {isSubmitting ? 'Creating...' : 'Create Classroom & Generate Code'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
