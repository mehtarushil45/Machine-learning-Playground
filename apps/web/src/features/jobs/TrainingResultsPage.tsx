/**
 * TrainingResultsPage — Page 3 of the ML Platform.
 * Shows training job progress (live SSE) and results for the most recently launched job.
 * Reads exclusively from ProjectContext.activeJob.
 *
 * Prototype 2 improvements:
 * - Type-aware metric formatting (no double-converting percentages) [instruction #5]
 * - Correct hero ring clamping for regression/r2 metrics [instruction #5]
 * - job.metadata used for actual config (scaler, imputer, cv, seed) [instruction #2]
 * - Dataset name and training duration shown [instruction #2]
 * - Small-dataset unreliability warning using actual row count [instruction #4]
 * - Neutral completion toast — no quality claims [instruction #6]
 * - Clear distinction: job completed ≠ high-quality model [instruction #6]
 */
import { memo, useEffect, useRef, useState } from 'react';
import { ArrowLeft, BarChart2, AlertCircle, CheckCircle2, Play, RefreshCw, Cpu, Clock, AlertTriangle } from 'lucide-react';
import { useProject } from '../../providers/ProjectContext';
import { fetchJobDetails, subscribeToJobProgressSSE, pollJobUntilDone } from '../../services/jobService';
import type { JobEntity } from '../../types/job';
import type { PlatformTab } from '../../App';

/* ── BB Brand Tokens ────────────────────────────────────────────────────────── */
const BB = {
  base: '#0B0912', surface: '#1B1530', elevated: '#2A2247',
  border: 'rgba(107,92,166,0.18)', primary: '#4B3B7C', primaryLight: '#6C5CA6',
  maroon: '#6E1423', maroonLight: '#B23A4E', gold: '#C9A24B',
  text: '#F5F1EC', muted: '#9E93B8', disabled: '#3D3558',
  success: '#22c55e', warning: '#f59e0b', error: '#ef4444',
} as const;

/* ── Regression error metrics (lower-is-better, not bounded 0-1) ─── */
const REGRESSION_ERROR_METRICS = new Set(['mae', 'mse', 'rmse', 'mean_absolute_error', 'mean_squared_error', 'root_mean_squared_error']);

/* ── R-squared-family metrics (bounded roughly -inf to 1) ──────────── */
const R2_METRICS = new Set(['r2', 'r2_score']);

/**
 * Format a metric value without double-converting percentages. [instruction #5]
 *
 * Rules:
 *   Regression error metrics (MAE/MSE/RMSE): raw value, 4 decimal places
 *   R-squared metrics: raw value, 4 decimal places (can be negative)
 *   Values in [0,1] that are not error/r2: treat as ratio, show as XX.XX%
 *   Values outside [0,1]: show raw with 4 decimal places
 *   Non-numeric: return string as-is
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

function fmtKey(key: string) { return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }

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
    if (val >= 0.70) return BB.gold;
    return BB.maroonLight;
  }
  if (val >= 0.85) return BB.success;
  if (val >= 0.70) return BB.gold;
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

function MetricRing({ value, color, size = 80 }: { value: number; color: string; size?: number }) {
  const R = size / 2 - 8;
  const circ = 2 * Math.PI * R;
  const clampedValue = Math.max(0, Math.min(1, value));
  const offset = circ * (1 - clampedValue);
  const cx = size / 2;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={cx} cy={cx} r={R} fill="none" stroke={BB.elevated} strokeWidth={6} />
      <circle cx={cx} cy={cx} r={R} fill="none" stroke={color} strokeWidth={6}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 800ms cubic-bezier(0.4,0,0.2,1)' }} />
    </svg>
  );
}

function StatusBadge({ status }: { status: string }) {
  const m: Record<string, { c: string; bg: string; label: string }> = {
    COMPLETED:  { c: BB.success,      bg: 'rgba(34,197,94,0.12)',    label: 'Completed'  },
    FAILED:     { c: BB.error,        bg: 'rgba(239,68,68,0.12)',    label: 'Failed'     },
    CANCELLED:  { c: BB.muted,        bg: 'rgba(158,147,184,0.12)', label: 'Cancelled'  },
    RUNNING:    { c: BB.gold,         bg: 'rgba(201,162,75,0.12)',   label: 'Running'    },
    QUEUED:     { c: BB.primaryLight, bg: 'rgba(107,92,166,0.12)',   label: 'Queued'     },
    TRAINING:   { c: BB.gold,         bg: 'rgba(201,162,75,0.12)',   label: 'Training'   },
    EVALUATING: { c: BB.primaryLight, bg: 'rgba(107,92,166,0.12)',   label: 'Evaluating' },
    STARTING:   { c: BB.muted,        bg: 'rgba(158,147,184,0.10)', label: 'Starting'   },
  };
  const e = m[status] ?? { c: BB.muted, bg: 'rgba(158,147,184,0.10)', label: status };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px',
      borderRadius: 20, fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
      color: e.c, background: e.bg, border: `1px solid ${e.c}44` }}>
      {e.label}
    </span>
  );
}

interface TrainingResultsPageProps {
  onNavigate: (tab: PlatformTab) => void;
  onShowToast?: (title: string, desc?: string, type?: 'success' | 'info' | 'error') => void;
}

export const TrainingResultsPage = memo(function TrainingResultsPage({ onNavigate, onShowToast }: TrainingResultsPageProps) {
  const { activeJob, setActiveJob, trainingConfig, dataset } = useProject();
  const [job, setJob] = useState<JobEntity | null>(activeJob);
  const fetchedRef = useRef<string | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setJob(activeJob); }, [activeJob?.job_id, activeJob?.status]);

  useEffect(() => {
    if (!job) return;
    const terminal = ['COMPLETED', 'FAILED', 'CANCELLED'];
    if (terminal.includes(job.status)) {
      if (job.status === 'COMPLETED' && !job.metadata?.metrics && fetchedRef.current !== job.job_id) {
        fetchedRef.current = job.job_id;
        fetchJobDetails(job.job_id).then(full => { if (full) { setJob(full); setActiveJob(full); } }).catch(() => {});
      }
      return;
    }
    let ok = true;
    const ctrl = new AbortController();
    const unsub = subscribeToJobProgressSSE(job.job_id, {
      onProgress: live => {
        if (!ok) return;
        setJob(prev => {
          if (!prev) return prev;
          const n = { ...prev, status: live.status, progress: live.progress, current_stage: live.current_stage, estimated_seconds: live.estimated_seconds_remaining };
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
          // Neutral — do not claim "successful model" [instruction #6]
          onShowToast?.('Training complete', 'Review the results below.', 'success');
        }
      },
    });
    pollJobUntilDone(job.job_id, p => { if (!ok) return; setJob(p); setActiveJob(p); }, ctrl.signal).catch(() => {});
    return () => { ok = false; ctrl.abort(); unsub(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.job_id]);

  /* ── No-job empty state ──────────────────────────────────────────────── */
  if (!job) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, color: BB.muted }}>
        <BarChart2 style={{ width: 48, height: 48, opacity: 0.3 }} />
        <div style={{ fontSize: 16, fontWeight: 700, color: BB.muted }}>No Training Run Yet</div>
        <div style={{ fontSize: 12, color: BB.disabled, textAlign: 'center', maxWidth: 340 }}>
          Go to Dataset Setup, configure your model, and click "Launch training job" to start.
        </div>
        <button onClick={() => onNavigate('workspace')} style={{ marginTop: 8, padding: '8px 20px', borderRadius: 8,
          border: `1px solid ${BB.primaryLight}`, background: 'rgba(107,92,166,0.12)', color: BB.text,
          fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-ui)' }}>
          <ArrowLeft style={{ width: 13, height: 13 }} /> Go to Dataset Setup
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

  /* ── Actual config: prefer job.metadata over trainingConfig [instruction #2] */
  const actualAlgorithm = job.algorithm || trainingConfig?.algorithm || '—';
  const actualScaler    = (job.metadata?.scaler  as string | undefined) || trainingConfig?.scaler  || '—';
  const actualImputer   = (job.metadata?.imputer as string | undefined) || trainingConfig?.imputer || '—';
  const actualCvFolds   = (job.metadata?.cross_validation as number | undefined) ?? trainingConfig?.cv_folds;
  const actualSeed      = (job.metadata?.random_seed      as number | null | undefined) ?? trainingConfig?.random_seed;
  const actualSplit     = trainingConfig?.train_test_split;
  const datasetName     = trainingConfig?.dataset_name || job.dataset_id || '—';
  const featureCols     = job.feature_columns?.length ? job.feature_columns : (trainingConfig?.feature_columns || []);

  /* ── Training duration ──────────────────────────────────────────────── */
  const duration = (() => {
    if (!job.started_at) return null;
    const end = job.completed_at ? new Date(job.completed_at) : new Date();
    const secs = Math.round((end.getTime() - new Date(job.started_at).getTime()) / 1000);
    if (secs < 60) return `${secs}s`;
    return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  })();

  /* ── Small-dataset / unreliable evaluation warning [instruction #4] ── */
  const datasetRowCount =
    dataset?.rowCount ??
    dataset?.rows?.length ??
    ((job?.metadata as any)?.row_count as number | undefined) ??
    ((trainingConfig as any)?.row_count as number | undefined);
  const hasUnreliableMetrics = metrics
    ? Object.values(metrics).some(v => typeof v === 'number' && !Number.isFinite(v))
    : false;
  const isTinyDataset = datasetRowCount !== undefined && datasetRowCount < 50;
  const showReliabilityWarning = hasUnreliableMetrics || isTinyDataset;

  /* ── Ring display value ─────────────────────────────────────────────── */
  const ringValue = pk && typeof pv === 'number' ? toRingValue(pk, pv) : 0;

  /* ── Performance interpretation — honest [instruction #6] ──────────── */
  function performanceInterpretation(key: string, val: number): string {
    const lk = key.toLowerCase();
    if (REGRESSION_ERROR_METRICS.has(lk)) {
      return 'Lower is better. Compare against a baseline (e.g. mean prediction) to assess quality.';
    }
    if (R2_METRICS.has(lk)) {
      if (val >= 0.85) return '≥ 0.85 — Strong explanatory power. Verify on held-out data.';
      if (val >= 0.70) return '≥ 0.70 — Moderate fit. Consider feature engineering.';
      if (val >= 0)    return '< 0.70 — Weak fit. Review features and dataset quality.';
      return 'Negative — model performs worse than predicting the mean. Check configuration.';
    }
    if (val >= 0.85) return 'Evaluate for overfitting and class imbalance before concluding quality.';
    if (val >= 0.70) return 'Moderate result. Check class balance and dataset size.';
    return 'Below typical thresholds. Review target, features, and dataset quality.';
  }

  const configRow = (label: string, value: string) => (
    <div key={label} style={{ display: 'flex', alignItems: 'center', padding: '6px 16px', borderBottom: `1px solid ${BB.border}` }}>
      <span style={{ width: 120, fontSize: 10, fontWeight: 700, color: BB.disabled, textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 11, color: BB.muted, fontFamily: 'var(--font-mono)' }}>{value}</span>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>

      {/* ── TOP STRIP ─────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', height: 48, borderBottom: `1px solid ${BB.border}`, background: BB.surface, gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => onNavigate('workspace')}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 6,
              border: `1px solid ${BB.border}`, background: 'transparent', color: BB.muted, fontSize: 11,
              fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-ui)', transition: 'all 150ms' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = BB.primaryLight; e.currentTarget.style.color = BB.text; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = BB.border; e.currentTarget.style.color = BB.muted; }}>
            <ArrowLeft style={{ width: 12, height: 12 }} /> Back to Setup
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BarChart2 style={{ width: 15, height: 15, color: BB.primaryLight }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: BB.text, letterSpacing: '-0.01em' }}>Training Results</span>
          </div>
          <StatusBadge status={job.status} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {duration && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: BB.disabled, fontFamily: 'var(--font-mono)' }}>
              <Clock style={{ width: 11, height: 11 }} />
              <span>{duration}</span>
            </div>
          )}
          <span style={{ fontSize: 10, color: BB.disabled, fontFamily: 'var(--font-mono)' }}>
            {new Date(job.created_at).toLocaleString()}
          </span>
          <button onClick={() => onNavigate('workspace')}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 6,
              border: 'none', background: `linear-gradient(135deg,${BB.maroon} 0%,#A01830 100%)`, color: BB.text,
              fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-ui)' }}>
            <RefreshCw style={{ width: 11, height: 11 }} /> Run Again
          </button>
        </div>
      </div>

      {/* ── BODY ───────────────────────────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Reliability warning [instruction #4, #6] */}
        {showReliabilityWarning && (
          <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 10,
            padding: '10px 14px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <AlertTriangle style={{ width: 16, height: 16, color: BB.warning, flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: BB.text, marginBottom: 2 }}>Evaluation may be unreliable</div>
              <div style={{ fontSize: 11, color: BB.muted }}>
                {isTinyDataset
                  ? `Very small dataset (${datasetRowCount} rows). Metrics may be unstable — gather more data before drawing conclusions.`
                  : 'One or more metrics could not be calculated. Check dataset quality and configuration.'}
              </div>
            </div>
          </div>
        )}

        {/* Live progress */}
        {isRunning && (
          <div style={{ background: BB.surface, border: `1px solid ${BB.border}`, borderRadius: 10, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Cpu style={{ width: 15, height: 15, color: BB.primaryLight }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: BB.text }}>Training in Progress</span>
              </div>
              <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: BB.gold }}>{pct.toFixed(0)}%</span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: BB.elevated, overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 3, background: `linear-gradient(90deg,${BB.maroon},${BB.primaryLight})`, width: `${pct}%`, transition: 'width 400ms ease' }} />
            </div>
            <div style={{ fontSize: 10, color: BB.muted, fontFamily: 'var(--font-mono)' }}>
              {job.current_stage || 'Initializing…'}{job.estimated_seconds ? ` · ~${job.estimated_seconds.toFixed(0)}s remaining` : ''}
            </div>
          </div>
        )}

        {/* Failed */}
        {job.status === 'FAILED' && (
          <div style={{ background: 'rgba(110,20,35,0.15)', border: '1px solid rgba(178,58,78,0.35)', borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <AlertCircle style={{ width: 18, height: 18, color: BB.maroonLight, flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: BB.text, marginBottom: 4 }}>Training Failed</div>
              <div style={{ fontSize: 11, color: BB.muted, fontFamily: 'var(--font-mono)' }}>
                {job.error_message || job.current_stage || 'An unexpected error occurred.'}
              </div>
              <button onClick={() => onNavigate('workspace')} style={{ marginTop: 10, padding: '5px 14px', borderRadius: 6,
                border: `1px solid ${BB.border}`, background: BB.elevated, color: BB.text, fontSize: 11, fontWeight: 600,
                cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-ui)' }}>
                <Play style={{ width: 10, height: 10 }} /> Back to Setup
              </button>
            </div>
          </div>
        )}

        {/* Hero metric — COMPLETED with a valid primary metric [instruction #5] */}
        {job.status === 'COMPLETED' && pk !== null && typeof pv === 'number' && Number.isFinite(pv) && (
          <div style={{ background: BB.surface, border: `1px solid ${BB.border}`, borderRadius: 10, padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 24 }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <MetricRing value={ringValue} color={pc} size={88} />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                {isRatioMetric(pk) ? (
                  <>
                    <span style={{ fontSize: 18, fontWeight: 900, color: pc, fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
                      {(pv * 100).toFixed(1)}
                    </span>
                    <span style={{ fontSize: 8, color: BB.muted, letterSpacing: '0.06em', textTransform: 'uppercase' }}>%</span>
                  </>
                ) : (
                  <span style={{ fontSize: 13, fontWeight: 900, color: pc, fontFamily: 'var(--font-mono)', lineHeight: 1, textAlign: 'center', padding: '0 6px' }}>
                    {pv.toFixed(3)}
                  </span>
                )}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: BB.muted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Primary Metric</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: pc, letterSpacing: '-0.02em', lineHeight: 1 }}>{fmtKey(pk)}</div>
              {/* Honest interpretation — not a quality claim [instruction #6] */}
              <div style={{ fontSize: 11, color: BB.disabled, marginTop: 6, fontFamily: 'var(--font-mono)', lineHeight: 1.5 }}>
                {performanceInterpretation(pk, pv)}
              </div>
            </div>
            {/* Job completed indicator — muted, not celebratory */}
            <CheckCircle2 style={{ width: 26, height: 26, color: BB.disabled, opacity: 0.4, flexShrink: 0 }} />
          </div>
        )}

        {/* All metrics */}
        {metrics && Object.keys(metrics).length > 0 && (
          <div style={{ background: BB.surface, border: `1px solid ${BB.border}`, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', borderBottom: `1px solid ${BB.border}`, background: BB.elevated, display: 'flex', alignItems: 'center', gap: 7 }}>
              <BarChart2 style={{ width: 13, height: 13, color: BB.primaryLight }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: BB.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Evaluation Metrics</span>
              {actualSplit != null && (
                <span style={{ fontSize: 9, color: BB.disabled, marginLeft: 'auto' }}>
                  Computed on {Math.round((1 - actualSplit) * 100)}% test split
                </span>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 1, background: BB.border }}>
              {Object.entries(metrics).map(([k, v]) => {
                const c = metricColor(k, v);
                const isInvalid = typeof v === 'number' && !Number.isFinite(v);
                return (
                  <div key={k} style={{ background: BB.surface, padding: '12px 14px' }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: BB.disabled, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{fmtKey(k)}</div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: isInvalid ? BB.disabled : c, fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
                      {isInvalid ? 'N/A' : fmtVal(k, v)}
                    </div>
                    {isInvalid && (
                      <div style={{ fontSize: 8, color: BB.disabled, marginTop: 2 }}>Not available for this evaluation</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Completed but no metrics */}
        {job.status === 'COMPLETED' && (!metrics || Object.keys(metrics).length === 0) && (
          <div style={{ background: BB.surface, border: `1px solid ${BB.border}`, borderRadius: 10, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <AlertCircle style={{ width: 16, height: 16, color: BB.warning, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: BB.text }}>Job completed — no metrics returned</div>
              <div style={{ fontSize: 11, color: BB.muted, marginTop: 3 }}>
                The training worker finished but did not return evaluation metrics. Check backend logs for details.
              </div>
            </div>
          </div>
        )}

        {/* Run configuration — actual values from job.metadata [instruction #2] */}
        <div style={{ background: BB.surface, border: `1px solid ${BB.border}`, borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', borderBottom: `1px solid ${BB.border}`, background: BB.elevated, display: 'flex', alignItems: 'center', gap: 7 }}>
            <Cpu style={{ width: 13, height: 13, color: BB.primaryLight }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: BB.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Run Configuration</span>
            <span style={{ fontSize: 9, color: BB.disabled, marginLeft: 'auto', fontFamily: 'var(--font-mono)' }}>
              {job.metadata?.scaler || job.metadata?.imputer ? 'verified from job record' : 'from local config'}
            </span>
          </div>
          <div style={{ padding: '8px 0' }}>
            {configRow('Dataset',    datasetName)}
            {configRow('Algorithm',  actualAlgorithm.replace(/_/g, ' '))}
            {configRow('Target',     job.target_column || trainingConfig?.target_column || '—')}
            {configRow('Features',   `${featureCols.length} column${featureCols.length !== 1 ? 's' : ''}`)}
            {actualSplit != null && configRow('Train Split', `${Math.round(actualSplit * 100)}% train / ${Math.round((1 - actualSplit) * 100)}% test`)}
            {configRow('CV Folds',   actualCvFolds != null ? `${actualCvFolds}-fold` : '—')}
            {configRow('Scaler',     actualScaler.replace(/_/g, ' '))}
            {configRow('Imputer',    actualImputer.replace(/_/g, ' '))}
            {configRow('Random Seed', actualSeed != null ? String(actualSeed) : '—')}
            {duration && configRow('Duration', duration)}
            {configRow('Job ID',     job.job_id.slice(0, 16) + '…')}
          </div>
        </div>

        {/* Feature columns used */}
        {featureCols.length > 0 && (
          <div style={{ background: BB.surface, border: `1px solid ${BB.border}`, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', borderBottom: `1px solid ${BB.border}`, background: BB.elevated }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: BB.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Feature Columns Used ({featureCols.length})
              </span>
            </div>
            <div style={{ padding: '10px 16px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {featureCols.map(col => (
                <span key={col} style={{ display: 'inline-block', padding: '3px 9px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                  fontFamily: 'var(--font-mono)', background: `${BB.primaryLight}18`, color: BB.primaryLight, border: `1px solid ${BB.primaryLight}30` }}>
                  {col}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Next action guidance — only when job is done */}
        {job.status === 'COMPLETED' && (
          <div style={{ background: BB.elevated, border: `1px solid ${BB.border}`, borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ fontSize: 11, color: BB.muted }}>
              <span style={{ fontWeight: 700, color: BB.text }}>Next: </span>
              Adjust configuration, try a different algorithm, or review dataset quality to improve results.
            </div>
            <button onClick={() => onNavigate('workspace')}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 6,
                border: `1px solid ${BB.border}`, background: 'transparent', color: BB.text, fontSize: 11,
                fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-ui)', whiteSpace: 'nowrap', flexShrink: 0,
                transition: 'all 150ms' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = BB.primaryLight; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = BB.border; }}>
              ← Back to Training Setup
            </button>
          </div>
        )}

      </div>
    </div>
  );
});
