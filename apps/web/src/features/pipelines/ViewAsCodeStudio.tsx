import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  FileCode,
  Copy,
  Check,
  Database,
  AlertCircle,
  RefreshCw,
  Lock,
  Download,
  GitBranch,
  Workflow,
  ChevronRight,
  ChevronDown,
  Trash2,
  Plus,
  FolderOpen,
  X,
} from 'lucide-react';
import { useProject } from '../../providers/ProjectContext';
import { PipelineService, type CodeStepExplanation, type PipelineDAG } from '../../services/api';
import { AuthExpiredError, ApiTimeoutError } from '../../services/apiClient';
import { AICopilotDrawer, type CopilotMsg } from '../../components/shared/AICopilotDrawer';
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
  codeBg: '#0D0A18',
} as const;

export interface ViewAsCodeStudioProps {
  isActive?: boolean;
  onShowToast?: (title: string, description?: string, type?: 'success' | 'info' | 'error') => void;
  onNavigate?: (tab: string) => void;
  isCopilotOpen?: boolean;
  onToggleCopilot?: () => void;
}

type StudioTab = 'code' | 'dag';

/* ── Simple Fast Python Syntax Highlighter Tokenizer ─────────────────── */
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
        <span style={{ color: '#9D94BA', fontStyle: 'italic' }}>{commentPart}</span>
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

/* ── Experiment File Explorer ─────────────────────────────────────────── */
interface ExperimentExplorerProps {
  csvName: string;
  files: { name: string }[];
  activeFile: string;
  pendingNewFileName: string | null;
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

  const shortCsv = csvName.length > 24 ? csvName.slice(0, 22) + '…' : csvName;

  // Auto-focus the inline input when it appears
  useEffect(() => {
    if (pendingNewFileName !== null) {
      setTimeout(() => newFileInputRef.current?.focus(), 50);
    }
  }, [pendingNewFileName]);

  return (
    <div
      style={{
        width: 220,
        minWidth: 220,
        flexShrink: 0,
        background: BB.surfaceSubtle,
        borderRight: `1px solid ${BB.border}`,
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
          padding: '7px 10px 5px',
          borderBottom: `1px solid ${BB.border}`,
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 9.5, fontWeight: 700, color: BB.muted, letterSpacing: '0.08em' }}>EXPERIMENTS</span>
        <button
          onClick={onNewFile}
          title="New experiment file"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 18,
            height: 18,
            borderRadius: 3,
            border: `1px solid ${BB.border}`,
            background: 'transparent',
            color: BB.muted,
            cursor: 'pointer',
            transition: 'all 120ms',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(107,92,166,0.18)';
            e.currentTarget.style.color = BB.text;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = BB.muted;
          }}
        >
          <Plus style={{ width: 10, height: 10 }} />
        </button>
      </div>

      {/* File Tree */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {/* CSV Folder Row */}
        <div
          onClick={() => setFolderOpen((o) => !o)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '3px 8px',
            cursor: 'pointer',
            color: BB.gold,
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          {folderOpen
            ? <ChevronDown style={{ width: 10, height: 10, flexShrink: 0 }} />
            : <ChevronRight style={{ width: 10, height: 10, flexShrink: 0 }} />}
          <FolderOpen style={{ width: 12, height: 12, flexShrink: 0 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10.5 }}>
            {shortCsv}
          </span>
        </div>

        {/* File Rows */}
        {folderOpen && files.map((f) => {
          const isActive = f.name === activeFile;
          const isHovered = hoveredFile === f.name;
          return (
            <div
              key={f.name}
              onClick={() => onSelectFile(f.name)}
              onMouseEnter={() => setHoveredFile(f.name)}
              onMouseLeave={() => setHoveredFile(null)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '3px 8px 3px 22px',
                cursor: 'pointer',
                background: isActive ? 'rgba(107,92,166,0.14)' : isHovered ? 'rgba(107,92,166,0.07)' : 'transparent',
                borderLeft: isActive ? `2px solid ${BB.primaryLight}` : '2px solid transparent',
                transition: 'all 80ms',
              }}
            >
              <FileCode style={{ width: 11, height: 11, color: isActive ? BB.gold : BB.muted, flexShrink: 0 }} />
              <span
                style={{
                  fontSize: 10.5,
                  color: isActive ? BB.text : BB.muted,
                  fontFamily: 'var(--font-mono)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                {f.name}
              </span>

              {/* Delete on hover (non-active only) */}
              {isHovered && !isActive && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDeleteFile(f.name); }}
                  title="Remove"
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
                  <Trash2 style={{ width: 9, height: 9 }} />
                </button>
              )}
            </div>
          );
        })}

        {/* Inline new file input */}
        {folderOpen && pendingNewFileName !== null && (
          <div style={{ padding: '3px 8px 3px 22px' }}>
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
                border: `1px solid ${BB.primaryLight}`,
                borderRadius: 3,
                color: BB.text,
                fontSize: 10.5,
                fontFamily: 'var(--font-mono)',
                padding: '2px 5px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
        )}

        {/* Empty hint */}
        {folderOpen && files.length === 0 && pendingNewFileName === null && (
          <div style={{ padding: '8px 22px', fontSize: 10, color: BB.disabled, fontStyle: 'italic' }}>
            Click + to create a file
          </div>
        )}
      </div>
    </div>
  );
}

export function ViewAsCodeStudio({
  isActive = true,
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
    inferredTaskType,
    activeJob,
    setLifecycleStage,
    activeExperimentFile,
    setActiveExperimentFile,
    experimentFiles,
    openTabs,
    setOpenTabs,
    updateExperimentFileCode,
    createExperimentFile,
    deleteExperimentFile,
  } = useProject();

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

  /* ── Inline new-file input: null = hidden, string = current typed value ── */
  const [pendingNewFileName, setPendingNewFileName] = useState<string | null>(null);

  /* ── Ref to track the last handled job launch from Page 1 ── */
  const lastJobIdRef = useRef<string | null>(activeJob?.job_id ?? null);

  /* ── Derived: canonical config values ───────────────────────────────── */
  const trainRatio         = Math.round((trainingConfig?.train_test_split ?? 0.8) * 100) / 100;
  const testRatio          = Math.round((1 - trainRatio) * 100) / 100;
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

  /* ── Mount: set lifecycle stage ──────────────────────────────────────── */
  useEffect(() => {
    setLifecycleStage('pipeline');
  }, [setLifecycleStage]);

  /* ── Code generation – reads ONLY from canonical context state ───────── */
  const generatePipelineCode = useCallback(async (targetFileName?: string) => {
    if (!isConfigValid) return;
    const fileToWrite = targetFileName || activeExperimentFile || 'pipeline_generated.py';

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
      updateExperimentFileCode(fileToWrite, resp.python_code);
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
    activeExperimentFile,
    updateExperimentFileCode,
  ]);

  // Initial bootstrap: generate code if active file is currently empty and page is active
  useEffect(() => {
    if (isActive && isConfigValid && (!experimentFiles[activeExperimentFile] || experimentFiles[activeExperimentFile].trim() === '')) {
      generatePipelineCode(activeExperimentFile);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, isConfigValid, activeExperimentFile]);

  // Launch sync: when a training job is launched from Page 1, apply changes directly to activeExperimentFile
  useEffect(() => {
    if (activeJob?.job_id && activeJob.job_id !== lastJobIdRef.current) {
      lastJobIdRef.current = activeJob.job_id;
      generatePipelineCode(activeExperimentFile);
    }
  }, [activeJob?.job_id, generatePipelineCode, activeExperimentFile]);

  /* ── Copy code to clipboard ─────────────────────────────────────── */
  const handleCopyCode = async () => {
    if (!displayedCode) return;
    try {
      await navigator.clipboard.writeText(displayedCode);
      setCopied(true);
      onShowToast?.('Code Copied', 'Scikit-learn pipeline script copied to clipboard.', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      onShowToast?.('Copy Error', 'Failed to copy code to clipboard.', 'error');
    }
  };

  /* ── Download Python script (.py) ────────────────────────────────── */
  const handleDownloadScript = () => {
    if (!displayedCode) return;
    try {
      const blob = new Blob([displayedCode], { type: 'text/x-python;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safeName = (activeExperimentFile || activeDatasetName).replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
      a.href = url;
      a.download = safeName.endsWith('.py') ? safeName : `${safeName}.py`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onShowToast?.('Download Complete', `Saved ${a.download}`, 'success');
    } catch {
      onShowToast?.('Download Error', 'Could not export Python script file.', 'error');
    }
  };

  /* ── Displayed code ─────────────────────────────────────────────── */
  // Each file has its own independent code in ProjectContext experimentFiles.
  const displayedCode = useMemo(() => {
    return experimentFiles[activeExperimentFile] ?? '';
  }, [experimentFiles, activeExperimentFile]);

  const codeLines = useMemo(() => {
    if (!displayedCode) return [];
    return displayedCode.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  }, [displayedCode]);

  /* ── Experiment file helpers ────────────────────────────────────────── */
  // Ordered list for the explorer tree
  const experimentFileList = useMemo(() => {
    return Object.keys(experimentFiles).map((name) => ({ name }));
  }, [experimentFiles]);

  const handleSelectFile = useCallback((name: string) => {
    setActiveExperimentFile(name);
    // Add to open tabs if not already present
    setOpenTabs((prev) => (prev.includes(name) ? prev : [...prev, name]));
  }, [setActiveExperimentFile, setOpenTabs]);

  const handleCloseTab = useCallback((name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenTabs((prev) => {
      const next = prev.filter((t) => t !== name);
      if (activeExperimentFile === name && next.length > 0) {
        const idx = prev.indexOf(name);
        const fallback = next[Math.min(idx, next.length - 1)];
        if (fallback) setActiveExperimentFile(fallback);
      }
      return next;
    });
  }, [activeExperimentFile, setActiveExperimentFile, setOpenTabs]);

  // Start inline rename: show the input
  const handleNewFile = useCallback(() => {
    setPendingNewFileName('');
  }, []);

  // User pressed Enter or blurred: create the file
  const handleConfirmNewFile = useCallback(async () => {
    if (pendingNewFileName === null) return;
    const raw = pendingNewFileName.trim();
    if (!raw) { setPendingNewFileName(null); return; }
    const name = raw.endsWith('.py') ? raw : raw + '.py';
    setPendingNewFileName(null);

    // Auto-generate code
    setIsGenerating(true);
    setGenerationError(null);
    const target = selectedTarget || trainingConfig?.target_column;
    const features = (
      selectedFeatures.length > 0 ? selectedFeatures : (trainingConfig?.feature_columns ?? [])
    ).filter((f) => f !== target && !isColumnIdentifier(f));
    const dag: PipelineDAG = {
      dataset_name:    dataset?.fileName || trainingConfig?.dataset_name || 'dataset.csv',
      target_column:   target || 'target',
      feature_columns: features.length > 0 ? features : ['feature1', 'feature2'],
      nodes: [
        { node_id: 'n1', type: 'missing_value_handler', name: 'Simple Imputer', params: { strategy: canonicalImputer || 'median' } },
        { node_id: 'n2', type: 'scaler', name: 'Feature Scaler', params: { scaler_type: canonicalScaler || 'standard_scaler', type: canonicalScaler || 'standard_scaler' } },
        { node_id: 'n3', type: 'train_test_split', name: 'Train-Test Split', params: { test_size: testRatio, random_seed: trainingConfig?.random_seed ?? 42 } },
        { node_id: 'n4', type: 'algorithm', name: 'ML Estimator', params: { algorithm: canonicalAlgorithm || 'random_forest_classifier', type: canonicalAlgorithm || 'random_forest_classifier' } },
      ],
    };
    try {
      const resp = await PipelineService.generateCode(dag, true, true);
      createExperimentFile(name, resp.python_code);
    } catch {
      createExperimentFile(name, '# Code generation failed.');
    } finally {
      setIsGenerating(false);
    }
  }, [pendingNewFileName, createExperimentFile, selectedTarget, selectedFeatures, trainingConfig, dataset, canonicalImputer, canonicalScaler, testRatio, canonicalAlgorithm]);

  const handleCancelNewFile = useCallback(() => {
    setPendingNewFileName(null);
  }, []);

  const handleDeleteFile = useCallback((name: string) => {
    deleteExperimentFile(name);
  }, [deleteExperimentFile]);

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
        gap: 0,
      }}
    >
      {/* ── WORKSPACE BODY: EXPLORER + STUDIO + COPILOT ─── */}
      <div
        style={{
          display: 'flex',
          flex: 1,
          minHeight: 0,
          gap: 4,
          overflow: 'hidden',
        }}
      >
        {/* ── LEFT: Experiment Explorer ─── */}
        <ExperimentExplorer
          csvName={activeDatasetName}
          files={experimentFileList}
          activeFile={activeExperimentFile}
          pendingNewFileName={pendingNewFileName}
          onSelectFile={handleSelectFile}
          onNewFile={handleNewFile}
          onDeleteFile={handleDeleteFile}
          onPendingNameChange={setPendingNewFileName}
          onPendingNameCommit={handleConfirmNewFile}
          onPendingNameCancel={handleCancelNewFile}
        />
        {/* ── STUDIO WORKSPACE (CODE OR DAG VIEW) ─────── */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            background: BB.surface,
            border: `1px solid ${BB.border}`,
            borderRadius: 6,
            overflow: 'hidden',
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          }}
        >
          {/* Validation Errors Panel (if any) */}
          {validationErrors.length > 0 && (
            <div
              role="alert"
              aria-label="Pipeline validation errors"
              style={{
                padding: '8px 12px',
                background: 'rgba(239,68,68,0.12)',
                borderBottom: '1px solid rgba(239,68,68,0.3)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 11,
                color: BB.error,
              }}
            >
              <AlertCircle style={{ width: 14, height: 14, flexShrink: 0 }} />
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {validationErrors.map((e, i) => (
                  <span key={i}>{e}</span>
                ))}
              </div>
            </div>
          )}
          {/* TAB 1: CODE EDITOR VIEW */}
          {activeTab === 'code' && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
              {/* VS Code-style File Tab Bar */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'stretch',
                  background: BB.base,
                  borderBottom: `1px solid ${BB.border}`,
                  flexShrink: 0,
                  overflowX: 'auto',
                  overflowY: 'hidden',
                }}
              >
                {openTabs.map((tab) => {
                  const isActive = tab === activeExperimentFile;
                  return (
                    <div
                      key={tab}
                      onClick={() => handleSelectFile(tab)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '0 10px 0 12px',
                        height: 32,
                        cursor: 'pointer',
                        background: isActive ? BB.elevated : 'transparent',
                        borderRight: `1px solid ${BB.border}`,
                        borderBottom: isActive ? `2px solid ${BB.gold}` : '2px solid transparent',
                        color: isActive ? BB.text : BB.muted,
                        fontSize: 11.5,
                        fontFamily: 'var(--font-mono)',
                        fontWeight: isActive ? 600 : 400,
                        flexShrink: 0,
                        whiteSpace: 'nowrap',
                        transition: 'color 80ms',
                        userSelect: 'none',
                      }}
                    >
                      <FileCode style={{ width: 11, height: 11, color: isActive ? BB.gold : BB.muted, flexShrink: 0 }} />
                      <span>{tab}</span>
                      <button
                        onClick={(e) => handleCloseTab(tab, e)}
                        title={`Close ${tab}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 14,
                          height: 14,
                          borderRadius: 2,
                          border: 'none',
                          background: 'transparent',
                          color: 'inherit',
                          cursor: 'pointer',
                          opacity: isActive ? 0.7 : 0,
                          transition: 'opacity 100ms',
                          padding: 0,
                          marginLeft: 2,
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = BB.error; }}
                        onMouseLeave={(e) => { e.currentTarget.style.opacity = isActive ? '0.7' : '0'; e.currentTarget.style.color = 'inherit'; }}
                      >
                        <X style={{ width: 10, height: 10 }} />
                      </button>
                    </div>
                  );
                })}
                {/* Right-side action row: view switchers + regenerate + copy + export */}
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px', flexShrink: 0 }}>
                  {/* View Switchers */}
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      background: 'rgba(0,0,0,0.25)',
                      border: `1px solid ${BB.border}`,
                      borderRadius: 4,
                      padding: 2,
                      gap: 2,
                    }}
                  >
                    <button
                      onClick={() => setActiveTab('code')}
                      aria-label="Python Script"
                      title="Python Script"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 24,
                        height: 22,
                        borderRadius: 4,
                        border: 'none',
                        background: BB.primary,
                        color: BB.text,
                        cursor: 'pointer',
                        transition: 'all 120ms ease',
                      }}
                    >
                      <FileCode style={{ width: 12, height: 12 }} />
                    </button>
                    <button
                      onClick={() => setActiveTab('dag')}
                      aria-label="Visual DAG Flow"
                      title="Visual DAG Flow"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 24,
                        height: 22,
                        borderRadius: 4,
                        border: 'none',
                        background: 'transparent',
                        color: BB.muted,
                        cursor: 'pointer',
                        transition: 'all 120ms ease',
                      }}
                    >
                      <GitBranch style={{ width: 12, height: 12 }} />
                    </button>
                  </div>

                  <div style={{ width: 1, height: 14, background: BB.border, margin: '0 2px' }} />

                  {/* Regenerate Code (symbol) */}
                  <button
                    onClick={() => generatePipelineCode(activeExperimentFile)}
                    disabled={isGenerating || !isConfigValid}
                    title="Regenerate Python code for active file"
                    aria-label="Regenerate code"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 24,
                      height: 22,
                      borderRadius: 4,
                      border: `1px solid ${BB.border}`,
                      background: 'transparent',
                      color: isGenerating ? BB.gold : BB.muted,
                      cursor: isGenerating || !isConfigValid ? 'not-allowed' : 'pointer',
                      transition: 'all 120ms ease',
                    }}
                  >
                    <RefreshCw style={{ width: 12, height: 12, animation: isGenerating ? 'spin 1s linear infinite' : 'none' }} />
                  </button>

                  {/* Copy Code (symbol) */}
                  <button
                    onClick={handleCopyCode}
                    disabled={!displayedCode}
                    title={copied ? 'Copied to clipboard!' : 'Copy Python code'}
                    aria-label="Copy code"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 24,
                      height: 22,
                      borderRadius: 4,
                      border: `1px solid ${copied ? 'rgba(34,197,94,0.45)' : BB.border}`,
                      background: copied ? 'rgba(34,197,94,0.18)' : 'transparent',
                      color: copied ? BB.success : BB.muted,
                      cursor: displayedCode ? 'pointer' : 'not-allowed',
                      transition: 'all 120ms ease',
                    }}
                  >
                    {copied ? <Check style={{ width: 12, height: 12 }} /> : <Copy style={{ width: 12, height: 12 }} />}
                  </button>

                  {/* Export .py Script (symbol) */}
                  <button
                    onClick={handleDownloadScript}
                    disabled={!displayedCode}
                    title="Download standalone Python script"
                    aria-label="Export .py script"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 24,
                      height: 22,
                      borderRadius: 4,
                      border: `1px solid ${BB.border}`,
                      background: 'transparent',
                      color: displayedCode ? BB.text : BB.disabled,
                      cursor: displayedCode ? 'pointer' : 'not-allowed',
                      transition: 'all 120ms ease',
                    }}
                  >
                    <Download style={{ width: 12, height: 12 }} />
                  </button>
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
                  overscrollBehavior: 'contain',
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

                {/* Synthesized Python Code with Unified Row Architecture */}
                {!isGenerating && !generationError && !authError && displayedCode && (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      minWidth: '100%',
                      width: 'max-content',
                      padding: '10px 0',
                      fontFamily: 'var(--font-mono)',
                      boxSizing: 'border-box',
                    }}
                  >
                    {codeLines.map((line, idx) => {
                      const renderedContent = highlightPythonLine(line);
                      return (
                        <div
                          key={idx}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            minHeight: 22,
                            lineHeight: '22px',
                            fontSize: 12.5,
                            transition: 'background 80ms ease',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(107, 92, 166, 0.09)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent';
                          }}
                        >
                          {/* Unified Line Number Gutter */}
                          <div
                            style={{
                              width: 52,
                              minWidth: 52,
                              userSelect: 'none',
                              textAlign: 'right',
                              paddingRight: 16,
                              color: '#766D94',
                              fontSize: 11,
                              fontFamily: 'var(--font-mono)',
                              borderRight: `1px solid ${BB.border}`,
                              flexShrink: 0,
                            }}
                          >
                            {idx + 1}
                          </div>

                          {/* Code Content */}
                          <div
                            style={{
                              flex: 1,
                              paddingLeft: 16,
                              paddingRight: 24,
                              whiteSpace: 'pre',
                              color: '#F5F1EC',
                            }}
                          >
                            {renderedContent ?? '\u00A0'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Empty File State */}
                {!isGenerating && !generationError && !authError && !displayedCode && (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flex: 1,
                      padding: 40,
                      gap: 12,
                      color: BB.muted,
                      fontSize: 12,
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    <FileCode style={{ width: 28, height: 28, color: BB.disabled }} />
                    <span>File is empty. Click Regenerate to synthesize pipeline code.</span>
                    <button
                      onClick={() => generatePipelineCode(activeExperimentFile)}
                      style={{
                        padding: '6px 14px',
                        borderRadius: 5,
                        background: BB.elevated,
                        border: `1px solid ${BB.primaryLight}`,
                        color: BB.text,
                        fontSize: 11,
                        cursor: 'pointer',
                      }}
                    >
                      Generate Code
                    </button>
                  </div>
                )}
              </div>

              {/* Integrated IDE Status Bar */}
              {displayedCode && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '4px 14px',
                    background: BB.elevated,
                    borderTop: `1px solid ${BB.border}`,
                    fontSize: 10.5,
                    color: BB.muted,
                    fontFamily: 'var(--font-mono)',
                    flexShrink: 0,
                    userSelect: 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: BB.success }} />
                      <span>Python 3.10</span>
                    </span>
                    <span>UTF-8</span>
                    <span>Spaces: 4</span>
                    <span>scikit-learn 1.4</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <span style={{ color: BB.gold, fontWeight: 600 }}>Standalone Pipeline</span>
                  </div>
                </div>
              )}
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
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '3px 10px',
                      borderRadius: 5,
                      background: 'rgba(107,92,166,0.14)',
                      border: `1px solid ${BB.border}`,
                    }}
                  >
                    <GitBranch style={{ width: 13, height: 13, color: BB.primaryLight }} />
                    <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 700, color: BB.text }}>
                      pipeline_dag.svg
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: 'var(--font-mono)',
                      color: BB.muted,
                      background: 'rgba(107, 92, 166, 0.15)',
                      padding: '2px 7px',
                      borderRadius: 4,
                      border: `1px solid ${BB.border}`,
                    }}
                  >
                    5 stages
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  {/* Symbol Switchers: Python Script & Visual DAG Flow */}
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      background: 'rgba(0,0,0,0.25)',
                      border: `1px solid ${BB.border}`,
                      borderRadius: 5,
                      padding: 2,
                      gap: 2,
                    }}
                  >
                    <button
                      onClick={() => setActiveTab('code')}
                      aria-label="Python Script"
                      title="Python Script"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 24,
                        height: 22,
                        borderRadius: 4,
                        border: 'none',
                        background: 'transparent',
                        color: BB.muted,
                        cursor: 'pointer',
                        transition: 'all 120ms ease',
                      }}
                    >
                      <FileCode style={{ width: 12, height: 12 }} />
                    </button>
                    <button
                      onClick={() => setActiveTab('dag')}
                      aria-label="Visual DAG Flow"
                      title="Visual DAG Flow"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 24,
                        height: 22,
                        borderRadius: 4,
                        border: 'none',
                        background: BB.primary,
                        color: BB.text,
                        cursor: 'pointer',
                        transition: 'all 120ms ease',
                      }}
                    >
                      <GitBranch style={{ width: 12, height: 12 }} />
                    </button>
                  </div>

                  <div style={{ width: 1, height: 14, background: BB.border, margin: '0 2px' }} />

                  {/* Copy Code (symbol) */}
                  <button
                    onClick={handleCopyCode}
                    disabled={!displayedCode}
                    title={copied ? 'Copied to clipboard!' : 'Copy Python code'}
                    aria-label="Copy code"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 24,
                      height: 22,
                      borderRadius: 4,
                      border: `1px solid ${copied ? 'rgba(34,197,94,0.45)' : BB.border}`,
                      background: copied ? 'rgba(34,197,94,0.18)' : 'transparent',
                      color: copied ? BB.success : BB.muted,
                      cursor: displayedCode ? 'pointer' : 'not-allowed',
                      transition: 'all 120ms ease',
                    }}
                  >
                    {copied ? <Check style={{ width: 12, height: 12 }} /> : <Copy style={{ width: 12, height: 12 }} />}
                  </button>

                  {/* Export .py Script (symbol) */}
                  <button
                    onClick={handleDownloadScript}
                    disabled={!generatedCode}
                    title="Download standalone Python script"
                    aria-label="Export .py script"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 24,
                      height: 22,
                      borderRadius: 4,
                      border: `1px solid ${BB.border}`,
                      background: 'transparent',
                      color: generatedCode ? BB.text : BB.disabled,
                      cursor: generatedCode ? 'pointer' : 'not-allowed',
                      transition: 'all 120ms ease',
                    }}
                  >
                    <Download style={{ width: 12, height: 12 }} />
                  </button>
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

        {/* AI Copilot Drawer docked on the right side of the workspace */}
        <AICopilotDrawer
          isOpen={isCopilotOpen}
          onToggle={onToggleCopilot || (() => {})}
          messages={copilotMessages}
          placeholder="Ask about this pipeline configuration…"
        />
      </div>
    </div>
  );
}
