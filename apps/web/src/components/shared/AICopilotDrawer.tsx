import React, { useState, useCallback, useRef } from 'react';
import { Sparkles, X, Send } from 'lucide-react';

export interface CopilotMsg {
  id: string;
  text: string;
  type: 'info' | 'warning' | 'tip';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

export interface AICopilotDrawerProps {
  isOpen: boolean;
  onToggle: () => void;
  messages?: CopilotMsg[];
  chatMessages?: ChatMessage[];
  onSendMessage?: (msg: string) => void;
  isLoading?: boolean;
  placeholder?: string;
  initialWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  title?: string;
  badge?: string;
}

const BB = {
  base: '#0B0912',
  surface: '#151026',
  surfaceSubtle: '#1C1534',
  elevated: '#241B42',
  elevatedHover: '#2E2254',
  border: 'rgba(107,92,166,0.22)',
  borderHover: 'rgba(107,92,166,0.48)',
  primary: '#4B3B7C',
  primaryLight: '#7C6BAE',
  primaryGlow: 'rgba(124, 107, 174, 0.25)',
  maroon: '#6E1423',
  gold: '#C9A24B',
  goldLight: '#E2BD68',
  text: '#F5F1EC',
  muted: '#9E93B8',
  disabled: '#3D3558',
  success: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',
} as const;

export function AICopilotDrawer({
  isOpen,
  onToggle,
  messages = [],
  chatMessages = [],
  onSendMessage,
  isLoading = false,
  placeholder = 'Ask AI Copilot…',
  initialWidth = 340,
  minWidth = 280,
  maxWidth = 600,
  title = 'AI Copilot',
  badge = 'AGENT',
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

  const [inputVal, setInputVal] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(copilotWidth);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startXRef.current = e.clientX;
    startWidthRef.current = copilotWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      // Dragging left edge: moving mouse left increases drawer width
      const deltaX = startXRef.current - moveEvent.clientX;
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

  const handleSend = (textToSend?: string) => {
    const q = (textToSend ?? inputVal).trim();
    if (!q || !onSendMessage) return;
    onSendMessage(q);
    if (!textToSend) setInputVal('');
  };

  if (!isOpen) return null;

  return (
    <aside
      aria-label="AI Copilot Agent Drawer"
      style={{
        position: 'relative',
        width: copilotWidth,
        flexShrink: 0,
        background: BB.surface,
        borderLeft: `1px solid ${BB.border}`,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        height: '100%',
        zIndex: 20,
      }}
    >
      {/* Left Edge Drag Handle (resizable from left, docked right) */}
      <div
        onMouseDown={handleMouseDown}
        title="Drag left/right to resize AI Copilot"
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: 5,
          cursor: 'col-resize',
          zIndex: 30,
          background: isDragging ? BB.gold : 'transparent',
          transition: 'background 120ms ease',
        }}
        onMouseEnter={(e) => {
          if (!isDragging) e.currentTarget.style.background = 'rgba(201,162,75,0.4)';
        }}
        onMouseLeave={(e) => {
          if (!isDragging) e.currentTarget.style.background = 'transparent';
        }}
      />

      {/* AI Panel Header */}
      <div
        style={{
          height: 38,
          padding: '0 12px',
          borderBottom: `1px solid ${BB.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: BB.surfaceSubtle,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Sparkles style={{ width: 14, height: 14, color: BB.gold }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: BB.text }}>{title}</span>
          <span
            style={{
              fontSize: 9.5,
              fontWeight: 700,
              padding: '1px 5px',
              borderRadius: 3,
              background: 'rgba(75,59,124,0.4)',
              color: BB.primaryLight,
              border: `1px solid ${BB.border}`,
              letterSpacing: '0.04em',
            }}
          >
            {badge}
          </span>
        </div>

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
          onMouseEnter={(e) => { e.currentTarget.style.color = BB.text; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = BB.muted; }}
        >
          <X style={{ width: 14, height: 14 }} />
        </button>
      </div>

      {/* AI Messages & Chat Feed */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {/* Context Insights */}
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              padding: '8px 10px',
              borderRadius: 6,
              background:
                msg.type === 'warning'
                  ? 'rgba(245,158,11,0.08)'
                  : msg.type === 'tip'
                  ? 'rgba(201,162,75,0.08)'
                  : 'rgba(75,59,124,0.12)',
              border: `1px solid ${
                msg.type === 'warning'
                  ? 'rgba(245,158,11,0.25)'
                  : msg.type === 'tip'
                  ? 'rgba(201,162,75,0.25)'
                  : BB.border
              }`,
              fontSize: 11,
              color: BB.text,
              lineHeight: 1.5,
            }}
          >
            <div
              dangerouslySetInnerHTML={{
                __html: msg.text
                  .replace(/\*\*(.*?)\*\*/g, '<strong style="color:#C9A24B">$1</strong>')
                  .replace(/`(.*?)`/g, '<code style="background:rgba(0,0,0,0.3);padding:1px 4px;border-radius:3px">$1</code>'),
              }}
            />
          </div>
        ))}

        {/* Chat Thread */}
        {chatMessages.map((chat) => (
          <div
            key={chat.id}
            style={{
              alignSelf: chat.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '90%',
              padding: '8px 11px',
              borderRadius: 8,
              background: chat.role === 'user' ? BB.primary : BB.elevated,
              color: BB.text,
              fontSize: 11.5,
              lineHeight: 1.5,
              border: `1px solid ${chat.role === 'user' ? BB.primaryLight : BB.border}`,
              whiteSpace: 'pre-wrap',
            }}
          >
            {chat.text}
          </div>
        ))}

        {/* AI Reasoning Loading Indicator */}
        {isLoading && (
          <div
            style={{
              alignSelf: 'flex-start',
              padding: '8px 12px',
              borderRadius: 8,
              background: BB.elevated,
              border: `1px solid ${BB.border}`,
              color: BB.muted,
              fontSize: 11,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Sparkles style={{ width: 13, height: 13, color: BB.gold }} />
            <span>AI Copilot is reasoning...</span>
          </div>
        )}
      </div>

      {/* Input Prompt Box */}
      <div
        style={{
          padding: '8px 10px',
          borderTop: `1px solid ${BB.border}`,
          background: BB.elevated,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flexShrink: 0,
        }}
      >
        <input
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !isLoading) handleSend();
          }}
          disabled={!onSendMessage || isLoading}
          placeholder={isLoading ? 'AI Copilot is responding...' : placeholder}
          style={{
            flex: 1,
            padding: '6px 10px',
            borderRadius: 6,
            border: `1px solid ${BB.border}`,
            background: BB.surface,
            color: BB.text,
            fontSize: 11.5,
            outline: 'none',
            boxSizing: 'border-box',
            cursor: onSendMessage && !isLoading ? 'text' : 'not-allowed',
          }}
        />
        {onSendMessage && (
          <button
            onClick={() => handleSend()}
            disabled={!inputVal.trim() || isLoading}
            title="Send to Copilot"
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              border: 'none',
              background: inputVal.trim() && !isLoading ? BB.gold : BB.disabled,
              color: BB.base,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: inputVal.trim() && !isLoading ? 'pointer' : 'default',
              transition: 'background 120ms ease',
            }}
          >
            <Send style={{ width: 13, height: 13 }} />
          </button>
        )}
      </div>
    </aside>
  );
}
