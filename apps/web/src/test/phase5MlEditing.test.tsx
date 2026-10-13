/**
 * phase5MlEditing.test.tsx -- Test Suite for Phase 5: ML-Native Editing
 *
 * Verifies:
 *  5.1 Schema-aware completions (df["..."], columns, TARGET_COLUMN, FEATURE_COLUMNS)
 *  5.2 Pinned library docstrings & signature help (scikit-learn 1.9.0, pandas, joblib)
 *  5.3 Working ML snippets with educational explanations for Learning Mode
 *  5.4 Distinct "ML Playground checks" problem source badges (no contamination of Python lint)
 *  5.5 AI Copilot Explain and Fix actions with side-by-side Diff review modal
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectProvider, useProject } from '../providers/ProjectContext';
import { ViewAsCodeStudio } from '../features/pipelines/ViewAsCodeStudio';
import {
  getSchemaCompletions,
  getHoverDocstring,
  getSignatureHelp,
  ML_SNIPPETS,
} from '../features/pipelines/mlCodeIntelligence';
import { LearningService, CopilotApiService } from '../services/api';

vi.mock('../services/api', () => ({
  PipelineService: {
    generateCode: vi.fn().mockResolvedValue({
      python_code: 'import sklearn\n# Phase 5 ML Test Code\nprint("ML Editing")',
      is_valid_syntax: true,
      execution_order: ['n1'],
      imports: ['sklearn'],
    }),
    validatePipeline: vi.fn().mockResolvedValue({ is_valid: true, errors: [], warnings: [] }),
  },
  CodeExecutionService: {
    lintCode: vi.fn().mockResolvedValue({
      is_valid_syntax: true,
      diagnostics: [
        {
          line: 2,
          col: 1,
          severity: 'warning',
          message: "'numpy' imported but unused",
          source: 'pyflakes',
        },
      ],
    }),
    getRuntimeInfo: vi.fn().mockResolvedValue({
      python_version: '3.12',
      sklearn_version: '1.9',
      full_python_version: '3.12.14',
      full_sklearn_version: '1.9.0',
      status: 'online',
    }),
    wsLintUrl: vi.fn().mockReturnValue('ws://localhost:8000/api/v1/code-execution/ws-lint'),
    execute: vi.fn().mockResolvedValue({
      exec_id: 'exec-phase5-test',
      status: 'running',
      queue_position: null,
    }),
    stop: vi.fn().mockResolvedValue({ status: 'cancelled', message: 'Execution stopped.' }),
    streamUrl: vi.fn().mockImplementation((id: string) => `/api/v1/code-execution/stream/${id}`),
    downloadOutputUrl: vi.fn().mockImplementation((id: string) => `/api/v1/code-execution/${id}/output/download`),
    getResult: vi.fn().mockResolvedValue({
      exec_id: 'exec-phase5-test',
      status: 'completed',
      exit_code: 0,
      duration_seconds: 0.5,
      stdout: 'done\n',
      stderr: '',
      artifacts: [],
      is_truncated: false,
    }),
    listWorkspaceFiles: vi.fn().mockResolvedValue({
      project_id: 'test-phase5-proj',
      files: [
        {
          name: 'pipeline_generated.py',
          path: 'pipeline_generated.py',
          is_dir: false,
          is_readonly: false,
          size: 1024,
          modified_at: 1728800200,
        },
      ],
    }),
    readWorkspaceFile: vi.fn().mockResolvedValue({
      project_id: 'test-phase5-proj',
      filename: 'pipeline_generated.py',
      content: 'import sklearn\n# Phase 5 ML Test Code\nprint("ML Editing")',
    }),
    saveWorkspaceFile: vi.fn().mockResolvedValue({
      filename: 'pipeline_generated.py',
      size: 40,
      status: 'saved',
    }),
    getTerminalStatus: vi.fn().mockResolvedValue({
      enabled: false,
      status: 'blocked',
      reason: 'Sandbox required',
    }),
  },
  CopilotApiService: {
    chat: vi.fn().mockResolvedValue({
      reply: 'Here is the fix:\n```python\n# Fixed ML Code\nfrom sklearn.model_selection import train_test_split\n```',
      provider: 'mock-llm',
      model: 'gpt-4o',
      allowed: true,
      configured: true,
    }),
    getStatus: vi.fn().mockResolvedValue({
      configured: true,
      provider: 'mock-llm',
      model: 'gpt-4o',
      requires_key: false,
    }),
  },
  LearningService: {
    logSignal: vi.fn().mockResolvedValue({}),
    auditCode: vi.fn().mockResolvedValue({
      has_leakage: true,
      line_number: 14,
      message: 'Data Leakage Detected: StandardScaler.fit() executed prior to train_test_split()',
    }),
  },
  LocalDeploymentService: {
    deployFromCodeStudio: vi.fn().mockResolvedValue({ success: true, deployment_id: 'dep-1' }),
  },
}));

vi.mock('../features/pipelines/MonacoCodeStudioEditor', () => ({
  MonacoCodeStudioEditor: ({ code, onChange }: any) => (
    <div data-testid="monaco-mock-editor">
      <textarea
        data-testid="monaco-textarea"
        value={code}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  ),
}));

const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <ProjectProvider>
      <ContextInitializer>{children}</ContextInitializer>
    </ProjectProvider>
  );
};

const ContextInitializer: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { setTrainingConfig, setSelectedTarget, updateExperimentFileCode, setActiveExperimentFile, setDataset } = useProject();

  React.useEffect(() => {
    setDataset({
      fileName: 'customers.csv',
      datasetId: 'test-phase5-proj',
      fileSize: 4096,
      previewRows: [
        { customer_id: '1', age: 34, income: 75000, churn: 0 },
        { customer_id: '2', age: 45, income: 92000, churn: 1 },
      ],
      totalRows: 100,
      columns: [
        { name: 'customer_id', type: 'string' },
        { name: 'age', type: 'integer' },
        { name: 'income', type: 'float' },
        { name: 'churn', type: 'integer' },
      ],
      numericColumns: ['age', 'income', 'churn'],
      categoricalColumns: ['customer_id'],
      missingValues: {},
    } as any);

    setSelectedTarget('churn');
    setTrainingConfig({
      dataset_id: 'test-phase5-proj',
      dataset_name: 'customers.csv',
      target_column: 'churn',
      feature_columns: ['age', 'income'],
      algorithm: 'random_forest_classifier',
      scaler: 'standard_scaler',
      imputer: 'median',
      train_test_split: 0.8,
      cv_folds: 5,
      random_seed: 42,
      selection_source: 'manual',
    });
    updateExperimentFileCode(
      'pipeline_generated.py',
      'import sklearn\nscaler = StandardScaler()\nX_scaled = scaler.fit_transform(X)\nX_train, X_test = train_test_split(X_scaled)\n'
    );
    setActiveExperimentFile('pipeline_generated.py');
  }, [setTrainingConfig, setSelectedTarget, updateExperimentFileCode, setActiveExperimentFile, setDataset]);

  return <>{children}</>;
};

describe('Phase 5: ML-Native Editing Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /* ── 5.1 Schema-Aware Completions ───────────────────────────────────────── */
  describe('5.1 Schema-Aware Completion Intelligence', () => {
    const mockColumns = [
      { name: 'age', type: 'integer' },
      { name: 'income', type: 'float' },
      { name: 'churn', type: 'integer' },
    ];

    it('suggests column names when typing inside df["..."] subscript', () => {
      const items = getSchemaCompletions('df["', 1, 5, mockColumns, 'churn', ['age', 'income'], 'customers.csv');
      const labels = items.map((i) => i.label);
      expect(labels).toContain('age');
      expect(labels).toContain('income');
      expect(labels).toContain('churn');

      const ageItem = items.find((i) => i.label === 'age');
      expect(ageItem).toBeDefined();
      expect(ageItem?.detail).toContain('integer');
      expect(ageItem?.documentation).toContain('customers.csv');
    });

    it('suggests column names inside single quotes subscript df[\'...', () => {
      const items = getSchemaCompletions("df['", 1, 5, mockColumns, 'churn', ['age', 'income'], 'customers.csv');
      const labels = items.map((i) => i.label);
      expect(labels).toContain('income');
    });

    it('provides TARGET_COLUMN and FEATURE_COLUMNS suggestions', () => {
      const items = getSchemaCompletions('x = ', 1, 5, mockColumns, 'churn', ['age', 'income'], 'customers.csv');
      const labels = items.map((i) => i.label);
      expect(labels).toContain('TARGET_COLUMN');
      expect(labels).toContain('FEATURE_COLUMNS');

      const targetItem = items.find((i) => i.label === 'TARGET_COLUMN');
      expect(targetItem?.detail).toContain('"churn"');

      const featureItem = items.find((i) => i.label === 'FEATURE_COLUMNS');
      expect(featureItem?.documentation).toContain('age, income');
    });

    it('suggests scikit-learn and pandas ML primitives when outside subscripts', () => {
      const items = getSchemaCompletions('import ', 1, 8, mockColumns, null, []);
      const labels = items.map((i) => i.label);
      expect(labels).toContain('RandomForestClassifier');
      expect(labels).toContain('train_test_split');
      expect(labels).toContain('StandardScaler');
      expect(labels).toContain('cross_val_score');
    });
  });

  /* ── 5.2 Hover Docstrings & Signatures ──────────────────────────────────── */
  describe('5.2 Pinned Library Docstrings & Signatures (scikit-learn 1.9.0, Python 3.12, pandas, joblib)', () => {
    const mockColumns = [
      { name: 'age', type: 'integer' },
      { name: 'income', type: 'float' },
    ];

    it('returns scikit-learn 1.9.0 pinned docstrings for ML models and transformers', () => {
      const rfHover = getHoverDocstring('RandomForestClassifier', mockColumns, 'customers.csv');
      expect(rfHover).not.toBeNull();
      expect(rfHover?.contents.join('\n')).toContain('scikit-learn 1.9.0');
      expect(rfHover?.contents.join('\n')).toContain('RandomForestClassifier');

      const ssHover = getHoverDocstring('StandardScaler', mockColumns, 'customers.csv');
      expect(ssHover).not.toBeNull();
      expect(ssHover?.contents.join('\n')).toContain('StandardScaler');

      const ttsHover = getHoverDocstring('train_test_split', mockColumns, 'customers.csv');
      expect(ttsHover).not.toBeNull();
      expect(ttsHover?.contents.join('\n')).toContain('test_size');
    });

    it('returns dataset column hover info for columns in the active schema', () => {
      const colHover = getHoverDocstring('age', mockColumns, 'customers.csv');
      expect(colHover).not.toBeNull();
      expect(colHover?.contents.join('\n')).toContain('customers.csv');
      expect(colHover?.contents.join('\n')).toContain('integer');
    });

    it('returns null hover docstring for unrecognized keywords', () => {
      const unknown = getHoverDocstring('random_unrelated_variable', mockColumns);
      expect(unknown).toBeNull();
    });

    it('provides accurate signature help for functions with active parameter detection', () => {
      const ttsSig = getSignatureHelp('train_test_split(X, y, ', 23);
      expect(ttsSig).not.toBeNull();
      expect(ttsSig?.signature.label).toContain('train_test_split');
      expect(ttsSig?.signature.parameters.length).toBeGreaterThan(2);
      expect(ttsSig?.activeParameter).toBe(2);

      const rfSig = getSignatureHelp('RandomForestClassifier(n_estimators=100, ', 41);
      expect(rfSig).not.toBeNull();
      expect(rfSig?.signature.label).toContain('RandomForestClassifier');
      expect(rfSig?.activeParameter).toBe(1);
    });
  });

  /* ── 5.3 Working Snippet Set & Educational Guidance ─────────────────────── */
  describe('5.3 Small Snippet Set with Working Code and Learning Explanations', () => {
    it('provides all 5 core ML snippets required by the Phase 5 spec', () => {
      const snippetIds = ML_SNIPPETS.map((s) => s.id);
      expect(snippetIds).toContain('train-test-split');
      expect(snippetIds).toContain('ml-pipeline');
      expect(snippetIds).toContain('cross-validation');
      expect(snippetIds).toContain('confusion-matrix');
      expect(snippetIds).toContain('feature-importance');
    });

    it('ensures each snippet includes working executable code and learning explanation', () => {
      ML_SNIPPETS.forEach((s) => {
        expect(s.title).toBeTruthy();
        expect(s.insertText).toBeTruthy();
        expect(s.learningExplanation).toBeTruthy();
        // Snippet code must import from standard libraries or perform the operation cleanly
        expect(s.insertText).toMatch(/(import|train_test_split|Pipeline|cross_val_score|confusion_matrix|feature_importances_)/);
      });
    });
  });

  /* ── 5.4 Learning-Layer Checks UI & Problem Badges ──────────────────────── */
  describe('5.4 Learning-Layer Checks & Separate Problem Source Badging', () => {
    it('renders separate "ML Playground checks" badge in Problems tab when AST audit finds data leakage', async () => {
      render(
        <TestWrapper>
          <ViewAsCodeStudio />
        </TestWrapper>
      );

      // Wait for debounced LearningService.auditCode to run
      await waitFor(() => {
        expect(LearningService.auditCode).toHaveBeenCalled();
      });

      // Switch to Problems tab via status bar
      const problemsTabBtn = screen.getByTestId('status-bar-problems-btn');
      fireEvent.click(problemsTabBtn);

      // Ensure problem is rendered
      await waitFor(() => {
        expect(screen.getByText(/Data Leakage Detected/i)).toBeInTheDocument();
      });

      // Verify the badge is labeled distinctly "ML Playground checks"
      const badges = screen.getAllByTestId(/problem-source-badge-/i);
      expect(badges.length).toBeGreaterThan(0);
      const mlCheckBadge = badges.find((b) => b.textContent?.includes('ML Playground checks'));
      expect(mlCheckBadge).toBeDefined();
      expect(mlCheckBadge?.textContent).toContain('🎓 ML Playground checks');
    });
  });

  /* ── 5.5 Copilot Explain & Fix Actions with Diff Review Modal ───────────── */
  describe('5.5 Copilot Explain and Fix Actions with Explicit Diff Review Modal', () => {
    it('triggers Copilot Explain message when Explain button is clicked', async () => {
      render(
        <TestWrapper>
          <ViewAsCodeStudio />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(LearningService.auditCode).toHaveBeenCalled();
      });

      const problemsTabBtn = screen.getByTestId('status-bar-problems-btn');
      fireEvent.click(problemsTabBtn);

      await waitFor(() => {
        expect(screen.getAllByTestId(/copilot-explain-btn-/i).length).toBeGreaterThan(0);
      });

      const explainBtn = screen.getAllByTestId(/copilot-explain-btn-/i)[0];
      fireEvent.click(explainBtn);

      await waitFor(() => {
        expect(CopilotApiService.chat).toHaveBeenCalledWith(
          expect.objectContaining({
            prompt: expect.stringMatching(/Please explain this issue:/),
          })
        );
      });
    });

    it('triggers Copilot Fix message and opens side-by-side RegenerateDiffModal for user acceptance', async () => {
      render(
        <TestWrapper>
          <ViewAsCodeStudio />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(LearningService.auditCode).toHaveBeenCalled();
      });

      const problemsTabBtn = screen.getByTestId('status-bar-problems-btn');
      fireEvent.click(problemsTabBtn);

      await waitFor(() => {
        expect(screen.getAllByTestId(/copilot-fix-btn-/i).length).toBeGreaterThan(0);
      });

      const fixBtn = screen.getAllByTestId(/copilot-fix-btn-/i)[0];
      fireEvent.click(fixBtn);

      await waitFor(() => {
        expect(CopilotApiService.chat).toHaveBeenCalledWith(
          expect.objectContaining({
            prompt: expect.stringMatching(/Please fix this problem in my code:/),
          })
        );
      });

      // Confirm side-by-side Diff modal appears with Candidate Code for user review
      await waitFor(() => {
        expect(screen.getByText(/Review Pipeline Code Diff/i)).toBeInTheDocument();
        expect(screen.getByText(/Accept & Replace Code/i)).toBeInTheDocument();
      });
    });
  });
});
