import React, { useState, useEffect } from 'react';
import { X, UserCheck, Shield, Lock, AlertCircle, ArrowRight } from 'lucide-react';
import { ClassroomService, type MemberDetailsResponse, type SaveMemberDetailsRequest } from '../../services/api';

interface StudentDetailsModalProps {
  classroomId: string;
  onClose: () => void;
  onSaved: (details: MemberDetailsResponse) => void;
  onShowToast?: (title: string, description?: string, type?: 'success' | 'info' | 'error') => void;
}

export const StudentDetailsModal: React.FC<StudentDetailsModalProps> = ({
  classroomId,
  onClose,
  onSaved,
  onShowToast,
}) => {
  const [details, setDetails] = useState<MemberDetailsResponse | null>(null);
  const [fullName, setFullName] = useState('');
  const [enrollmentNumber, setEnrollmentNumber] = useState('');
  const [division, setDivision] = useState('');
  const [batch, setBatch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    ClassroomService.getMyDetails(classroomId)
      .then((data) => {
        if (!isMounted) return;
        setDetails(data);
        setFullName(data.full_name || '');
        setEnrollmentNumber(data.enrollment_number || '');
        setDivision(data.division || (data.allowed_divisions?.[0] || ''));
        setBatch(data.batch || (data.allowed_batches?.[0] || ''));
        setIsLoading(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        setErrorMsg(err.message || 'Failed to fetch membership details.');
        setIsLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [classroomId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setErrorMsg('Full name is required.');
      return;
    }
    if (!enrollmentNumber.trim()) {
      setErrorMsg('Enrollment number is required.');
      return;
    }
    if (!division.trim()) {
      setErrorMsg('Division is required.');
      return;
    }
    if (!batch.trim()) {
      setErrorMsg('Batch is required.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const payload: SaveMemberDetailsRequest = {
        full_name: fullName.trim(),
        enrollment_number: enrollmentNumber.trim(),
        division: division.trim().toUpperCase(),
        batch: batch.trim().toUpperCase(),
      };
      const res = await ClassroomService.saveMyDetails(classroomId, payload);
      onShowToast?.('Details Saved', 'Your exam enrollment details have been saved.', 'success');
      onSaved(res);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save details. Check enrollment number.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isLocked = details ? !details.can_edit : false;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Student Details"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
    >
      <div className="relative w-full max-w-lg rounded-2xl bg-[#151026] border border-[rgba(107,92,166,0.3)] shadow-2xl p-6 md:p-8 text-[#F5F1EC] space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[rgba(107,92,166,0.25)] pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[#241B42] text-[#00D4FF] border border-[#00D4FF]/30">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#F5F1EC]">Participant Registration Details</h2>
              <p className="text-xs text-[#9E93B8]">
                {details?.classroom_name || 'Classroom Examination'}
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
          <div className="py-8 text-center text-[#00D4FF] font-mono animate-pulse text-xs">
            Loading membership information...
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            {/* Privacy Notice (Part E3) */}
            <div className="p-3 rounded-xl bg-[#241B42]/50 border border-[rgba(107,92,166,0.3)] flex items-start gap-2.5 text-[#9E93B8]">
              <Shield className="w-4 h-4 text-[#00D4FF] shrink-0 mt-0.5" />
              <span>
                These details are stored on your classroom membership and are visible only to the classroom instructor for grading and official attendance.
              </span>
            </div>

            {/* Locked Notice if exam started (Part E4) */}
            {isLocked && (
              <div className="p-3 rounded-xl bg-[#F59E0B]/15 border border-[#F59E0B]/40 text-[#F59E0B] flex items-center gap-2">
                <Lock className="w-4 h-4 shrink-0" />
                <span>
                  Details are locked because your exam has already started. Any required corrections must be requested from the instructor.
                </span>
              </div>
            )}

            {errorMsg && (
              <div
                data-testid="details-error-banner"
                className="p-3 rounded-xl bg-[#EF4444]/15 border border-[#EF4444]/40 text-[#EF4444] flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Full Name */}
            <div>
              <label htmlFor="student-full-name" className="font-semibold text-[#9E93B8] block mb-1">
                Full Name *
              </label>
              <input
                id="student-full-name"
                data-testid="student-full-name-input"
                type="text"
                required
                disabled={isLocked}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Mehta Rushil"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F0B1E] border border-[rgba(107,92,166,0.3)] text-[#F5F1EC] focus:outline-none focus:border-[#00D4FF] disabled:opacity-50"
              />
            </div>

            {/* Enrollment Number */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="student-enrollment-number" className="font-semibold text-[#9E93B8]">
                  Enrollment / Roll Number *
                </label>
                {details?.enrollment_format_hint && (
                  <span className="text-[10px] text-[#00D4FF] font-mono">
                    {details.enrollment_format_hint}
                  </span>
                )}
              </div>
              <input
                id="student-enrollment-number"
                data-testid="student-enrollment-input"
                type="text"
                required
                disabled={isLocked}
                value={enrollmentNumber}
                onChange={(e) => setEnrollmentNumber(e.target.value)}
                placeholder="e.g. CS2026042"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F0B1E] border border-[rgba(107,92,166,0.3)] text-[#F5F1EC] font-mono uppercase focus:outline-none focus:border-[#00D4FF] disabled:opacity-50"
              />
            </div>

            {/* Division & Batch */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="student-division-select" className="font-semibold text-[#9E93B8] block mb-1">
                  Division *
                </label>
                {details?.allowed_divisions && details.allowed_divisions.length > 0 ? (
                  <select
                    id="student-division-select"
                    data-testid="student-division-select"
                    disabled={isLocked}
                    value={division}
                    onChange={(e) => setDivision(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-[#0F0B1E] border border-[rgba(107,92,166,0.3)] text-[#F5F1EC] font-semibold focus:outline-none focus:border-[#00D4FF] disabled:opacity-50"
                  >
                    {details.allowed_divisions.map((d) => (
                      <option key={d} value={d}>
                        Division {d}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id="student-division-select"
                    type="text"
                    required
                    disabled={isLocked}
                    value={division}
                    onChange={(e) => setDivision(e.target.value)}
                    placeholder="e.g. A"
                    className="w-full px-3 py-2.5 rounded-xl bg-[#0F0B1E] border border-[rgba(107,92,166,0.3)] text-[#F5F1EC] uppercase font-semibold focus:outline-none focus:border-[#00D4FF] disabled:opacity-50"
                  />
                )}
              </div>

              <div>
                <label htmlFor="student-batch-select" className="font-semibold text-[#9E93B8] block mb-1">
                  Batch *
                </label>
                {details?.allowed_batches && details.allowed_batches.length > 0 ? (
                  <select
                    id="student-batch-select"
                    data-testid="student-batch-select"
                    disabled={isLocked}
                    value={batch}
                    onChange={(e) => setBatch(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-[#0F0B1E] border border-[rgba(107,92,166,0.3)] text-[#F5F1EC] font-semibold focus:outline-none focus:border-[#00D4FF] disabled:opacity-50"
                  >
                    {details.allowed_batches.map((b) => (
                      <option key={b} value={b}>
                        Batch {b}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id="student-batch-select"
                    type="text"
                    required
                    disabled={isLocked}
                    value={batch}
                    onChange={(e) => setBatch(e.target.value)}
                    placeholder="e.g. B1"
                    className="w-full px-3 py-2.5 rounded-xl bg-[#0F0B1E] border border-[rgba(107,92,166,0.3)] text-[#F5F1EC] uppercase font-semibold focus:outline-none focus:border-[#00D4FF] disabled:opacity-50"
                  />
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-[rgba(107,92,166,0.2)]">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl font-semibold text-[#9E93B8] hover:text-white"
              >
                Cancel
              </button>

              {!isLocked ? (
                <button
                  type="submit"
                  data-testid="save-details-button"
                  disabled={isSubmitting}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-[#0B0912] shadow transition-all hover:opacity-90 disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #00D4FF 0%, #00F5A0 100%)' }}
                >
                  <span>{isSubmitting ? 'Saving...' : 'Save and continue'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onSaved(details!)}
                  className="px-6 py-2.5 rounded-xl font-bold bg-[#1C1534] hover:bg-[#241B42] text-[#00D4FF] border border-[#00D4FF]/30"
                >
                  Continue to Workspace
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
