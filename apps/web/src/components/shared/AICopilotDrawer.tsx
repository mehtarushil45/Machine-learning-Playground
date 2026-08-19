import React, { useState, useCallback, useRef } from 'react';
import { Sparkles, X } from 'lucide-react';

export interface CopilotMsg {
  id: string;
  text: string;
  type: 'info' | 'warning' | 'tip';
}

export interface AICopilotDrawerProps {
  isOpen: boolean;
  onToggle: () => void;
  messages: CopilotMsg[];
  placeholder?: string;
  initialWidth?: number;
  minWidth?: number;
  maxWidth?: number;
}

const BB = {
  base: '#0B0912',
  surface: '#1B1530',
  elevated: '#2A2247',
  border: 'rgba(107,92,166,0.18)',
  borderHover: 'rgba(107,92,166,0.38)',
  primary: '#4B3B7C',
  primaryLight: '#6C5CA6',
  maroon: '#6E1423',
  maroonLight: '#B23A4E',
  gold: '#C9A24B',
  text: '#F5F1EC',
  muted: '#9E93B8',
  disabled: '#3D3558',
  success: '#22c55e',
  warning: '#f59e0b',
} as const;

export function AICopilotDrawer({
  isOpen,
  onToggle,
  messages,
  placeholder = 'Ask AI Copilot…',
  initialWidth = 360,
  minWidth = 320,
  maxWidth = 560,
}: AICopilotDrawerProps) {
  const [copilotWidth, setCopilotWidth] = useState<number>(() => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('ml_copilot_drawer_width');
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= minWidth && parsed <= maxWidth) return parsed;
      }
    }
    return initialWidth;
  });

  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(copilotWidth);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startXRef.current = e.clientX;
    startWidthRef.current = copilotWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = startXRef.current - moveEvent.clientX; // dragging left increases width
      const nextWidth = Math.min(maxWidth, Math.max(minWidth, startWidthRef.current + deltaX));
      setCopilotWidth(nextWidth);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('ml_copilot_drawer_width', String(nextWidth));
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [copilotWidth, minWidth, maxWidth]);

  if (!isOpen) return null;

  return (
    <aside
      aria-label="AI Copilot Agent Drawer"
      style={{
        position: 'relative',
        width: copilotWidth,
        flexShrink: 0,
        background: BB.surface,
        border: `1px solid ${BB.border}`,
        borderRadius: '10px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        height: '100%',
        zIndex: 20,
      }}
    >
      {/* Left Edge Drag Handle (320px–560px) */}
      <div
        onMouseDown={handleMouseDown}
        title="Drag left/right to resize AI Copilot drawer"
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: 6,
          cursor: 'col-resize',
          zIndex: 30,
          background: isDragging ? BB.primaryLight : 'transparent',
          transition: 'background 150ms ease',
        }}
      />

      {/* AI Panel Header */}
      <div
        style={{
          padding: '10px 12px',
          borderBottom: `1px solid ${BB.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: BB.elevated,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Sparkles style={{ width: 14, height: 14, color: BB.gold }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: BB.text }}>AI Copilot</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              fontSize: 8,
              fontWeight: 700,
              padding: '1px 5px',
              borderRadius: 10,
              background: 'rgba(75,59,124,0.25)',
              color: BB.primaryLight,
              border: `1px solid rgba(107,92,166,0.30)`,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            AGENT
          </span>
          <button
            onClick={onToggle}
            title="Close AI Copilot"
            aria-label="Close AI Copilot"
            style={{
              background: 'none',
              border: 'none',
              color: BB.muted,
              cursor: 'pointer',
              padding: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X style={{ width: 14, height: 14 }} />
          </button>
        </div>
      </div>

      {/* AI Insights & Message Feed */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '10px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              padding: '8px 10px',
              borderRadius: '6px',
              background:
                msg.type === 'warning'
                  ? 'rgba(245,158,11,0.08)'
                  : msg.type === 'tip'
                  ? 'rgba(201,162,75,0.08)'
                  : 'rgba(75,59,124,0.12)',
              border: `1px solid ${
                msg.type === 'warning'
                  ? 'rgba(245,158,11,0.22)'
                  : msg.type === 'tip'
                  ? 'rgba(201,162,75,0.22)'
                  : 'rgba(107,92,166,0.22)'
              }`,
              fontSize: 10,
              color: BB.muted,
              lineHeight: 1.45,
            }}
          >
            {msg.text.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
              part.startsWith('**') && part.endsWith('**') ? (
                <strong key={i} style={{ color: BB.text }}>
                  {part.slice(2, -2)}
                </strong>
              ) : (
                part
              ),
            )}
          </div>
        ))}
      </div>

      {/* Input Prompt Stub */}
      <div
        style={{
          padding: '8px 10px',
          borderTop: `1px solid ${BB.border}`,
          background: BB.surface,
          flexShrink: 0,
        }}
      >
        <input
          placeholder={placeholder}
          disabled
          style={{
            width: '100%',
            padding: '6px 8px',
            borderRadius: 5,
            border: `1px solid ${BB.border}`,
            background: BB.elevated,
            color: BB.muted,
            fontSize: 10,
            fontFamily: 'var(--font-ui)',
            outline: 'none',
            boxSizing: 'border-box',
            cursor: 'not-allowed',
          }}
        />
      </div>
    </aside>
  );
}
