import React, { useState, useEffect } from 'react';
import { Clock, Shield, ArrowRight, Play, AlertCircle, RefreshCw } from 'lucide-react';
import { ClassroomService, type ExamLobbyResponse } from '../../services/api';

interface ExamLobbyViewProps {
  classroomId: string;
  onEnterWorkspace: () => void;
  onShowToast?: (title: string, description?: string, type?: 'success' | 'info' | 'error') => void;
}

export const ExamLobbyView: React.FC<ExamLobbyViewProps> = ({
  classroomId,
  onEnterWorkspace,
  onShowToast,
}) => {
  const [lobbyData, setLobbyData] = useState<ExamLobbyResponse | null>(null);
  const [countdown, setCountdown] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isEntering, setIsEntering] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchLobby = async () => {
    try {
      const data = await ClassroomService.getExamLobby(classroomId);
      setLobbyData(data);
      setCountdown(data.countdown_seconds);
      if (data.can_enter_workspace && !lobbyData?.can_enter_workspace) {
        onShowToast?.('Exam Open', 'The exam workspace is now available.', 'success');
      }
      setErrorMsg(null);
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to check exam lobby status.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLobby();
    const interval = setInterval(fetchLobby, 5000); // Polling every 5s
    return () => clearInterval(interval);
  }, [classroomId]);

  // Local second-by-second countdown decrement
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          fetchLobby();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const formatCountdown = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleEnter = async () => {
    setIsEntering(true);
    try {
      await ClassroomService.enterExamWorkspace(classroomId);
      onEnterWorkspace();
    } catch (err: any) {
      setErrorMsg(err.message || 'Cannot enter workspace at this time.');
    } finally {
      setIsEntering(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center space-y-3">
        <RefreshCw className="w-8 h-8 text-[#00D4FF] animate-spin" />
        <div className="text-xs font-mono text-[#9E93B8]">Connecting to Exam Lobby...</div>
      </div>
    );
  }

  const canEnter = lobbyData?.can_enter_workspace ?? false;

  return (
    <div className="max-w-2xl mx-auto my-8 p-6 md:p-10 rounded-2xl bg-[#151026] border border-[rgba(107,92,166,0.3)] shadow-2xl text-center space-y-6">
      {/* Badge */}
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#241B42] border border-[#00D4FF]/30 text-xs font-mono text-[#00D4FF]">
        <Shield className="w-3.5 h-3.5" />
        <span>University Examination Gate</span>
      </div>

      {/* Classroom Title */}
      <div className="space-y-1">
        <h1 className="text-2xl md:text-3xl font-extrabold text-[#F5F1EC]">
          {lobbyData?.classroom_name || 'Lab Examination'}
        </h1>
        <p className="text-xs text-[#9E93B8]">
          {canEnter
            ? 'The exam is now OPEN. You may enter the workspace and begin coding.'
            : 'You have completed early registration. Please wait in this lobby until the scheduled start time.'}
        </p>
      </div>

      {errorMsg && (
        <div className="p-3 rounded-xl bg-[#EF4444]/15 border border-[#EF4444]/40 text-[#EF4444] text-xs flex items-center justify-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Countdown Card (if waiting) */}
      {!canEnter && countdown > 0 && (
        <div className="py-6 px-8 rounded-2xl bg-[#0F0B1E] border border-[rgba(107,92,166,0.25)] space-y-2">
          <div className="text-[11px] font-mono uppercase tracking-wider text-[#9E93B8] flex items-center justify-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-[#F59E0B]" />
            <span>Time Remaining Until Exam Opens</span>
          </div>
          <div
            data-testid="lobby-countdown-display"
            className="font-mono font-black text-4xl md:text-6xl text-[#F59E0B] tracking-widest"
          >
            {formatCountdown(countdown)}
          </div>
          <div className="text-[11px] text-[#7C6BAE] font-mono">
            Server time synchronized • Workspace opens automatically
          </div>
        </div>
      )}

      {/* If exam is open or ready */}
      {canEnter ? (
        <div className="py-4 space-y-4">
          <div className="p-4 rounded-xl bg-[#00F5A0]/10 border border-[#00F5A0]/30 text-[#00F5A0] text-xs font-semibold">
            Exam workspace is active. Code execution, automated rubric checks, and deployment slots are enabled.
          </div>
          <button
            onClick={handleEnter}
            data-testid="enter-workspace-button"
            disabled={isEntering}
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl font-bold text-sm text-[#0B0912] shadow-xl hover:opacity-90 transition-all"
            style={{ background: 'linear-gradient(135deg, #00D4FF 0%, #00F5A0 100%)' }}
          >
            <Play className="w-4 h-4 fill-current" />
            <span>{isEntering ? 'Entering Environment...' : 'Enter Exam Workspace'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="py-2 text-xs text-[#9E93B8] italic flex items-center justify-center gap-2">
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#00D4FF]" />
          <span>Lobby status: Waiting for instructor start or scheduled window...</span>
        </div>
      )}

      {/* Policy Footer */}
      <div className="pt-4 border-t border-[rgba(107,92,166,0.2)] text-[11px] text-[#7C6BAE] space-y-1">
        <div>All code submissions are automatically recorded with SHA-256 hashes for reproducibility audits.</div>
        <div>Work is automatically submitted at the exam deadline.</div>
      </div>
    </div>
  );
};
