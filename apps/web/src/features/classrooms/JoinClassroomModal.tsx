import React, { useState, useEffect } from 'react';
import { X, KeyRound, ArrowRight, Clock, ShieldAlert } from 'lucide-react';
import { ClassroomService, type JoinPreviewResponse } from '../../services/api';

interface JoinClassroomModalProps {
  initialCode?: string;
  onClose: () => void;
  onJoined: (classroomId: string, status: string) => void;
  onShowToast?: (title: string, description?: string, type?: 'success' | 'info' | 'error') => void;
}

export const normalizeCodeInput = (raw: string): string => {
  if (!raw) return '';
  let s = raw.trim().toUpperCase().replace(/[\s\-]/g, '');
  const lookalikes: Record<string, string> = {
    'А': 'A', 'В': 'B', 'С': 'C', 'Е': 'E', 'Н': 'H', 'К': 'K', 'М': 'M',
    'О': 'O', 'Р': 'P', 'Т': 'T', 'Х': 'X', 'У': 'Y',
    '０': '0', '１': '1', '２': '2', '３': '3', '４': '4',
    '５': '5', '６': '6', '７': '7', '８': '8', '９': '9',
  };
  return s.split('').map((c) => lookalikes[c] || c).join('');
};

export const JoinClassroomModal: React.FC<JoinClassroomModalProps> = ({
  initialCode = '',
  onClose,
  onJoined,
  onShowToast,
}) => {
  const [code, setCode] = useState(normalizeCodeInput(initialCode));
  const [preview, setPreview] = useState<JoinPreviewResponse | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [waitingApproval, setWaitingApproval] = useState(false);

  // Auto-preview if initialCode is provided and 6 chars
  useEffect(() => {
    if (initialCode && normalizeCodeInput(initialCode).length === 6) {
      handleLookup(normalizeCodeInput(initialCode));
    }
  }, [initialCode]);

  const handleLookup = async (targetCode: string) => {
    const clean = normalizeCodeInput(targetCode);
    if (clean.length < 6) {
      setErrorMsg('Please enter a 6-character join code.');
      return;
    }
    setErrorMsg(null);
    setIsLoadingPreview(true);
    setPreview(null);
    try {
      const res = await ClassroomService.previewJoinCode(clean);
      setPreview(res);
    } catch (err: any) {
      setErrorMsg(err.message || "Code not valid or the classroom isn't accepting students");
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cleaned = normalizeCodeInput(e.target.value);
    setCode(cleaned);
    setErrorMsg(null);
    if (cleaned.length === 6 && (!preview || preview.id === '')) {
      handleLookup(cleaned);
    } else if (cleaned.length < 6) {
      setPreview(null);
    }
  };

  const handleJoin = async () => {
    if (!code || code.length < 6) return;
    setIsJoining(true);
    setErrorMsg(null);
    try {
      const res = await ClassroomService.joinClassroom(code);
      if (res.status === 'pending_approval') {
        setWaitingApproval(true);
        onShowToast?.('Approval Required', res.message, 'info');
      } else {
        onShowToast?.('Classroom Joined', res.message, 'success');
        onJoined(res.classroom_id, res.status);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Code not valid or the classroom isn't accepting students");
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Join Classroom"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
    >
      <div className="relative w-full max-w-md rounded-2xl bg-[#151026] border border-[rgba(107,92,166,0.3)] shadow-2xl p-6 md:p-8 text-[#F5F1EC] space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[rgba(107,92,166,0.25)] pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[#241B42] text-[#00D4FF] border border-[#00D4FF]/30">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#F5F1EC]">Join Classroom</h2>
              <p className="text-xs text-[#9E93B8]">
                Enter the 6-character code provided by your instructor.
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

        {waitingApproval ? (
          <div className="space-y-4 py-4 text-center">
            <div className="p-4 rounded-2xl bg-[#F59E0B]/10 border border-[#F59E0B]/30 text-[#F59E0B] text-sm font-semibold flex items-center justify-center gap-2">
              <Clock className="w-5 h-5 animate-pulse" />
              <span>Waiting for approval</span>
            </div>
            <p className="text-xs text-[#9E93B8]">
              Your join request was submitted to the instructor. Once approved, this classroom will appear under &quot;My Classrooms&quot;.
            </p>
            <button
              onClick={onClose}
              className="px-6 py-2 rounded-xl bg-[#1C1534] hover:bg-[#241B42] text-xs font-bold text-[#F5F1EC] border border-[rgba(107,92,166,0.3)]"
            >
              Close
            </button>
          </div>
        ) : (
          <div className="space-y-5 text-xs">
            {/* Input field */}
            <div>
              <label htmlFor="join-code-input" className="font-semibold text-[#9E93B8] block mb-2">
                Join Code (6 characters)
              </label>
              <div className="relative">
                <input
                  id="join-code-input"
                  data-testid="join-code-input"
                  type="text"
                  maxLength={10}
                  autoFocus
                  value={code}
                  onChange={handleInputChange}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (preview) handleJoin();
                      else handleLookup(code);
                    }
                  }}
                  placeholder="e.g. 7KM49P"
                  className="w-full px-4 py-3 rounded-xl bg-[#0F0B1E] border border-[rgba(107,92,166,0.4)] text-center font-mono font-black text-2xl tracking-[0.25em] text-[#00D4FF] focus:outline-none focus:border-[#00D4FF] placeholder:text-[#9E93B8]/30 placeholder:tracking-normal placeholder:font-normal placeholder:text-base uppercase"
                />
              </div>
            </div>

            {/* Error Message */}
            {errorMsg && (
              <div
                data-testid="join-error-banner"
                className="p-3 rounded-xl bg-[#EF4444]/15 border border-[#EF4444]/40 text-[#EF4444] text-xs flex items-center gap-2"
              >
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Loading Indicator */}
            {isLoadingPreview && (
              <div className="p-3 text-center text-[#00D4FF] font-mono animate-pulse">
                Verifying code with registry...
              </div>
            )}

            {/* Confirmation Preview (Part D2) */}
            {preview && !isLoadingPreview && (
              <div
                data-testid="join-confirmation-preview"
                className="p-4 rounded-xl bg-[#1C1534] border border-[#00D4FF]/30 space-y-2 animate-fadeIn"
              >
                <div className="flex items-center justify-between text-[11px] text-[#00D4FF] font-mono">
                  <span>Classroom Found</span>
                  {preview.require_approval && (
                    <span className="px-2 py-0.5 rounded bg-[#F59E0B]/20 text-[#F59E0B] font-bold">
                      Approval Required
                    </span>
                  )}
                </div>
                <div className="text-sm font-bold text-[#F5F1EC]">{preview.name}</div>
                {preview.course_id && (
                  <div className="text-xs text-[#9E93B8] font-mono">Course: {preview.course_id}</div>
                )}
                <div className="text-xs text-[#9E93B8]">
                  Instructor: <strong className="text-[#F5F1EC]">{preview.owner_name}</strong>
                </div>
              </div>
            )}

            {/* Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl font-semibold text-[#9E93B8] hover:text-white"
              >
                Cancel
              </button>

              {preview ? (
                <button
                  type="button"
                  data-testid="confirm-join-button"
                  disabled={isJoining}
                  onClick={handleJoin}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-[#0B0912] shadow transition-all hover:opacity-90 disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #00D4FF 0%, #00F5A0 100%)' }}
                >
                  <span>{isJoining ? 'Joining...' : 'Confirm & Join Classroom'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  data-testid="lookup-code-button"
                  disabled={code.length < 6 || isLoadingPreview}
                  onClick={() => handleLookup(code)}
                  className="px-5 py-2.5 rounded-xl font-bold bg-[#241B42] hover:bg-[#2E2254] text-[#00D4FF] border border-[#00D4FF]/30 transition-all disabled:opacity-40"
                >
                  Lookup Code
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
