/**
 * TrainingResultsPage — Page 3 of the ML Platform.
 * Shows training job progress (live SSE) and high-contrast, startup-grade results dashboard.
 * Reads exclusively from ProjectContext.activeJob and multi-file experiment store.
 *
 * Design features:
 * - Enterprise-grade Model Performance Benchmark dashboard
 * - Multi-file experiment tabs for instant file-result switching
 * - Symbol-only refresh button with live file-code parsing & re-synchronization
 * - In-card "Evaluation may be unreliable" notice (integrated directly in benchmark card)
 * - Type-aware Key Performance Indicators (KPI) cards with hover illumination
 * - Segmented glowing train/test split distribution bar
 * - High-contrast Run Configuration specifications (no Job ID, no "verified from job record")
 * - Honest, un-hyped model guidance and performance interpretations
 * - Zero redundant badge strips
 */
import { memo, useEffect, useRef, useState, useMemo } from 'react';
import {
  ArrowLeft,
  BarChart2,
  AlertCircle,
  CheckCircle2,
  Play,
  RefreshCw,
  Cpu,
  AlertTriangle,
  Layers,
  Sliders,
  Sparkles,
} from 'lucide-react';
import { useProject } from '../../providers/ProjectContext';
import { fetchJobDetails, subscribeToJobProgressSSE, pollJobUntilDone } from '../../services/jobService';
import type { JobEntity } from '../../types/job';
import type { PlatformTab } from '../../App';

/* ── Premium High-Contrast Design Tokens ─────────────────────────────────────── */
const BB = {
  base: '#08070F',
  surface: '#120E22',
  elevated: '#18132E',
  card: '#1D1737',
  cardHover: '#251D45',
  glassBg: 'rgba(24, 19, 46, 0.75)',
  border: 'rgba(138, 121, 202, 0.22)',
  borderLight: 'rgba(167, 139, 250, 0.35)',
  borderAccent: 'rgba(245, 158, 11, 0.45)',
  primary: '#4B3B7C',
  primaryLight: '#8A79CA',
  primaryGlow: 'rgba(138, 121, 202, 0.25)',
  maroon: '#6E1423',
  maroonLight: '#D33852',
  gold: '#F59E0B',
  goldLight: '#FBBF24',
  text: '#FFFFFF',
  textSecondary: '#E2E8F0',
  muted: '#94A3B8',
  subtle: '#64748B',
  disabled: '#475569',
  success: '#10B981',
  successLight: '#34D399',
  warning: '#F59E0B',
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
    if (val >= 0.85) return BB.successLight;
    if (val >= 0.7) return BB.gold;
    return BB.maroonLight;
  }
  if (val >= 0.85) return BB.successLight;
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

function MetricRing({ value, color, size = 104 }: { value: number; color: string; size?: number }) {
  const strokeWidth = 8;
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
        stroke="rgba(138, 121, 202, 0.18)"
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
          transition: 'stroke-dashoffset 800ms cubic-bezier(0.4, 0, 0.2, 1)',
          filter: `drop-shadow(0 0 8px ${color}88)`,
        }}
      />
    </svg>
  );
}

function StatusBadge({ status }: { status: string }) {
  const m: Record<string, { c: string; bg: string; label: string }> = {
    COMPLETED:  { c: BB.successLight, bg: 'rgba(16, 185, 129, 0.15)', label: 'Completed' },
    FAILED:     { c: BB.error,        bg: 'rgba(248, 113, 113, 0.15)', label: 'Failed' },
    CANCELLED:  { c: BB.muted,        bg: 'rgba(148, 163, 184, 0.15)', label: 'Cancelled' },
    RUNNING:    { c: BB.gold,         bg: 'rgba(245, 158, 11, 0.15)',  label: 'Running' },
    QUEUED:     { c: BB.primaryLight, bg: 'rgba(138, 121, 202, 0.15)', label: 'Queued' },
    TRAINING:   { c: BB.gold,         bg: 'rgba(245, 158, 11, 0.15)',  label: 'Training' },
    EVALUATING: { c: BB.primaryLight, bg: 'rgba(138, 121, 202, 0.15)', label: 'Evaluating' },
    STARTING:   { c: BB.muted,        bg: 'rgba(148, 163, 184, 0.12)', label: 'Starting' },
  };
  const e = m[status] ?? { c: BB.muted, bg: 'rgba(148, 163, 184, 0.12)', label: status };
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 10px',
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.04em',
        color: e.c,
        background: e.bg,
        border: `1px solid ${e.c}44`,
        boxShadow: `0 0 10px ${e.c}22`,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: e.c, boxShadow: `0 0 6px ${e.c}` }} />
      {e.label}
    </span>
  );
}

/**
 * Parse python code from an experiment file to extract algorithm, scaler, imputer, and split settings.
 */
function parsePipelineCode(code: string): {
  algorithm?: string;
  scaler?: string;
  imputer?: string;
  testSplit?: number;
  seed?: number;
} {
  const result: {
    algorithm?: string;
    scaler?: string;
    imputer?: string;
    testSplit?: number;
    seed?: number;
  } = {};

  if (!code) return result;

  // Algorithm extraction
  if (/RandomForestClassifier/i.test(code)) result.algorithm = 'random_forest_classifier';
  else if (/RandomForestRegressor/i.test(code)) result.algorithm = 'random_forest_regressor';
  else if (/GradientBoostingClassifier/i.test(code)) result.algorithm = 'gradient_boosting_classifier';
  else if (/GradientBoostingRegressor/i.test(code)) result.algorithm = 'gradient_boosting_regressor';
  else if (/DecisionTreeClassifier/i.test(code)) result.algorithm = 'decision_tree_classifier';
  else if (/DecisionTreeRegressor/i.test(code)) result.algorithm = 'decision_tree_regressor';
  else if (/LogisticRegression/i.test(code)) result.algorithm = 'logistic_regression';
  else if (/LinearRegression/i.test(code)) result.algorithm = 'linear_regression';
  else if (/Ridge/i.test(code)) result.algorithm = 'ridge';
  else if (/Lasso/i.test(code)) result.algorithm = 'lasso';
  else if (/SVC/i.test(code)) result.algorithm = 'svc';
  else if (/SVR/i.test(code)) result.algorithm = 'svr';
  else if (/KNeighborsClassifier/i.test(code)) result.algorithm = 'k_nearest_neighbors';

  // Scaler extraction
  if (/StandardScaler/i.test(code)) result.scaler = 'standard_scaler';
  else if (/MinMaxScaler/i.test(code)) result.scaler = 'min_max_scaler';
  else if (/RobustScaler/i.test(code)) result.scaler = 'robust_scaler';
  else if (/MaxAbsScaler/i.test(code)) result.scaler = 'max_abs_scaler';

  // Imputer extraction
  const impMatch = code.match(/SimpleImputer\s*\([^)]*strategy\s*=\s*['"]([^'"]+)['"]/i);
  if (impMatch && impMatch[1]) {
    result.imputer = impMatch[1].toLowerCase();
  }

  // Split extraction
  const splitMatch = code.match(/test_size\s*=\s*([0-9.]+)/i);
  if (splitMatch && splitMatch[1]) {
    const val = parseFloat(splitMatch[1]);
    if (!isNaN(val) && val > 0 && val < 1) {
      result.testSplit = 1 - val;
    }
  }

  // Random seed extraction
  const seedMatch = code.match(/random_state\s*=\s*([0-9]+)/i);
  if (seedMatch && seedMatch[1]) {
    const s = parseInt(seedMatch[1], 10);
    if (!isNaN(s)) result.seed = s;
  }

  return result;
}

interface TrainingResultsPageProps {
  onNavigate: (tab: PlatformTab) => void;
  onShowToast?: (title: string, desc?: string, type?: 'success' | 'info' | 'error') => void;
}

export const TrainingResultsPage = memo(function TrainingResultsPage({
  onNavigate,
  onShowToast,
}: TrainingResultsPageProps) {
  const {
    activeJob,
    setActiveJob,
    trainingConfig,
    setTrainingConfig,
    dataset,
    experimentFiles,
    activeExperimentFile,
    setActiveExperimentFile,
    fileJobs,
    setFileJob,
  } = useProject();

  const [job, setJob] = useState<JobEntity | null>(activeJob);
  const [isRefreshing, setIsRefreshing] = useState(false);
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
              if (setFileJob && activeExperimentFile) {
                setFileJob(activeExperimentFile, full);
              }
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
          if (setFileJob && activeExperimentFile) {
            setFileJob(activeExperimentFile, n);
          }
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
          if (setFileJob && activeExperimentFile) {
            setFileJob(activeExperimentFile, full);
          }
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
        if (setFileJob && activeExperimentFile) {
          setFileJob(activeExperimentFile, p);
        }
      },
      ctrl.signal
    ).catch(() => {});
    return () => {
      ok = false;
      ctrl.abort();
      unsub();
    };
  }, [job?.job_id, activeExperimentFile, setActiveJob, setFileJob, onShowToast]);

  /* ── Multi-file list ─────────────────────────────────────────────────── */
  const fileList = useMemo(() => {
    const keys = Object.keys(experimentFiles || {});
    return keys.length > 0 ? keys : [activeExperimentFile || 'pipeline_generated.py'];
  }, [experimentFiles, activeExperimentFile]);

  const handleSelectFile = (fileName: string) => {
    setActiveExperimentFile(fileName);
    if (fileJobs && fileJobs[fileName]) {
      setJob(fileJobs[fileName]);
      setActiveJob(fileJobs[fileName]);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const activeCode = experimentFiles?.[activeExperimentFile] ?? '';
      const parsed = parsePipelineCode(activeCode);

      let freshJob = job?.job_id ? await fetchJobDetails(job.job_id).catch(() => null) : null;

      if (freshJob) {
        if (parsed.algorithm && parsed.algorithm !== freshJob.algorithm) {
          freshJob = {
            ...freshJob,
            algorithm: parsed.algorithm,
            metadata: {
              ...freshJob.metadata,
              ...(parsed.scaler ? { scaler: parsed.scaler } : {}),
              ...(parsed.imputer ? { imputer: parsed.imputer } : {}),
              ...(parsed.seed !== undefined ? { random_seed: parsed.seed } : {}),
            },
          };
        }
        setJob(freshJob);
        setActiveJob(freshJob);
        if (setFileJob && activeExperimentFile) setFileJob(activeExperimentFile, freshJob);
      } else if (parsed.algorithm && job) {
        const updatedJob: JobEntity = {
          ...job,
          algorithm: parsed.algorithm,
          metadata: {
            ...job.metadata,
            ...(parsed.scaler ? { scaler: parsed.scaler } : {}),
            ...(parsed.imputer ? { imputer: parsed.imputer } : {}),
            ...(parsed.seed !== undefined ? { random_seed: parsed.seed } : {}),
          },
        };
        setJob(updatedJob);
        setActiveJob(updatedJob);
        if (setFileJob && activeExperimentFile) setFileJob(activeExperimentFile, updatedJob);
      }

      if (parsed.algorithm || parsed.scaler || parsed.imputer || parsed.testSplit !== undefined || parsed.seed !== undefined) {
        if (trainingConfig) {
          setTrainingConfig({
            ...trainingConfig,
            ...(parsed.algorithm ? { algorithm: parsed.algorithm } : {}),
            ...(parsed.scaler ? { scaler: parsed.scaler } : {}),
            ...(parsed.imputer ? { imputer: parsed.imputer } : {}),
            ...(parsed.testSplit !== undefined ? { train_test_split: parsed.testSplit } : {}),
            ...(parsed.seed !== undefined ? { random_seed: parsed.seed } : {}),
          });
        }
      }

      onShowToast?.('Benchmark Refreshed', `Synchronized evaluation for ${activeExperimentFile}`, 'success');
    } finally {
      setTimeout(() => setIsRefreshing(false), 300);
    }
  };

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
          gap: 22,
          color: BB.textSecondary,
          padding: 32,
          background: `radial-gradient(ellipse at center, rgba(138, 121, 202, 0.08) 0%, ${BB.base} 70%)`,
        }}
      >
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: 24,
            background: 'linear-gradient(135deg, rgba(138, 121, 202, 0.25) 0%, rgba(20, 16, 36, 0.8) 100%)',
            border: `1px solid ${BB.borderLight}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 12px 36px rgba(0,0,0,0.45)',
          }}
        >
          <BarChart2 style={{ width: 40, height: 40, color: BB.primaryLight }} />
        </div>
        <div style={{ textAlign: 'center', maxWidth: 420 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: BB.text, marginBottom: 8, letterSpacing: '-0.02em' }}>
            No Training Run Yet
          </div>
          <div style={{ fontSize: 13, color: BB.muted, lineHeight: 1.6 }}>
            Go to Dataset Setup, configure your model, and click "Launch training job" to start.
          </div>
        </div>
        <button
          onClick={() => onNavigate('workspace')}
          style={{
            marginTop: 6,
            padding: '10px 24px',
            borderRadius: 10,
            border: `1px solid ${BB.primaryLight}`,
            background: 'linear-gradient(135deg, rgba(75, 59, 124, 0.8) 0%, rgba(138, 121, 202, 0.5) 100%)',
            color: BB.text,
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontFamily: 'var(--font-ui)',
            boxShadow: '0 6px 20px rgba(138, 121, 202, 0.35)',
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
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        background: BB.base,
        color: BB.text,
      }}
    >
      {/* ── MAIN DASHBOARD CONTAINER ─────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: '24px 28px',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
          background: `radial-gradient(circle at 50% 0%, rgba(138, 121, 202, 0.08) 0%, ${BB.base} 65%)`,
        }}
      >
        {/* ── TOP ACTION BAR: EXPERIMENT FILES & SYMBOL-ONLY REFRESH ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            borderRadius: 12,
            background: 'rgba(24, 19, 46, 0.65)',
            border: `1px solid ${BB.border}`,
            backdropFilter: 'blur(16px)',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          {/* File Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {fileList.map((fileName) => {
              const isActive = fileName === activeExperimentFile;
              return (
                <button
                  key={fileName}
                  onClick={() => handleSelectFile(fileName)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '5px 12px',
                    borderRadius: 7,
                    fontSize: 12,
                    fontWeight: isActive ? 700 : 500,
                    fontFamily: 'var(--font-mono)',
                    cursor: 'pointer',
                    border: isActive
                      ? '1px solid rgba(138, 121, 202, 0.6)'
                      : '1px solid rgba(255, 255, 255, 0.08)',
                    background: isActive
                      ? 'linear-gradient(135deg, rgba(138, 121, 202, 0.25) 0%, rgba(75, 59, 124, 0.4) 100%)'
                      : 'rgba(255, 255, 255, 0.03)',
                    color: isActive ? '#FFFFFF' : BB.muted,
                    boxShadow: isActive ? '0 0 10px rgba(138, 121, 202, 0.35)' : 'none',
                    transition: 'all 150ms ease',
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: isActive ? BB.successLight : 'rgba(255, 255, 255, 0.2)',
                    }}
                  />
                  {fileName}
                </button>
              );
            })}
          </div>

          {/* Symbol-Only Refresh Button */}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            title="Refresh Results and Sync File Changes"
            aria-label="Refresh Results"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 32,
              height: 32,
              borderRadius: 8,
              border: `1px solid ${BB.border}`,
              background: 'rgba(138, 121, 202, 0.12)',
              color: '#FFFFFF',
              cursor: isRefreshing ? 'not-allowed' : 'pointer',
              transition: 'all 150ms ease',
            }}
          >
            <RefreshCw
              style={{
                width: 14,
                height: 14,
                color: BB.primaryLight,
                animation: isRefreshing ? 'spin 1s linear infinite' : 'none',
              }}
            />
          </button>
        </div>

        {/* Live Training In Progress Banner */}
        {isRunning && (
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(26, 20, 48, 0.9) 0%, rgba(18, 14, 34, 0.9) 100%)',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              borderRadius: 14,
              padding: '20px 24px',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
              backdropFilter: 'blur(12px)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Cpu style={{ width: 20, height: 20, color: BB.gold }} />
                <span style={{ fontSize: 15, fontWeight: 800, color: BB.text }}>Training in Progress</span>
                <StatusBadge status={job.status} />
              </div>
              <span
                style={{
                  fontSize: 16,
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 800,
                  color: BB.gold,
                }}
              >
                {pct.toFixed(0)}%
              </span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: 'rgba(0,0,0,0.4)', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  borderRadius: 4,
                  background: `linear-gradient(90deg, ${BB.maroonLight}, ${BB.gold})`,
                  width: `${pct}%`,
                  transition: 'width 400ms ease',
                  boxShadow: `0 0 12px ${BB.gold}88`,
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
              background: 'linear-gradient(135deg, rgba(110, 20, 35, 0.3) 0%, rgba(30, 15, 25, 0.6) 100%)',
              border: '1px solid rgba(248, 113, 113, 0.45)',
              borderRadius: 14,
              padding: '20px 24px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 16,
              boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
              backdropFilter: 'blur(12px)',
            }}
          >
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.2)',
                borderRadius: 10,
                padding: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <AlertCircle style={{ width: 24, height: 24, color: BB.error }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: '#FFF' }}>Training Failed</span>
                <StatusBadge status={job.status} />
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: BB.textSecondary,
                  fontFamily: 'var(--font-mono)',
                  lineHeight: 1.5,
                  background: 'rgba(0,0,0,0.3)',
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: '1px solid rgba(248, 113, 113, 0.2)',
                }}
              >
                {job.error_message || job.current_stage || 'An unexpected error occurred.'}
              </div>
              <button
                onClick={() => onNavigate('workspace')}
                style={{
                  marginTop: 14,
                  padding: '8px 18px',
                  borderRadius: 8,
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
                <Play style={{ width: 12, height: 12 }} /> Back to Setup
              </button>
            </div>
          </div>
        )}

        {/* ── MODEL PERFORMANCE BENCHMARK (COMPLETED RUNS) ───────────── */}
        {job.status === 'COMPLETED' && (
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(28, 21, 53, 0.8) 0%, rgba(18, 14, 34, 0.9) 100%)',
              border: `1px solid ${BB.border}`,
              borderRadius: 16,
              padding: '24px 28px',
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
              boxShadow: '0 12px 36px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)',
              backdropFilter: 'blur(16px)',
            }}
          >
            {/* Embedded Reliability Warning Notice */}
            {showReliabilityWarning && (
              <div
                style={{
                  background: 'rgba(245, 158, 11, 0.1)',
                  border: '1px solid rgba(245, 158, 11, 0.35)',
                  borderRadius: 10,
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <AlertTriangle style={{ width: 18, height: 18, color: BB.goldLight, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 800,
                      color: '#FFFFFF',
                      marginBottom: 2,
                    }}
                  >
                    Evaluation may be unreliable
                  </div>
                  <div style={{ fontSize: 12, color: BB.textSecondary, lineHeight: 1.4 }}>
                    {isTinyDataset
                      ? `Very small dataset (${datasetRowCount} rows). Metrics may be unstable — gather more data before drawing conclusions.`
                      : 'One or more metrics could not be calculated. Check dataset quality and configuration.'}
                  </div>
                </div>
              </div>
            )}

            {/* Benchmark Body: Gauge & Primary Metric Details */}
            {pk !== null && typeof pv === 'number' && Number.isFinite(pv) && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 28,
                  padding: '16px 20px',
                  borderRadius: 12,
                  background: 'rgba(0, 0, 0, 0.25)',
                  border: `1px solid rgba(138, 121, 202, 0.15)`,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <MetricRing value={ringValue} color={pc} size={104} />
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
                            fontSize: 24,
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
                            fontSize: 10,
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
                          fontSize: 18,
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

                <div style={{ flex: 1, minWidth: 260 }}>
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
                      fontSize: 26,
                      fontWeight: 900,
                      color: '#FFFFFF',
                      letterSpacing: '-0.02em',
                      lineHeight: 1.1,
                      marginBottom: 10,
                    }}
                  >
                    {fmtKey(pk)}
                  </div>
                  {/* Honest Plain Language Interpretation Box */}
                  <div
                    style={{
                      fontSize: 12,
                      color: BB.textSecondary,
                      background: 'rgba(255, 255, 255, 0.03)',
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: '1px solid rgba(138, 121, 202, 0.25)',
                      lineHeight: 1.5,
                      fontFamily: 'var(--font-ui)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <Sparkles style={{ width: 15, height: 15, color: BB.gold, flexShrink: 0 }} />
                    <span>{performanceInterpretation(pk, pv)}</span>
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
                    borderRadius: 12,
                    padding: '14px 18px',
                    gap: 4,
                    flexShrink: 0,
                  }}
                >
                  <CheckCircle2 style={{ width: 24, height: 24, color: BB.successLight }} />
                  <span style={{ fontSize: 10, fontWeight: 800, color: BB.successLight, letterSpacing: '0.06em' }}>
                    EVALUATED
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── DUAL-COLUMN DASHBOARD GRID ─────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: 20 }}>
          {/* ── LEFT COLUMN: METRICS & DIAGNOSTICS ───────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* KPI Cards: All Evaluation Metrics */}
            {metrics && Object.keys(metrics).length > 0 && (
              <div
                style={{
                  background: BB.card,
                  border: `1px solid ${BB.border}`,
                  borderRadius: 16,
                  overflow: 'hidden',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
                }}
              >
                <div
                  style={{
                    padding: '14px 20px',
                    borderBottom: `1px solid ${BB.border}`,
                    background: BB.elevated,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <BarChart2 style={{ width: 16, height: 16, color: BB.primaryLight }} />
                    <span
                      style={{
                        fontSize: 12,
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
                        fontSize: 11,
                        color: BB.muted,
                        background: 'rgba(0,0,0,0.3)',
                        padding: '3px 10px',
                        borderRadius: 6,
                        border: `1px solid ${BB.border}`,
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
                          padding: '18px 20px',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          gap: 12,
                          transition: 'all 150ms ease',
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
                              marginBottom: 8,
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

                        {/* Metric category badge */}
                        <div style={{ fontSize: 10, color: BB.subtle }}>
                          {isInvalid ? (
                            <span style={{ color: BB.disabled, fontSize: 10 }}>Not available for this evaluation</span>
                          ) : isErr ? (
                            <span
                              style={{
                                color: BB.primaryLight,
                                background: 'rgba(138, 121, 202, 0.15)',
                                padding: '2px 7px',
                                borderRadius: 4,
                                border: '1px solid rgba(138, 121, 202, 0.25)',
                              }}
                            >
                              Error (lower is better)
                            </span>
                          ) : isR2 ? (
                            <span
                              style={{
                                color: BB.gold,
                                background: 'rgba(245, 158, 11, 0.15)',
                                padding: '2px 7px',
                                borderRadius: 4,
                                border: '1px solid rgba(245, 158, 11, 0.25)',
                              }}
                            >
                              R² Explanatory Power
                            </span>
                          ) : (
                            <span
                              style={{
                                color: BB.successLight,
                                background: 'rgba(16, 185, 129, 0.14)',
                                padding: '2px 7px',
                                borderRadius: 4,
                                border: '1px solid rgba(16, 185, 129, 0.25)',
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
                  borderRadius: 14,
                  padding: '20px 22px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                }}
              >
                <AlertCircle style={{ width: 20, height: 20, color: BB.warning, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: BB.text }}>Job completed — no metrics returned</div>
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
                  borderRadius: 16,
                  overflow: 'hidden',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
                }}
              >
                <div
                  style={{
                    padding: '14px 20px',
                    borderBottom: `1px solid ${BB.border}`,
                    background: BB.elevated,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <Layers style={{ width: 15, height: 15, color: BB.primaryLight }} />
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      color: BB.text,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                    }}
                  >
                    Feature Columns Used ({featureCols.length})
                  </span>
                </div>
                <div style={{ padding: '16px 20px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {featureCols.map((col) => (
                    <span
                      key={col}
                      style={{
                        display: 'inline-block',
                        padding: '4px 12px',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 700,
                        fontFamily: 'var(--font-mono)',
                        background: 'rgba(138, 121, 202, 0.15)',
                        color: BB.textSecondary,
                        border: '1px solid rgba(138, 121, 202, 0.3)',
                      }}
                    >
                      {col}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── RIGHT COLUMN: DATASET SPLIT & RUN SPECS ─────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Visual Train / Test Split Card */}
            <div
              style={{
                background: BB.card,
                border: `1px solid ${BB.border}`,
                borderRadius: 16,
                overflow: 'hidden',
                boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
              }}
            >
              <div
                style={{
                  padding: '14px 20px',
                  borderBottom: `1px solid ${BB.border}`,
                  background: BB.elevated,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Sliders style={{ width: 15, height: 15, color: BB.gold }} />
                  <span
                    style={{
                      fontSize: 12,
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
                    fontSize: 11,
                    fontFamily: 'var(--font-mono)',
                    color: BB.muted,
                  }}
                >
                  {trainPct}% / {testPct}%
                </span>
              </div>

              <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Segmented Bar */}
                <div
                  style={{
                    display: 'flex',
                    height: 12,
                    borderRadius: 6,
                    overflow: 'hidden',
                    background: 'rgba(0,0,0,0.4)',
                    padding: 2,
                    gap: 3,
                  }}
                >
                  <div
                    style={{
                      width: `${trainPct}%`,
                      background: 'linear-gradient(90deg, #6C5CA6 0%, #8A79CA 100%)',
                      borderRadius: 4,
                      boxShadow: '0 0 8px rgba(138, 121, 202, 0.45)',
                    }}
                    title={`Train: ${trainPct}%`}
                  />
                  <div
                    style={{
                      width: `${testPct}%`,
                      background: 'linear-gradient(90deg, #C9A24B 0%, #F59E0B 100%)',
                      borderRadius: 4,
                      boxShadow: '0 0 8px rgba(245, 158, 11, 0.45)',
                    }}
                    title={`Test: ${testPct}%`}
                  />
                </div>

                {/* Legend & Breakdown Chips */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: '#8A79CA', boxShadow: '0 0 6px #8A79CA' }} />
                    <span style={{ color: BB.muted }}>Train Set:</span>
                    <span style={{ fontWeight: 700, color: '#FFFFFF', fontFamily: 'var(--font-mono)' }}>
                      {trainPct}% {trainRows != null ? `(${trainRows} rows)` : ''}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: '#F59E0B', boxShadow: '0 0 6px #F59E0B' }} />
                    <span style={{ color: BB.muted }}>Test Set:</span>
                    <span style={{ fontWeight: 700, color: '#FFFFFF', fontFamily: 'var(--font-mono)' }}>
                      {testPct}% {testRows != null ? `(${testRows} rows)` : ''}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Run Configuration Card (Zero Job ID, Zero verified from job record) */}
            <div
              style={{
                background: BB.card,
                border: `1px solid ${BB.border}`,
                borderRadius: 16,
                overflow: 'hidden',
                boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
              }}
            >
              <div
                style={{
                  padding: '14px 20px',
                  borderBottom: `1px solid ${BB.border}`,
                  background: BB.elevated,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Cpu style={{ width: 15, height: 15, color: BB.primaryLight }} />
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      color: BB.text,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                    }}
                  >
                    Run Configuration
                  </span>
                </div>
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
                ].map(({ label, val }) => (
                  <div
                    key={label}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 20px',
                      borderBottom: `1px solid rgba(138, 121, 202, 0.1)`,
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
          </div>
        </div>
      </div>
    </div>
  );
});
