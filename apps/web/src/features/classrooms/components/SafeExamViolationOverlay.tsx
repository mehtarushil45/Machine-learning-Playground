/**
 * SafeExamViolationOverlay — Floating warning banner shown when a violation is recorded.
 *
 * - Appears for 4 seconds then fades out automatically.
 * - On the 3rd (final) violation, shows a critical "session flagged" state.
 * - Stacks new banners above old ones using AnimatePresence.
 */

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Shield, X } from 'lucide-react';
import { MAX_VIOLATIONS } from '../hooks/useSafeExamBrowser';

export interface SafeExamViolationOverlayProps {
  violations: number;
  /** Whether the session was flagged (max violations reached) */
  flagged: boolean;
}

interface ViolationEvent {
  id: number;
  count: number;
  critical: boolean;
}

export const SafeExamViolationOverlay: React.FC<SafeExamViolationOverlayProps> = ({
  violations,
  flagged,
}) => {
  const [events, setEvents] = useState<ViolationEvent[]>([]);
  const prevViolations = React.useRef(0);

  // When violations increases, push a new event
  useEffect(() => {
    if (violations > prevViolations.current) {
      const id = Date.now();
      const critical = violations >= MAX_VIOLATIONS;
      setEvents((prev) => [...prev, { id, count: violations, critical }]);
      prevViolations.current = violations;

      if (!critical) {
        // Auto-dismiss after 4s
        setTimeout(() => {
          setEvents((prev) => prev.filter((e) => e.id !== id));
        }, 4000);
      }
    }
  }, [violations]);

  return (
    <>
      {/* Violation Toast Stack — top right */}
      <div className="fixed top-4 right-4 z-[10001] space-y-3 pointer-events-none" style={{ maxWidth: 360 }}>
        <AnimatePresence>
          {events.map((evt) => (
            <motion.div
              key={evt.id}
              initial={{ opacity: 0, x: 80, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 80, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="pointer-events-auto rounded-2xl overflow-hidden shadow-2xl"
              style={{
                background: evt.critical
                  ? 'linear-gradient(135deg, #7F1D1D 0%, #1C0A0A 100%)'
                  : 'linear-gradient(135deg, #1C1534 0%, #241B42 100%)',
                border: `1.5px solid ${evt.critical ? 'rgba(239,68,68,0.7)' : 'rgba(245,158,11,0.5)'}`,
                boxShadow: evt.critical
                  ? '0 8px 40px rgba(239,68,68,0.35)'
                  : '0 8px 30px rgba(0,0,0,0.5)',
              }}
            >
              <div className="px-4 py-3 flex items-start gap-3">
                <div
                  className="mt-0.5 p-1.5 rounded-lg flex-shrink-0"
                  style={{
                    background: evt.critical ? 'rgba(239,68,68,0.25)' : 'rgba(245,158,11,0.2)',
                    border: `1px solid ${evt.critical ? 'rgba(239,68,68,0.4)' : 'rgba(245,158,11,0.3)'}`,
                  }}
                >
                  {evt.critical ? (
                    <Shield className="w-4 h-4 text-red-400" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-yellow-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-bold ${evt.critical ? 'text-red-400' : 'text-yellow-400'}`}>
                    {evt.critical
                      ? '🚨 Session Flagged — Maximum Violations Reached'
                      : `⚠️ Violation Detected (${evt.count}/${MAX_VIOLATIONS})`}
                  </p>
                  <p className="text-[11px] text-[#9E93B8] mt-0.5 leading-relaxed">
                    {evt.critical
                      ? 'Your session has been flagged for review. You may continue and submit, but proctors will be notified.'
                      : 'Tab switch, window blur, or fullscreen exit detected. Further violations will flag your session.'}
                  </p>
                </div>
                {!evt.critical && (
                  <button
                    onClick={() => setEvents((prev) => prev.filter((e) => e.id !== evt.id))}
                    className="p-1 rounded text-[#9E93B8] hover:text-white transition-colors flex-shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Violation progress bar */}
              <div className="px-4 pb-3">
                <div className="flex gap-1">
                  {Array.from({ length: MAX_VIOLATIONS }).map((_, i) => (
                    <div
                      key={i}
                      className="h-1 flex-1 rounded-full transition-all"
                      style={{
                        background: i < evt.count
                          ? (evt.critical ? '#EF4444' : '#F59E0B')
                          : 'rgba(107,92,166,0.25)',
                      }}
                    />
                  ))}
                </div>
                <p className="text-[10px] text-[#3D3558] mt-1 font-mono">
                  {MAX_VIOLATIONS - evt.count} warning{MAX_VIOLATIONS - evt.count !== 1 ? 's' : ''} remaining
                </p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Flagged Session Top Banner — persistent */}
      <AnimatePresence>
        {flagged && (
          <motion.div
            initial={{ opacity: 0, y: -60 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -60 }}
            className="fixed top-0 left-0 right-0 z-[10000] flex items-center justify-center gap-3 px-6 py-2.5"
            style={{
              background: 'linear-gradient(90deg, #7F1D1D 0%, #991B1B 50%, #7F1D1D 100%)',
              borderBottom: '1px solid rgba(239,68,68,0.6)',
              boxShadow: '0 4px 24px rgba(239,68,68,0.3)',
            }}
          >
            <Shield className="w-4 h-4 text-red-300 flex-shrink-0" />
            <p className="text-xs font-bold text-red-200">
              SESSION FLAGGED — Proctors will review this session. Submit your exam to complete it.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
