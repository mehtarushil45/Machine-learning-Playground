/**
 * DatasetProfilerPage — Page 1 of the ML Platform rebuild.
 *
 * Implements:
 *  - A4: AI Copilot controlled via top-right symbol button (opens/closes right drawer)
 *  - B1: Portal dropdown selects with zero-latency instant positioning
 *  - B2: Ultra-smooth train/test split slider with custom gradient track
 *  - C1: 4-Panel Grid with dual-axis manual resizing & zero visible white lines between boxes
 *  - C2: "Upload new" button positioned contextually inside Overview & Quality panel
 *  - C3: Full-width Preview Data View with search & pagination
 *  - C4: Explainable Data Quality Score with itemized deduction breakdown modal
 *  - D3: Bug-free training launch with verified feature/target payload
 */
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Layers,
  Loader2,
  Play,
  RotateCcw,
  Search,
  Sparkles,
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
  fetchTrainingOptions,
} from '../../services/jobService';
import type { OptionItem, TrainingOptions } from '../../types/job';
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

  if (profile.empty_columns > 0) {
    const pts = Math.min(profile.empty_columns * 5, 15);
    deductions.push({
      reason: 'Completely empty columns',
      points: pts,
      details: `${profile.empty_columns} column${profile.empty_columns > 1 ? 's' : ''} with 100% missing values`,
      type: 'empty_cols',
    });
  }

  if (profile.duplicate_columns > 0) {
    const pts = Math.min(profile.duplicate_columns * 5, 10);
    deductions.push({
      reason: 'Duplicate or identical columns',
      points: pts,
      details: `${profile.duplicate_columns} redundant column${profile.duplicate_columns > 1 ? 's' : ''} detected`,
      type: 'duplicate_cols',
    });
  }

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
  const R = 20;
  const circ = 2 * Math.PI * R;
  const offset = circ * (1 - score / 100);

  return (
    <div
      onClick={onClick}
      style={{
        position: 'relative',
        width: 50,
        height: 50,
        flexShrink: 0,
        cursor: onClick ? 'pointer' : 'default',
      }}
      title="Click to view full Quality Score explanation"
    >
      <svg width={50} height={50} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={25} cy={25} r={R} fill="none" stroke={BB.elevated} strokeWidth={4} />
        <circle
          cx={25}
          cy={25}
          r={R}
          fill="none"
          stroke={color}
          strokeWidth={4}
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
            fontSize: 12,
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
            fontSize: 7,
            color: BB.muted,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          score
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
        padding: '1px 5px',
        borderRadius: 4,
        fontSize: 9,
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
): CopilotMsg[] {
  const msgs: CopilotMsg[] = [];

  if (!profile) {
    msgs.push({ id: 'loading', type: 'info', text: 'Analyzing dataset structure and statistics…' });
    return msgs;
  }

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

  const idCols = profile.columns.filter((c) => c.type === 'identifier');
  if (idCols.length > 0) {
    msgs.push({
      id: 'id-col',
      type: 'warning',
      text: `**${idCols.map((c) => c.name).join(', ')}** identified as ID column${
        idCols.length > 1 ? 's' : ''
      } and excluded from feature matrix to prevent data leakage.`,
    });
  }

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
  isCopilotOpen?: boolean;
  onToggleCopilot?: () => void;
}

/* ═══════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════ */
export const DatasetProfilerPage = memo(function DatasetProfilerPage({
  onShowToast,
  onNavigate,
  isCopilotOpen = false,
  onToggleCopilot,
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

  /* ── View Toggle State (Workspace vs Preview data) ─────────────── */
  const [activeView, setActiveView] = useState<'workspace' | 'preview'>('workspace');

  /* ── Manual 4-Panel Grid Resizing State (C1) ──────────────────── */
  const [splitCol, setSplitCol] = useState<number>(50);
  const [splitRow, setSplitRow] = useState<number>(46);
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const [isResizingCol, setIsResizingCol] = useState(false);
  const [isResizingRow, setIsResizingRow] = useState(false);

  /* ── Dedicated Right AI Panel Width ─────────────────────────────── */
  const [copilotWidth, setCopilotWidth] = useState<number>(340);
  const [isDraggingCopilot, setIsDraggingCopilot] = useState<boolean>(false);

  /* ── Analysis State ─────────────────────────────────────────────── */
  const [profile, setProfile] = useState<DatasetProfile | null>(null);
  const [health, setHealth] = useState<DatasetHealthReport | null>(null);
  const [recommendations, setRecommendations] = useState<DatasetRecommendations | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  /* ── Quality Score Breakdown Modal State ────────────────────────── */
  const [showScoreModal, setShowScoreModal] = useState(false);

  /* ── Training Form State ────────────────────────────────────────── */
  const [algorithm, setAlgorithm] = useState('Random Forest Classifier');
  const [scaler, setScaler] = useState('StandardScaler');
  const [imputer, setImputer] = useState('Median');
  const [cvFolds, setCvFolds] = useState(5);
  const [trainTestSplit, setTrainTestSplit] = useState(0.8);
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);

  /* ── Column Schema Table State ──────────────────────────────────── */
  const [expandedColumns, setExpandedColumns] = useState<Set<string>>(new Set());

  /* ── Data Preview Table State ───────────────────────────────────── */
  const [previewPage, setPreviewPage] = useState(1);
  const [previewPageSize, setPreviewPageSize] = useState(15);
  const [previewSearch, setPreviewSearch] = useState('');

  /* ── Dynamic Training Options from Backend (Single Source of Truth) ─ */
  const [trainingOptions, setTrainingOptions] = useState<TrainingOptions>({
    algorithms: {
      classification: [],
      regression: [],
    },
    scalers: [],
    imputers: [],
    default_cv_folds: 5,
    default_train_test_split: 0.8,
  });

  const abortRef = useRef<AbortController | null>(null);

  /* ── Fetch Real Training Options from Backend API ───────────────── */
  useEffect(() => {
    const ctrl = new AbortController();
    fetchTrainingOptions(ctrl.signal)
      .then((data) => {
        if (data) {
          setTrainingOptions(data);
          if (data.default_cv_folds) setCvFolds(data.default_cv_folds);
          if (data.default_train_test_split) setTrainTestSplit(data.default_train_test_split);
          if (data.scalers?.length && !scaler) setScaler(data.scalers[0].value);
          if (data.imputers?.length && !imputer) setImputer(data.imputers[0].value);
        }
      })
      .catch(() => {});
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
          const defaultTarget = selectedTarget || dataset.columns[dataset.columns.length - 1];
          setSelectedTarget(defaultTarget);
          setSelectedFeatures(dataset.columns.filter((c) => c !== defaultTarget));
        }

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

  /* ── Dual-Axis Grid Splitter Drag Handlers (C1: No White Lines) ── */
  const handleColResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingCol(true);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!gridContainerRef.current) return;
      const rect = gridContainerRef.current.getBoundingClientRect();
      const relativeX = moveEvent.clientX - rect.left;
      const pct = (relativeX / rect.width) * 100;
      setSplitCol(Math.max(25, Math.min(75, pct)));
    };

    const handleMouseUp = () => {
      setIsResizingCol(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, []);

  const handleRowResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingRow(true);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!gridContainerRef.current) return;
      const rect = gridContainerRef.current.getBoundingClientRect();
      const relativeY = moveEvent.clientY - rect.top;
      const pct = (relativeY / rect.height) * 100;
      setSplitRow(Math.max(25, Math.min(75, pct)));
    };

    const handleMouseUp = () => {
      setIsResizingRow(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, []);

  /* ── Dedicated AI Copilot Panel Resize Drag (A4) ────────────────── */
  const handleCopilotResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingCopilot(true);

    const startX = e.clientX;
    const startWidth = copilotWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = startX - moveEvent.clientX;
      const newWidth = Math.max(260, Math.min(520, startWidth + deltaX));
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
        scaler,
        imputer,
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
    scaler,
    imputer,
    trainTestSplit,
    cvFolds,
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
    return generateCopilotMessages(profile, recommendations, qualityBreakdown);
  }, [profile, recommendations, qualityBreakdown]);

  const issueCount = (health?.issues || []).filter((i) => i.severity !== 'info').length;

  const isIdentifier = (col: string) => {
    const cp = profile?.columns.find((c) => c.name === col);
    return cp?.type === 'identifier';
  };

  /* ── Filtered & Paginated Preview Rows ──────────────────────────── */
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

  /* ── Dynamic Dropdown Options from Backend ──────────────────────── */
  const algorithmSelectOptions = useMemo(() => {
    const groups = [];

    if (recommendations?.recommended_models && recommendations.recommended_models.length > 0) {
      groups.push({
        label: 'Recommended Models',
        options: recommendations.recommended_models.map((a) => ({ value: a, label: a })),
      });
    }

    if (trainingOptions.algorithms.classification.length > 0) {
      groups.push({
        label: 'Classification Algorithms',
        options: trainingOptions.algorithms.classification.map((a) => ({ value: a, label: a })),
      });
    }

    if (trainingOptions.algorithms.regression.length > 0) {
      groups.push({
        label: 'Regression Algorithms',
        options: trainingOptions.algorithms.regression.map((a) => ({ value: a, label: a })),
      });
    }

    return groups;
  }, [recommendations, trainingOptions]);

  const scalerOptions: OptionItem[] = useMemo(() => {
    return trainingOptions.scalers || [];
  }, [trainingOptions.scalers]);

  const imputerOptions: OptionItem[] = useMemo(() => {
    return trainingOptions.imputers || [];
  }, [trainingOptions.imputers]);

  /* ═══════════════════════════════════════════════════════════════
     RENDER: Upload Prompt State
     ═══════════════════════════════════════════════════════════════ */
  if (!dataset) {
    return (
      <div style={{ padding: '0 0 24px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <DataUpload onDataLoaded={handleDataLoaded} />
      </div>
    );
  }

  const rowCount = dataset.rowCount ?? dataset.rows.length;
  const colCount = dataset.columns.length;
  const fileSize = profile ? formatBytes(profile.memory_usage_bytes) : '—';

  /* ═══════════════════════════════════════════════════════════════
     RENDER: Dataset Ingested Studio Layout
     ═══════════════════════════════════════════════════════════════ */
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        fontFamily: 'var(--font-ui)',
        color: BB.text,
        height: '100%',
        width: '100%',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {/* ─────────────────────────────────────────────────────────────
          TOP CONTROL BAR: View Toggle (Workspace / Preview) & Actions
          ───────────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 2px',
          gap: 12,
          flexShrink: 0,
        }}
      >
        {/* Segmented View Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              background: BB.surface,
              border: `1px solid ${BB.border}`,
              borderRadius: '7px',
              padding: 3,
              gap: 3,
            }}
          >
            <button
              onClick={() => setActiveView('workspace')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 12px',
                borderRadius: '5px',
                border: 'none',
                background: activeView === 'workspace' ? BB.primary : 'transparent',
                color: activeView === 'workspace' ? BB.text : BB.muted,
                fontSize: 11,
                fontWeight: activeView === 'workspace' ? 700 : 500,
                cursor: 'pointer',
                transition: 'all 150ms',
              }}
            >
              <Layers style={{ width: 12, height: 12 }} />
              <span>Workspace (4-Panel)</span>
            </button>

            <button
              onClick={() => setActiveView('preview')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 12px',
                borderRadius: '5px',
                border: 'none',
                background: activeView === 'preview' ? BB.primary : 'transparent',
                color: activeView === 'preview' ? BB.text : BB.muted,
                fontSize: 11,
                fontWeight: activeView === 'preview' ? 700 : 500,
                cursor: 'pointer',
                transition: 'all 150ms',
              }}
            >
              <TableIcon style={{ width: 12, height: 12 }} />
              <span>Preview Data ({rowCount} rows)</span>
            </button>
          </div>

          {/* Reset Layout button */}
          {activeView === 'workspace' && (
            <button
              onClick={() => {
                setSplitCol(50);
                setSplitRow(46);
              }}
              title="Reset 4-Panel Grid Layout to 50/50"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 8px',
                borderRadius: 6,
                border: `1px solid ${BB.border}`,
                background: 'transparent',
                color: BB.muted,
                fontSize: 10,
                cursor: 'pointer',
              }}
            >
              <RotateCcw style={{ width: 10, height: 10 }} />
              <span>Reset Layout</span>
            </button>
          )}
        </div>

        {/* Right Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isAnalyzing && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: BB.muted }}>
              <Loader2 style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} />
              <span>Analyzing…</span>
            </div>
          )}
          {analyzeError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: BB.maroonLight }}>
              <AlertCircle style={{ width: 12, height: 12 }} />
              <span>{analyzeError}</span>
            </div>
          )}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          STUDIO CANVAS (Main Left Content + Dedicated Right AI Panel)
          ───────────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          flex: 1,
          minHeight: 0,
          gap: isCopilotOpen ? 10 : 0,
          width: '100%',
          position: 'relative',
          userSelect: isResizingCol || isResizingRow || isDraggingCopilot ? 'none' : 'auto',
        }}
      >
        {/* ── LEFT / CENTER MAIN WORKSPACE ───────────────────────── */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
          {activeView === 'workspace' ? (
            /* ── C1: Manually Resizable 4-Panel Grid (No White Lines) ── */
            <div
              ref={gridContainerRef}
              style={{
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                minHeight: 0,
                width: '100%',
                position: 'relative',
              }}
            >
              {/* TOP ROW: Overview & Quality + Column Schema */}
              <div
                style={{
                  display: 'flex',
                  height: `${splitRow}%`,
                  minHeight: 140,
                  maxHeight: 'calc(100% - 140px)',
                  width: '100%',
                }}
              >
                {/* PANEL 1: Overview & Quality (Top-Left) */}
                <div
                  style={{
                    width: `${splitCol}%`,
                    minWidth: 200,
                    maxWidth: 'calc(100% - 200px)',
                    background: BB.surface,
                    border: `1px solid ${BB.border}`,
                    borderRadius: '10px',
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    overflowY: 'auto',
                    boxSizing: 'border-box',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            color: BB.muted,
                          }}
                        >
                          Overview &amp; quality
                        </span>

                        {/* C2: "Upload new" button moved inside Panel 1 Header */}
                        <button
                          onClick={() => resetProject()}
                          title="Upload a new dataset file"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '2px 7px',
                            borderRadius: 4,
                            border: `1px solid ${BB.border}`,
                            background: 'rgba(107,92,166,0.12)',
                            color: BB.primaryLight,
                            fontSize: 9,
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 150ms',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = BB.primaryLight;
                            e.currentTarget.style.color = BB.text;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = BB.border;
                            e.currentTarget.style.color = BB.primaryLight;
                          }}
                        >
                          <Upload style={{ width: 10, height: 10 }} />
                          <span>Upload new</span>
                        </button>
                      </div>

                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: BB.text,
                          fontFamily: 'var(--font-mono)',
                          marginTop: 2,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {dataset.fileName}
                      </div>
                    </div>

                    {qualityBreakdown && (
                      <QualityScoreRing
                        score={qualityBreakdown.score}
                        onClick={() => setShowScoreModal(true)}
                      />
                    )}
                  </div>

                  {/* Dataset Stats Row */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(4, 1fr)',
                      gap: 6,
                      padding: '6px 8px',
                      borderRadius: 6,
                      background: BB.elevated,
                      fontSize: 10,
                      textAlign: 'center',
                    }}
                  >
                    <div>
                      <span style={{ color: BB.disabled, fontSize: 9, display: 'block' }}>ROWS</span>
                      <strong style={{ color: BB.text, fontFamily: 'var(--font-mono)' }}>{rowCount}</strong>
                    </div>
                    <div>
                      <span style={{ color: BB.disabled, fontSize: 9, display: 'block' }}>COLS</span>
                      <strong style={{ color: BB.text, fontFamily: 'var(--font-mono)' }}>{colCount}</strong>
                    </div>
                    <div>
                      <span style={{ color: BB.disabled, fontSize: 9, display: 'block' }}>SIZE</span>
                      <strong style={{ color: BB.text, fontFamily: 'var(--font-mono)' }}>{fileSize}</strong>
                    </div>
                    <div>
                      <span style={{ color: BB.disabled, fontSize: 9, display: 'block' }}>QUALITY</span>
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
                        }}
                      >
                        {qualityBreakdown ? `${qualityBreakdown.score}/100` : '—'}
                      </button>
                    </div>
                  </div>

                  {/* Next Best Actions */}
                  {health?.recommendations && health.recommendations.length > 0 && (
                    <div>
                      <div
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          color: BB.muted,
                          textTransform: 'uppercase',
                          letterSpacing: '0.08em',
                          marginBottom: 4,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span>Next best actions</span>
                        {issueCount > 0 && (
                          <span
                            style={{
                              fontSize: 8,
                              padding: '1px 5px',
                              borderRadius: 10,
                              background: 'rgba(178,58,78,0.2)',
                              color: BB.maroonLight,
                            }}
                          >
                            {issueCount} issues
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {health.recommendations.slice(0, 2).map((rec, i) => (
                          <div
                            key={i}
                            style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: 6,
                              fontSize: 10,
                              lineHeight: 1.35,
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

                {/* C1: Seamless Vertical Splitter (No White Line) */}
                <div
                  onMouseDown={handleColResizeMouseDown}
                  style={{
                    width: 6,
                    cursor: 'col-resize',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 5,
                    flexShrink: 0,
                    background: 'transparent',
                  }}
                  title="Drag to resize columns"
                >
                  <div
                    style={{
                      width: 2,
                      height: '30%',
                      background: isResizingCol ? BB.primaryLight : 'transparent',
                      borderRadius: 1,
                      transition: 'background 120ms',
                    }}
                  />
                </div>

                {/* PANEL 2: Column Schema (Top-Right) */}
                <div
                  style={{
                    flex: 1,
                    minWidth: 200,
                    background: BB.surface,
                    border: `1px solid ${BB.border}`,
                    borderRadius: '10px',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    boxSizing: 'border-box',
                  }}
                >
                  <div
                    style={{
                      padding: '10px 14px 8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderBottom: `1px solid ${BB.border}`,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        color: BB.muted,
                      }}
                    >
                      Column schema ({colCount} cols)
                    </span>
                    <span style={{ fontSize: 9, color: BB.disabled }}>Click row to expand</span>
                  </div>

                  <div style={{ overflowY: 'auto', flex: 1 }}>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 50px 55px 48px',
                        padding: '5px 14px',
                        gap: 6,
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        color: BB.disabled,
                        borderBottom: `1px solid ${BB.border}`,
                        position: 'sticky',
                        top: 0,
                        background: BB.surface,
                        zIndex: 2,
                      }}
                    >
                      <span>Column</span>
                      <span>Type</span>
                      <span style={{ textAlign: 'right' }}>Null</span>
                      <span style={{ textAlign: 'right' }}>Uniq</span>
                    </div>

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
                              gridTemplateColumns: '1fr 50px 55px 48px',
                              padding: '5px 14px',
                              gap: 6,
                              alignItems: 'center',
                              fontSize: 10,
                              cursor: profile ? 'pointer' : 'default',
                              background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
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
                                fontSize: 10,
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
                                fontSize: 10,
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
                                fontSize: 10,
                              }}
                            >
                              {col.unique ?? '—'}
                            </span>
                          </div>

                          {isExpanded && profile && (
                            <div
                              style={{
                                padding: '6px 14px 8px 24px',
                                background: BB.elevated,
                                borderBottom: `1px solid ${BB.border}`,
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: '4px 14px',
                                fontSize: 9,
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
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* C1: Seamless Horizontal Splitter (No White Line) */}
              <div
                onMouseDown={handleRowResizeMouseDown}
                style={{
                  height: 6,
                  cursor: 'row-resize',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 5,
                  flexShrink: 0,
                  background: 'transparent',
                }}
                title="Drag to resize rows"
              >
                <div
                  style={{
                    height: 2,
                    width: '25%',
                    background: isResizingRow ? BB.primaryLight : 'transparent',
                    borderRadius: 1,
                    transition: 'background 120ms',
                  }}
                />
              </div>

              {/* BOTTOM ROW: Feature & Target + Training Setup */}
              <div
                style={{
                  display: 'flex',
                  flex: 1,
                  minHeight: 140,
                  width: '100%',
                }}
              >
                {/* PANEL 3: Feature & Target Selection (Bottom-Left) */}
                <div
                  style={{
                    width: `${splitCol}%`,
                    minWidth: 200,
                    maxWidth: 'calc(100% - 200px)',
                    background: BB.surface,
                    border: `1px solid ${BB.border}`,
                    borderRadius: '10px',
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    overflow: 'hidden',
                    boxSizing: 'border-box',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        color: BB.muted,
                      }}
                    >
                      Feature &amp; target selection
                    </span>
                    <div style={{ display: 'flex', gap: 6, fontSize: 9 }}>
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
                        All
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
                        None
                      </button>
                    </div>
                  </div>

                  <div style={{ fontSize: 10, color: BB.muted }}>
                    Features: <strong style={{ color: BB.text }}>{selectedFeatures.length}</strong> · Target:{' '}
                    <strong style={{ color: selectedTarget ? BB.maroonLight : BB.disabled }}>
                      {selectedTarget || 'None'}
                    </strong>
                  </div>

                  <div
                    style={{
                      overflowY: 'auto',
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                      paddingRight: 2,
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
                            gridTemplateColumns: '18px 1fr 18px',
                            alignItems: 'center',
                            gap: 8,
                            padding: '4px 8px',
                            borderRadius: 6,
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
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isFeature}
                            disabled={excluded || isTarget}
                            onChange={() => !excluded && handleFeatureToggle(col)}
                            style={{
                              width: 13,
                              height: 13,
                              accentColor: BB.primaryLight,
                              cursor: excluded || isTarget ? 'not-allowed' : 'pointer',
                            }}
                          />

                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: 10,
                                fontWeight: 600,
                                color: isTarget ? BB.maroonLight : BB.text,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {col}
                            </div>
                            <div style={{ fontSize: 9, color: BB.muted, display: 'flex', alignItems: 'center', gap: 4 }}>
                              <TypePill type={colType} />
                              {isId && <span style={{ color: BB.disabled }}>id</span>}
                              {isTarget && (
                                <span style={{ color: BB.maroonLight, fontSize: 8, fontWeight: 700 }}>
                                  TARGET
                                </span>
                              )}
                            </div>
                          </div>

                          <input
                            type="radio"
                            name="target-variable"
                            checked={isTarget}
                            disabled={excluded}
                            onChange={() => !excluded && handleTargetChange(col)}
                            style={{
                              width: 13,
                              height: 13,
                              accentColor: BB.maroon,
                              cursor: excluded ? 'not-allowed' : 'pointer',
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* C1: Seamless Vertical Splitter (Bottom) */}
                <div
                  onMouseDown={handleColResizeMouseDown}
                  style={{
                    width: 6,
                    cursor: 'col-resize',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 5,
                    flexShrink: 0,
                    background: 'transparent',
                  }}
                  title="Drag to resize columns"
                >
                  <div
                    style={{
                      width: 2,
                      height: '30%',
                      background: isResizingCol ? BB.primaryLight : 'transparent',
                      borderRadius: 1,
                      transition: 'background 120ms',
                    }}
                  />
                </div>

                {/* PANEL 4: Training Setup (Bottom-Right) */}
                <div
                  style={{
                    flex: 1,
                    minWidth: 200,
                    background: BB.surface,
                    border: `1px solid ${BB.border}`,
                    borderRadius: '10px',
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    overflow: 'hidden',
                    boxSizing: 'border-box',
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: BB.muted,
                    }}
                  >
                    Training setup
                  </span>

                  <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {/* Algorithm Select */}
                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: 9,
                          fontWeight: 700,
                          color: BB.disabled,
                          textTransform: 'uppercase',
                          letterSpacing: '0.08em',
                          marginBottom: 3,
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
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div>
                        <label
                          style={{
                            display: 'block',
                            fontSize: 9,
                            fontWeight: 700,
                            color: BB.disabled,
                            textTransform: 'uppercase',
                            letterSpacing: '0.08em',
                            marginBottom: 3,
                          }}
                        >
                          Scaler
                        </label>
                        <Select
                          value={scaler}
                          onChange={setScaler}
                          options={scalerOptions}
                          placeholder="Scaler..."
                        />
                      </div>

                      <div>
                        <label
                          style={{
                            display: 'block',
                            fontSize: 9,
                            fontWeight: 700,
                            color: BB.disabled,
                            textTransform: 'uppercase',
                            letterSpacing: '0.08em',
                            marginBottom: 3,
                          }}
                        >
                          Imputer
                        </label>
                        <Select
                          value={imputer}
                          onChange={setImputer}
                          options={imputerOptions}
                          placeholder="Imputer..."
                        />
                      </div>
                    </div>

                    {/* CV Folds & B2 Smooth Train/Test Split Slider */}
                    <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr', gap: 8, alignItems: 'center' }}>
                      <div>
                        <label
                          style={{
                            display: 'block',
                            fontSize: 9,
                            fontWeight: 700,
                            color: BB.disabled,
                            textTransform: 'uppercase',
                            letterSpacing: '0.08em',
                            marginBottom: 3,
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
                            padding: '5px 6px',
                            borderRadius: 6,
                            border: `1px solid ${BB.border}`,
                            background: BB.elevated,
                            color: BB.text,
                            fontSize: 10,
                            fontFamily: 'var(--font-mono)',
                            outline: 'none',
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>

                      {/* B2: Enhanced Smooth Train / Test Slider */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                          <label
                            style={{
                              fontSize: 9,
                              fontWeight: 700,
                              color: BB.disabled,
                              textTransform: 'uppercase',
                              letterSpacing: '0.08em',
                            }}
                          >
                            Split
                          </label>
                          <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: BB.text }}>
                            <strong style={{ color: BB.maroonLight }}>{Math.round(trainTestSplit * 100)}%</strong> Train ·{' '}
                            <strong style={{ color: BB.primaryLight }}>{Math.round((1 - trainTestSplit) * 100)}%</strong> Test
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0.5}
                          max={0.95}
                          step={0.01}
                          value={trainTestSplit}
                          onChange={(e) => setTrainTestSplit(parseFloat(e.target.value))}
                          style={{
                            width: '100%',
                            height: 6,
                            borderRadius: 3,
                            appearance: 'none',
                            outline: 'none',
                            cursor: 'grab',
                            background: `linear-gradient(to right, ${BB.maroon} 0%, ${BB.maroon} ${
                              trainTestSplit * 100
                            }%, rgba(107,92,166,0.25) ${trainTestSplit * 100}%, rgba(107,92,166,0.25) 100%)`,
                          }}
                        />
                      </div>
                    </div>

                    {launchError && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 6,
                          padding: '6px 8px',
                          borderRadius: 6,
                          background: 'rgba(110,20,35,0.18)',
                          border: '1px solid rgba(178,58,78,0.3)',
                          fontSize: 10,
                          color: BB.maroonLight,
                        }}
                      >
                        <AlertCircle style={{ width: 12, height: 12, flexShrink: 0, marginTop: 1 }} />
                        <span>{launchError}</span>
                      </div>
                    )}
                  </div>

                  {/* Sticky Launch Button */}
                  <button
                    onClick={handleLaunch}
                    disabled={isLaunching || !selectedTarget || selectedFeatures.length === 0}
                    style={{
                      width: '100%',
                      padding: '9px 0',
                      borderRadius: '6px',
                      border: 'none',
                      background:
                        isLaunching || !selectedTarget || selectedFeatures.length === 0
                          ? BB.disabled
                          : `linear-gradient(135deg, ${BB.maroon} 0%, #A01830 100%)`,
                      color: BB.text,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor:
                        isLaunching || !selectedTarget || selectedFeatures.length === 0
                          ? 'not-allowed'
                          : 'pointer',
                      fontFamily: 'var(--font-ui)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      boxShadow:
                        isLaunching || !selectedTarget ? 'none' : '0 3px 12px rgba(110,20,35,0.30)',
                    }}
                  >
                    {isLaunching ? (
                      <>
                        <Loader2 style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} />
                        <span>Launching…</span>
                      </>
                    ) : (
                      <>
                        <Play style={{ width: 11, height: 11, fill: 'currentColor' }} />
                        <span>Launch training job →</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* ── C3: Full-Width Data Preview View ────────────────── */
            <div
              style={{
                background: BB.surface,
                border: `1px solid ${BB.border}`,
                borderRadius: 10,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
              }}
            >
              {/* Preview Controls Bar */}
              <div
                style={{
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  borderBottom: `1px solid ${BB.border}`,
                  background: BB.elevated,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <Search
                      style={{
                        position: 'absolute',
                        left: 8,
                        width: 12,
                        height: 12,
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
                        padding: '5px 10px 5px 26px',
                        borderRadius: 5,
                        border: `1px solid ${BB.border}`,
                        background: BB.surface,
                        color: BB.text,
                        fontSize: 10,
                        fontFamily: 'var(--font-ui)',
                        outline: 'none',
                        width: 180,
                      }}
                    />
                  </div>
                  <span style={{ fontSize: 10, color: BB.muted }}>
                    {filteredPreviewRows.length} matching rows
                  </span>
                </div>

                {/* Pagination Controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ color: BB.disabled, fontSize: 9 }}>PAGE SIZE:</span>
                    <select
                      value={previewPageSize}
                      onChange={(e) => {
                        setPreviewPageSize(Number(e.target.value));
                        setPreviewPage(1);
                      }}
                      style={{
                        padding: '2px 4px',
                        borderRadius: 4,
                        border: `1px solid ${BB.border}`,
                        background: BB.surface,
                        color: BB.text,
                        fontSize: 10,
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
                    Page {previewPage} / {totalPreviewPages}
                  </span>
                  <div style={{ display: 'flex', gap: 3 }}>
                    <button
                      onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
                      disabled={previewPage === 1}
                      style={{
                        padding: '3px 6px',
                        borderRadius: 4,
                        border: `1px solid ${BB.border}`,
                        background: 'transparent',
                        color: previewPage === 1 ? BB.disabled : BB.text,
                        cursor: previewPage === 1 ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <ChevronLeft style={{ width: 12, height: 12 }} />
                    </button>
                    <button
                      onClick={() => setPreviewPage((p) => Math.min(totalPreviewPages, p + 1))}
                      disabled={previewPage === totalPreviewPages}
                      style={{
                        padding: '3px 6px',
                        borderRadius: 4,
                        border: `1px solid ${BB.border}`,
                        background: 'transparent',
                        color: previewPage === totalPreviewPages ? BB.disabled : BB.text,
                        cursor: previewPage === totalPreviewPages ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <ChevronRight style={{ width: 12, height: 12 }} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Data Table */}
              <div style={{ overflowX: 'auto', flex: 1 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                  <thead>
                    <tr style={{ background: BB.surface, borderBottom: `1px solid ${BB.border}` }}>
                      <th
                        style={{
                          padding: '6px 10px',
                          textAlign: 'left',
                          fontSize: 9,
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
                            padding: '6px 12px',
                            textAlign: 'left',
                            fontSize: 10,
                            fontWeight: 700,
                            color: selectedTarget === col ? BB.maroonLight : BB.text,
                            fontFamily: 'var(--font-mono)',
                            borderRight: `1px solid ${BB.border}`,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span>{col}</span>
                            {selectedTarget === col && (
                              <span
                                style={{
                                  fontSize: 8,
                                  padding: '1px 3px',
                                  borderRadius: 2,
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
                            padding: '5px 10px',
                            color: BB.disabled,
                            fontFamily: 'var(--font-mono)',
                            fontSize: 9,
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
                                padding: '5px 12px',
                                fontFamily: 'var(--font-mono)',
                                fontSize: 10,
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

        {/* ── A4: DEDICATED RIGHT SIDE DRAWER FOR AI COPILOT ──────── */}
        {isCopilotOpen && (
          <div
            style={{
              position: 'relative',
              width: copilotWidth,
              flexShrink: 0,
              background: BB.surface,
              border: `1px solid ${BB.border}`,
              borderRadius: '10px',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              boxSizing: 'border-box',
              height: '100%',
            }}
          >
            {/* Left Edge Drag Handle */}
            <div
              onMouseDown={handleCopilotResizeMouseDown}
              title="Drag to resize AI panel width"
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: 0,
                width: 6,
                cursor: 'col-resize',
                zIndex: 10,
                background: isDraggingCopilot ? BB.primaryLight : 'transparent',
              }}
            />

            {/* AI Panel Header */}
            <div
              style={{
                padding: '10px 12px',
                borderBottom: `1px solid ${BB.border}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: BB.elevated,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Sparkles style={{ width: 14, height: 14, color: BB.gold }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: BB.text }}>AI Copilot</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    fontSize: 8,
                    fontWeight: 700,
                    padding: '1px 5px',
                    borderRadius: 10,
                    background: 'rgba(75,59,124,0.25)',
                    color: BB.primaryLight,
                    border: `1px solid rgba(107,92,166,0.30)`,
                    textTransform: 'uppercase',
                  }}
                >
                  AGENT
                </span>
                <button
                  onClick={onToggleCopilot}
                  title="Close AI Copilot"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: BB.muted,
                    cursor: 'pointer',
                    padding: 2,
                  }}
                >
                  <X style={{ width: 14, height: 14 }} />
                </button>
              </div>
            </div>

            {/* AI Insights & Message Feed */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '10px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              {copilotMsgs.map((msg) => (
                <div
                  key={msg.id}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '6px',
                    background:
                      msg.type === 'warning' ? 'rgba(245,158,11,0.08)' : 'rgba(75,59,124,0.12)',
                    border: `1px solid ${
                      msg.type === 'warning' ? 'rgba(245,158,11,0.22)' : 'rgba(107,92,166,0.22)'
                    }`,
                    fontSize: 10,
                    color: BB.muted,
                    lineHeight: 1.45,
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

            {/* Input Stub */}
            <div style={{ padding: '8px 10px', borderTop: `1px solid ${BB.border}` }}>
              <input
                placeholder="Ask about this dataset…"
                disabled
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  borderRadius: 5,
                  border: `1px solid ${BB.border}`,
                  background: BB.elevated,
                  color: BB.muted,
                  fontSize: 10,
                  fontFamily: 'var(--font-ui)',
                  outline: 'none',
                  boxSizing: 'border-box',
                  cursor: 'not-allowed',
                }}
              />
            </div>
          </div>
        )}
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
              borderRadius: 12,
              width: '100%',
              maxWidth: 480,
              boxShadow: '0 20px 48px rgba(0,0,0,0.6)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                padding: '14px 18px',
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
                  <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: BB.text }}>
                    Data Quality Score Audit
                  </h3>
                  <span style={{ fontSize: 10, color: BB.muted }}>
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
                <X style={{ width: 14, height: 14 }} />
              </button>
            </div>

            <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 11, color: BB.muted, lineHeight: 1.45 }}>
                Base score of <strong>100 points</strong> with itemized deductions computed from data profiling:
              </div>

              <div
                style={{
                  background: BB.base,
                  border: `1px solid ${BB.border}`,
                  borderRadius: 7,
                  padding: '8px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 10,
                    borderBottom: `1px solid ${BB.border}`,
                    paddingBottom: 4,
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
                      fontSize: 10,
                      gap: 8,
                    }}
                  >
                    <div>
                      <div style={{ color: BB.text, fontWeight: 600 }}>{d.reason}</div>
                      <div style={{ fontSize: 9, color: BB.muted }}>{d.details}</div>
                    </div>
                    <span style={{ color: BB.maroonLight, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                      −{d.points} pts
                    </span>
                  </div>
                ))}

                {qualityBreakdown.deductions.length === 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: BB.success }}>
                    <CheckCircle2 style={{ width: 12, height: 12 }} />
                    <span>No deductions — dataset is in clean condition.</span>
                  </div>
                )}

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 11,
                    borderTop: `1px solid ${BB.border}`,
                    paddingTop: 6,
                    marginTop: 2,
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

            <div
              style={{
                padding: '10px 18px',
                borderTop: `1px solid ${BB.border}`,
                display: 'flex',
                justifyContent: 'flex-end',
                background: BB.elevated,
              }}
            >
              <button
                onClick={() => setShowScoreModal(false)}
                style={{
                  padding: '5px 14px',
                  borderRadius: 5,
                  border: 'none',
                  background: BB.primary,
                  color: BB.text,
                  fontSize: 11,
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
