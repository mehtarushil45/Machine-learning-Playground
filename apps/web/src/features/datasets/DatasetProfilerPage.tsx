/**
 * DatasetProfilerPage — Page 1 of the six-page ML Platform lifecycle.
 *
 * Layout matches the mockup exactly:
 *   ┌────────────────────────────────────────────────────────────────────┐
 *   │  [Header: filename · rows · cols · size]           [97 quality ○] │
 *   ├──────────────────────────────────┬─────────────────────────────────┤
 *   │  Overview & Quality              │  Column Schema Table            │
 *   │  (issues + next best action)     │  (TYPE / MISSING / UNIQUE)      │
 *   ├──────────────────────────────────┼─────────────────────────────────┤
 *   │  Feature & Target Selection      │  Training Setup                 │
 *   │  (combined checklist)            │  (algo/scaler/imputer/folds     │
 *   │                                  │   + Launch training job →)      │
 *   └──────────────────────────────────┴─────────────────────────────────┘
 *   AI Copilot panel lives on the right edge (380px), always visible.
 *
 * Key fixes applied here:
 *  - B3: Real computed Data Quality Score (0–100)
 *  - B4: Single column schema table, not duplicated
 *  - B5: Feature selection state wired directly into launch payload
 *  - Full mockup layout with BB design system
 */
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle, AlertTriangle, CheckCircle2,
  Database, Loader2, Upload,
} from 'lucide-react';
import { useProject } from '../../providers/ProjectContext';
import { DataUpload } from './DataUpload';
import type { Dataset, DatasetProfile, DatasetHealthReport, DatasetRecommendations, ColumnProfile } from '../../types/dataset';
import type { TrainingRequestPayload } from '../../types/job';
import { computeClientProfile } from '../../services/profilerService';
import { computeClientHealth } from '../../services/healthService';
import { computeClientRecommendations } from '../../services/recommendationService';
import { fetchDatasetProfile } from '../../services/profilerService';
import { fetchDatasetHealth } from '../../services/healthService';
import { fetchDatasetRecommendations } from '../../services/recommendationService';
import { createTrainingJob, fetchSupportedAlgorithms, type SupportedAlgorithms } from '../../services/jobService';
import { getNumericColumns } from '../../utils/columnAnalysis';
import { toggleFeatureColumn, selectTargetColumn } from '../../utils/columnSelection';
import type { PlatformTab } from '../../App';

/* ── BB brand tokens ──────────────────────────────────────────────────── */
const BB = {
  base:         '#0B0912',
  surface:      '#1B1530',
  elevated:     '#2A2247',
  border:       'rgba(107,92,166,0.18)',
  borderHover:  'rgba(107,92,166,0.35)',
  primary:      '#4B3B7C',
  primaryLight: '#6C5CA6',
  maroon:       '#6E1423',
  maroonLight:  '#B23A4E',
  gold:         '#C9A24B',
  text:         '#F5F1EC',
  muted:        '#9E93B8',
  disabled:     '#3D3558',
  success:      '#22c55e',
  warning:      '#f59e0b',
} as const;

/* ── Helpers ──────────────────────────────────────────────────────────── */
function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

function computeQualityScore(profile: DatasetProfile): number {
  const rows = profile.row_count || 1;
  const cols = profile.column_count || 1;
  const totalCells = rows * cols;

  const missingPct      = totalCells > 0 ? (profile.total_missing_values / totalCells) * 100 : 0;
  const dupRowPct       = rows > 0 ? (profile.duplicate_rows / rows) * 100 : 0;
  const emptyColPct     = cols > 0 ? (profile.empty_columns / cols) * 100 : 0;
  const dupColPct       = cols > 0 ? (profile.duplicate_columns / cols) * 100 : 0;

  let score = 100;
  score -= Math.min(missingPct * 1.5, 35);  // missing values: up to -35
  score -= Math.min(dupRowPct  * 0.8, 20);  // duplicate rows: up to -20
  score -= Math.min(emptyColPct * 2,  15);  // empty columns:  up to -15
  score -= Math.min(dupColPct  * 1,   10);  // duplicate cols: up to -10

  return Math.round(Math.max(0, Math.min(100, score)));
}

function getQualityColor(score: number): string {
  if (score >= 85) return BB.success;
  if (score >= 65) return BB.gold;
  return BB.maroonLight;
}

function getColTypeColor(type: string): string {
  switch (type) {
    case 'numeric':     return BB.primaryLight;
    case 'categorical': return BB.gold;
    case 'identifier':  return BB.muted;
    case 'boolean':     return BB.success;
    case 'datetime':    return '#60a5fa';
    default:            return BB.muted;
  }
}

/* ── Quality ring SVG ─────────────────────────────────────────────────── */
function QualityRing({ score }: { score: number }) {
  const color  = getQualityColor(score);
  const R      = 22;
  const circ   = 2 * Math.PI * R;
  const offset = circ * (1 - score / 100);

  return (
    <div
      style={{ position: 'relative', width: 58, height: 58, flexShrink: 0 }}
      title={`Data Quality Score: ${score}/100`}
    >
      <svg width={58} height={58} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={29} cy={29} r={R} fill="none" stroke={BB.elevated} strokeWidth={5} />
        <circle
          cx={29} cy={29} r={R}
          fill="none"
          stroke={color}
          strokeWidth={5}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 600ms cubic-bezier(0.4,0,0.2,1)' }}
        />
      </svg>
      <div
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 800, color, lineHeight: 1, fontFamily: 'var(--font-mono)' }}>
          {score}
        </span>
        <span style={{ fontSize: 8, color: BB.muted, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          quality
        </span>
      </div>
    </div>
  );
}

/* ── Column type pill ─────────────────────────────────────────────────── */
function TypePill({ type }: { type: string }) {
  const short = type === 'categorical' ? 'cat' : type === 'identifier' ? 'id' : type === 'numeric' ? 'num' : type.slice(0, 3);
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 7px',
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 700,
        fontFamily: 'var(--font-mono)',
        letterSpacing: '0.04em',
        background: `${getColTypeColor(type)}22`,
        color: getColTypeColor(type),
        border: `1px solid ${getColTypeColor(type)}44`,
      }}
    >
      {short}
    </span>
  );
}

/* ── Copilot Message ──────────────────────────────────────────────────── */
interface CopilotMsg {
  id:   string;
  text: string;
  type: 'info' | 'warning' | 'tip';
}

function generateCopilotMessages(
  profile: DatasetProfile | null,
  recommendations: DatasetRecommendations | null,
  _dataset: Dataset | null,
): CopilotMsg[] {
  const msgs: CopilotMsg[] = [];

  if (!profile) {
    msgs.push({ id: 'loading', type: 'info', text: 'Analyzing your dataset…' });
    return msgs;
  }

  // Target hint
  if (recommendations?.target_suggestions[0]) {
    const t = recommendations.target_suggestions[0];
    msgs.push({
      id: 'target',
      type: 'tip',
      text: `This dataset's target column is **${t.column_name}**, a ${t.suggested_task.toLowerCase()} task with ${Math.round(recommendations.problem_type_confidence * 100)}% confidence.`,
    });
  }

  // Identifier warning
  const idCol = profile.columns.find((c) => c.type === 'identifier');
  if (idCol) {
    msgs.push({
      id: 'id-col',
      type: 'warning',
      text: `**${idCol.name}** is correctly excluded as a feature. Identifier columns cause misleadingly perfect accuracy.`,
    });
  }

  // Missing values
  const missingCols = profile.columns.filter((c) => c.missing_percentage > 5);
  if (missingCols.length > 0) {
    msgs.push({
      id: 'missing',
      type: 'warning',
      text: `${missingCols.length} column${missingCols.length > 1 ? 's have' : ' has'} >5% missing values (${missingCols.map((c) => c.name).join(', ')}). Imputation recommended.`,
    });
  }

  // Readiness
  if (recommendations?.overall_readiness) {
    const ready = recommendations.overall_readiness.includes('Ready');
    msgs.push({
      id: 'readiness',
      type: ready ? 'info' : 'warning',
      text: `Dataset readiness: **${recommendations.overall_readiness}**. ${recommendations.readiness_reasoning}`,
    });
  }

  return msgs;
}

/* ── Props ────────────────────────────────────────────────────────────── */
interface DatasetProfilerPageProps {
  onShowToast: (title: string, desc?: string, type?: 'success' | 'info' | 'error') => void;
  onNavigate:  (tab: PlatformTab) => void;
}

/* ═══════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════ */
export const DatasetProfilerPage = memo(function DatasetProfilerPage({
  onShowToast,
  onNavigate,
}: DatasetProfilerPageProps) {
  const {
    dataset, selectedFeatures, selectedTarget,
    setSelectedFeatures, setSelectedTarget, loadDataset, setLifecycleStage,
  } = useProject();

  /* ── Analysis state ─────────────────────────────────────────────── */
  const [profile,         setProfile]         = useState<DatasetProfile | null>(null);
  const [health,          setHealth]          = useState<DatasetHealthReport | null>(null);
  const [recommendations, setRecommendations] = useState<DatasetRecommendations | null>(null);
  const [isAnalyzing,     setIsAnalyzing]     = useState(false);
  const [analyzeError,    setAnalyzeError]    = useState<string | null>(null);

  /* ── Training state ─────────────────────────────────────────────── */
  const [algorithm,        setAlgorithm]       = useState('Random Forest Classifier');
  const [scaler,           setScaler]          = useState('StandardScaler');
  const [imputer,          setImputer]         = useState('Median');
  const [cvFolds,          setCvFolds]         = useState(5);
  const [trainTestSplit,   setTrainTestSplit]   = useState(0.8);
  const [isLaunching,      setIsLaunching]     = useState(false);
  const [launchError,      setLaunchError]     = useState<string | null>(null);
  const [supportedAlgos,   setSupportedAlgos]  = useState<SupportedAlgorithms>({
    classification: [
      'Random Forest Classifier', 'Logistic Regression', 'Decision Tree Classifier',
      'Gradient Boosting Classifier', 'XGBoost Classifier', 'LightGBM Classifier',
      'Support Vector Machine (SVM)', 'K-Nearest Neighbors (KNN)',
      'Multi-Layer Perceptron (MLP)', 'Ridge Classifier',
    ],
    regression: [
      'Random Forest Regressor', 'Linear Regression', 'Decision Tree Regressor',
      'Gradient Boosting Regressor', 'XGBoost Regressor', 'LightGBM Regressor',
      'Support Vector Regression (SVR)', 'Ridge', 'Lasso',
    ],
  });

  /* ── Column schema expand state ─────────────────────────────────── */
  const [expandedColumns, setExpandedColumns] = useState<Set<string>>(new Set());

  /* ── Abort ref ──────────────────────────────────────────────────── */
  const abortRef = useRef<AbortController | null>(null);

  /* ── Load algos once ────────────────────────────────────────────── */
  useEffect(() => {
    const ctrl = new AbortController();
    fetchSupportedAlgorithms(ctrl.signal)
      .then((data) => {
        if (data?.classification?.length || data?.regression?.length) {
          setSupportedAlgos({ classification: data.classification || [], regression: data.regression || [] });
        }
      })
      .catch(() => {/* silent — keep defaults */});
    return () => ctrl.abort();
  }, []);

  /* ── Analyze dataset when it changes ───────────────────────────── */
  useEffect(() => {
    abortRef.current?.abort();
    if (!dataset) {
      setProfile(null); setHealth(null); setRecommendations(null);
      setIsAnalyzing(false); setAnalyzeError(null);
      return;
    }
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setIsAnalyzing(true);
    setAnalyzeError(null);

    (async () => {
      try {
        let prof: DatasetProfile | null = null;
        if (dataset.datasetId) {
          prof = await fetchDatasetProfile(dataset.datasetId, ctrl.signal).catch(() => null);
        }
        if (!prof) prof = computeClientProfile(dataset);
        if (ctrl.signal.aborted) return;
        setProfile(prof);

        let hlth: DatasetHealthReport | null = null;
        if (dataset.datasetId) {
          hlth = await fetchDatasetHealth(dataset.datasetId, ctrl.signal).catch(() => null);
        }
        if (!hlth) hlth = computeClientHealth(prof);
        if (ctrl.signal.aborted) return;
        setHealth(hlth);

        let recs: DatasetRecommendations | null = null;
        if (dataset.datasetId) {
          recs = await fetchDatasetRecommendations(dataset.datasetId, ctrl.signal).catch(() => null);
        }
        if (!recs) recs = computeClientRecommendations(prof, hlth);
        if (ctrl.signal.aborted) return;
        setRecommendations(recs);

        // Auto-select recommended target
        if (recs.target_suggestions[0] && !selectedTarget) {
          const tgt = recs.target_suggestions[0].column_name;
          const { selectedTarget: t, selectedFeatures: f } = selectTargetColumn(tgt, selectedFeatures);
          setSelectedTarget(t);
          setSelectedFeatures(f);
        }
        // Auto-select recommended algorithm
        if (recs.recommended_models[0]) {
          setAlgorithm(recs.recommended_models[0]);
        }
      } catch (err) {
        if (!ctrl.signal.aborted) {
          setAnalyzeError(err instanceof Error ? err.message : 'Analysis failed.');
        }
      } finally {
        if (!ctrl.signal.aborted) setIsAnalyzing(false);
      }
    })();

    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset]);

  /* ── Handlers ───────────────────────────────────────────────────── */
  const handleDataLoaded = useCallback((d: Dataset) => {
    loadDataset(d);
    setLifecycleStage('dataset');
    onShowToast('Dataset loaded', `${d.fileName} · ${d.rows.length} rows`, 'success');
  }, [loadDataset, setLifecycleStage, onShowToast]);

  const handleFeatureToggle = useCallback((col: string) => {
    setSelectedFeatures(toggleFeatureColumn(selectedFeatures, col, selectedTarget));
  }, [selectedFeatures, selectedTarget, setSelectedFeatures]);

  const handleTargetChange = useCallback((col: string) => {
    const next = selectTargetColumn(col, selectedFeatures);
    setSelectedTarget(next.selectedTarget);
    setSelectedFeatures(next.selectedFeatures);
  }, [selectedFeatures, setSelectedTarget, setSelectedFeatures]);

  const handleLaunch = useCallback(async () => {
    setLaunchError(null);
    if (!dataset)          { setLaunchError('No dataset loaded.'); return; }
    if (!selectedTarget)   { setLaunchError('Select a target column first.'); return; }
    if (selectedFeatures.length === 0) { setLaunchError('Select at least one feature column.'); return; }
    if (selectedFeatures.includes(selectedTarget)) {
      setLaunchError(`Target column "${selectedTarget}" cannot be a feature.`); return;
    }

    setIsLaunching(true);
    try {
      const payload: TrainingRequestPayload = {
        dataset_id:     dataset.datasetId || `client-${dataset.fileName}`,
        target_column:  selectedTarget,
        feature_columns: selectedFeatures,
        algorithm,
        train_test_split: trainTestSplit,
        random_seed:    42,
        cross_validation: cvFolds,
        normalization:  scaler === 'StandardScaler',
        feature_selection: 'all',
        notes: '',
      };
      await createTrainingJob(payload);
      onShowToast('Training job queued', `${algorithm} · ${selectedFeatures.length} features → ${selectedTarget}`, 'success');
      onNavigate('code-studio');
    } catch (err) {
      setLaunchError(err instanceof Error ? err.message : 'Launch failed.');
      onShowToast('Launch failed', err instanceof Error ? err.message : 'See error below.', 'error');
    } finally {
      setIsLaunching(false);
    }
  }, [dataset, selectedTarget, selectedFeatures, algorithm, trainTestSplit, cvFolds, scaler, onShowToast, onNavigate]);

  /* ── Derived ────────────────────────────────────────────────────── */
  const qualityScore = profile ? computeQualityScore(profile) : null;
  const allColumns   = dataset?.columns || [];
  const numericSet   = dataset ? new Set(getNumericColumns(dataset.columns, dataset.rows)) : new Set<string>();

  const copilotMsgs  = generateCopilotMessages(profile, recommendations, dataset);

  const issueCount   = (health?.issues || []).filter((i) => i.severity !== 'info').length;

  /* ── Column is identifier (excluded from training) ──────────────── */
  const isIdentifier = (col: string) => {
    const cp = profile?.columns.find((c) => c.name === col);
    return cp?.type === 'identifier';
  };

  /* ═══════════════════════════════════════════════════════════════
     RENDER — upload state
     ═══════════════════════════════════════════════════════════════ */
  if (!dataset) {
    return (
      <div style={{ padding: '0 0 24px' }}>
        <DataUpload onDataLoaded={handleDataLoaded} />
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════════
     RENDER — dataset loaded (4-panel layout)
     ═══════════════════════════════════════════════════════════════ */
  const rowCount    = dataset.rowCount ?? dataset.rows.length;
  const colCount    = dataset.columns.length;
  const fileSize    = profile ? formatBytes(profile.memory_usage_bytes) : '—';

  return (
    <div
      style={{
        display:   'flex',
        flexDirection: 'column',
        gap:       0,
        fontFamily: 'var(--font-ui)',
        color:     BB.text,
        minHeight: 0,
      }}
    >
      {/* ─────────────────────────────────────────────────────────────
          HEADER BAR
          ───────────────────────────────────────────────────────────── */}
      <div
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          padding:        '12px 0 14px',
          gap:            12,
          flexWrap:       'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Database style={{ width: 16, height: 16, color: BB.primaryLight }} />
          <span style={{ fontSize: 15, fontWeight: 700, color: BB.text }}>
            Dataset &amp; profiler
          </span>
          <span style={{ color: BB.disabled }}>—</span>
          <span style={{ fontSize: 13, color: BB.muted, fontFamily: 'var(--font-mono)' }}>
            {dataset.fileName}
          </span>
          <span style={{ fontSize: 11, color: BB.disabled }}>·</span>
          <span style={{ fontSize: 11, color: BB.muted }}>{rowCount} rows</span>
          <span style={{ fontSize: 11, color: BB.disabled }}>·</span>
          <span style={{ fontSize: 11, color: BB.muted }}>{colCount} columns</span>
          <span style={{ fontSize: 11, color: BB.disabled }}>·</span>
          <span style={{ fontSize: 11, color: BB.muted }}>{fileSize}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {isAnalyzing && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: BB.muted }}>
              <Loader2 style={{ width: 13, height: 13, animation: 'spin 1s linear infinite' }} />
              Analyzing…
            </div>
          )}
          {qualityScore !== null && <QualityRing score={qualityScore} />}
          <button
            onClick={() => { loadDataset(null as any); }}
            title="Upload a different dataset"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px',
              borderRadius: '6px 6px 0 6px',
              border: `1px solid ${BB.border}`,
              background: 'transparent',
              color: BB.muted,
              fontSize: 11,
              cursor: 'pointer',
              fontFamily: 'var(--font-ui)',
              transition: 'all 150ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = BB.primaryLight; e.currentTarget.style.color = BB.text; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = BB.border; e.currentTarget.style.color = BB.muted; }}
          >
            <Upload style={{ width: 12, height: 12 }} />
            New dataset
          </button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          MAIN GRID: 4 panels + Copilot
          ───────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>

        {/* ──────────────── LEFT+CENTRE: 2×2 panel grid ──────────── */}
        <div style={{ flex: 1, minWidth: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

          {/* Panel 1 — Overview & Quality ──────────────────────────── */}
          <div
            style={{
              background: BB.surface,
              border:     `1px solid ${BB.border}`,
              borderRadius: 12,
              padding:    '16px 18px',
              display:    'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: BB.muted }}>
                Overview &amp; quality
              </span>
              {issueCount > 0 && (
                <span
                  style={{
                    fontSize: 10, fontWeight: 700,
                    padding: '2px 8px', borderRadius: 20,
                    background: 'rgba(178,58,78,0.15)',
                    color: BB.maroonLight,
                    border: '1px solid rgba(178,58,78,0.25)',
                  }}
                >
                  {issueCount} issue{issueCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            {analyzeError ? (
              <div style={{ fontSize: 12, color: BB.maroonLight, display: 'flex', gap: 8 }}>
                <AlertCircle style={{ width: 14, height: 14, flexShrink: 0, marginTop: 1 }} />
                {analyzeError}
              </div>
            ) : isAnalyzing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[60, 80, 45].map((w, i) => (
                  <div key={i} style={{ height: 10, width: `${w}%`, borderRadius: 4, background: BB.elevated, animation: 'pulse 1.5s ease infinite' }} />
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {/* Quality issues */}
                {health?.issues
                  .filter((i) => i.severity !== 'info')
                  .slice(0, 4)
                  .map((issue, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, fontSize: 11 }}>
                      {issue.severity === 'critical' || issue.severity === 'high' ? (
                        <AlertTriangle style={{ width: 12, height: 12, color: BB.maroonLight, flexShrink: 0, marginTop: 1 }} />
                      ) : (
                        <AlertCircle style={{ width: 12, height: 12, color: BB.gold, flexShrink: 0, marginTop: 1 }} />
                      )}
                      <span style={{ color: BB.muted, lineHeight: 1.5 }}>{issue.message}</span>
                    </div>
                  ))}

                {health?.issues.length === 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11 }}>
                    <CheckCircle2 style={{ width: 12, height: 12, color: BB.success, flexShrink: 0 }} />
                    <span style={{ color: BB.success }}>No issues detected.</span>
                  </div>
                )}

                {/* Next Best Action */}
                {health?.recommendations && health.recommendations.length > 0 && (
                  <>
                    <div style={{ fontSize: 10, fontWeight: 700, color: BB.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 8 }}>
                      Next best action
                    </div>
                    {health.recommendations.slice(0, 2).map((rec, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, fontSize: 11 }}>
                        <span style={{ color: BB.primaryLight, flexShrink: 0 }}>→</span>
                        <span style={{ color: BB.muted, lineHeight: 1.5 }}>{rec}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Panel 2 — Column Schema Table ────────────────────────── */}
          <div
            style={{
              background: BB.surface,
              border:     `1px solid ${BB.border}`,
              borderRadius: 12,
              overflow:   'hidden',
              display:    'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                padding: '14px 18px 10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: `1px solid ${BB.border}`,
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: BB.muted }}>
                Column schema
              </span>
              <span style={{ fontSize: 11, color: BB.muted }}>{colCount} columns</span>
            </div>

            <div style={{ overflowY: 'auto', maxHeight: 280 }}>
              {/* Header row */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 56px 60px 52px',
                  padding: '6px 18px',
                  gap: 8,
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: BB.disabled,
                  borderBottom: `1px solid ${BB.border}`,
                }}
              >
                <span>Column</span>
                <span>Type</span>
                <span style={{ textAlign: 'right' }}>Missing</span>
                <span style={{ textAlign: 'right' }}>Unique</span>
              </div>

              {/* Data rows */}
              {(profile?.columns || allColumns.map((name) => ({ name, type: numericSet.has(name) ? 'numeric' : 'categorical', missing: 0, missing_percentage: 0, unique: 0 } as Partial<ColumnProfile>))).map((col: any, idx: number) => {
                const isExpanded = expandedColumns.has(col.name);
                return (
                  <div key={col.name}>
                    <div
                      onClick={() => {
                        if (!profile) return;
                        const next = new Set(expandedColumns);
                        if (isExpanded) next.delete(col.name); else next.add(col.name);
                        setExpandedColumns(next);
                      }}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 56px 60px 52px',
                        padding: '7px 18px',
                        gap: 8,
                        alignItems: 'center',
                        fontSize: 11,
                        cursor: profile ? 'pointer' : 'default',
                        background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                        transition: 'background 100ms',
                        borderBottom: `1px solid ${BB.border}`,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(107,92,166,0.06)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)'; }}
                    >
                      <span style={{ color: BB.text, fontFamily: 'var(--font-mono)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {col.name}
                      </span>
                      <TypePill type={col.type || 'text'} />
                      <span style={{ textAlign: 'right', color: (col.missing_percentage ?? 0) > 5 ? BB.gold : BB.muted, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                        {(col.missing_percentage ?? 0) > 0 ? `${Math.round(col.missing_percentage)}%` : '0%'}
                      </span>
                      <span style={{ textAlign: 'right', color: BB.muted, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                        {col.unique ?? '—'}
                      </span>
                    </div>
                    {/* Expanded stats */}
                    {isExpanded && profile && (
                      <div
                        style={{
                          padding: '8px 18px 10px 36px',
                          background: BB.elevated,
                          borderBottom: `1px solid ${BB.border}`,
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: '6px 20px',
                          fontSize: 11,
                          color: BB.muted,
                        }}
                      >
                        {col.statistics?.mean     !== undefined && <span>mean: <b style={{ color: BB.text }}>{col.statistics.mean?.toFixed(2)}</b></span>}
                        {col.statistics?.std      !== undefined && <span>std: <b style={{ color: BB.text }}>{col.statistics.std?.toFixed(2)}</b></span>}
                        {col.statistics?.min      !== undefined && <span>min: <b style={{ color: BB.text }}>{col.statistics.min?.toFixed(2)}</b></span>}
                        {col.statistics?.max      !== undefined && <span>max: <b style={{ color: BB.text }}>{col.statistics.max?.toFixed(2)}</b></span>}
                        {col.statistics?.most_frequent_value !== undefined && (
                          <span>top: <b style={{ color: BB.text }}>{col.statistics.most_frequent_value}</b></span>
                        )}
                        {col.duplicate_count > 0 && <span style={{ color: BB.gold }}>dupes: {col.duplicate_count}</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Panel 3 — Feature & Target Selection ─────────────────── */}
          <div
            style={{
              background: BB.surface,
              border:     `1px solid ${BB.border}`,
              borderRadius: 12,
              padding:    '16px 18px',
              display:    'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: BB.muted }}>
                Feature &amp; target selection
              </span>
              <span style={{ fontSize: 11, color: BB.muted }}>
                {selectedFeatures.length} feat · {selectedTarget ? '1 target' : '0 target'}
              </span>
            </div>

            <div style={{ overflowY: 'auto', maxHeight: 260, display: 'flex', flexDirection: 'column', gap: 3 }}>
              {allColumns.map((col) => {
                const isFeature    = selectedFeatures.includes(col);
                const isTarget     = selectedTarget === col;
                const isId         = isIdentifier(col);
                const colType      = profile?.columns.find((c) => c.name === col)?.type ?? (numericSet.has(col) ? 'numeric' : 'categorical');
                const excluded     = isId;

                return (
                  <div
                    key={col}
                    style={{
                      display:     'grid',
                      gridTemplateColumns: '20px 1fr 20px',
                      alignItems:  'center',
                      gap:         10,
                      padding:     '7px 10px',
                      borderRadius: 7,
                      background:  isTarget
                        ? 'rgba(110,20,35,0.18)'
                        : isFeature
                          ? 'rgba(75,59,124,0.12)'
                          : 'transparent',
                      border: `1px solid ${
                        isTarget  ? 'rgba(110,20,35,0.35)' :
                        isFeature ? 'rgba(107,92,166,0.25)' :
                        'transparent'
                      }`,
                      opacity: excluded ? 0.4 : 1,
                      transition: 'all 150ms',
                    }}
                  >
                    {/* Feature checkbox */}
                    <input
                      type="checkbox"
                      checked={isFeature}
                      disabled={excluded || isTarget}
                      onChange={() => !excluded && handleFeatureToggle(col)}
                      style={{ width: 14, height: 14, accentColor: BB.primaryLight, cursor: excluded || isTarget ? 'not-allowed' : 'pointer' }}
                    />

                    {/* Column info */}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: isTarget ? BB.maroonLight : BB.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {col}
                      </div>
                      <div style={{ fontSize: 10, color: BB.muted, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <TypePill type={colType} />
                        {isId && <span style={{ color: BB.disabled }}>excluded</span>}
                        {isTarget && <span style={{ color: BB.maroonLight, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>target</span>}
                      </div>
                    </div>

                    {/* Target radio */}
                    <input
                      type="radio"
                      name="target-col"
                      checked={isTarget}
                      disabled={excluded}
                      onChange={() => !excluded && handleTargetChange(col)}
                      style={{ width: 14, height: 14, accentColor: BB.maroon, cursor: excluded ? 'not-allowed' : 'pointer' }}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Panel 4 — Training Setup ──────────────────────────────── */}
          <div
            style={{
              background: BB.surface,
              border:     `1px solid ${BB.border}`,
              borderRadius: 12,
              padding:    '16px 18px',
              display:    'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: BB.muted }}>
              Training setup
            </span>

            {/* Dropdowns row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {/* Algorithm */}
              <div>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: BB.disabled, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>
                  Algorithm
                </label>
                <select
                  value={algorithm}
                  onChange={(e) => setAlgorithm(e.target.value)}
                  style={{
                    width: '100%', padding: '7px 10px',
                    borderRadius: 7, border: `1px solid ${BB.border}`,
                    background: BB.elevated, color: BB.text,
                    fontSize: 11, fontFamily: 'var(--font-ui)',
                    cursor: 'pointer', outline: 'none',
                  }}
                >
                  {supportedAlgos.classification.map((a) => <option key={a} value={a}>{a}</option>)}
                  <optgroup label="Regression">
                    {supportedAlgos.regression.map((a) => <option key={a} value={a}>{a}</option>)}
                  </optgroup>
                </select>
              </div>

              {/* Feature Scaler */}
              <div>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: BB.disabled, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>
                  Feature Scaler
                </label>
                <select
                  value={scaler}
                  onChange={(e) => setScaler(e.target.value)}
                  style={{
                    width: '100%', padding: '7px 10px',
                    borderRadius: 7, border: `1px solid ${BB.border}`,
                    background: BB.elevated, color: BB.text,
                    fontSize: 11, fontFamily: 'var(--font-ui)',
                    cursor: 'pointer', outline: 'none',
                  }}
                >
                  <option>StandardScaler</option>
                  <option>MinMaxScaler</option>
                  <option>RobustScaler</option>
                  <option>None</option>
                </select>
              </div>

              {/* Missing Imputer */}
              <div>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: BB.disabled, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>
                  Missing Imputer
                </label>
                <select
                  value={imputer}
                  onChange={(e) => setImputer(e.target.value)}
                  style={{
                    width: '100%', padding: '7px 10px',
                    borderRadius: 7, border: `1px solid ${BB.border}`,
                    background: BB.elevated, color: BB.text,
                    fontSize: 11, fontFamily: 'var(--font-ui)',
                    cursor: 'pointer', outline: 'none',
                  }}
                >
                  <option>Median</option>
                  <option>Mean</option>
                  <option>Most Frequent</option>
                  <option>Constant (0)</option>
                  <option>Drop Rows</option>
                </select>
              </div>

              {/* CV Folds */}
              <div>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: BB.disabled, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>
                  CV Folds
                </label>
                <input
                  type="number"
                  min={2} max={20}
                  value={cvFolds}
                  onChange={(e) => setCvFolds(parseInt(e.target.value) || 5)}
                  style={{
                    width: '100%', padding: '7px 10px',
                    borderRadius: 7, border: `1px solid ${BB.border}`,
                    background: BB.elevated, color: BB.text,
                    fontSize: 11, fontFamily: 'var(--font-mono)',
                    outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            {/* Train/test split slider */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={{ fontSize: 10, fontWeight: 700, color: BB.disabled, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Train / test split
                </label>
                <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: BB.primaryLight }}>
                  {Math.round(trainTestSplit * 100)} / {Math.round((1 - trainTestSplit) * 100)}
                </span>
              </div>
              <input
                type="range" min={0.5} max={0.95} step={0.05}
                value={trainTestSplit}
                onChange={(e) => setTrainTestSplit(parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: BB.maroon, cursor: 'pointer' }}
              />
            </div>

            {/* Launch error */}
            {launchError && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', borderRadius: 8, background: 'rgba(110,20,35,0.15)', border: '1px solid rgba(178,58,78,0.3)', fontSize: 11, color: BB.maroonLight }}>
                <AlertCircle style={{ width: 14, height: 14, flexShrink: 0, marginTop: 1 }} />
                {launchError}
              </div>
            )}

            {/* Debug info before launch */}
            <div style={{ fontSize: 10, color: BB.disabled }}>
              Target: <strong style={{ color: selectedTarget ? BB.text : BB.disabled }}>{selectedTarget || 'None'}</strong>
              {' · '}Input matrix: <strong style={{ color: selectedFeatures.length > 0 ? BB.text : BB.maroonLight }}>{selectedFeatures.length} columns</strong>
            </div>

            {/* LAUNCH BUTTON */}
            <button
              onClick={handleLaunch}
              disabled={isLaunching || !selectedTarget || selectedFeatures.length === 0}
              style={{
                width: '100%',
                padding: '12px 0',
                borderRadius: '8px 8px 0 8px',
                border: 'none',
                background: isLaunching || !selectedTarget || selectedFeatures.length === 0
                  ? BB.disabled
                  : `linear-gradient(135deg, ${BB.maroon} 0%, #A01830 100%)`,
                color: BB.text,
                fontSize: 13,
                fontWeight: 700,
                cursor: isLaunching || !selectedTarget || selectedFeatures.length === 0 ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--font-ui)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                transition: 'opacity 150ms',
                boxShadow: isLaunching || !selectedTarget ? 'none' : '0 4px 16px rgba(110,20,35,0.35)',
                letterSpacing: '0.02em',
              }}
              onMouseEnter={(e) => { if (!isLaunching && selectedTarget && selectedFeatures.length > 0) e.currentTarget.style.opacity = '0.9'; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
            >
              {isLaunching ? (
                <><Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} /> Launching…</>
              ) : (
                'Launch training job →'
              )}
            </button>
          </div>
        </div>

        {/* ──────────────── RIGHT: AI Copilot ────────────────────── */}
        <div
          style={{
            width:        360,
            flexShrink:   0,
            background:   BB.surface,
            border:       `1px solid ${BB.border}`,
            borderRadius: 12,
            overflow:     'hidden',
            display:      'flex',
            flexDirection: 'column',
            alignSelf:    'stretch',
          }}
        >
          {/* Copilot header */}
          <div
            style={{
              padding:         '12px 16px',
              borderBottom:    `1px solid ${BB.border}`,
              display:         'flex',
              alignItems:      'center',
              gap:             8,
              background:      BB.elevated,
            }}
          >
            <div
              style={{
                width: 24, height: 24,
                borderRadius: '50%',
                background: `linear-gradient(135deg, ${BB.primary}, ${BB.maroon})`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12,
              }}
            >
              ✦
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: BB.text }}>Copilot</span>
            <span
              style={{
                marginLeft: 'auto',
                fontSize: 10, fontWeight: 600,
                padding: '2px 8px', borderRadius: 20,
                background: 'rgba(75,59,124,0.20)',
                color: BB.primaryLight,
                border: `1px solid rgba(107,92,166,0.30)`,
              }}
            >
              Dataset &amp; Profiler
            </span>
          </div>

          {/* Copilot messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {copilotMsgs.map((msg) => (
              <div
                key={msg.id}
                style={{
                  padding:    '10px 12px',
                  borderRadius: '8px 8px 8px 0',
                  background: msg.type === 'warning'
                    ? 'rgba(245,158,11,0.08)'
                    : 'rgba(75,59,124,0.10)',
                  border: `1px solid ${
                    msg.type === 'warning'
                      ? 'rgba(245,158,11,0.20)'
                      : 'rgba(107,92,166,0.18)'
                  }`,
                  fontSize: 12,
                  color:    BB.muted,
                  lineHeight: 1.6,
                }}
              >
                {/* Render **bold** segments inline */}
                {msg.text.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
                  part.startsWith('**') && part.endsWith('**')
                    ? <strong key={i} style={{ color: BB.text }}>{part.slice(2, -2)}</strong>
                    : part
                )}
              </div>
            ))}

            {/* Placeholder when nothing loaded */}
            {copilotMsgs.length === 0 && !isAnalyzing && (
              <div style={{ color: BB.disabled, fontSize: 12, textAlign: 'center', padding: '24px 0' }}>
                Upload a dataset to get AI analysis.
              </div>
            )}
          </div>

          {/* Copilot input stub */}
          <div style={{ padding: '10px 14px', borderTop: `1px solid ${BB.border}` }}>
            <input
              placeholder="Ask about this dataset…"
              disabled
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: 7,
                border: `1px solid ${BB.border}`,
                background: BB.elevated,
                color: BB.muted,
                fontSize: 11,
                fontFamily: 'var(--font-ui)',
                outline: 'none',
                boxSizing: 'border-box',
                cursor: 'not-allowed',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
});
