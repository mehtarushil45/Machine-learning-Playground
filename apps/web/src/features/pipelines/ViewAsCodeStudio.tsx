import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileCode,
  Copy,
  Check,
  Database,
  FileSpreadsheet,
  Play,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Lock,
  ArrowLeft,
  ChevronRight,
  Info,
  Download,
  GitBranch,
  Settings2,
  Cpu,
  Sliders,
  ShieldCheck,
  Workflow,
} from 'lucide-react';
import { useProject } from '../../providers/ProjectContext';
import { PipelineService, type CodeStepExplanation, type PipelineDAG } from '../../services/api';
import { AuthExpiredError, ApiTimeoutError } from '../../services/apiClient';
import { fetchTrainingOptions } from '../../services/jobService';
import type { TrainingOptions } from '../../types/job';
import { AICopilotDrawer, type CopilotMsg } from '../../components/shared/AICopilotDrawer';
import { isColumnIdentifier } from '../../components/shared/FeatureTargetSelector';
import { TrainingJobCard } from '../jobs/TrainingJobCard';

/* ── BB Brand Tokens & High-Contrast Design Tokens ────────────────────── */
const BB = {
  base: '#0B0912',
  surface: '#151026',
  surfaceSubtle: '#1C1534',
  elevated: '#241B42',
  elevatedHover: '#2E2254',
  border: 'rgba(107,92,166,0.22)',
  borderHover: 'rgba(107,92,166,0.48)',
  primary: '#4B3B7C',
  primaryLight: '#7C6BAE',
  primaryGlow: 'rgba(124, 107, 174, 0.25)',
  maroon: '#6E1423',
  maroonLight: '#B23A4E',
  gold: '#C9A24B',
  goldLight: '#E2BD68',
  text: '#F5F1EC',
  muted: '#9E93B8',
  disabled: '#3D3558',
  success: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',
  codeBg: '#0D0A18',
} as const;

export interface ViewAsCodeStudioProps {
  onShowToast?: (title: string, description?: string, type?: 'success' | 'info' | 'error') => void;
  onNavigate?: (tab: string) => void;
  isCopilotOpen?: boolean;
  onToggleCopilot?: () => void;
}

type StudioTab = 'code' | 'dag';

/* ── Simple Fast Python Syntax Highlighter Tokenizer ─────────────────── */
function highlightPythonLine(line: string) {
  const commentIdx = line.indexOf('#');
  let codePart = line;
  let commentPart = '';
  if (commentIdx !== -1) {
    codePart = line.substring(0, commentIdx);
    commentPart = line.substring(commentIdx);
  }

  const tokenRegex =
    /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:import|from|as|def|return|class|if|else|elif|try|except|with|in|for|while|pass|break|continue|lambda|yield|None|True|False|and|or|not|is)\b|\b(?:Pipeline|StandardScaler|MinMaxScaler|RobustScaler|SimpleImputer|train_test_split|mean_squared_error|mean_absolute_error|r2_score|accuracy_score|f1_score|fit|predict|transform|score|print|len|range)\b|\b\d+(?:\.\d+)?\b|[=()[\],:{}+*/-])/g;

  const parts: { text: string; type: string }[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(codePart)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: codePart.substring(lastIndex, match.index), type: 'plain' });
    }
    const token = match[0];
    let type = 'plain';

    if (token.startsWith('"') || token.startsWith("'")) {
      type = 'string';
    } else if (/^(import|from|as|def|return|class|if|else|elif|try|except|with|in|for|while|pass|break|continue|lambda|yield|None|True|False|and|or|not|is)$/.test(token)) {
      type = 'keyword';
    } else if (/^(Pipeline|StandardScaler|MinMaxScaler|RobustScaler|SimpleImputer|train_test_split|mean_squared_error|mean_absolute_error|r2_score|accuracy_score|f1_score|fit|predict|transform|score|print|len|range)$/.test(token)) {
      type = 'builtin';
    } else if (/^\d+(?:\.\d+)?$/.test(token)) {
      type = 'number';
    } else if (/^[=()[\],:{}+*/-]$/.test(token)) {
      type = 'operator';
    }

    parts.push({ text: token, type });
    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < codePart.length) {
    parts.push({ text: codePart.substring(lastIndex), type: 'plain' });
  }

  return (
    <>
      {parts.map((p, i) => {
        let color = '#E2E8F0';
        let fontWeight = 400;

        if (p.type === 'keyword') {
          color = '#C792EA';
          fontWeight = 600;
        } else if (p.type === 'builtin') {
          color = '#82AAFF';
          fontWeight = 600;
        } else if (p.type === 'string') {
          color = '#C3E88D';
        } else if (p.type === 'number') {
          color = '#F78C6C';
        } else if (p.type === 'operator') {
          color = '#89DDFF';
        }

        return (
          <span key={i} style={{ color, fontWeight }}>
            {p.text}
          </span>
        );
      })}
      {commentPart && (
        <span style={{ color: '#697098', fontStyle: 'italic' }}>{commentPart}</span>
      )}
    </>
  );
}

/* ── Pipeline Branching SVG DAG Component ─────────────────────────── */
interface PipelineDAGGraphProps {
  datasetName: string;
  imputer: string;
  scaler: string;
  algorithm: string;
  trainRatio: number;
  testRatio: number;
  cvFolds: number;
  rawRowCount: number;
  inferredTaskType?: string;
}

function PipelineDAGGraph({
  datasetName,
  imputer,
  scaler,
  algorithm,
  trainRatio,
  testRatio,
  cvFolds,
  rawRowCount,
  inferredTaskType = 'supervised',
}: PipelineDAGGraphProps) {
  const [activeNode, setActiveNode] = useState<string | null>(null);

  const W = 500, CX = 250, LCX = 112, RCX = 388, NW = 310, BNW = 195, NH = 52, R = 9;
  const Y1 = 10, Y2 = 115, Y3 = 215, Y4 = 330, Y5 = 440, Y6 = 553;
  const SVG_H = Y6 + NH + 16;

  const trainN = rawRowCount > 0 ? Math.round(rawRowCount * trainRatio) : 0;
  const testN  = rawRowCount > 0 ? rawRowCount - trainN : 0;

  const scalerLabel = scaler === 'standard_scaler' ? 'StandardScaler'
    : scaler === 'minmax_scaler' ? 'MinMaxScaler'
    : scaler === 'robust_scaler' ? 'RobustScaler'
    : scaler === 'none' ? 'Passthrough'
    : scaler;

  const algLabel = algorithm
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase())
    .slice(0, 24);

  const na = (id: string, strokeColor: string) => ({
    fill:        activeNode === id ? 'rgba(75,59,124,0.30)' : 'rgba(21,16,38,0.92)',
    stroke:      activeNode === id ? BB.primaryLight : strokeColor,
    strokeWidth: activeNode === id ? 1.8 : 1,
    style:       { cursor: 'pointer', transition: 'fill 150ms, stroke 150ms' } as React.CSSProperties,
  });

  type EdgeDef = { id: string; d: string; color: string; delay: string; dur: string };
  const edges: EdgeDef[] = [
    { id: 'e1', d: `M ${CX} ${Y1+NH} L ${CX} ${Y2}`,                                                                    color: BB.primaryLight, delay: '0s',   dur: '1.8s' },
    { id: 'e2', d: `M ${CX} ${Y2+NH} L ${CX} ${Y3}`,                                                                    color: BB.primaryLight, delay: '0.3s', dur: '1.8s' },
    { id: 'e3', d: `M ${CX} ${Y3+NH} C ${CX} ${Y3+NH+26}, ${LCX} ${Y4-26}, ${LCX} ${Y4}`,                              color: BB.maroonLight,  delay: '0.6s', dur: '1.5s' },
    { id: 'e4', d: `M ${CX} ${Y3+NH} C ${CX} ${Y3+NH+26}, ${RCX} ${Y4-26}, ${RCX} ${Y4}`,                              color: BB.gold,         delay: '0.6s', dur: '1.5s' },
    { id: 'e5', d: `M ${LCX} ${Y4+NH} L ${LCX} ${Y5}`,                                                                  color: BB.maroonLight,  delay: '1.0s', dur: '1.5s' },
    { id: 'e6', d: `M ${RCX} ${Y4+NH} L ${RCX} ${Y5}`,                                                                  color: BB.gold,         delay: '1.0s', dur: '1.5s' },
    { id: 'e7', d: `M ${LCX} ${Y5+NH} C ${LCX} ${Y5+NH+26}, ${CX} ${Y6-26}, ${CX} ${Y6}`,                              color: BB.success,      delay: '1.5s', dur: '1.4s' },
    { id: 'e8', d: `M ${RCX} ${Y5+NH} C ${RCX} ${Y5+NH+26}, ${CX} ${Y6-26}, ${CX} ${Y6}`,                              color: BB.success,      delay: '1.5s', dur: '1.4s' },
  ];

  const detail: Record<string, string> = {
    d:   `Source: ${datasetName}${rawRowCount > 0 ? ` · ${rawRowCount.toLocaleString()} rows` : ''} · ${inferredTaskType} task`,
    imp: `SimpleImputer fills NaN using strategy="${imputer}". Applied before scaling to prevent leakage.`,
    sc:  `${scalerLabel} normalises feature ranges. Fitted on X_train only, then applied to X_test.`,
    tr:  `Train partition: ${Math.round(trainRatio*100)}% of rows. The only data the model sees during .fit().`,
    te:  `Test holdout: ${Math.round(testRatio*100)}% of rows. Never seen during training. Used for final scoring.`,
    al:  `${algLabel}: calls .fit(X_train, y_train) to learn decision boundaries from training data.`,
    pr:  `.predict(X_test) runs inference on the holdout set to measure generalisation performance.`,
    ev:  `${cvFolds}-fold cross-validation on training data. Final metrics scored against X_test predictions.`,
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: '100%',
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: '16px 20px',
        boxSizing: 'border-box',
        flex: 1,
        minHeight: 0,
        gap: 12,
      }}
    >
      <svg
        viewBox={`0 0 ${W} ${SVG_H}`}
        style={{ width: '100%', maxWidth: 520, fontFamily: 'var(--font-mono)' }}
        aria-label="Pipeline DAG visualisation"
      >
        <defs>
          <style>{`
            @keyframes dag-flow { to { stroke-dashoffset: -18; } }
          `}</style>
        </defs>

        {/* Edges */}
        {edges.map((e) => (
          <path
            key={e.id}
            d={e.d}
            fill="none"
            stroke={e.color + '88'}
            strokeWidth={1.8}
            strokeDasharray="5 4"
            style={{ animation: `dag-flow ${e.dur} linear infinite`, animationDelay: e.delay }}
          />
        ))}

        {/* Node 1: Dataset */}
        <g onMouseEnter={() => setActiveNode('d')} onMouseLeave={() => setActiveNode(null)}>
          <rect x={CX - NW/2} y={Y1} width={NW} height={NH} rx={R} {...na('d', BB.gold)} />
          <text x={CX} y={Y1+14} textAnchor="middle" fill={BB.disabled} fontSize={8} fontWeight={700} letterSpacing={1.2}>DATASET SOURCE</text>
          <text x={CX} y={Y1+30} textAnchor="middle" fill={BB.gold} fontSize={11} fontWeight={700}>{datasetName.length > 36 ? datasetName.slice(0, 34) + '…' : datasetName}</text>
          <text x={CX} y={Y1+46} textAnchor="middle" fill={BB.disabled} fontSize={9}>{rawRowCount > 0 ? `${rawRowCount.toLocaleString()} rows · ${inferredTaskType} task` : `${inferredTaskType} task`}</text>
        </g>

        {/* Node 2: Imputer */}
        <g onMouseEnter={() => setActiveNode('imp')} onMouseLeave={() => setActiveNode(null)}>
          <rect x={CX - NW/2} y={Y2} width={NW} height={NH} rx={R} {...na('imp', BB.primaryLight)} />
          <text x={CX} y={Y2+14} textAnchor="middle" fill={BB.disabled} fontSize={8} fontWeight={700} letterSpacing={1.2}>STEP 01 · IMPUTATION</text>
          <text x={CX} y={Y2+30} textAnchor="middle" fill={BB.primaryLight} fontSize={11} fontWeight={700}>SimpleImputer</text>
          <text x={CX} y={Y2+46} textAnchor="middle" fill={BB.disabled} fontSize={9}>{'strategy="' + imputer + '"'}</text>
        </g>

        {/* Node 3: Scaler */}
        <g onMouseEnter={() => setActiveNode('sc')} onMouseLeave={() => setActiveNode(null)}>
          <rect x={CX - NW/2} y={Y3} width={NW} height={NH} rx={R} {...na('sc', BB.primaryLight)} />
          <text x={CX} y={Y3+14} textAnchor="middle" fill={BB.disabled} fontSize={8} fontWeight={700} letterSpacing={1.2}>STEP 02 · SCALING</text>
          <text x={CX} y={Y3+30} textAnchor="middle" fill={BB.primaryLight} fontSize={11} fontWeight={700}>{scalerLabel}</text>
          <text x={CX} y={Y3+46} textAnchor="middle" fill={BB.disabled} fontSize={9}>fit on X_train · transform on X_test</text>
        </g>

        {/* Split label */}
        <text x={CX} y={(Y3+NH + Y4)/2 + 4} textAnchor="middle" fill={BB.disabled} fontSize={8} letterSpacing={0.8}>
          {'train_test_split(test_size=' + testRatio.toFixed(2) + ', random_state=42)'}
        </text>

        {/* Node 4: X_train */}
        <g onMouseEnter={() => setActiveNode('tr')} onMouseLeave={() => setActiveNode(null)}>
          <rect x={LCX - BNW/2} y={Y4} width={BNW} height={NH} rx={R} {...na('tr', BB.maroonLight)} />
          <text x={LCX} y={Y4+14} textAnchor="middle" fill={BB.disabled} fontSize={8} fontWeight={700} letterSpacing={1.2}>TRAIN SPLIT</text>
          <text x={LCX} y={Y4+30} textAnchor="middle" fill={BB.maroonLight} fontSize={11} fontWeight={700}>X_train / y_train</text>
          <text x={LCX} y={Y4+46} textAnchor="middle" fill={BB.disabled} fontSize={9}>{trainN > 0 ? `~${trainN.toLocaleString()} rows (${Math.round(trainRatio*100)}%)` : `${Math.round(trainRatio*100)}%`}</text>
        </g>

        {/* Node 5: X_test */}
        <g onMouseEnter={() => setActiveNode('te')} onMouseLeave={() => setActiveNode(null)}>
          <rect x={RCX - BNW/2} y={Y4} width={BNW} height={NH} rx={R} {...na('te', BB.gold)} />
          <text x={RCX} y={Y4+14} textAnchor="middle" fill={BB.disabled} fontSize={8} fontWeight={700} letterSpacing={1.2}>TEST HOLDOUT</text>
          <text x={RCX} y={Y4+30} textAnchor="middle" fill={BB.gold} fontSize={11} fontWeight={700}>X_test / y_test</text>
          <text x={RCX} y={Y4+46} textAnchor="middle" fill={BB.disabled} fontSize={9}>{testN > 0 ? `~${testN.toLocaleString()} rows (${Math.round(testRatio*100)}%)` : `${Math.round(testRatio*100)}%`}</text>
        </g>

        {/* Node 6: Algorithm fit */}
        <g onMouseEnter={() => setActiveNode('al')} onMouseLeave={() => setActiveNode(null)}>
          <rect x={LCX - BNW/2} y={Y5} width={BNW} height={NH} rx={R} {...na('al', BB.gold)} />
          <text x={LCX} y={Y5+14} textAnchor="middle" fill={BB.disabled} fontSize={8} fontWeight={700} letterSpacing={1.2}>STEP 03 · FIT</text>
          <text x={LCX} y={Y5+30} textAnchor="middle" fill={BB.gold} fontSize={10} fontWeight={700}>{algLabel}</text>
          <text x={LCX} y={Y5+46} textAnchor="middle" fill={BB.disabled} fontSize={9}>.fit(X_train, y_train)</text>
        </g>

        {/* Node 7: Predict */}
        <g onMouseEnter={() => setActiveNode('pr')} onMouseLeave={() => setActiveNode(null)}>
          <rect x={RCX - BNW/2} y={Y5} width={BNW} height={NH} rx={R} {...na('pr', BB.success)} />
          <text x={RCX} y={Y5+14} textAnchor="middle" fill={BB.disabled} fontSize={8} fontWeight={700} letterSpacing={1.2}>STEP 04 · PREDICT</text>
          <text x={RCX} y={Y5+30} textAnchor="middle" fill={BB.success} fontSize={11} fontWeight={700}>.predict(X_test)</text>
          <text x={RCX} y={Y5+46} textAnchor="middle" fill={BB.disabled} fontSize={9}>y_pred → evaluate</text>
        </g>

        {/* Node 8: Evaluation */}
        <g onMouseEnter={() => setActiveNode('ev')} onMouseLeave={() => setActiveNode(null)}>
          <rect x={CX - NW/2} y={Y6} width={NW} height={NH} rx={R} {...na('ev', BB.success)} />
          <text x={CX} y={Y6+14} textAnchor="middle" fill={BB.disabled} fontSize={8} fontWeight={700} letterSpacing={1.2}>STEP 05 · EVALUATION</text>
          <text x={CX} y={Y6+30} textAnchor="middle" fill={BB.success} fontSize={11} fontWeight={700}>Metrics & Cross-Validation</text>
          <text x={CX} y={Y6+46} textAnchor="middle" fill={BB.disabled} fontSize={9}>{cvFolds}-fold K-Fold CV · model.joblib serialisation</text>
        </g>
      </svg>

      {/* Node inspector callout */}
      {activeNode && (
        <div
          style={{
            padding: '8px 14px',
            borderRadius: 7,
            background: BB.elevated,
            border: `1px solid ${BB.border}`,
            fontSize: 10,
            color: BB.muted,
            maxWidth: 500,
            width: '100%',
            textAlign: 'center',
            lineHeight: 1.5,
            boxSizing: 'border-box',
          }}
        >
          {detail[activeNode]}
        </div>
      )}
    </div>
  );
}

export function ViewAsCodeStudio({
  onShowToast,
  onNavigate,
  isCopilotOpen = false,
  onToggleCopilot,
}: ViewAsCodeStudioProps) {
  /* ── Canonical state – single source of truth for all config values ── */
  const {
    dataset,
    selectedTarget,
    selectedFeatures,
    trainingConfig,
    setTrainingConfig,
    inferredTaskType,
    setLifecycleStage,
    activeJob,
    setActiveJob,
  } = useProject();

  /* ── Available training options (fetched list; NOT config values) ─── */
  const [trainingOptions, setTrainingOptions] = useState<TrainingOptions>({
    algorithms: [
      { key: 'random_forest_classifier',    display_name: 'Random Forest Classifier',    task_type: 'classification' },
      { key: 'logistic_regression',          display_name: 'Logistic Regression',          task_type: 'classification' },
      { key: 'decision_tree_classifier',     display_name: 'Decision Tree Classifier',     task_type: 'classification' },
      { key: 'gradient_boosting_classifier', display_name: 'Gradient Boosting Classifier', task_type: 'classification' },
      { key: 'linear_regression',            display_name: 'Linear Regression',            task_type: 'regression' },
      { key: 'random_forest_regressor',      display_name: 'Random Forest Regressor',      task_type: 'regression' },
      { key: 'gradient_boosting_regressor',  display_name: 'Gradient Boosting Regressor',  task_type: 'regression' },
    ],
    scalers: [
      { key: 'standard_scaler', display_name: 'Standard Scaler' },
      { key: 'minmax_scaler',   display_name: 'MinMax Scaler [0, 1]' },
      { key: 'robust_scaler',   display_name: 'Robust Scaler (IQR)' },
      { key: 'none',            display_name: 'None (Passthrough)' },
    ],
    imputers: [
      { key: 'median',        display_name: 'Median Imputer' },
      { key: 'mean',          display_name: 'Mean Imputer' },
      { key: 'most_frequent', display_name: 'Most Frequent / Mode' },
      { key: 'constant_zero', display_name: 'Constant Zero' },
    ],
    default_cv_folds: 5,
    default_train_test_split: 0.8,
    min_train_test_split: 0.5,
    max_train_test_split: 0.95,
  });

  /* ── Studio view mode: 'code' (Python Editor) or 'dag' (Visual Pipeline Flow) ─ */
  const [activeTab, setActiveTab] = useState<StudioTab>('code');

  /* ── Code generation state ──────────────────────────────────────────── */
  const [generatedCode, setGeneratedCode] = useState<string>('');
  const [, setStepExplanations] = useState<CodeStepExplanation[]>([]);
  const [isValidSyntax, setIsValidSyntax] = useState<boolean | null>(null);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  /* ── Feature Search in Inspector ────────────────────────────────────── */
  const [featureSearch, setFeatureSearch] = useState('');

  /* ── Derived: canonical config values ───────────────────────────────── */
  const trainRatio         = trainingConfig?.train_test_split ?? 0.8;
  const testRatio          = 1 - trainRatio;
  const canonicalAlgorithm = trainingConfig?.algorithm ?? '';
  const canonicalScaler    = trainingConfig?.scaler    ?? '';
  const canonicalImputer   = trainingConfig?.imputer   ?? '';
  const canonicalCvFolds   = trainingConfig?.cv_folds  ?? 5;

  /* ── Derived: dataset display info ─────────────────────────────────── */
  const activeDatasetName = useMemo(
    () =>
      dataset?.fileName ||
      (dataset as any)?.original_filename ||
      trainingConfig?.dataset_name ||
      'No Dataset',
    [dataset, trainingConfig],
  );



  const rawRowCount = dataset?.rowCount || dataset?.rows?.length || 0;

  const datasetColCount = useMemo(() => {
    if (dataset?.columns?.length) return dataset.columns.length;
    const featCount = selectedFeatures.length || trainingConfig?.feature_columns?.length || 0;
    return featCount > 0 ? featCount + (selectedTarget ? 1 : 0) : '—';
  }, [dataset, selectedFeatures, selectedTarget, trainingConfig]);

  /* ── Derived: algorithm list filtered to task-compatible options only ─ */
  const taskFilteredAlgorithms = useMemo(() => {
    if (!inferredTaskType) return trainingOptions.algorithms;
    return trainingOptions.algorithms.filter((a) => a.task_type === inferredTaskType);
  }, [trainingOptions.algorithms, inferredTaskType]);

  /* ── Pipeline validation guard (pre-generation) ─────────────────────── */
  const validationErrors = useMemo<string[]>(() => {
    const errors: string[] = [];
    if (!dataset && !trainingConfig) {
      errors.push('No dataset loaded. Go to Dataset Workspace to upload a dataset.');
    }
    const target   = selectedTarget || trainingConfig?.target_column;
    const features = selectedFeatures.length > 0 ? selectedFeatures : (trainingConfig?.feature_columns ?? []);
    if (!target) errors.push('No target column selected. Choose a target in Dataset Workspace.');
    if (features.length === 0) errors.push('No feature columns selected. Choose features in Dataset Workspace.');
    if (target && features.includes(target)) errors.push('Target column cannot also be a feature column.');
    if (trainRatio < 0.5 || trainRatio > 0.95) errors.push('Train ratio must be between 50% and 95%.');
    return errors;
  }, [dataset, trainingConfig, selectedTarget, selectedFeatures, trainRatio]);

  const isConfigValid = validationErrors.length === 0;

  /** True when a usable pipeline configuration exists (for empty-state check). */
  const hasUsableConfig = Boolean(
    (dataset || trainingConfig) && (selectedTarget || trainingConfig?.target_column),
  );

  /* ── Mount: set lifecycle stage + fetch available training options ───── */
  useEffect(() => {
    setLifecycleStage('pipeline');
    fetchTrainingOptions().then(setTrainingOptions).catch(() => {});
  }, [setLifecycleStage]);

  /* ── Handlers: editable fields write back to canonical trainingConfig ── */
  const handleAlgorithmChange = useCallback(
    (newKey: string) => {
      if (!trainingConfig) return;
      setTrainingConfig({ ...trainingConfig, algorithm: newKey, selection_source: 'manual' });
    },
    [trainingConfig, setTrainingConfig],
  );

  const handleScalerChange = useCallback(
    (newKey: string) => {
      if (!trainingConfig) return;
      setTrainingConfig({ ...trainingConfig, scaler: newKey });
    },
    [trainingConfig, setTrainingConfig],
  );

  const handleImputerChange = useCallback(
    (newKey: string) => {
      if (!trainingConfig) return;
      setTrainingConfig({ ...trainingConfig, imputer: newKey });
    },
    [trainingConfig, setTrainingConfig],
  );

  const handleSplitChange = useCallback(
    (newTrainRatio: number) => {
      if (!trainingConfig) return;
      setTrainingConfig({ ...trainingConfig, train_test_split: newTrainRatio });
    },
    [trainingConfig, setTrainingConfig],
  );

  const handleCvFoldsChange = useCallback(
    (folds: number) => {
      if (!trainingConfig) return;
      setTrainingConfig({ ...trainingConfig, cv_folds: folds });
    },
    [trainingConfig, setTrainingConfig],
  );

  /* ── Code generation – reads ONLY from canonical context state ───────── */
  const generatePipelineCode = useCallback(async () => {
    if (!isConfigValid) return;

    setIsGenerating(true);
    setGenerationError(null);
    setAuthError(null);

    const target   = selectedTarget || trainingConfig!.target_column;
    const features = (
      selectedFeatures.length > 0 ? selectedFeatures : (trainingConfig!.feature_columns ?? [])
    ).filter((f) => f !== target && !isColumnIdentifier(f));

    const dag: PipelineDAG = {
      dataset_name:    dataset?.fileName || trainingConfig!.dataset_name || 'dataset.csv',
      target_column:   target || 'target',
      feature_columns: features.length > 0 ? features : ['feature1', 'feature2'],
      nodes: [
        {
          node_id: 'n1',
          type:    'missing_value_handler',
          name:    'Simple Imputer',
          params:  { strategy: canonicalImputer || 'median' },
        },
        {
          node_id: 'n2',
          type:    'scaler',
          name:    'Feature Scaler',
          params:  { scaler_type: canonicalScaler || 'standard_scaler', type: canonicalScaler || 'standard_scaler' },
        },
        {
          node_id: 'n3',
          type:    'train_test_split',
          name:    'Train-Test Split',
          params:  { test_size: testRatio, random_seed: trainingConfig!.random_seed ?? 42 },
        },
        {
          node_id: 'n4',
          type:    'algorithm',
          name:    'ML Estimator',
          params:  {
            algorithm: canonicalAlgorithm || 'random_forest_classifier',
            type:      canonicalAlgorithm || 'random_forest_classifier',
          },
        },
      ],
    };

    try {
      const resp = await PipelineService.generateCode(dag, true, true);
      setGeneratedCode(resp.python_code);
      setStepExplanations(resp.steps_explanation || []);
      setIsValidSyntax(resp.is_valid_syntax);
    } catch (err: unknown) {
      setIsValidSyntax(false);
      setGeneratedCode('');
      if (err instanceof AuthExpiredError) {
        setAuthError('Session expired. Please log in again to generate pipeline code.');
      } else if (err instanceof ApiTimeoutError) {
        setGenerationError('Backend unavailable. The code generation service timed out. Please try again.');
      } else {
        const msg =
          (err as any)?.detail ||
          (err as any)?.message ||
          'Code generation failed. Check the pipeline configuration and try again.';
        setGenerationError(msg);
      }
    } finally {
      setIsGenerating(false);
    }
  }, [
    isConfigValid,
    selectedTarget,
    selectedFeatures,
    trainingConfig,
    dataset,
    canonicalAlgorithm,
    canonicalScaler,
    canonicalImputer,
    testRatio,
  ]);

  useEffect(() => {
    generatePipelineCode();
  }, [generatePipelineCode, refreshTrigger]);

  /* ── Copy code to clipboard ─────────────────────────────────────────── */
  const handleCopyCode = async () => {
    if (!generatedCode) return;
    try {
      await navigator.clipboard.writeText(generatedCode);
      setCopied(true);
      onShowToast?.('Code Copied', 'Scikit-learn pipeline script copied to clipboard.', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      onShowToast?.('Copy Error', 'Failed to copy code to clipboard.', 'error');
    }
  };

  /* ── Download Python script (.py) ────────────────────────────────────── */
  const handleDownloadScript = () => {
    if (!generatedCode) return;
    try {
      const blob = new Blob([generatedCode], { type: 'text/x-python;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safeName = activeDatasetName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
      a.href = url;
      a.download = `pipeline_${safeName}.py`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onShowToast?.('Download Complete', `Saved pipeline_${safeName}.py`, 'success');
    } catch {
      onShowToast?.('Download Error', 'Could not export Python script file.', 'error');
    }
  };

  /* ── Code Lines for Editor View ─────────────────────────────────────── */
  const codeLines = useMemo(() => {
    if (!generatedCode) return [];
    return generatedCode.split('\n');
  }, [generatedCode]);

  /* ── AI Copilot messages ─────────────────────────────────────────────── */
  const copilotMessages = useMemo<CopilotMsg[]>(() => {
    const msgs: CopilotMsg[] = [];
    const target   = selectedTarget || trainingConfig?.target_column;
    const features = selectedFeatures.length > 0 ? selectedFeatures : (trainingConfig?.feature_columns ?? []);

    msgs.push({
      id:   'pipeline-target',
      type: 'tip',
      text: `Supervised target variable: **${target || 'not set'}** (${inferredTaskType || 'supervised learning'}).`,
    });

    const excludedIds = (dataset?.columns || []).filter((c) => isColumnIdentifier(c));
    if (excludedIds.length > 0) {
      msgs.push({
        id:   'pipeline-id-leakage',
        type: 'warning',
        text: `Identifier column **${excludedIds.join(', ')}** safely excluded from feature matrix to prevent data leakage.`,
      });
    }

    msgs.push({
      id:   'pipeline-features',
      type: 'info',
      text: `**${features.length} features** transformed via **${canonicalImputer || 'median'}** imputation and **${canonicalScaler || 'standard_scaler'}** scaling.`,
    });

    msgs.push({
      id:   'pipeline-model',
      type: 'info',
      text: `Model architecture: **${canonicalAlgorithm || 'not set'}** with **${Math.round(testRatio * 100)}% test split** (${canonicalCvFolds}-fold CV).`,
    });

    if (isValidSyntax) {
      msgs.push({ id: 'ast-ok', type: 'tip', text: `Python AST syntax **passed validation**. Pipeline is standalone and executable.` });
    } else if (isValidSyntax === false) {
      msgs.push({ id: 'ast-err', type: 'warning', text: `Code generation encountered an issue. Check pipeline nodes and parameters.` });
    }

    return msgs;
  }, [selectedTarget, selectedFeatures, trainingConfig, dataset, canonicalAlgorithm, canonicalScaler, canonicalImputer, testRatio, canonicalCvFolds, inferredTaskType, isValidSyntax]);

  /* ── 1. Intentional Empty State ─────────────────────────────────────── */
  if (!hasUsableConfig) {
    return (
      <div
        role="region"
        aria-label="Empty Pipeline Studio"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          padding: 32,
          textAlign: 'center',
          background: `radial-gradient(ellipse at 50% 30%, rgba(75,59,124,0.18) 0%, ${BB.base} 70%)`,
          borderRadius: 14,
          border: `1px solid ${BB.border}`,
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 18,
            background: 'linear-gradient(135deg, rgba(107,92,166,0.25), rgba(110,20,35,0.25))',
            border: `1px solid ${BB.primaryLight}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 20,
            boxShadow: '0 8px 32px rgba(107,92,166,0.3)',
          }}
        >
          <Workflow style={{ width: 32, height: 32, color: BB.gold }} />
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: BB.text, margin: '0 0 10px', letterSpacing: '-0.01em' }}>
          No active dataset or training configuration
        </h2>
        <p style={{ fontSize: 13, color: BB.muted, maxWidth: 480, margin: '0 0 24px', lineHeight: 1.6 }}>
          Upload a dataset and select your target and features in the Dataset Workspace to start generating production-ready scikit-learn pipeline code and interactive DAGs.
        </p>
        <button
          onClick={() => onNavigate?.('workspace')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 22px',
            borderRadius: 9,
            background: `linear-gradient(135deg, ${BB.primary} 0%, ${BB.maroon} 100%)`,
            border: `1px solid ${BB.primaryLight}`,
            color: BB.text,
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 6px 20px rgba(110,20,35,0.4)',
            transition: 'transform 150ms ease, box-shadow 150ms ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.boxShadow = '0 8px 24px rgba(110,20,35,0.5)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 6px 20px rgba(110,20,35,0.4)';
          }}
        >
          <Database style={{ width: 16, height: 16 }} />
          <span>Go to Dataset and Profiler</span>
        </button>
      </div>
    );
  }

  /* ── Filtered feature column list ───────────────────────────────────── */
  const allFeatures = selectedFeatures.length > 0 ? selectedFeatures : (trainingConfig?.feature_columns ?? []);
  const displayedFeatures = featureSearch
    ? allFeatures.filter((f) => f.toLowerCase().includes(featureSearch.toLowerCase()))
    : allFeatures;

  /* ── 2. Main Studio Canvas ───────────────────────────────────────────── */
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        width: '100%',
        height: '100%',
        position: 'relative',
        boxSizing: 'border-box',
        overflow: 'hidden',
        background: BB.base,
        gap: 10,
      }}
    >
      {/* ── TOP STUDIO COMMAND STRIP ───────────────────────────────────── */}
      <div
        style={{
          background: BB.surface,
          border: `1px solid ${BB.border}`,
          borderRadius: 10,
          padding: '8px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexShrink: 0,
          boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
        }}
      >
        {/* Left: Breadcrumbs & Status Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 8px',
              borderRadius: 6,
              background: 'rgba(201, 162, 75, 0.12)',
              border: `1px solid rgba(201, 162, 75, 0.3)`,
              color: BB.gold,
              fontSize: 11,
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
            }}
          >
            <Database style={{ width: 13, height: 13 }} />
            <span style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {activeDatasetName}
            </span>
          </div>

          <ChevronRight style={{ width: 12, height: 12, color: BB.disabled, flexShrink: 0 }} />

          {/* Task Type Pill */}
          {inferredTaskType && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '3px 8px',
                borderRadius: 5,
                background: inferredTaskType === 'regression' ? 'rgba(201,162,75,0.14)' : 'rgba(124,107,174,0.18)',
                border: `1px solid ${inferredTaskType === 'regression' ? 'rgba(201,162,75,0.45)' : 'rgba(124,107,174,0.45)'}`,
                color: inferredTaskType === 'regression' ? BB.goldLight : BB.primaryLight,
                fontSize: 10,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              <Cpu style={{ width: 11, height: 11 }} />
              {inferredTaskType}
            </span>
          )}

          {/* AST Syntax Validation Pill */}
          {isValidSyntax === true && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '3px 8px',
                borderRadius: 5,
                background: 'rgba(34, 197, 94, 0.12)',
                border: '1px solid rgba(34, 197, 94, 0.35)',
                color: BB.success,
                fontSize: 10,
                fontWeight: 600,
                fontFamily: 'var(--font-mono)',
              }}
            >
              <CheckCircle2 style={{ width: 12, height: 12 }} />
              Python 3.10 AST Validated
            </span>
          )}

          {isGenerating && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '3px 8px',
                borderRadius: 5,
                background: 'rgba(201, 162, 75, 0.1)',
                border: '1px solid rgba(201, 162, 75, 0.25)',
                color: BB.gold,
                fontSize: 10,
                fontWeight: 600,
              }}
            >
              <RefreshCw style={{ width: 11, height: 11, animation: 'spin 1s linear infinite' }} />
              Compiling...
            </span>
          )}
        </div>

        {/* Right: View Switcher & Action Tools */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* View Tab Switcher: Code vs DAG */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: BB.elevated,
              border: `1px solid ${BB.border}`,
              borderRadius: 6,
              padding: 2,
              gap: 2,
            }}
          >
            <button
              onClick={() => setActiveTab('code')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 10px',
                borderRadius: 4,
                border: 'none',
                background: activeTab === 'code' ? BB.primary : 'transparent',
                color: activeTab === 'code' ? BB.text : BB.muted,
                fontSize: 11,
                fontWeight: activeTab === 'code' ? 700 : 500,
                cursor: 'pointer',
                transition: 'all 120ms ease',
              }}
            >
              <FileCode style={{ width: 12, height: 12 }} />
              <span>Python Script</span>
            </button>
            <button
              onClick={() => setActiveTab('dag')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 10px',
                borderRadius: 4,
                border: 'none',
                background: activeTab === 'dag' ? BB.primary : 'transparent',
                color: activeTab === 'dag' ? BB.text : BB.muted,
                fontSize: 11,
                fontWeight: activeTab === 'dag' ? 700 : 500,
                cursor: 'pointer',
                transition: 'all 120ms ease',
              }}
            >
              <GitBranch style={{ width: 12, height: 12 }} />
              <span>Visual DAG Flow</span>
            </button>
          </div>

          <div style={{ width: 1, height: 18, background: BB.border }} />

          {/* Recompile Button */}
          <button
            onClick={() => setRefreshTrigger((prev) => prev + 1)}
            disabled={!isConfigValid || isGenerating}
            title="Recompile Python scikit-learn code"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '5px 9px',
              borderRadius: 6,
              background: BB.elevated,
              border: `1px solid ${BB.border}`,
              color: BB.muted,
              fontSize: 11,
              fontWeight: 600,
              cursor: isConfigValid && !isGenerating ? 'pointer' : 'not-allowed',
              transition: 'all 120ms ease',
            }}
          >
            <RefreshCw style={{ width: 12, height: 12, animation: isGenerating ? 'spin 1s linear infinite' : 'none' }} />
            <span>Recompile</span>
          </button>

          {/* Copy Code */}
          <button
            onClick={handleCopyCode}
            disabled={!generatedCode}
            title={copied ? 'Copied to clipboard!' : 'Copy Python code to clipboard'}
            aria-label="Copy Code"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '5px 9px',
              borderRadius: 6,
              background: copied ? 'rgba(34,197,94,0.18)' : BB.elevated,
              border: `1px solid ${copied ? 'rgba(34,197,94,0.45)' : BB.border}`,
              color: copied ? BB.success : BB.text,
              fontSize: 11,
              fontWeight: 600,
              cursor: generatedCode ? 'pointer' : 'not-allowed',
              transition: 'all 120ms ease',
            }}
          >
            {copied ? <Check style={{ width: 12, height: 12 }} /> : <Copy style={{ width: 12, height: 12 }} />}
            <span>{copied ? 'Copied!' : 'Copy'}</span>
          </button>

          {/* Download Script */}
          <button
            onClick={handleDownloadScript}
            disabled={!generatedCode}
            title="Download standalone Python script"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '5px 9px',
              borderRadius: 6,
              background: BB.elevated,
              border: `1px solid ${BB.border}`,
              color: BB.text,
              fontSize: 11,
              fontWeight: 600,
              cursor: generatedCode ? 'pointer' : 'not-allowed',
              transition: 'all 120ms ease',
            }}
          >
            <Download style={{ width: 12, height: 12 }} />
            <span>Export .py</span>
          </button>

          {/* Run Pipeline Button */}
          <button
            onClick={() => {
              if (!isValidSyntax) {
                onShowToast?.('Invalid Pipeline', 'Fix pipeline configuration before running.', 'error');
                return;
              }
              onNavigate?.('explainability');
            }}
            disabled={!isConfigValid || !isValidSyntax}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 14px',
              borderRadius: 6,
              background: (!isConfigValid || !isValidSyntax)
                ? BB.disabled
                : `linear-gradient(135deg, ${BB.maroon} 0%, #A01830 100%)`,
              border: 'none',
              color: BB.text,
              fontSize: 11,
              fontWeight: 700,
              cursor: (!isConfigValid || !isValidSyntax) ? 'not-allowed' : 'pointer',
              boxShadow: (!isConfigValid || !isValidSyntax) ? 'none' : '0 3px 12px rgba(110,20,35,0.4)',
              transition: 'all 150ms ease',
            }}
          >
            <Play style={{ width: 11, height: 11, fill: 'currentColor' }} />
            <span>Run Pipeline</span>
          </button>
        </div>
      </div>

      {/* ── WORKSPACE BODY: INSPECTOR (LEFT) + CODE/DAG VIEW (RIGHT) ─── */}
      <div
        style={{
          display: 'flex',
          flex: 1,
          minHeight: 0,
          gap: 12,
          overflow: 'hidden',
        }}
      >
        {/* ── LEFT COLUMN: STUDIO INSPECTOR ──────────────────────────── */}
        <div
          style={{
            width: 360,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            overflowY: 'auto',
            paddingRight: 4,
          }}
        >
          {/* Active Training Job Live Telemetry Card */}
          {activeJob && (
            <div style={{ marginBottom: 4 }}>
              <TrainingJobCard
                job={activeJob}
                onJobUpdated={(updated) => setActiveJob(updated)}
                onJobRetried={(newJob) => setActiveJob(newJob)}
              />
            </div>
          )}

          {/* Card 1: Dataset & Blueprint Variables */}
          <div
            style={{
              background: BB.surface,
              border: `1px solid ${BB.border}`,
              borderRadius: 10,
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <FileSpreadsheet style={{ width: 13, height: 13, color: BB.gold }} />
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: BB.text }}>
                  Variable Blueprint
                </span>
              </div>
              <button
                onClick={() => onNavigate?.('workspace')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  fontSize: 9,
                  color: BB.primaryLight,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  fontWeight: 600,
                }}
              >
                <ArrowLeft style={{ width: 9, height: 9 }} /> Switch in Workspace
              </button>
            </div>

            {/* Target Variable Display */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: BB.disabled, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Lock style={{ width: 9, height: 9 }} /> Target Column (y)
                </span>
                <span style={{ fontSize: 9, color: BB.muted }}>Supervised label</span>
              </div>
              <div
                aria-label="Target column (read-only)"
                aria-readonly="true"
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  borderRadius: 6,
                  border: `1px solid ${BB.border}`,
                  background: BB.elevated,
                  color: (selectedTarget || trainingConfig?.target_column) ? BB.maroonLight : BB.disabled,
                  fontSize: 11,
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  boxSizing: 'border-box',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span>{selectedTarget || trainingConfig?.target_column || '—'}</span>
                <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'rgba(110,20,35,0.2)', color: BB.maroonLight, fontWeight: 600 }}>
                  Ground Truth
                </span>
              </div>
            </div>

            {/* Feature Matrix Display */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: BB.disabled, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Lock style={{ width: 9, height: 9 }} /> Feature Matrix (X)
                </span>
                <span style={{ fontSize: 9, color: BB.gold, fontWeight: 600 }}>
                  {allFeatures.length} columns ({datasetColCount} total)
                </span>
              </div>

              {allFeatures.length > 5 && (
                <input
                  type="text"
                  placeholder="Filter feature columns..."
                  value={featureSearch}
                  onChange={(e) => setFeatureSearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '4px 8px',
                    borderRadius: 5,
                    border: `1px solid ${BB.border}`,
                    background: BB.codeBg,
                    color: BB.text,
                    fontSize: 10,
                    outline: 'none',
                    marginBottom: 6,
                    boxSizing: 'border-box',
                  }}
                />
              )}

              <div
                aria-label="Feature columns (read-only)"
                style={{
                  width: '100%',
                  maxHeight: 100,
                  overflowY: 'auto',
                  padding: '6px 8px',
                  borderRadius: 6,
                  border: `1px solid ${BB.border}`,
                  background: BB.elevated,
                  boxSizing: 'border-box',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 4,
                  alignItems: 'flex-start',
                }}
              >
                {displayedFeatures.map((feat) => (
                  <span
                    key={feat}
                    style={{
                      display: 'inline-block',
                      padding: '2px 6px',
                      borderRadius: 4,
                      background: 'rgba(107,92,166,0.18)',
                      border: `1px solid ${BB.border}`,
                      color: BB.text,
                      fontSize: 9,
                      fontWeight: 600,
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {feat}
                  </span>
                ))}
                {displayedFeatures.length === 0 && (
                  <span style={{ fontSize: 9, color: BB.disabled }}>
                    {featureSearch ? 'No matching features' : 'No features selected'}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Card 2: Preprocessing Architecture */}
          <div
            style={{
              background: BB.surface,
              border: `1px solid ${BB.border}`,
              borderRadius: 10,
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Settings2 style={{ width: 13, height: 13, color: BB.primaryLight }} />
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: BB.text }}>
                Preprocessing Architecture
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {/* Missing Value Imputer */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 9,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: BB.disabled,
                    marginBottom: 3,
                  }}
                >
                  Imputer Strategy
                </label>
                <select
                  value={canonicalImputer}
                  onChange={(e) => handleImputerChange(e.target.value)}
                  disabled={!trainingConfig}
                  aria-label="Missing value imputer"
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    borderRadius: 6,
                    border: `1px solid ${BB.border}`,
                    background: BB.elevated,
                    color: BB.text,
                    fontSize: 10,
                    fontWeight: 600,
                    outline: 'none',
                    cursor: trainingConfig ? 'pointer' : 'not-allowed',
                  }}
                >
                  {trainingOptions.imputers.map((imp) => (
                    <option key={imp.key} value={imp.key}>
                      {imp.display_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Feature Scaler */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 9,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: BB.disabled,
                    marginBottom: 3,
                  }}
                >
                  Feature Scaler
                </label>
                <select
                  value={canonicalScaler}
                  onChange={(e) => handleScalerChange(e.target.value)}
                  disabled={!trainingConfig}
                  aria-label="Feature scaler"
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    borderRadius: 6,
                    border: `1px solid ${BB.border}`,
                    background: BB.elevated,
                    color: BB.text,
                    fontSize: 10,
                    fontWeight: 600,
                    outline: 'none',
                    cursor: trainingConfig ? 'pointer' : 'not-allowed',
                  }}
                >
                  {trainingOptions.scalers.map((sc) => (
                    <option key={sc.key} value={sc.key}>
                      {sc.display_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Card 3: ML Estimator Model Choice */}
          <div
            style={{
              background: BB.surface,
              border: `1px solid ${BB.border}`,
              borderRadius: 10,
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Cpu style={{ width: 13, height: 13, color: BB.gold }} />
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: BB.text }}>
                  Estimator Model Architecture
                </span>
              </div>
              {inferredTaskType && (
                <span style={{ fontSize: 9, color: BB.muted, textTransform: 'capitalize' }}>
                  {inferredTaskType} Models
                </span>
              )}
            </div>

            <div>
              <select
                value={canonicalAlgorithm}
                onChange={(e) => handleAlgorithmChange(e.target.value)}
                disabled={!trainingConfig}
                aria-label="ML estimator algorithm"
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  borderRadius: 6,
                  border: `1px solid ${BB.border}`,
                  background: BB.elevated,
                  color: BB.gold,
                  fontSize: 11,
                  fontWeight: 700,
                  outline: 'none',
                  cursor: trainingConfig ? 'pointer' : 'not-allowed',
                }}
              >
                {taskFilteredAlgorithms.map((algo) => (
                  <option key={algo.key} value={algo.key}>
                    {algo.display_name}
                  </option>
                ))}
              </select>
              {inferredTaskType && (
                <div style={{ fontSize: 8, color: BB.muted, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Info style={{ width: 9, height: 9, flexShrink: 0 }} />
                  <span>Filtered to task-compatible {inferredTaskType} estimators only.</span>
                </div>
              )}
            </div>
          </div>

          {/* Card 4: Split & Validation Strategy */}
          <div
            style={{
              background: BB.surface,
              border: `1px solid ${BB.border}`,
              borderRadius: 10,
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Sliders style={{ width: 13, height: 13, color: BB.maroonLight }} />
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: BB.text }}>
                Validation & Partition
              </span>
            </div>

            {/* Train / Test Split Slider */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 4 }}>
                <span style={{ color: BB.disabled, fontWeight: 700, textTransform: 'uppercase', fontSize: 9 }}>
                  Train / Test Split
                </span>
                <span
                  style={{ color: BB.gold, fontFamily: 'var(--font-mono)', fontWeight: 700 }}
                  aria-label={`${Math.round(trainRatio * 100)}% Train / ${Math.round(testRatio * 100)}% Test`}
                >
                  {Math.round(trainRatio * 100)}% Train / {Math.round(testRatio * 100)}% Test
                </span>
              </div>
              <input
                type="range"
                min={trainingOptions.min_train_test_split ?? 0.5}
                max={trainingOptions.max_train_test_split ?? 0.95}
                step={0.05}
                value={trainRatio}
                onChange={(e) => handleSplitChange(parseFloat(e.target.value))}
                disabled={!trainingConfig}
                aria-label={`Train/test split: ${Math.round(trainRatio * 100)}% train`}
                aria-valuemin={50}
                aria-valuemax={95}
                aria-valuenow={Math.round(trainRatio * 100)}
                style={{
                  width: '100%',
                  height: 6,
                  borderRadius: 3,
                  appearance: 'none',
                  outline: 'none',
                  accentColor: BB.maroonLight,
                  cursor: trainingConfig ? 'pointer' : 'not-allowed',
                  background: `linear-gradient(to right, ${BB.maroon} 0%, ${BB.maroon} ${
                    Math.max(0, Math.min(100, ((trainRatio - 0.5) / 0.45) * 100))
                  }%, rgba(107,92,166,0.25) ${
                    Math.max(0, Math.min(100, ((trainRatio - 0.5) / 0.45) * 100))
                  }%, rgba(107,92,166,0.25) 100%)`,
                }}
              />
              {rawRowCount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: BB.muted, marginTop: 4, fontFamily: 'var(--font-mono)' }}>
                  <span>~{Math.round(rawRowCount * trainRatio)} Train Samples</span>
                  <span>~{rawRowCount - Math.round(rawRowCount * trainRatio)} Test Samples</span>
                </div>
              )}
            </div>

            {/* Cross-Validation Folds */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                <label style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: BB.disabled }}>
                  Cross-Validation Folds
                </label>
                <span style={{ fontSize: 9, color: BB.muted, fontFamily: 'var(--font-mono)' }}>K-Fold Strategy</span>
              </div>
              <input
                type="number"
                min={2}
                max={20}
                value={canonicalCvFolds}
                onChange={(e) => handleCvFoldsChange(parseInt(e.target.value, 10) || 5)}
                disabled={!trainingConfig}
                aria-label="Cross-validation folds"
                style={{
                  width: '100%',
                  padding: '5px 8px',
                  borderRadius: 6,
                  border: `1px solid ${BB.border}`,
                  background: BB.elevated,
                  color: BB.text,
                  fontSize: 10,
                  fontFamily: 'var(--font-mono)',
                  outline: 'none',
                  boxSizing: 'border-box',
                  cursor: trainingConfig ? 'pointer' : 'not-allowed',
                }}
              />
            </div>
          </div>

          {/* Card 5: Pipeline Telemetry */}
          <div
            style={{
              background: BB.surface,
              border: `1px solid ${BB.border}`,
              borderRadius: 10,
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <ShieldCheck style={{ width: 13, height: 13, color: BB.success }} />
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: BB.text }}>
                Pipeline Telemetry
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
              {[
                {
                  label: 'Est. Latency',
                  value: rawRowCount > 0 ? `~${Math.max(1, Math.round(rawRowCount / 1000))}ms` : '—',
                  sub: 'per 1k rows',
                  hi: BB.gold,
                },
                {
                  label: 'Memory Est.',
                  value: (allFeatures.length > 0 && rawRowCount > 0) ? `~${(allFeatures.length * rawRowCount * 8 / 1048576).toFixed(1)}MB` : '—',
                  sub: 'float64 matrix',
                  hi: BB.gold,
                },
                {
                  label: 'Determinism',
                  value: trainingConfig?.random_seed != null ? '✓ Fixed Seed' : '⚠ No Seed',
                  sub: trainingConfig?.random_seed != null ? `seed ${trainingConfig.random_seed}` : 'random state',
                  hi: trainingConfig?.random_seed != null ? BB.success : BB.warning,
                },
                {
                  label: 'Pipeline Depth',
                  value: '3 stages',
                  sub: 'imp → scale → fit',
                  hi: BB.primaryLight,
                },
              ].map((s) => (
                <div
                  key={s.label}
                  style={{
                    padding: '6px 8px',
                    borderRadius: 6,
                    background: BB.elevated,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                  }}
                >
                  <span style={{ fontSize: 8, fontWeight: 700, color: BB.disabled, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    {s.label}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: s.hi, fontFamily: 'var(--font-mono)' }}>
                    {s.value}
                  </span>
                  <span style={{ fontSize: 8, color: BB.muted }}>{s.sub}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Validation Errors Panel */}
          {validationErrors.length > 0 && (
            <div
              role="alert"
              aria-label="Pipeline validation errors"
              style={{
                padding: '8px 10px',
                borderRadius: 6,
                background: 'rgba(239,68,68,0.10)',
                border: '1px solid rgba(239,68,68,0.3)',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              {validationErrors.map((e, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 5, fontSize: 10, color: BB.error }}>
                  <AlertCircle style={{ width: 11, height: 11, flexShrink: 0, marginTop: 1 }} />
                  <span>{e}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── RIGHT COLUMN: STUDIO WORKSPACE (CODE OR DAG VIEW) ─────── */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            background: BB.surface,
            border: `1px solid ${BB.border}`,
            borderRadius: 10,
            overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}
        >
          {/* TAB 1: CODE EDITOR VIEW */}
          {activeTab === 'code' && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
              {/* Terminal Window Top Bar */}
              <div
                style={{
                  padding: '8px 14px',
                  background: BB.elevated,
                  borderBottom: `1px solid ${BB.border}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexShrink: 0,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#FF4D6D' }} />
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#F5A623' }} />
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#00F5A0' }} />
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '2px 8px',
                      borderRadius: 4,
                      background: 'rgba(201, 162, 75, 0.12)',
                      border: `1px solid rgba(201, 162, 75, 0.25)`,
                    }}
                  >
                    <FileCode style={{ width: 12, height: 12, color: BB.gold }} />
                    <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700, color: BB.gold }}>
                      pipeline_generated.py
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, fontFamily: 'var(--font-mono)', color: BB.muted }}>
                  <span>Python 3.10 / scikit-learn 1.4</span>
                  <span>•</span>
                  <span>{codeLines.length} lines</span>
                </div>
              </div>

              {/* Viewport Area */}
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: 'auto',
                  background: BB.codeBg,
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {/* Auth Error */}
                {authError && (
                  <div
                    role="alert"
                    aria-live="assertive"
                    style={{
                      margin: 20,
                      padding: 16,
                      borderRadius: 8,
                      background: 'rgba(75, 59, 124, 0.18)',
                      border: '1px solid rgba(107,92,166,0.45)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <Lock style={{ width: 18, height: 18, color: BB.primaryLight, flexShrink: 0, marginTop: 2 }} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: BB.text }}>Session Expired</div>
                        <div style={{ fontSize: 11, color: BB.muted, marginTop: 4 }}>{authError}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => onNavigate?.('workspace')}
                      style={{
                        padding: '6px 14px',
                        borderRadius: 6,
                        background: BB.elevated,
                        border: `1px solid ${BB.border}`,
                        color: BB.text,
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                        alignSelf: 'flex-start',
                      }}
                    >
                      Go to Login
                    </button>
                  </div>
                )}

                {/* Compilation Error */}
                {!authError && !isGenerating && generationError && (
                  <div
                    role="alert"
                    style={{
                      margin: 20,
                      padding: 16,
                      borderRadius: 8,
                      background: 'rgba(110,20,35,0.22)',
                      border: '1px solid rgba(178,58,78,0.45)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <AlertCircle style={{ width: 18, height: 18, color: BB.maroonLight, flexShrink: 0, marginTop: 2 }} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: BB.text }}>Code Generation Failed</div>
                        <div style={{ fontSize: 11, color: BB.muted, marginTop: 4, fontFamily: 'var(--font-mono)' }}>
                          {generationError}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => generatePipelineCode()}
                      style={{
                        padding: '6px 14px',
                        borderRadius: 6,
                        background: BB.elevated,
                        border: `1px solid ${BB.border}`,
                        color: BB.text,
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                        alignSelf: 'flex-start',
                      }}
                    >
                      Retry Code Generation
                    </button>
                  </div>
                )}

                {/* Loading State */}
                {isGenerating && (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flex: 1,
                      padding: 40,
                      gap: 10,
                      color: BB.muted,
                      fontSize: 12,
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    <RefreshCw style={{ width: 22, height: 22, animation: 'spin 1s linear infinite', color: BB.gold }} />
                    <span>Synthesizing scikit-learn pipeline DAG code…</span>
                  </div>
                )}

                {/* Synthesized Python Code with Line Numbers & Syntax Highlighting */}
                {!isGenerating && !generationError && !authError && generatedCode && (
                  <div style={{ display: 'flex', minHeight: '100%', fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.6 }}>
                    {/* Line Numbers Gutter */}
                    <div
                      style={{
                        userSelect: 'none',
                        padding: '12px 10px',
                        textAlign: 'right',
                        color: '#433B62',
                        background: 'rgba(0,0,0,0.25)',
                        borderRight: `1px solid ${BB.border}`,
                        minWidth: 42,
                        flexShrink: 0,
                      }}
                    >
                      {codeLines.map((_, i) => (
                        <div key={i}>{i + 1}</div>
                      ))}
                    </div>

                    {/* Syntax Highlighted Lines */}
                    <pre
                      style={{
                        margin: 0,
                        padding: '12px 16px',
                        flex: 1,
                        overflowX: 'auto',
                        whiteSpace: 'pre',
                        fontFamily: 'inherit',
                      }}
                    >
                      <code>
                        {codeLines.map((line, idx) => (
                          <div key={idx}>{highlightPythonLine(line)}</div>
                        ))}
                      </code>
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: BRANCHING SVG PIPELINE DAG */}
          {activeTab === 'dag' && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                minHeight: 0,
                background: BB.codeBg,
                overflow: 'hidden',
              }}
            >
              {/* DAG Header Bar */}
              <div
                style={{
                  padding: '8px 14px',
                  background: BB.elevated,
                  borderBottom: `1px solid ${BB.border}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexShrink: 0,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#FF4D6D' }} />
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#F5A623' }} />
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#00F5A0' }} />
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '2px 8px',
                      borderRadius: 4,
                      background: 'rgba(107,92,166,0.12)',
                      border: `1px solid ${BB.border}`,
                    }}
                  >
                    <GitBranch style={{ width: 12, height: 12, color: BB.primaryLight }} />
                    <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700, color: BB.primaryLight }}>
                      pipeline_dag.svg
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, fontFamily: 'var(--font-mono)', color: BB.muted }}>
                  <span>Hover a node to inspect</span>
                  <span>•</span>
                  <span>8 pipeline stages</span>
                </div>
              </div>

              {/* Branching SVG DAG */}
              <PipelineDAGGraph
                datasetName={activeDatasetName}
                imputer={canonicalImputer || 'median'}
                scaler={canonicalScaler || 'standard_scaler'}
                algorithm={canonicalAlgorithm || 'random_forest'}
                trainRatio={trainRatio}
                testRatio={testRatio}
                cvFolds={canonicalCvFolds}
                rawRowCount={rawRowCount}
                inferredTaskType={inferredTaskType || undefined}
              />
            </div>
          )}
        </div>
      </div>

      {/* AI Copilot Drawer */}
      <AICopilotDrawer
        isOpen={isCopilotOpen}
        onToggle={onToggleCopilot || (() => {})}
        messages={copilotMessages}
        placeholder="Ask about this pipeline configuration…"
      />
    </div>
  );
}
