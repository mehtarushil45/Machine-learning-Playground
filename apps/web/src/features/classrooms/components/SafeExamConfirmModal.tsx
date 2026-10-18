/**
 * SafeExamConfirmModal — Pre-flight confirmation before entering locked exam mode.
 *
 * Shows exam rules checklist. The "Enter Lockdown Exam" button is the user-gesture
 * that triggers document.requestFullscreen() (browser security requirement).
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, AlertTriangle, Eye, Keyboard, Monitor, X, Lock, ChevronRight } from 'lucide-react';

export interface SafeExamConfirmModalProps {
  examTitle: string;
  durationMinutes?: number;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

const RULES = [
  { icon: Monitor, text: 'Your screen will enter fullscreen — do NOT exit it.' },
  { icon: Eye, text: 'Tab switches, window blur, and alt-tab are detected as violations.' },
  { icon: Keyboard, text: 'Keyboard shortcuts (F5, F12, Ctrl+R, Ctrl+W, Ctrl+T) are disabled.' },
  { icon: AlertTriangle, text: 'Three violations will flag your session for review.' },
  { icon: Lock, text: 'You may not navigate away until the exam is submitted.' },
];

export const SafeExamConfirmModal: React.FC<SafeExamConfirmModalProps> = ({
  examTitle,
  durationMinutes,
  onConfirm,
  onCancel,
}) => {
  const [agreed, setAgreed] = useState(false);
  const [entering, setEntering] = useState(false);

  const handleEnter = async () => {
    if (!agreed || entering) return;
    setEntering(true);
    try {
      await onConfirm();
    } finally {
      setEntering(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-9999 flex items-center justify-center p-4"
        style={{ background: 'rgba(11,9,18,0.92)', backdropFilter: 'blur(12px)' }}
      >
        <motion.div
          initial={{ scale: 0.92, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.92, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 340, damping: 28 }}
          className="relative w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl"
          style={{
            background: 'linear-gradient(145deg, #151026 0%, #1C1534 100%)',
            border: '1.5px solid rgba(239,68,68,0.4)',
            boxShadow: '0 0 60px rgba(239,68,68,0.15), 0 30px 80px rgba(0,0,0,0.6)',
          }}
        >
          {/* Header */}
          <div
            className="px-7 pt-7 pb-5"
            style={{
              background: 'linear-gradient(135deg, rgba(239,68,68,0.12) 0%, rgba(245,158,11,0.08) 100%)',
              borderBottom: '1px solid rgba(239,68,68,0.2)',
            }}
          >
            <button
              onClick={onCancel}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-[#9E93B8] hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-3">
              <div
                className="p-3 rounded-2xl"
                style={{
                  background: 'linear-gradient(135deg, rgba(239,68,68,0.25) 0%, rgba(245,158,11,0.2) 100%)',
                  border: '1px solid rgba(239,68,68,0.35)',
                }}
              >
                <Shield className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <p className="text-[10px] font-bold tracking-widest text-red-400 uppercase mb-0.5">
                  Safe Exam Browser
                </p>
                <h2 className="text-base font-bold text-[#F5F1EC]">{examTitle}</h2>
              </div>
            </div>

            {durationMinutes && (
              <div className="flex items-center gap-2 text-xs text-[#9E93B8]">
                <span className="px-2 py-0.5 rounded-md bg-[#241B42] font-mono text-[#00D4FF] border border-[#00D4FF]/20">
                  {durationMinutes} min
                </span>
                <span>Timed session — once locked, the clock runs.</span>
              </div>
            )}
          </div>

          {/* Rules */}
          <div className="px-7 py-5 space-y-3">
            <p className="text-[11px] font-semibold text-[#9E93B8] uppercase tracking-wider mb-4">
              Exam Conduct Rules
            </p>
            {RULES.map(({ icon: Icon, text }, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.05 * i }}
                className="flex items-start gap-3"
              >
                <div
                  className="mt-0.5 p-1.5 rounded-lg shrink-0"
                  style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}
                >
                  <Icon className="w-3.5 h-3.5 text-red-400" />
                </div>
                <p className="text-xs text-[#C4BAD8] leading-relaxed">{text}</p>
              </motion.div>
            ))}
          </div>

          {/* Consent + CTA */}
          <div
            className="px-7 pb-7 pt-4 space-y-4"
            style={{ borderTop: '1px solid rgba(107,92,166,0.2)' }}
          >
            <label className="flex items-start gap-3 cursor-pointer group">
              <div className="relative mt-0.5 shrink-0">
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                />
                <div
                  className="w-4 h-4 rounded border-2 flex items-center justify-center transition-all"
                  style={{
                    borderColor: agreed ? '#EF4444' : 'rgba(107,92,166,0.5)',
                    background: agreed ? 'rgba(239,68,68,0.2)' : 'transparent',
                  }}
                  onClick={() => setAgreed(!agreed)}
                >
                  {agreed && <div className="w-2 h-2 rounded-sm bg-red-400" />}
                </div>
              </div>
              <span className="text-xs text-[#9E93B8] group-hover:text-[#C4BAD8] transition-colors leading-relaxed">
                I understand the rules above. I agree to take this exam under monitored lockdown.
                Any academic misconduct may result in disqualification.
              </span>
            </label>

            <div className="flex gap-3">
              <button
                onClick={onCancel}
                className="flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold text-[#9E93B8] hover:text-white border transition-all"
                style={{ borderColor: 'rgba(107,92,166,0.3)', background: 'transparent' }}
              >
                Cancel
              </button>
              <motion.button
                onClick={handleEnter}
                disabled={!agreed || entering}
                whileHover={agreed && !entering ? { scale: 1.02 } : {}}
                whileTap={agreed && !entering ? { scale: 0.98 } : {}}
                className="flex-2 flex items-center justify-center gap-2 py-2.5 px-5 rounded-xl text-xs font-bold transition-all"
                style={{
                  background: agreed
                    ? 'linear-gradient(135deg, #EF4444 0%, #F59E0B 100%)'
                    : 'rgba(61,53,88,0.6)',
                  color: agreed ? '#fff' : '#6B5CA5',
                  cursor: agreed && !entering ? 'pointer' : 'not-allowed',
                  boxShadow: agreed ? '0 4px 24px rgba(239,68,68,0.35)' : 'none',
                }}
              >
                {entering ? (
                  <>
                    <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.3" />
                      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                    <span>Entering Lockdown…</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5" />
                    <span>Enter Lockdown Exam</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </>
                )}
              </motion.button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
