import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileCode,
  Copy,
  Check,
  Database,
  FileSpreadsheet,
  ExternalLink,
  Play,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Lock,
  ArrowLeft,
  ChevronRight,
  Info,
} from 'lucide-react';
import { useProject } from '../../providers/ProjectContext';
import { PipelineService, type CodeStepExplanation, type PipelineDAG } from '../../services/api';
import { AuthExpiredError, ApiTimeoutError } from '../../services/apiClient';
import { fetchTrainingOptions } from '../../services/jobService';
import type { TrainingOptions } from '../../types/job';
import { AICopilotDrawer, type CopilotMsg } from '../../components/shared/AICopilotDrawer';
import { isColumnIdentifier } from '../../components/shared/FeatureTargetSelector';

/* ── BB Brand Tokens (Matches Page 1) ─────────────────────────────────── */
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
  error: '#ef4444',
} as const;

export interface ViewAsCodeStudioProps {
  onShowToast?: (title: string, description?: string, type?: 'success' | 'info' | 'error') => void;
  onNavigate?: (tab: string) => void;
  isCopilotOpen?: boolean;
  onToggleCopilot?: () => void;
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

  /* ── Code generation state ──────────────────────────────────────────── */
  const [generatedCode, setGeneratedCode] = useState<string>('');
  const [, setStepExplanations] = useState<CodeStepExplanation[]>([]);
  const [isValidSyntax, setIsValidSyntax] = useState<boolean | null>(null);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  /** Distinct error buckets – never collapsed into one generic message. */
  const [generationError, setGenerationError] = useState<string | null>(null); // code-gen / backend
  const [authError, setAuthError] = useState<string | null>(null);              // session expired
  const [copied, setCopied] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  /* ── Derived: canonical config values (NO local copy of config state) ─ */
  // train_test_split is stored as TRAIN RATIO: 0.8 = 80 % train / 20 % test
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

  const datasetRowCount = useMemo(() => {
    if (dataset?.rowCount) return dataset.rowCount.toLocaleString();
    if (dataset?.rows?.length) return dataset.rows.length.toLocaleString();
    return '—';
  }, [dataset]);

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

  /** newTrainRatio is the TRAIN ratio (0.5–0.95), e.g. 0.8 means 80% train. */
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
          // Backend code-gen endpoint accepts test_size (test ratio), not train ratio
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
        // Auth failure – categorically different from a compilation failure
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

  /* ── Copy code ──────────────────────────────────────────────────────── */
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

  /* ── AI Copilot messages – derived from canonical state, no local copy ─ */
  const copilotMessages = useMemo<CopilotMsg[]>(() => {
    const msgs: CopilotMsg[] = [];
    const target   = selectedTarget || trainingConfig?.target_column;
    const features = selectedFeatures.length > 0 ? selectedFeatures : (trainingConfig?.feature_columns ?? []);

    msgs.push({
      id:   'pipeline-target',
      type: 'tip',
      text: `Target variable is **${target || 'not set'}**. Pipeline generates supervised learning scikit-learn code.`,
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
      text: `**${features.length} features** transformed via **${canonicalImputer || 'median'}** imputation and **${canonicalScaler || 'standard_scaler'}** normalization.`,
    });

    msgs.push({
      id:   'pipeline-model',
      type: 'info',
      text: `Model architecture: **${canonicalAlgorithm || 'not set'}** with **${Math.round(testRatio * 100)}% test split** (random_state=${trainingConfig?.random_seed ?? 42}).`,
    });

    if (isValidSyntax) {
      msgs.push({ id: 'ast-ok', type: 'tip', text: `Python AST syntax **passed validation**. Pipeline is standalone and executable.` });
    } else if (isValidSyntax === false) {
      msgs.push({ id: 'ast-err', type: 'warning', text: `Code generation encountered an issue. Check pipeline nodes and parameters.` });
    }

    return msgs;
  }, [selectedTarget, selectedFeatures, trainingConfig, dataset, canonicalAlgorithm, canonicalScaler, canonicalImputer, testRatio, isValidSyntax]);

  /* ── 1. Intentional Empty State ─────────────────────────────────────── */
  if (!hasUsableConfig) {
    return (
      <div
        role="region"
        aria-label="Empty Pipeline Studio"
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100%', padding: 32, textAlign: 'center',
          background: BB.base, borderRadius: 12, border: `1px solid ${BB.border}`,
        }}
      >
        <div style={{ width: 56, height: 56, borderRadius: 14, background: 'rgba(107,92,166,0.15)', border: `1px solid ${BB.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <FileCode style={{ width: 28, height: 28, color: BB.gold }} />
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: BB.text, margin: '0 0 8px' }}>
          No active dataset or training configuration
        </h2>
        <p style={{ fontSize: 12, color: BB.muted, maxWidth: 460, margin: '0 0 20px', lineHeight: 1.5 }}>
          Upload a dataset and select your target and features in Dataset &amp; Profiler to start compiling visual scikit-learn pipelines.
        </p>
        <button
          onClick={() => onNavigate?.('workspace')}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 8,
            background: `linear-gradient(135deg, ${BB.primary}, ${BB.maroon})`,
            border: `1px solid ${BB.primaryLight}`, color: BB.text, fontSize: 12, fontWeight: 700,
            cursor: 'pointer', boxShadow: '0 4px 14px rgba(110,20,35,0.3)',
          }}
        >
          Go to Dataset and Profiler
        </button>
      </div>
    );
  }

  /* ── 2. Main Studio Canvas ───────────────────────────────────────────── */
  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, width: '100%', height: '100%', gap: isCopilotOpen ? 12 : 0, position: 'relative', boxSizing: 'border-box', overflow: 'hidden' }}>
      {/* Main Workspace */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0, overflowY: 'auto', paddingRight: 2 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 380px) 1fr', gap: 12, alignItems: 'start' }}>

          {/* ── Left Column ─────────────────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

            {/* Dataset Info Card */}
            <div style={{ background: BB.surface, border: `1px solid ${BB.border}`, borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <FileSpreadsheet style={{ width: 14, height: 14, color: BB.gold }} />
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: BB.text }}>Active Dataset</span>
                </div>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 6px', borderRadius: 4, background: 'rgba(34, 197, 94, 0.12)', border: '1px solid rgba(34, 197, 94, 0.3)', color: BB.success, fontSize: 9, fontWeight: 600 }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: BB.success }} />
                  Active
                </span>
              </div>
              <div style={{ padding: '10px 12px', borderRadius: 8, background: BB.elevated, border: `1px solid ${BB.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <div style={{ padding: 6, borderRadius: 6, background: 'rgba(201, 162, 75, 0.15)', border: '1px solid rgba(201, 162, 75, 0.3)', color: BB.gold, flexShrink: 0 }}>
                    <Database style={{ width: 15, height: 15 }} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div title={activeDatasetName} style={{ fontSize: 12, fontWeight: 700, color: BB.text, fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                      {activeDatasetName}
                    </div>
                    <div style={{ fontSize: 10, color: BB.muted, marginTop: 2 }}>{datasetRowCount} rows · {datasetColCount} columns</div>
                  </div>
                </div>
                <button onClick={() => onNavigate?.('workspace')} title="Switch or view full dataset in Profiler" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 5, background: 'rgba(75, 59, 124, 0.3)', border: `1px solid ${BB.primaryLight}`, color: BB.text, fontSize: 10, fontWeight: 600, cursor: 'pointer', flexShrink: 0, transition: 'all 120ms ease' }}>
                  <ExternalLink style={{ width: 11, height: 11 }} />Switch
                </button>
              </div>
            </div>

            {/* Pipeline Summary Strip */}
            <div aria-label="Pipeline summary" style={{ background: BB.elevated, border: `1px solid ${BB.border}`, borderRadius: 8, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' as const, fontSize: 9, color: BB.muted, fontFamily: 'var(--font-mono)' }}>
              <span style={{ color: BB.gold, fontWeight: 700 }}>{activeDatasetName.replace(/\.(csv|xlsx|parquet)$/i, '')}</span>
              <ChevronRight style={{ width: 10, height: 10, flexShrink: 0 }} />
              <span style={{ color: BB.maroonLight }}>{selectedTarget || trainingConfig?.target_column || '?'}</span>
              <ChevronRight style={{ width: 10, height: 10, flexShrink: 0 }} />
              <span>{(selectedFeatures.length || trainingConfig?.feature_columns?.length || 0)} features</span>
              <ChevronRight style={{ width: 10, height: 10, flexShrink: 0 }} />
              <span style={{ color: BB.primaryLight }}>{canonicalImputer || '—'}</span>
              <ChevronRight style={{ width: 10, height: 10, flexShrink: 0 }} />
              <span style={{ color: BB.primaryLight }}>{canonicalScaler || '—'}</span>
              <ChevronRight style={{ width: 10, height: 10, flexShrink: 0 }} />
              <span style={{ color: BB.gold }}>{canonicalAlgorithm || '—'}</span>
              <ChevronRight style={{ width: 10, height: 10, flexShrink: 0 }} />
              <span>{Math.round(trainRatio * 100)}/{Math.round(testRatio * 100)}</span>
              <ChevronRight style={{ width: 10, height: 10, flexShrink: 0 }} />
              <span>{canonicalCvFolds}-fold CV</span>
            </div>

            {/* Pipeline Configuration Panel */}
            <div style={{ background: BB.surface, border: `1px solid ${BB.border}`, borderRadius: 10, padding: '14px', display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: BB.muted }}>Pipeline Configuration</span>
                {inferredTaskType && (
                  <span style={{
                    padding: '2px 7px', borderRadius: 4,
                    background: inferredTaskType === 'regression' ? 'rgba(201,162,75,0.15)' : 'rgba(107,92,166,0.15)',
                    border: `1px solid ${inferredTaskType === 'regression' ? 'rgba(201,162,75,0.4)' : 'rgba(107,92,166,0.4)'}`,
                    color: inferredTaskType === 'regression' ? BB.gold : BB.primaryLight,
                    fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em',
                  }}>
                    {inferredTaskType}
                  </span>
                )}
              </div>

              {/* Target Column – READ ONLY (canonical: selectedTarget from context) */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <label style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: BB.muted, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Lock style={{ width: 9, height: 9 }} /> Target Column (y)
                  </label>
                  <button onClick={() => onNavigate?.('workspace')} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 8, color: BB.primaryLight, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    <ArrowLeft style={{ width: 9, height: 9 }} /> Change in Dataset Workspace
                  </button>
                </div>
                <div
                  aria-label="Target column (read-only)"
                  aria-readonly="true"
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: `1px solid ${BB.border}`, background: BB.elevated, color: (selectedTarget || trainingConfig?.target_column) ? BB.maroonLight : BB.disabled, fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-mono)', boxSizing: 'border-box' as const }}
                >
                  {selectedTarget || trainingConfig?.target_column || '—'}
                </div>
              </div>

              {/* Feature Columns – READ ONLY (canonical: selectedFeatures from context) */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <label style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: BB.muted, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Lock style={{ width: 9, height: 9 }} />
                    Feature Columns (X) — {selectedFeatures.length || trainingConfig?.feature_columns?.length || 0} selected
                  </label>
                  <button onClick={() => onNavigate?.('workspace')} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 8, color: BB.primaryLight, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    <ArrowLeft style={{ width: 9, height: 9 }} /> Change in Dataset Workspace
                  </button>
                </div>
                <div
                  aria-label="Feature columns (read-only)"
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: `1px solid ${BB.border}`, background: BB.elevated, boxSizing: 'border-box' as const, minHeight: 32, display: 'flex', flexWrap: 'wrap' as const, gap: 3, alignItems: 'center' }}
                >
                  {(selectedFeatures.length > 0 ? selectedFeatures : (trainingConfig?.feature_columns ?? [])).slice(0, 6).map((f) => (
                    <span key={f} style={{ display: 'inline-block', padding: '1px 5px', borderRadius: 3, background: 'rgba(107,92,166,0.15)', border: `1px solid ${BB.border}`, color: BB.text, fontSize: 8, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{f}</span>
                  ))}
                  {(selectedFeatures.length || trainingConfig?.feature_columns?.length || 0) > 6 && (
                    <span style={{ fontSize: 8, color: BB.muted }}>+{(selectedFeatures.length || trainingConfig?.feature_columns?.length || 0) - 6} more</span>
                  )}
                  {(selectedFeatures.length || trainingConfig?.feature_columns?.length || 0) === 0 && (
                    <span style={{ fontSize: 9, color: BB.disabled }}>No features selected</span>
                  )}
                </div>
              </div>

              {/* Imputer + Scaler – EDITABLE, write to setTrainingConfig */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: BB.muted, marginBottom: 4 }}>Missing Imputer</label>
                  <select value={canonicalImputer} onChange={(e) => handleImputerChange(e.target.value)} disabled={!trainingConfig} aria-label="Missing value imputer" style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: `1px solid ${BB.border}`, background: BB.elevated, color: BB.text, fontSize: 10, outline: 'none', cursor: trainingConfig ? 'pointer' : 'not-allowed' }}>
                    {trainingOptions.imputers.map((imp) => <option key={imp.key} value={imp.key}>{imp.display_name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: BB.muted, marginBottom: 4 }}>Feature Scaler</label>
                  <select value={canonicalScaler} onChange={(e) => handleScalerChange(e.target.value)} disabled={!trainingConfig} aria-label="Feature scaler" style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: `1px solid ${BB.border}`, background: BB.elevated, color: BB.text, fontSize: 10, outline: 'none', cursor: trainingConfig ? 'pointer' : 'not-allowed' }}>
                    {trainingOptions.scalers.map((sc) => <option key={sc.key} value={sc.key}>{sc.display_name}</option>)}
                  </select>
                </div>
              </div>

              {/* Algorithm – EDITABLE, filtered to task-compatible options */}
              <div>
                <label style={{ display: 'block', fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: BB.muted, marginBottom: 4 }}>ML Estimator Algorithm</label>
                <select value={canonicalAlgorithm} onChange={(e) => handleAlgorithmChange(e.target.value)} disabled={!trainingConfig} aria-label="ML estimator algorithm" style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: `1px solid ${BB.border}`, background: BB.elevated, color: BB.gold, fontSize: 11, fontWeight: 600, outline: 'none', cursor: trainingConfig ? 'pointer' : 'not-allowed' }}>
                  {taskFilteredAlgorithms.map((algo) => <option key={algo.key} value={algo.key}>{algo.display_name}</option>)}
                </select>
                {inferredTaskType && (
                  <div style={{ fontSize: 8, color: BB.muted, marginTop: 3, display: 'flex', alignItems: 'center', gap: 3 }}>
                    <Info style={{ width: 9, height: 9 }} />
                    Showing {inferredTaskType} algorithms only, inferred from dataset analysis.
                  </div>
                )}
              </div>

              {/* Train/Test Split – EDITABLE, slider uses TRAIN RATIO (0.5–0.95) */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 4 }}>
                  <span style={{ color: BB.muted, fontWeight: 600 }}>Train / Test Split</span>
                  {/* Label is "X% Train / Y% Test" — same order as Page 1 */}
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
                  style={{ width: '100%', accentColor: BB.primaryLight, cursor: trainingConfig ? 'pointer' : 'not-allowed' }}
                />
              </div>

              {/* CV Folds – EDITABLE */}
              <div>
                <label style={{ display: 'block', fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: BB.muted, marginBottom: 4 }}>Cross-Validation Folds</label>
                <input
                  type="number" min={2} max={20} value={canonicalCvFolds}
                  onChange={(e) => handleCvFoldsChange(parseInt(e.target.value, 10) || 5)}
                  disabled={!trainingConfig}
                  aria-label="Cross-validation folds"
                  style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: `1px solid ${BB.border}`, background: BB.elevated, color: BB.text, fontSize: 10, fontFamily: 'var(--font-mono)', outline: 'none', boxSizing: 'border-box' as const, cursor: trainingConfig ? 'pointer' : 'not-allowed' }}
                />
              </div>

              {/* Validation errors */}
              {validationErrors.length > 0 && (
                <div role="alert" aria-label="Pipeline validation errors" style={{ padding: '8px 10px', borderRadius: 6, background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.3)', display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
                  {validationErrors.map((e, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 5, fontSize: 10, color: BB.error }}>
                      <AlertCircle style={{ width: 11, height: 11, flexShrink: 0, marginTop: 1 }} />
                      <span>{e}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Run Pipeline CTA */}
              <button
                onClick={() => {
                  if (!isValidSyntax) {
                    onShowToast?.('Invalid Pipeline', 'Fix pipeline errors before running.', 'error');
                    return;
                  }
                  onNavigate?.('explainability');
                }}
                disabled={!isConfigValid || !isValidSyntax}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  width: '100%', padding: '9px 16px', borderRadius: 8,
                  background: (!isConfigValid || !isValidSyntax) ? BB.disabled : `linear-gradient(135deg, ${BB.primary}, ${BB.maroon})`,
                  border: `1px solid ${(!isConfigValid || !isValidSyntax) ? 'transparent' : BB.primaryLight}`,
                  color: BB.text, fontSize: 11, fontWeight: 700,
                  cursor: (!isConfigValid || !isValidSyntax) ? 'not-allowed' : 'pointer',
                  boxShadow: (!isConfigValid || !isValidSyntax) ? 'none' : '0 4px 14px rgba(110,20,35,0.3)',
                  transition: 'all 150ms ease', marginTop: 6,
                }}
              >
                <Play style={{ width: 13, height: 13, fill: 'currentColor' }} />
                Run Pipeline
              </button>
            </div>
          </div>

          {/* ── Right Column: Code Editor ───────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div style={{ background: BB.surface, border: `1px solid ${BB.border}`, borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', minHeight: 520 }}>
              {/* Terminal Top Bar */}
              <div style={{ padding: '8px 14px', background: BB.elevated, borderBottom: `1px solid ${BB.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#FF4D6D' }} />
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#F5A623' }} />
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#00F5A0' }} />
                  <span style={{ marginLeft: 8, fontSize: 11, fontFamily: 'var(--font-mono)', color: BB.gold, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <FileCode style={{ width: 13, height: 13 }} />pipeline_generated.py
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {isValidSyntax === true && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 4, background: 'rgba(34, 197, 94, 0.12)', border: '1px solid rgba(34, 197, 94, 0.3)', color: BB.success, fontSize: 9, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                      <CheckCircle2 style={{ width: 11, height: 11 }} />AST Validated (Python 3.10)
                    </span>
                  )}
                  {isValidSyntax === false && !authError && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 4, background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', color: BB.error, fontSize: 9, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                      <AlertCircle style={{ width: 11, height: 11 }} />AST Failed
                    </span>
                  )}
                  <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: BB.muted }}>Python 3.10 / scikit-learn</span>
                  <button onClick={() => setRefreshTrigger((prev) => prev + 1)} title="Recompile pipeline code" disabled={!isConfigValid} style={{ background: 'none', border: 'none', color: BB.muted, cursor: isConfigValid ? 'pointer' : 'not-allowed', padding: 2, display: 'flex', alignItems: 'center' }}>
                    <RefreshCw style={{ width: 12, height: 12 }} />
                  </button>
                  <button onClick={handleCopyCode} disabled={!generatedCode} title={copied ? 'Copied to clipboard!' : 'Copy Python code'} aria-label="Copy Code" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 5, background: copied ? 'rgba(34,197,94,0.15)' : BB.surface, border: `1px solid ${copied ? 'rgba(34,197,94,0.4)' : BB.border}`, color: copied ? BB.success : BB.muted, cursor: generatedCode ? 'pointer' : 'not-allowed', transition: 'all 150ms ease', padding: 0 }}>
                    {copied ? <Check style={{ width: 12, height: 12, color: BB.success }} /> : <Copy style={{ width: 12, height: 12 }} />}
                  </button>
                </div>
              </div>

              {/* Code Viewport */}
              <div style={{ minHeight: 480, maxHeight: 600, overflow: 'auto', padding: 16 }}>

                {/* AUTH ERROR – Session Expired (NOT "Compilation Failed") */}
                {authError && (
                  <div role="alert" aria-live="assertive" style={{ padding: 16, borderRadius: 8, background: 'rgba(75, 59, 124, 0.15)', border: '1px solid rgba(107,92,166,0.4)', display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <Lock style={{ width: 18, height: 18, color: BB.primaryLight, flexShrink: 0, marginTop: 2 }} />
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: BB.text }}>Session Expired</div>
                        <div style={{ fontSize: 11, color: BB.muted, marginTop: 4 }}>{authError}</div>
                      </div>
                    </div>
                    <button onClick={() => onNavigate?.('workspace')} style={{ padding: '6px 12px', borderRadius: 6, background: BB.elevated, border: `1px solid ${BB.border}`, color: BB.text, fontSize: 11, fontWeight: 600, cursor: 'pointer', alignSelf: 'flex-start' as const }}>
                      Go to Login
                    </button>
                  </div>
                )}

                {/* CODE GENERATION ERROR */}
                {!authError && !isGenerating && generationError && (
                  <div role="alert" style={{ padding: 16, borderRadius: 8, background: 'rgba(110,20,35,0.22)', border: '1px solid rgba(178,58,78,0.4)', display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <AlertCircle style={{ width: 18, height: 18, color: BB.maroonLight, flexShrink: 0, marginTop: 2 }} />
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: BB.text }}>Code Generation Failed</div>
                        <div style={{ fontSize: 11, color: BB.muted, marginTop: 4, fontFamily: 'var(--font-mono)' }}>{generationError}</div>
                      </div>
                    </div>
                    <button onClick={() => generatePipelineCode()} style={{ padding: '6px 12px', borderRadius: 6, background: BB.elevated, border: `1px solid ${BB.border}`, color: BB.text, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                      Retry Code Generation
                    </button>
                  </div>
                )}

                {/* LOADING */}
                {isGenerating && (
                  <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8, color: BB.muted, fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                    <RefreshCw style={{ width: 18, height: 18, animation: 'spin 1s linear infinite', color: BB.gold }} />
                    Compiling scikit-learn pipeline code…
                  </div>
                )}

                {/* GENERATED CODE */}
                {!isGenerating && !generationError && !authError && generatedCode && (
                  <pre style={{ margin: 0, fontSize: 11, fontFamily: 'var(--font-mono)', color: '#E2E8F0', lineHeight: 1.55, whiteSpace: 'pre-wrap' as const, wordBreak: 'break-word' as const }}>
                    <code>{generatedCode}</code>
                  </pre>
                )}
              </div>
            </div>
          </div>
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
