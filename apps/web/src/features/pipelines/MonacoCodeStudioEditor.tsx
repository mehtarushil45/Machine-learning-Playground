/**
 * MonacoCodeStudioEditor -- Enterprise Monaco Editor Engine for Code Studio.
 *
 * Provides:
 *  - Full VS Code Monaco editor core
 *  - Custom "mlpg-studio-dark" enterprise theme matching the ML Playground palette
 *  - Python syntax services with rich autocompletions (scikit-learn, pandas, numpy, joblib)
 *  - Live AST/Pyflakes diagnostics wired directly to Monaco model markers (red/yellow squiggles)
 *  - Multi-cursor editing, bracket matching, minimap, and code folding
 *  - Keyboard shortcuts (Ctrl+Enter to run, Ctrl+S to save, Ctrl+` to toggle terminal)
 *  - Safe fallback for headless test runners (Vitest / JSDOM)
 */

import React, { useRef, useEffect } from 'react';
import Editor, { type OnMount, type BeforeMount, type Monaco } from '@monaco-editor/react';
import {
  getSchemaCompletions,
  getHoverDocstring,
  getSignatureHelp,
  type DatasetColumnInfo,
} from './mlCodeIntelligence';

export interface CodeDiagnostic {
  line: number;
  col: number;
  end_line?: number;
  end_col?: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
  source?: string;
  code?: string | null;
}

export interface MonacoCodeStudioEditorProps {
  code: string;
  onChange: (value: string) => void;
  filename?: string;
  diagnostics?: CodeDiagnostic[];
  onCursorChange?: (pos: { line: number; col: number }) => void;
  targetPosition?: { line: number; col: number } | null;
  onRunCode?: () => void;
  onSave?: () => void;
  onToggleTerminal?: () => void;
  minimapEnabled?: boolean;
  readOnly?: boolean;
  datasetColumns?: DatasetColumnInfo[];
  datasetName?: string;
  selectedTarget?: string | null;
  selectedFeatures?: string[];
  isLearningMode?: boolean;
  onInsertSnippetExplanation?: (title: string, explanation: string) => void;
}

// Check if running inside Vitest / JSDOM test environment
const isTestEnv =
  typeof window !== 'undefined' &&
  (Boolean((window as any).VITEST) ||
    Boolean((window as any).__vitest_worker__) ||
    process.env.NODE_ENV === 'test');

export const MonacoCodeStudioEditor: React.FC<MonacoCodeStudioEditorProps> = ({
  code,
  onChange,
  filename = 'train.py',
  diagnostics = [],
  onCursorChange,
  targetPosition,
  onRunCode,
  onSave,
  onToggleTerminal,
  minimapEnabled = true,
  readOnly = false,
  datasetColumns = [],
  datasetName = 'dataset.csv',
  selectedTarget = null,
  selectedFeatures = [],
  isLearningMode = false,
  onInsertSnippetExplanation,
}) => {
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const completionRegisteredRef = useRef(false);

  // Keep live references to active dataset schema and learning mode for Monaco language providers
  const datasetColumnsRef = useRef(datasetColumns);
  const datasetNameRef = useRef(datasetName);
  const selectedTargetRef = useRef(selectedTarget);
  const selectedFeaturesRef = useRef(selectedFeatures);
  const isLearningModeRef = useRef(isLearningMode);
  const onInsertSnippetExplanationRef = useRef(onInsertSnippetExplanation);

  datasetColumnsRef.current = datasetColumns;
  datasetNameRef.current = datasetName;
  selectedTargetRef.current = selectedTarget;
  selectedFeaturesRef.current = selectedFeatures;
  isLearningModeRef.current = isLearningMode;
  onInsertSnippetExplanationRef.current = onInsertSnippetExplanation;

  // Configure custom dark theme and Python language completions
  const handleBeforeMount: BeforeMount = (monaco) => {
    monacoRef.current = monaco;

    // 1. Define custom theme
    monaco.editor.defineTheme('mlpg-studio-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '7A7299', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'C9A24B', fontStyle: 'bold' },
        { token: 'keyword.control', foreground: 'C9A24B' },
        { token: 'string', foreground: '34D399' },
        { token: 'string.escape', foreground: '10B981' },
        { token: 'number', foreground: 'F59E0B' },
        { token: 'type', foreground: '818CF8' },
        { token: 'class', foreground: 'A78BFA', fontStyle: 'bold' },
        { token: 'function', foreground: '60A5FA' },
        { token: 'identifier', foreground: 'E2DCF0' },
        { token: 'operator', foreground: 'F472B6' },
      ],
      colors: {
        'editor.background': '#0A0814',
        'editor.foreground': '#E2DCF0',
        'editorCursor.foreground': '#F5F1EC',
        'editor.lineHighlightBackground': '#16122680',
        'editorLineNumber.foreground': '#5C5478',
        'editorLineNumber.activeForeground': '#C9A24B',
        'editor.selectionBackground': '#C9A24B33',
        'editor.inactiveSelectionBackground': '#C9A24B1A',
        'editorGutter.background': '#0F0C1E',
        'editorBracketMatch.background': '#C9A24B26',
        'editorBracketMatch.border': '#C9A24B88',
        'minimap.background': '#0A0814',
        'scrollbarSlider.background': '#25203A60',
        'scrollbarSlider.hoverBackground': '#25203AA0',
        'scrollbarSlider.activeBackground': '#C9A24B50',
      },
    });

    // 2. Register Python ML Language Intelligence Providers
    if (!completionRegisteredRef.current) {
      completionRegisteredRef.current = true;

      // 2a. Schema-Aware Completion Provider (5.1 & 5.3)
      monaco.languages.registerCompletionItemProvider('python', {
        triggerCharacters: ['"', "'", '[', '.', ' '],
        provideCompletionItems: (model: any, position: any) => {
          const word = model.getWordUntilPosition(position);
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          };

          const rawSuggestions = getSchemaCompletions(
            model.getValue(),
            position.lineNumber,
            position.column,
            datasetColumnsRef.current,
            selectedTargetRef.current,
            selectedFeaturesRef.current,
            datasetNameRef.current
          );

          const suggestions = rawSuggestions.map((item) => ({
            label: item.label,
            kind: item.kind,
            detail: item.detail,
            documentation: { value: item.documentation },
            insertText: item.insertText,
            insertTextRules: item.isSnippet
              ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
              : undefined,
            sortText: item.sortText,
            range,
          }));

          return { suggestions };
        },
      });

      // 2b. Hover Provider from Pinned Library Docstrings & Schema (5.2)
      monaco.languages.registerHoverProvider('python', {
        provideHover: (model: any, position: any) => {
          const word = model.getWordAtPosition(position);
          if (!word || !word.word) return null;

          const hoverInfo = getHoverDocstring(
            word.word,
            datasetColumnsRef.current,
            datasetNameRef.current,
            selectedTargetRef.current
          );

          if (!hoverInfo) return null;

          return {
            range: new monaco.Range(
              position.lineNumber,
              word.startColumn,
              position.lineNumber,
              word.endColumn
            ),
            contents: hoverInfo.contents.map((c) => ({ value: c })),
          };
        },
      });

      // 2c. Signature Help Provider for scikit-learn Functions (5.2)
      monaco.languages.registerSignatureHelpProvider('python', {
        signatureHelpTriggerCharacters: ['(', ','],
        provideSignatureHelp: (model: any, position: any) => {
          const lineText = model.getLineContent(position.lineNumber);
          const sigResult = getSignatureHelp(lineText, position.column);
          if (!sigResult) return null;

          return {
            value: {
              activeSignature: 0,
              activeParameter: sigResult.activeParameter,
              signatures: [
                {
                  label: sigResult.signature.label,
                  documentation: { value: sigResult.signature.documentation },
                  parameters: sigResult.signature.parameters.map((p) => ({
                    label: p.label,
                    documentation: { value: p.documentation },
                  })),
                },
              ],
            },
            dispose: () => {},
          };
        },
      });
    }
  };

  // Mount handler: wire cursor tracking and keyboard shortcuts
  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Track cursor movements
    editor.onDidChangeCursorPosition((e) => {
      onCursorChange?.({
        line: e.position.lineNumber,
        col: e.position.column,
      });
    });

    // Register Keybinding: Ctrl+Enter / Cmd+Enter => Run Code
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      onRunCode?.();
    });

    // Register Keybinding: Ctrl+S / Cmd+S => Save Code
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      onSave?.();
    });

    // Register Keybinding: Ctrl+` / Cmd+` => Toggle Terminal
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Backquote, () => {
      onToggleTerminal?.();
    });
  };

  // Update diagnostic markers in Monaco whenever diagnostics or code change
  useEffect(() => {
    if (!editorRef.current || !monacoRef.current) return;
    const monaco = monacoRef.current;
    const model = editorRef.current.getModel();
    if (!model) return;

    const markers = diagnostics.map((d) => ({
      severity:
        d.severity === 'error'
          ? monaco.MarkerSeverity.Error
          : d.severity === 'warning'
          ? monaco.MarkerSeverity.Warning
          : monaco.MarkerSeverity.Info,
      startLineNumber: Math.max(1, d.line),
      startColumn: Math.max(1, d.col || 1),
      endLineNumber: Math.max(1, d.end_line || d.line),
      endColumn: Math.max(2, d.end_col || (d.col ? d.col + 2 : 80)),
      message: d.message,
      source: d.source ? `Python (${d.source})` : 'ML Linter',
    }));

    monaco.editor.setModelMarkers(model, 'mlpg-lint', markers);
  }, [diagnostics]);

  // Jump cursor and reveal line when targetPosition changes (e.g. clicking a problem)
  useEffect(() => {
    if (!editorRef.current || !targetPosition) return;
    try {
      editorRef.current.setPosition({
        lineNumber: Math.max(1, targetPosition.line),
        column: Math.max(1, targetPosition.col || 1),
      });
      editorRef.current.revealPositionInCenter({
        lineNumber: Math.max(1, targetPosition.line),
        column: Math.max(1, targetPosition.col || 1),
      });
      editorRef.current.focus();
    } catch {}
  }, [targetPosition]);

  // Handle fallback in test runner environments (JSDOM / Vitest)
  if (isTestEnv) {
    return (
      <div
        data-testid="monaco-code-studio-container"
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: '#0A0814',
        }}
      >
        <textarea
          data-testid="monaco-code-editor"
          aria-label={`Code Editor for ${filename}`}
          value={code}
          readOnly={readOnly}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault();
              onRunCode?.();
            } else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
              e.preventDefault();
              onSave?.();
            } else if ((e.ctrlKey || e.metaKey) && e.key === '`') {
              e.preventDefault();
              onToggleTerminal?.();
            }
          }}
          onSelect={(e) => {
            const ta = e.currentTarget;
            const textBefore = ta.value.substring(0, ta.selectionStart);
            const lines = textBefore.split('\n');
            onCursorChange?.({
              line: lines.length,
              col: lines[lines.length - 1].length + 1,
            });
          }}
          style={{
            flex: 1,
            width: '100%',
            height: '100%',
            background: '#0A0814',
            color: '#E2DCF0',
            fontFamily: 'Consolas, Monaco, monospace',
            fontSize: 13,
            lineHeight: '22px',
            border: 'none',
            outline: 'none',
            resize: 'none',
            padding: '12px 16px',
            boxSizing: 'border-box',
          }}
        />
      </div>
    );
  }

  return (
    <div
      data-testid="monaco-code-studio-container"
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        background: '#0A0814',
      }}
    >
      <Editor
        height="100%"
        width="100%"
        language="python"
        theme="mlpg-studio-dark"
        value={code}
        beforeMount={handleBeforeMount}
        onMount={handleMount}
        onChange={(val) => onChange(val ?? '')}
        options={{
          fontSize: 13,
          lineHeight: 22,
          fontFamily: "Consolas, Monaco, 'Courier New', monospace",
          minimap: {
            enabled: minimapEnabled,
            maxColumn: 120,
            renderCharacters: true,
            scale: 1,
            size: 'proportional',
            showSlider: 'mouseover',
            side: 'right',
          },
          scrollBeyondLastLine: false,
          automaticLayout: true,
          renderLineHighlight: 'all',
          bracketPairColorization: { enabled: true },
          tabSize: 4,
          insertSpaces: true,
          readOnly,
          formatOnPaste: true,
          quickSuggestions: {
            other: true,
            comments: false,
            strings: true,
          },
          suggestOnTriggerCharacters: true,
          wordBasedSuggestions: 'currentDocument',
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: 'on',
          smoothScrolling: true,
          folding: true,
          showFoldingControls: 'always',
          renderWhitespace: 'selection',
          padding: { top: 12, bottom: 24 },
        }}
      />
    </div>
  );
};
