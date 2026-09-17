/**
 * TrainingResultsPage — Page 3 of the ML Platform.
 * Shows training job progress (live SSE) and high-contrast, startup-grade results dashboard.
 * Reads exclusively from ProjectContext.activeJob.
 *
 * Design features:
 * - High-contrast elevated surfaces and crystal-clear text hierarchy (solves visibility issues)
 * - Modern dual-column dashboard layout (Metrics & Diagnostics | Provenance & Next Steps)
 * - Visual Train/Test split distribution bar
 * - Glowing Hero Metric Spotlight with animated circular ring
 * - Key Performance Indicators (KPI) cards with type-aware formatting
 * - Small-dataset unreliability warning banner
 * - Honest, un-hyped model guidance and performance interpretations
 */
import { memo, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  BarChart2,
  AlertCircle,
  CheckCircle2,
  Play,
  RefreshCw,
  Cpu,
  Clock,
  AlertTriangle,
  Layers,
  Database,
  Target,
  Sliders,
  Sparkles,
  Zap,
} from 'lucide-react';
import { useProject } from '../../providers/ProjectContext';
import { fetchJobDetails, subscribeToJobProgressSSE, pollJobUntilDone } from '../../services/jobService';
import type { JobEntity } from '../../types/job';
import type { PlatformTab } from '../../App';

/* ── BB High-Contrast Design Tokens ────────────────────────────────────────── */
const BB = {
  base: '#0B0912',
  surface: '#130E24',
  elevated: '#1C1533',
  card: '#221A3E',
  cardHover: '#2A204C',
  border: 'rgba(126, 108, 186, 0.28)',
  borderLight: 'rgba(154, 137, 218, 0.40)',
  borderAccent: 'rgba(201, 162, 75, 0.45)',
  primary: '#4B3B7C',
  primaryLight: '#8A79CA',
  primaryGlow: 'rgba(138, 121, 202, 0.22)',
  maroon: '#6E1423',
  maroonLight: '#D33852',
  gold: '#E5B85C',
  goldDark: '#C9A24B',
  text: '#FFFFFF',
  textSecondary: '#F5F1EC',
  muted: '#CBD5E1',
  subtle: '#A296BE',
  disabled: '#736691',
  success: '#34D399',
  warning: '#FBBF24',
  error: '#F87171',
} as const;

/* ── Regression error metrics (lower-is-better, not bounded 0-1) ─── */
const REGRESSION_ERROR_METRICS = new Set([
  'mae',
  'mse',
  'rmse',
  'mean_absolute_error',
  'mean_squared_error',
  'root_mean_squared_error',
]);

/* ── R-squared-family metrics (bounded roughly -inf to 1) ──────────── */
const R2_METRICS = new Set(['r2', 'r2_score']);

/**
 * Format a metric value without double-converting percentages.
 */
function fmtVal(key: string, val: number | string): string {
  if (typeof val !== 'number') return String(val ?? '—');
  if (!Number.isFinite(val)) return '—';
  const lk = key.toLowerCase();
  if (REGRESSION_ERROR_METRICS.has(lk)) return val.toFixed(4);
  if (R2_METRICS.has(lk)) return val.toFixed(4);
  if (val >= 0 && val <= 1) return (val * 100).toFixed(2) + '%';
  return val.toFixed(4);
}

function fmtKey(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function getPrimary(m: Record<string, number | string>): string | null {
  for (const k of ['accuracy', 'f1_score', 'f1', 'r2_score', 'r2', 'precision', 'recall', 'auc']) {
    if (k in m) return k;
  }
  return Object.keys(m)[0] ?? null;
}

function metricColor(key: string, val: number | string): string {
  if (typeof val !== 'number' || !Number.isFinite(val)) return BB.muted;
  const lk = key.toLowerCase();
  if (REGRESSION_ERROR_METRICS.has(lk)) return BB.primaryLight;
  if (R2_METRICS.has(lk)) {
    if (val >= 0.85) return BB.success;
    if (val >= 0.7) return BB.gold;
    return BB.maroonLight;
  }
  if (val >= 0.85) return BB.success;
  if (val >= 0.7) return BB.gold;
  return BB.maroonLight;
}

/** Returns 0-1 ring value; for error metrics returns 0 (cannot normalize). */
function toRingValue(key: string, val: number): number {
  const lk = key.toLowerCase();
  if (REGRESSION_ERROR_METRICS.has(lk)) return 0;
  if (R2_METRICS.has(lk)) return Math.max(0, Math.min(1, val));
  return Math.max(0, Math.min(1, val));
}

function isRatioMetric(key: string): boolean {
  const lk = key.toLowerCase();
  return !REGRESSION_ERROR_METRICS.has(lk) && !R2_METRICS.has(lk);
}

function MetricRing({ value, color, size = 96 }: { value: number; color: string; size?: number }) {
  const strokeWidth = 7;
  const R = size / 2 - strokeWidth;
  const circ = 2 * Math.PI * R;
  const clampedValue = Math.max(0, Math.min(1, value));
  const offset = circ * (1 - clampedValue);
  const cx = size / 2;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle
        cx={cx}
        cy={cx}
        r={R}
        fill="none"
        stroke="rgba(107, 92, 166, 0.25)"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={cx}
        cy={cx}
        r={R}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{
          transition: 'stroke-dashoffset 800ms cubic-bezier(0.4,0,0.2,1)',
          filter: `drop-shadow(0 0 6px ${color}66)`,
        }}
      />
    </svg>
  );
}

function StatusBadge({ status }: { status: string }) {
  const m: Record<string, { c: string; bg: string; label: string }> = {
    COMPLETED:  { c: BB.success,      bg: 'rgba(52,211,153,0.14)', label: 'Completed' },
    FAILED:     { c: BB.error,        bg: 'rgba(248,113,113,0.14)', label: 'Failed' },
    CANCELLED:  { c: BB.muted,        bg: 'rgba(203,213,225,0.12)', label: 'Cancelled' },
    RUNNING:    { c: BB.gold,         bg: 'rgba(229,184,92,0.14)', label: 'Running' },
    QUEUED:     { c: BB.primaryLight, bg: 'rgba(138,121,202,0.14)', label: 'Queued' },
    TRAINING:   { c: BB.gold,         bg: 'rgba(229,184,92,0.14)', label: 'Training' },
    EVALUATING: { c: BB.primaryLight, bg: 'rgba(138,121,202,0.14)', label: 'Evaluating' },
    STARTING:   { c: BB.muted,        bg: 'rgba(203,213,225,0.10)', label: 'Starting' },
  };
  const e = m[status] ?? { c: BB.muted, bg: 'rgba(203,213,225,0.10)', label: status };
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 10px',
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.04em',
        color: e.c,
        background: e.bg,
        border: `1px solid ${e.c}55`,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: e.c }} />
      {e.label}
    </span>
  );
}

interface TrainingResultsPageProps {
  onNavigate: (tab: PlatformTab) => void;
  onShowToast?: (title: string, desc?: string, type?: 'success' | 'info' | 'error') => void;
}

export const TrainingResultsPage = memo(function TrainingResultsPage({
  onNavigate,
  onShowToast,
}: TrainingResultsPageProps) {
  const { activeJob, setActiveJob, trainingConfig, dataset } = useProject();
  const [job, setJob] = useState<JobEntity | null>(activeJob);
  const fetchedRef = useRef<string | null>(null);

  // Synchronize state with context
  useEffect(() => {
    setJob(activeJob);
  }, [activeJob?.job_id, activeJob?.status]);

  useEffect(() => {
    if (!job) return;
    const terminal = ['COMPLETED', 'FAILED', 'CANCELLED'];
    if (terminal.includes(job.status)) {
      if (job.status === 'COMPLETED' && !job.metadata?.metrics && fetchedRef.current !== job.job_id) {
        fetchedRef.current = job.job_id;
        fetchJobDetails(job.job_id)
          .then((full) => {
            if (full) {
              setJob(full);
              setActiveJob(full);
            }
          })
          .catch(() => {});
      }
      return;
    }
    let ok = true;
    const ctrl = new AbortController();
    const unsub = subscribeToJobProgressSSE(job.job_id, {
      onProgress: (live) => {
        if (!ok) return;
        setJob((prev) => {
          if (!prev) return prev;
          const n = {
            ...prev,
            status: live.status,
            progress: live.progress,
            current_stage: live.current_stage,
            estimated_seconds: live.estimated_seconds_remaining,
          };
          setActiveJob(n);
          return n;
        });
      },
      onComplete: async () => {
        if (!ok) return;
        ctrl.abort();
        fetchedRef.current = job.job_id;
        const full = await fetchJobDetails(job.job_id).catch(() => null);
        if (full && ok) {
          setJob(full);
          setActiveJob(full);
          onShowToast?.('Training complete', 'Review the results below.', 'success');
        }
      },
    });
    pollJobUntilDone(
      job.job_id,
      (p) => {
        if (!ok) return;
        setJob(p);
        setActiveJob(p);
      },
      ctrl.signal
    ).catch(() => {});
    return () => {
      ok = false;
      ctrl.abort();
      unsub();
    };
  }, [job?.job_id]);

  /* ── No-job empty state ──────────────────────────────────────────────── */
  if (!job) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 20,
          color: BB.textSecondary,
          padding: 32,
        }}
      >
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: 20,
            background: 'linear-gradient(135deg, rgba(107,92,166,0.2) 0%, rgba(30,22,54,0.6) 100%)',
            border: `1px solid ${BB.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          }}
        >
          <BarChart2 style={{ width: 36, height: 36, color: BB.primaryLight }} />
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: BB.text, marginBottom: 8, letterSpacing: '-0.01em' }}>
            No Training Run Yet
          </div>
          <div style={{ fontSize: 13, color: BB.muted, textAlign: 'center', maxWidth: 380, lineHeight: 1.6 }}>
            Go to Dataset Setup, configure your model, and click "Launch training job" to start.
          </div>
        </div>
        <button
          onClick={() => onNavigate('workspace')}
          style={{
            marginTop: 8,
            padding: '10px 24px',
            borderRadius: 8,
            border: `1px solid ${BB.primaryLight}`,
            background: 'linear-gradient(135deg, rgba(75, 59, 124, 0.6) 0%, rgba(108, 92, 166, 0.4) 100%)',
            color: BB.text,
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontFamily: 'var(--font-ui)',
            boxShadow: '0 4px 16px rgba(75, 59, 124, 0.4)',
            transition: 'all 180ms ease',
          }}
        >
          <ArrowLeft style={{ width: 15, height: 15 }} /> Go to Dataset Setup
        </button>
      </div>
    );
  }

  /* ── Derived values ─────────────────────────────────────────────────── */
  const metrics = (job.metadata?.metrics || (job as any).metrics) as Record<string, number | string> | undefined;
  const isRunning = !['COMPLETED', 'FAILED', 'CANCELLED'].includes(job.status);
  const pk = metrics ? getPrimary(metrics) : null;
  const pv = pk !== null && metrics ? metrics[pk] : null;
  const pc = pk && typeof pv === 'number' ? metricColor(pk, pv) : BB.muted;
  const pct = Math.min(100, Math.max(0, job.progress ?? 0));

  /* ── Actual config: prefer job.metadata over trainingConfig ────────── */
  const actualAlgorithm = job.algorithm || trainingConfig?.algorithm || '—';
  const actualScaler = (job.metadata?.scaler as string | undefined) || trainingConfig?.scaler || '—';
  const actualImputer = (job.metadata?.imputer as string | undefined) || trainingConfig?.imputer || '—';
  const actualCvFolds = (job.metadata?.cross_validation as number | undefined) ?? trainingConfig?.cv_folds;
  const actualSeed = (job.metadata?.random_seed as number | null | undefined) ?? trainingConfig?.random_seed;
  const actualSplit = trainingConfig?.train_test_split ?? 0.8;
  const datasetName = trainingConfig?.dataset_name || job.dataset_id || '—';
  const featureCols = job.feature_columns?.length ? job.feature_columns : trainingConfig?.feature_columns || [];

  /* ── Task type determination ────────────────────────────────────────── */
  const isClassification =
    /classifier|logistic|svc/i.test(actualAlgorithm) ||
    Boolean(pk && ['accuracy', 'f1_score', 'f1', 'precision', 'recall', 'auc'].includes(pk.toLowerCase()));
  const isRegression =
    !isClassification &&
    (/regressor|linear|ridge|lasso|svr/i.test(actualAlgorithm) ||
      Boolean(pk && (REGRESSION_ERROR_METRICS.has(pk.toLowerCase()) || R2_METRICS.has(pk.toLowerCase()))));
  const taskTypeLabel = isRegression ? 'Regression' : 'Classification';

  /* ── Training duration ──────────────────────────────────────────────── */
  const duration = (() => {
    if (!job.started_at) return null;
    const end = job.completed_at ? new Date(job.completed_at) : new Date();
    const secs = Math.round((end.getTime() - new Date(job.started_at).getTime()) / 1000);
    if (secs < 60) return `${secs}s`;
    return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  })();

  /* ── Small-dataset / unreliable evaluation warning ──────────────────── */
  const datasetRowCount =
    dataset?.rowCount ??
    dataset?.rows?.length ??
    ((job?.metadata as any)?.row_count as number | undefined) ??
    ((trainingConfig as any)?.row_count as number | undefined);
  const hasUnreliableMetrics = metrics
    ? Object.values(metrics).some((v) => typeof v === 'number' && !Number.isFinite(v))
    : false;
  const isTinyDataset = datasetRowCount !== undefined && datasetRowCount < 50;
  const showReliabilityWarning = hasUnreliableMetrics || isTinyDataset;

  /* ── Ring display value ─────────────────────────────────────────────── */
  const ringValue = pk && typeof pv === 'number' ? toRingValue(pk, pv) : 0;

  /* ── Performance interpretation — honest & informative ───────────────── */
  function performanceInterpretation(key: string, val: number): string {
    const lk = key.toLowerCase();
    if (REGRESSION_ERROR_METRICS.has(lk)) {
      return 'Lower is better. Compare against a baseline (e.g. mean prediction) to assess quality.';
    }
    if (R2_METRICS.has(lk)) {
      if (val >= 0.85) return '≥ 0.85 — Strong explanatory power. Verify on held-out data.';
      if (val >= 0.7) return '≥ 0.70 — Moderate fit. Consider feature engineering.';
      if (val >= 0) return '< 0.70 — Weak fit. Review features and dataset quality.';
      return 'Negative — model performs worse than predicting the mean. Check configuration.';
    }
    if (val >= 0.85) return 'Evaluate for overfitting and class imbalance before concluding quality.';
    if (val >= 0.7) return 'Moderate result. Check class balance and dataset size.';
    return 'Below typical thresholds. Review target, features, and dataset quality.';
  }

  const trainPct = Math.round(actualSplit * 100);
  const testPct = 100 - trainPct;
  const trainRows = datasetRowCount != null ? Math.round(datasetRowCount * actualSplit) : null;
  const testRows = datasetRowCount != null ? datasetRowCount - (trainRows ?? 0) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: BB.base }}>
      {/* ── TOP MODEL IDENTITY HERO STRIP ──────────────────────────── */}
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
          minHeight: 52,
          borderBottom: `1px solid ${BB.border}`,
          background: BB.surface,
          gap: 16,
          boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button
            onClick={() => onNavigate('workspace')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 12px',
              borderRadius: 6,
              border: `1px solid ${BB.border}`,
              background: 'rgba(255,255,255,0.03)',
              color: BB.muted,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'var(--font-ui)',
              transition: 'all 150ms ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = BB.primaryLight;
              e.currentTarget.style.color = BB.text;
              e.currentTarget.style.background = 'rgba(107,92,166,0.12)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = BB.border;
              e.currentTarget.style.color = BB.muted;
              e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
            }}
          >
            <ArrowLeft style={{ width: 13, height: 13 }} /> Back to Setup
          </button>

          <div style={{ height: 18, width: 1, background: BB.border }} />

          {/* Model Title & Task Pill */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: BB.text, letterSpacing: '-0.01em' }}>
              {actualAlgorithm.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
            </span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                padding: '2px 8px',
                borderRadius: 4,
                background: isRegression ? 'rgba(45, 212, 191, 0.15)' : 'rgba(138, 121, 202, 0.20)',
                color: isRegression ? '#2DD4BF' : '#A78BFA',
                border: `1px solid ${isRegression ? '#2DD4BF44' : '#A78BFA44'}`,
              }}
            >
              {taskTypeLabel}
            </span>
          </div>

          <StatusBadge status={job.status} />

          {/* Target & Dataset Badges */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {job.target_column && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                  color: BB.textSecondary,
                  background: BB.elevated,
                  padding: '2px 8px',
                  borderRadius: 4,
                  border: `1px solid ${BB.border}`,
                }}
              >
                <Target style={{ width: 11, height: 11, color: BB.gold }} />
                <span>{job.target_column}</span>
              </span>
            )}
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                color: BB.muted,
                background: BB.elevated,
                padding: '2px 8px',
                borderRadius: 4,
                border: `1px solid ${BB.border}`,
              }}
            >
              <Database style={{ width: 11, height: 11, color: BB.primaryLight }} />
              <span>{datasetName}</span>
            </span>
          </div>
        </div>

        {/* Right side controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {duration && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 11,
                color: BB.muted,
                fontFamily: 'var(--font-mono)',
                background: BB.elevated,
                padding: '3px 9px',
                borderRadius: 4,
                border: `1px solid ${BB.border}`,
              }}
            >
              <Clock style={{ width: 12, height: 12, color: BB.gold }} />
              <span>{duration}</span>
            </div>
          )}
          <span style={{ fontSize: 11, color: BB.subtle, fontFamily: 'var(--font-mono)' }}>
            {new Date(job.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
          <button
            onClick={() => onNavigate('workspace')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              borderRadius: 6,
              border: 'none',
              background: `linear-gradient(135deg, ${BB.maroon} 0%, #9E1930 100%)`,
              color: '#FFF',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'var(--font-ui)',
              boxShadow: '0 2px 8px rgba(110,20,35,0.4)',
              transition: 'all 150ms ease',
            }}
          >
            <RefreshCw style={{ width: 12, height: 12 }} /> Run Again
          </button>
        </div>
      </div>

      {/* ── BODY DASHBOARD ─────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
        }}
      >
        {/* Small-Dataset or Unreliable Metrics Warning Banner */}
        {showReliabilityWarning && (
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.16) 0%, rgba(201, 162, 75, 0.08) 100%)',
              border: '1px solid rgba(245, 158, 11, 0.45)',
              borderRadius: 12,
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 14,
              boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
            }}
          >
            <div
              style={{
                background: 'rgba(245, 158, 11, 0.2)',
                borderRadius: 8,
                padding: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <AlertTriangle style={{ width: 20, height: 20, color: BB.warning }} />
            </div>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 800,
                  color: BB.text,
                  letterSpacing: '-0.01em',
                  marginBottom: 3,
                }}
              >
                Evaluation may be unreliable
              </div>
              <div style={{ fontSize: 12, color: BB.textSecondary, lineHeight: 1.5 }}>
                {isTinyDataset
                  ? `Very small dataset (${datasetRowCount} rows). Metrics may be unstable — gather more data before drawing conclusions.`
                  : 'One or more metrics could not be calculated. Check dataset quality and configuration.'}
              </div>
            </div>
          </div>
        )}

        {/* Live Training In Progress Banner */}
        {isRunning && (
          <div
            style={{
              background: BB.card,
              border: `1px solid ${BB.borderLight}`,
              borderRadius: 12,
              padding: '18px 22px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              boxShadow: '0 6px 24px rgba(0,0,0,0.35)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Cpu style={{ width: 18, height: 18, color: BB.gold }} />
                <span style={{ fontSize: 14, fontWeight: 800, color: BB.text }}>Training in Progress</span>
              </div>
              <span
                style={{
                  fontSize: 14,
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 800,
                  color: BB.gold,
                }}
              >
                {pct.toFixed(0)}%
              </span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: BB.elevated, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  borderRadius: 4,
                  background: `linear-gradient(90deg, ${BB.maroonLight}, ${BB.gold})`,
                  width: `${pct}%`,
                  transition: 'width 400ms ease',
                  boxShadow: `0 0 10px ${BB.gold}88`,
                }}
              />
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 12,
                color: BB.muted,
                fontFamily: 'var(--font-mono)',
              }}
            >
              <span>{job.current_stage || 'Fitting estimator...'}</span>
              {job.estimated_seconds ? <span>~{job.estimated_seconds.toFixed(0)}s remaining</span> : null}
            </div>
          </div>
        )}

        {/* Failed Banner */}
        {job.status === 'FAILED' && (
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(110,20,35,0.25) 0%, rgba(30,15,25,0.5) 100%)',
              border: '1px solid rgba(248, 113, 113, 0.45)',
              borderRadius: 12,
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 14,
              boxShadow: '0 6px 24px rgba(0,0,0,0.3)',
            }}
          >
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.2)',
                borderRadius: 8,
                padding: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <AlertCircle style={{ width: 22, height: 22, color: BB.error }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#FFF', marginBottom: 4 }}>Training Failed</div>
              <div
                style={{
                  fontSize: 12,
                  color: BB.textSecondary,
                  fontFamily: 'var(--font-mono)',
                  lineHeight: 1.5,
                  background: 'rgba(0,0,0,0.25)',
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid rgba(248, 113, 113, 0.2)',
                }}
              >
                {job.error_message || job.current_stage || 'An unexpected error occurred.'}
              </div>
              <button
                onClick={() => onNavigate('workspace')}
                style={{
                  marginTop: 12,
                  padding: '6px 16px',
                  borderRadius: 6,
                  border: `1px solid ${BB.border}`,
                  background: BB.elevated,
                  color: BB.text,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontFamily: 'var(--font-ui)',
                }}
              >
                <Play style={{ width: 11, height: 11 }} /> Back to Setup
              </button>
            </div>
          </div>
        )}

        {/* ── DUAL-COLUMN CONTENT LAYOUT ───────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(0, 1fr)', gap: 18 }}>
          {/* ── LEFT COLUMN: METRICS & DIAGNOSTICS ─────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Hero Spotlight: Primary Metric */}
            {job.status === 'COMPLETED' && pk !== null && typeof pv === 'number' && Number.isFinite(pv) && (
              <div
                style={{
                  background: 'linear-gradient(145deg, #1C1535 0%, #251B47 100%)',
                  border: `1px solid ${BB.borderLight}`,
                  borderRadius: 14,
                  padding: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 24,
                  boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
                }}
              >
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <MetricRing value={ringValue} color={pc} size={96} />
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {isRatioMetric(pk) ? (
                      <>
                        <span
                          style={{
                            fontSize: 22,
                            fontWeight: 900,
                            color: '#FFFFFF',
                            fontFamily: 'var(--font-mono)',
                            lineHeight: 1,
                          }}
                        >
                          {(pv * 100).toFixed(1)}
                        </span>
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 700,
                            color: BB.muted,
                            letterSpacing: '0.06em',
                            textTransform: 'uppercase',
                            marginTop: 2,
                          }}
                        >
                          %
                        </span>
                      </>
                    ) : (
                      <span
                        style={{
                          fontSize: 16,
                          fontWeight: 900,
                          color: '#FFFFFF',
                          fontFamily: 'var(--font-mono)',
                          lineHeight: 1,
                          textAlign: 'center',
                          padding: '0 6px',
                        }}
                      >
                        {pv.toFixed(3)}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      color: BB.gold,
                      textTransform: 'uppercase',
                      letterSpacing: '0.12em',
                      marginBottom: 4,
                    }}
                  >
                    Primary Metric
                  </div>
                  <div
                    style={{
                      fontSize: 24,
                      fontWeight: 900,
                      color: '#FFFFFF',
                      letterSpacing: '-0.02em',
                      lineHeight: 1.1,
                      marginBottom: 10,
                    }}
                  >
                    {fmtKey(pk)}
                  </div>
                  {/* Plain language interpretation box */}
                  <div
                    style={{
                      fontSize: 12,
                      color: BB.textSecondary,
                      background: 'rgba(0,0,0,0.25)',
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: '1px solid rgba(138, 121, 202, 0.25)',
                      lineHeight: 1.5,
                      fontFamily: 'var(--font-ui)',
                    }}
                  >
                    {performanceInterpretation(pk, pv)}
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(52, 211, 153, 0.1)',
                    border: '1px solid rgba(52, 211, 153, 0.25)',
                    borderRadius: 10,
                    padding: '12px 14px',
                    gap: 4,
                  }}
                >
                  <CheckCircle2 style={{ width: 22, height: 22, color: BB.success }} />
                  <span style={{ fontSize: 9, fontWeight: 700, color: BB.success, letterSpacing: '0.04em' }}>
                    EVALUATED
                  </span>
                </div>
              </div>
            )}

            {/* KPI Cards: All Evaluation Metrics */}
            {metrics && Object.keys(metrics).length > 0 && (
              <div
                style={{
                  background: BB.card,
                  border: `1px solid ${BB.border}`,
                  borderRadius: 14,
                  overflow: 'hidden',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
                }}
              >
                <div
                  style={{
                    padding: '12px 18px',
                    borderBottom: `1px solid ${BB.border}`,
                    background: BB.elevated,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <BarChart2 style={{ width: 15, height: 15, color: BB.primaryLight }} />
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        color: BB.text,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                      }}
                    >
                      Evaluation Metrics
                    </span>
                  </div>
                  {actualSplit != null && (
                    <span
                      style={{
                        fontSize: 10,
                        color: BB.muted,
                        background: 'rgba(0,0,0,0.25)',
                        padding: '2px 8px',
                        borderRadius: 4,
                      }}
                    >
                      Computed on {testPct}% test split
                    </span>
                  )}
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                    gap: 1,
                    background: BB.border,
                  }}
                >
                  {Object.entries(metrics).map(([k, v]) => {
                    const isInvalid = typeof v === 'number' && !Number.isFinite(v);
                    const lk = k.toLowerCase();
                    const isErr = REGRESSION_ERROR_METRICS.has(lk);
                    const isR2 = R2_METRICS.has(lk);

                    return (
                      <div
                        key={k}
                        style={{
                          background: BB.card,
                          padding: '16px 18px',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          gap: 10,
                          transition: 'background 150ms ease',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = BB.cardHover;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = BB.card;
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color: BB.muted,
                              textTransform: 'uppercase',
                              letterSpacing: '0.06em',
                              marginBottom: 6,
                            }}
                          >
                            {fmtKey(k)}
                          </div>
                          <div
                            style={{
                              fontSize: 22,
                              fontWeight: 900,
                              color: isInvalid ? BB.disabled : '#FFFFFF',
                              fontFamily: 'var(--font-mono)',
                              lineHeight: 1.1,
                            }}
                          >
                            {isInvalid ? 'N/A' : fmtVal(k, v)}
                          </div>
                        </div>

                        {/* Metric type badge */}
                        <div style={{ fontSize: 10, color: BB.subtle }}>
                          {isInvalid ? (
                            <span style={{ color: BB.disabled, fontSize: 10 }}>Not available for this evaluation</span>
                          ) : isErr ? (
                            <span
                              style={{
                                color: BB.primaryLight,
                                background: 'rgba(138, 121, 202, 0.15)',
                                padding: '2px 6px',
                                borderRadius: 4,
                              }}
                            >
                              Error (lower is better)
                            </span>
                          ) : isR2 ? (
                            <span
                              style={{
                                color: BB.gold,
                                background: 'rgba(229, 184, 92, 0.15)',
                                padding: '2px 6px',
                                borderRadius: 4,
                              }}
                            >
                              R² Explanatory Power
                            </span>
                          ) : (
                            <span
                              style={{
                                color: BB.success,
                                background: 'rgba(52, 211, 153, 0.12)',
                                padding: '2px 6px',
                                borderRadius: 4,
                              }}
                            >
                              Ratio (0–100%)
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Completed but no metrics */}
            {job.status === 'COMPLETED' && (!metrics || Object.keys(metrics).length === 0) && (
              <div
                style={{
                  background: BB.card,
                  border: `1px solid ${BB.border}`,
                  borderRadius: 12,
                  padding: '18px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <AlertCircle style={{ width: 18, height: 18, color: BB.warning, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: BB.text }}>Job completed — no metrics returned</div>
                  <div style={{ fontSize: 12, color: BB.muted, marginTop: 4 }}>
                    The training worker finished but did not return evaluation metrics. Check backend logs for details.
                  </div>
                </div>
              </div>
            )}

            {/* Feature Columns Used Badge Bar */}
            {featureCols.length > 0 && (
              <div
                style={{
                  background: BB.card,
                  border: `1px solid ${BB.border}`,
                  borderRadius: 14,
                  overflow: 'hidden',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
                }}
              >
                <div
                  style={{
                    padding: '12px 18px',
                    borderBottom: `1px solid ${BB.border}`,
                    background: BB.elevated,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <Layers style={{ width: 14, height: 14, color: BB.primaryLight }} />
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      color: BB.text,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                    }}
                  >
                    Feature Columns Used ({featureCols.length})
                  </span>
                </div>
                <div style={{ padding: '14px 18px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {featureCols.map((col) => (
                    <span
                      key={col}
                      style={{
                        display: 'inline-block',
                        padding: '4px 10px',
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 700,
                        fontFamily: 'var(--font-mono)',
                        background: 'rgba(138, 121, 202, 0.16)',
                        color: '#F5F1EC',
                        border: '1px solid rgba(138, 121, 202, 0.35)',
                      }}
                    >
                      {col}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── RIGHT COLUMN: PROVENANCE & NEXT STEPS ───────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Visual Train / Test Split Card */}
            <div
              style={{
                background: BB.card,
                border: `1px solid ${BB.border}`,
                borderRadius: 14,
                overflow: 'hidden',
                boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
              }}
            >
              <div
                style={{
                  padding: '12px 18px',
                  borderBottom: `1px solid ${BB.border}`,
                  background: BB.elevated,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Sliders style={{ width: 14, height: 14, color: BB.gold }} />
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      color: BB.text,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                    }}
                  >
                    Dataset Split Distribution
                  </span>
                </div>
                <span
                  style={{
                    fontSize: 10,
                    fontFamily: 'var(--font-mono)',
                    color: BB.muted,
                  }}
                >
                  {trainPct}% / {testPct}%
                </span>
              </div>

              <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Segmented Bar */}
                <div
                  style={{
                    display: 'flex',
                    height: 12,
                    borderRadius: 6,
                    overflow: 'hidden',
                    background: 'rgba(0,0,0,0.35)',
                    padding: 2,
                    gap: 3,
                  }}
                >
                  <div
                    style={{
                      width: `${trainPct}%`,
                      background: 'linear-gradient(90deg, #6C5CA6 0%, #8A79CA 100%)',
                      borderRadius: 4,
                      boxShadow: '0 0 6px rgba(108,92,166,0.5)',
                    }}
                    title={`Train: ${trainPct}%`}
                  />
                  <div
                    style={{
                      width: `${testPct}%`,
                      background: 'linear-gradient(90deg, #C9A24B 0%, #E5B85C 100%)',
                      borderRadius: 4,
                      boxShadow: '0 0 6px rgba(229,184,92,0.5)',
                    }}
                    title={`Test: ${testPct}%`}
                  />
                </div>

                {/* Legend & Breakdown */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: '#8A79CA' }} />
                    <span style={{ color: BB.muted }}>Train Set:</span>
                    <span style={{ fontWeight: 700, color: '#FFFFFF', fontFamily: 'var(--font-mono)' }}>
                      {trainPct}% {trainRows != null ? `(${trainRows} rows)` : ''}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: '#E5B85C' }} />
                    <span style={{ color: BB.muted }}>Test Set:</span>
                    <span style={{ fontWeight: 700, color: '#FFFFFF', fontFamily: 'var(--font-mono)' }}>
                      {testPct}% {testRows != null ? `(${testRows} rows)` : ''}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Run Configuration & Provenance Card */}
            <div
              style={{
                background: BB.card,
                border: `1px solid ${BB.border}`,
                borderRadius: 14,
                overflow: 'hidden',
                boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
              }}
            >
              <div
                style={{
                  padding: '12px 18px',
                  borderBottom: `1px solid ${BB.border}`,
                  background: BB.elevated,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Cpu style={{ width: 14, height: 14, color: BB.primaryLight }} />
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      color: BB.text,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                    }}
                  >
                    Run Configuration
                  </span>
                </div>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: BB.success,
                    background: 'rgba(52,211,153,0.12)',
                    padding: '2px 7px',
                    borderRadius: 4,
                    border: '1px solid rgba(52,211,153,0.3)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {job.metadata?.scaler || job.metadata?.imputer ? 'verified from job record' : 'from local config'}
                </span>
              </div>

              <div style={{ padding: '6px 0' }}>
                {[
                  { label: 'Dataset', val: datasetName },
                  { label: 'Algorithm', val: actualAlgorithm.replace(/_/g, ' ') },
                  { label: 'Target', val: job.target_column || trainingConfig?.target_column || '—' },
                  { label: 'Features', val: `${featureCols.length} column${featureCols.length !== 1 ? 's' : ''}` },
                  {
                    label: 'Train Split',
                    val: `${trainPct}% train / ${testPct}% test`,
                  },
                  { label: 'CV Folds', val: actualCvFolds != null ? `${actualCvFolds}-fold` : '—' },
                  { label: 'Scaler', val: actualScaler.replace(/_/g, ' ') },
                  { label: 'Imputer', val: actualImputer.replace(/_/g, ' ') },
                  { label: 'Random Seed', val: actualSeed != null ? String(actualSeed) : '—' },
                  ...(duration ? [{ label: 'Duration', val: duration }] : []),
                  { label: 'Job ID', val: job.job_id.slice(0, 16) + '…' },
                ].map(({ label, val }) => (
                  <div
                    key={label}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 18px',
                      borderBottom: `1px solid rgba(126, 108, 186, 0.12)`,
                      transition: 'background 120ms ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: BB.muted,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      {label}
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: '#FFFFFF',
                        fontFamily: 'var(--font-mono)',
                        textAlign: 'right',
                      }}
                    >
                      {val}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Actionable Next Steps Hub */}
            {job.status === 'COMPLETED' && (
              <div
                style={{
                  background: 'linear-gradient(135deg, rgba(30, 22, 54, 0.9) 0%, rgba(42, 32, 74, 0.7) 100%)',
                  border: `1px solid ${BB.borderLight}`,
                  borderRadius: 14,
                  padding: '18px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                  boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Sparkles style={{ width: 16, height: 16, color: BB.gold }} />
                  <span style={{ fontSize: 13, fontWeight: 800, color: BB.text }}>Actionable Next Steps</span>
                </div>
                <div style={{ fontSize: 12, color: BB.textSecondary, lineHeight: 1.5 }}>
                  <span style={{ fontWeight: 700, color: BB.text }}>Next: </span>
                  Adjust configuration, try a different algorithm, or review dataset quality to improve results.
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                  <button
                    onClick={() => onNavigate('workspace')}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      padding: '8px 14px',
                      borderRadius: 8,
                      border: `1px solid ${BB.primaryLight}`,
                      background: 'rgba(107, 92, 166, 0.2)',
                      color: BB.text,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontFamily: 'var(--font-ui)',
                      transition: 'all 150ms ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(107, 92, 166, 0.35)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(107, 92, 166, 0.2)';
                    }}
                  >
                    ← Back to Training Setup
                  </button>
                  <button
                    onClick={() => onNavigate('code-studio')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      padding: '8px 14px',
                      borderRadius: 8,
                      border: `1px solid ${BB.border}`,
                      background: BB.elevated,
                      color: BB.textSecondary,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontFamily: 'var(--font-ui)',
                    }}
                  >
                    <Zap style={{ width: 13, height: 13, color: BB.gold }} /> View Code
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
