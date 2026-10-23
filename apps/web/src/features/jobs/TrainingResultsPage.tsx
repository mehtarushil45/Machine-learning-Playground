/**
 * TrainingResultsPage — Enterprise ML Platform Results Dashboard.
 * Design: Bloomberg Terminal meets Linear.app — flat, continuous layout.
 * No box effects, no floating card stacks, no glow halos. Clean, restrained, professional.
 */
import { memo, useEffect, useRef, useState, useMemo } from 'react';
import {
  ArrowLeft,
  BarChart2,
  AlertCircle,
  Play,
  RefreshCw,
  Cpu,
  AlertTriangle,
  Sliders,
  Trophy,
} from 'lucide-react';
import { useProject } from '../../providers/ProjectContext';
import { fetchJobDetails, subscribeToJobProgressSSE, pollJobUntilDone } from '../../services/jobService';
import { ExperimentLeaderboard } from './ExperimentLeaderboard';
import { ThresholdOptimizer } from './ThresholdOptimizer';
import { FeatureImportanceCard } from './FeatureImportanceCard';
import type { JobEntity } from '../../types/job';
import type { PlatformTab } from '../../App';
import { parsePipelineTargetAndConfig } from '../../utils/codeParser';
import {
  PanelLearningCollapsible,
  HeadsUpCardsContainer,
  MetricLearningTooltip,
  BaselineDisplay,
  useLearning,
} from '../learning';

/* ── Blueberry & Maroon Design System Tokens (from index.css) ───────── */
const T = {
  bg: 'var(--bb-surface, #1B1530)',
  base: 'var(--bb-base, #0B0912)',
  surface: 'var(--bb-surface, #1B1530)',
  elevated: 'var(--bb-elevated, #2A2247)',
  surfaceHover: 'var(--bb-primary-faint, rgba(107, 92, 166, 0.12))',
  border: 'var(--bb-primary-border, rgba(107, 92, 166, 0.18))',
  borderSubtle: 'rgba(107, 92, 166, 0.10)',
  accent: 'var(--bb-primary-light, #6C5CA6)',
  accentHover: '#8A7DC0',
  accentSubtle: 'var(--bb-primary-faint, rgba(107, 92, 166, 0.12))',
  accentBorder: 'var(--bb-primary-ring, rgba(107, 92, 166, 0.35))',
  gold: 'var(--bb-gold, #C9A24B)',
  goldSubtle: 'var(--bb-gold-faint, rgba(201, 162, 75, 0.12))',
  goldBorder: 'rgba(201, 162, 75, 0.35)',
  maroon: 'var(--bb-maroon, #6E1423)',
  maroonHover: 'var(--bb-maroon-hover, #8E2A3C)',
  maroonFaint: 'var(--bb-maroon-faint, rgba(110, 20, 35, 0.15))',
  maroonLight: '#B23A4E',
  success: '#22C55E',
  warning: '#F59E0B',
  error: 'var(--bb-error, #B23A4E)',
  text: 'var(--bb-text, #F5F1EC)',
  textSec: 'var(--bb-muted, #9E93B8)',
  textDim: 'var(--bb-placeholder, #5E5480)',
  mono: 'var(--font-mono, "JetBrains Mono", monospace)',
  ui: 'var(--font-ui, "Space Grotesk", sans-serif)',
} as const;

const REGRESSION_ERROR_METRICS = new Set([
  'mae', 'mse', 'rmse', 'mean_absolute_error', 'mean_squared_error', 'root_mean_squared_error',
]);
const R2_METRICS = new Set(['r2', 'r2_score']);

function fmtVal(key: string, val: number | string): string {
  if (typeof val !== 'number') return String(val ?? '--');
  if (!Number.isFinite(val)) return '--';
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
  if (typeof val !== 'number' || !Number.isFinite(val)) return T.textDim;
  const lk = key.toLowerCase();
  if (REGRESSION_ERROR_METRICS.has(lk)) return T.accent;
  if (R2_METRICS.has(lk)) {
    if (val >= 0.85) return T.success;
    if (val >= 0.7) return T.warning;
    return T.error;
  }
  if (val >= 0.85) return T.success;
  if (val >= 0.7) return T.warning;
  return T.error;
}

function isRatioMetric(key: string): boolean {
  const lk = key.toLowerCase();
  return !REGRESSION_ERROR_METRICS.has(lk) && !R2_METRICS.has(lk);
}

function toRingValue(key: string, val: number): number {
  const lk = key.toLowerCase();
  if (REGRESSION_ERROR_METRICS.has(lk)) return 0;
  if (R2_METRICS.has(lk)) return Math.max(0, Math.min(1, val));
  return Math.max(0, Math.min(1, val));
}

function perfInterp(key: string, val: number): string {
  const lk = key.toLowerCase();
  if (REGRESSION_ERROR_METRICS.has(lk)) return 'Lower is better. Compare against a baseline to assess quality.';
  if (R2_METRICS.has(lk)) {
    if (val >= 0.85) return '>= 0.85 Strong explanatory power. Verify on held-out data.';
    if (val >= 0.7) return '>= 0.70 Moderate fit. Consider feature engineering.';
    if (val >= 0) return '< 0.70 Weak fit. Review features and dataset quality.';
    return 'Negative result -- model performs worse than predicting the mean.';
  }
  if (val >= 0.85) return 'Evaluate for overfitting and class imbalance before concluding quality.';
  if (val >= 0.7) return 'Moderate result. Check class balance and dataset size.';
  return 'Below typical thresholds. Review target, features, and dataset quality.';
}

function MetricRing({ value, color, size = 96 }: { value: number; color: string; size?: number }) {
  const strokeWidth = 6;
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
        stroke={T.border}
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
        style={{ transition: 'stroke-dashoffset 800ms ease' }}
      />
    </svg>
  );
}

function StatusBadge({ status }: { status: string }) {
  const MAP: Record<string, { c: string; label: string }> = {
    COMPLETED:  { c: T.success,  label: 'Completed' },
    FAILED:     { c: T.error,    label: 'Failed' },
    CANCELLED:  { c: T.textDim,  label: 'Cancelled' },
    RUNNING:    { c: T.warning,  label: 'Running' },
    QUEUED:     { c: T.accent,   label: 'Queued' },
    TRAINING:   { c: T.warning,  label: 'Training' },
    EVALUATING: { c: T.accent,   label: 'Evaluating' },
    STARTING:   { c: T.textSec,  label: 'Starting' },
  };
  const e = MAP[status] ?? { c: T.textSec, label: status };
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'2px 8px', borderRadius:4, fontSize:10, fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase', color:e.c, background:e.c+'18', border:'1px solid '+e.c+'30', fontFamily:T.ui }}>
      <span style={{ width:5, height:5, borderRadius:'50%', background:e.c, flexShrink:0 }} />
      {e.label}
    </span>
  );
}

function MetricRow({ metricKey, value, align }: { metricKey: string; value: number | string; align: 'left' | 'center' | 'right' }) {
  const isInvalid = typeof value === 'number' && !Number.isFinite(value);
  const color = isInvalid ? T.textDim : metricColor(metricKey, value);
  const barPct = !isInvalid && typeof value === 'number' && isRatioMetric(metricKey) ? Math.max(0, Math.min(100, value * 100)) : null;
  return (
    <div
      style={{ display:'grid', gridTemplateColumns:'180px 1fr 80px', alignItems:'center', padding:'10px 24px', borderBottom:'1px solid '+T.borderSubtle, transition:'background 100ms', gap:16 }}
      onMouseEnter={(e) => { e.currentTarget.style.background = T.surfaceHover; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <MetricLearningTooltip metricName={metricKey} align={align}>
        <span style={{ fontSize:13, color:'#FFFFFF', fontWeight:500, cursor:'default' }}>{fmtKey(metricKey)}</span>
      </MetricLearningTooltip>
      <div style={{ display:'flex', alignItems:'center' }}>
        {isInvalid ? (
          <span style={{ color: T.textDim, fontSize: 11 }}>Not available for this evaluation</span>
        ) : (
          <div style={{ flex:1, height:4, background:T.border, borderRadius:2, overflow:'hidden' }}>
            {barPct !== null && <div style={{ height:'100%', width:barPct+'%', background:color, borderRadius:2, transition:'width 600ms cubic-bezier(0.4,0,0.2,1)' }} />}
          </div>
        )}
      </div>
      <span style={{ fontSize:13, fontWeight:700, color:isInvalid?T.textDim:'#FFFFFF', fontFamily:T.mono, textAlign:'right' }}>
        {isInvalid ? 'N/A' : fmtVal(metricKey, value)}
      </span>
    </div>
  );
}

interface TrainingResultsPageProps {
  onNavigate: (tab: PlatformTab, deploymentId?: string) => void;
  onShowToast?: (title: string, desc?: string, type?: 'success' | 'info' | 'error') => void;
}

export const TrainingResultsPage = memo(function TrainingResultsPage({ onNavigate, onShowToast }: TrainingResultsPageProps) {
  const {
    activeJob, setActiveJob, trainingConfig, setTrainingConfig, dataset,
    experimentFiles, activeExperimentFile, setActiveExperimentFile,
    fileJobs, setFileJob, setSelectedTarget, setSelectedFeatures,
  } = useProject();
  const { learningMode } = useLearning();

  const [job, setJob] = useState<JobEntity | null>(activeJob);
  const [activeView, setActiveView] = useState<'overview' | 'leaderboard'>('overview');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const fetchedRef = useRef<string | null>(null);

  useEffect(() => { setJob(activeJob); }, [activeJob?.job_id, activeJob?.status]);

  useEffect(() => {
    if (!job) return;
    const terminal = ['COMPLETED', 'FAILED', 'CANCELLED'];
    if (terminal.includes(job.status)) {
      if (job.status === 'COMPLETED' && !job.metadata?.metrics && fetchedRef.current !== job.job_id) {
        fetchedRef.current = job.job_id;
        fetchJobDetails(job.job_id).then((full) => {
          if (full) { setJob(full); setActiveJob(full); if (setFileJob && activeExperimentFile) setFileJob(activeExperimentFile, full); }
        }).catch(() => {});
      }
      return;
    }
    let ok = true;
    const ctrl = new AbortController();
    fetchJobDetails(job.job_id).then((fresh) => {
      if (fresh && ok && terminal.includes(fresh.status)) {
        setJob(fresh); setActiveJob(fresh);
        if (setFileJob && activeExperimentFile) setFileJob(activeExperimentFile, fresh);
        ctrl.abort();
      }
    }).catch(() => {});
    const unsub = subscribeToJobProgressSSE(job.job_id, {
      onProgress: (live) => {
        if (!ok) return;
        setJob((prev) => {
          if (!prev) return prev;
          const term = ['COMPLETED','FAILED','CANCELLED'];
          if (term.includes(prev.status) && !term.includes(live.status)) return prev;
          const n = { ...prev, status:live.status, progress:live.progress, current_stage:live.current_stage, estimated_seconds:live.estimated_seconds_remaining };
          setActiveJob(n);
          if (setFileJob && activeExperimentFile) setFileJob(activeExperimentFile, n);
          if (live.status === 'COMPLETED' && fetchedRef.current !== prev.job_id) {
            fetchedRef.current = prev.job_id;
            fetchJobDetails(prev.job_id).then((full) => {
              if (full && ok) { setJob(full); setActiveJob(full); if (setFileJob && activeExperimentFile) setFileJob(activeExperimentFile, full); }
            }).catch(() => {});
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
          setJob(full); setActiveJob(full);
          if (setFileJob && activeExperimentFile) setFileJob(activeExperimentFile, full);
          onShowToast?.('Training complete', 'Review the results below.', 'success');
        }
      },
    });
    pollJobUntilDone(job.job_id, (p) => {
      if (!ok) return;
      setJob(p); setActiveJob(p);
      if (setFileJob && activeExperimentFile) setFileJob(activeExperimentFile, p);
    }, ctrl.signal).catch(() => {});
    return () => { ok = false; ctrl.abort(); unsub(); };
  }, [job?.job_id, activeExperimentFile, setActiveJob, setFileJob, onShowToast]);

  const fileList = useMemo(() => {
    const keys = Object.keys(experimentFiles || {});
    return keys.length > 0 ? keys : [activeExperimentFile || 'pipeline_generated.py'];
  }, [experimentFiles, activeExperimentFile]);

  const handleSelectFile = (fileName: string) => {
    setActiveExperimentFile(fileName);
    if (fileJobs && fileJobs[fileName]) { setJob(fileJobs[fileName]); setActiveJob(fileJobs[fileName]); }
  };

  useEffect(() => {
    const activeCode = experimentFiles?.[activeExperimentFile];
    if (!activeCode) return;
    const parsed = parsePipelineTargetAndConfig(activeCode);
    if (parsed.target && parsed.target !== (job?.target_column || trainingConfig?.target_column)) {
      if (job) { const s = { ...job, target_column: parsed.target }; setJob(s); setActiveJob(s); if (setFileJob && activeExperimentFile) setFileJob(activeExperimentFile, s); }
      if (trainingConfig) setTrainingConfig({ ...trainingConfig, target_column: parsed.target });
      setSelectedTarget(parsed.target);
    }
  }, [activeExperimentFile, experimentFiles, job?.target_column, trainingConfig?.target_column, setActiveJob, setFileJob, setSelectedTarget, setTrainingConfig]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const activeCode = experimentFiles?.[activeExperimentFile] ?? '';
      const parsed = parsePipelineTargetAndConfig(activeCode);
      let freshJob = job?.job_id ? await fetchJobDetails(job.job_id).catch(() => null) : null;
      if (freshJob) {
        if (parsed.algorithm && parsed.algorithm !== freshJob.algorithm) {
          freshJob = { ...freshJob, algorithm:parsed.algorithm, metadata:{ ...freshJob.metadata, ...(parsed.scaler?{scaler:parsed.scaler}:{}), ...(parsed.imputer?{imputer:parsed.imputer}:{}), ...(parsed.seed!==undefined?{random_seed:parsed.seed}:{}) } };
        }
        if (parsed.target) freshJob = { ...freshJob, target_column:parsed.target };
        setJob(freshJob); setActiveJob(freshJob);
        if (setFileJob && activeExperimentFile) setFileJob(activeExperimentFile, freshJob);
      } else if (job) {
        const u: JobEntity = { ...job, ...(parsed.algorithm?{algorithm:parsed.algorithm}:{}), ...(parsed.target?{target_column:parsed.target}:{}), metadata:{ ...job.metadata, ...(parsed.scaler?{scaler:parsed.scaler}:{}), ...(parsed.imputer?{imputer:parsed.imputer}:{}), ...(parsed.seed!==undefined?{random_seed:parsed.seed}:{}) } };
        setJob(u); setActiveJob(u);
        if (setFileJob && activeExperimentFile) setFileJob(activeExperimentFile, u);
      }
      if (parsed.target||parsed.algorithm||parsed.scaler||parsed.imputer||parsed.testSplit!==undefined||parsed.seed!==undefined) {
        if (trainingConfig) { setTrainingConfig({ ...trainingConfig, ...(parsed.target?{target_column:parsed.target}:{}), ...(parsed.algorithm?{algorithm:parsed.algorithm}:{}), ...(parsed.scaler?{scaler:parsed.scaler}:{}), ...(parsed.imputer?{imputer:parsed.imputer}:{}), ...(parsed.testSplit!==undefined?{train_test_split:parsed.testSplit}:{}), ...(parsed.seed!==undefined?{random_seed:parsed.seed}:{}) }); }
        if (parsed.target) setSelectedTarget(parsed.target);
        if (parsed.features && parsed.features.length > 0) setSelectedFeatures(parsed.features);
      }
      onShowToast?.('Benchmark Refreshed', 'Synchronized evaluation for ' + activeExperimentFile, 'success');
    } finally {
      setTimeout(() => setIsRefreshing(false), 300);
    }
  };

  if (!job) {
    return (
      <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:20, padding:40, background:T.bg }}>
        <div style={{ width:56, height:56, borderRadius:8, background:T.surface, border:'1px solid '+T.border, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <BarChart2 style={{ width:26, height:26, color:T.textDim }} />
        </div>
        <div style={{ textAlign:'center', maxWidth:380 }}>
          <div style={{ fontSize:16, fontWeight:700, color:T.text, marginBottom:8, letterSpacing:'-0.01em' }}>No Training Run Yet</div>
          <div style={{ fontSize:13, color:T.textSec, lineHeight:1.6 }}>Go to Dataset Setup, configure your model, and click "Launch training job" to start.</div>
        </div>
        <button onClick={() => onNavigate('workspace')}
          style={{ marginTop:4, padding:'8px 18px', borderRadius:4, border:'1px solid '+T.border, background:T.surface, color:T.text, fontSize:12, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:7, fontFamily:T.ui }}
          onMouseEnter={(e) => { e.currentTarget.style.background = T.surfaceHover; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = T.surface; }}
        >
          <ArrowLeft style={{ width:13, height:13 }} /> Go to Dataset Setup
        </button>
      </div>
    );
  }

  const metrics = (job.metadata?.metrics || (job as any).metrics) as Record<string, number | string> | undefined;
  const isRunning = !['COMPLETED','FAILED','CANCELLED'].includes(job.status);
  const pk = metrics ? getPrimary(metrics) : null;
  const pv = pk !== null && metrics ? metrics[pk] : null;
  const pc = pk && typeof pv === 'number' ? metricColor(pk, pv) : T.textSec;
  const ringValue = pk && typeof pv === 'number' ? toRingValue(pk, pv) : 0;
  const pct = Math.min(100, Math.max(0, job.progress ?? 0));
  const actualAlgorithm = job.algorithm || trainingConfig?.algorithm || '--';
  const actualScaler = (job.metadata?.scaler as string | undefined) || trainingConfig?.scaler || '--';
  const actualImputer = (job.metadata?.imputer as string | undefined) || trainingConfig?.imputer || '--';
  const actualCvFolds = (job.metadata?.cross_validation as number | undefined) ?? trainingConfig?.cv_folds;
  const actualSeed = (job.metadata?.random_seed as number | null | undefined) ?? trainingConfig?.random_seed;
  const actualSplit = trainingConfig?.train_test_split ?? 0.8;
  const datasetName = trainingConfig?.dataset_name || job.dataset_id || '--';
  const featureCols = job.feature_columns?.length ? job.feature_columns : trainingConfig?.feature_columns || [];
  const datasetRowCount = dataset?.rowCount ?? dataset?.rows?.length ?? ((job?.metadata as any)?.row_count as number | undefined) ?? ((trainingConfig as any)?.row_count as number | undefined);
  const hasUnreliableMetrics = metrics ? Object.values(metrics).some((v) => typeof v === 'number' && !Number.isFinite(v)) : false;
  const isTinyDataset = datasetRowCount !== undefined && datasetRowCount < 50;
  const showReliabilityWarning = hasUnreliableMetrics || isTinyDataset;
  const isClassification = (job.metadata?.problem_type as string)?.includes('classification') || (trainingConfig as any)?.task_type === 'classification' || trainingConfig?.algorithm?.includes('classifier') || (metrics && ('accuracy' in metrics || 'f1_score' in metrics || 'f1' in metrics));
  const trainPct = Math.round(actualSplit * 100);
  const testPct = 100 - trainPct;
  const trainRows = datasetRowCount != null ? Math.round(datasetRowCount * actualSplit) : null;
  const testRows = datasetRowCount != null ? datasetRowCount - (trainRows ?? 0) : null;
  const configRows = [
    { label:'Dataset',     val:datasetName },
    { label:'Algorithm',   val:actualAlgorithm.replace(/_/g,' ') },
    { label:'Target',      val:job.target_column||trainingConfig?.target_column||'--' },
    { label:'Features',    val:featureCols.length+' column'+(featureCols.length!==1?'s':'') },
    { label:'Train Split', val:trainPct+'% / '+testPct+'%' },
    { label:'CV Folds',    val:actualCvFolds!=null?actualCvFolds+'-fold':'--' },
    { label:'Scaler',      val:actualScaler.replace(/_/g,' ') },
    { label:'Imputer',     val:actualImputer.replace(/_/g,' ') },
    { label:'Seed',        val:actualSeed!=null?String(actualSeed):'--' },
  ];

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', minHeight:0, background:T.bg, color:T.text, fontFamily:T.ui }}>
      {/* TOP TOOLBAR: TABS, ACTIVE FILE, ICON REFRESH, SINGLE DEPLOY MODEL BUTTON */}
      <div style={{ height:44, minHeight:44, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 20px', borderBottom:'1px solid '+T.border, background:T.elevated, flexShrink:0, gap:12 }}>
        <div style={{ display:'flex', alignItems:'center', height:'100%', gap:14, minWidth:0, overflow:'hidden' }}>
          <div style={{ display:'flex', alignItems:'center', height:'100%', flexShrink:0 }}>
            {([{id:'overview' as const, icon:BarChart2, label:'Run Overview'},{id:'leaderboard' as const, icon:Trophy, label:'Leaderboard'}]).map(({id,icon:Icon,label}) => {
              const isActive = activeView===id;
              return (
                <button key={id} onClick={() => setActiveView(id)}
                  style={{ display:'flex', alignItems:'center', gap:6, padding:'0 14px', height:'100%', fontSize:13, fontWeight:isActive?600:400, border:'none', borderBottom:isActive?'2px solid '+T.accent:'2px solid transparent', borderTop:'2px solid transparent', background:'transparent', color:isActive?T.text:T.textSec, cursor:'pointer', fontFamily:T.ui }}
                  onMouseEnter={(e) => { if(!isActive) e.currentTarget.style.color=T.text; }}
                  onMouseLeave={(e) => { if(!isActive) e.currentTarget.style.color=T.textSec; }}
                >
                  <Icon size={13} />{label}
                </button>
              );
            })}
          </div>
          {activeView==='overview' && (
            <>
              <div style={{ width:1, height:18, background:T.border, flexShrink:0 }} />
              <div style={{ display:'flex', alignItems:'center', gap:6, overflowX:'auto', minWidth:0 }} className="no-scrollbar">
                {fileList.map((fileName) => {
                  const isActive = fileName===activeExperimentFile;
                  return (
                    <button key={fileName} onClick={() => handleSelectFile(fileName)}
                      title={fileName}
                      style={{
                        display:'flex',
                        alignItems:'center',
                        gap:6,
                        padding:'3px 10px',
                        borderRadius:4,
                        fontSize:11,
                        fontWeight:isActive?600:400,
                        fontFamily:T.mono,
                        cursor:'pointer',
                        border:'1px solid '+(isActive?T.accentBorder:T.border),
                        background:isActive?T.accentSubtle:'transparent',
                        color:isActive?T.text:T.textSec,
                        whiteSpace:'nowrap',
                        maxWidth:200,
                        overflow:'hidden',
                        textOverflow:'ellipsis',
                      }}
                    >
                      <span style={{ width:5, height:5, borderRadius:'50%', background:isActive?T.success:T.textDim, flexShrink:0 }} />
                      <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{fileName}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
          {/* REFRESH BUTTON: ICON SYMBOL ONLY */}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            title="Refresh Benchmark"
            aria-label="Refresh"
            style={{
              display:'flex',
              alignItems:'center',
              justifyContent:'center',
              width:28,
              height:28,
              borderRadius:4,
              border:'1px solid '+T.border,
              background:'transparent',
              color:T.textSec,
              cursor:isRefreshing?'not-allowed':'pointer',
              transition:'all 100ms ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background=T.surfaceHover; e.currentTarget.style.color=T.text; }}
            onMouseLeave={(e) => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color=T.textSec; }}
          >
            <RefreshCw style={{ width:13, height:13, animation:isRefreshing?'spin 1s linear infinite':'none' }} />
          </button>

        </div>
      </div>

      {activeView==='leaderboard' ? (
        <div style={{ flex:1, minHeight:0, overflowY:'auto', background:T.bg }}>
          {/* Page Guide for Experiment Leaderboard */}
          <div style={{ padding: '16px 24px 0 24px', flexShrink: 0 }}>
            <PanelLearningCollapsible
              title="Experiment Leaderboard Guide"
              steps={[
                {
                  title: 'Review Model Rankings',
                  action: 'Examine primary evaluation metric scores to see which algorithm performed best on the test set.',
                },
                {
                  title: 'Side-by-Side Diff',
                  action: 'Select checkboxes for any 2 runs to compare their hyperparameters, scalers, and data configs side-by-side.',
                },
                {
                  title: 'Inspect Run Details',
                  action: 'Click Inspect on any run to switch back to the Overview tab with full confusion matrix and threshold tuning.',
                },
                {
                  title: 'Promote Champion',
                  action: 'Click Set as Champion on your top candidate model to promote it for deployment and serving.',
                },
              ]}
              quickTip="Use side-by-side diff to see exactly what hyperparameter changed between runs and caused higher scores."
            />
          </div>
          <ExperimentLeaderboard
            currentJob={job} fileJobs={fileJobs} activeExperimentFile={activeExperimentFile}
            onSelectJob={(selected,file) => { setJob(selected); setActiveJob(selected); if(file) setActiveExperimentFile(file); setActiveView('overview'); }}
            onPromoteChampion={(promoted) => { setJob(promoted); setActiveJob(promoted); onShowToast?.('Champion Promoted',(promoted.algorithm?promoted.algorithm.replace(/_/g,' '):'Model')+' is now the active Champion.','success'); }}
            targetColumn={job.target_column||trainingConfig?.target_column}
          />
        </div>
      ) : (
        <div style={{ flex:1, minHeight:0, overflowY:'auto', display:'flex', flexDirection:'column', background:T.bg }}>
          {/* Page Guide for Training & Results Overview */}
          <div style={{ padding: '16px 24px 0 24px', flexShrink: 0 }}>
            <PanelLearningCollapsible
              title="Training Results & Evaluation Guide"
              steps={[
                {
                  title: 'Compare Models',
                  action: 'Check the experiment leaderboard table to see which algorithm achieved the best test score.',
                },
                {
                  title: 'Compare Against Baseline',
                  action: 'Check the baseline reference card to ensure your model beats a trivial majority-class or average guess.',
                },
                {
                  title: 'Inspect Confusion Matrix',
                  action: 'Toggle the confusion matrix to see exactly which categories the model confused or predicted accurately.',
                },
                {
                  title: 'Promote Your Champion',
                  action: 'Click Promote to Champion on your top run to stage it for deployment and live serving.',
                },
              ]}
              quickTip="Watch out for overfitting: if training accuracy is 99% but test score is much lower, simplify your model."
            />
            <HeadsUpCardsContainer />
          </div>

          {isRunning && (
            <div style={{ padding:'16px 24px', borderBottom:'1px solid '+T.border, borderLeft:'3px solid '+T.warning, display:'flex', flexDirection:'column', gap:10, flexShrink:0 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <Cpu style={{ width:16, height:16, color:T.warning }} />
                  <span style={{ fontSize:13, fontWeight:600, color:T.text }}>Training in Progress</span>
                  <StatusBadge status={job.status} />
                </div>
                <span style={{ fontSize:13, fontFamily:T.mono, fontWeight:700, color:T.warning }}>{pct.toFixed(0)}%</span>
              </div>
              <div style={{ height:3, borderRadius:2, background:T.border, overflow:'hidden' }}>
                <div style={{ height:'100%', borderRadius:2, background:T.warning, width:pct+'%', transition:'width 400ms ease' }} />
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:T.textSec, fontFamily:T.mono }}>
                <span>{job.current_stage||'Fitting estimator...'}</span>
                {job.estimated_seconds?<span>~{job.estimated_seconds.toFixed(0)}s remaining</span>:null}
              </div>
            </div>
          )}

          {job.status==='FAILED' && (
            <div style={{ padding:'16px 24px', borderBottom:'1px solid '+T.border, borderLeft:'3px solid '+T.error, display:'flex', alignItems:'flex-start', gap:14, flexShrink:0 }}>
              <AlertCircle style={{ width:18, height:18, color:T.error, flexShrink:0, marginTop:1 }} />
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                  <span style={{ fontSize:13, fontWeight:600, color:T.text }}>Training Failed</span>
                  <StatusBadge status={job.status} />
                </div>
                <div style={{ fontSize:12, color:T.textSec, fontFamily:T.mono, lineHeight:1.6, padding:'8px 0' }}>
                  {job.error_message||job.current_stage||'An unexpected error occurred.'}
                </div>
                <button onClick={() => onNavigate('workspace')}
                  style={{ marginTop:12, padding:'5px 12px', borderRadius:4, border:'1px solid '+T.border, background:'transparent', color:T.text, fontSize:12, fontWeight:500, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:6, fontFamily:T.ui }}
                >
                  <Play style={{ width:11, height:11 }} /> Back to Setup
                </button>
              </div>
            </div>
          )}

          {showReliabilityWarning && (
            <div style={{ padding:'12px 24px', borderBottom:'1px solid '+T.border, borderLeft:'3px solid '+T.warning, display:'flex', alignItems:'flex-start', gap:10, flexShrink:0 }}>
              <AlertTriangle style={{ width:15, height:15, color:T.warning, flexShrink:0, marginTop:1 }} />
              <div>
                <div style={{ fontSize:12, fontWeight:600, color:T.text, marginBottom:2 }}>Evaluation may be unreliable</div>
                <div style={{ fontSize:12, color:T.textSec, lineHeight:1.5 }}>
                  {isTinyDataset?'Very small dataset ('+datasetRowCount+' rows). Metrics may be unstable.':'One or more metrics could not be calculated. Check dataset quality and configuration.'}
                </div>
              </div>
            </div>
          )}

          {/* Benchmark Primary Metric Hero (Direct on page, no background layer) */}
          {job.status==='COMPLETED' && pk !== null && typeof pv === 'number' && Number.isFinite(pv) && (
            <div style={{ padding:'20px 24px', borderBottom:'1px solid '+T.border, display:'flex', alignItems:'center', gap:24, flexShrink:0 }}>
              <div style={{ position:'relative', width:96, height:96, flexShrink:0 }}>
                <MetricRing value={ringValue} color={pc} size={96} />
                <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
                  {isRatioMetric(pk) ? (
                    <>
                      <span style={{ fontSize:22, fontWeight:800, color:T.text, fontFamily:T.mono, lineHeight:1 }}>
                        {(pv * 100).toFixed(1)}
                      </span>
                      <span style={{ fontSize:10, color:T.textDim, fontWeight:700 }}>%</span>
                    </>
                  ) : (
                    <span style={{ fontSize:15, fontWeight:800, color:T.text, fontFamily:T.mono }}>
                      {fmtVal(pk, pv)}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ flex:1, display:'flex', flexDirection:'column', gap:6 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <span style={{ fontSize:16, fontWeight:700, color:T.text, letterSpacing:'-0.01em' }}>{fmtKey(pk)}</span>
                  <StatusBadge status={job.status} />
                </div>
                <div style={{ fontSize:12.5, color:T.textSec, lineHeight:1.5 }}>
                  {perfInterp(pk, pv)}
                </div>
              </div>
            </div>
          )}

          {/* RUN CONFIGURATION & DATASET SPLIT (ALL RIGHT SIDE INFORMATION NOW DIRECT ON PAGE) */}
          <div style={{ padding:'20px 24px', borderBottom:'1px solid '+T.border, display:'flex', flexDirection:'column', gap:16, flexShrink:0 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                <Cpu style={{ width:13, height:13, color:'#00D4FF' }} />
                <span
                  style={{
                    display:'inline-flex',
                    alignItems:'center',
                    padding:'2px 8px',
                    borderRadius:4,
                    background:'rgba(0, 212, 255, 0.16)',
                    border:'1px solid rgba(0, 212, 255, 0.38)',
                    color:'#FFFFFF',
                    fontSize:10,
                    fontWeight:700,
                    textTransform:'uppercase',
                    letterSpacing:'0.08em',
                    fontFamily:T.ui,
                  }}
                >
                  Run Configuration
                </span>
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))', gap:'12px 20px' }}>
              {configRows.map(({label,val}) => (
                <div key={label} style={{ display:'flex', flexDirection:'column', gap:6, minWidth:0 }}>
                  <span
                    style={{
                      display:'inline-flex',
                      alignItems:'center',
                      width:'fit-content',
                      padding:'2px 8px',
                      borderRadius:4,
                      background:'rgba(0, 212, 255, 0.16)',
                      border:'1px solid rgba(0, 212, 255, 0.38)',
                      color:'#FFFFFF',
                      fontSize:10,
                      fontWeight:700,
                      textTransform:'uppercase',
                      letterSpacing:'0.07em',
                      fontFamily:T.ui,
                    }}
                  >
                    {label}
                  </span>
                  <span
                    title={String(val)}
                    style={{
                      fontSize:13,
                      fontWeight:600,
                      color:T.text,
                      fontFamily:T.mono,
                      overflow:'hidden',
                      textOverflow:'ellipsis',
                      whiteSpace:'nowrap',
                      maxWidth:'100%',
                    }}
                  >
                    {val}
                  </span>
                </div>
              ))}
            </div>

            {/* Dataset Split */}
            <div style={{ display:'flex', flexDirection:'column', gap:8, paddingTop:4 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:11 }}>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <Sliders style={{ width:12, height:12, color:'#00D4FF' }} />
                  <span
                    style={{
                      display:'inline-flex',
                      alignItems:'center',
                      width:'fit-content',
                      padding:'2px 8px',
                      borderRadius:4,
                      background:'rgba(0, 212, 255, 0.16)',
                      border:'1px solid rgba(0, 212, 255, 0.38)',
                      color:'#FFFFFF',
                      fontSize:10,
                      fontWeight:700,
                      textTransform:'uppercase',
                      letterSpacing:'0.07em',
                      fontFamily:T.ui,
                    }}
                  >
                    Dataset Split
                  </span>
                </div>
                <div style={{ display:'flex', gap:16, fontSize:11 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                    <div style={{ width:7, height:7, borderRadius:2, background:T.accent }} />
                    <span style={{ color:T.textSec }}>Train {trainPct}%</span>
                    {trainRows!=null&&<span style={{ color:T.textDim, fontFamily:T.mono }}>({trainRows})</span>}
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                    <div style={{ width:7, height:7, borderRadius:2, background:T.warning }} />
                    <span style={{ color:T.textSec }}>Test {testPct}%</span>
                    {testRows!=null&&<span style={{ color:T.textDim, fontFamily:T.mono }}>({testRows})</span>}
                  </div>
                </div>
              </div>
              <div style={{ height:4, borderRadius:2, overflow:'hidden', background:T.border, display:'flex', gap:2 }}>
                <div style={{ width:trainPct+'%', background:T.accent, borderRadius:2 }} title={'Train: '+trainPct+'%'} />
                <div style={{ flex:1, background:T.warning, borderRadius:2 }} title={'Test: '+testPct+'%'} />
              </div>
            </div>
          </div>

          {/* Evaluation Metrics (Flat Table, Direct on page, No background layer) */}
          {metrics && Object.keys(metrics).length>0 && (
            <div style={{ borderBottom:'1px solid '+T.border, flexShrink:0 }}>
              <div style={{ padding:'14px 24px 6px', display:'flex', alignItems:'center', gap:7 }}>
                <BarChart2 style={{ width:13, height:13, color:'#00D4FF' }} />
                <span
                  style={{
                    display:'inline-flex',
                    alignItems:'center',
                    padding:'2px 8px',
                    borderRadius:4,
                    background:'rgba(0, 212, 255, 0.16)',
                    border:'1px solid rgba(0, 212, 255, 0.38)',
                    color:'#FFFFFF',
                    fontSize:10,
                    fontWeight:700,
                    textTransform:'uppercase',
                    letterSpacing:'0.07em',
                    fontFamily:T.ui,
                  }}
                >
                  Evaluation Metrics
                </span>
                {actualSplit!=null && <span style={{ fontSize:10, color:'#FFFFFF', marginLeft:'auto' }}>Computed on {testPct}% test split</span>}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'180px 1fr 80px', padding:'6px 24px', borderBottom:'1px solid '+T.borderSubtle, gap:16 }}>
                {([['Metric','left'],['Value','left'],['Score','right']] as const).map(([h,align]) => (
                  <span key={h} style={{ fontSize:10, fontWeight:700, color:'#FFFFFF', textTransform:'uppercase', letterSpacing:'0.07em', textAlign:align }}>{h}</span>
                ))}
              </div>
              {Object.entries(metrics).map(([k,v],idx,arr) => (
                <MetricRow key={k} metricKey={k} value={v} align={idx===0?'left':idx===arr.length-1?'right':'center'} />
              ))}
              {learningMode && (
                <div style={{ padding:'12px 24px', borderTop:'1px solid '+T.borderSubtle }}>
                  <BaselineDisplay
                    className="border-0 bg-transparent p-0"
                    taskType={isClassification?'classification':'regression'}
                    modelScore={typeof(metrics?.accuracy??pv)==='number'?Number(metrics?.accuracy??pv):undefined}
                    baselineScore={isClassification?(typeof(job as any).baseline_accuracy==='number'?(job as any).baseline_accuracy:0.50):0.0}
                    testSampleSize={testRows??undefined}
                    wilsonInterval={(job as any).wilson_ci}
                  />
                </div>
              )}
            </div>
          )}

          {job.status==='COMPLETED' && (!metrics||Object.keys(metrics).length===0) && (
            <div style={{ padding:'16px 24px', borderBottom:'1px solid '+T.border, display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
              <AlertCircle style={{ width:18, height:18, color:T.warning, flexShrink:0 }} />
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:T.text }}>Job completed — no metrics returned</div>
                <div style={{ fontSize:12, color:T.textSec, marginTop:3, lineHeight:1.5 }}>The training worker finished but did not return evaluation metrics. Check backend logs.</div>
              </div>
            </div>
          )}

          {/* FEATURE IMPORTANCE BLOCK (BROUGHT BACK! DIRECT ON PAGE) */}
          {featureCols.length > 0 && (
            <div style={{ padding:'20px 24px', borderBottom:'1px solid '+T.border, flexShrink:0 }}>
              <FeatureImportanceCard
                featureImportance={job.metadata?.feature_importance as any}
                featureColumns={featureCols}
              />
            </div>
          )}

          {/* Threshold Optimizer & Confusion Matrix (Direct on page, No background layer) */}
          {isClassification && job.status==='COMPLETED' && (
            <div style={{ padding:'20px 24px 32px', flexShrink:0 }}>
              <ThresholdOptimizer job={job} targetColumn={job.target_column||trainingConfig?.target_column||'Target'} baseMetrics={metrics} confusionMatrix={job.metadata?.confusion_matrix as number[][]|undefined} />
            </div>
          )}
        </div>
      )}
    </div>
  );
});
