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
  onRunCode?: () => void;
  onSave?: () => void;
  onToggleTerminal?: () => void;
  minimapEnabled?: boolean;
  readOnly?: boolean;
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
  onRunCode,
  onSave,
  onToggleTerminal,
  minimapEnabled = true,
  readOnly = false,
}) => {
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const completionRegisteredRef = useRef(false);

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

    // 2. Register Python ML Completions and Snippets
    if (!completionRegisteredRef.current) {
      completionRegisteredRef.current = true;
      monaco.languages.registerCompletionItemProvider('python', {
        provideCompletionItems: (model: any, position: any) => {
          const word = model.getWordUntilPosition(position);
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          };

          const suggestions: any[] = [
            // Scikit-learn models & transformers
            {
              label: 'RandomForestClassifier',
              kind: monaco.languages.CompletionItemKind.Class,
              insertText: 'RandomForestClassifier(n_estimators=${1:100}, max_depth=${2:None}, random_state=42)',
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              documentation: 'Random Forest Classifier ensemble from scikit-learn',
              range,
            },
            {
              label: 'GradientBoostingClassifier',
              kind: monaco.languages.CompletionItemKind.Class,
              insertText: 'GradientBoostingClassifier(learning_rate=${1:0.1}, n_estimators=${2:100}, random_state=42)',
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              documentation: 'Gradient Boosting Classifier from scikit-learn',
              range,
            },
            {
              label: 'LogisticRegression',
              kind: monaco.languages.CompletionItemKind.Class,
              insertText: 'LogisticRegression(C=${1:1.0}, max_iter=1000, random_state=42)',
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              documentation: 'Regularized Logistic Regression classifier',
              range,
            },
            {
              label: 'StandardScaler',
              kind: monaco.languages.CompletionItemKind.Class,
              insertText: 'StandardScaler()',
              documentation: 'Standardize features by removing mean and scaling to unit variance',
              range,
            },
            {
              label: 'SimpleImputer',
              kind: monaco.languages.CompletionItemKind.Class,
              insertText: 'SimpleImputer(strategy="${1:median}")',
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              documentation: 'Univariate imputer for missing values with specified strategy',
              range,
            },
            {
              label: 'Pipeline',
              kind: monaco.languages.CompletionItemKind.Class,
              insertText: 'Pipeline([\n    ("preprocessor", ${1:preprocessor}),\n    ("classifier", ${2:classifier}),\n])',
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              documentation: 'Pipeline of transforms with a final estimator',
              range,
            },
            {
              label: 'ColumnTransformer',
              kind: monaco.languages.CompletionItemKind.Class,
              insertText: 'ColumnTransformer([\n    ("num", StandardScaler(), ${1:num_cols}),\n    ("cat", OneHotEncoder(handle_unknown="ignore"), ${2:cat_cols}),\n])',
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              documentation: 'Applies transformers to columns of an array or pandas DataFrame',
              range,
            },
            {
              label: 'train_test_split',
              kind: monaco.languages.CompletionItemKind.Function,
              insertText: 'X_train, X_test, y_train, y_test = train_test_split(${1:X}, ${2:y}, test_size=${3:0.2}, random_state=42)',
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              documentation: 'Split arrays or matrices into random train and test subsets',
              range,
            },

            // Pandas & Numpy
            {
              label: 'pd.read_csv',
              kind: monaco.languages.CompletionItemKind.Function,
              insertText: 'pd.read_csv("${1:dataset.csv}")',
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              documentation: 'Read a comma-separated values (csv) file into DataFrame',
              range,
            },
            {
              label: 'joblib.dump',
              kind: monaco.languages.CompletionItemKind.Function,
              insertText: 'joblib.dump(${1:pipeline}, "model.joblib")',
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              documentation: 'Persist arbitrary Python model pipeline to disk for Model Registry deployment',
              range,
            },

            // High-productivity ML snippets
            {
              label: 'snippet:ml-pipeline',
              kind: monaco.languages.CompletionItemKind.Snippet,
              insertText: [
                'import pandas as pd',
                'import joblib',
                'from sklearn.model_selection import train_test_split',
                'from sklearn.pipeline import Pipeline',
                'from sklearn.preprocessing import StandardScaler',
                'from sklearn.impute import SimpleImputer',
                'from sklearn.ensemble import RandomForestClassifier',
                'from sklearn.metrics import classification_report',
                '',
                '# 1. Load Data',
                'df = pd.read_csv("dataset.csv")',
                'X = df.drop(columns=["target"])',
                'y = df["target"]',
                '',
                '# 2. Split',
                'X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)',
                '',
                '# 3. Build & Train Pipeline',
                'pipeline = Pipeline([',
                '    ("imputer", SimpleImputer(strategy="median")),',
                '    ("scaler", StandardScaler()),',
                '    ("classifier", RandomForestClassifier(n_estimators=100, random_state=42)),',
                '])',
                'pipeline.fit(X_train, y_train)',
                '',
                '# 4. Evaluate & Save',
                'score = pipeline.score(X_test, y_test)',
                'print(f"Accuracy: {score:.4f}")',
                'joblib.dump(pipeline, "model.joblib")',
                'print("Model artifact successfully saved to model.joblib")',
              ].join('\n'),
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              documentation: 'Complete Scikit-Learn training pipeline with data staging, fit, eval, and model artifact persistence',
              range,
            },
          ];

          return { suggestions };
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
            maxColumn: 80,
            renderCharacters: false,
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
