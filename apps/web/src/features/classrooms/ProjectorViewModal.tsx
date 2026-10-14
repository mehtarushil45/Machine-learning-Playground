import React, { useEffect } from 'react';
import { X, Copy, Check, Presentation, ShieldCheck } from 'lucide-react';

interface ProjectorViewModalProps {
  joinCode: string;
  classroomName: string;
  courseId?: string | null;
  instructorName?: string;
  onClose: () => void;
}

export const ProjectorViewModal: React.FC<ProjectorViewModalProps> = ({
  joinCode,
  classroomName,
  courseId,
  instructorName,
  onClose,
}) => {
  const [copied, setCopied] = React.useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleCopy = () => {
    navigator.clipboard.writeText(joinCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Projector View"
      className="fixed inset-0 z-50 flex flex-col justify-between p-8 md:p-14 bg-[#07050C] text-[#F5F1EC] select-none"
    >
      {/* Top Bar */}
      <div className="flex items-center justify-between border-b border-[rgba(107,92,166,0.3)] pb-6">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-[#241B42] text-[#00D4FF] border border-[#00D4FF]/30">
            <Presentation className="w-8 h-8" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest text-[#00D4FF] font-mono font-bold">
              Lab Practical Session • Projector Mode
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-[#F5F1EC]">
              {classroomName}
            </h1>
            {courseId && (
              <span className="text-sm font-mono text-[#9E93B8]">{courseId}</span>
            )}
          </div>
        </div>

        <button
          onClick={onClose}
          aria-label="Close Projector View"
          className="p-3 rounded-2xl bg-[#1C1534] hover:bg-[#2E2254] text-[#9E93B8] hover:text-white transition-all border border-[rgba(107,92,166,0.3)]"
        >
          <X className="w-7 h-7" />
        </button>
      </div>

      {/* Main Center Code Display */}
      <div className="my-auto text-center space-y-6">
        <div className="inline-block px-4 py-1.5 rounded-full bg-[#1C1534] border border-[#00D4FF]/40 text-xs font-mono text-[#00D4FF] tracking-wider uppercase">
          Enter this 6-Character Join Code
        </div>

        {/* Massive High-Contrast Code */}
        <div
          data-testid="projector-code-display"
          className="font-mono font-black text-6xl md:text-9xl lg:text-[140px] tracking-[0.25em] text-[#00D4FF] py-6 px-10 rounded-3xl bg-[#120D24] border-2 border-[#00D4FF]/40 shadow-[0_0_80px_rgba(0,212,255,0.15)] inline-block max-w-full overflow-hidden"
          style={{ textShadow: '0 0 40px rgba(0, 212, 255, 0.4)' }}
        >
          {joinCode}
        </div>

        <div className="flex justify-center">
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#241B42] hover:bg-[#2E2254] text-sm font-bold text-[#F5F1EC] border border-[rgba(107,92,166,0.4)] transition-all"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-[#00F5A0]" />
                <span className="text-[#00F5A0]">Code Copied to Clipboard</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-[#00D4FF]" />
                <span>Copy Join Code</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Bottom Instructions for Students */}
      <div className="rounded-2xl p-6 bg-[#120D24] border border-[rgba(107,92,166,0.25)] flex flex-col md:flex-row items-center justify-between gap-4 text-xs md:text-sm text-[#9E93B8]">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-6 h-6 text-[#00F5A0] shrink-0" />
          <span>
            <strong className="text-[#F5F1EC]">Student Instructions:</strong> 1. Open the ML Playground platform &rarr; 2. Click <strong>Join Classroom</strong> &rarr; 3. Enter the 6-character code above.
          </span>
        </div>
        <div className="font-mono text-xs text-[#7C6BAE] shrink-0">
          Instructor: {instructorName || 'Course Faculty'} • Press <kbd className="px-1.5 py-0.5 rounded bg-[#1C1534] border border-[rgba(107,92,166,0.4)] text-[#F5F1EC]">ESC</kbd> to exit
        </div>
      </div>
    </div>
  );
};
