import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  FileCode,
  Copy,
  Check,
  RefreshCw,
  ChevronRight,
  ChevronDown,
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
  Wand2,
  Rocket,
} from 'lucide-react';
import { useProject } from '../../providers/ProjectContext';
import { PipelineService, type CodeStepExplanation, type PipelineDAG, CodeExecutionService } from '../../services/api';
import { LocalDeploymentService } from '../../services/localDeploymentService';
import { AuthExpiredError, ApiTimeoutError } from '../../services/apiClient';
import { AICopilotDrawer } from '../../components/shared/AICopilotDrawer';
import { isColumnIdentifier } from '../../components/shared/FeatureTargetSelector';

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
  source: 'syntax' | 'pyflakes' | 'pep8' | 'runtime' | 'static';
  code?: string | null;
}

interface LogEntry {
  id: string;
  time: string;
  level: 'system' | 'info' | 'warn' | 'error' | 'debug';
  message: string;
}

/* ── High-Precision Python Syntax Highlighter Tokenizer ────────────────── */
function highlightPythonLine(line: string) {
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
  csvName: string;
  files: { name: string }[];
  activeFile: string;
  pendingNewFileName: string | null;
  modifiedFileNames: string[];
  generatedFileNames: string[];
  onSelectFile: (name: string) => void;
  onNewFile: () => void;
  onDeleteFile: (name: string) => void;
  onPendingNameChange: (v: string) => void;
  onPendingNameCommit: () => void;
  onPendingNameCancel: () => void;
}

function ExperimentExplorer({
  csvName,
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
  const [folderOpen, setFolderOpen] = useState(true);
  const [hoveredFile, setHoveredFile] = useState<string | null>(null);
  const newFileInputRef = useRef<HTMLInputElement>(null);

  const shortCsv = csvName.length > 20 ? csvName.slice(0, 18) + '…' : csvName;

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
          padding: '8px 12px 6px',
          borderBottom: `1px solid ${BB.border}`,
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 10, fontWeight: 700, color: BB.muted, letterSpacing: '0.08em' }}>
          EXPLORER
        </span>
        <button
          onClick={onNewFile}
          title="New experiment file"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 20,
            height: 20,
            borderRadius: 4,
            border: `1px solid ${BB.border}`,
            background: 'transparent',
            color: BB.muted,
            cursor: 'pointer',
            transition: 'all 120ms',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(107,92,166,0.2)';
            e.currentTarget.style.color = BB.text;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = BB.muted;
          }}
        >
          <Plus style={{ width: 11, height: 11 }} />
        </button>
      </div>

      {/* File Tree */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
        {/* CSV Folder Row */}
        <div
          onClick={() => setFolderOpen((o) => !o)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '4px 10px',
            cursor: 'pointer',
            color: BB.gold,
            fontSize: 11.5,
            fontWeight: 600,
          }}
        >
          {folderOpen
            ? <ChevronDown style={{ width: 11, height: 11, flexShrink: 0 }} />
            : <ChevronRight style={{ width: 11, height: 11, flexShrink: 0 }} />}
          <FolderOpen style={{ width: 13, height: 13, flexShrink: 0 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {shortCsv}
          </span>
        </div>

        {/* File Rows */}
        {folderOpen && files.map((f) => {
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
                gap: 6,
                padding: '4px 10px 4px 24px',
                cursor: 'pointer',
                background: isActive ? 'rgba(107,92,166,0.18)' : isHovered ? 'rgba(107,92,166,0.08)' : 'transparent',
                borderLeft: isActive ? `2px solid ${BB.gold}` : '2px solid transparent',
                transition: 'all 80ms',
              }}
            >
              <FileCode style={{ width: 12, height: 12, color: isActive ? BB.gold : BB.muted, flexShrink: 0 }} />
              <span
                style={{
                  fontSize: 11,
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
                  title="Contains unsaved / user edits"
                  style={{ width: 6, height: 6, borderRadius: '50%', background: BB.gold, flexShrink: 0 }}
                />
              )}
              {!isModified && isGenerated && (
                <span title="Generated by pipeline" style={{ fontSize: 9, color: BB.primaryLight, flexShrink: 0 }}>
                  ✦
                </span>
              )}

              {/* Delete on hover (non-active only) */}
              {isHovered && files.length > 1 && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDeleteFile(f.name); }}
                  title="Delete file"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    background: 'transparent',
                    border: 'none',
                    color: BB.muted,
                    cursor: 'pointer',
                    padding: 1,
                    borderRadius: 2,
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
        {folderOpen && pendingNewFileName !== null && (
          <div style={{ padding: '4px 10px 4px 24px' }}>
            <input
              ref={newFileInputRef}
              value={pendingNewFileName}
              onChange={(e) => onPendingNameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onPendingNameCommit();
                if (e.key === 'Escape') onPendingNameCancel();
              }}
              onBlur={onPendingNameCommit}
              placeholder="filename.py"
              style={{
                width: '100%',
                background: BB.elevated,
                border: `1px solid ${BB.gold}`,
                borderRadius: 4,
                color: BB.text,
                fontSize: 11,
                fontFamily: 'Consolas, Monaco, monospace',
                padding: '3px 6px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
        )}

        {/* Empty hint */}
        {folderOpen && files.length === 0 && pendingNewFileName === null && (
          <div style={{ padding: '10px 24px', fontSize: 10.5, color: BB.disabled, fontStyle: 'italic' }}>
            Click + to create a file
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Static Python Code Analyzer ──────────────────────────────────── */
function analyzeCode(code: string): Diagnostic[] {
  const results: Diagnostic[] = [];
  if (!code.trim()) return results;
  const lines = code.split('\n');
  const fullCode = code;

  for (let i = 0; i < lines.length; i++) {
    const num = i + 1;
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Line too long (PEP 8 E501 hint)
    if (raw.length > 120)
      results.push({ line: num, col: 121, severity: 'info', message: `Line length hint (${raw.length} > 120 chars) — E501`, source: 'static' });

    // Mixed tabs and spaces (E101)
    const leading = raw.match(/^(\s+)/);
    if (leading && leading[1].includes('\t') && leading[1].includes(' '))
      results.push({ line: num, col: 1, severity: 'error', message: 'Mixed tabs and spaces in indentation — E101', source: 'static' });

    // Python 2 print statement
    if (/\bprint\s+["'a-zA-Z_\[(]/.test(trimmed) && !/\bprint\s*\(/.test(trimmed))
      results.push({ line: num, col: raw.indexOf('print') + 1, severity: 'warning', message: "Python 2 'print' statement — use print()", source: 'static' });

    // Bare except (E722)
    if (/^except\s*:/.test(trimmed))
      results.push({ line: num, col: 1, severity: 'warning', message: 'Bare except: catches all exceptions including SystemExit — E722', source: 'static' });

    // Comparison to None with == (E711)
    if (/==\s*None\b|None\s*==/.test(trimmed))
      results.push({ line: num, col: 1, severity: 'warning', message: "Use 'is None' instead of '== None' — E711", source: 'static' });

    // Comparison to True/False (E712)
    if (/==\s*(True|False)\b/.test(trimmed))
      results.push({ line: num, col: 1, severity: 'info', message: "Use truthiness check instead of '== True/False' — E712", source: 'static' });

    // Trailing whitespace (W291)
    if (raw !== raw.trimEnd())
      results.push({ line: num, col: raw.trimEnd().length + 1, severity: 'info', message: 'Trailing whitespace — W291', source: 'static' });

    // np/pd used without visible import
    const preamble = fullCode.split('\n').slice(0, i).join('\n');
    if (/\bnp\./.test(trimmed) && !/import numpy|as np/.test(preamble))
      results.push({ line: num, col: 1, severity: 'info', message: "'np' used — ensure 'import numpy as np' is present", source: 'static' });
    if (/\bpd\./.test(trimmed) && !/import pandas|as pd/.test(preamble))
      results.push({ line: num, col: 1, severity: 'info', message: "'pd' used — ensure 'import pandas as pd' is present", source: 'static' });
  }

  return results;
}

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
  isCopilotOpen = false,
  onToggleCopilot,
}: ViewAsCodeStudioProps) {
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
  const [showRegenerateWarning, setShowRegenerateWarning] = useState(false);
  const [pendingRegenerateFile, setPendingRegenerateFile] = useState<string | null>(null);
  const [isFormatting, setIsFormatting] = useState(false);

  /* ── Find in Editor ──────────────────────────────────────────────── */
  const [isFindOpen, setIsFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [findMatches, setFindMatches] = useState<number[]>([]);
  const [findMatchIdx, setFindMatchIdx] = useState(0);

  /* ── Code Execution State ────────────────────────────────────────── */
  const [execId, setExecId] = useState<string | null>(null);
  const [execStatus, setExecStatus] = useState<'idle' | 'queued' | 'running' | 'completed' | 'failed' | 'stopped'>('idle');
  const [outputLines, setOutputLines] = useState<string[]>([]);
  const [execArtifacts, setExecArtifacts] = useState<string[]>([]);
  const [execModelId, setExecModelId] = useState<string | null>(null);
  const [isDeployingArtifact, setIsDeployingArtifact] = useState<boolean>(false);
  const [execDuration, setExecDuration] = useState<number | null>(null);
  const [execExitCode, setExecExitCode] = useState<number | null>(null);
  const [runtimeDiagnostics, setRuntimeDiagnostics] = useState<Diagnostic[]>([]);
  const [serverDiagnostics, setServerDiagnostics] = useState<Diagnostic[]>([]);
  const [isLinting, setIsLinting] = useState<boolean>(false);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);

  /* ── AI Copilot Chat State ───────────────────────────────────────── */
  const [copilotInput, setCopilotInput] = useState('');
  const [copilotChat, setCopilotChat] = useState<{ id: string; role: 'user' | 'assistant'; text: string }[]>([]);

  /* ── DOM Refs ────────────────────────────────────────────────────── */
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const outputEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const lastJobIdRef = useRef<string | null>(null);

  /* ── Canonical Pipeline Config Derivations ────────────────────────── */
  const activeDatasetName = dataset?.fileName || trainingConfig?.dataset_name || 'dataset.csv';
  const canonicalAlgorithm = trainingConfig?.algorithm || 'random_forest';
  const canonicalScaler    = trainingConfig?.scaler || 'standard_scaler';
  const canonicalImputer   = trainingConfig?.imputer || 'median';
  const canonicalCvFolds   = trainingConfig?.cv_folds ?? 5;
  const trainRatio         = trainingConfig?.train_test_split ?? 0.8;
  const testRatio          = Math.round((1 - trainRatio) * 100) / 100;
  const inferredTaskType   = (dataset as any)?.inferredTaskType || (trainingConfig as any)?.task_type;

  const currentFile = activeExperimentFile || openTabs[0] || 'pipeline_generated.py';
  const effectiveTabs = openTabs.length > 0 ? openTabs : [currentFile];
  const displayedCode = experimentFiles[currentFile] ?? generatedCode ?? '';

  // Auto-clean unused numpy import if present on classification pipelines
  useEffect(() => {
    if (!displayedCode) return;
    if (
      displayedCode.includes('import numpy as np') &&
      !displayedCode.includes('np.') &&
      !displayedCode.includes('numpy.')
    ) {
      const cleaned = displayedCode.replace(/^[ \t]*import numpy as np\r?\n?/m, '');
      if (cleaned !== displayedCode) {
        updateExperimentFileCode(currentFile, cleaned);
      }
    }
  }, [displayedCode, currentFile, updateExperimentFileCode]);

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
    if (outputEndRef.current && bottomPanelOpen) {
      outputEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [outputLines, bottomPanelOpen]);

  /* ── Cleanup SSE on unmount ──────────────────────────────────────── */
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  /* ── Live Debounced AST / Pyflakes Linter (350ms after keystroke) ── */
  useEffect(() => {
    // If buffer is empty or blank, immediately clear diagnostics (satisfies empty buffer requirement)
    if (!displayedCode || !displayedCode.trim()) {
      setServerDiagnostics([]);
      setIsLinting(false);
      return;
    }

    setIsLinting(true);
    const timer = setTimeout(async () => {
      try {
        const res = await CodeExecutionService.lintCode(displayedCode, currentFile);
        const mapped: Diagnostic[] = (res.diagnostics || [])
          .filter((d: any) => {
            if (d.message?.includes("'numpy as np' imported but unused") && !displayedCode.includes("np.")) {
              return false;
            }
            return true;
          })
          .map((d) => ({
            line: d.line,
            col: d.col,
            end_line: d.end_line,
            end_col: d.end_col,
            severity: d.severity,
            message: d.message,
            source: d.source,
            code: d.code,
          }));
        setServerDiagnostics(mapped);
      } catch {
        // Fallback to client-side static analysis if server is unreachable
        const fallback = analyzeCode(displayedCode);
        setServerDiagnostics(fallback);
      } finally {
        setIsLinting(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [displayedCode, currentFile]);

  /* ── Code Generation Logic ───────────────────────────────────────── */
  const generatePipelineCode = useCallback(async (targetFileName?: string) => {
    if (!isConfigValid) return;
    const fileToWrite = targetFileName || currentFile;

    setIsGenerating(true);
    setGenerationError(null);
    setAuthError(null);

    const target   = selectedTarget || trainingConfig!.target_column;
    const features = (
      selectedFeatures.length > 0 ? selectedFeatures : (trainingConfig!.feature_columns ?? [])
    ).filter((f) => f !== target && !isColumnIdentifier(f));

    const dag: PipelineDAG = {
      dataset_name:    activeDatasetName,
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
          params:  { test_size: testRatio, random_seed: trainingConfig?.random_seed ?? 42 },
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
      updateExperimentFileCode(fileToWrite, resp.python_code);
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

  const safeGeneratePipelineCode = useCallback((targetFileName?: string) => {
    const file = targetFileName || currentFile;
    if (isFileModified(file)) {
      setPendingRegenerateFile(file);
      setShowRegenerateWarning(true);
    } else {
      generatePipelineCode(file);
    }
  }, [currentFile, isFileModified, generatePipelineCode]);

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
      } catch {}
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
      } catch {}
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
  const handleSelectFile = useCallback((name: string) => {
    if (!openTabs.includes(name)) {
      setOpenTabs((prev) => [...prev, name]);
    }
    setActiveExperimentFile(name);
  }, [openTabs, setActiveExperimentFile, setOpenTabs]);

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

  const handleConfirmNewFile = useCallback(() => {
    if (!pendingNewFileName || !pendingNewFileName.trim()) {
      setPendingNewFileName(null);
      return;
    }
    const safeName = pendingNewFileName.trim().endsWith('.py')
      ? pendingNewFileName.trim()
      : `${pendingNewFileName.trim()}.py`;
    createExperimentFile(safeName, '# Machine Learning Experiment Pipeline\nimport numpy as np\nimport pandas as pd\n\n');
    setPendingNewFileName(null);
  }, [pendingNewFileName, createExperimentFile]);

  const handleCancelNewFile = useCallback(() => {
    setPendingNewFileName(null);
  }, []);

  const handleDeleteFile = useCallback((name: string) => {
    deleteExperimentFile(name);
  }, [deleteExperimentFile]);

  /* ── Code Editor Interactive Handlers ────────────────────────────── */
  const handleEditorChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    updateExperimentFileCode(currentFile, val);
    markFileModified(currentFile);
  }, [currentFile, updateExperimentFileCode, markFileModified]);

  const handleEditorSelect = useCallback(() => {
    if (!editorRef.current) return;
    const selStart = editorRef.current.selectionStart;
    const textBefore = displayedCode.substring(0, selStart);
    const lines = textBefore.split('\n');
    setCursorPos({ line: lines.length, col: lines[lines.length - 1].length + 1 });
  }, [displayedCode]);

  const handleEditorScroll = useCallback((e: React.UIEvent<HTMLTextAreaElement>) => {
    const top = e.currentTarget.scrollTop;
    const left = e.currentTarget.scrollLeft;
    if (preRef.current) {
      preRef.current.scrollTop = top;
      preRef.current.scrollLeft = left;
    }
    if (gutterRef.current) {
      gutterRef.current.scrollTop = top;
    }
  }, []);

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

  const handleFormatCode = async () => {
    if (!displayedCode || !displayedCode.trim()) {
      onShowToast?.('Empty Buffer', 'No Python code to format.', 'info');
      return;
    }
    setIsFormatting(true);
    const cursorOffset = editorRef.current?.selectionStart ?? 0;

    try {
      const res = await CodeExecutionService.formatCode(displayedCode);
      if (res.error) {
        onShowToast?.('Format Warning', res.error, 'error');
        return;
      }
      if (res.changed && res.code) {
        updateExperimentFileCode(currentFile, res.code);
        markFileModified(currentFile);
        setTimeout(() => {
          if (editorRef.current) {
            const nextPos = Math.min(cursorOffset, res.code.length);
            editorRef.current.setSelectionRange(nextPos, nextPos);
          }
        }, 0);
        onShowToast?.('Code Formatted', 'Formatted with Black (PEP 8).', 'success');
      } else {
        onShowToast?.('Code Clean', 'Code is already properly formatted.', 'info');
      }
    } catch (err: any) {
      onShowToast?.('Format Error', err.message || 'Formatting failed.', 'error');
    } finally {
      setIsFormatting(false);
    }
  };

  /* ── Code Execution Handlers ─────────────────────────────────────── */
  const handleRunCode = async () => {
    if (execStatus === 'running') return;
    if (!displayedCode || !displayedCode.trim()) {
      setOutputLines(['[ML Playground] No code to execute. File is empty.']);
      setBottomPanelOpen(true);
      setBottomTab('output');
      return;
    }

    const startTime = Date.now();
    const makeLog = (level: LogEntry['level'], message: string): LogEntry => ({
      id: `${Date.now()}-${Math.random()}`,
      time: new Date().toLocaleTimeString('en-US', { hour12: false }),
      level,
      message,
    });

    setBottomPanelOpen(true);
    setBottomTab('output');
    setOutputLines([`[ML Playground] Submitting ${currentFile} for sandboxed execution...`]);
    setExecStatus('queued');
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
        timeout: 90,
      });

      setExecId(res.exec_id);
      setExecStatus('running');
      setLogEntries(prev => [...prev, makeLog('info', `Execution accepted (ID: ${res.exec_id.slice(0, 8)})`)]);
      setOutputLines((prev) => [
        ...prev,
        `[ML Playground] Execution started (ID: ${res.exec_id.slice(0, 8)}). Streaming output...`,
      ]);

      const streamUrl = CodeExecutionService.streamUrl(res.exec_id);
      const es = new EventSource(streamUrl);
      eventSourceRef.current = es;
      // Accumulate all output for post-run traceback analysis
      const allOutputRef: string[] = [];

      es.onmessage = (event) => {
        const rawData = event.data;

        // ── Try JSON first (backend now sends typed JSON events) ──────────
        try {
          const data = JSON.parse(rawData);

          if (data.type === 'stdout' && data.data) {
            setOutputLines((p) => [...p, data.data]);
            allOutputRef.push(data.data);
            setLogEntries(prev => [...prev, makeLog('debug', data.data.slice(0, 120))]);

          } else if (data.type === 'stderr' && data.data) {
            const line = `[stderr] ${data.data}`;
            setOutputLines((p) => [...p, line]);
            allOutputRef.push(line);
            setLogEntries(prev => [...prev, makeLog('warn', data.data.slice(0, 120))]);

          } else if (data.type === 'system' && data.data) {
            setOutputLines((p) => [...p, data.data]);
            allOutputRef.push(data.data);
            setLogEntries(prev => [...prev, makeLog('system', data.data)]);

          } else if (data.type === 'exit') {
            const exitCode = data.exit_code ?? 0;
            const dur = data.duration_seconds ?? (Date.now() - startTime) / 1000;
            const arts = Array.isArray(data.artifacts) ? data.artifacts : [];
            setExecExitCode(exitCode);
            setExecDuration(dur);
            setExecArtifacts(arts);
            if (data.model_id) setExecModelId(data.model_id);
            const newStatus = exitCode === 0 ? 'completed' : 'failed';
            setExecStatus(newStatus);
            setLogEntries(prev => [
              ...prev,
              makeLog(newStatus === 'completed' ? 'info' : 'error',
                `Process exited with code ${exitCode} in ${dur.toFixed(2)}s`),
              ...(arts.length > 0 ? [makeLog('info', `Artifacts saved: ${arts.join(', ')}`)] : []),
            ]);
            // Parse traceback → inline error markers (only on failure)
            if (exitCode === 0) {
              setRuntimeDiagnostics([]);
            } else {
              const errDiags = parseRuntimeErrors(allOutputRef, currentFile, displayedCode.split('\n').length);
              setRuntimeDiagnostics(errDiags);
              if (errDiags.length > 0) setBottomTab('problems');
            }
            es.close();

          } else if (data.type === 'error') {
            const errMsg = `[Error] ${data.error}`;
            setOutputLines((p) => [...p, errMsg]);
            allOutputRef.push(errMsg);
            setLogEntries(prev => [...prev, makeLog('error', data.error)]);
            setExecStatus('failed');
            setExecDuration((Date.now() - startTime) / 1000);
            const errDiags = parseRuntimeErrors(allOutputRef, currentFile, displayedCode.split('\n').length);
            setRuntimeDiagnostics(errDiags);
            if (errDiags.length > 0) setBottomTab('problems');
            es.close();

          }
          // heartbeat → ignore
          return;
        } catch {
          // Not JSON → plain-text fallback (legacy stream)
        }

        // ── Plain-text fallback ────────────────────────────────────────
        if (rawData.startsWith('[DONE]')) {
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
              if (errDiags.length > 0) setBottomTab('problems');
            }
          }).catch(() => {});
          es.close();
          return;
        }

        const isStderr = rawData.startsWith('[stderr]');
        const isError  = rawData.startsWith('[Error]') || rawData.startsWith('[ERROR]');
        const isMlpg   = rawData.startsWith('[ML Playground]');
        setOutputLines((p) => [...p, rawData]);
        allOutputRef.push(rawData);
        if (isError)       setLogEntries(prev => [...prev, makeLog('error', rawData)]);
        else if (isStderr) setLogEntries(prev => [...prev, makeLog('warn', rawData.replace(/^\[stderr\]\s?/, ''))]);
        else if (isMlpg)   setLogEntries(prev => [...prev, makeLog('system', rawData)]);
        else               setLogEntries(prev => [...prev, makeLog('debug', rawData.slice(0, 120))]);
      };

      es.onerror = () => {
        es.close();
        CodeExecutionService.getResult(res.exec_id)
          .then((finalRes) => {
            if (finalRes.stdout) {
              const stdLines = finalRes.stdout.split('\n').filter(Boolean);
              setOutputLines((p) => [...p, ...stdLines]);
              allOutputRef.push(...stdLines);
            }
            if (finalRes.stderr) {
              const errLines = finalRes.stderr.split('\n').filter(Boolean).map((l) => `[stderr] ${l}`);
              setOutputLines((p) => [...p, ...errLines]);
              allOutputRef.push(...errLines);
            }
            const st = finalRes.status as any;
            setExecStatus(st);
            setExecExitCode(finalRes.exit_code ?? (finalRes.status === 'completed' ? 0 : null));
            setExecDuration(finalRes.duration_seconds ?? (Date.now() - startTime) / 1000);
            if (finalRes.artifacts) setExecArtifacts(finalRes.artifacts);
            if (finalRes.model_id) setExecModelId(finalRes.model_id);
            if (finalRes.exit_code === 0 || finalRes.status === 'completed') {
              setRuntimeDiagnostics([]);
            } else {
              const errDiags = parseRuntimeErrors(allOutputRef, currentFile, displayedCode.split('\n').length);
              setRuntimeDiagnostics(errDiags);
              if (errDiags.length > 0) setBottomTab('problems');
            }
            setLogEntries(prev => [...prev,
              makeLog(st === 'completed' ? 'info' : 'error',
                `Stream ended — final status: ${st}${finalRes.exit_code != null ? ` (exit ${finalRes.exit_code})` : ''}`),
            ]);
          })
          .catch(() => {
            setExecStatus('completed');
            setLogEntries(prev => [...prev, makeLog('warn', 'Stream ended (status unknown)')]);
          });
      };
    } catch (err: any) {
      setExecStatus('failed');
      setExecExitCode(null); // CRITICAL: Never fabricate an exit code (e.g. exit 1) for a request that didn't run!
      setExecDuration(null);
      const isNotFound = err?.status === 404;
      const isAuth     = err?.status === 401 || err?.status === 403;
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
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      await CodeExecutionService.stop(execId);
      setExecStatus('stopped');
      setOutputLines((p) => [...p, '[ML Playground] Execution stopped by user.']);
    } catch (err: any) {
      setOutputLines((p) => [...p, `[Error] Failed to stop execution: ${err.message}`]);
    }
  };

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

  /* ── Keyboard Shortcuts ──────────────────────────────────────────── */
  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl+S: Save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      markFileModified(currentFile);
      onShowToast?.('Saved', `${currentFile} saved.`, 'info');
      return;
    }
    // Ctrl+Enter: Run
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleRunCode();
      return;
    }
    // Ctrl+F: Find
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      setIsFindOpen((o) => !o);
      return;
    }
    // Ctrl+`: Toggle Terminal
    if ((e.ctrlKey || e.metaKey) && e.key === '`') {
      e.preventDefault();
      setBottomPanelOpen((o) => !o);
      return;
    }
    // Tab: Indent 4 spaces
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = e.currentTarget;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const val = ta.value;

      if (e.shiftKey) {
        const lineStart = val.lastIndexOf('\n', start - 1) + 1;
        const leading = val.slice(lineStart, lineStart + 4);
        let spaces = 0;
        for (let i = 0; i < leading.length; i++) {
          if (leading[i] === ' ') spaces++;
          else break;
        }
        if (spaces > 0) {
          const nextVal = val.slice(0, lineStart) + val.slice(lineStart + spaces);
          updateExperimentFileCode(currentFile, nextVal);
          markFileModified(currentFile);
          setTimeout(() => {
            ta.selectionStart = Math.max(lineStart, start - spaces);
            ta.selectionEnd = Math.max(lineStart, end - spaces);
          }, 0);
        }
      } else {
        const nextVal = val.substring(0, start) + '    ' + val.substring(end);
        updateExperimentFileCode(currentFile, nextVal);
        markFileModified(currentFile);
        setTimeout(() => {
          ta.selectionStart = ta.selectionEnd = start + 4;
        }, 0);
      }
      return;
    }
    // Enter: Auto-indent matching previous line
    if (e.key === 'Enter') {
      const ta = e.currentTarget;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const val = ta.value;
      const lineStart = val.lastIndexOf('\n', start - 1) + 1;
      const currentLine = val.substring(lineStart, start);
      const match = currentLine.match(/^[ \t]*/);
      let indent = match ? match[0] : '';
      if (currentLine.trim().endsWith(':')) {
        indent += '    ';
      }
      if (indent.length > 0) {
        e.preventDefault();
        const insert = '\n' + indent;
        const nextVal = val.substring(0, start) + insert + val.substring(end);
        updateExperimentFileCode(currentFile, nextVal);
        markFileModified(currentFile);
        setTimeout(() => {
          ta.selectionStart = ta.selectionEnd = start + insert.length;
        }, 0);
      }
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
    if (findMatches.length === 0 || !editorRef.current) return;
    const targetIdx = (index + findMatches.length) % findMatches.length;
    setFindMatchIdx(targetIdx);
    const start = findMatches[targetIdx];
    const end = start + findQuery.length;
    editorRef.current.focus();
    editorRef.current.setSelectionRange(start, end);
  };

  /* ── AI Copilot Context Cards ────────────────────────────────────── */
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

  /* ── AI Copilot Ask Question Handler ─────────────────────────────── */
  const handleSendCopilotMessage = (promptText?: string) => {
    const textToSend = (promptText || copilotInput).trim();
    if (!textToSend) return;

    const userMsg = { id: `u-${Date.now()}`, role: 'user' as const, text: textToSend };
    setCopilotChat((prev) => [...prev, userMsg]);
    if (!promptText) setCopilotInput('');

    // Generate intelligent AI contextual response
    setTimeout(() => {
      let reply = `Here is insight on "${textToSend}":\n\n`;
      const lower = textToSend.toLowerCase();
      if (lower.includes('hyperparameter') || lower.includes('tune')) {
        reply += `To tune **${canonicalAlgorithm}**, consider GridSearchCV over n_estimators (100, 200), max_depth (4, 8, None), and min_samples_split (2, 5). You can add cross-validation folds in Step 3.`;
      } else if (lower.includes('leakage') || lower.includes('exclude')) {
        reply += `Data leakage is prevented by isolating StandardScaler and SimpleImputer inside a Pipeline so they fit ONLY on X_train, and evaluating holdout X_test separately.`;
      } else if (lower.includes('explain') || lower.includes('pipeline')) {
        reply += `This pipeline loads **${activeDatasetName}**, applies **${canonicalImputer}** imputation, **${canonicalScaler}** normalization, splits data (${Math.round(trainRatio * 100)}% train / ${Math.round(testRatio * 100)}% test), and fits a **${canonicalAlgorithm}** estimator with **${canonicalCvFolds}-fold CV**.`;
      } else {
        reply += `The scikit-learn pipeline DAG is structured modularly. You can edit any parameter directly in the code editor, run it using the **Run** button, and view live stdout/stderr in the bottom Terminal.`;
      }
      setCopilotChat((prev) => [...prev, { id: `a-${Date.now()}`, role: 'assistant', text: reply }]);
    }, 450);
  };

  /* ── Lines for Code Editor ───────────────────────────────────────── */
  const codeLines = displayedCode.split('\n');
  const experimentFileList = Object.keys(experimentFiles).map((name) => ({ name }));

  /* ── Diagnostic Computations (Single Source of Truth: server + runtime) ─ */
  const allDiagnostics = useMemo(() => {
    // If buffer is empty, immediately return empty diagnostics (clean empty-state)
    if (!displayedCode || !displayedCode.trim()) return [];

    const seen = new Map<string, Diagnostic>();
    // Primary source: real server-side AST and pyflakes diagnostics.
    // Client-side analyzeCode serves as initial pre-check while server request is in flight
    const activeDiagnostics = serverDiagnostics.length > 0 ? serverDiagnostics : analyzeCode(displayedCode);

    [...activeDiagnostics, ...runtimeDiagnostics].forEach((d) => {
      const key = `${d.line}:${d.message}`;
      if (!seen.has(key)) seen.set(key, d);
    });

    return Array.from(seen.values()).sort((a, b) => {
      const s: Record<string, number> = { error: 0, warning: 1, info: 2 };
      return (s[a.severity] ?? 3) - (s[b.severity] ?? 3) || a.line - b.line;
    });
  }, [displayedCode, serverDiagnostics, runtimeDiagnostics]);

  const diagnosticsByLine = useMemo(() => {
    const map = new Map<number, Diagnostic>();
    allDiagnostics.forEach(d => {
      if (!map.has(d.line)) { map.set(d.line, d); return; }
      const ex = map.get(d.line)!;
      if ((d.severity === 'error' && ex.severity !== 'error') ||
          (d.severity === 'warning' && ex.severity === 'info'))
        map.set(d.line, d);
    });
    return map;
  }, [allDiagnostics]);

  const errorCount = allDiagnostics.filter(d => d.severity === 'error').length;
  const warnCount  = allDiagnostics.filter(d => d.severity === 'warning').length;

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
      {/* ── Overwrite Warning Modal ── */}
      {showRegenerateWarning && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 100,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              background: BB.surface,
              border: `1px solid ${BB.border}`,
              borderRadius: 10,
              padding: 24,
              maxWidth: 420,
              width: '90%',
              boxShadow: '0 12px 36px rgba(0,0,0,0.6)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <TriangleAlert style={{ width: 22, height: 22, color: BB.gold, flexShrink: 0 }} />
              <span style={{ fontSize: 15, fontWeight: 700, color: BB.text }}>Overwrite User Edits?</span>
            </div>
            <p style={{ fontSize: 12.5, color: BB.muted, marginBottom: 20, lineHeight: 1.6 }}>
              File <strong style={{ color: BB.gold }}>{pendingRegenerateFile}</strong> contains custom manual modifications. Regenerating will replace all current code with fresh scikit-learn pipeline code.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={() => {
                  setShowRegenerateWarning(false);
                  setPendingRegenerateFile(null);
                }}
                style={{
                  padding: '7px 14px',
                  borderRadius: 6,
                  background: 'transparent',
                  border: `1px solid ${BB.border}`,
                  color: BB.muted,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const file = pendingRegenerateFile;
                  setShowRegenerateWarning(false);
                  setPendingRegenerateFile(null);
                  if (file) generatePipelineCode(file);
                }}
                style={{
                  padding: '7px 16px',
                  borderRadius: 6,
                  background: BB.maroon,
                  border: `1px solid rgba(178,58,78,0.6)`,
                  color: BB.text,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Overwrite &amp; Regenerate
              </button>
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
          overflow: 'hidden',
          zIndex: 10,
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
                <FileCode style={{ width: 13, height: 13, color: isActiveTab ? BB.gold : BB.muted }} />
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
          {/* Format Button */}
          <button
            onClick={handleFormatCode}
            disabled={isFormatting || !displayedCode}
            aria-label="Format code"
            title="Auto-format Python code (Black / PEP 8)"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 9px',
              borderRadius: 5,
              border: `1px solid ${BB.border}`,
              background: 'rgba(75,59,124,0.15)',
              color: BB.text,
              fontSize: 11.5,
              cursor: isFormatting || !displayedCode ? 'not-allowed' : 'pointer',
              transition: 'all 120ms ease',
            }}
          >
            <Wand2 style={{ width: 12, height: 12, color: BB.gold }} />
            <span>Format</span>
          </button>

          {/* Regenerate Code Button */}
          <button
            onClick={() => safeGeneratePipelineCode(currentFile)}
            disabled={isGenerating || !isConfigValid}
            aria-label="Regenerate code"
            title={isFileModified(currentFile) ? 'Regenerate pipeline code (overwrites edits)' : 'Regenerate pipeline code'}
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

          <div style={{ width: 1, height: 16, background: BB.border, margin: '0 2px' }} />

          {/* Execution: Stop or Run Button */}
          {execStatus === 'running' ? (
            <button
              onClick={handleStopExecution}
              aria-label="Stop execution"
              title="Stop running Python execution"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 12px',
                borderRadius: 5,
                border: `1px solid ${BB.error}`,
                background: 'rgba(239,68,68,0.2)',
                color: BB.error,
                fontSize: 11.5,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 120ms ease',
              }}
            >
              <Square style={{ width: 12, height: 12, fill: BB.error }} />
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
                gap: 5,
                padding: '4px 12px',
                borderRadius: 5,
                border: '1px solid rgba(34,197,94,0.6)',
                background: 'linear-gradient(135deg, rgba(34,197,94,0.22), rgba(75,59,124,0.3))',
                color: BB.success,
                fontSize: 11.5,
                fontWeight: 700,
                cursor: isGenerating || !displayedCode ? 'not-allowed' : 'pointer',
                transition: 'all 120ms ease',
              }}
            >
              <Play style={{ width: 12, height: 12, fill: BB.success }} />
              <span>Run</span>
            </button>
          )}

          {/* Quick Deploy Button when artifact is ready */}
          {execArtifacts.some((a) => a.endsWith('.joblib') || a.endsWith('.pkl')) && (
            <button
              onClick={handleDeployFromCodeStudio}
              disabled={isDeployingArtifact}
              aria-label="Deploy model from Code Studio"
              title="Deploy trained model artifact to a serving endpoint"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 12px',
                borderRadius: 5,
                border: '1px solid rgba(0, 245, 160, 0.5)',
                background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.18), rgba(0, 245, 160, 0.22))',
                color: '#00F5A0',
                fontSize: 11.5,
                fontWeight: 700,
                cursor: isDeployingArtifact ? 'not-allowed' : 'pointer',
                boxShadow: '0 0 10px rgba(0, 245, 160, 0.2)',
                transition: 'all 120ms ease',
              }}
            >
              {isDeployingArtifact ? (
                <RefreshCw style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} />
              ) : (
                <Rocket style={{ width: 12, height: 12 }} />
              )}
              <span>{isDeployingArtifact ? 'Deploying...' : 'Deploy Model'}</span>
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
            <span>src</span>
            <ChevronRight style={{ width: 10, height: 10, opacity: 0.5 }} />
            <span>pipeline</span>
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

            {/* Line Numbers Gutter */}
            <div
              ref={gutterRef}
              aria-hidden="true"
              style={{
                width: 52,
                minWidth: 52,
                flexShrink: 0,
                background: BB.surface,
                borderRight: `1px solid ${BB.border}`,
                overflow: 'hidden',
                userSelect: 'none',
                padding: '12px 0 140px',
                boxSizing: 'border-box',
              }}
            >
              {codeLines.map((_, idx) => {
                const lineNum  = idx + 1;
                const isCurrent = cursorPos.line === lineNum;
                const diag     = diagnosticsByLine.get(lineNum);
                const diagColor = diag
                  ? diag.severity === 'error'   ? '#EF4444'
                  : diag.severity === 'warning' ? '#F59E0B'
                  : '#818CF8'
                  : null;
                return (
                  <div
                    key={idx}
                    title={diag?.message}
                    style={{
                      height: 22,
                      lineHeight: '22px',
                      textAlign: 'right',
                      paddingRight: 8,
                      fontSize: 12,
                      fontFamily: 'Consolas, Monaco, monospace',
                      color: isCurrent ? BB.gold : diag ? diagColor! : '#5C5478',
                      fontWeight: isCurrent ? 700 : 400,
                      background: isCurrent
                        ? 'rgba(201,162,75,0.08)'
                        : diag?.severity === 'error'
                        ? 'rgba(239,68,68,0.08)'
                        : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      gap: 4,
                      cursor: diag ? 'help' : 'default',
                    }}
                  >
                    {diag && (
                      <span style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: diagColor!, flexShrink: 0,
                        boxShadow: `0 0 4px ${diagColor}80`,
                      }} />
                    )}
                    {lineNum}
                  </div>
                );
              })}
            </div>

            {/* Editor Textarea & Highlight Surface */}
            <div style={{ flex: 1, height: '100%', position: 'relative', overflow: 'hidden' }}>
              {/* Syntax Highlighted Pre (decorative behind transparent textarea) */}
              <pre
                ref={preRef}
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  inset: 0,
                  margin: 0,
                  padding: '12px 16px 140px 16px',
                  overflow: 'hidden',
                  pointerEvents: 'none',
                  fontFamily: 'Consolas, Monaco, monospace',
                  fontSize: 12.5,
                  lineHeight: '22px',
                  tabSize: 4,
                  whiteSpace: 'pre',
                  boxSizing: 'border-box',
                  background: BB.codeBg,
                  zIndex: 1,
                }}
              >
                {codeLines.map((line, idx) => {
                  const lineNum   = idx + 1;
                  const isCurrent = cursorPos.line === lineNum;
                  const diag      = diagnosticsByLine.get(lineNum);
                  return (
                    <div
                      key={idx}
                      style={{
                        height: 22,
                        lineHeight: '22px',
                        whiteSpace: 'pre',
                        background: diag?.severity === 'error'
                          ? 'rgba(239,68,68,0.07)'
                          : diag?.severity === 'warning'
                          ? 'rgba(245,158,11,0.05)'
                          : isCurrent
                          ? 'rgba(255,255,255,0.02)'
                          : 'transparent',
                        borderLeft: diag?.severity === 'error'
                          ? '2px solid rgba(239,68,68,0.6)'
                          : diag?.severity === 'warning'
                          ? '2px solid rgba(245,158,11,0.5)'
                          : '2px solid transparent',
                      }}
                    >
                      {highlightPythonLine(line) ?? ' '}
                    </div>
                  );
                })}
              </pre>

              {/* Editable Transparent Textarea Overlay (receives all user input & drives scrolling) */}
              <textarea
                ref={editorRef}
                value={displayedCode}
                onChange={handleEditorChange}
                onKeyDown={handleEditorKeyDown}
                onSelect={handleEditorSelect}
                onClick={handleEditorSelect}
                onScroll={handleEditorScroll}
                spellCheck={false}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  padding: '12px 16px 140px 16px',
                  margin: 0,
                  overflow: 'auto',
                  resize: 'none',
                  background: 'transparent',
                  color: 'transparent',
                  caretColor: '#F5F1EC',
                  WebkitTextFillColor: 'transparent',
                  border: 'none',
                  outline: 'none',
                  fontFamily: 'Consolas, Monaco, monospace',
                  fontSize: 12.5,
                  lineHeight: '22px',
                  tabSize: 4,
                  whiteSpace: 'pre',
                  boxSizing: 'border-box',
                  zIndex: 2,
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
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: BB.success }} />
                <span>Python 3.10</span>
              </span>
              <span>Ln {cursorPos.line}, Col {cursorPos.col}</span>
              <span>scikit-learn 1.4</span>
              {isFileModified(currentFile) && (
                <span style={{ color: BB.gold }}>● Modified</span>
              )}
              {!isFileModified(currentFile) && generatedFiles.includes(currentFile) && (
                <span style={{ color: BB.primaryLight }}>✦ Generated</span>
              )}
              {/* Diagnostics & Linting Status */}
              <button
                onClick={() => {
                  setBottomPanelOpen(true);
                  setBottomTab('problems');
                }}
                title="View Problems (Inline & semantic diagnostics)"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: isLinting ? BB.gold : errorCount > 0 ? '#EF4444' : warnCount > 0 ? '#F59E0B' : BB.muted,
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
                {isLinting ? (
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
              {execStatus !== 'idle' && (
                <span
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
                        : execStatus === 'failed'
                        ? 'rgba(239,68,68,0.18)'
                        : 'rgba(107,92,166,0.18)',
                    color:
                      execStatus === 'running' || execStatus === 'completed'
                        ? BB.success
                        : execStatus === 'failed'
                        ? BB.error
                        : BB.muted,
                  }}
                >
                  {execStatus === 'running' && '● Running'}
                  {execStatus === 'queued' && '⏳ Queued'}
                  {execStatus === 'completed' && `✓ Done${execDuration ? ` (${execDuration.toFixed(1)}s)` : ''}`}
                  {execStatus === 'failed' && (execExitCode !== null ? `✕ Failed (Exit ${execExitCode})` : '✕ Unavailable')}
                  {execStatus === 'stopped' && '■ Stopped'}
                </span>
              )}

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

                {outputLines.length > 0 && (
                  <button
                    onClick={() => setOutputLines([])}
                    title="Clear terminal output"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: BB.muted,
                      cursor: 'pointer',
                      padding: '0 10px',
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
                    {outputLines.length === 0 && (
                      <div style={{ padding: '14px 16px', color: BB.muted, fontSize: 11.5, fontFamily: 'Consolas, Monaco, monospace' }}>
                        No output yet. Click <strong style={{ color: BB.success }}>Run</strong> above or press <strong style={{ color: BB.gold }}>Ctrl+Enter</strong> to execute the active script.
                      </div>
                    )}
                    {outputLines.map((line, i) => {
                      const isStderr = line.startsWith('[stderr]');
                      const isError = line.startsWith('[Error]') || line.startsWith('[ERROR]');
                      const isMlpg = line.startsWith('[ML Playground]');
                      return (
                        <div
                          key={i}
                          style={{
                            padding: '1px 16px',
                            fontFamily: 'Consolas, Monaco, monospace',
                            fontSize: 11.5,
                            lineHeight: 1.65,
                            color: isStderr || isError ? BB.error : isMlpg ? BB.primaryLight : '#D4D0C8',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all',
                            background: isStderr || isError ? 'rgba(239,68,68,0.06)' : 'transparent',
                          }}
                        >
                          {line}
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
                    {allDiagnostics.length === 0 ? (
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
                          const icon  = sev === 'error' ? '✕' : sev === 'warning' ? '⚠' : 'ℹ';
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
                                    // Jump editor to the line
                                    if (editorRef.current) {
                                      const lines = displayedCode.split('\n');
                                      let offset = 0;
                                      for (let j = 0; j < d.line - 1; j++) offset += lines[j].length + 1;
                                      editorRef.current.focus();
                                      editorRef.current.setSelectionRange(offset, offset + (lines[d.line - 1]?.length ?? 0));
                                    }
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
                                  <span style={{
                                    fontSize: 9.5, padding: '1px 5px', borderRadius: 3,
                                    background: d.source === 'runtime' ? 'rgba(239,68,68,0.15)' : 'rgba(107,92,166,0.2)',
                                    color: d.source === 'runtime' ? '#EF4444' : BB.primaryLight,
                                    flexShrink: 0,
                                  }}>
                                    {d.source}
                                  </span>
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
                        const lvlColor = entry.level === 'error'  ? '#EF4444'
                          : entry.level === 'warn'   ? '#F59E0B'
                          : entry.level === 'system' ? BB.primaryLight
                          : entry.level === 'info'   ? BB.success
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
                    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '4px 12px', lineHeight: 1.8 }}>
                      {/* Execution metadata */}
                      <span style={{ color: BB.muted }}>Execution ID</span>
                      <span style={{ color: execId ? BB.primaryLight : BB.muted }}>{execId || '—'}</span>

                      <span style={{ color: BB.muted }}>Status</span>
                      <span style={{ color:
                        execStatus === 'running'   ? BB.success
                        : execStatus === 'completed' ? BB.success
                        : execStatus === 'failed'    ? '#EF4444'
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
        onToggle={onToggleCopilot || (() => {})}
        messages={copilotMessages}
        chatMessages={copilotChat}
        onSendMessage={handleSendCopilotMessage}
        suggestedQuestions={[
          'Explain this pipeline configuration',
          'How to prevent data leakage?',
          'Suggest hyperparameters to tune',
          'Add cross-validation evaluation',
        ]}
        placeholder="Ask about this pipeline configuration..."
        title="AI Copilot"
        badge="AGENT"
      />
    </div>
  );
}
