import React from 'react';
import { DiffEditor } from '@monaco-editor/react';
import { RefreshCw, Check, X, SplitSquareVertical } from 'lucide-react';

interface RegenerateDiffModalProps {
  isOpen: boolean;
  filename: string;
  currentCode: string;
  regeneratedCode: string;
  onAccept: () => void;
  onReject: () => void;
}

const isTestEnv =
  typeof window !== 'undefined' &&
  (Boolean((window as any).VITEST) ||
    Boolean((window as any).__vitest_worker__) ||
    process.env.NODE_ENV === 'test');

export const RegenerateDiffModal: React.FC<RegenerateDiffModalProps> = ({
  isOpen,
  filename,
  currentCode,
  regeneratedCode,
  onAccept,
  onReject,
}) => {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Review Regenerated Code Diff"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(5, 3, 10, 0.82)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: 24,
      }}
    >
      <div
        style={{
          width: '94%',
          maxWidth: 1100,
          height: '84vh',
          backgroundColor: '#151026',
          border: '1px solid rgba(107, 92, 166, 0.45)',
          borderRadius: 12,
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.75)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(107, 92, 166, 0.22)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(90deg, #1C1534 0%, #151026 100%)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: 'rgba(201, 162, 75, 0.15)',
                border: '1px solid rgba(201, 162, 75, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#E2BD68',
              }}
            >
              <SplitSquareVertical style={{ width: 18, height: 18 }} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#F5F1EC' }}>
                Review Pipeline Code Diff — <span style={{ color: '#E2BD68' }}>{filename}</span>
              </div>
              <div style={{ fontSize: 11, color: '#9E93B8', marginTop: 2 }}>
                Current Buffer (Left) vs Regenerated Builder Pipeline (Right). No edits are overwritten without explicit acceptance.
              </div>
            </div>
          </div>
          <button
            onClick={onReject}
            aria-label="Close diff modal"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#9E93B8',
              cursor: 'pointer',
              padding: 6,
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>

        {/* Diff Canvas */}
        <div style={{ flex: 1, minHeight: 0, position: 'relative', background: '#0A0814' }}>
          {isTestEnv ? (
            <div
              data-testid="diff-editor-fallback"
              style={{
                padding: 16,
                fontFamily: 'monospace',
                fontSize: 12,
                color: '#E2DCF0',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 16,
                height: '100%',
                overflow: 'auto',
              }}
            >
              <div>
                <h4 style={{ color: '#F59E0B', marginBottom: 8 }}>Current Code</h4>
                <pre>{currentCode}</pre>
              </div>
              <div>
                <h4 style={{ color: '#22C55E', marginBottom: 8 }}>Regenerated Code</h4>
                <pre>{regeneratedCode}</pre>
              </div>
            </div>
          ) : (
            <DiffEditor
              height="100%"
              width="100%"
              language="python"
              theme="mlpg-studio-dark"
              original={currentCode}
              modified={regeneratedCode}
              options={{
                readOnly: true,
                renderSideBySide: true,
                fontSize: 12.5,
                lineHeight: 20,
                fontFamily: "Consolas, Monaco, 'Courier New', monospace",
                automaticLayout: true,
                scrollBeyondLastLine: false,
                minimap: { enabled: false },
                diffWordWrap: 'off',
              }}
            />
          )}
        </div>

        {/* Action Footer */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid rgba(107, 92, 166, 0.22)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#151026',
          }}
        >
          <div style={{ fontSize: 11.5, color: '#9E93B8' }}>
            Accepting will update <code style={{ color: '#E2DCF0' }}>{filename}</code> with the builder-generated pipeline.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={onReject}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 16px',
                borderRadius: 6,
                background: 'transparent',
                border: '1px solid rgba(107, 92, 166, 0.35)',
                color: '#F5F1EC',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              <X style={{ width: 14, height: 14 }} />
              <span>Reject (Keep My Edits)</span>
            </button>
            <button
              onClick={onAccept}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 18px',
                borderRadius: 6,
                background: '#6E1423',
                border: '1px solid #B23A4E',
                color: '#F5F1EC',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(110, 20, 35, 0.4)',
              }}
            >
              <Check style={{ width: 14, height: 14 }} />
              <span>Accept &amp; Replace Code</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
