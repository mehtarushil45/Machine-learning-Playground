import React, { useState } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import {
  Shield,
  Play,
  X,
  CheckCircle2,
  AlertTriangle,
  Info,
  ChevronRight,
  Code2,
  Sparkles,
} from 'lucide-react';
import {
  analyzePipelineImpact,
  type MLImpactDiff,
  type PipelineGuardianAnalysis,
} from '../../utils/pipelineGuardian';
import type { ActiveTrainingConfiguration } from '../../providers/ProjectContext';

interface PipelineGuardianModalProps {
  isOpen: boolean;
  filename: string;
  currentCode: string;
  baselineCode?: string;
  baselineConfig?: ActiveTrainingConfiguration | null;
  onClose: () => void;
  onRunExperiment?: () => void;
}

const isTestEnv =
  typeof window !== 'undefined' &&
  (Boolean((window as any).VITEST) ||
    Boolean((window as any).__vitest_worker__) ||
    process.env.NODE_ENV === 'test');

export const PipelineGuardianModal: React.FC<PipelineGuardianModalProps> = ({
  isOpen,
  filename,
  currentCode,
  baselineCode,
  baselineConfig,
  onClose,
  onRunExperiment,
}) => {
  const [activeTab, setActiveTab] = useState<'impact' | 'diff'>('impact');

  if (!isOpen) return null;

  const analysis: PipelineGuardianAnalysis = analyzePipelineImpact(
    currentCode,
    baselineConfig,
    baselineCode
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pipeline Guardian — ML Impact Analysis"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(5, 3, 10, 0.86)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: 24,
      }}
    >
      <div
        style={{
          width: '94%',
          maxWidth: 1050,
          height: '86vh',
          backgroundColor: '#151026',
          border: '1px solid rgba(107, 92, 166, 0.45)',
          borderRadius: 12,
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.85)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '16px 22px',
            borderBottom: '1px solid rgba(107, 92, 166, 0.22)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(90deg, #1C1534 0%, #151026 100%)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 9,
                background: 'rgba(201, 162, 75, 0.16)',
                border: '1px solid rgba(201, 162, 75, 0.45)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#E2BD68',
              }}
            >
              <Shield style={{ width: 20, height: 20 }} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#F5F1EC' }}>
                  Pipeline Guardian: ML Impact Analysis
                </span>
                <span
                  style={{
                    fontSize: 11,
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: 'rgba(201, 162, 75, 0.18)',
                    color: '#E2BD68',
                    border: '1px solid rgba(201, 162, 75, 0.35)',
                    fontWeight: 600,
                  }}
                >
                  {filename}
                </span>
              </div>
              <div style={{ fontSize: 11.5, color: '#9E93B8', marginTop: 3 }}>
                Translates code modifications into machine learning consequences, trade-offs, and behavioral shifts before execution.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* View Mode Toggle */}
            <div
              style={{
                display: 'flex',
                background: '#0B0912',
                borderRadius: 6,
                padding: 2,
                border: '1px solid rgba(107, 92, 166, 0.3)',
              }}
            >
              <button
                onClick={() => setActiveTab('impact')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '5px 12px',
                  borderRadius: 4,
                  border: 'none',
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: activeTab === 'impact' ? '#4B3B7C' : 'transparent',
                  color: activeTab === 'impact' ? '#FFFFFF' : '#9E93B8',
                  transition: 'all 120ms ease',
                }}
              >
                <Sparkles style={{ width: 13, height: 13 }} />
                <span>ML Cause &amp; Effect</span>
              </button>
              <button
                onClick={() => setActiveTab('diff')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '5px 12px',
                  borderRadius: 4,
                  border: 'none',
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: activeTab === 'diff' ? '#4B3B7C' : 'transparent',
                  color: activeTab === 'diff' ? '#FFFFFF' : '#9E93B8',
                  transition: 'all 120ms ease',
                }}
              >
                <Code2 style={{ width: 13, height: 13 }} />
                <span>Side-by-Side Diff</span>
              </button>
            </div>

            <button
              onClick={onClose}
              aria-label="Close pipeline guardian modal"
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
        </div>

        {/* Baseline vs Current Config Bar */}
        <div
          style={{
            padding: '10px 22px',
            background: 'rgba(11, 9, 18, 0.85)',
            borderBottom: '1px solid rgba(107, 92, 166, 0.18)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: '#7A7299', fontWeight: 600 }}>Visual Baseline:</span>
              <span style={{ color: '#E2DCF0', background: 'rgba(75, 59, 124, 0.25)', padding: '2px 8px', borderRadius: 4 }}>
                {analysis.baseline.algorithm}
              </span>
              <span style={{ color: '#9E93B8', fontSize: 11 }}>
                ({Math.round(analysis.baseline.split * 100)}% Train / {Math.round((1 - analysis.baseline.split) * 100)}% Test)
              </span>
            </div>

            <ChevronRight style={{ width: 14, height: 14, color: '#7A7299' }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: '#7A7299', fontWeight: 600 }}>Current Studio Code:</span>
              <span
                style={{
                  color: '#E2BD68',
                  background: 'rgba(201, 162, 75, 0.16)',
                  border: '1px solid rgba(201, 162, 75, 0.3)',
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontWeight: 600,
                }}
              >
                {analysis.current.algorithm || analysis.baseline.algorithm}
              </span>
              <span style={{ color: '#9E93B8', fontSize: 11 }}>
                ({Math.round((analysis.current.split ?? analysis.baseline.split) * 100)}% Train / {Math.round((1 - (analysis.current.split ?? analysis.baseline.split)) * 100)}% Test)
              </span>
            </div>
          </div>

          <div style={{ fontSize: 11, color: '#9E93B8' }}>
            {analysis.summaryText}
          </div>
        </div>

        {/* Main Body */}
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: '#0B0912' }}>
          {activeTab === 'impact' ? (
            <div style={{ padding: '20px 24px' }}>
              {analysis.isIdentical ? (
                <div
                  style={{
                    padding: 32,
                    textAlign: 'center',
                    background: 'rgba(34, 197, 94, 0.06)',
                    border: '1px solid rgba(34, 197, 94, 0.25)',
                    borderRadius: 10,
                  }}
                >
                  <CheckCircle2 style={{ width: 36, height: 36, color: '#22C55E', margin: '0 auto 12px' }} />
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: '#F5F1EC', marginBottom: 6 }}>
                    Pipeline Matches Visual Baseline
                  </h3>
                  <p style={{ fontSize: 12.5, color: '#9E93B8', maxWidth: 520, margin: '0 auto' }}>
                    The current script in Code Studio is 100% synchronized with the Visual Builder configuration. Executing this code will train the baseline pipeline with zero unexpected behavioral shifts.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {analysis.impacts.map((diff: MLImpactDiff) => {
                    const borderColor =
                      diff.severity === 'warning'
                        ? 'rgba(245, 158, 11, 0.4)'
                        : diff.severity === 'positive'
                        ? 'rgba(34, 197, 94, 0.4)'
                        : 'rgba(129, 140, 248, 0.35)';

                    const badgeColor =
                      diff.severity === 'warning'
                        ? '#F59E0B'
                        : diff.severity === 'positive'
                        ? '#22C55E'
                        : '#818CF8';

                    return (
                      <div
                        key={diff.id}
                        data-testid={`guardian-impact-${diff.id}`}
                        style={{
                          background: '#151026',
                          border: `1px solid ${borderColor}`,
                          borderRadius: 8,
                          padding: 16,
                          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                        }}
                      >
                        {/* Card Header */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: badgeColor,
                                background: 'rgba(28, 21, 52, 0.8)',
                                border: `1px solid ${borderColor}`,
                                padding: '3px 8px',
                                borderRadius: 4,
                              }}
                            >
                              {diff.badge}
                            </span>
                            <span style={{ fontSize: 13.5, fontWeight: 700, color: '#F5F1EC' }}>
                              {diff.title}
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5 }}>
                            <span style={{ color: '#7A7299' }}>Baseline:</span>
                            <code style={{ color: '#9E93B8', background: '#0B0912', padding: '2px 6px', borderRadius: 3 }}>
                              {diff.baselineDisplay}
                            </code>
                            <span style={{ color: '#7A7299' }}>→</span>
                            <span style={{ color: '#E2BD68', fontWeight: 600 }}>Studio:</span>
                            <code style={{ color: '#E2BD68', background: 'rgba(201, 162, 75, 0.14)', padding: '2px 6px', borderRadius: 3 }}>
                              {diff.currentDisplay}
                            </code>
                          </div>
                        </div>

                        {/* Cause & Effect Details */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 10 }}>
                          {/* ML Cause */}
                          <div
                            style={{
                              background: 'rgba(11, 9, 18, 0.65)',
                              padding: '10px 14px',
                              borderRadius: 6,
                              border: '1px solid rgba(107, 92, 166, 0.18)',
                            }}
                          >
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#C9A24B', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                              Machine Learning Cause
                            </div>
                            <div style={{ fontSize: 12, color: '#E2DCF0', lineHeight: 1.5 }}>
                              {diff.cause}
                            </div>
                          </div>

                          {/* Expected Effect */}
                          <div
                            style={{
                              background: 'rgba(11, 9, 18, 0.65)',
                              padding: '10px 14px',
                              borderRadius: 6,
                              border: '1px solid rgba(107, 92, 166, 0.18)',
                            }}
                          >
                            <div style={{ fontSize: 11, fontWeight: 700, color: badgeColor, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                              Expected Effect &amp; Trade-Off
                            </div>
                            <div style={{ fontSize: 12, color: '#E2DCF0', lineHeight: 1.5 }}>
                              {diff.expectedEffect}
                            </div>
                          </div>
                        </div>

                        {diff.recommendation && (
                          <div
                            style={{
                              marginTop: 10,
                              padding: '6px 12px',
                              borderRadius: 4,
                              background: 'rgba(245, 158, 11, 0.1)',
                              border: '1px solid rgba(245, 158, 11, 0.25)',
                              fontSize: 11.5,
                              color: '#F59E0B',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            <AlertTriangle style={{ width: 13, height: 13, flexShrink: 0 }} />
                            <span>{diff.recommendation}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div style={{ height: '100%', position: 'relative' }}>
              {isTestEnv ? (
                <div
                  data-testid="guardian-diff-fallback"
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
                    <h4 style={{ color: '#F59E0B', marginBottom: 8 }}>Visual Baseline Code</h4>
                    <pre>{baselineCode || '# Visual pipeline default'}</pre>
                  </div>
                  <div>
                    <h4 style={{ color: '#22C55E', marginBottom: 8 }}>Current Studio Code</h4>
                    <pre>{currentCode}</pre>
                  </div>
                </div>
              ) : (
                <DiffEditor
                  height="100%"
                  width="100%"
                  language="python"
                  theme="mlpg-studio-dark"
                  original={baselineCode || '# Baseline pipeline'}
                  modified={currentCode}
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
          )}
        </div>

        {/* Modal Action Footer */}
        <div
          style={{
            padding: '12px 22px',
            borderTop: '1px solid rgba(107, 92, 166, 0.22)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#151026',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: '#9E93B8' }}>
            <Info style={{ width: 14, height: 14, color: '#C9A24B' }} />
            <span>Reviewing changes before execution ensures conscious, disciplined machine learning experimentation.</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={onClose}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '7px 16px',
                borderRadius: 6,
                background: 'transparent',
                border: '1px solid rgba(107, 92, 166, 0.35)',
                color: '#F5F1EC',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <span>Back to Editor</span>
            </button>

            {onRunExperiment && (
              <button
                onClick={() => {
                  onClose();
                  onRunExperiment();
                }}
                aria-label="Run experiment from guardian"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 18px',
                  borderRadius: 6,
                  border: '1px solid rgba(34, 197, 94, 0.6)',
                  background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.28), rgba(75, 59, 124, 0.35))',
                  color: '#22C55E',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 0 12px rgba(34, 197, 94, 0.25)',
                }}
              >
                <Play style={{ width: 13, height: 13, fill: '#22C55E' }} />
                <span>Run Experiment Now</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
