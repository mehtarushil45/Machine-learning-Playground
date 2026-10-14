import React from 'react';
import {
  Trophy,
  Crown,
  BarChart2,
  X,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import {
  type ExtractedMetrics,
  type MetricComparison,
  compareWithChampion,
} from '../../utils/metricExtractor';

export interface PostRunExperimentCardProps {
  execId: string;
  filename: string;
  durationSeconds: number | null;
  exitCode: number | null;
  extractedMetrics: ExtractedMetrics;
  championMetrics?: Record<string, any> | null;
  championAlgorithm?: string | null;
  algorithmName?: string;
  scalerName?: string;
  isChampion?: boolean;
  onPromoteChampion?: () => void;
  onViewInResults?: () => void;
  onDismiss?: () => void;
}

const BB = {
  card: '#161226',
  cardHeader: '#1C1632',
  elevated: '#211B3B',
  border: 'rgba(138, 121, 202, 0.28)',
  borderGold: 'rgba(245, 158, 11, 0.45)',
  gold: '#F59E0B',
  goldLight: '#FBBF24',
  text: '#FFFFFF',
  textSecondary: '#E2E8F0',
  muted: '#94A3B8',
  subtle: '#64748B',
  success: '#10B981',
  successLight: '#34D399',
  warning: '#F59E0B',
  error: '#F87171',
  primary: '#4B3B7C',
  primaryLight: '#8A79CA',
};

export const PostRunExperimentCard: React.FC<PostRunExperimentCardProps> = ({
  execId,
  filename,
  durationSeconds,
  exitCode,
  extractedMetrics,
  championMetrics,
  championAlgorithm,
  algorithmName = 'Trained Model',
  scalerName,
  isChampion = false,
  onPromoteChampion,
  onViewInResults,
  onDismiss,
}) => {
  const { metrics, primaryMetric, problemType } = extractedMetrics;

  const comparison: MetricComparison | null = React.useMemo(() => {
    return compareWithChampion(metrics, championMetrics);
  }, [metrics, championMetrics]);

  return (
    <div
      data-testid="post-run-experiment-card"
      style={{
        margin: '12px 16px',
        borderRadius: 14,
        background: `linear-gradient(180deg, ${BB.card} 0%, #0F0C1B 100%)`,
        border: `1px solid ${comparison?.isImprovement || isChampion ? BB.borderGold : BB.border}`,
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.45), 0 0 16px rgba(201, 162, 75, 0.08)',
        overflow: 'hidden',
        animation: 'fadeIn 200ms ease-out',
      }}
    >
      {/* ── CARD HEADER ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          background: BB.cardHeader,
          borderBottom: `1px solid ${BB.border}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: 'rgba(245, 158, 11, 0.18)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Trophy size={15} color={BB.gold} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#FFF' }}>
                Post-Run Model Evaluation
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: 10,
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: BB.successLight,
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <CheckCircle2 size={10} /> Exit {exitCode ?? 0}
              </span>
            </div>
            <div style={{ fontSize: 11, color: BB.muted }}>
              File: <strong style={{ color: '#E2DCF0' }}>{filename}</strong>
              <span style={{ marginLeft: 8, opacity: 0.8 }}>ID: {execId.slice(0, 8)}</span>
              {durationSeconds != null && (
                <span style={{ marginLeft: 8 }}>
                  • Duration: <strong>{durationSeconds.toFixed(2)}s</strong>
                </span>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {onViewInResults && (
            <button
              data-testid="post-run-view-results"
              onClick={onViewInResults}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '5px 12px',
                borderRadius: 7,
                background: 'rgba(138, 121, 202, 0.18)',
                border: `1px solid ${BB.border}`,
                color: BB.primaryLight,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 120ms',
              }}
            >
              <BarChart2 size={13} /> View in Results <ArrowRight size={12} />
            </button>
          )}
          {onDismiss && (
            <button
              data-testid="post-run-dismiss"
              onClick={onDismiss}
              aria-label="Dismiss experiment card"
              style={{
                background: 'transparent',
                border: 'none',
                color: BB.muted,
                cursor: 'pointer',
                padding: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 4,
              }}
            >
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      {/* ── CARD BODY: METRICS & COMPARISON ── */}
      <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: primaryMetric ? '240px 1fr auto' : '1fr auto',
            gap: 16,
            alignItems: 'center',
          }}
        >
          {/* Hero Primary Metric */}
          {primaryMetric && (
            <div
              style={{
                background: 'rgba(24, 19, 46, 0.8)',
                border: `1px solid ${BB.border}`,
                borderRadius: 10,
                padding: '12px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  color: BB.muted,
                  letterSpacing: '0.06em',
                }}
              >
                Primary Metric ({primaryMetric.name})
              </div>
              <div
                style={{
                  fontSize: 26,
                  fontWeight: 900,
                  color: BB.goldLight,
                  fontFamily: 'Consolas, Monaco, monospace',
                  letterSpacing: '-0.02em',
                }}
              >
                {primaryMetric.formatted}
              </div>

              {/* Delta Tag vs Champion */}
              {comparison ? (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    fontSize: 11,
                    fontWeight: 700,
                    marginTop: 2,
                    color: comparison.isImprovement
                      ? BB.successLight
                      : comparison.isEqual
                      ? BB.muted
                      : BB.warning,
                  }}
                >
                  {comparison.isImprovement ? (
                    <TrendingUp size={13} />
                  ) : comparison.isEqual ? null : (
                    <TrendingDown size={13} />
                  )}
                  <span>
                    {comparison.delta > 0 ? '+' : ''}
                    {comparison.delta.toFixed(4)} (
                    {comparison.deltaPercentage > 0 ? '+' : ''}
                    {comparison.deltaPercentage.toFixed(1)}%) vs Champion
                    {championAlgorithm ? ` (${championAlgorithm.replace(/_/g, ' ')})` : ''}
                  </span>
                </div>
              ) : (
                <div style={{ fontSize: 10.5, color: BB.muted, marginTop: 2 }}>
                  Baseline Model Record
                </div>
              )}
            </div>
          )}

          {/* Secondary Metrics Strip */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {Object.entries(metrics).map(([key, val]) => {
              if (primaryMetric && key === primaryMetric.key) return null;
              const formattedVal =
                problemType === 'classification' && val <= 1 && val >= 0
                  ? `${(val * 100).toFixed(1)}%`
                  : val.toFixed(4);
              const label = key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

              return (
                <div
                  key={key}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: 'rgba(24, 19, 46, 0.5)',
                    border: `1px solid ${BB.border}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                  }}
                >
                  <span style={{ fontSize: 10, color: BB.muted, textTransform: 'uppercase' }}>
                    {label}
                  </span>
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 800,
                      color: '#FFF',
                      fontFamily: 'Consolas, Monaco, monospace',
                    }}
                  >
                    {formattedVal}
                  </span>
                </div>
              );
            })}

            {/* Algorithm & Pipeline Spec */}
            <div
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                background: 'rgba(24, 19, 46, 0.3)',
                border: `1px solid ${BB.border}`,
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}
            >
              <span style={{ fontSize: 10, color: BB.muted, textTransform: 'uppercase' }}>
                Architecture
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: BB.primaryLight }}>
                {algorithmName}
                {scalerName ? ` • ${scalerName}` : ''}
              </span>
            </div>
          </div>

          {/* 1-Click Promote Action */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 160 }}>
            {isChampion ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 14px',
                  borderRadius: 8,
                  background: 'rgba(245, 158, 11, 0.15)',
                  border: `1px solid ${BB.borderGold}`,
                  color: BB.goldLight,
                  fontSize: 12,
                  fontWeight: 700,
                  justifyContent: 'center',
                }}
              >
                <Crown size={14} /> Active Champion
              </div>
            ) : onPromoteChampion ? (
              <button
                data-testid="post-run-set-champion"
                onClick={onPromoteChampion}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 14px',
                  borderRadius: 8,
                  background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
                  border: 'none',
                  color: '#08070F',
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: 'pointer',
                  justifyContent: 'center',
                  boxShadow: '0 4px 12px rgba(245, 158, 11, 0.25)',
                  transition: 'transform 80ms ease',
                }}
              >
                <Crown size={14} /> Set as Champion
              </button>
            ) : null}

            {comparison && (
              <span style={{ fontSize: 10, color: BB.muted, textAlign: 'center' }}>
                {comparison.isImprovement
                  ? 'Outperforms current baseline'
                  : 'Candidate model evaluated'}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
