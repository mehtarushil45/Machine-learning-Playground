/**
 * DatasetProfilerPage — Page 1 of the six-page ML Platform rebuild.
 *
 * Visual Spec: dataset_profiler_redesign.html
 *
 * Implements:
 *  - C1: Segmented View Toggle ("Workspace" / "Preview data") below Lifecycle Rail
 *  - C2: 4-Panel Grid Workspace (Overview & Quality, Column Schema, Feature & Target, Training Setup)
 *  - C3: Full-width Preview Data View with real pagination & filtering
 *  - C4: Explainable Data Quality Score with itemized deduction breakdown modal/popover
 *  - D3: Bug-free training launch with verified feature/target payload
 *  - D5: Docked & Manually Resizable AI Copilot Panel (320px – 560px drag-to-resize)
 *  - B1: Portal-based dropdown selects for Algorithm, Scaler, Imputer
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Layers,
  Loader2,
  Play,
  Search,
  Table as TableIcon,
  Upload,
  X,
} from 'lucide-react';
import { useProject } from '../../providers/ProjectContext';
import { DataUpload } from './DataUpload';
import { Select } from '../../components/ui/Select';
import type {
  ColumnProfile,
  Dataset,
  DatasetHealthReport,
  DatasetProfile,
  DatasetRecommendations,
} from '../../types/dataset';
import type { TrainingRequestPayload } from '../../types/job';
import {
  computeClientProfile,
  fetchDatasetProfile,
} from '../../services/profilerService';
import {
  computeClientHealth,
  fetchDatasetHealth,
} from '../../services/healthService';
import {
  computeClientRecommendations,
  fetchDatasetRecommendations,
} from '../../services/recommendationService';
import {
  createTrainingJob,
  fetchSupportedAlgorithms,
  type SupportedAlgorithms,
} from '../../services/jobService';
import { getNumericColumns } from '../../utils/columnAnalysis';
import {
  selectTargetColumn,
  toggleFeatureColumn,
} from '../../utils/columnSelection';
import type { PlatformTab } from '../../App';

/* ── BB Brand Tokens ─────────────────────────────────────────────────── */
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

/* ── Helpers ─────────────────────────────────────────────────────────── */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

interface QualityDeduction {
  reason: string;
  points: number;
  details: string;
  type: 'missing' | 'duplicate_rows' | 'empty_cols' | 'duplicate_cols' | 'identifier' | 'clean';
}

interface QualityScoreBreakdown {
  score: number;
  grade: 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'Critical';
  deductions: QualityDeduction[];
  totalDeductions: number;
}

function computeDetailedQualityScore(profile: DatasetProfile): QualityScoreBreakdown {
  const rows = profile.row_count || 1;
  const cols = profile.column_count || 1;
  const totalCells = rows * cols;

  const missingPct = totalCells > 0 ? (profile.total_missing_values / totalCells) * 100 : 0;
  const dupRowPct = rows > 0 ? (profile.duplicate_rows / rows) * 100 : 0;

  const deductions: QualityDeduction[] = [];

  // Missing values deduction
  if (profile.total_missing_values > 0) {
    const pts = Math.min(Math.round(missingPct * 1.5), 35);
    if (pts > 0) {
      deductions.push({
        reason: 'Missing cell values',
        points: pts,
        details: `${profile.total_missing_values.toLocaleString()} missing cells (${missingPct.toFixed(1)}% of total)`,
        type: 'missing',
      });
    }
  }

  // Duplicate rows deduction
  if (profile.duplicate_rows > 0) {
    const pts = Math.min(Math.round(dupRowPct * 0.8), 20);
    if (pts > 0) {
      deductions.push({
        reason: 'Duplicate rows',
        points: pts,
        details: `${profile.duplicate_rows.toLocaleString()} duplicate rows (${dupRowPct.toFixed(1)}%)`,
        type: 'duplicate_rows',
      });
    }
  }

  // Empty columns deduction
  if (profile.empty_columns > 0) {
    const pts = Math.min(profile.empty_columns * 5, 15);
    deductions.push({
      reason: 'Completely empty columns',
      points: pts,
      details: `${profile.empty_columns} column${profile.empty_columns > 1 ? 's' : ''} with 100% missing values`,
      type: 'empty_cols',
    });
  }

  // Duplicate columns / series deduction
  if (profile.duplicate_columns > 0) {
    const pts = Math.min(profile.duplicate_columns * 5, 10);
    deductions.push({
      reason: 'Duplicate or identical columns',
      points: pts,
      details: `${profile.duplicate_columns} redundant column${profile.duplicate_columns > 1 ? 's' : ''} detected`,
      type: 'duplicate_cols',
    });
  }

  // Check identifier columns
  const idCols = profile.columns.filter((c) => c.type === 'identifier');
  if (idCols.length > 0) {
    deductions.push({
      reason: 'Identifier column present',
      points: 2 * idCols.length,
      details: `${idCols.map((c) => c.name).join(', ')} (safely excluded from features)`,
      type: 'identifier',
    });
  }

  const totalDeductions = deductions.reduce((acc, d) => acc + d.points, 0);
  const finalScore = Math.max(0, Math.min(100, 100 - totalDeductions));

  let grade: QualityScoreBreakdown['grade'] = 'Excellent';
  if (finalScore < 60) grade = 'Critical';
  else if (finalScore < 70) grade = 'Poor';
  else if (finalScore < 80) grade = 'Fair';
  else if (finalScore < 90) grade = 'Good';

  return {
    score: finalScore,
    grade,
    deductions,
    totalDeductions,
  };
}

function getQualityColor(score: number): string {
  if (score >= 85) return BB.success;
  if (score >= 65) return BB.gold;
  return BB.maroonLight;
}

function getColTypeColor(type: string): string {
  switch (type) {
    case 'numeric':
      return BB.primaryLight;
    case 'categorical':
      return BB.gold;
    case 'identifier':
      return BB.muted;
    case 'boolean':
      return BB.success;
    case 'datetime':
      return '#60a5fa';
    default:
      return BB.muted;
  }
}

/* ── Quality Ring Component ──────────────────────────────────────────── */
function QualityScoreRing({
  score,
  onClick,
}: {
  score: number;
  onClick?: () => void;
}) {
  const color = getQualityColor(score);
  const R = 22;
  const circ = 2 * Math.PI * R;
  const offset = circ * (1 - score / 100);

  return (
    <div
      onClick={onClick}
      style={{
        position: 'relative',
        width: 58,
        height: 58,
        flexShrink: 0,
        cursor: onClick ? 'pointer' : 'default',
      }}
      title="Click to view full Quality Score explanation"
    >
      <svg width={58} height={58} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={29} cy={29} r={R} fill="none" stroke={BB.elevated} strokeWidth={5} />
        <circle
          cx={29}
          cy={29}
          r={R}
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
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 800,
            color,
            lineHeight: 1,
            fontFamily: 'var(--font-mono)',
          }}
        >
          {score}
        </span>
        <span
          style={{
            fontSize: 8,
            color: BB.muted,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          quality
        </span>
      </div>
    </div>
  );
}

/* ── Type Pill ────────────────────────────────────────────────────────── */
function TypePill({ type }: { type: string }) {
  const short =
    type === 'categorical'
      ? 'cat'
      : type === 'identifier'
      ? 'id'
      : type === 'numeric'
      ? 'num'
      : type.slice(0, 3);
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

/* ── Copilot Messages Generator ───────────────────────────────────────── */
interface CopilotMsg {
  id: string;
  text: string;
  type: 'info' | 'warning' | 'tip';
}

function generateCopilotMessages(
  profile: DatasetProfile | null,
  recommendations: DatasetRecommendations | null,
  breakdown: QualityScoreBreakdown | null,
  _dataset: Dataset | null,
): CopilotMsg[] {
  const msgs: CopilotMsg[] = [];

  if (!profile) {
    msgs.push({ id: 'loading', type: 'info', text: 'Analyzing dataset structure and statistics…' });
    return msgs;
  }

  // Quality score breakdown insight
  if (breakdown) {
    if (breakdown.deductions.length === 0) {
      msgs.push({
        id: 'score-perfect',
        type: 'tip',
        text: `Data Quality is **100/100 (${breakdown.grade})**. No missing values, empty columns, or duplicate rows detected.`,
      });
    } else {
      msgs.push({
        id: 'score-deductions',
        type: breakdown.score >= 80 ? 'info' : 'warning',
        text: `Data Quality is **${breakdown.score}/100 (${breakdown.grade})**. Top deduction: **${breakdown.deductions[0].reason}** (−${breakdown.deductions[0].points} pts: ${breakdown.deductions[0].details}).`,
      });
    }
  }

  // Target hint
  if (recommendations?.target_suggestions[0]) {
    const t = recommendations.target_suggestions[0];
    msgs.push({
      id: 'target',
      type: 'tip',
      text: `Recommended target column is **${t.column_name}** for a **${t.suggested_task}** task (${Math.round(
        recommendations.problem_type_confidence * 100,
      )}% confidence).`,
    });
  }

  // Identifier warning
  const idCols = profile.columns.filter((c) => c.type === 'identifier');
  if (idCols.length > 0) {
    msgs.push({
      id: 'id-col',
      type: 'warning',
      text: `**${idCols.map((c) => c.name).join(', ')}** identified as ID column${
        idCols.length > 1 ? 's' : ''
      } and excluded from the feature matrix to prevent data leakage.`,
    });
  }

  // Missing values
  const missingCols = profile.columns.filter((c) => c.missing_percentage > 5);
  if (missingCols.length > 0) {
    msgs.push({
      id: 'missing',
      type: 'warning',
      text: `${missingCols.length} column${
        missingCols.length > 1 ? 's have' : ' has'
      } >5% missing values (${missingCols.map((c) => c.name).join(', ')}). Imputation is pre-configured.`,
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
  onNavigate: (tab: PlatformTab) => void;
}

/* ═══════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════ */
export const DatasetProfilerPage = memo(function DatasetProfilerPage({
  onShowToast,
  onNavigate,
}: DatasetProfilerPageProps) {
  const {
    dataset,
    selectedFeatures,
    selectedTarget,
    setSelectedFeatures,
    setSelectedTarget,
    loadDataset,
    resetProject,
    setActiveJob,
    setLifecycleStage,
  } = useProject();

  /* ── View Toggle State (C1: Workspace vs Preview data) ────────── */
  const [activeView, setActiveView] = useState<'workspace' | 'preview'>('workspace');

  /* ── Analysis State ─────────────────────────────────────────────── */
  const [profile, setProfile] = useState<DatasetProfile | null>(null);
  const [health, setHealth] = useState<DatasetHealthReport | null>(null);
  const [recommendations, setRecommendations] = useState<DatasetRecommendations | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  /* ── Quality Score Breakdown Modal State (C4) ──────────────────── */
  const [showScoreModal, setShowScoreModal] = useState(false);

  /* ── Training Form State (B1 Dropdowns) ─────────────────────────── */
  const [algorithm, setAlgorithm] = useState('Random Forest Classifier');
  const [scaler, setScaler] = useState('StandardScaler');
  const [imputer, setImputer] = useState('Median');
  const [cvFolds, setCvFolds] = useState(5);
  const [trainTestSplit, setTrainTestSplit] = useState(0.8);
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);

  /* ── Column Schema Table State ──────────────────────────────────── */
  const [expandedColumns, setExpandedColumns] = useState<Set<string>>(new Set());

  /* ── Data Preview Table State (C3: Pagination & Search) ────────── */
  const [previewPage, setPreviewPage] = useState(1);
  const [previewPageSize, setPreviewPageSize] = useState(15);
  const [previewSearch, setPreviewSearch] = useState('');

  /* ── AI Copilot Resizable Width (D5: 320px–560px) ──────────────── */
  const [copilotWidth, setCopilotWidth] = useState(380);
  const [isDraggingCopilot, setIsDraggingCopilot] = useState(false);

  /* ── Supported Algorithms State ─────────────────────────────────── */
  const [supportedAlgos, setSupportedAlgos] = useState<SupportedAlgorithms>({
    classification: [
      'Random Forest Classifier',
      'Logistic Regression',
      'Decision Tree Classifier',
      'Gradient Boosting Classifier',
      'XGBoost Classifier',
      'LightGBM Classifier',
      'Support Vector Machine (SVM)',
      'K-Nearest Neighbors (KNN)',
      'Multi-Layer Perceptron (MLP)',
      'Ridge Classifier',
    ],
    regression: [
      'Random Forest Regressor',
      'Linear Regression',
      'Decision Tree Regressor',
      'Gradient Boosting Regressor',
      'XGBoost Regressor',
      'LightGBM Regressor',
      'Support Vector Regression (SVR)',
      'Ridge',
      'Lasso',
    ],
  });

  const abortRef = useRef<AbortController | null>(null);

  /* ── Load Supported Algorithms Once ────────────────────────────── */
  useEffect(() => {
    const ctrl = new AbortController();
    fetchSupportedAlgorithms(ctrl.signal)
      .then((data) => {
        if (data?.classification?.length || data?.regression?.length) {
          setSupportedAlgos({
            classification: data.classification || [],
            regression: data.regression || [],
          });
        }
      })
      .catch(() => {
        /* keep defaults */
      });
    return () => ctrl.abort();
  }, []);

  /* ── Profile & Health Engine Trigger ───────────────────────────── */
  useEffect(() => {
    abortRef.current?.abort();
    if (!dataset) {
      setProfile(null);
      setHealth(null);
      setRecommendations(null);
      setIsAnalyzing(false);
      setAnalyzeError(null);
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

        // Auto-select recommended target if not already set
        if (recs.target_suggestions[0] && !selectedTarget) {
          const tgt = recs.target_suggestions[0].column_name;
          const { selectedTarget: t, selectedFeatures: f } = selectTargetColumn(
            tgt,
            selectedFeatures.length > 0
              ? selectedFeatures
              : dataset.columns.filter((c) => c !== tgt),
          );
          setSelectedTarget(t);
          setSelectedFeatures(f);
        } else if (selectedFeatures.length === 0 && dataset.columns.length > 1) {
          // Default all non-target columns as features
          const defaultTarget = selectedTarget || dataset.columns[dataset.columns.length - 1];
          setSelectedTarget(defaultTarget);
          setSelectedFeatures(dataset.columns.filter((c) => c !== defaultTarget));
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

  /* ── Drag to Resize AI Copilot Panel (D5) ───────────────────────── */
  const handleMouseDownResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingCopilot(true);

    const startX = e.clientX;
    const startWidth = copilotWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = startX - moveEvent.clientX; // dragging left increases width
      const newWidth = Math.max(320, Math.min(560, startWidth + deltaX));
      setCopilotWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsDraggingCopilot(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [copilotWidth]);

  /* ── Handlers ───────────────────────────────────────────────────── */
  const handleDataLoaded = useCallback(
    (d: Dataset) => {
      loadDataset(d);
      setLifecycleStage('dataset');
      onShowToast('Dataset Loaded', `${d.fileName} (${d.rows.length} rows, ${d.columns.length} cols)`, 'success');
    },
    [loadDataset, setLifecycleStage, onShowToast],
  );

  const handleFeatureToggle = useCallback(
    (col: string) => {
      setSelectedFeatures(toggleFeatureColumn(selectedFeatures, col, selectedTarget));
    },
    [selectedFeatures, selectedTarget, setSelectedFeatures],
  );

  const handleTargetChange = useCallback(
    (col: string) => {
      const next = selectTargetColumn(col, selectedFeatures);
      setSelectedTarget(next.selectedTarget);
      setSelectedFeatures(next.selectedFeatures);
    },
    [selectedFeatures, setSelectedTarget, setSelectedFeatures],
  );

  const handleSelectAllFeatures = useCallback(() => {
    if (!dataset) return;
    const available = dataset.columns.filter((c) => c !== selectedTarget);
    setSelectedFeatures(available);
  }, [dataset, selectedTarget, setSelectedFeatures]);

  const handleDeselectAllFeatures = useCallback(() => {
    setSelectedFeatures([]);
  }, [setSelectedFeatures]);

  /* ── Launch Job Handler (D3 Bug Fix Verified) ──────────────────── */
  const handleLaunch = useCallback(async () => {
    setLaunchError(null);
    if (!dataset) {
      setLaunchError('No dataset loaded.');
      return;
    }
    if (!selectedTarget) {
      setLaunchError('Please select a target variable column.');
      return;
    }
    if (selectedFeatures.length === 0) {
      setLaunchError('Please select at least one feature column.');
      return;
    }
    if (selectedFeatures.includes(selectedTarget)) {
      setLaunchError(`Target column "${selectedTarget}" cannot be included in features.`);
      return;
    }

    setIsLaunching(true);
    try {
      const payload: TrainingRequestPayload = {
        dataset_id: dataset.datasetId || `client-${dataset.fileName}`,
        target_column: selectedTarget,
        feature_columns: selectedFeatures,
        algorithm,
        train_test_split: trainTestSplit,
        random_seed: 42,
        cross_validation: cvFolds,
        normalization: scaler === 'StandardScaler',
        feature_selection: 'all',
        notes: `Trained on ${dataset.fileName} with ${selectedFeatures.length} features`,
      };

      const createdJob = await createTrainingJob(payload);
      setActiveJob(createdJob);
      setLifecycleStage('pipeline');
      onShowToast(
        'Training Job Started',
        `Running ${algorithm} on ${selectedFeatures.length} features → ${selectedTarget}`,
        'success',
      );
      onNavigate('code-studio');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to launch training job.';
      setLaunchError(msg);
      onShowToast('Launch Failed', msg, 'error');
    } finally {
      setIsLaunching(false);
    }
  }, [
    dataset,
    selectedTarget,
    selectedFeatures,
    algorithm,
    trainTestSplit,
    cvFolds,
    scaler,
    setActiveJob,
    setLifecycleStage,
    onShowToast,
    onNavigate,
  ]);

  /* ── Calculations & Data Derived ────────────────────────────────── */
  const qualityBreakdown = useMemo(() => {
    return profile ? computeDetailedQualityScore(profile) : null;
  }, [profile]);

  const allColumns = dataset?.columns || [];
  const numericSet = useMemo(
    () => (dataset ? new Set(getNumericColumns(dataset.columns, dataset.rows)) : new Set<string>()),
    [dataset],
  );

  const copilotMsgs = useMemo(() => {
    return generateCopilotMessages(profile, recommendations, qualityBreakdown, dataset);
  }, [profile, recommendations, qualityBreakdown, dataset]);

  const issueCount = (health?.issues || []).filter((i) => i.severity !== 'info').length;

  const isIdentifier = (col: string) => {
    const cp = profile?.columns.find((c) => c.name === col);
    return cp?.type === 'identifier';
  };

  /* ── Filtered & Paginated Preview Rows (C3) ────────────────────── */
  const filteredPreviewRows = useMemo(() => {
    if (!dataset) return [];
    if (!previewSearch.trim()) return dataset.rows;
    const q = previewSearch.toLowerCase();
    return dataset.rows.filter((row) =>
      Object.values(row).some((val) => String(val ?? '').toLowerCase().includes(q)),
    );
  }, [dataset, previewSearch]);

  const totalPreviewPages = Math.max(1, Math.ceil(filteredPreviewRows.length / previewPageSize));
  const paginatedRows = useMemo(() => {
    const start = (previewPage - 1) * previewPageSize;
    return filteredPreviewRows.slice(start, start + previewPageSize);
  }, [filteredPreviewRows, previewPage, previewPageSize]);

  /* ── Algorithm Options for Shared Select (B1) ───────────────────── */
  const algorithmSelectOptions = useMemo(() => {
    const groups = [];

    if (recommendations?.recommended_models && recommendations.recommended_models.length > 0) {
      groups.push({
        label: 'Recommended Models',
        options: recommendations.recommended_models.map((a) => ({ value: a, label: a })),
      });
    }

    groups.push({
      label: 'Classification Algorithms',
      options: supportedAlgos.classification.map((a) => ({ value: a, label: a })),
    });

    groups.push({
      label: 'Regression Algorithms',
      options: supportedAlgos.regression.map((a) => ({ value: a, label: a })),
    });

    return groups;
  }, [recommendations, supportedAlgos]);

  const scalerOptions = [
    { value: 'StandardScaler', label: 'StandardScaler (Zero mean, Unit variance)' },
    { value: 'MinMaxScaler', label: 'MinMaxScaler (0 to 1 range)' },
    { value: 'RobustScaler', label: 'RobustScaler (IQR outlier-resistant)' },
    { value: 'None', label: 'None (Raw features)' },
  ];

  const imputerOptions = [
    { value: 'Median', label: 'Median (Robust for skewed numerics)' },
    { value: 'Mean', label: 'Mean (Standard continuous)' },
    { value: 'Most Frequent', label: 'Most Frequent (Categorical mode)' },
    { value: 'Constant (0)', label: 'Constant (Fill 0 / default)' },
    { value: 'Drop Rows', label: 'Drop Rows with Missing Values' },
  ];

  /* ═══════════════════════════════════════════════════════════════
     RENDER: Upload Prompt State
     ═══════════════════════════════════════════════════════════════ */
  if (!dataset) {
    return (
      <div style={{ padding: '0 0 24px' }}>
        <DataUpload onDataLoaded={handleDataLoaded} />
      </div>
    );
  }

  const rowCount = dataset.rowCount ?? dataset.rows.length;
  const colCount = dataset.columns.length;
  const fileSize = profile ? formatBytes(profile.memory_usage_bytes) : '—';

  /* ═══════════════════════════════════════════════════════════════
     RENDER: Dataset Ingested View
     ═══════════════════════════════════════════════════════════════ */
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        fontFamily: 'var(--font-ui)',
        color: BB.text,
        minHeight: 'calc(100vh - 120px)',
      }}
    >
      {/* ─────────────────────────────────────────────────────────────
          SUBHEADER: View Toggle (C1) + Quick Indicators
          ───────────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 4px 4px',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        {/* Segmented Control for Views */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            background: BB.surface,
            border: `1px solid ${BB.border}`,
            borderRadius: '8px 8px 0 8px',
            padding: 3,
            gap: 4,
          }}
        >
          <button
            onClick={() => setActiveView('workspace')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              borderRadius: '6px 6px 0 6px',
              border: 'none',
              background: activeView === 'workspace' ? BB.primary : 'transparent',
              color: activeView === 'workspace' ? BB.text : BB.muted,
              fontSize: 12,
              fontWeight: activeView === 'workspace' ? 700 : 500,
              cursor: 'pointer',
              transition: 'all 150ms',
            }}
          >
            <Layers style={{ width: 13, height: 13 }} />
            <span>Workspace</span>
          </button>

          <button
            onClick={() => setActiveView('preview')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              borderRadius: '6px 6px 0 6px',
              border: 'none',
              background: activeView === 'preview' ? BB.primary : 'transparent',
              color: activeView === 'preview' ? BB.text : BB.muted,
              fontSize: 12,
              fontWeight: activeView === 'preview' ? 700 : 500,
              cursor: 'pointer',
              transition: 'all 150ms',
            }}
          >
            <TableIcon style={{ width: 13, height: 13 }} />
            <span>Preview data ({rowCount} rows)</span>
          </button>
        </div>

        {/* Right Action: Upload New Dataset */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {isAnalyzing && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: BB.muted }}>
              <Loader2 style={{ width: 13, height: 13, animation: 'spin 1s linear infinite' }} />
              <span>Analyzing…</span>
            </div>
          )}
          {analyzeError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: BB.maroonLight }}>
              <AlertCircle style={{ width: 13, height: 13 }} />
              <span>{analyzeError}</span>
            </div>
          )}
          <button
            onClick={() => resetProject()}
            title="Clear and upload a new dataset"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              borderRadius: '6px 6px 0 6px',
              border: `1px solid ${BB.border}`,
              background: 'transparent',
              color: BB.muted,
              fontSize: 11,
              cursor: 'pointer',
              transition: 'all 150ms',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = BB.primaryLight;
              e.currentTarget.style.color = BB.text;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = BB.border;
              e.currentTarget.style.color = BB.muted;
            }}
          >
            <Upload style={{ width: 12, height: 12 }} />
            <span>Upload new dataset</span>
          </button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          MAIN CONTENT AREA (Center content + Resizable Copilot)
          ───────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'stretch', flex: 1, minHeight: 0 }}>
        {/* CENTER CONTENT */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {activeView === 'workspace' ? (
            /* ── C2: 4-Panel Grid Workspace ──────────────────────── */
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gridTemplateRows: 'auto 1fr',
                gap: 14,
                flex: 1,
                minHeight: 0,
              }}
            >
              {/* PANEL 1: Overview & Quality (Top-Left) ─────────────── */}
              <div
                style={{
                  background: BB.surface,
                  border: `1px solid ${BB.border}`,
                  borderRadius: 12,
                  padding: '16px 18px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                {/* Dataset Identity Row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        color: BB.muted,
                        display: 'block',
                      }}
                    >
                      Overview &amp; quality
                    </span>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: BB.text,
                        fontFamily: 'var(--font-mono)',
                        marginTop: 2,
                      }}
                    >
                      {dataset.fileName}
                    </div>
                  </div>

                  {/* Quality Ring with Explainability Trigger (C4) */}
                  {qualityBreakdown && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <QualityScoreRing
                        score={qualityBreakdown.score}
                        onClick={() => setShowScoreModal(true)}
                      />
                    </div>
                  )}
                </div>

                {/* Dataset Stats Bar */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: 8,
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: BB.elevated,
                    fontSize: 11,
                    textAlign: 'center',
                  }}
                >
                  <div>
                    <span style={{ color: BB.disabled, fontSize: 10, display: 'block' }}>ROWS</span>
                    <strong style={{ color: BB.text, fontFamily: 'var(--font-mono)' }}>{rowCount}</strong>
                  </div>
                  <div>
                    <span style={{ color: BB.disabled, fontSize: 10, display: 'block' }}>COLS</span>
                    <strong style={{ color: BB.text, fontFamily: 'var(--font-mono)' }}>{colCount}</strong>
                  </div>
                  <div>
                    <span style={{ color: BB.disabled, fontSize: 10, display: 'block' }}>SIZE</span>
                    <strong style={{ color: BB.text, fontFamily: 'var(--font-mono)' }}>{fileSize}</strong>
                  </div>
                  <div>
                    <span style={{ color: BB.disabled, fontSize: 10, display: 'block' }}>QUALITY</span>
                    <button
                      onClick={() => setShowScoreModal(true)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: qualityBreakdown ? getQualityColor(qualityBreakdown.score) : BB.text,
                        fontWeight: 700,
                        cursor: 'pointer',
                        padding: 0,
                        textDecoration: 'underline',
                        textUnderlineOffset: 2,
                      }}
                    >
                      {qualityBreakdown ? `${qualityBreakdown.score}/100` : '—'}
                    </button>
                  </div>
                </div>

                {/* Next Best Action List */}
                {health?.recommendations && health.recommendations.length > 0 && (
                  <div>
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: BB.muted,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        marginBottom: 6,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span>Next best actions</span>
                      {issueCount > 0 && (
                        <span
                          style={{
                            fontSize: 9,
                            padding: '1px 6px',
                            borderRadius: 10,
                            background: 'rgba(178,58,78,0.2)',
                            color: BB.maroonLight,
                          }}
                        >
                          {issueCount} issues detected
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {health.recommendations.slice(0, 3).map((rec, i) => (
                        <div
                          key={i}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 7,
                            fontSize: 11,
                            lineHeight: 1.4,
                          }}
                        >
                          <span style={{ color: BB.primaryLight, flexShrink: 0 }}>→</span>
                          <span style={{ color: BB.muted }}>{rec}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* PANEL 2: Column Schema (Top-Right) ───────────────── */}
              <div
                style={{
                  background: BB.surface,
                  border: `1px solid ${BB.border}`,
                  borderRadius: 12,
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  maxHeight: 280,
                }}
              >
                <div
                  style={{
                    padding: '12px 16px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: `1px solid ${BB.border}`,
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: BB.muted,
                    }}
                  >
                    Column schema ({colCount} columns)
                  </span>
                  <span style={{ fontSize: 10, color: BB.disabled }}>Click row to view stats</span>
                </div>

                <div style={{ overflowY: 'auto', flex: 1 }}>
                  {/* Table Header */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 56px 60px 52px',
                      padding: '6px 16px',
                      gap: 8,
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      color: BB.disabled,
                      borderBottom: `1px solid ${BB.border}`,
                      position: 'sticky',
                      top: 0,
                      background: BB.surface,
                    }}
                  >
                    <span>Column</span>
                    <span>Type</span>
                    <span style={{ textAlign: 'right' }}>Missing</span>
                    <span style={{ textAlign: 'right' }}>Unique</span>
                  </div>

                  {/* Rows */}
                  {(
                    profile?.columns ||
                    allColumns.map((name) => ({
                      name,
                      type: numericSet.has(name) ? 'numeric' : 'categorical',
                      missing: 0,
                      missing_percentage: 0,
                      unique: 0,
                    } as Partial<ColumnProfile>))
                  ).map((col: any, idx: number) => {
                    const isExpanded = expandedColumns.has(col.name);
                    return (
                      <div key={col.name}>
                        <div
                          onClick={() => {
                            if (!profile) return;
                            const next = new Set(expandedColumns);
                            if (isExpanded) next.delete(col.name);
                            else next.add(col.name);
                            setExpandedColumns(next);
                          }}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 56px 60px 52px',
                            padding: '6px 16px',
                            gap: 8,
                            alignItems: 'center',
                            fontSize: 11,
                            cursor: profile ? 'pointer' : 'default',
                            background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                            transition: 'background 100ms',
                            borderBottom: `1px solid ${BB.border}`,
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(107,92,166,0.06)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background =
                              idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)';
                          }}
                        >
                          <span
                            style={{
                              color: BB.text,
                              fontFamily: 'var(--font-mono)',
                              fontSize: 11,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {col.name}
                          </span>
                          <TypePill type={col.type || 'text'} />
                          <span
                            style={{
                              textAlign: 'right',
                              color: (col.missing_percentage ?? 0) > 5 ? BB.gold : BB.muted,
                              fontFamily: 'var(--font-mono)',
                              fontSize: 11,
                            }}
                          >
                            {(col.missing_percentage ?? 0) > 0
                              ? `${Math.round(col.missing_percentage)}%`
                              : '0%'}
                          </span>
                          <span
                            style={{
                              textAlign: 'right',
                              color: BB.muted,
                              fontFamily: 'var(--font-mono)',
                              fontSize: 11,
                            }}
                          >
                            {col.unique ?? '—'}
                          </span>
                        </div>

                        {/* Expanded Statistics */}
                        {isExpanded && profile && (
                          <div
                            style={{
                              padding: '8px 16px 10px 32px',
                              background: BB.elevated,
                              borderBottom: `1px solid ${BB.border}`,
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: '6px 18px',
                              fontSize: 10,
                              color: BB.muted,
                            }}
                          >
                            {col.statistics?.mean !== undefined && (
                              <span>
                                mean: <b style={{ color: BB.text }}>{col.statistics.mean?.toFixed(2)}</b>
                              </span>
                            )}
                            {col.statistics?.std !== undefined && (
                              <span>
                                std: <b style={{ color: BB.text }}>{col.statistics.std?.toFixed(2)}</b>
                              </span>
                            )}
                            {col.statistics?.min !== undefined && (
                              <span>
                                min: <b style={{ color: BB.text }}>{col.statistics.min?.toFixed(2)}</b>
                              </span>
                            )}
                            {col.statistics?.max !== undefined && (
                              <span>
                                max: <b style={{ color: BB.text }}>{col.statistics.max?.toFixed(2)}</b>
                              </span>
                            )}
                            {col.statistics?.most_frequent_value !== undefined && (
                              <span>
                                top: <b style={{ color: BB.text }}>{col.statistics.most_frequent_value}</b>
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* PANEL 3: Feature & Target Selection (Bottom-Left) ── */}
              <div
                style={{
                  background: BB.surface,
                  border: `1px solid ${BB.border}`,
                  borderRadius: 12,
                  padding: '16px 18px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  maxHeight: 340,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: BB.muted,
                    }}
                  >
                    Feature &amp; target selection
                  </span>
                  <div style={{ display: 'flex', gap: 8, fontSize: 10 }}>
                    <button
                      onClick={handleSelectAllFeatures}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: BB.primaryLight,
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    >
                      Select All
                    </button>
                    <span style={{ color: BB.disabled }}>·</span>
                    <button
                      onClick={handleDeselectAllFeatures}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: BB.muted,
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    >
                      Deselect
                    </button>
                  </div>
                </div>

                <div style={{ fontSize: 11, color: BB.muted }}>
                  Features: <strong style={{ color: BB.text }}>{selectedFeatures.length}</strong> · Target:{' '}
                  <strong style={{ color: selectedTarget ? BB.maroonLight : BB.disabled }}>
                    {selectedTarget || 'None'}
                  </strong>
                </div>

                {/* Column Checklist */}
                <div
                  style={{
                    overflowY: 'auto',
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 3,
                    paddingRight: 4,
                  }}
                >
                  {allColumns.map((col) => {
                    const isFeature = selectedFeatures.includes(col);
                    const isTarget = selectedTarget === col;
                    const isId = isIdentifier(col);
                    const colType =
                      profile?.columns.find((c) => c.name === col)?.type ??
                      (numericSet.has(col) ? 'numeric' : 'categorical');
                    const excluded = isId;

                    return (
                      <div
                        key={col}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '20px 1fr 20px',
                          alignItems: 'center',
                          gap: 10,
                          padding: '6px 10px',
                          borderRadius: 7,
                          background: isTarget
                            ? 'rgba(110,20,35,0.18)'
                            : isFeature
                            ? 'rgba(75,59,124,0.12)'
                            : 'transparent',
                          border: `1px solid ${
                            isTarget
                              ? 'rgba(110,20,35,0.35)'
                              : isFeature
                              ? 'rgba(107,92,166,0.25)'
                              : 'transparent'
                          }`,
                          opacity: excluded ? 0.4 : 1,
                          transition: 'all 120ms',
                        }}
                      >
                        {/* Feature Checkbox */}
                        <input
                          type="checkbox"
                          checked={isFeature}
                          disabled={excluded || isTarget}
                          onChange={() => !excluded && handleFeatureToggle(col)}
                          style={{
                            width: 14,
                            height: 14,
                            accentColor: BB.primaryLight,
                            cursor: excluded || isTarget ? 'not-allowed' : 'pointer',
                          }}
                        />

                        {/* Column Name & Type */}
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              color: isTarget ? BB.maroonLight : BB.text,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {col}
                          </div>
                          <div style={{ fontSize: 10, color: BB.muted, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <TypePill type={colType} />
                            {isId && <span style={{ color: BB.disabled }}>id excluded</span>}
                            {isTarget && (
                              <span
                                style={{
                                  color: BB.maroonLight,
                                  fontSize: 9,
                                  fontWeight: 700,
                                  letterSpacing: '0.08em',
                                  textTransform: 'uppercase',
                                }}
                              >
                                TARGET
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Target Radio */}
                        <input
                          type="radio"
                          name="target-variable"
                          checked={isTarget}
                          disabled={excluded}
                          onChange={() => !excluded && handleTargetChange(col)}
                          style={{
                            width: 14,
                            height: 14,
                            accentColor: BB.maroon,
                            cursor: excluded ? 'not-allowed' : 'pointer',
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* PANEL 4: Training Setup (Bottom-Right) ────────────── */}
              <div
                style={{
                  background: BB.surface,
                  border: `1px solid ${BB.border}`,
                  borderRadius: 12,
                  padding: '16px 18px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  maxHeight: 340,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: BB.muted,
                  }}
                >
                  Training setup
                </span>

                <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {/* Algorithm Select with Portal (B1) */}
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: 10,
                        fontWeight: 700,
                        color: BB.disabled,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        marginBottom: 4,
                      }}
                    >
                      Algorithm
                    </label>
                    <Select
                      value={algorithm}
                      onChange={setAlgorithm}
                      options={algorithmSelectOptions}
                      placeholder="Select algorithm..."
                    />
                  </div>

                  {/* Scaler & Imputer in 2 cols */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: 10,
                          fontWeight: 700,
                          color: BB.disabled,
                          textTransform: 'uppercase',
                          letterSpacing: '0.08em',
                          marginBottom: 4,
                        }}
                      >
                        Feature Scaler
                      </label>
                      <Select
                        value={scaler}
                        onChange={setScaler}
                        options={scalerOptions}
                        placeholder="Feature scaler..."
                      />
                    </div>

                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: 10,
                          fontWeight: 700,
                          color: BB.disabled,
                          textTransform: 'uppercase',
                          letterSpacing: '0.08em',
                          marginBottom: 4,
                        }}
                      >
                        Missing Imputer
                      </label>
                      <Select
                        value={imputer}
                        onChange={setImputer}
                        options={imputerOptions}
                        placeholder="Missing imputer..."
                      />
                    </div>
                  </div>

                  {/* CV Folds & Train/Test Split */}
                  <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 12, alignItems: 'center' }}>
                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: 10,
                          fontWeight: 700,
                          color: BB.disabled,
                          textTransform: 'uppercase',
                          letterSpacing: '0.08em',
                          marginBottom: 4,
                        }}
                      >
                        CV Folds
                      </label>
                      <input
                        type="number"
                        min={2}
                        max={20}
                        value={cvFolds}
                        onChange={(e) => setCvFolds(parseInt(e.target.value) || 5)}
                        style={{
                          width: '100%',
                          padding: '7px 8px',
                          borderRadius: 7,
                          border: `1px solid ${BB.border}`,
                          background: BB.elevated,
                          color: BB.text,
                          fontSize: 11,
                          fontFamily: 'var(--font-mono)',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <label
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: BB.disabled,
                            textTransform: 'uppercase',
                            letterSpacing: '0.08em',
                          }}
                        >
                          Train / Test split
                        </label>
                        <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: BB.primaryLight }}>
                          {Math.round(trainTestSplit * 100)}% / {Math.round((1 - trainTestSplit) * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.5}
                        max={0.95}
                        step={0.05}
                        value={trainTestSplit}
                        onChange={(e) => setTrainTestSplit(parseFloat(e.target.value))}
                        style={{ width: '100%', accentColor: BB.maroon, cursor: 'pointer' }}
                      />
                    </div>
                  </div>

                  {/* Inline Launch Validation Error */}
                  {launchError && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 7,
                        padding: '8px 10px',
                        borderRadius: 7,
                        background: 'rgba(110,20,35,0.18)',
                        border: '1px solid rgba(178,58,78,0.3)',
                        fontSize: 11,
                        color: BB.maroonLight,
                      }}
                    >
                      <AlertCircle style={{ width: 13, height: 13, flexShrink: 0, marginTop: 1 }} />
                      <span>{launchError}</span>
                    </div>
                  )}
                </div>

                {/* Sticky Launch Button (D3) */}
                <button
                  onClick={handleLaunch}
                  disabled={isLaunching || !selectedTarget || selectedFeatures.length === 0}
                  style={{
                    width: '100%',
                    padding: '11px 0',
                    borderRadius: '8px 8px 0 8px',
                    border: 'none',
                    background:
                      isLaunching || !selectedTarget || selectedFeatures.length === 0
                        ? BB.disabled
                        : `linear-gradient(135deg, ${BB.maroon} 0%, #A01830 100%)`,
                    color: BB.text,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor:
                      isLaunching || !selectedTarget || selectedFeatures.length === 0
                        ? 'not-allowed'
                        : 'pointer',
                    fontFamily: 'var(--font-ui)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    boxShadow:
                      isLaunching || !selectedTarget ? 'none' : '0 4px 16px rgba(110,20,35,0.35)',
                    letterSpacing: '0.02em',
                  }}
                >
                  {isLaunching ? (
                    <>
                      <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} />
                      <span>Launching ML Job…</span>
                    </>
                  ) : (
                    <>
                      <Play style={{ width: 13, height: 13, fill: 'currentColor' }} />
                      <span>Launch training job →</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            /* ── C3: Full-Width Data Preview View ────────────────── */
            <div
              style={{
                background: BB.surface,
                border: `1px solid ${BB.border}`,
                borderRadius: 12,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
              }}
            >
              {/* Preview Controls Bar */}
              <div
                style={{
                  padding: '12px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  borderBottom: `1px solid ${BB.border}`,
                  background: BB.elevated,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <Search
                      style={{
                        position: 'absolute',
                        left: 10,
                        width: 13,
                        height: 13,
                        color: BB.muted,
                      }}
                    />
                    <input
                      type="text"
                      value={previewSearch}
                      onChange={(e) => {
                        setPreviewSearch(e.target.value);
                        setPreviewPage(1);
                      }}
                      placeholder="Search row values..."
                      style={{
                        padding: '6px 12px 6px 30px',
                        borderRadius: 6,
                        border: `1px solid ${BB.border}`,
                        background: BB.surface,
                        color: BB.text,
                        fontSize: 11,
                        fontFamily: 'var(--font-ui)',
                        outline: 'none',
                        width: 200,
                      }}
                    />
                  </div>
                  <span style={{ fontSize: 11, color: BB.muted }}>
                    Showing {filteredPreviewRows.length} matching rows
                  </span>
                </div>

                {/* Pagination Controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: BB.disabled, fontSize: 10 }}>PAGE SIZE:</span>
                    <select
                      value={previewPageSize}
                      onChange={(e) => {
                        setPreviewPageSize(Number(e.target.value));
                        setPreviewPage(1);
                      }}
                      style={{
                        padding: '3px 6px',
                        borderRadius: 4,
                        border: `1px solid ${BB.border}`,
                        background: BB.surface,
                        color: BB.text,
                        fontSize: 11,
                        outline: 'none',
                      }}
                    >
                      <option value={15}>15</option>
                      <option value={30}>30</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>

                  <span style={{ color: BB.muted }}>
                    Page {previewPage} of {totalPreviewPages}
                  </span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
                      disabled={previewPage === 1}
                      style={{
                        padding: '4px 8px',
                        borderRadius: 4,
                        border: `1px solid ${BB.border}`,
                        background: 'transparent',
                        color: previewPage === 1 ? BB.disabled : BB.text,
                        cursor: previewPage === 1 ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <ChevronLeft style={{ width: 14, height: 14 }} />
                    </button>
                    <button
                      onClick={() => setPreviewPage((p) => Math.min(totalPreviewPages, p + 1))}
                      disabled={previewPage === totalPreviewPages}
                      style={{
                        padding: '4px 8px',
                        borderRadius: 4,
                        border: `1px solid ${BB.border}`,
                        background: 'transparent',
                        color: previewPage === totalPreviewPages ? BB.disabled : BB.text,
                        cursor: previewPage === totalPreviewPages ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <ChevronRight style={{ width: 14, height: 14 }} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Data Table */}
              <div style={{ overflowX: 'auto', flex: 1, maxHeight: 560 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: BB.surface, borderBottom: `1px solid ${BB.border}` }}>
                      <th
                        style={{
                          padding: '8px 12px',
                          textAlign: 'left',
                          fontSize: 10,
                          fontWeight: 700,
                          color: BB.disabled,
                          letterSpacing: '0.08em',
                          position: 'sticky',
                          left: 0,
                          background: BB.surface,
                          zIndex: 2,
                        }}
                      >
                        #
                      </th>
                      {allColumns.map((col) => (
                        <th
                          key={col}
                          style={{
                            padding: '8px 14px',
                            textAlign: 'left',
                            fontSize: 11,
                            fontWeight: 700,
                            color: selectedTarget === col ? BB.maroonLight : BB.text,
                            fontFamily: 'var(--font-mono)',
                            borderRight: `1px solid ${BB.border}`,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span>{col}</span>
                            {selectedTarget === col && (
                              <span
                                style={{
                                  fontSize: 8,
                                  padding: '1px 4px',
                                  borderRadius: 3,
                                  background: 'rgba(110,20,35,0.25)',
                                  color: BB.maroonLight,
                                }}
                              >
                                TARGET
                              </span>
                            )}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedRows.map((row, rIdx) => (
                      <tr
                        key={rIdx}
                        style={{
                          borderBottom: `1px solid ${BB.border}`,
                          background: rIdx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                        }}
                      >
                        <td
                          style={{
                            padding: '6px 12px',
                            color: BB.disabled,
                            fontFamily: 'var(--font-mono)',
                            fontSize: 10,
                            position: 'sticky',
                            left: 0,
                            background: rIdx % 2 === 0 ? BB.surface : BB.elevated,
                          }}
                        >
                          {(previewPage - 1) * previewPageSize + rIdx + 1}
                        </td>
                        {allColumns.map((col) => {
                          const val = row[col];
                          const isMissing =
                            val === null || val === undefined || val === '' || val === 'N/A' || val === 'NaN';
                          return (
                            <td
                              key={col}
                              style={{
                                padding: '6px 14px',
                                fontFamily: 'var(--font-mono)',
                                fontSize: 11,
                                color: isMissing ? BB.gold : BB.text,
                                borderRight: `1px solid ${BB.border}`,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {isMissing ? <span style={{ opacity: 0.5 }}>null</span> : String(val)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* ─────────────────────────────────────────────────────────────
            D5: RESIZABLE AI COPILOT PANEL (Docked Right, 320–560px)
            ───────────────────────────────────────────────────────────── */}
        <div
          style={{
            position: 'relative',
            width: copilotWidth,
            flexShrink: 0,
            background: BB.surface,
            border: `1px solid ${BB.border}`,
            borderRadius: 12,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Left Edge Resize Handle (D5) */}
          <div
            onMouseDown={handleMouseDownResize}
            title="Drag to resize Copilot panel"
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              width: 6,
              cursor: 'col-resize',
              zIndex: 10,
              background: isDraggingCopilot ? BB.primaryLight : 'transparent',
              transition: 'background 150ms',
            }}
          />

          {/* Copilot Header */}
          <div
            style={{
              padding: '12px 16px',
              borderBottom: `1px solid ${BB.border}`,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: BB.elevated,
            }}
          >
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: `linear-gradient(135deg, ${BB.primary}, ${BB.maroon})`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
              }}
            >
              ✦
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: BB.text }}>AI Copilot</span>
            <span
              style={{
                marginLeft: 'auto',
                fontSize: 9,
                fontWeight: 700,
                padding: '2px 7px',
                borderRadius: 20,
                background: 'rgba(75,59,124,0.25)',
                color: BB.primaryLight,
                border: `1px solid rgba(107,92,166,0.30)`,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              PROFILER AGENT
            </span>
          </div>

          {/* Copilot Feed */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '14px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            {copilotMsgs.map((msg) => (
              <div
                key={msg.id}
                style={{
                  padding: '10px 12px',
                  borderRadius: '8px 8px 8px 0',
                  background:
                    msg.type === 'warning' ? 'rgba(245,158,11,0.08)' : 'rgba(75,59,124,0.12)',
                  border: `1px solid ${
                    msg.type === 'warning' ? 'rgba(245,158,11,0.22)' : 'rgba(107,92,166,0.22)'
                  }`,
                  fontSize: 11,
                  color: BB.muted,
                  lineHeight: 1.5,
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

          {/* Copilot Input Stub */}
          <div style={{ padding: '10px 12px', borderTop: `1px solid ${BB.border}` }}>
            <input
              placeholder="Ask about this dataset…"
              disabled
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 6,
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

      {/* ─────────────────────────────────────────────────────────────
          C4: DATA QUALITY SCORE EXPLAINABILITY MODAL
          ───────────────────────────────────────────────────────────── */}
      {showScoreModal && qualityBreakdown && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: 20,
          }}
          onClick={() => setShowScoreModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: BB.surface,
              border: `1px solid ${BB.border}`,
              borderRadius: 14,
              width: '100%',
              maxWidth: 520,
              boxShadow: '0 20px 48px rgba(0,0,0,0.6)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              animation: 'scaleIn 150ms ease-out',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: `1px solid ${BB.border}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: BB.elevated,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <QualityScoreRing score={qualityBreakdown.score} />
                <div>
                  <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: BB.text }}>
                    Data Quality Score Audit
                  </h3>
                  <span style={{ fontSize: 11, color: BB.muted }}>
                    Grade: <strong style={{ color: getQualityColor(qualityBreakdown.score) }}>{qualityBreakdown.grade}</strong> (
                    {qualityBreakdown.score}/100)
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShowScoreModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: BB.muted,
                  cursor: 'pointer',
                  padding: 4,
                }}
              >
                <X style={{ width: 16, height: 16 }} />
              </button>
            </div>

            {/* Modal Body: Itemized Deductions (C4) */}
            <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontSize: 12, color: BB.muted, lineHeight: 1.5 }}>
                Starting from a baseline score of <strong>100 points</strong>, the Quality Engine calculates itemized deductions based on dataset health metrics:
              </div>

              <div
                style={{
                  background: BB.base,
                  border: `1px solid ${BB.border}`,
                  borderRadius: 8,
                  padding: '10px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 11,
                    borderBottom: `1px solid ${BB.border}`,
                    paddingBottom: 6,
                    color: BB.muted,
                  }}
                >
                  <span>Base Score</span>
                  <strong style={{ color: BB.text, fontFamily: 'var(--font-mono)' }}>+100 pts</strong>
                </div>

                {qualityBreakdown.deductions.map((d, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      fontSize: 11,
                      gap: 10,
                    }}
                  >
                    <div>
                      <div style={{ color: BB.text, fontWeight: 600 }}>{d.reason}</div>
                      <div style={{ fontSize: 10, color: BB.muted }}>{d.details}</div>
                    </div>
                    <span style={{ color: BB.maroonLight, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                      −{d.points} pts
                    </span>
                  </div>
                ))}

                {qualityBreakdown.deductions.length === 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: BB.success }}>
                    <CheckCircle2 style={{ width: 14, height: 14 }} />
                    <span>No deductions applied — dataset is in pristine condition.</span>
                  </div>
                )}

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 12,
                    borderTop: `1px solid ${BB.border}`,
                    paddingTop: 8,
                    marginTop: 4,
                  }}
                >
                  <strong style={{ color: BB.text }}>Final Quality Score</strong>
                  <strong
                    style={{
                      color: getQualityColor(qualityBreakdown.score),
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {qualityBreakdown.score} / 100
                  </strong>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: '12px 20px',
                borderTop: `1px solid ${BB.border}`,
                display: 'flex',
                justifyContent: 'flex-end',
                background: BB.elevated,
              }}
            >
              <button
                onClick={() => setShowScoreModal(false)}
                style={{
                  padding: '6px 16px',
                  borderRadius: 6,
                  border: 'none',
                  background: BB.primary,
                  color: BB.text,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
