import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  FileCode,
  Copy,
  Check,
  RefreshCw,
  ChevronRight,
  Trash2,
  Plus,
  FolderOpen,
  X,
  Play,
  Square,
  Terminal,
  TriangleAlert,
  AlertCircle,
  ScrollText,
  Activity,
  Search,
  ArrowUp,
  ArrowDown,
  Rocket,
  Sparkles,
  Save,
  SplitSquareVertical,
} from 'lucide-react';
import { renderAnsiLine } from '../../utils/ansiParser';
import { useProject } from '../../providers/ProjectContext';
import { PipelineService, type CodeStepExplanation, type PipelineDAG, CodeExecutionService, CopilotApiService, type WorkspaceFileItem, LearningService } from '../../services/api';
import { LocalDeploymentService } from '../../services/localDeploymentService';
import { AuthExpiredError, ApiTimeoutError } from '../../services/apiClient';
import { AICopilotDrawer } from '../../components/shared/AICopilotDrawer';
import { isColumnIdentifier } from '../../components/shared/FeatureTargetSelector';
import { MonacoCodeStudioEditor } from './MonacoCodeStudioEditor';
import { RegenerateDiffModal } from './RegenerateDiffModal';
import { PipelineGuardianModal } from './PipelineGuardianModal';
import { usePythonLanguageClient } from './usePythonLanguageClient';
import { parsePipelineTargetAndConfig } from '../../utils/codeParser';
import { PanelLearningCollapsible, HeadsUpCardsContainer, useLearning } from '../learning';
import { ML_SNIPPETS, type MLSnippetDefinition } from './mlCodeIntelligence';
import type { JobEntity } from '../../types/job';
import { extractExecutionMetrics } from '../../utils/metricExtractor';

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
  codeBg: '#0A0814',
} as const;

export interface ViewAsCodeStudioProps {
  isActive?: boolean;
  onShowToast?: (title: string, description?: string, type?: 'success' | 'info' | 'error') => void;
  onNavigate?: (tab: string, deploymentId?: string) => void;
  isCopilotOpen?: boolean;
  onToggleCopilot?: () => void;
}

export interface CopilotMsg {
  id: string;
  text: string;
  type: 'info' | 'warning' | 'tip';
}

interface Diagnostic {
  line: number;
  col: number;
  end_line?: number;
  end_col?: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
  source: 'syntax' | 'pyflakes' | 'pep8' | 'runtime' | 'static' | 'ML Playground checks';
  code?: string | null;
}

interface LogEntry {
  id: string;
  time: string;
  level: 'system' | 'info' | 'warn' | 'error' | 'debug';
  message: string;
}

/* ── High-Precision Python Syntax Highlighter Tokenizer ────────────────── */
export function highlightPythonLine(line: string) {
  const cleanLine = line.replace(/\r$/, '');
  if (!cleanLine.trim()) return null;

  const commentIdx = cleanLine.indexOf('#');
  let codePart = cleanLine;
  let commentPart = '';
  if (commentIdx !== -1) {
    codePart = cleanLine.substring(0, commentIdx);
    commentPart = cleanLine.substring(commentIdx);
  }

  const tokenRegex =
    /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:import|from|as|def|return|class|if|else|elif|try|except|with|in|for|while|pass|break|continue|lambda|yield|None|True|False|and|or|not|is)\b|\b(?:Pipeline|ColumnTransformer|StandardScaler|MinMaxScaler|RobustScaler|SimpleImputer|KNNImputer|train_test_split|mean_squared_error|mean_absolute_error|r2_score|accuracy_score|classification_report|f1_score|RandomForestClassifier|LogisticRegression|DecisionTreeClassifier|XGBClassifier|LGBMClassifier|LinearRegression|RandomForestRegressor|DecisionTreeRegressor|SVC|SVR|KNeighborsClassifier|KNeighborsRegressor|GaussianNB|Ridge|Lasso|joblib|fit|predict|transform|score|print|len|range)\b|\b\d+(?:\.\d+)?\b|[=()[\],:{}+*/-])/g;

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
    } else if (/^(Pipeline|ColumnTransformer|StandardScaler|MinMaxScaler|RobustScaler|SimpleImputer|KNNImputer|train_test_split|mean_squared_error|mean_absolute_error|r2_score|accuracy_score|classification_report|f1_score|RandomForestClassifier|LogisticRegression|DecisionTreeClassifier|XGBClassifier|LGBMClassifier|LinearRegression|RandomForestRegressor|DecisionTreeRegressor|SVC|SVR|KNeighborsClassifier|KNeighborsRegressor|GaussianNB|Ridge|Lasso|joblib|fit|predict|transform|score|print|len|range)$/.test(token)) {
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
        let color = '#F5F1EC';
        let fontWeight = 400;

        if (p.type === 'keyword') {
          color = '#D47AFF';
          fontWeight = 600;
        } else if (p.type === 'builtin') {
          color = '#6EE7B7';
          fontWeight = 600;
        } else if (p.type === 'string') {
          color = '#FDE047';
        } else if (p.type === 'number') {
          color = '#FB923C';
        } else if (p.type === 'operator') {
          color = '#93C5FD';
        }

        return (
          <span key={i} style={{ color, fontWeight }}>
            {p.text}
          </span>
        );
      })}
      {commentPart && (
        <span style={{ color: '#8E85A8', fontStyle: 'italic' }}>{commentPart}</span>
      )}
    </>
  );
}

/* ── Experiment File Explorer ────────────────────────────────────────── */
interface ExperimentExplorerProps {
  csvName?: string;
  files: { name: string }[];
  activeFile: string;
  pendingNewFileName: string | null;
  modifiedFileNames: string[];
  generatedFileNames: string[];
  workspaceFiles?: WorkspaceFileItem[];
  onSelectFile: (name: string) => void;
  onNewFile: () => void;
  onDeleteFile: (name: string) => void;
  onPendingNameChange: (v: string) => void;
  onPendingNameCommit: () => void;
  onPendingNameCancel: () => void;
}

function ExperimentExplorer({
  files,
  activeFile,
  pendingNewFileName,
  modifiedFileNames,
  generatedFileNames,
  onSelectFile,
  onNewFile,
  onDeleteFile,
  onPendingNameChange,
  onPendingNameCommit,
  onPendingNameCancel,
}: ExperimentExplorerProps) {
  const [hoveredFile, setHoveredFile] = useState<string | null>(null);
  const newFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (pendingNewFileName !== null) {
      setTimeout(() => newFileInputRef.current?.focus(), 50);
    }
  }, [pendingNewFileName]);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: BB.surfaceSubtle,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* Explorer Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          borderBottom: `1px solid ${BB.border}`,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <FolderOpen style={{ width: 12, height: 12, color: BB.gold }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: BB.muted, letterSpacing: '0.08em' }}>
            SCRIPTS
          </span>
          <span
            style={{
              fontSize: 9,
              color: BB.muted,
              background: 'rgba(255,255,255,0.06)',
              padding: '1px 5px',
              borderRadius: 10,
              fontFamily: 'Consolas, Monaco, monospace',
            }}
          >
            {files.length}
          </span>
        </div>
        <button
          onClick={onNewFile}
          title="New experiment script"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 22,
            height: 22,
            borderRadius: 4,
            border: `1px solid ${BB.border}`,
            background: 'transparent',
            color: BB.muted,
            cursor: 'pointer',
            transition: 'all 120ms',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(201,162,75,0.2)';
            e.currentTarget.style.color = BB.gold;
            e.currentTarget.style.borderColor = BB.gold;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = BB.muted;
            e.currentTarget.style.borderColor = BB.border;
          }}
        >
          <Plus style={{ width: 12, height: 12 }} />
        </button>
      </div>

      {/* Real Project Files List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
        {files.map((f) => {
          const isActive = f.name === activeFile;
          const isHovered = hoveredFile === f.name;
          const isModified = modifiedFileNames.includes(f.name);
          const isGenerated = generatedFileNames.includes(f.name);

          return (
            <div
              key={f.name}
              onClick={() => onSelectFile(f.name)}
              onMouseEnter={() => setHoveredFile(f.name)}
              onMouseLeave={() => setHoveredFile(null)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                padding: '6px 12px 6px 14px',
                cursor: 'pointer',
                background: isActive ? 'rgba(107,92,166,0.22)' : isHovered ? 'rgba(107,92,166,0.08)' : 'transparent',
                borderLeft: isActive ? `2px solid ${BB.gold}` : '2px solid transparent',
                transition: 'all 80ms',
              }}
            >
              <FileCode
                style={{
                  width: 13,
                  height: 13,
                  color: isActive ? BB.gold : '#38BDF8',
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: 11.5,
                  color: isActive ? BB.text : BB.muted,
                  fontFamily: 'Consolas, Monaco, monospace',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                {f.name}
              </span>

              {/* Status indicators */}
              {isModified && (
                <span
                  title="Unsaved changes"
                  style={{ width: 6, height: 6, borderRadius: '50%', background: BB.gold, flexShrink: 0 }}
                />
              )}
              {!isModified && isGenerated && (
                <span title="Generated by pipeline" style={{ fontSize: 9, color: BB.primaryLight, flexShrink: 0 }}>
                  ✦
                </span>
              )}

              {/* Delete on hover (non-active only, when > 1 file) */}
              {isHovered && files.length > 1 && f.name !== 'pipeline_generated.py' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteFile(f.name);
                  }}
                  title="Delete script"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    background: 'transparent',
                    border: 'none',
                    color: BB.muted,
                    cursor: 'pointer',
                    padding: 2,
                    borderRadius: 3,
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = BB.error; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = BB.muted; }}
                >
                  <Trash2 style={{ width: 11, height: 11 }} />
                </button>
              )}
            </div>
          );
        })}

        {/* Inline new file input */}
        {pendingNewFileName !== null && (
          <div style={{ padding: '4px 12px' }}>
            <input
              ref={newFileInputRef}
              value={pendingNewFileName}
              onChange={(e) => onPendingNameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onPendingNameCommit();
                if (e.key === 'Escape') onPendingNameCancel();
              }}
              onBlur={onPendingNameCommit}
              placeholder="script_name.py"
              style={{
                width: '100%',
                background: BB.elevated,
                border: `1px solid ${BB.gold}`,
                borderRadius: 4,
                color: BB.text,
                fontSize: 11,
                fontFamily: 'Consolas, Monaco, monospace',
                padding: '4px 8px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
        )}

        {/* Empty hint */}
        {files.length === 0 && pendingNewFileName === null && (
          <div style={{ padding: '12px 14px', fontSize: 11, color: BB.disabled, fontStyle: 'italic' }}>
            No experiment scripts found.
          </div>
        )}

        {/* Action button at bottom */}
        <div style={{ padding: '8px 12px' }}>
          <button
            onClick={onNewFile}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '5px 8px',
              borderRadius: 4,
              border: `1px dashed ${BB.border}`,
              background: 'transparent',
              color: BB.muted,
              fontSize: 10.5,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 120ms ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = BB.gold;
              e.currentTarget.style.color = BB.gold;
              e.currentTarget.style.background = 'rgba(201,162,75,0.06)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = BB.border;
              e.currentTarget.style.color = BB.muted;
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <Plus style={{ width: 11, height: 11 }} />
            <span>New Script</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Static Python Code Analyzer (Replaced by Backend Pyflakes + AST Client) ── */

/* ── Runtime Error Parser (Python traceback → Clean User-Facing Diagnostics) ─────────── */
function parseRuntimeErrors(
  outputLines: string[],
  activeFilename: string = '',
  totalEditorLines: number = 0
): Diagnostic[] {
  const results: Diagnostic[] = [];

  // 1. Locate the terminal exception / error line from python stderr
  let fatalErrorMsg = '';
  for (let i = outputLines.length - 1; i >= 0; i--) {
    const raw = outputLines[i].replace(/^\[stderr\]\s?/, '').trim();
    if (/^[A-Z][a-zA-Z]*(?:Error|Exception):/.test(raw)) {
      fatalErrorMsg = raw;
      break;
    }
  }

  if (!fatalErrorMsg) {
    // If no explicit Exception header, check for syntax error indicators
    for (let i = outputLines.length - 1; i >= 0; i--) {
      const raw = outputLines[i].replace(/^\[stderr\]\s?/, '').trim();
      if (/SyntaxError:|IndentationError:|TabError:/.test(raw)) {
        fatalErrorMsg = raw;
        break;
      }
    }
  }

  // 2. Track the most recent user-code frame in traceback (ignoring site-packages/internal libs)
  let lastUserLine: number | null = null;

  for (let i = 0; i < outputLines.length; i++) {
    const raw = outputLines[i].replace(/^\[stderr\]\s?/, '').trim();
    const m = raw.match(/File "([^"]+)", line (\d+)/);
    if (!m) continue;

    const filePath = m[1];
    const lineNum = parseInt(m[2], 10);
    if (isNaN(lineNum) || lineNum <= 0) continue;

    const normPath = filePath.replace(/\\/g, '/');
    const baseName = normPath.split('/').pop() || '';

    const isSystemLib =
      normPath.includes('site-packages') ||
      normPath.includes('dist-packages') ||
      normPath.includes('/lib/') ||
      normPath.includes('\\lib\\') ||
      normPath.includes('<frozen') ||
      normPath.includes('<string>');

    const isTargetFile =
      !isSystemLib &&
      (activeFilename
        ? baseName === activeFilename || normPath.endsWith(`/${activeFilename}`)
        : !normPath.includes('/lib/'));

    if (isTargetFile) {
      if (totalEditorLines > 0 && lineNum > totalEditorLines) continue;
      lastUserLine = lineNum;
    }
  }

  // If a fatal error and user-code line were identified, link to editor line
  if (lastUserLine !== null && fatalErrorMsg) {
    results.push({
      line: lastUserLine,
      col: 1,
      severity: 'error',
      message: fatalErrorMsg,
      source: 'runtime',
    });
  } else if (fatalErrorMsg) {
    // Fallback: attach error to line 1 of active file
    results.push({
      line: 1,
      col: 1,
      severity: 'error',
      message: fatalErrorMsg,
      source: 'runtime',
    });
  }

  return results;
}

/* ── Main ViewAsCodeStudio Component ─────────────────────────────────── */
export function ViewAsCodeStudio({
  isActive = true,
  onShowToast,
  onNavigate,
  isCopilotOpen: propIsCopilotOpen,
  onToggleCopilot: propOnToggleCopilot,
}: ViewAsCodeStudioProps) {
  const [internalCopilotOpen, setInternalCopilotOpen] = useState(false);
  const isCopilotOpen = propIsCopilotOpen !== undefined ? propIsCopilotOpen : internalCopilotOpen;
  const setIsCopilotOpen = useCallback((open: boolean) => {
    setInternalCopilotOpen(open);
    if (open && !isCopilotOpen && propOnToggleCopilot) {
      propOnToggleCopilot();
    }
  }, [isCopilotOpen, propOnToggleCopilot]);

  const {
    dataset,
    trainingConfig,
    selectedTarget,
    selectedFeatures,
    activeJob,
    setLifecycleStage,
    activeExperimentFile,
    experimentFiles,
    openTabs,
    setActiveExperimentFile,
    setOpenTabs,
    updateExperimentFileCode,
    createExperimentFile,
    deleteExperimentFile,
    modifiedFiles,
    generatedFiles,
    markFileModified,
    markFileGenerated,
    isFileModified,
    setSelectedTarget,
    setTrainingConfig,
    setSelectedFeatures,
    setActiveJob,
    setFileJob,
  } = useProject();

  /* ── Local Sizing & Layout States (with persistence) ─────────────── */
  const [explorerWidth, setExplorerWidth] = useState<number>(() => {
    if (typeof localStorage !== 'undefined') {
      const val = localStorage.getItem('ml_studio_explorer_width');
      if (val) {
        const parsed = parseInt(val, 10);
        if (!isNaN(parsed) && parsed >= 120 && parsed <= 380) return parsed;
      }
    }
    return 190;
  });

  const [bottomPanelHeight, setBottomPanelHeight] = useState<number>(() => {
    if (typeof localStorage !== 'undefined') {
      const val = localStorage.getItem('ml_code_studio_panel_height');
      if (val) {
        const parsed = parseInt(val, 10);
        if (!isNaN(parsed) && parsed >= 90 && parsed <= 550) return parsed;
      }
    }
    return 210;
  });

  const [bottomPanelOpen, setBottomPanelOpen] = useState(false);
  const [bottomTab, setBottomTab] = useState<'output' | 'problems' | 'logs' | 'debug'>('output');

  const [isDraggingExplorer, setIsDraggingExplorer] = useState(false);
  const [isDraggingBottom, setIsDraggingBottom] = useState(false);

  /* ── Code Generation & Editor States ─────────────────────────────── */
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [generatedCode, setGeneratedCode] = useState<string>('');
  const [, setStepExplanations] = useState<CodeStepExplanation[]>([]);
  const [isValidSyntax, setIsValidSyntax] = useState<boolean | null>(null);
  const [copied, setCopied] = useState(false);
  const [pendingNewFileName, setPendingNewFileName] = useState<string | null>(null);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [jumpTarget, setJumpTarget] = useState<{ line: number; col: number } | null>(null);

  /* ── Find in Editor ──────────────────────────────────────────────── */
  const [isFindOpen, setIsFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [findMatches, setFindMatches] = useState<number[]>([]);
  const [findMatchIdx, setFindMatchIdx] = useState(0);

  /* ── Code Execution State ────────────────────────────────────────── */
  const [execId, setExecId] = useState<string | null>(null);
  const [execStatus, setExecStatus] = useState<
    'idle' | 'queued' | 'running' | 'completed' | 'failed' | 'stopped' | 'cancelled' | 'timed_out' | 'out_of_memory'
  >('idle');
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [isOutputTruncated, setIsOutputTruncated] = useState<boolean>(false);
  const [outputLines, setOutputLines] = useState<string[]>([]);
  const [execArtifacts, setExecArtifacts] = useState<string[]>([]);
  const [execModelId, setExecModelId] = useState<string | null>(null);
  const [isDeployingArtifact, setIsDeployingArtifact] = useState<boolean>(false);
  const [execDuration, setExecDuration] = useState<number | null>(null);
  const [execExitCode, setExecExitCode] = useState<number | null>(null);
  const [runtimeDiagnostics, setRuntimeDiagnostics] = useState<Diagnostic[]>([]);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [builderCodeByFile, setBuilderCodeByFile] = useState<Record<string, string>>({});
  const [savedCodeByFile, setSavedCodeByFile] = useState<Record<string, string>>({});
  const [serverWorkspaceFiles, setServerWorkspaceFiles] = useState<WorkspaceFileItem[]>([]);
  const [isAutosaving, setIsAutosaving] = useState(false);
  const autosaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [diffModalState, setDiffModalState] = useState<{
    isOpen: boolean;
    candidateCode: string;
    filename: string;
  }>({
    isOpen: false,
    candidateCode: '',
    filename: '',
  });

  /* ── AI Copilot Chat State ───────────────────────────────────────── */
  const [copilotInput, setCopilotInput] = useState('');
  const [copilotChat, setCopilotChat] = useState<{ id: string; role: 'user' | 'assistant'; text: string }[]>([]);
  const [isCopilotThinking, setIsCopilotThinking] = useState(false);

  /* ── DOM Refs ────────────────────────────────────────────────────── */
  const outputEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const webSocketRef = useRef<WebSocket | null>(null);
  const lastJobIdRef = useRef<string | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  /* ── Canonical Pipeline Config Derivations ────────────────────────── */
  const activeDatasetName = dataset?.fileName || trainingConfig?.dataset_name || 'dataset.csv';
  const canonicalAlgorithm = trainingConfig?.algorithm || 'random_forest';
  const canonicalScaler = trainingConfig?.scaler || 'standard_scaler';
  const canonicalImputer = trainingConfig?.imputer || 'median';
  const canonicalCvFolds = trainingConfig?.cv_folds ?? 5;
  const trainRatio = trainingConfig?.train_test_split ?? 0.8;
  const testRatio = Math.round((1 - trainRatio) * 100) / 100;
  const inferredTaskType = (dataset as any)?.inferredTaskType || (trainingConfig as any)?.task_type;

  const currentFile = activeExperimentFile || openTabs[0] || 'pipeline_generated.py';
  const effectiveTabs = openTabs.length > 0 ? openTabs : [currentFile];
  const displayedCode = experimentFiles[currentFile] ?? generatedCode ?? '';

  const effectiveProjectId = useMemo(() => {
    const raw = dataset?.datasetId || trainingConfig?.dataset_id || 'default_project';
    return raw.replace(/[^a-zA-Z0-9_-]/g, '_');
  }, [dataset?.datasetId, trainingConfig?.dataset_id]);

  const isFileReadOnly = currentFile.startsWith('data/') || currentFile.endsWith('.joblib') || currentFile.endsWith('.pkl');

  const { learningMode, logSignal } = useLearning();
  const [mlPlaygroundChecks, setMlPlaygroundChecks] = useState<Diagnostic[]>([]);
  const [isSnippetsDropdownOpen, setIsSnippetsDropdownOpen] = useState(false);
  const [isPipelineGuardianOpen, setIsPipelineGuardianOpen] = useState(false);

  /* ── 5.4 Learning-Layer Static AST Checks (Data Leakage & Preprocessing Rules) ─ */
  useEffect(() => {
    if (!displayedCode || !displayedCode.trim() || isFileReadOnly) {
      setMlPlaygroundChecks([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await LearningService.auditCode(displayedCode, currentFile);
        if (res && res.has_leakage) {
          setMlPlaygroundChecks([
            {
              line: res.line_number || 1,
              col: 1,
              severity: 'warning',
              message: res.message || 'Data Leakage Detected: Preprocessing transformer fit before train_test_split.',
              source: 'ML Playground checks',
              code: 'B7-leakage',
            },
          ]);
        } else {
          setMlPlaygroundChecks([]);
        }
      } catch {
        setMlPlaygroundChecks([]);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [displayedCode, currentFile, isFileReadOnly]);

  /* ── Enterprise Python Language Client (Authenticated WebSocket) ─ */
  const pythonLanguageClient = usePythonLanguageClient({
    code: displayedCode,
    filename: currentFile,
    enabled: isActive,
  });

  /* ── Unified Diagnostic Store (Single Source of Truth: Language Client + ML Checks + Runtime) ─ */
  const allDiagnostics = useMemo(() => {
    // If buffer is empty, immediately return empty diagnostics (clean empty-state)
    if (!displayedCode || !displayedCode.trim()) return [];

    const seen = new Map<string, Diagnostic>();
    const activeDiagnostics = pythonLanguageClient.diagnostics;

    [...activeDiagnostics, ...mlPlaygroundChecks, ...runtimeDiagnostics].forEach((d) => {
      const key = `${d.line}:${d.col ?? 0}:${d.message}:${d.source ?? ''}`;
      if (!seen.has(key)) seen.set(key, d);
    });

    return Array.from(seen.values()).sort((a, b) => {
      const s: Record<string, number> = { error: 0, warning: 1, info: 2 };
      return (s[a.severity] ?? 3) - (s[b.severity] ?? 3) || a.line - b.line;
    });
  }, [displayedCode, pythonLanguageClient.diagnostics, mlPlaygroundChecks, runtimeDiagnostics]);

  const errorCount = allDiagnostics.filter((d) => d.severity === 'error').length;
  const warnCount = allDiagnostics.filter((d) => d.severity === 'warning').length;

  /* ── Validation ─────────────────────────────────────────────────── */
  const validationErrors = useMemo<string[]>(() => {
    const errs: string[] = [];
    if (!dataset && !trainingConfig) errs.push('No dataset or configuration found.');
    if (!selectedTarget && !trainingConfig?.target_column) errs.push('Target variable not selected.');
    if (trainRatio <= 0 || trainRatio >= 1) errs.push('Train/test split ratio must be between 0 and 1.');
    return errs;
  }, [dataset, trainingConfig, selectedTarget, trainRatio]);

  const isConfigValid = validationErrors.length === 0;
  const hasUsableConfig = Boolean((dataset || trainingConfig) && (selectedTarget || trainingConfig?.target_column));

  useEffect(() => {
    setLifecycleStage('pipeline');
  }, [setLifecycleStage]);

  /* ── Auto-scroll terminal output ─────────────────────────────────── */
  useEffect(() => {
    if (outputEndRef.current && bottomPanelOpen && typeof outputEndRef.current.scrollIntoView === 'function') {
      outputEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [outputLines, bottomPanelOpen]);

  /* ── Cleanup SSE on unmount ──────────────────────────────────────── */
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (webSocketRef.current) {
        webSocketRef.current.close();
      }
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, []);

  /* ── Workspace Synchronization & File Discovery ─────────────────── */
  const refreshWorkspaceFiles = useCallback(async () => {
    try {
      if (typeof CodeExecutionService?.listWorkspaceFiles === 'function') {
        const resp = await CodeExecutionService.listWorkspaceFiles(effectiveProjectId);
        if (resp && Array.isArray(resp.files)) {
          setServerWorkspaceFiles(resp.files);
        }
      }
    } catch {
      /* Silently ignore in mock/offline test environments */
    }
  }, [effectiveProjectId]);

  useEffect(() => {
    if (!isActive) return;
    if (typeof CodeExecutionService?.syncDatasetToWorkspace === 'function') {
      CodeExecutionService.syncDatasetToWorkspace(effectiveProjectId, dataset?.datasetId || trainingConfig?.dataset_id)
        .catch(() => { })
        .finally(() => {
          refreshWorkspaceFiles();
        });
    } else {
      refreshWorkspaceFiles();
    }
  }, [isActive, effectiveProjectId, dataset?.datasetId, trainingConfig?.dataset_id, refreshWorkspaceFiles]);

  /* ── Debounced Background Autosave (1500ms) ──────────────────────── */
  useEffect(() => {
    if (!isActive || !displayedCode || !displayedCode.trim() || isFileReadOnly) return;
    const isModified = displayedCode !== (savedCodeByFile[currentFile] ?? displayedCode);
    if (!isModified) return;

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = setTimeout(async () => {
      setIsAutosaving(true);
      try {
        if (typeof CodeExecutionService?.saveWorkspaceFile === 'function') {
          await CodeExecutionService.saveWorkspaceFile(effectiveProjectId, currentFile, displayedCode);
        }
        setSavedCodeByFile((prev) => ({ ...prev, [currentFile]: displayedCode }));
      } catch (err: any) {
        if (err?.status === 403) {
          onShowToast?.('Read-only File', 'This file is read-only and cannot be saved.', 'error');
        }
      } finally {
        setIsAutosaving(false);
        refreshWorkspaceFiles();
      }
    }, 1500);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [
    isActive,
    displayedCode,
    currentFile,
    savedCodeByFile,
    isFileReadOnly,
    effectiveProjectId,
    refreshWorkspaceFiles,
    onShowToast,
  ]);

  /* ── Code Generation Logic ───────────────────────────────────────── */
  const generatePipelineCode = useCallback(async (targetFileName?: string) => {
    if (!isConfigValid) return;
    const fileToWrite = targetFileName || currentFile;

    setIsGenerating(true);
    setGenerationError(null);
    setAuthError(null);

    const target = selectedTarget || trainingConfig!.target_column;
    const features = (
      selectedFeatures.length > 0 ? selectedFeatures : (trainingConfig!.feature_columns ?? [])
    ).filter((f) => f !== target && !isColumnIdentifier(f));

    const dag: PipelineDAG = {
      dataset_name: activeDatasetName,
      target_column: target || 'target',
      feature_columns: features.length > 0 ? features : ['feature1', 'feature2'],
      nodes: [
        {
          node_id: 'n1',
          type: 'missing_value_handler',
          name: 'Simple Imputer',
          params: { strategy: canonicalImputer || 'median' },
        },
        {
          node_id: 'n2',
          type: 'scaler',
          name: 'Feature Scaler',
          params: { scaler_type: canonicalScaler || 'standard_scaler', type: canonicalScaler || 'standard_scaler' },
        },
        {
          node_id: 'n3',
          type: 'train_test_split',
          name: 'Train-Test Split',
          params: { test_size: testRatio, random_seed: trainingConfig?.random_seed ?? 42 },
        },
        {
          node_id: 'n4',
          type: 'algorithm',
          name: 'ML Estimator',
          params: {
            algorithm: canonicalAlgorithm || 'random_forest_classifier',
            type: canonicalAlgorithm || 'random_forest_classifier',
          },
        },
      ],
    };

    try {
      const resp = await PipelineService.generateCode(dag, true, true);
      setGeneratedCode(resp.python_code);
      setStepExplanations(resp.steps_explanation || []);
      setIsValidSyntax(resp.is_valid_syntax);
      updateExperimentFileCode(fileToWrite, resp.python_code);
      setBuilderCodeByFile((prev) => ({ ...prev, [fileToWrite]: resp.python_code }));
      setSavedCodeByFile((prev) => ({ ...prev, [fileToWrite]: resp.python_code }));
      markFileGenerated(fileToWrite);
    } catch (err: unknown) {
      setIsValidSyntax(false);
      setGeneratedCode('');
      if (err instanceof AuthExpiredError) {
        setAuthError('Session expired. Please log in again to generate pipeline code.');
      } else if (err instanceof ApiTimeoutError) {
        setGenerationError('Backend unavailable. The code generation service timed out. Please try again.');
      } else {
        const msg = (err as any)?.detail || (err as any)?.message || 'Code generation failed.';
        setGenerationError(msg);
      }
    } finally {
      setIsGenerating(false);
    }
  }, [
    isConfigValid,
    currentFile,
    selectedTarget,
    selectedFeatures,
    trainingConfig,
    activeDatasetName,
    canonicalImputer,
    canonicalScaler,
    testRatio,
    canonicalAlgorithm,
    updateExperimentFileCode,
    markFileGenerated,
  ]);

  const safeGeneratePipelineCode = useCallback(async (targetFileName?: string) => {
    const file = targetFileName || currentFile;
    if (!isConfigValid) return;

    const current = experimentFiles[file] || '';
    if (!current || !current.trim()) {
      generatePipelineCode(file);
      return;
    }

    const target = selectedTarget || trainingConfig!.target_column;
    const features = (
      selectedFeatures.length > 0 ? selectedFeatures : (trainingConfig!.feature_columns ?? [])
    ).filter((f) => f !== target && !isColumnIdentifier(f));

    const dag: PipelineDAG = {
      dataset_name: activeDatasetName,
      target_column: target || 'target',
      feature_columns: features.length > 0 ? features : ['feature1', 'feature2'],
      nodes: [
        {
          node_id: 'n1',
          type: 'missing_value_handler',
          name: 'Simple Imputer',
          params: { strategy: canonicalImputer || 'median' },
        },
        {
          node_id: 'n2',
          type: 'scaler',
          name: 'Feature Scaler',
          params: { scaler_type: canonicalScaler || 'standard_scaler', type: canonicalScaler || 'standard_scaler' },
        },
        {
          node_id: 'n3',
          type: 'train_test_split',
          name: 'Train-Test Split',
          params: { test_size: testRatio, random_seed: trainingConfig?.random_seed ?? 42 },
        },
        {
          node_id: 'n4',
          type: 'algorithm',
          name: 'ML Estimator',
          params: {
            algorithm: canonicalAlgorithm || 'random_forest_classifier',
            type: canonicalAlgorithm || 'random_forest_classifier',
          },
        },
      ],
    };

    try {
      setIsGenerating(true);
      const resp = await PipelineService.generateCode(dag, true, true);
      const candidate = resp.python_code;

      if (current === candidate) {
        onShowToast?.('Already in Sync', 'File already matches the builder pipeline code.', 'info');
        return;
      }

      setDiffModalState({
        isOpen: true,
        candidateCode: candidate,
        filename: file,
      });
    } catch (err: any) {
      onShowToast?.('Generation Error', err?.message || 'Could not generate code', 'error');
    } finally {
      setIsGenerating(false);
    }
  }, [
    currentFile,
    isConfigValid,
    selectedTarget,
    trainingConfig,
    selectedFeatures,
    activeDatasetName,
    canonicalImputer,
    canonicalScaler,
    testRatio,
    canonicalAlgorithm,
    experimentFiles,
    generatePipelineCode,
    onShowToast,
  ]);

  const handleAcceptDiff = useCallback(() => {
    const { filename: file, candidateCode } = diffModalState;
    updateExperimentFileCode(file, candidateCode);
    setBuilderCodeByFile((prev) => ({ ...prev, [file]: candidateCode }));
    setSavedCodeByFile((prev) => ({ ...prev, [file]: candidateCode }));
    markFileGenerated(file);
    setDiffModalState({ isOpen: false, candidateCode: '', filename: '' });
    onShowToast?.('Code Updated', `Accepted regenerated pipeline code for ${file}.`, 'success');
  }, [diffModalState, updateExperimentFileCode, markFileGenerated, onShowToast]);

  const handleRejectDiff = useCallback(() => {
    setDiffModalState({ isOpen: false, candidateCode: '', filename: '' });
    onShowToast?.('Regeneration Cancelled', 'Kept existing manual edits.', 'info');
  }, [onShowToast]);

  // Initial code generation
  useEffect(() => {
    if (isActive && isConfigValid && (!experimentFiles[currentFile] || experimentFiles[currentFile].trim() === '')) {
      generatePipelineCode(currentFile);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, isConfigValid, currentFile]);

  // Sync on new training job launch
  useEffect(() => {
    if (activeJob?.job_id && activeJob.job_id !== lastJobIdRef.current) {
      lastJobIdRef.current = activeJob.job_id;
      generatePipelineCode(currentFile);
    }
  }, [activeJob?.job_id, generatePipelineCode, currentFile]);

  /* ── Drag Resize Handlers ────────────────────────────────────────── */
  const handleExplorerDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingExplorer(true);
    const startX = e.clientX;
    const startW = explorerWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const nextW = Math.max(130, Math.min(380, startW + delta));
      setExplorerWidth(nextW);
      try {
        localStorage.setItem('ml_studio_explorer_width', String(nextW));
      } catch { }
    };

    const onMouseUp = () => {
      setIsDraggingExplorer(false);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [explorerWidth]);


  const handleBottomDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingBottom(true);
    const startY = e.clientY;
    const startH = bottomPanelHeight;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = startY - moveEvent.clientY; // dragging up increases height
      const nextH = Math.max(90, Math.min(550, startH + delta));
      setBottomPanelHeight(nextH);
      try {
        localStorage.setItem('ml_code_studio_panel_height', String(nextH));
      } catch { }
    };

    const onMouseUp = () => {
      setIsDraggingBottom(false);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [bottomPanelHeight]);

  /* ── File Management Handlers ────────────────────────────────────── */
  const handleSelectFile = useCallback(async (name: string) => {
    if (!openTabs.includes(name)) {
      setOpenTabs((prev) => [...prev, name]);
    }
    setActiveExperimentFile(name);
    // If not loaded in memory, fetch content from workspace backend
    if (!experimentFiles[name]) {
      try {
        if (typeof CodeExecutionService?.readWorkspaceFile === 'function') {
          const res = await CodeExecutionService.readWorkspaceFile(effectiveProjectId, name);
          if (res && typeof res.content === 'string') {
            updateExperimentFileCode(name, res.content);
            setSavedCodeByFile((prev) => ({ ...prev, [name]: res.content }));
          }
        }
      } catch (err: any) {
        if (err?.detail?.includes('binary') || err?.message?.includes('binary')) {
          const binaryNotice = `# [Binary Artifact: ${name}]\n# This file contains serialized weights or binary data and cannot be displayed as plain text.`;
          updateExperimentFileCode(name, binaryNotice);
          setSavedCodeByFile((prev) => ({ ...prev, [name]: binaryNotice }));
        }
      }
    }
  }, [openTabs, setActiveExperimentFile, setOpenTabs, experimentFiles, effectiveProjectId, updateExperimentFileCode]);

  const handleCloseTab = useCallback((fileName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const nextTabs = openTabs.filter((t) => t !== fileName);
    setOpenTabs(nextTabs);
    if (activeExperimentFile === fileName) {
      const idx = openTabs.indexOf(fileName);
      const fallback = nextTabs[Math.min(idx, nextTabs.length - 1)] || '';
      if (fallback) setActiveExperimentFile(fallback);
    }
  }, [openTabs, activeExperimentFile, setOpenTabs, setActiveExperimentFile]);

  const handleNewFile = useCallback(() => {
    const existing = Object.keys(experimentFiles);
    let count = 1;
    let name = `experiment_${count}.py`;
    while (existing.includes(name)) {
      count++;
      name = `experiment_${count}.py`;
    }
    setPendingNewFileName(name);
  }, [experimentFiles]);

  const handleConfirmNewFile = useCallback(async () => {
    if (!pendingNewFileName || !pendingNewFileName.trim()) {
      setPendingNewFileName(null);
      return;
    }
    const safeName = pendingNewFileName.trim().endsWith('.py')
      ? pendingNewFileName.trim()
      : `${pendingNewFileName.trim()}.py`;
    const initialCode = '# Machine Learning Experiment Pipeline\nimport numpy as np\nimport pandas as pd\n\n';
    createExperimentFile(safeName, initialCode);
    setPendingNewFileName(null);
    try {
      if (typeof CodeExecutionService?.createWorkspaceFile === 'function') {
        await CodeExecutionService.createWorkspaceFile(effectiveProjectId, safeName, initialCode);
      }
      refreshWorkspaceFiles();
    } catch {
      /* Graceful fallback if backend offline */
    }
  }, [pendingNewFileName, createExperimentFile, effectiveProjectId, refreshWorkspaceFiles]);

  const handleCancelNewFile = useCallback(() => {
    setPendingNewFileName(null);
  }, []);

  const handleDeleteFile = useCallback(async (name: string) => {
    if (name.startsWith('data/') || name === 'data') {
      onShowToast?.('Forbidden', 'Files in data/ are read-only and cannot be deleted.', 'error');
      return;
    }
    deleteExperimentFile(name);
    try {
      if (typeof CodeExecutionService?.deleteWorkspaceFile === 'function') {
        await CodeExecutionService.deleteWorkspaceFile(effectiveProjectId, name);
      }
      refreshWorkspaceFiles();
    } catch {
      /* Graceful fallback if backend offline */
    }
  }, [deleteExperimentFile, effectiveProjectId, refreshWorkspaceFiles, onShowToast]);



  const handleCopyCode = async () => {
    if (!displayedCode) return;
    try {
      await navigator.clipboard.writeText(displayedCode);
      setCopied(true);
      onShowToast?.('Code Copied', 'Pipeline script copied to clipboard.', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      onShowToast?.('Copy Failed', 'Could not copy code.', 'error');
    }
  };

  const handleSaveCode = useCallback(async () => {
    if (!displayedCode || isFileReadOnly) return;
    setIsAutosaving(true);
    try {
      if (typeof CodeExecutionService?.saveWorkspaceFile === 'function') {
        await CodeExecutionService.saveWorkspaceFile(effectiveProjectId, currentFile, displayedCode);
      }
      setSavedCodeByFile((prev) => ({ ...prev, [currentFile]: displayedCode }));
      refreshWorkspaceFiles();
    } catch (err: any) {
      if (err?.status === 403) {
        onShowToast?.('Read-only File', 'This file is read-only and cannot be saved.', 'error');
        setIsAutosaving(false);
        return;
      }
    } finally {
      setIsAutosaving(false);
    }

    const parsed = parsePipelineTargetAndConfig(displayedCode);
    let updatedConfig = trainingConfig;

    if (parsed.target) {
      setSelectedTarget(parsed.target);
      if (updatedConfig) {
        updatedConfig = { ...updatedConfig, target_column: parsed.target };
      }
      if (activeJob) {
        const updatedJob = { ...activeJob, target_column: parsed.target };
        setActiveJob(updatedJob);
        if (setFileJob) setFileJob(currentFile, updatedJob);
      }
    }
    if (parsed.features && parsed.features.length > 0) {
      setSelectedFeatures(parsed.features);
      if (updatedConfig) {
        updatedConfig = { ...updatedConfig, feature_columns: parsed.features };
      }
    }
    if (parsed.algorithm && updatedConfig) {
      updatedConfig = { ...updatedConfig, algorithm: parsed.algorithm };
    }

    if (updatedConfig !== trainingConfig) {
      setTrainingConfig(updatedConfig);
    }

    if (parsed.isSynced) {
      onShowToast?.(
        'File Saved',
        `${currentFile} saved and synced to builder config.${parsed.target ? ` Target: ${parsed.target}` : ''}`,
        'success'
      );
    } else {
      onShowToast?.(
        'File Saved (Config Not Synced)',
        parsed.parseError || 'Manual edits differ from visual builder structure.',
        'info'
      );
    }
  }, [
    currentFile,
    displayedCode,
    isFileReadOnly,
    effectiveProjectId,
    trainingConfig,
    activeJob,
    setSelectedTarget,
    setTrainingConfig,
    setActiveJob,
    setFileJob,
    setSelectedFeatures,
    refreshWorkspaceFiles,
    onShowToast,
  ]);

  /* ── Code Execution Handlers ─────────────────────────────────────── */
  const handleRunCode = async () => {
    if (execStatus === 'running') return;
    if (!displayedCode || !displayedCode.trim()) {
      setOutputLines(['[ML Playground] No code to execute. File is empty.']);
      setBottomPanelOpen(true);
      setBottomTab('output');
      return;
    }

    // Build/syntax pre-flight check: prevent execution if buffer contains errors
    const blockingErrors = allDiagnostics.filter((d) => d.severity === 'error');
    if (blockingErrors.length > 0) {
      setBottomPanelOpen(true);
      setBottomTab('problems');
      onShowToast?.(
        'Execution Blocked',
        `Fix ${blockingErrors.length} syntax error${blockingErrors.length > 1 ? 's' : ''} on line ${blockingErrors[0].line} before running.`,
        'error'
      );
      return;
    }

    const startTime = Date.now();
    const makeLog = (level: LogEntry['level'], message: string): LogEntry => ({
      id: `${Date.now()}-${Math.random()}`,
      time: new Date().toLocaleTimeString('en-US', { hour12: false }),
      level,
      message,
    });

    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (eventSourceRef.current) {
      try {
        eventSourceRef.current.close();
      } catch { }
      eventSourceRef.current = null;
    }

    setBottomPanelOpen(true);
    setBottomTab('output');
    setOutputLines([`[ML Playground] Submitting ${currentFile} for sandboxed execution...`]);
    setExecStatus('queued');
    setQueuePosition(null);
    setIsOutputTruncated(false);
    setExecExitCode(null);
    setExecDuration(null);
    setExecArtifacts([]);
    setExecModelId(null);
    setIsDeployingArtifact(false);
    setRuntimeDiagnostics([]);
    setLogEntries([
      makeLog('system', `Execution started: '${currentFile}'`),
      ...(dataset?.fileName ? [makeLog('info', `Dataset context: ${dataset.fileName}`)] : []),
      ...(trainingConfig?.algorithm ? [makeLog('info', `Algorithm: ${trainingConfig.algorithm}`)] : []),
    ]);

    try {
      const res = await CodeExecutionService.execute({
        code: displayedCode,
        filename: currentFile,
        dataset_id: dataset?.datasetId || trainingConfig?.dataset_id,
        project_id: effectiveProjectId,
        timeout: 90,
      });

      setExecId(res.exec_id);
      if (res.status === 'queued') {
        setExecStatus('queued');
        setQueuePosition(res.queue_position ?? 1);
        setLogEntries(prev => [...prev, makeLog('info', `Execution queued (position #${res.queue_position ?? 1})`)]);
        setOutputLines((prev) => [
          ...prev,
          `[ML Playground] Execution queued (position #${res.queue_position ?? 1}). Waiting for worker...`,
        ]);
      } else {
        setExecStatus('running');
        setQueuePosition(null);
        setLogEntries(prev => [...prev, makeLog('info', `Execution accepted (ID: ${res.exec_id.slice(0, 8)})`)]);
        setOutputLines((prev) => [
          ...prev,
          `[ML Playground] Execution started (ID: ${res.exec_id.slice(0, 8)}). Streaming output...`,
        ]);
      }

      const streamUrl = CodeExecutionService.streamUrl(res.exec_id);
      const es = new EventSource(streamUrl);
      eventSourceRef.current = es;
      let hasExited = false;
      // Accumulate all output for post-run traceback analysis
      const allOutputRef: string[] = [];

      es.onmessage = (event) => {
        const rawData = event.data;

        // ── Try JSON first (backend sends typed JSON events) ──────────
        try {
          const data = JSON.parse(rawData);

          if (data.type === 'queued') {
            setExecStatus('queued');
            setQueuePosition(data.position ?? 1);
            setOutputLines((p) => [...p, `[ML Playground] Job queued (position #${data.position ?? 1}).`]);
            setLogEntries(prev => [...prev, makeLog('info', `Queued at position #${data.position ?? 1}`)]);

          } else if (data.type === 'status') {
            if (data.status === 'running') {
              setExecStatus('running');
              setQueuePosition(null);
              setOutputLines((p) => [...p, '[ML Playground] Execution running on worker.']);
            }

          } else if (data.type === 'stdout' && data.data) {
            setExecStatus((curr) => (curr === 'queued' ? 'running' : curr));
            setQueuePosition(null);
            setOutputLines((p) => [...p, data.data]);
            allOutputRef.push(data.data);
            setLogEntries(prev => [...prev, makeLog('debug', data.data.slice(0, 120))]);

          } else if (data.type === 'stderr' && data.data) {
            setExecStatus((curr) => (curr === 'queued' ? 'running' : curr));
            setQueuePosition(null);
            const line = `[stderr] ${data.data}`;
            setOutputLines((p) => [...p, line]);
            allOutputRef.push(line);
            setLogEntries(prev => [...prev, makeLog('warn', data.data.slice(0, 120))]);

          } else if (data.type === 'system' && data.data) {
            if (!data.data.toLowerCase().includes('queued')) {
              setExecStatus((curr) => (curr === 'queued' ? 'running' : curr));
              setQueuePosition(null);
            }
            setOutputLines((p) => [...p, data.data]);
            allOutputRef.push(data.data);
            setLogEntries(prev => [...prev, makeLog('system', data.data)]);

          } else if (data.type === 'exit') {
            hasExited = true;
            const exitCode = data.exit_code ?? 0;
            const dur = data.duration_seconds ?? (Date.now() - startTime) / 1000;
            const arts = Array.isArray(data.artifacts) ? data.artifacts : [];
            if (data.is_truncated) {
              setIsOutputTruncated(true);
            }
            setExecExitCode(exitCode);
            setExecDuration(dur);
            setExecArtifacts(arts);
            if (data.model_id) setExecModelId(data.model_id);
            const rawStatus = data.status;
            const newStatus =
              rawStatus ||
              (exitCode === 0
                ? 'completed'
                : exitCode === 124
                  ? 'timed_out'
                  : exitCode === 137
                    ? 'out_of_memory'
                    : exitCode === 130
                      ? 'cancelled'
                      : 'failed');
            setExecStatus(newStatus as any);
            setQueuePosition(null);
            setLogEntries(prev => [
              ...prev,
              makeLog(newStatus === 'completed' ? 'info' : 'error',
                `Process exited with code ${exitCode} (${newStatus}) in ${dur.toFixed(2)}s`),
              ...(arts.length > 0 ? [makeLog('info', `Artifacts saved: ${arts.join(', ')}`)] : []),
            ]);
            // Parse traceback → inline error markers (keep terminal tab active)
            if (exitCode === 0) {
              setRuntimeDiagnostics([]);
              const extracted = extractExecutionMetrics(allOutputRef);
              const parsed = parsePipelineTargetAndConfig(displayedCode);
              const createdJob: JobEntity = {
                job_id: res.exec_id,
                dataset_id: dataset?.datasetId || trainingConfig?.dataset_id || 'dataset',
                status: 'COMPLETED',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                job_type: 'training',
                algorithm: parsed.algorithm || trainingConfig?.algorithm || 'code_studio_pipeline',
                target_column: parsed.target || selectedTarget || trainingConfig?.target_column || 'target',
                feature_columns: (parsed.features && parsed.features.length > 0) ? parsed.features : (trainingConfig?.feature_columns || []),
                progress: 100,
                current_stage: 'Completed',
                retry_count: 0,
                metadata: {
                  metrics: extracted.metrics,
                  scaler: parsed.scaler || trainingConfig?.scaler || 'standard_scaler',
                  imputer: parsed.imputer || trainingConfig?.imputer || 'median',
                  train_test_split: parsed.testSplit != null ? (1 - parsed.testSplit) : (trainingConfig?.train_test_split || 0.8),
                  cross_validation: parsed.cvFolds || trainingConfig?.cv_folds || 5,
                  hyperparameters: parsed.hyperparameters,
                },
              };
              setFileJob(currentFile, createdJob);
              if (!activeJob) {
                setActiveJob(createdJob);
              }
            } else {
              const errDiags = parseRuntimeErrors(allOutputRef, currentFile, displayedCode.split('\n').length);
              setRuntimeDiagnostics(errDiags);
            }
            refreshWorkspaceFiles();
            es.close();

          } else if (data.type === 'error') {
            hasExited = true;
            const errMsg = `[Error] ${data.error}`;
            setOutputLines((p) => [...p, errMsg]);
            allOutputRef.push(errMsg);
            setLogEntries(prev => [...prev, makeLog('error', data.error)]);
            setExecStatus('failed');
            setQueuePosition(null);
            setExecDuration((Date.now() - startTime) / 1000);
            const errDiags = parseRuntimeErrors(allOutputRef, currentFile, displayedCode.split('\n').length);
            setRuntimeDiagnostics(errDiags);
            refreshWorkspaceFiles();
            es.close();

          }
          // heartbeat → ignore
          return;
        } catch {
          // Not JSON → plain-text fallback (legacy stream)
        }

        // ── Plain-text fallback ────────────────────────────────────────
        if (rawData.startsWith('[DONE]')) {
          hasExited = true;
          const statusMatch = rawData.match(/status=(\w+)/);
          const st = (statusMatch?.[1] ?? 'completed') as any;
          setExecStatus(st);
          setExecDuration((Date.now() - startTime) / 1000);
          setLogEntries(prev => [...prev, makeLog(st === 'completed' ? 'info' : 'error', `Execution ${st}`)]);
          CodeExecutionService.getResult(res.exec_id).then(finalRes => {
            setExecDuration(finalRes.duration_seconds ?? null);
            setExecExitCode(finalRes.exit_code ?? null);
            if (finalRes.artifacts) setExecArtifacts(finalRes.artifacts);
            if (finalRes.model_id) setExecModelId(finalRes.model_id);
            const allLines = [
              ...(finalRes.stdout ? finalRes.stdout.split('\n') : []),
              ...(finalRes.stderr ? finalRes.stderr.split('\n').map(l => `[stderr] ${l}`) : []),
            ];
            if (finalRes.exit_code === 0 || finalRes.status === 'completed') {
              setRuntimeDiagnostics([]);
            } else {
              const errDiags = parseRuntimeErrors(allLines, currentFile, displayedCode.split('\n').length);
              setRuntimeDiagnostics(errDiags);
            }
          }).catch(() => { }).finally(() => {
            refreshWorkspaceFiles();
          });
          es.close();
          return;
        }

        const isStderr = rawData.startsWith('[stderr]');
        const isError = rawData.startsWith('[Error]') || rawData.startsWith('[ERROR]');
        const isMlpg = rawData.startsWith('[ML Playground]');
        setOutputLines((p) => [...p, rawData]);
        allOutputRef.push(rawData);
        if (isError) setLogEntries(prev => [...prev, makeLog('error', rawData)]);
        else if (isStderr) setLogEntries(prev => [...prev, makeLog('warn', rawData.replace(/^\[stderr\]\s?/, ''))]);
        else if (isMlpg) setLogEntries(prev => [...prev, makeLog('system', rawData)]);
        else setLogEntries(prev => [...prev, makeLog('debug', rawData.slice(0, 120))]);
      };

      const finalizeExecution = (finalRes: any) => {
        if (hasExited) return;
        hasExited = true;
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        if (eventSourceRef.current) {
          try { eventSourceRef.current.close(); } catch { }
          eventSourceRef.current = null;
        }
        if (finalRes.stdout) {
          const stdLines = finalRes.stdout.split('\n').filter(Boolean);
          setOutputLines((p) => [...p, ...stdLines]);
          allOutputRef.push(...stdLines);
        }
        if (finalRes.stderr) {
          const errLines = finalRes.stderr.split('\n').filter(Boolean).map((l: string) => `[stderr] ${l}`);
          setOutputLines((p) => [...p, ...errLines]);
          allOutputRef.push(...errLines);
        }
        if (finalRes.is_truncated) {
          setIsOutputTruncated(true);
        }
        const st = finalRes.status as any;
        setExecStatus(st);
        setQueuePosition(null);
        setExecExitCode(finalRes.exit_code ?? (finalRes.status === 'completed' ? 0 : null));
        setExecDuration(finalRes.duration_seconds ?? (Date.now() - startTime) / 1000);
        if (finalRes.artifacts) setExecArtifacts(finalRes.artifacts);
        if (finalRes.model_id) setExecModelId(finalRes.model_id);
        if (finalRes.exit_code === 0 || finalRes.status === 'completed') {
          setRuntimeDiagnostics([]);
          const extracted = extractExecutionMetrics(allOutputRef);
          const parsed = parsePipelineTargetAndConfig(displayedCode);
          const createdJob: JobEntity = {
            job_id: res.exec_id,
            dataset_id: dataset?.datasetId || trainingConfig?.dataset_id || 'dataset',
            status: 'COMPLETED',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            job_type: 'training',
            algorithm: parsed.algorithm || trainingConfig?.algorithm || 'code_studio_pipeline',
            target_column: parsed.target || selectedTarget || trainingConfig?.target_column || 'target',
            feature_columns: (parsed.features && parsed.features.length > 0) ? parsed.features : (trainingConfig?.feature_columns || []),
            progress: 100,
            current_stage: 'Completed',
            retry_count: 0,
            metadata: {
              metrics: extracted.metrics,
              scaler: parsed.scaler || trainingConfig?.scaler || 'standard_scaler',
              imputer: parsed.imputer || trainingConfig?.imputer || 'median',
              train_test_split: parsed.testSplit != null ? (1 - parsed.testSplit) : (trainingConfig?.train_test_split || 0.8),
              cross_validation: parsed.cvFolds || trainingConfig?.cv_folds || 5,
              hyperparameters: parsed.hyperparameters,
            },
          };
          setFileJob(currentFile, createdJob);
          if (!activeJob) {
            setActiveJob(createdJob);
          }
        } else {
          const errDiags = parseRuntimeErrors(allOutputRef, currentFile, displayedCode.split('\n').length);
          setRuntimeDiagnostics(errDiags);
        }
        setLogEntries(prev => [
          ...prev,
          makeLog(
            st === 'completed' ? 'info' : 'error',
            `Execution finished with status: ${st}${finalRes.exit_code != null ? ` (exit ${finalRes.exit_code})` : ''}`
          ),
        ]);
        refreshWorkspaceFiles();
      };

      es.onerror = () => {
        try { es.close(); } catch { }
        if (hasExited) return;

        // Poll execution status until terminal — never abort a queued or running job on stream disconnect
        let pollCount = 0;
        const maxPolls = 120;
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
        }
        pollIntervalRef.current = setInterval(() => {
          if (hasExited || pollCount++ >= maxPolls) {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            if (!hasExited) {
              setExecStatus('failed');
              setLogEntries(prev => [...prev, makeLog('error', 'Execution polling timed out.')]);
            }
            return;
          }

          CodeExecutionService.getResult(res.exec_id)
            .then((pollRes) => {
              if (pollRes.status === 'queued') {
                setExecStatus('queued');
              } else if (pollRes.status === 'running') {
                setExecStatus('running');
                setQueuePosition(null);
              } else {
                // Reached terminal status (completed, failed, cancelled, timed_out, etc.)
                if (pollIntervalRef.current) {
                  clearInterval(pollIntervalRef.current);
                  pollIntervalRef.current = null;
                }
                finalizeExecution(pollRes);
              }
            })
            .catch(() => {
              // Retry on next tick
            });
        }, 1000);
      };
    } catch (err: any) {
      setExecStatus('failed');
      setExecExitCode(null); // CRITICAL: Never fabricate an exit code (e.g. exit 1) for a request that didn't run!
      setExecDuration(null);
      setQueuePosition(null);
      const isNotFound = err?.status === 404;
      const isAuth = err?.status === 401 || err?.status === 403;
      const errMsg = isNotFound
        ? '[ML Playground] Execution backend unavailable (404 Not Found). The code execution service is not registered or running.'
        : isAuth
          ? '[ML Playground] Authentication required. Please log in to execute code.'
          : `[ML Playground] Execution unavailable: ${err?.message || 'Could not connect to execution service.'}`;
      setOutputLines((prev) => [...prev, errMsg]);
      setLogEntries(prev => [...prev, makeLog('error', errMsg.replace('[ML Playground] ', ''))]);
      onShowToast?.('Execution Unavailable', isNotFound ? 'Backend execution service unavailable (404).' : (err?.message || 'Execution failed.'), 'error');
    }
  };

  const handleStopExecution = async () => {
    if (!execId) return;
    try {
      if (webSocketRef.current && webSocketRef.current.readyState === WebSocket.OPEN) {
        try {
          webSocketRef.current.send(JSON.stringify({ action: 'stop' }));
        } catch { }
        webSocketRef.current.close();
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      await CodeExecutionService.stop(execId);
      setExecStatus('cancelled');
      setQueuePosition(null);
      setOutputLines((p) => [...p, '[ML Playground] Execution cancelled / stopped by user.']);
    } catch (err: any) {
      setOutputLines((p) => [...p, `[Error] Failed to stop execution: ${err.message}`]);
    }
  };

  /* ── Global IDE Keyboard Shortcuts (Ctrl+Enter: Run, Ctrl+S: Save) ── */
  useEffect(() => {
    if (!isActive) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (execStatus !== 'running' && execStatus !== 'queued' && !isGenerating && displayedCode) {
          handleRunCode();
        }
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        handleSaveCode();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, execStatus, isGenerating, displayedCode, handleRunCode, handleSaveCode]);

  const handleDeployFromCodeStudio = async () => {
    setIsDeployingArtifact(true);
    try {
      const targetModelId = execModelId || (execId ? `model-exec-${execId.slice(0, 8)}` : null);
      const dep = await LocalDeploymentService.create({
        modelId: targetModelId || undefined,
        jobId: !targetModelId ? (activeJob?.job_id || undefined) : undefined,
        name: `${currentFile.replace(/\.py$/, '')} Service`,
      });
      onShowToast?.(
        'Model Deployed!',
        `Serving endpoint for ${currentFile} is live in Deployment Studio.`,
        'success'
      );
      onNavigate?.('deployments', dep.deployment_id);
    } catch (err: any) {
      onShowToast?.(
        'Deployment Failed',
        err?.detail || err?.message || 'Could not instantiate local serving endpoint.',
        'error'
      );
    } finally {
      setIsDeployingArtifact(false);
    }
  };



  /* ── Find in Code Handler ────────────────────────────────────────── */
  useEffect(() => {
    if (!findQuery || !displayedCode) {
      setFindMatches([]);
      setFindMatchIdx(0);
      return;
    }
    const matches: number[] = [];
    let idx = 0;
    const lowerCode = displayedCode.toLowerCase();
    const lowerQuery = findQuery.toLowerCase();
    while ((idx = lowerCode.indexOf(lowerQuery, idx)) !== -1) {
      matches.push(idx);
      idx += lowerQuery.length;
    }
    setFindMatches(matches);
    setFindMatchIdx(0);
  }, [findQuery, displayedCode]);

  const jumpToMatch = (index: number) => {
    if (findMatches.length === 0) return;
    const targetIdx = (index + findMatches.length) % findMatches.length;
    setFindMatchIdx(targetIdx);
  };

  /* ── Interactive Traceback Jump ──────────────────────────────────── */
  const handleJumpToTraceback = useCallback((targetFile: string, lineNum: number) => {
    const norm = targetFile.replace(/\\/g, '/');
    const baseName = norm.split('/').pop() || norm;

    // Find matching file among open tabs or workspace files
    const matchingFileName =
      openTabs.find((t) => t === baseName || t.endsWith(`/${baseName}`)) ||
      Object.keys(experimentFiles).find((k) => k === baseName || k.endsWith(`/${baseName}`)) ||
      baseName;

    if (matchingFileName) {
      if (!openTabs.includes(matchingFileName)) {
        setOpenTabs((prev) => [...prev, matchingFileName]);
      }
      setActiveExperimentFile(matchingFileName);
    }

    setCursorPos({ line: lineNum, col: 1 });
    setJumpTarget({ line: lineNum, col: 1 });
    setRuntimeDiagnostics([
      {
        line: lineNum,
        col: 1,
        message: `Traceback reference: ${baseName} at line ${lineNum}`,
        severity: 'error',
        source: 'runtime',
      },
    ]);
    onShowToast?.('Jumped to Traceback', `${baseName}:${lineNum}`, 'info');
  }, [openTabs, experimentFiles, setOpenTabs, setActiveExperimentFile, onShowToast]);

  /* ── AI Copilot Context Cards ────────────────────────────────────── */
  const copilotMessages = useMemo<CopilotMsg[]>(() => {
    const msgs: CopilotMsg[] = [];
    const target = selectedTarget || trainingConfig?.target_column;
    const features = selectedFeatures.length > 0 ? selectedFeatures : (trainingConfig?.feature_columns ?? []);

    msgs.push({
      id: 'pipeline-target',
      type: 'tip',
      text: `Supervised target variable: **${target || 'not set'}** (${inferredTaskType || 'supervised learning'}).`,
    });

    const excludedIds = (dataset?.columns || [])
      .map((c: any) => (typeof c === 'string' ? c : c?.name))
      .filter(Boolean)
      .filter((name: string) => isColumnIdentifier(name));
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
      text: `**${features.length} features** transformed via **${canonicalImputer || 'median'}** imputation and **${canonicalScaler || 'standard_scaler'}** scaling.`,
    });

    msgs.push({
      id: 'pipeline-model',
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

  /* ── AI Copilot Ask Question Handler (Real LLM Backend) ──────────── */
  const handleSendCopilotMessage = async (promptText?: string, expectProposal: boolean = false) => {
    const textToSend = (promptText || copilotInput).trim();
    if (!textToSend || isCopilotThinking) return;

    const userMsg = { id: `u-${Date.now()}`, role: 'user' as const, text: textToSend };
    setCopilotChat((prev) => [...prev, userMsg]);
    if (!promptText) setCopilotInput('');
    setIsCopilotThinking(true);

    try {
      // Gather runtime error lines if any occurred in terminal
      const errorLines = outputLines
        .filter((l) => l.toLowerCase().includes('traceback') || l.toLowerCase().includes('error') || l.toLowerCase().includes('exception'))
        .slice(-15)
        .join('\n');

      const chatHistory = copilotChat.slice(-6).map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.text,
      }));

      const res = await CopilotApiService.chat({
        prompt: textToSend,
        code_context: displayedCode,
        dataset_name: activeDatasetName || undefined,
        dataset_schema: dataset?.columns ? { columns: dataset.columns } : undefined,
        error_traceback: errorLines || undefined,
        chat_history: chatHistory,
      });

      setCopilotChat((prev) => [
        ...prev,
        { id: `a-${Date.now()}`, role: 'assistant', text: res.reply },
      ]);

      // If Copilot proposed code and user requested a fix, open side-by-side diff review
      const codeMatch = res.reply.match(/```(?:python)?\s*([\s\S]+?)\s*```/);
      if (expectProposal && codeMatch && codeMatch[1]) {
        const proposedCode = codeMatch[1].trim();
        if (proposedCode.length > 20) {
          setDiffModalState({
            isOpen: true,
            filename: currentFile,
            candidateCode: proposedCode,
          });
        }
      }
    } catch (err: any) {
      setCopilotChat((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: `❌ **[Copilot Request Failed]**\n\n${err?.message || 'Unable to connect to AI Copilot service.'}`,
        },
      ]);
    } finally {
      setIsCopilotThinking(false);
    }
  };

  /* ── 5.5 Copilot Explain & Fix Actions with Side-by-Side Diff Review ── */
  const handleCopilotExplainDiagnostic = (diag: Diagnostic) => {
    setIsCopilotOpen(true);
    const prompt = `Please explain this issue: "${diag.message}" (source: ${diag.source || 'linter'}) on line ${diag.line} of ${currentFile}. Why does this matter and how does it impact ML model correctness?`;
    handleSendCopilotMessage(prompt, false);
  };

  const handleCopilotFixDiagnostic = (diag: Diagnostic) => {
    setIsCopilotOpen(true);
    const prompt = `Please fix this problem in my code: "${diag.message}" on line ${diag.line} of ${currentFile}. Return the complete updated Python code block for the file.`;
    handleSendCopilotMessage(prompt, true);
  };

  /* ── 5.3 Quick ML Snippet Insertion with Learning Mode Guidance ──── */
  const handleInsertSnippet = (snip: MLSnippetDefinition) => {
    if (isFileReadOnly) return;
    const cleanSnippetCode = snip.insertText.replace(/\$\{\d+:([^}]+)\}/g, '$1');
    const newCode = displayedCode ? `${displayedCode}\n\n${cleanSnippetCode}\n` : `${cleanSnippetCode}\n`;
    updateExperimentFileCode(currentFile, newCode);
    markFileModified(currentFile);

    if (learningMode) {
      onShowToast?.(
        `🎓 [Learning Mode] ${snip.title}`,
        snip.learningExplanation,
        'info'
      );
      try {
        logSignal('snippet_inserted', snip.id, undefined, 'code_studio');
      } catch { }
    } else {
      onShowToast?.('Snippet Inserted', `Added ${snip.title} to ${currentFile}`, 'success');
    }
  };

  /* ── Lines for Code Editor ───────────────────────────────────────── */
  const codeLines = displayedCode.split('\n');
  const experimentFileList = Object.keys(experimentFiles).map((name) => ({ name }));


  /* ── Accessible Empty State ──────────────────────────────────────── */
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
          <FileCode style={{ width: 32, height: 32, color: BB.gold }} />
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: BB.text, margin: '0 0 8px 0' }}>
          Code Studio
        </h2>
        <p style={{ fontSize: 13, color: BB.muted, maxWidth: 440, margin: '0 0 24px 0', lineHeight: 1.6 }}>
          No active dataset or training configuration detected. Select a dataset and configure your machine learning target to automatically generate and run production-grade Python scikit-learn pipelines.
        </p>
        <button
          onClick={() => onNavigate?.('workspace')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 22px',
            borderRadius: 8,
            background: `linear-gradient(135deg, ${BB.primary}, ${BB.maroon})`,
            border: `1px solid ${BB.gold}`,
            color: BB.text,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            transition: 'all 150ms ease',
          }}
        >
          <span>Go to Dataset and Profiler</span>
          <ChevronRight style={{ width: 14, height: 14 }} />
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        width: '100%',
        height: '100%',
        background: BB.base,
        overflow: 'hidden',
        userSelect: isDraggingExplorer || isDraggingBottom ? 'none' : 'auto',
      }}
    >
      {/* ── Visual Side-by-Side Diff Modal (Enterprise Safe Regeneration) ── */}
      <RegenerateDiffModal
        isOpen={diffModalState.isOpen}
        filename={diffModalState.filename}
        currentCode={experimentFiles[diffModalState.filename] || ''}
        regeneratedCode={diffModalState.candidateCode}
        onAccept={handleAcceptDiff}
        onReject={handleRejectDiff}
      />

      {/* ── Pipeline Guardian ML Impact & Cause-and-Effect Analysis Modal ── */}
      <PipelineGuardianModal
        isOpen={isPipelineGuardianOpen}
        filename={currentFile}
        currentCode={displayedCode}
        baselineCode={builderCodeByFile[currentFile] || generatedCode || ''}
        baselineConfig={trainingConfig}
        onClose={() => setIsPipelineGuardianOpen(false)}
        onRunExperiment={handleRunCode}
      />

      {/* ── Scikit-Learn ML Snippets Modal Dialog ── */}
      {isSnippetsDropdownOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Scikit-Learn ML Snippets"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(5, 3, 10, 0.78)',
            backdropFilter: 'blur(6px)',
            padding: 20,
          }}
        >
          {/* Backdrop click target */}
          <div
            data-testid="snippets-backdrop"
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 1,
            }}
            onClick={() => setIsSnippetsDropdownOpen(false)}
          />
          {/* Modal Container */}
          <div
            data-testid="snippets-dropdown-list"
            style={{
              position: 'relative',
              zIndex: 2,
              width: '100%',
              maxWidth: 640,
              maxHeight: '85vh',
              background: '#151026',
              border: `1px solid ${BB.gold}`,
              borderRadius: 12,
              boxShadow: '0 24px 64px rgba(0, 0, 0, 0.9), 0 0 20px rgba(201, 162, 75, 0.25)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: '14px 18px',
                borderBottom: `1px solid ${BB.border}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'linear-gradient(90deg, #1C1534 0%, #151026 100%)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: 'rgba(201, 162, 75, 0.15)',
                    border: '1px solid rgba(201, 162, 75, 0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: BB.gold,
                  }}
                >
                  <FileCode style={{ width: 18, height: 18 }} />
                </div>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: BB.text }}>
                    Scikit-Learn ML Snippets
                  </div>
                  <div style={{ fontSize: 11, color: BB.muted, marginTop: 2 }}>
                    Battle-tested scikit-learn patterns to insert into {currentFile}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setIsSnippetsDropdownOpen(false)}
                title="Close snippets (Esc)"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: BB.muted,
                  cursor: 'pointer',
                  padding: 6,
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X style={{ width: 18, height: 18 }} />
              </button>
            </div>

            {/* Snippets List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {ML_SNIPPETS.map((snip) => (
                <div
                  key={snip.id}
                  data-testid={`snippet-item-${snip.id}`}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 8,
                    background: 'rgba(28, 21, 52, 0.6)',
                    border: `1px solid ${BB.border}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    transition: 'all 100ms ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: BB.text }}>
                        {snip.title}
                      </span>
                      <span
                        style={{
                          fontSize: 9.5,
                          fontFamily: 'Consolas, Monaco, monospace',
                          padding: '1px 6px',
                          borderRadius: 4,
                          background: 'rgba(201, 162, 75, 0.15)',
                          color: BB.gold,
                          border: '1px solid rgba(201, 162, 75, 0.3)',
                        }}
                      >
                        +{snip.id}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        setIsSnippetsDropdownOpen(false);
                        handleInsertSnippet(snip);
                      }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '4px 10px',
                        borderRadius: 5,
                        background: 'linear-gradient(135deg, rgba(201,162,75,0.25), rgba(75,59,124,0.35))',
                        border: `1px solid ${BB.gold}`,
                        color: BB.gold,
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'all 120ms ease',
                      }}
                    >
                      <Plus style={{ width: 12, height: 12 }} />
                      <span>Insert Snippet</span>
                    </button>
                  </div>

                  <div style={{ fontSize: 11, color: BB.muted, lineHeight: 1.45 }}>
                    {snip.documentation}
                  </div>

                  {snip.learningExplanation && (
                    <div
                      style={{
                        padding: '6px 10px',
                        borderRadius: 6,
                        background: 'rgba(75, 59, 124, 0.25)',
                        borderLeft: `3px solid ${BB.gold}`,
                        fontSize: 10.5,
                        color: '#D4CDE6',
                        lineHeight: 1.4,
                      }}
                    >
                      <strong style={{ color: BB.gold }}>ML Best Practice: </strong>
                      {snip.learningExplanation}
                    </div>
                  )}

                  {/* Code Preview box */}
                  <div
                    style={{
                      padding: '8px 10px',
                      borderRadius: 6,
                      background: '#0B0914',
                      border: '1px solid rgba(255,255,255,0.06)',
                      fontFamily: 'Consolas, Monaco, monospace',
                      fontSize: 10.5,
                      color: '#9E93B8',
                      maxHeight: 90,
                      overflowY: 'auto',
                      whiteSpace: 'pre-wrap',
                      lineHeight: 1.4,
                    }}
                  >
                    {snip.insertText.slice(0, 220)}...
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── LEFT & CENTER: STUDIO WORKSPACE (Tabs, Toolbar, Explorer, Editor, Terminal) ── */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          overflow: 'hidden',
        }}
      >
        {/* ── TOP STUDIO TAB BAR & TOOLBAR (Fixed 38px) ────────────────── */}
        <header
          style={{
            height: 38,
            flexShrink: 0,
            background: BB.surfaceSubtle,
            borderBottom: `1px solid ${BB.border}`,
            display: 'flex',
            alignItems: 'stretch',
            justifyContent: 'space-between',
            overflow: 'visible',
            zIndex: 40,
          }}
        >
          {/* Left: Tab System */}
          <div style={{ display: 'flex', alignItems: 'stretch', overflowX: 'auto', overflowY: 'hidden', flex: 1 }}>
            {effectiveTabs.map((tab) => {
              const isActiveTab = tab === currentFile;
              const isModified = modifiedFiles.includes(tab);
              return (
                <div
                  key={tab}
                  onClick={() => handleSelectFile(tab)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '0 12px',
                    cursor: 'pointer',
                    background: isActiveTab ? BB.surface : 'transparent',
                    borderRight: `1px solid ${BB.border}`,
                    borderBottom: isActiveTab ? `2px solid ${BB.gold}` : '2px solid transparent',
                    color: isActiveTab ? BB.text : BB.muted,
                    fontSize: 12,
                    fontFamily: 'Consolas, Monaco, monospace',
                    fontWeight: isActiveTab ? 600 : 400,
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                    userSelect: 'none',
                    transition: 'background 100ms ease, color 100ms ease',
                  }}
                >
                  <FileCode style={{ width: 13, height: 13, color: isActiveTab ? BB.gold : '#38BDF8', flexShrink: 0 }} />
                  <span>{tab}</span>
                  {isModified && (
                    <span
                      title="Modified"
                      style={{ width: 6, height: 6, borderRadius: '50%', background: BB.gold, flexShrink: 0 }}
                    />
                  )}
                  {effectiveTabs.length > 1 && (
                    <button
                      onClick={(e) => handleCloseTab(tab, e)}
                      title={`Close ${tab}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        background: 'transparent',
                        border: 'none',
                        color: BB.muted,
                        cursor: 'pointer',
                        padding: 2,
                        borderRadius: 3,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = BB.error; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = BB.muted; }}
                    >
                      <X style={{ width: 11, height: 11 }} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Right: Studio Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', flexShrink: 0 }}>
            {/* Preview Impact / Pipeline Guardian Button */}
            <button
              onClick={() => setIsPipelineGuardianOpen(true)}
              disabled={!displayedCode}
              aria-label="Preview impact"
              title="Review ML cause & effect vs visual pipeline baseline"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 10px',
                borderRadius: 5,
                border: `1px solid ${isFileModified(currentFile) ? BB.gold : BB.border}`,
                background: isFileModified(currentFile) ? 'rgba(201,162,75,0.14)' : 'transparent',
                color: isFileModified(currentFile) ? BB.gold : BB.muted,
                fontSize: 11,
                fontWeight: 600,
                cursor: !displayedCode ? 'not-allowed' : 'pointer',
                transition: 'all 120ms ease',
              }}
            >
              <SplitSquareVertical style={{ width: 12, height: 12 }} />
              <span>Preview Impact</span>
            </button>

            {/* Regenerate Code Button */}
            <button
              onClick={() => safeGeneratePipelineCode(currentFile)}
              disabled={isGenerating || !isConfigValid}
              aria-label="Regenerate code"
              title={isFileModified(currentFile) ? 'Review Regenerated Pipeline Diff' : 'Regenerate pipeline code'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 28,
                height: 26,
                borderRadius: 5,
                border: `1px solid ${isFileModified(currentFile) ? BB.gold : BB.border}`,
                background: 'transparent',
                color: isGenerating ? BB.gold : isFileModified(currentFile) ? BB.gold : BB.muted,
                cursor: isGenerating || !isConfigValid ? 'not-allowed' : 'pointer',
                transition: 'all 120ms ease',
              }}
            >
              <RefreshCw
                style={{
                  width: 13,
                  height: 13,
                  animation: isGenerating ? 'spin 1s linear infinite' : 'none',
                }}
              />
            </button>

            {/* Save File Button */}
            <button
              onClick={handleSaveCode}
              disabled={!displayedCode || isFileReadOnly || !isFileModified(currentFile)}
              aria-label="Save file"
              title="Save changes to workspace (Ctrl+S)"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 9px',
                borderRadius: 5,
                border: `1px solid ${isFileModified(currentFile) ? BB.gold : BB.border}`,
                background: isFileModified(currentFile) ? 'rgba(201,162,75,0.18)' : 'transparent',
                color: isFileModified(currentFile) ? BB.gold : BB.muted,
                fontSize: 11,
                fontWeight: 600,
                cursor: isFileModified(currentFile) ? 'pointer' : 'default',
                transition: 'all 120ms ease',
              }}
            >
              <Save style={{ width: 12, height: 12 }} />
              <span>Save</span>
            </button>

            {/* Copy Code Button */}
            <button
              onClick={handleCopyCode}
              disabled={!displayedCode}
              aria-label="Copy code"
              title={copied ? 'Copied to clipboard!' : 'Copy code to clipboard'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 28,
                height: 26,
                borderRadius: 5,
                border: `1px solid ${copied ? BB.success : BB.border}`,
                background: copied ? 'rgba(34,197,94,0.18)' : 'transparent',
                color: copied ? BB.success : BB.muted,
                cursor: displayedCode ? 'pointer' : 'not-allowed',
                transition: 'all 120ms ease',
              }}
            >
              {copied ? <Check style={{ width: 13, height: 13 }} /> : <Copy style={{ width: 13, height: 13 }} />}
            </button>

            {/* Quick ML Snippets Menu Button */}
            <button
              data-testid="snippets-menu-btn"
              onClick={() => setIsSnippetsDropdownOpen((o) => !o)}
              aria-label="Insert ML snippet"
              title="Insert working scikit-learn ML snippets"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 9px',
                borderRadius: 5,
                border: `1px solid ${isSnippetsDropdownOpen ? BB.gold : BB.border}`,
                background: isSnippetsDropdownOpen ? 'rgba(201,162,75,0.18)' : 'rgba(28,21,52,0.6)',
                color: isSnippetsDropdownOpen ? BB.gold : BB.text,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 120ms ease',
              }}
            >
              <FileCode style={{ width: 12, height: 12, color: BB.gold }} />
              <span>Snippets</span>
            </button>

            <div style={{ width: 1, height: 16, background: BB.border, margin: '0 2px' }} />

            {/* Execution: Stop or Run Experiment Button */}
            {(execStatus === 'running' || execStatus === 'queued') ? (
              <button
                onClick={handleStopExecution}
                aria-label="Stop execution"
                title="Stop running Python execution"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '4px 14px',
                  borderRadius: 5,
                  border: `1px solid ${BB.error}`,
                  background: 'rgba(239,68,68,0.22)',
                  color: BB.error,
                  fontSize: 11.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 0 10px rgba(239,68,68,0.25)',
                  transition: 'all 120ms ease',
                }}
              >
                <Square style={{ width: 11, height: 11, fill: BB.error }} />
                <span>Stop</span>
              </button>
            ) : (
              <button
                onClick={handleRunCode}
                disabled={isGenerating || !displayedCode}
                aria-label="Run code"
                title="Execute Python script in sandbox (Ctrl+Enter)"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 14px',
                  borderRadius: 5,
                  border: '1px solid rgba(34,197,94,0.6)',
                  background: 'linear-gradient(135deg, rgba(34,197,94,0.28), rgba(75,59,124,0.35))',
                  color: BB.success,
                  fontSize: 11.5,
                  fontWeight: 700,
                  cursor: isGenerating || !displayedCode ? 'not-allowed' : 'pointer',
                  boxShadow: '0 0 12px rgba(34,197,94,0.22)',
                  transition: 'all 120ms ease',
                }}
              >
                <Play style={{ width: 12, height: 12, fill: BB.success }} />
                <span>Run Experiment</span>
              </button>
            )}
          </div>
        </header>

        {/* ── MAIN WORKSPACE ROW (Full height below toolbar) ───────────── */}
        <div style={{ display: 'flex', flex: 1, minHeight: 0, width: '100%', overflow: 'hidden' }}>
          {/* ── LEFT: EXPERIMENT EXPLORER ── */}
          <div style={{ width: explorerWidth, minWidth: 130, flexShrink: 0, height: '100%', overflow: 'hidden' }}>
            <ExperimentExplorer
              csvName={activeDatasetName}
              files={experimentFileList}
              activeFile={currentFile}
              pendingNewFileName={pendingNewFileName}
              modifiedFileNames={modifiedFiles}
              generatedFileNames={generatedFiles}
              workspaceFiles={serverWorkspaceFiles}
              onSelectFile={handleSelectFile}
              onNewFile={handleNewFile}
              onDeleteFile={handleDeleteFile}
              onPendingNameChange={setPendingNewFileName}
              onPendingNameCommit={handleConfirmNewFile}
              onPendingNameCancel={handleCancelNewFile}
            />
          </div>

          {/* ── RESIZE HANDLE: Explorer <-> Center Workspace ── */}
          <div
            onMouseDown={handleExplorerDragStart}
            title="Drag left/right to resize file explorer"
            style={{
              width: 5,
              flexShrink: 0,
              cursor: 'col-resize',
              background: isDraggingExplorer ? BB.gold : BB.border,
              transition: 'background 120ms ease',
              zIndex: 15,
            }}
          />

          {/* ── CENTER: CODE EDITOR + TERMINAL (Adjustable together) ── */}
          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
              overflow: 'hidden',
              background: BB.codeBg,
            }}
          >
            {/* Student Learning Layer: Educational Guidance & Preprocessing Mistake Cards */}
            <div style={{ padding: '8px 12px 0 12px' }}>
              <PanelLearningCollapsible
                title="Code Studio Guide"
                steps={[
                  {
                    title: 'Review Python Code',
                    action: 'Your complete machine learning pipeline is available in the editor with preprocessing and model training.',
                  },
                  {
                    title: 'Check Diagnostics',
                    action: 'Look at the status bar at the bottom — any syntax or naming issues appear in real time.',
                  },
                  {
                    title: 'Run Experiment',
                    action: 'Click the Run Experiment button (or press Ctrl + Enter) to train the model on your dataset.',
                  },
                  {
                    title: 'Inspect Terminal & Results',
                    action: 'Watch live logs in the bottom terminal, then click Training Results at the top to evaluate metrics.',
                  },
                ]}
                quickTip="You can modify parameters like n_estimators directly in code; syntax is verified automatically as you type."
              />
              <HeadsUpCardsContainer />
            </div>

            {/* Find Bar (Ctrl+F) */}
            {isFindOpen && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 14px',
                  background: BB.elevated,
                  borderBottom: `1px solid ${BB.border}`,
                  flexShrink: 0,
                  zIndex: 10,
                }}
              >
                <Search style={{ width: 13, height: 13, color: BB.muted }} />
                <input
                  autoFocus
                  value={findQuery}
                  onChange={(e) => setFindQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') jumpToMatch(e.shiftKey ? findMatchIdx - 1 : findMatchIdx + 1);
                    if (e.key === 'Escape') setIsFindOpen(false);
                  }}
                  placeholder="Find in file..."
                  style={{
                    background: BB.surface,
                    border: `1px solid ${BB.border}`,
                    borderRadius: 4,
                    padding: '3px 8px',
                    color: BB.text,
                    fontSize: 11.5,
                    fontFamily: 'Consolas, Monaco, monospace',
                    outline: 'none',
                    width: 180,
                  }}
                />
                <span style={{ fontSize: 11, color: BB.muted, minWidth: 60 }}>
                  {findMatches.length > 0 ? `${findMatchIdx + 1} of ${findMatches.length}` : 'No results'}
                </span>
                <button
                  onClick={() => jumpToMatch(findMatchIdx - 1)}
                  disabled={findMatches.length === 0}
                  title="Previous match (Shift+Enter)"
                  style={{ background: 'transparent', border: 'none', color: BB.muted, cursor: 'pointer', padding: 2 }}
                >
                  <ArrowUp style={{ width: 13, height: 13 }} />
                </button>
                <button
                  onClick={() => jumpToMatch(findMatchIdx + 1)}
                  disabled={findMatches.length === 0}
                  title="Next match (Enter)"
                  style={{ background: 'transparent', border: 'none', color: BB.muted, cursor: 'pointer', padding: 2 }}
                >
                  <ArrowDown style={{ width: 13, height: 13 }} />
                </button>
                <button
                  onClick={() => setIsFindOpen(false)}
                  title="Close find (Esc)"
                  style={{ background: 'transparent', border: 'none', color: BB.muted, cursor: 'pointer', padding: 2, marginLeft: 'auto' }}
                >
                  <X style={{ width: 13, height: 13 }} />
                </button>
              </div>
            )}



            {/* Breadcrumb Navigation Bar (Real IDE aesthetic) */}
            <div
              style={{
                height: 25,
                flexShrink: 0,
                background: 'rgba(12, 10, 24, 0.95)',
                borderBottom: `1px solid rgba(255, 255, 255, 0.06)`,
                display: 'flex',
                alignItems: 'center',
                padding: '0 14px',
                fontSize: 11,
                fontFamily: 'Consolas, Monaco, monospace',
                color: BB.muted,
                gap: 6,
                userSelect: 'none',
              }}
            >
              <FolderOpen style={{ width: 12, height: 12, color: BB.gold }} />
              <span>workspace</span>
              <ChevronRight style={{ width: 10, height: 10, opacity: 0.5 }} />
              <FileCode style={{ width: 12, height: 12, color: '#38BDF8' }} />
              <span style={{ color: BB.text, fontWeight: 600 }}>{currentFile}</span>
            </div>

            {/* ── IDE CODE EDITOR CONTAINER (Flex 1, with synchronized gutter & textarea) ── */}
            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'row',
                position: 'relative',
                overflow: 'hidden',
                background: BB.codeBg,
              }}
            >
              {/* Generating State */}
              {isGenerating && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    zIndex: 20,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(10,8,20,0.85)',
                    gap: 12,
                    color: BB.text,
                  }}
                >
                  <RefreshCw style={{ width: 26, height: 26, animation: 'spin 1s linear infinite', color: BB.gold }} />
                  <span style={{ fontSize: 13, fontFamily: 'Consolas, Monaco, monospace' }}>
                    Synthesizing pipeline DAG code…
                  </span>
                </div>
              )}

              {/* Auth / Generation Errors */}
              {(authError || generationError) && !isGenerating && (
                <div
                  style={{
                    position: 'absolute',
                    top: 12,
                    left: 60,
                    right: 16,
                    zIndex: 25,
                    padding: 12,
                    borderRadius: 8,
                    background: 'rgba(110,20,35,0.85)',
                    border: `1px solid ${BB.error}`,
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AlertCircle style={{ width: 18, height: 18, color: BB.gold, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: BB.text }}>
                      {authError || generationError}
                    </span>
                  </div>
                  <button
                    onClick={() => generatePipelineCode(currentFile)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 4,
                      background: BB.elevated,
                      border: `1px solid ${BB.border}`,
                      color: BB.text,
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                  >
                    Retry
                  </button>
                </div>
              )}

              {/* Enterprise Monaco Code Studio Editor Engine */}
              <div style={{ flex: 1, height: '100%', position: 'relative', overflow: 'hidden' }}>
                <MonacoCodeStudioEditor
                  code={displayedCode}
                  filename={currentFile}
                  diagnostics={allDiagnostics}
                  onChange={(newCode) => {
                    if (isFileReadOnly) return;
                    updateExperimentFileCode(currentFile, newCode);
                    markFileModified(currentFile);
                  }}
                  onCursorChange={(pos) => setCursorPos(pos)}
                  targetPosition={jumpTarget}
                  onRunCode={handleRunCode}
                  onSave={handleSaveCode}
                  onToggleTerminal={() => setBottomPanelOpen((o) => !o)}
                  minimapEnabled={true}
                  readOnly={isFileReadOnly}
                  datasetColumns={
                    dataset?.columns?.map((c: any) => ({
                      name: typeof c === 'string' ? c : c.name,
                      type: typeof c === 'object' ? c.type : 'numeric',
                    })) || []
                  }
                  datasetName={dataset?.fileName || activeDatasetName || 'dataset.csv'}
                  selectedTarget={selectedTarget}
                  selectedFeatures={selectedFeatures}
                  isLearningMode={learningMode}
                  onInsertSnippetExplanation={(title, exp) => {
                    if (learningMode) {
                      onShowToast?.(`🎓 [Learning Mode] ${title}`, exp, 'info');
                    }
                  }}
                />
              </div>
            </div>

            {/* ── IDE STATUS BAR ─────────────────────────────────────── */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '4px 12px',
                background: BB.elevated,
                borderTop: `1px solid ${BB.border}`,
                fontSize: 11,
                color: BB.muted,
                fontFamily: 'Consolas, Monaco, monospace',
                flexShrink: 0,
                userSelect: 'none',
                zIndex: 5,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span
                  style={{ display: 'flex', alignItems: 'center', gap: 5 }}
                  title={
                    pythonLanguageClient.runtimeInfo.fullPython
                      ? `Python ${pythonLanguageClient.runtimeInfo.fullPython} (Active Container Environment)`
                      : 'Python Sandbox Runtime'
                  }
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: pythonLanguageClient.status === 'unavailable' ? BB.warning : BB.success,
                    }}
                  />
                  <span>Python {pythonLanguageClient.runtimeInfo.python}</span>
                </span>
                <span>Ln {cursorPos.line}, Col {cursorPos.col}</span>
                <span
                  title={
                    pythonLanguageClient.runtimeInfo.fullSklearn
                      ? `scikit-learn ${pythonLanguageClient.runtimeInfo.fullSklearn}`
                      : 'scikit-learn Library'
                  }
                >
                  scikit-learn {pythonLanguageClient.runtimeInfo.sklearn}
                </span>
                {(() => {
                  if (isFileReadOnly) {
                    return <span style={{ color: BB.muted }}>🔒 Read-Only</span>;
                  }
                  if (isAutosaving) {
                    return <span style={{ color: BB.gold }}>● Autosaving…</span>;
                  }
                  const isModified = displayedCode !== (savedCodeByFile[currentFile] ?? displayedCode);
                  const isDiverged =
                    !isModified &&
                    Boolean(builderCodeByFile[currentFile]) &&
                    savedCodeByFile[currentFile] !== builderCodeByFile[currentFile];
                  const isGenerated =
                    !isModified &&
                    !isDiverged &&
                    (generatedFiles.includes(currentFile) ||
                      (Boolean(builderCodeByFile[currentFile]) &&
                        savedCodeByFile[currentFile] === builderCodeByFile[currentFile]));

                  if (isModified) {
                    return <span style={{ color: BB.gold }}>● Modified</span>;
                  }
                  if (isDiverged) {
                    return <span style={{ color: BB.warning }}>▲ Diverged from builder</span>;
                  }
                  if (isGenerated) {
                    return <span style={{ color: BB.primaryLight }}>✦ Generated</span>;
                  }
                  return <span style={{ color: BB.success }}>✓ Saved</span>;
                })()}
                {/* Diagnostics & Linting Status */}
                <button
                  data-testid="status-bar-problems-btn"
                  onClick={() => {
                    setBottomPanelOpen(true);
                    setBottomTab('problems');
                  }}
                  title={
                    pythonLanguageClient.status === 'unavailable'
                      ? 'Python analysis service offline. Reconnecting...'
                      : 'View Problems (Inline & semantic diagnostics)'
                  }
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color:
                      pythonLanguageClient.status === 'unavailable'
                        ? BB.muted
                        : pythonLanguageClient.isAnalyzing
                          ? BB.gold
                          : errorCount > 0
                            ? '#EF4444'
                            : warnCount > 0
                              ? '#F59E0B'
                              : BB.muted,
                    cursor: 'pointer',
                    padding: '1px 5px',
                    borderRadius: 3,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    fontSize: 11,
                    fontFamily: 'inherit',
                  }}
                >
                  {pythonLanguageClient.status === 'unavailable' ? (
                    <>
                      <AlertCircle style={{ width: 11, height: 11, color: '#EF4444' }} />
                      <span style={{ color: BB.muted }}>Analysis unavailable</span>
                    </>
                  ) : pythonLanguageClient.isAnalyzing ? (
                    <>
                      <Activity style={{ width: 11, height: 11 }} />
                      <span>Checking…</span>
                    </>
                  ) : errorCount === 0 && warnCount === 0 ? (
                    <>
                      <Check style={{ width: 11, height: 11, color: BB.success }} />
                      <span style={{ color: BB.success }}>0 problems</span>
                    </>
                  ) : (
                    <>
                      <TriangleAlert style={{ width: 11, height: 11, color: errorCount > 0 ? '#EF4444' : '#F59E0B' }} />
                      <span>{errorCount} errors, {warnCount} warnings</span>
                    </>
                  )}
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {/* Execution Status Pill */}
                <span
                  data-testid="execution-status-pill"
                  style={{
                    padding: '1px 8px',
                    borderRadius: 3,
                    fontSize: 10.5,
                    fontWeight: 600,
                    background:
                      execStatus === 'running'
                        ? 'rgba(34,197,94,0.18)'
                        : execStatus === 'completed'
                          ? 'rgba(34,197,94,0.15)'
                          : execStatus === 'queued'
                            ? 'rgba(234,179,8,0.15)'
                            : execStatus === 'timed_out'
                              ? 'rgba(249,115,22,0.18)'
                              : execStatus === 'out_of_memory'
                                ? 'rgba(239,68,68,0.25)'
                                : execStatus === 'cancelled' || execStatus === 'stopped'
                                  ? 'rgba(148,163,184,0.18)'
                                  : execStatus === 'failed'
                                    ? 'rgba(239,68,68,0.18)'
                                    : 'rgba(107,92,166,0.15)',
                    color:
                      execStatus === 'running' || execStatus === 'completed'
                        ? BB.success
                        : execStatus === 'queued'
                          ? '#EAB308'
                          : execStatus === 'timed_out'
                            ? '#F97316'
                            : execStatus === 'out_of_memory'
                              ? '#EF4444'
                              : execStatus === 'cancelled' || execStatus === 'stopped'
                                ? '#94A3B8'
                                : execStatus === 'failed'
                                  ? BB.error
                                  : BB.muted,
                    border: `1px solid ${execStatus === 'idle'
                        ? 'rgba(107,92,166,0.3)'
                        : execStatus === 'running' || execStatus === 'completed'
                          ? 'rgba(34,197,94,0.35)'
                          : 'rgba(239,68,68,0.35)'
                      }`,
                  }}
                >
                  {execStatus === 'idle' && '● Ready'}
                  {execStatus === 'running' && '● Running'}
                  {execStatus === 'queued' && `⏳ Queued${queuePosition ? ` (#${queuePosition})` : ''}`}
                  {execStatus === 'completed' && `✓ Done${execDuration ? ` (${execDuration.toFixed(1)}s)` : ''}`}
                  {execStatus === 'timed_out' && '⏱ Timed Out (124)'}
                  {execStatus === 'out_of_memory' && '💥 Out of Memory (137)'}
                  {execStatus === 'failed' && (execExitCode !== null ? `✕ Failed (Exit ${execExitCode})` : '✕ Unavailable')}
                  {(execStatus === 'stopped' || execStatus === 'cancelled') && '■ Cancelled'}
                </span>

                {/* Terminal Toggle Button */}
                <button
                  onClick={() => {
                    setBottomPanelOpen((o) => !o);
                    setBottomTab('output');
                  }}
                  aria-label="Toggle terminal"
                  title="Toggle terminal panel (Ctrl+`)"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    background: 'transparent',
                    border: 'none',
                    color: bottomPanelOpen ? BB.gold : BB.muted,
                    cursor: 'pointer',
                    padding: '2px 6px',
                    borderRadius: 3,
                    fontSize: 11,
                    fontFamily: 'Consolas, Monaco, monospace',
                  }}
                >
                  <Terminal style={{ width: 12, height: 12 }} />
                  <span>Terminal</span>
                  {outputLines.length > 0 && (
                    <span
                      style={{
                        background: BB.primary,
                        borderRadius: 8,
                        padding: '0 5px',
                        fontSize: 9.5,
                        color: BB.text,
                        fontWeight: 700,
                      }}
                    >
                      {outputLines.length}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* ── RESIZE HANDLE: Editor <-> Terminal (Vertical) ──────── */}
            {bottomPanelOpen && (
              <div
                onMouseDown={handleBottomDragStart}
                title="Drag up/down to resize terminal panel"
                style={{
                  height: 5,
                  cursor: 'row-resize',
                  background: isDraggingBottom ? BB.gold : BB.border,
                  flexShrink: 0,
                  transition: 'background 120ms ease',
                  zIndex: 15,
                }}
              />
            )}

            {/* ── TERMINAL / OUTPUT PANEL (Docked ONLY in center column!) ─ */}
            {bottomPanelOpen && (
              <div
                style={{
                  height: bottomPanelHeight,
                  flexShrink: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  background: BB.surface,
                  overflow: 'hidden',
                }}
              >
                {/* Terminal Tab Bar */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    borderBottom: `1px solid ${BB.border}`,
                    background: BB.elevated,
                    flexShrink: 0,
                  }}
                >
                  {(['output', 'problems', 'logs', 'debug'] as const).map((tab) => (
                    <button
                      key={tab}
                      data-testid={`bottom-tab-${tab}`}
                      onClick={() => setBottomTab(tab)}
                      style={{
                        padding: '6px 14px',
                        border: 'none',
                        background: 'transparent',
                        color: bottomTab === tab ? BB.text : BB.muted,
                        borderBottom: bottomTab === tab ? `2px solid ${BB.gold}` : '2px solid transparent',
                        fontSize: 11.5,
                        cursor: 'pointer',
                        textTransform: 'capitalize',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        fontFamily: 'inherit',
                        transition: 'color 80ms',
                      }}
                    >
                      {tab === 'output' && <Terminal style={{ width: 12, height: 12 }} />}
                      {tab === 'problems' && (
                        (errorCount + warnCount) > 0 ? (
                          <TriangleAlert style={{ width: 12, height: 12, color: errorCount > 0 ? '#EF4444' : '#F59E0B' }} />
                        ) : (
                          <Check style={{ width: 12, height: 12, color: BB.success }} />
                        )
                      )}
                      {tab === 'logs' && <ScrollText style={{ width: 12, height: 12 }} />}
                      {tab === 'debug' && <Activity style={{ width: 12, height: 12 }} />}
                      <span>{tab}</span>
                      {tab === 'output' && outputLines.length > 0 && (
                        <span style={{ background: BB.primary, borderRadius: 8, padding: '0 5px', fontSize: 9.5, color: BB.text, fontWeight: 700 }}>
                          {outputLines.length}
                        </span>
                      )}
                      {tab === 'problems' && (errorCount + warnCount) > 0 && (
                        <span style={{ background: errorCount > 0 ? '#EF4444' : '#F59E0B', borderRadius: 8, padding: '0 5px', fontSize: 9.5, color: '#fff', fontWeight: 700 }}>
                          {errorCount + warnCount}
                        </span>
                      )}
                      {tab === 'logs' && logEntries.length > 0 && (
                        <span style={{ background: 'rgba(107,92,166,0.7)', borderRadius: 8, padding: '0 5px', fontSize: 9.5, color: BB.text, fontWeight: 700 }}>
                          {logEntries.length}
                        </span>
                      )}
                    </button>
                  ))}

                  <div style={{ flex: 1 }} />

                  {/* Clean Execution Status Indicator */}
                  {execStatus === 'idle' ? (
                    <span
                      data-testid="execution-status-pill"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '2px 8px',
                        borderRadius: 4,
                        background: 'rgba(107, 92, 166, 0.15)',
                        border: '1px solid rgba(107, 92, 166, 0.3)',
                        color: BB.muted,
                        fontSize: 10,
                        fontFamily: 'Consolas, Monaco, monospace',
                        marginRight: 6,
                      }}
                    >
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: BB.success }} />
                      <span>Ready</span>
                    </span>
                  ) : (
                    <span
                      data-testid="execution-status-pill"
                      style={{
                        fontSize: 10,
                        fontFamily: 'Consolas, Monaco, monospace',
                        padding: '2px 8px',
                        borderRadius: 10,
                        fontWeight: 700,
                        letterSpacing: 0.5,
                        background:
                          execStatus === 'running'
                            ? 'rgba(34,197,94,0.15)'
                            : execStatus === 'completed'
                              ? 'rgba(34,197,94,0.18)'
                              : execStatus === 'queued'
                                ? 'rgba(234,179,8,0.15)'
                                : execStatus === 'timed_out'
                                  ? 'rgba(249,115,22,0.18)'
                                  : execStatus === 'out_of_memory'
                                    ? 'rgba(239,68,68,0.25)'
                                    : execStatus === 'cancelled' || execStatus === 'stopped'
                                      ? 'rgba(148,163,184,0.18)'
                                      : 'rgba(239,68,68,0.18)',
                        color:
                          execStatus === 'running' || execStatus === 'completed'
                            ? BB.success
                            : execStatus === 'queued'
                              ? '#EAB308'
                              : execStatus === 'timed_out'
                                ? '#F97316'
                                : execStatus === 'out_of_memory'
                                  ? '#EF4444'
                                  : execStatus === 'cancelled' || execStatus === 'stopped'
                                    ? '#94A3B8'
                                    : '#EF4444',
                        border: `1px solid ${execStatus === 'running' || execStatus === 'completed'
                            ? 'rgba(34,197,94,0.35)'
                            : execStatus === 'queued'
                              ? 'rgba(234,179,8,0.35)'
                              : execStatus === 'timed_out'
                                ? 'rgba(249,115,22,0.35)'
                                : execStatus === 'out_of_memory'
                                  ? 'rgba(239,68,68,0.35)'
                                  : 'rgba(148,163,184,0.35)'
                          }`,
                        marginRight: 6,
                      }}
                    >
                      {execStatus === 'running'
                        ? '● RUNNING'
                        : execStatus === 'queued'
                          ? `⏳ QUEUED${queuePosition ? ` (#${queuePosition})` : ''}`
                          : execStatus === 'completed'
                            ? '✓ EXIT 0'
                            : execStatus === 'timed_out'
                              ? '⏱ TIMED OUT (124)'
                              : execStatus === 'out_of_memory'
                                ? '💥 OUT OF MEMORY (137)'
                                : execStatus === 'cancelled' || execStatus === 'stopped'
                                  ? '■ CANCELLED'
                                  : `✕ FAILED${execExitCode != null ? ` (${execExitCode})` : ''}`}
                    </span>
                  )}

                  {/* Clear Terminal Output */}
                  {outputLines.length > 0 && (
                    <button
                      onClick={() => setOutputLines([])}
                      title="Clear terminal output"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: BB.muted,
                        cursor: 'pointer',
                        padding: '0 8px',
                        fontSize: 11,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = BB.text; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = BB.muted; }}
                    >
                      Clear
                    </button>
                  )}

                  <button
                    onClick={() => setBottomPanelOpen(false)}
                    title="Close terminal"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: BB.muted,
                      cursor: 'pointer',
                      padding: '0 10px',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = BB.text; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = BB.muted; }}
                  >
                    <X style={{ width: 13, height: 13 }} />
                  </button>
                </div>

                {/* Terminal Content Body */}
                <div
                  style={{
                    flex: 1,
                    overflowY: 'auto',
                    overflowX: 'auto',
                    padding: '8px 0',
                    background: BB.base,
                  }}
                >
                  {bottomTab === 'output' && (
                    <>


                      {/* Truncation Notice Banner */}
                      {isOutputTruncated && (
                        <div
                          style={{
                            margin: '6px 16px',
                            padding: '8px 12px',
                            background: 'rgba(245, 158, 11, 0.1)',
                            border: '1px solid rgba(245, 158, 11, 0.3)',
                            borderRadius: 6,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 12,
                            fontSize: 11.5,
                            color: '#F59E0B',
                            fontFamily: 'Consolas, Monaco, monospace',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <TriangleAlert style={{ width: 14, height: 14, flexShrink: 0 }} />
                            <span>Output exceeded display threshold (5,000 lines) and was capped.</span>
                          </div>
                          {execId && (
                            <a
                              href={typeof CodeExecutionService?.downloadOutputUrl === 'function' ? CodeExecutionService.downloadOutputUrl(execId) : '#'}
                              download={`execution-${execId}.txt`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                color: '#F59E0B',
                                textDecoration: 'underline',
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              Download Full Output
                            </a>
                          )}
                        </div>
                      )}

                      {outputLines.length === 0 && (
                        <div style={{ padding: '14px 16px', color: BB.muted, fontSize: 11.5, fontFamily: 'Consolas, Monaco, monospace' }}>
                          No output yet. Click <strong style={{ color: BB.success }}>Run</strong> above or press <strong style={{ color: BB.gold }}>Ctrl+Enter</strong> to execute the active script.
                        </div>
                      )}
                      {outputLines.map((line, i) => {
                        const isStderr = line.startsWith('[stderr]');
                        const isError =
                          line.startsWith('[Error]') ||
                          line.startsWith('[ERROR]') ||
                          line.includes('Traceback (most recent') ||
                          line.includes('Error:') ||
                          line.includes('Exception:');
                        const isSuccess =
                          line.includes('Accuracy:') ||
                          line.includes('Execution completed successfully') ||
                          line.includes('Saved model') ||
                          line.includes('precision');
                        const isMlpg = line.startsWith('[ML Playground');

                        // Interactive Python traceback line match
                        const tbMatch = line.match(/File "([^"]+)", line (\d+)/);
                        if (tbMatch) {
                          const file = tbMatch[1];
                          const lineNum = parseInt(tbMatch[2], 10);
                          return (
                            <div
                              key={i}
                              onClick={() => handleJumpToTraceback(file, lineNum)}
                              title={`Click to jump to ${file}:${lineNum}`}
                              style={{
                                padding: '2px 16px',
                                fontFamily: 'Consolas, Monaco, monospace',
                                fontSize: 11.5,
                                lineHeight: 1.65,
                                color: BB.goldLight,
                                background: 'rgba(201,162,75,0.08)',
                                borderLeft: `2px solid ${BB.gold}`,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                transition: 'background 120ms',
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(201,162,75,0.16)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(201,162,75,0.08)'; }}
                            >
                              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ color: BB.gold }}>↳</span>
                                <span>{renderAnsiLine(line)}</span>
                              </span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 10, color: BB.gold, opacity: 0.8, textDecoration: 'underline' }}>
                                  Jump to line {lineNum}
                                </span>
                                <button
                                  data-testid={`tb-explain-btn-${i}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setIsCopilotOpen(true);
                                    handleSendCopilotMessage(`Explain this runtime traceback error on line ${lineNum} in ${file}: "${line.trim()}"`);
                                  }}
                                  title="Ask AI Copilot to explain this error"
                                  style={{
                                    padding: '1px 6px',
                                    fontSize: 9.5,
                                    borderRadius: 3,
                                    background: 'rgba(124, 107, 174, 0.25)',
                                    border: `1px solid ${BB.border}`,
                                    color: BB.primaryLight,
                                    cursor: 'pointer',
                                  }}
                                >
                                  Explain
                                </button>
                                <button
                                  data-testid={`tb-fix-btn-${i}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setIsCopilotOpen(true);
                                    handleSendCopilotMessage(`Fix this runtime error on line ${lineNum} in ${file}: "${line.trim()}". Return the complete updated Python code block for the file.`, true);
                                  }}
                                  title="Ask AI Copilot to propose a fix with diff review"
                                  style={{
                                    padding: '1px 6px',
                                    fontSize: 9.5,
                                    borderRadius: 3,
                                    background: 'rgba(201, 162, 75, 0.2)',
                                    border: `1px solid ${BB.gold}`,
                                    color: BB.gold,
                                    cursor: 'pointer',
                                    fontWeight: 600,
                                  }}
                                >
                                  Fix
                                </button>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div
                            key={i}
                            style={{
                              padding: '1px 16px',
                              fontFamily: 'Consolas, Monaco, monospace',
                              fontSize: 11.5,
                              lineHeight: 1.65,
                              color: isError || isStderr ? BB.error : isSuccess ? BB.success : isMlpg ? BB.primaryLight : '#D4D0C8',
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-all',
                              background: isError || isStderr ? 'rgba(239,68,68,0.06)' : 'transparent',
                            }}
                          >
                            {renderAnsiLine(line)}
                          </div>
                        );
                      })}
                      {execArtifacts.length > 0 && (
                        <div
                          style={{
                            margin: '8px 16px',
                            padding: '10px 14px',
                            background: 'rgba(34,197,94,0.08)',
                            border: '1px solid rgba(34,197,94,0.25)',
                            borderRadius: 8,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 16,
                          }}
                        >
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: BB.success, marginBottom: 4 }}>
                              Artifacts Produced:
                            </div>
                            {execArtifacts.map((a) => (
                              <div key={a} style={{ fontSize: 11, fontFamily: 'Consolas, Monaco, monospace', color: BB.text }}>
                                • {a}
                              </div>
                            ))}
                          </div>
                          {execArtifacts.some((a) => a.endsWith('.joblib') || a.endsWith('.pkl')) && (
                            <button
                              onClick={handleDeployFromCodeStudio}
                              disabled={isDeployingArtifact}
                              style={{
                                padding: '6px 14px',
                                borderRadius: 6,
                                border: '1px solid rgba(0, 245, 160, 0.5)',
                                background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.2), rgba(0, 245, 160, 0.25))',
                                color: '#00F5A0',
                                fontWeight: 700,
                                fontSize: 11.5,
                                cursor: isDeployingArtifact ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                boxShadow: '0 0 10px rgba(0, 245, 160, 0.25)',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              <Rocket style={{ width: 13, height: 13 }} />
                              <span>{isDeployingArtifact ? 'Deploying...' : 'Deploy Model'}</span>
                            </button>
                          )}
                        </div>
                      )}
                      <div ref={outputEndRef} />
                    </>
                  )}

                  {bottomTab === 'problems' && (
                    <div style={{ flex: 1, overflow: 'auto', fontSize: 11.5 }}>
                      {pythonLanguageClient.status === 'unavailable' ? (
                        <div style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 10, color: BB.muted }}>
                          <AlertCircle style={{ width: 18, height: 18, color: '#EF4444' }} />
                          <div>
                            <div style={{ color: '#EF4444', fontWeight: 600, marginBottom: 2 }}>Python Language Analysis Unavailable</div>
                            <div style={{ fontSize: 10.5 }}>The code linter service could not be reached. Reconnecting in the background...</div>
                          </div>
                        </div>
                      ) : allDiagnostics.length === 0 ? (
                        <div style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 10, color: BB.muted }}>
                          <span style={{ fontSize: 18 }}>✓</span>
                          <div>
                            <div style={{ color: BB.success, fontWeight: 600, marginBottom: 2 }}>No problems detected</div>
                            <div style={{ fontSize: 10.5 }}>Static analysis passed. Run your code to check for runtime errors.</div>
                          </div>
                        </div>
                      ) : (
                        <div>
                          {['error', 'warning', 'info'].map(sev => {
                            const items = allDiagnostics.filter(d => d.severity === sev);
                            if (items.length === 0) return null;
                            const color = sev === 'error' ? '#EF4444' : sev === 'warning' ? '#F59E0B' : '#818CF8';
                            const icon = sev === 'error' ? '✕' : sev === 'warning' ? '⚠' : 'ℹ';
                            return (
                              <div key={sev}>
                                <div style={{ padding: '6px 12px 3px', fontSize: 10, fontWeight: 700, color: BB.muted, textTransform: 'uppercase', letterSpacing: 0.8, borderBottom: `1px solid ${BB.border}` }}>
                                  {icon} {sev}s ({items.length})
                                </div>
                                {items.map((d, i) => (
                                  <div
                                    key={i}
                                    title={d.message}
                                    onClick={() => {
                                      setCursorPos({ line: d.line, col: d.col });
                                      setJumpTarget({ line: d.line, col: d.col });
                                    }}
                                    style={{
                                      padding: '4px 12px 4px 16px',
                                      display: 'flex',
                                      alignItems: 'flex-start',
                                      gap: 8,
                                      cursor: 'pointer',
                                      borderBottom: `1px solid ${BB.border}22`,
                                      transition: 'background 80ms',
                                      fontFamily: 'Consolas, Monaco, monospace',
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                  >
                                    <span style={{ color, flexShrink: 0, marginTop: 1 }}>{icon}</span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <span style={{ color: BB.text }}>{d.message}</span>
                                      <span style={{ color: BB.muted, marginLeft: 10, fontSize: 10.5 }}>
                                        {currentFile}:{d.line}:{d.col}
                                      </span>
                                    </div>
                                    <span
                                      data-testid={`problem-source-badge-${i}`}
                                      style={{
                                        fontSize: 9.5,
                                        padding: '2px 6px',
                                        borderRadius: 3,
                                        background:
                                          d.source === 'ML Playground checks'
                                            ? 'rgba(201, 162, 75, 0.2)'
                                            : d.source === 'runtime'
                                              ? 'rgba(239,68,68,0.15)'
                                              : 'rgba(107,92,166,0.2)',
                                        color:
                                          d.source === 'ML Playground checks'
                                            ? BB.gold
                                            : d.source === 'runtime'
                                              ? '#EF4444'
                                              : BB.primaryLight,
                                        fontWeight: d.source === 'ML Playground checks' ? 700 : 500,
                                        border: d.source === 'ML Playground checks' ? `1px solid rgba(201, 162, 75, 0.4)` : 'none',
                                        flexShrink: 0,
                                      }}
                                    >
                                      {d.source === 'ML Playground checks' ? '🎓 ML Playground checks' : d.source}
                                    </span>

                                    {/* 5.5 Copilot Explain & Fix Actions */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                                      <button
                                        data-testid={`copilot-explain-btn-${i}`}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleCopilotExplainDiagnostic(d);
                                        }}
                                        title="Ask AI Copilot to explain this diagnostic"
                                        style={{
                                          padding: '2px 7px',
                                          fontSize: 10,
                                          borderRadius: 3,
                                          background: 'rgba(124, 107, 174, 0.25)',
                                          border: `1px solid ${BB.border}`,
                                          color: BB.primaryLight,
                                          cursor: 'pointer',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: 3,
                                        }}
                                      >
                                        <Sparkles style={{ width: 10, height: 10 }} />
                                        <span>Explain</span>
                                      </button>
                                      <button
                                        data-testid={`copilot-fix-btn-${i}`}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleCopilotFixDiagnostic(d);
                                        }}
                                        title="Ask AI Copilot to propose a fix with side-by-side diff review"
                                        style={{
                                          padding: '2px 7px',
                                          fontSize: 10,
                                          borderRadius: 3,
                                          background: 'rgba(201, 162, 75, 0.2)',
                                          border: `1px solid ${BB.gold}`,
                                          color: BB.gold,
                                          fontWeight: 600,
                                          cursor: 'pointer',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: 3,
                                        }}
                                      >
                                        <span>Fix</span>
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {bottomTab === 'logs' && (
                    <div style={{ flex: 1, overflow: 'auto', fontFamily: 'Consolas, Monaco, monospace', fontSize: 11.5 }}>
                      {logEntries.length === 0 ? (
                        <div style={{ padding: '18px 20px', color: BB.muted }}>
                          <div style={{ marginBottom: 4, fontWeight: 600 }}>No log entries yet</div>
                          <div style={{ fontSize: 10.5 }}>Execution logs will appear here when you run your code (Ctrl+Enter).</div>
                        </div>
                      ) : (
                        logEntries.map(entry => {
                          const lvlColor = entry.level === 'error' ? '#EF4444'
                            : entry.level === 'warn' ? '#F59E0B'
                              : entry.level === 'system' ? BB.primaryLight
                                : entry.level === 'info' ? BB.success
                                  : BB.muted;
                          const lvlTag = entry.level.toUpperCase().padEnd(6);
                          return (
                            <div
                              key={entry.id}
                              style={{
                                padding: '2px 12px',
                                display: 'flex',
                                gap: 10,
                                borderBottom: `1px solid ${BB.border}11`,
                                lineHeight: 1.7,
                              }}
                            >
                              <span style={{ color: '#5C5478', flexShrink: 0 }}>{entry.time}</span>
                              <span style={{ color: lvlColor, flexShrink: 0, fontWeight: 700 }}>{lvlTag}</span>
                              <span style={{
                                color: entry.level === 'error' ? '#FCA5A5'
                                  : entry.level === 'warn' ? '#FDE68A'
                                    : '#D4D0C8',
                                wordBreak: 'break-all',
                                flex: 1,
                              }}>{entry.message}</span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}

                  {bottomTab === 'debug' && (
                    <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px', fontSize: 11.5, fontFamily: 'Consolas, Monaco, monospace' }}>
                      <div
                        style={{
                          marginBottom: 12,
                          padding: '8px 12px',
                          background: 'rgba(107, 92, 166, 0.1)',
                          border: `1px solid ${BB.border}`,
                          borderRadius: 6,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          color: BB.muted,
                          fontSize: 11,
                        }}
                      >
                        <Activity style={{ width: 13, height: 13, color: BB.gold }} />
                        <span>
                          <strong style={{ color: BB.text }}>Execution Inspector</strong> — Interactive breakpoints & step-debugging not available yet (planned for Phase 7).
                        </span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '4px 12px', lineHeight: 1.8 }}>
                        {/* Execution metadata */}
                        <span style={{ color: BB.muted }}>Execution ID</span>
                        <span style={{ color: execId ? BB.primaryLight : BB.muted }}>{execId || '—'}</span>

                        <span style={{ color: BB.muted }}>Status</span>
                        <span style={{
                          color:
                            execStatus === 'running' ? BB.success
                              : execStatus === 'completed' ? BB.success
                                : execStatus === 'failed' ? '#EF4444'
                                  : BB.muted
                        }}>
                          {execStatus === 'idle' ? '—' : execStatus}
                        </span>

                        <span style={{ color: BB.muted }}>Exit Code</span>
                        <span style={{ color: execExitCode === 0 ? BB.success : execExitCode != null ? '#EF4444' : BB.muted }}>
                          {execExitCode != null ? execExitCode : '—'}
                        </span>

                        <span style={{ color: BB.muted }}>Duration</span>
                        <span style={{ color: BB.text }}>{execDuration != null ? `${execDuration.toFixed(2)}s` : '—'}</span>

                        <span style={{ color: BB.muted }}>File</span>
                        <span style={{ color: BB.text }}>{currentFile}</span>

                        <span style={{ color: BB.muted }}>Lines</span>
                        <span style={{ color: BB.text }}>{codeLines.length}</span>

                        <span style={{ color: BB.muted }}>Dataset</span>
                        <span style={{ color: BB.text }}>{dataset?.fileName || activeDatasetName || '—'}</span>

                        <span style={{ color: BB.muted }}>Algorithm</span>
                        <span style={{ color: BB.text }}>{canonicalAlgorithm || '—'}</span>

                        {execArtifacts.length > 0 && (
                          <>
                            <span style={{ color: BB.muted }}>Artifacts</span>
                            <span style={{ color: BB.success }}>{execArtifacts.join(', ')}</span>
                          </>
                        )}

                        {runtimeDiagnostics.length > 0 && (
                          <>
                            <span style={{ color: BB.muted }}>Runtime Errors</span>
                            <span style={{ color: '#EF4444' }}>{runtimeDiagnostics.length} error{runtimeDiagnostics.length !== 1 ? 's' : ''} detected</span>
                          </>
                        )}

                        {allDiagnostics.length > 0 && (
                          <>
                            <span style={{ color: BB.muted }}>Diagnostics</span>
                            <span style={{ color: BB.text }}>
                              {errorCount > 0 && <span style={{ color: '#EF4444', marginRight: 8 }}>✕ {errorCount} error{errorCount !== 1 ? 's' : ''}</span>}
                              {warnCount > 0 && <span style={{ color: '#F59E0B', marginRight: 8 }}>⚠ {warnCount} warning{warnCount !== 1 ? 's' : ''}</span>}
                              {(allDiagnostics.length - errorCount - warnCount) > 0 && (
                                <span style={{ color: '#818CF8' }}>ℹ {allDiagnostics.length - errorCount - warnCount} info</span>
                              )}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── RIGHT: AI COPILOT DOCKED PANEL (Unified Shared Component, docked right) ── */}
      <AICopilotDrawer
        isOpen={isCopilotOpen}
        onToggle={propOnToggleCopilot || (() => setInternalCopilotOpen((prev) => !prev))}
        messages={copilotMessages}
        chatMessages={copilotChat}
        onSendMessage={handleSendCopilotMessage}
        onReviewDiff={(proposedCode) => {
          setDiffModalState({
            isOpen: true,
            filename: currentFile,
            candidateCode: proposedCode,
          });
        }}
        isLoading={isCopilotThinking}
        placeholder="Ask AI Copilot about this pipeline, model, or errors..."
        title="AI Copilot"
        badge={isCopilotThinking ? 'THINKING' : 'AGENT'}
      />
    </div>
  );
}
