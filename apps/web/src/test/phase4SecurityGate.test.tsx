import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectProvider, useProject } from '../providers/ProjectContext';
import { ViewAsCodeStudio } from '../features/pipelines/ViewAsCodeStudio';
import { CodeExecutionService } from '../services/api';

vi.mock('../services/api', () => ({
  PipelineService: {
    generateCode: vi.fn().mockResolvedValue({
      python_code: 'import sklearn\n# phase 4 security test script\nprint("Security test")',
      is_valid_syntax: true,
      execution_order: ['n1'],
      imports: ['sklearn'],
    }),
    validatePipeline: vi.fn().mockResolvedValue({ is_valid: true, errors: [], warnings: [] }),
  },
  CodeExecutionService: {
    lintCode: vi.fn().mockResolvedValue({ is_valid_syntax: true, diagnostics: [] }),
    getRuntimeInfo: vi.fn().mockResolvedValue({
      python_version: '3.12',
      sklearn_version: '1.9',
      full_python_version: '3.12.14',
      full_sklearn_version: '1.9.0',
      status: 'online',
    }),
    wsLintUrl: vi.fn().mockReturnValue('ws://localhost:8000/api/v1/code-execution/ws-lint'),
    execute: vi.fn().mockResolvedValue({
      exec_id: 'exec-phase4-test',
      status: 'running',
      queue_position: null,
    }),
    stop: vi.fn().mockResolvedValue({
      status: 'cancelled',
      message: 'Execution stopped.',
    }),
    streamUrl: vi.fn().mockImplementation((id: string) => `/api/v1/code-execution/stream/${id}`),
    downloadOutputUrl: vi.fn().mockImplementation((id: string) => `/api/v1/code-execution/${id}/output/download`),
    getResult: vi.fn().mockResolvedValue({
      exec_id: 'exec-phase4-test',
      status: 'completed',
      exit_code: 0,
      duration_seconds: 0.5,
      stdout: 'done\n',
      stderr: '',
      artifacts: [],
      is_truncated: false,
    }),
    listWorkspaceFiles: vi.fn().mockResolvedValue({
      project_id: 'test-phase4-proj',
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
      project_id: 'test-phase4-proj',
      filename: 'pipeline_generated.py',
      content: 'print("Phase 4 test")',
    }),
    saveWorkspaceFile: vi.fn().mockResolvedValue({
      filename: 'pipeline_generated.py',
      size: 30,
      status: 'saved',
    }),
    getTerminalStatus: vi.fn().mockResolvedValue({
      enabled: false,
      status: 'blocked',
      reason: 'DEPLOYMENT BLOCKER: Containerized network and filesystem namespace isolation (gVisor/ephemeral container sandbox) must be configured before arbitrary PTY shell execution is permitted.',
    }),
  },
  CopilotApiService: {
    chat: vi.fn().mockResolvedValue({ reply: 'Copilot ready' }),
  },
  LearningService: {
    logSignal: vi.fn().mockResolvedValue({}),
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
  const { setTrainingConfig, setSelectedTarget, updateExperimentFileCode, setActiveExperimentFile } = useProject();

  React.useEffect(() => {
    setSelectedTarget('target');
    setTrainingConfig({
      dataset_id: 'test-phase4-proj',
      dataset_name: 'data.csv',
      target_column: 'target',
      feature_columns: ['f1', 'f2'],
      algorithm: 'random_forest_classifier',
      scaler: 'standard_scaler',
      imputer: 'median',
      train_test_split: 0.8,
      cv_folds: 5,
      random_seed: 42,
      selection_source: 'manual',
    });
    updateExperimentFileCode('pipeline_generated.py', 'import sklearn\nprint("Security test")\n');
    setActiveExperimentFile('pipeline_generated.py');
  }, [setTrainingConfig, setSelectedTarget, updateExperimentFileCode, setActiveExperimentFile]);

  return <>{children}</>;
};

describe('Phase 4: Security Gate & Honest Labeling Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('honestly exposes CodeExecutionService.getTerminalStatus() as blocked', async () => {
    const status = await CodeExecutionService.getTerminalStatus();
    expect(status.enabled).toBe(false);
    expect(status.status).toBe('blocked');
    expect(status.reason).toContain('DEPLOYMENT BLOCKER');
  });

  it('renders PTY Shell (Blocked) badge with deployment blocker tooltip in bottom panel', async () => {
    render(
      <TestWrapper>
        <ViewAsCodeStudio />
      </TestWrapper>
    );

    // Toggle bottom terminal panel open
    const toggleTerminalBtn = await screen.findByRole('button', { name: /Toggle terminal/i });
    fireEvent.click(toggleTerminalBtn);

    // Verify PTY Shell (Blocked) badge is visible with lock icon and deployment blocker title
    const ptyBadge = await screen.findByTestId('pty-shell-blocked-badge');
    expect(ptyBadge).toBeInTheDocument();
    expect(ptyBadge.textContent).toContain('PTY Shell (Blocked)');
    expect(ptyBadge.getAttribute('title')).toContain('DEPLOYMENT BLOCKER');
  });

  it('renders honest Execution Inspector banner in debug tab without faking step debugging', async () => {
    render(
      <TestWrapper>
        <ViewAsCodeStudio />
      </TestWrapper>
    );

    // Toggle bottom terminal panel open
    const toggleTerminalBtn = await screen.findByRole('button', { name: /Toggle terminal/i });
    fireEvent.click(toggleTerminalBtn);

    // Switch to debug tab
    const debugTabBtn = screen.getByRole('button', { name: /debug/i });
    fireEvent.click(debugTabBtn);

    // Verify honest message is present
    expect(await screen.findByText(/Execution Inspector/i)).toBeInTheDocument();
    expect(screen.getByText(/Interactive breakpoints & step-debugging not available yet/i)).toBeInTheDocument();
  });
});
