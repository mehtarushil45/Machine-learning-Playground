/**
 * useSafeExamBrowser — Proctored Exam Lockdown Hook
 *
 * Responsibilities:
 *  - Request & maintain fullscreen while the exam is locked
 *  - Detect tab switch / window blur / visibility change -> count violations
 *  - Suppress dangerous keyboard shortcuts (F5, F12, Ctrl+R, Ctrl+W, Ctrl+T, Alt+Tab)
 *  - Block SPA navigation (beforeunload, popstate)
 *  - Expose { violations, isFullscreen, acquireFullscreen, release }
 */

import { useState, useEffect, useRef, useCallback } from 'react';

export interface SafeExamBrowserState {
  violations: number;
  isFullscreen: boolean;
  /** Call this inside a click handler (user-gesture) to enter fullscreen */
  acquireFullscreen: () => Promise<void>;
  /** Release all lockdown listeners (call on submission) */
  release: () => void;
}

export const MAX_VIOLATIONS = 3;

/** Keys to suppress during lockdown */
const BLOCKED_KEYS: Record<string, boolean> = {
  F5: true,
  F12: true,
  F11: true,
};

function isSuppressedCombo(e: KeyboardEvent): boolean {
  if (BLOCKED_KEYS[e.key]) return true;
  if (e.ctrlKey || e.metaKey) {
    const k = e.key.toLowerCase();
    if (['r', 'w', 't', 'n', 'l', 'u', 'f', 'j', 'p'].includes(k)) return true;
  }
  if (e.altKey && (e.key === 'Tab' || e.key === 'F4')) return true;
  return false;
}

export function useSafeExamBrowser(
  active: boolean,
  onViolation: (count: number) => void,
  onMaxViolations: () => void,
): SafeExamBrowserState {
  const [violations, setViolations] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const violationsRef = useRef(0);
  const activeRef = useRef(active);
  const cleanupCallbacks = useRef<Array<() => void>>([]);

  // Keep ref in sync
  useEffect(() => { activeRef.current = active; }, [active]);

  // Violation counter
  const recordViolation = useCallback(() => {
    if (!activeRef.current) return;
    violationsRef.current += 1;
    setViolations(violationsRef.current);
    onViolation(violationsRef.current);
    if (violationsRef.current >= MAX_VIOLATIONS) {
      onMaxViolations();
    }
  }, [onViolation, onMaxViolations]);

  // Fullscreen helpers
  const acquireFullscreen = useCallback(async () => {
    try {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    } catch {
      // Fullscreen not supported or denied — continue without it
    }
  }, []);

  const release = useCallback(() => {
    activeRef.current = false;
    cleanupCallbacks.current.forEach((fn) => fn());
    cleanupCallbacks.current = [];
    violationsRef.current = 0;
    setViolations(0);
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  // Mount / unmount listeners when `active` changes
  useEffect(() => {
    if (!active) return;

    const fns: Array<() => void> = [];

    // Fullscreen change listener
    const handleFSChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
      if (!document.fullscreenElement && activeRef.current) {
        recordViolation();
      }
    };
    document.addEventListener('fullscreenchange', handleFSChange);
    fns.push(() => document.removeEventListener('fullscreenchange', handleFSChange));

    // Window blur (alt-tab, taskbar click, etc.)
    const handleBlur = () => {
      if (activeRef.current) recordViolation();
    };
    window.addEventListener('blur', handleBlur);
    fns.push(() => window.removeEventListener('blur', handleBlur));

    // Visibility change (browser tab switch, minimise)
    const handleVisibility = () => {
      if (document.hidden && activeRef.current) recordViolation();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    fns.push(() => document.removeEventListener('visibilitychange', handleVisibility));

    // Keyboard suppression (capture phase)
    const handleKeydown = (e: KeyboardEvent) => {
      if (!activeRef.current) return;
      if (isSuppressedCombo(e)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener('keydown', handleKeydown, true);
    fns.push(() => document.removeEventListener('keydown', handleKeydown, true));

    // Context menu suppression
    const handleContextMenu = (e: MouseEvent) => {
      if (activeRef.current) e.preventDefault();
    };
    document.addEventListener('contextmenu', handleContextMenu);
    fns.push(() => document.removeEventListener('contextmenu', handleContextMenu));

    // SPA back-button lock
    window.history.pushState({ sebLocked: true }, '', window.location.href);
    const handlePopState = () => {
      if (activeRef.current) {
        window.history.pushState({ sebLocked: true }, '', window.location.href);
        recordViolation();
      }
    };
    window.addEventListener('popstate', handlePopState);
    fns.push(() => window.removeEventListener('popstate', handlePopState));

    // Before-unload lock
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!activeRef.current) return;
      e.preventDefault();
      e.returnValue = 'Your exam is in progress. Are you sure you want to leave?';
      return e.returnValue;
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    fns.push(() => window.removeEventListener('beforeunload', handleBeforeUnload));

    cleanupCallbacks.current = fns;

    return () => {
      fns.forEach((fn) => fn());
      cleanupCallbacks.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return { violations, isFullscreen, acquireFullscreen, release };
}
