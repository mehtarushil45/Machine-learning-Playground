import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileCode,
  Layers,
  HelpCircle,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Database,
  Sliders,
  Sparkles,
  Play,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Box,
  Binary,
} from 'lucide-react';
import { useProject } from '../../providers/ProjectContext';
import { PipelineService, type CodeStepExplanation, type PipelineDAG } from '../../services/api';
import { fetchTrainingOptions } from '../../services/jobService';
import type { TrainingOptions } from '../../types/job';
import { TrainingTimeTravelPanel } from './TrainingTimeTravelPanel';
import { AICopilotDrawer, type CopilotMsg } from '../../components/shared/AICopilotDrawer';
import { FeatureTargetSelector, isColumnIdentifier } from '../../components/shared/FeatureTargetSelector';

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
  const {
    dataset,
    selectedTarget: contextTarget,
    selectedFeatures: contextFeatures,
    setSelectedTarget: setContextTarget,
    setSelectedFeatures: setContextFeatures,
    trainingConfig,
    activeJob,
    setLifecycleStage,
  } = useProject();

  const [trainingOptions, setTrainingOptions] = useState<TrainingOptions>({
    algorithms: [
      { key: 'random_forest_classifier', display_name: 'Random Forest Classifier', task_type: 'classification' },
      { key: 'logistic_regression', display_name: 'Logistic Regression', task_type: 'classification' },
      { key: 'decision_tree_classifier', display_name: 'Decision Tree Classifier', task_type: 'classification' },
      { key: 'gradient_boosting_classifier', display_name: 'Gradient Boosting Classifier', task_type: 'classification' },
      { key: 'linear_regression', display_name: 'Linear Regression', task_type: 'regression' },
      { key: 'random_forest_regressor', display_name: 'Random Forest Regressor', task_type: 'regression' },
    ],
    scalers: [
      { key: 'standard_scaler', display_name: 'Standard Scaler' },
      { key: 'minmax_scaler', display_name: 'MinMax Scaler [0, 1]' },
      { key: 'robust_scaler', display_name: 'Robust Scaler (IQR)' },
      { key: 'none', display_name: 'None (Passthrough)' },
    ],
    imputers: [
      { key: 'median', display_name: 'Median Imputer' },
      { key: 'mean', display_name: 'Mean Imputer' },
      { key: 'most_frequent', display_name: 'Most Frequent / Mode' },
      { key: 'constant_zero', display_name: 'Constant Zero' },
    ],
    default_cv_folds: 5,
    default_train_test_split: 0.2,
  });

  // Local state initialized from project context or training config
  const [targetColumn, setTargetColumn] = useState<string>('');
  const [featureColumns, setFeatureColumns] = useState<string[]>([]);
  const [imputerStrategy, setImputerStrategy] = useState('median');
  const [scalerType, setScalerType] = useState('standard_scaler');
  const [algorithm, setAlgorithm] = useState('random_forest_classifier');
  const [testSize, setTestSize] = useState(0.2);

  // Sync with ProjectContext
  useEffect(() => {
    if (trainingConfig) {
      setTargetColumn(trainingConfig.target_column || '');
      setFeatureColumns(trainingConfig.feature_columns || []);
      setImputerStrategy(trainingConfig.imputer || 'median');
      setScalerType(trainingConfig.scaler || 'standard_scaler');
      setAlgorithm(trainingConfig.algorithm || 'random_forest_classifier');
      setTestSize(trainingConfig.train_test_split || 0.2);
    } else {
      if (contextTarget) setTargetColumn(contextTarget);
      if (contextFeatures.length > 0) setFeatureColumns(contextFeatures);
      else if (dataset && dataset.columns.length > 1) {
        const tgt = contextTarget || dataset.columns[dataset.columns.length - 1];
        setTargetColumn(tgt);
        // Exclude identifier columns and target
        const autoFeats = dataset.columns.filter((c) => c !== tgt && !isColumnIdentifier(c));
        setFeatureColumns(autoFeats);
      }
    }
  }, [trainingConfig, contextTarget, contextFeatures, dataset]);

  // Update lifecycle rail stage on mount
  useEffect(() => {
    setLifecycleStage('pipeline');
    fetchTrainingOptions().then(setTrainingOptions).catch(() => {});
  }, [setLifecycleStage]);

  // Code generation state
  const [generatedCode, setGeneratedCode] = useState<string>('');
  const [stepExplanations, setStepExplanations] = useState<CodeStepExplanation[]>([]);
  const [isValidSyntax, setIsValidSyntax] = useState<boolean | null>(null);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeStep, setActiveStep] = useState<number | null>(1);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Derive active dataset name
  const effectiveDatasetName = dataset?.fileName || trainingConfig?.dataset_name || 'dataset.csv';

  // Has active configuration check
  const hasActiveConfig = Boolean(
    dataset ||
    trainingConfig ||
    targetColumn ||
    featureColumns.length > 0
  );

  // Generate code via Pipeline API
  const generatePipelineCode = useCallback(async () => {
    if (!hasActiveConfig) return;

    setIsGenerating(true);
    setGenerationError(null);

    const safeFeatures = featureColumns.filter((f) => f !== targetColumn && !isColumnIdentifier(f));

    const dag: PipelineDAG = {
      dataset_name: effectiveDatasetName,
      target_column: targetColumn || 'target',
      feature_columns: safeFeatures.length > 0 ? safeFeatures : ['feature1', 'feature2'],
      nodes: [
        {
          node_id: 'n1',
          type: 'missing_value_handler',
          name: 'Simple Imputer',
          params: { strategy: imputerStrategy },
        },
        {
          node_id: 'n2',
          type: 'scaler',
          name: 'Feature Scaler',
          params: { scaler_type: scalerType, type: scalerType },
        },
        {
          node_id: 'n3',
          type: 'train_test_split',
          name: 'Train-Test Split',
          params: { test_size: testSize, random_seed: 42 },
        },
        {
          node_id: 'n4',
          type: 'algorithm',
          name: 'ML Estimator',
          params: { algorithm, type: algorithm },
        },
      ],
    };

    try {
      const resp = await PipelineService.generateCode(dag, true, true);
      setGeneratedCode(resp.python_code);
      setStepExplanations(resp.steps_explanation || []);
      setIsValidSyntax(resp.is_valid_syntax);
    } catch (err: any) {
      const msg = err?.detail || err?.message || 'Failed to compile Python pipeline script.';
      setGenerationError(msg);
      setIsValidSyntax(false);
      setGeneratedCode('');
    } finally {
      setIsGenerating(false);
    }
  }, [
    hasActiveConfig,
    effectiveDatasetName,
    targetColumn,
    featureColumns,
    imputerStrategy,
    scalerType,
    algorithm,
    testSize,
  ]);

  useEffect(() => {
    generatePipelineCode();
  }, [generatePipelineCode, refreshTrigger]);

  // Copy code handler
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

  // Sync feature toggle with ProjectContext
  const handleToggleFeature = (col: string) => {
    const next = featureColumns.includes(col)
      ? featureColumns.filter((f) => f !== col)
      : [...featureColumns, col];
    setFeatureColumns(next);
    setContextFeatures(next);
  };

  const handleSelectAllFeatures = () => {
    const all = (dataset?.columns || []).filter((c) => c !== targetColumn && !isColumnIdentifier(c));
    setFeatureColumns(all);
    setContextFeatures(all);
  };

  const handleDeselectAllFeatures = () => {
    setFeatureColumns([]);
    setContextFeatures([]);
  };

  const handleTargetChange = (tgt: string) => {
    setTargetColumn(tgt);
    setContextTarget(tgt);
    const cleanFeats = featureColumns.filter((f) => f !== tgt);
    setFeatureColumns(cleanFeats);
    setContextFeatures(cleanFeats);
  };

  // Generate AI Copilot Messages for Page 2
  const copilotMessages = useMemo<CopilotMsg[]>(() => {
    const msgs: CopilotMsg[] = [];

    msgs.push({
      id: 'pipeline-target',
      type: 'tip',
      text: `Target variable is **${targetColumn || 'target'}**. Pipeline generates supervised learning scikit-learn code.`,
    });

    const excludedIds = (dataset?.columns || []).filter((c) => isColumnIdentifier(c));
    if (excludedIds.length > 0) {
      msgs.push({
        id: 'pipeline-id-leakage',
        type: 'warning',
        text: `Identifier column **${excludedIds.join(', ')}** safely excluded from feature matrix to prevent data leakage.`,
      });
    }

    msgs.push({
      id: 'pipeline-features',
      type: 'info',
      text: `**${featureColumns.length} features** transformed via **${imputerStrategy}** imputation and **${scalerType}** normalization.`,
    });

    msgs.push({
      id: 'pipeline-model',
      type: 'info',
      text: `Model architecture: **${algorithm}** with **${Math.round(testSize * 100)}% test split** (random_state=42).`,
    });

    if (isValidSyntax) {
      msgs.push({
        id: 'ast-ok',
        type: 'tip',
        text: `Python AST syntax **passed validation**. Pipeline is standalone and executable.`,
      });
    } else if (isValidSyntax === false) {
      msgs.push({
        id: 'ast-err',
        type: 'warning',
        text: `Code generation encountered an issue. Check pipeline nodes and parameters.`,
      });
    }

    return msgs;
  }, [targetColumn, featureColumns, imputerStrategy, scalerType, algorithm, testSize, isValidSyntax, dataset]);

  // Visual DAG nodes
  const dagNodes = [
    {
      id: 'input',
      title: '1. Dataset Input',
      desc: `${effectiveDatasetName} (${dataset?.rowCount || dataset?.rows.length || 'N/A'} rows)`,
      icon: <Database style={{ width: 14, height: 14, color: BB.gold }} />,
      badge: `${featureColumns.length} Features`,
    },
    {
      id: 'imputer',
      title: '2. Missing Imputer',
      desc: `SimpleImputer(strategy='${imputerStrategy}')`,
      icon: <Sliders style={{ width: 14, height: 14, color: BB.primaryLight }} />,
      badge: imputerStrategy,
    },
    {
      id: 'scaler',
      title: '3. Feature Scaler',
      desc: scalerType === 'none' ? 'Passthrough' : `${scalerType.replace('_', ' ')}()`,
      icon: <Box style={{ width: 14, height: 14, color: BB.primaryLight }} />,
      badge: scalerType,
    },
    {
      id: 'split',
      title: '4. Train-Test Split',
      desc: `${Math.round((1 - testSize) * 100)}% Train / ${Math.round(testSize * 100)}% Test (seed=42)`,
      icon: <Binary style={{ width: 14, height: 14, color: BB.maroonLight }} />,
      badge: `${Math.round(testSize * 100)}% Test`,
    },
    {
      id: 'model',
      title: '5. ML Estimator',
      desc: `${algorithm}(random_state=42)`,
      icon: <Sparkles style={{ width: 14, height: 14, color: BB.gold }} />,
      badge: algorithm,
    },
  ];

  /* ── 1. Accessible Empty State ─────────────────────────────────────────── */
  if (!hasActiveConfig) {
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
          background: BB.base,
          borderRadius: 12,
          border: `1px solid ${BB.border}`,
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: 'rgba(107,92,166,0.15)',
            border: `1px solid ${BB.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
          }}
        >
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
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 16px',
            borderRadius: 8,
            background: `linear-gradient(135deg, ${BB.primary}, ${BB.maroon})`,
            border: `1px solid ${BB.primaryLight}`,
            color: BB.text,
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(110,20,35,0.3)',
          }}
        >
          Go to Dataset and Profiler
        </button>
      </div>
    );
  }

  /* ── 2. Main Studio Canvas ─────────────────────────────────────────────── */
  return (
    <div
      style={{
        display: 'flex',
        flex: 1,
        minHeight: 0,
        width: '100%',
        height: '100%',
        gap: isCopilotOpen ? 12 : 0,
        position: 'relative',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {/* Main Workspace Area (Controls, DAG, Code Editor, Step Breakdown) */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          minWidth: 0,
          overflowY: 'auto',
          paddingRight: 2,
        }}
      >
        {/* 2-Column Grid (Configuration & DAG vs Code Editor & Learning Mode) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(320px, 380px) 1fr',
            gap: 12,
            alignItems: 'start',
          }}
        >
          {/* Left Column: Pipeline Configuration & Visual Graph */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* 1. Configuration Panel */}
            <div
              style={{
                background: BB.surface,
                border: `1px solid ${BB.border}`,
                borderRadius: 10,
                padding: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: BB.muted,
                  }}
                >
                  Pipeline Configuration
                </span>
                <span style={{ fontSize: 9, color: BB.gold, fontWeight: 600 }}>
                  {effectiveDatasetName}
                </span>
              </div>

              {/* Target Column Selector */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 9,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: BB.muted,
                    marginBottom: 4,
                  }}
                >
                  Target Column (y)
                </label>
                <input
                  type="text"
                  aria-label="Target Column"
                  value={targetColumn}
                  onChange={(e) => handleTargetChange(e.target.value)}
                  placeholder="e.g. churn_label"
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: `1px solid ${BB.border}`,
                    background: BB.elevated,
                    color: targetColumn ? BB.maroonLight : BB.text,
                    fontSize: 11,
                    fontWeight: 600,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Feature Columns Selector (B3, B4 Shared Component + Summary) */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 9,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: BB.muted,
                    marginBottom: 4,
                  }}
                >
                  Feature Columns (X)
                </label>
                <input
                  type="text"
                  aria-label="Feature Columns (X)"
                  value={featureColumns.join(', ')}
                  readOnly
                  placeholder="Select features below..."
                  style={{
                    width: '100%',
                    padding: '5px 8px',
                    borderRadius: 6,
                    border: `1px solid ${BB.border}`,
                    background: BB.elevated,
                    color: BB.muted,
                    fontSize: 10,
                    fontFamily: 'var(--font-mono)',
                    outline: 'none',
                    boxSizing: 'border-box',
                    marginBottom: 6,
                  }}
                />
                <FeatureTargetSelector
                  dataset={dataset}
                  columns={dataset?.columns || featureColumns}
                  selectedTarget={targetColumn}
                  selectedFeatures={featureColumns}
                  onToggleFeature={handleToggleFeature}
                  onSelectAllFeatures={handleSelectAllFeatures}
                  onDeselectAllFeatures={handleDeselectAllFeatures}
                  maxHeight={160}
                />
              </div>

              {/* Imputer & Scaler Row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 9,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: BB.muted,
                      marginBottom: 4,
                    }}
                  >
                    Missing Imputer
                  </label>
                  <select
                    value={imputerStrategy}
                    onChange={(e) => setImputerStrategy(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '5px 8px',
                      borderRadius: 6,
                      border: `1px solid ${BB.border}`,
                      background: BB.elevated,
                      color: BB.text,
                      fontSize: 10,
                      outline: 'none',
                    }}
                  >
                    {trainingOptions.imputers.map((imp) => (
                      <option key={imp.key} value={imp.key}>
                        {imp.display_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 9,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: BB.muted,
                      marginBottom: 4,
                    }}
                  >
                    Feature Scaler
                  </label>
                  <select
                    value={scalerType}
                    onChange={(e) => setScalerType(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '5px 8px',
                      borderRadius: 6,
                      border: `1px solid ${BB.border}`,
                      background: BB.elevated,
                      color: BB.text,
                      fontSize: 10,
                      outline: 'none',
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

              {/* ML Algorithm Selector */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 9,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: BB.muted,
                    marginBottom: 4,
                  }}
                >
                  ML Estimator Algorithm
                </label>
                <select
                  value={algorithm}
                  onChange={(e) => setAlgorithm(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: `1px solid ${BB.border}`,
                    background: BB.elevated,
                    color: BB.gold,
                    fontSize: 11,
                    fontWeight: 600,
                    outline: 'none',
                  }}
                >
                  {trainingOptions.algorithms.map((algo) => (
                    <option key={algo.key} value={algo.key}>
                      {algo.display_name} ({algo.task_type})
                    </option>
                  ))}
                </select>
              </div>

              {/* Train/Test Split Slider */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 4 }}>
                  <span style={{ color: BB.muted, fontWeight: 600 }}>Test Split Ratio</span>
                  <span style={{ color: BB.gold, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                    {Math.round(testSize * 100)}% Test / {Math.round((1 - testSize) * 100)}% Train
                  </span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="0.5"
                  step="0.05"
                  value={testSize}
                  onChange={(e) => setTestSize(parseFloat(e.target.value))}
                  style={{
                    width: '100%',
                    accentColor: BB.primaryLight,
                    cursor: 'pointer',
                  }}
                />
              </div>

              {/* Run Pipeline CTA */}
              <button
                onClick={() => onNavigate?.('explainability')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '9px 16px',
                  borderRadius: 8,
                  background: `linear-gradient(135deg, ${BB.primary}, ${BB.maroon})`,
                  border: `1px solid ${BB.primaryLight}`,
                  color: BB.text,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(110,20,35,0.3)',
                  transition: 'all 150ms ease',
                  marginTop: 6,
                }}
              >
                <Play style={{ width: 13, height: 13, fill: 'currentColor' }} />
                Run Pipeline
              </button>
            </div>

            {/* 2. Visual Pipeline Graph (B5) */}
            <div
              style={{
                background: BB.surface,
                border: `1px solid ${BB.border}`,
                borderRadius: 10,
                padding: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Layers style={{ width: 13, height: 13, color: BB.gold }} />
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: BB.text,
                  }}
                >
                  Visual Pipeline Graph
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {dagNodes.map((node, idx) => (
                  <React.Fragment key={node.id}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 10px',
                        borderRadius: 8,
                        background: BB.elevated,
                        border: `1px solid ${BB.border}`,
                        transition: 'all 120ms ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <div
                          style={{
                            padding: 6,
                            borderRadius: 6,
                            background: 'rgba(75,59,124,0.2)',
                            border: `1px solid ${BB.border}`,
                            flexShrink: 0,
                          }}
                        >
                          {node.icon}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: BB.text }}>{node.title}</div>
                          <div
                            style={{
                              fontSize: 9,
                              color: BB.muted,
                              fontFamily: 'var(--font-mono)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {node.desc}
                          </div>
                        </div>
                      </div>

                      <span
                        style={{
                          fontSize: 8,
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: 'rgba(107,92,166,0.2)',
                          color: BB.primaryLight,
                          border: `1px solid ${BB.border}`,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          flexShrink: 0,
                        }}
                      >
                        {node.badge}
                      </span>
                    </div>

                    {idx < dagNodes.length - 1 && (
                      <div style={{ display: 'flex', justifyContent: 'center', padding: '1px 0' }}>
                        <ChevronDown style={{ width: 12, height: 12, color: BB.disabled }} />
                      </div>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Synchronized Code Editor & Learning Mode */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
            {/* Synchronized Terminal Code Editor */}
            <div
              style={{
                background: BB.surface,
                border: `1px solid ${BB.border}`,
                borderRadius: 10,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              }}
            >
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#FF4D6D' }} />
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#F5A623' }} />
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#00F5A0' }} />
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: 11,
                      fontFamily: 'var(--font-mono)',
                      color: BB.gold,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                    }}
                  >
                    <FileCode style={{ width: 13, height: 13 }} />
                    pipeline_generated.py
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {/* AST Validation Status Pill */}
                  {isValidSyntax === true && (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '2px 7px',
                        borderRadius: 4,
                        background: 'rgba(34, 197, 94, 0.12)',
                        border: '1px solid rgba(34, 197, 94, 0.3)',
                        color: BB.success,
                        fontSize: 9,
                        fontWeight: 600,
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      <CheckCircle2 style={{ width: 11, height: 11 }} />
                      AST Validated (Python 3.10)
                    </span>
                  )}
                  {isValidSyntax === false && (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '2px 7px',
                        borderRadius: 4,
                        background: 'rgba(239, 68, 68, 0.12)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        color: '#ef4444',
                        fontSize: 9,
                        fontWeight: 600,
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      <AlertCircle style={{ width: 11, height: 11 }} />
                      AST Failed
                    </span>
                  )}

                  <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: BB.muted }}>
                    Python 3.10 / scikit-learn
                  </span>

                  {/* Recompile Button */}
                  <button
                    onClick={() => setRefreshTrigger((prev) => prev + 1)}
                    title="Recompile pipeline code"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: BB.muted,
                      cursor: 'pointer',
                      padding: 2,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <RefreshCw style={{ width: 12, height: 12 }} />
                  </button>

                  {/* Icon-Only Copy Code Button */}
                  <button
                    onClick={handleCopyCode}
                    disabled={!generatedCode}
                    title={copied ? 'Copied to clipboard!' : 'Copy Python code'}
                    aria-label="Copy Code"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 24,
                      height: 24,
                      borderRadius: 5,
                      background: copied ? 'rgba(34,197,94,0.15)' : BB.surface,
                      border: `1px solid ${copied ? 'rgba(34,197,94,0.4)' : BB.border}`,
                      color: copied ? BB.success : BB.muted,
                      cursor: generatedCode ? 'pointer' : 'not-allowed',
                      transition: 'all 150ms ease',
                      padding: 0,
                    }}
                  >
                    {copied ? (
                      <Check style={{ width: 12, height: 12, color: BB.success }} />
                    ) : (
                      <Copy style={{ width: 12, height: 12 }} />
                    )}
                  </button>
                </div>
              </div>

              {/* Code Viewport or Real Error State (B1) */}
              <div style={{ minHeight: 320, maxHeight: 480, overflow: 'auto', padding: 16 }}>
                {isGenerating && (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 40,
                      gap: 8,
                      color: BB.muted,
                      fontSize: 11,
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    <RefreshCw style={{ width: 18, height: 18, animation: 'spin 1s linear infinite', color: BB.gold }} />
                    Compiling scikit-learn pipeline code...
                  </div>
                )}

                {!isGenerating && generationError && (
                  /* Dedicated Error UI (B1) — Never fake comments */
                  <div
                    role="alert"
                    style={{
                      padding: 16,
                      borderRadius: 8,
                      background: 'rgba(110,20,35,0.22)',
                      border: '1px solid rgba(178,58,78,0.4)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <AlertCircle style={{ width: 18, height: 18, color: BB.maroonLight, flexShrink: 0, marginTop: 2 }} />
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: BB.text }}>
                          Pipeline Code Compilation Failed
                        </div>
                        <div style={{ fontSize: 11, color: BB.muted, marginTop: 4, fontFamily: 'var(--font-mono)' }}>
                          {generationError}
                        </div>
                      </div>
                    </div>
                    <div>
                      <button
                        onClick={() => generatePipelineCode()}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 6,
                          background: BB.elevated,
                          border: `1px solid ${BB.border}`,
                          color: BB.text,
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Retry Code Generation
                      </button>
                    </div>
                  </div>
                )}

                {!isGenerating && !generationError && generatedCode && (
                  <pre
                    style={{
                      margin: 0,
                      fontSize: 11,
                      fontFamily: 'var(--font-mono)',
                      color: '#E2E8F0',
                      lineHeight: 1.55,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    <code>{generatedCode}</code>
                  </pre>
                )}
              </div>
            </div>

            {/* Learning Mode — Step Breakdown (B8) */}
            <div
              style={{
                background: BB.surface,
                border: `1px solid ${BB.border}`,
                borderRadius: 10,
                padding: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <HelpCircle style={{ width: 14, height: 14, color: BB.primaryLight }} />
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: BB.text,
                  }}
                >
                  Learning Mode — Step Breakdown
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {stepExplanations.map((step) => {
                  const isOpen = activeStep === step.step_number;
                  return (
                    <div
                      key={step.step_number}
                      style={{
                        borderRadius: 8,
                        background: BB.elevated,
                        border: `1px solid ${BB.border}`,
                        overflow: 'hidden',
                        transition: 'all 120ms ease',
                      }}
                    >
                      <button
                        onClick={() => setActiveStep(isOpen ? null : step.step_number)}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span
                            style={{
                              width: 18,
                              height: 18,
                              borderRadius: '50%',
                              background: 'rgba(75,59,124,0.3)',
                              color: BB.primaryLight,
                              fontSize: 10,
                              fontWeight: 700,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            {step.step_number}
                          </span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: BB.text }}>
                            {step.title}
                          </span>
                        </div>
                        {isOpen ? (
                          <ChevronDown style={{ width: 14, height: 14, color: BB.muted }} />
                        ) : (
                          <ChevronRight style={{ width: 14, height: 14, color: BB.muted }} />
                        )}
                      </button>

                      {isOpen && (
                        <div
                          style={{
                            padding: '6px 12px 10px 38px',
                            fontSize: 11,
                            color: BB.muted,
                            lineHeight: 1.45,
                            borderTop: `1px solid ${BB.border}`,
                          }}
                        >
                          {step.explanation}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Training Time-Travel Panel (Bottom Docked when active job exists) */}
        {activeJob && (
          <TrainingTimeTravelPanel
            jobId={activeJob.job_id}
            metrics={(activeJob.metadata?.epochs as any) || []}
          />
        )}
      </div>

      {/* Docked AI Copilot Drawer (B6) */}
      <AICopilotDrawer
        isOpen={isCopilotOpen}
        onToggle={onToggleCopilot || (() => {})}
        messages={copilotMessages}
        placeholder="Ask about this pipeline configuration…"
      />
    </div>
  );
}
