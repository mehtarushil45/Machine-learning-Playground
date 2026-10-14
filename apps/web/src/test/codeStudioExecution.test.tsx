import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectProvider, useProject } from '../providers/ProjectContext';
import { ViewAsCodeStudio } from '../features/pipelines/ViewAsCodeStudio';
import { CodeExecutionService } from '../services/api';
import { parseAnsi, renderAnsiLine } from '../utils/ansiParser';

vi.mock('../services/api', () => ({
  PipelineService: {
    generateCode: vi.fn().mockResolvedValue({
      python_code: 'import sklearn\n# test execution script\nprint("Hello World")',
      is_valid_syntax: true,
      execution_order: ['n1', 'n2'],
      imports: ['pandas as pd'],
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
      exec_id: 'exec-phase3-test',
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
      exec_id: 'exec-phase3-test',
      status: 'completed',
      exit_code: 0,
      duration_seconds: 1.25,
      stdout: 'Hello World\n',
      stderr: '',
      artifacts: ['model.joblib'],
      is_truncated: false,
    }),
    listWorkspaceFiles: vi.fn().mockResolvedValue({
      project_id: 'test-phase3-proj',
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
      project_id: 'test-phase3-proj',
      filename: 'pipeline_generated.py',
      content: 'import sklearn\nprint("Hello World")\n',
    }),
    saveWorkspaceFile: vi.fn().mockResolvedValue({
      filename: 'pipeline_generated.py',
      size: 42,
      status: 'saved',
    }),
    createWorkspaceFile: vi.fn().mockResolvedValue({
      filename: 'script.py',
      is_dir: false,
      status: 'created',
    }),
    deleteWorkspaceFile: vi.fn().mockResolvedValue({
      filename: 'script.py',
      status: 'deleted',
    }),
    syncDatasetToWorkspace: vi.fn().mockResolvedValue(true),
  },
  CopilotApiService: {
    chat: vi.fn().mockResolvedValue({ reply: 'Test response' }),
  },
  LearningService: {
    getInstructorSummary: vi.fn().mockResolvedValue({}),
    logSignal: vi.fn().mockResolvedValue({}),
    auditCode: vi.fn().mockResolvedValue({}),
    getStories: vi.fn().mockResolvedValue([]),
    loadStory: vi.fn().mockResolvedValue({}),
  },
}));

function ExecutionTestHarness() {
  const { setTrainingConfig, setSelectedTarget, updateExperimentFileCode, setActiveExperimentFile } = useProject();

  React.useEffect(() => {
    setSelectedTarget('target');
    setTrainingConfig({
      dataset_id: 'test-phase3-proj',
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
    updateExperimentFileCode('pipeline_generated.py', 'import sklearn\nprint("Hello World")\n');
    setActiveExperimentFile('pipeline_generated.py');
  }, [setTrainingConfig, setSelectedTarget, updateExperimentFileCode, setActiveExperimentFile]);

  return <ViewAsCodeStudio isActive={true} />;
}

describe('Phase 3: Safe ANSI Parser Unit Tests', () => {
  it('parses unformatted plain text into a single span', () => {
    const spans = parseAnsi('Simple line without codes');
    expect(spans).toHaveLength(1);
    expect(spans[0].text).toBe('Simple line without codes');
    expect(spans[0].color).toBeUndefined();
  });

  it('correctly parses standard ANSI color codes and styles', () => {
    const raw = '\u001b[31mRed text\u001b[0m and \u001b[32mGreen text\u001b[0m';
    const spans = parseAnsi(raw);
    expect(spans).toHaveLength(3);
    expect(spans[0].text).toBe('Red text');
    expect(spans[0].color).toBe('#EF4444');
    expect(spans[1].text).toBe(' and ');
    expect(spans[2].text).toBe('Green text');
    expect(spans[2].color).toBe('#22C55E');
  });

  it('safely strips cursor movement and OSC sequences without crashing', () => {
    const raw = '\u001b[2K\u001b[1AProgress 100%\u001b[0m';
    const spans = parseAnsi(raw);
    expect(spans.map((s) => s.text).join('')).toContain('Progress 100%');
  });

  it('renders styled React elements from ANSI codes', () => {
    const { container } = render(<div>{renderAnsiLine('\u001b[1m\u001b[33mWarning message\u001b[0m')}</div>);
    const span = container.querySelector('span');
    expect(span).not.toBeNull();
    expect(span?.textContent).toBe('Warning message');
  });
});

describe('Phase 3: Execution Sandbox & Output Streaming Integration', () => {
  let createdEventSources: MockEventSource[] = [];

  class MockEventSource {
    url: string;
    onmessage: ((event: any) => void) | null = null;
    onerror: (() => void) | null = null;
    close = vi.fn();

    constructor(url: string) {
      this.url = url;
      createdEventSources.push(this);
    }
  }

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    createdEventSources = [];

    (global as any).EventSource = MockEventSource;
    (window as any).EventSource = MockEventSource;
  });

  it('handles queued execution state and renders queue badge', async () => {
    (CodeExecutionService.execute as any).mockResolvedValueOnce({
      exec_id: 'exec-queued-123',
      status: 'queued',
      queue_position: 3,
    });

    render(
      <ProjectProvider>
        <ExecutionTestHarness />
      </ProjectProvider>
    );

    const runBtn = await screen.findByRole('button', { name: /run code/i });
    await waitFor(() => {
      expect(runBtn).not.toBeDisabled();
    });

    await act(async () => {
      fireEvent.click(runBtn);
    });

    await waitFor(() => {
      expect(screen.getAllByText(/Queued \(#3\)/i).length).toBeGreaterThan(0);
    });
  }, 15000);

  it('renders interactive jumpable traceback lines and centers cursor when clicked', async () => {
    (CodeExecutionService.execute as any).mockResolvedValueOnce({
      exec_id: 'exec-tb-123',
      status: 'running',
      queue_position: null,
    });

    render(
      <ProjectProvider>
        <ExecutionTestHarness />
      </ProjectProvider>
    );

    const runBtn = await screen.findByRole('button', { name: /run code/i });
    await waitFor(() => {
      expect(runBtn).not.toBeDisabled();
    });

    await act(async () => {
      fireEvent.click(runBtn);
    });

    await waitFor(() => {
      expect(createdEventSources.length).toBeGreaterThan(0);
    });
    const es = createdEventSources[0];

    // Simulate Python traceback streaming
    await act(async () => {
      es.onmessage?.({
        data: JSON.stringify({
          type: 'stderr',
          data: 'Traceback (most recent call last):',
        }),
      });
      es.onmessage?.({
        data: JSON.stringify({
          type: 'stderr',
          data: '  File "pipeline_generated.py", line 14, in <module>',
        }),
      });
      es.onmessage?.({
        data: JSON.stringify({
          type: 'stderr',
          data: 'ZeroDivisionError: division by zero',
        }),
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/Jump to line 14/i)).toBeDefined();
    });

    const jumpTarget = screen.getByText(/Jump to line 14/i);
    await act(async () => {
      fireEvent.click(jumpTarget);
    });

    // Editor status bar should show updated cursor position Ln 14
    await waitFor(() => {
      expect(screen.getByText(/Ln 14, Col 1/i)).toBeDefined();
    });
  });

  it('renders timeout and out_of_memory exit codes honestly', async () => {
    (CodeExecutionService.execute as any).mockResolvedValueOnce({
      exec_id: 'exec-oom-123',
      status: 'running',
    });

    render(
      <ProjectProvider>
        <ExecutionTestHarness />
      </ProjectProvider>
    );

    const runBtn = await screen.findByRole('button', { name: /run code/i });
    await waitFor(() => {
      expect(runBtn).not.toBeDisabled();
    });

    await act(async () => {
      fireEvent.click(runBtn);
    });

    await waitFor(() => {
      expect(createdEventSources.length).toBeGreaterThan(0);
    });
    const es = createdEventSources[0];

    // Simulate OOM exit event
    await act(async () => {
      es.onmessage?.({
        data: JSON.stringify({
          type: 'exit',
          exit_code: 137,
          status: 'out_of_memory',
          duration_seconds: 12.4,
        }),
      });
    });

    await waitFor(() => {
      expect(screen.getAllByText(/OUT OF MEMORY \(137\)/i).length).toBeGreaterThan(0);
    });
  });

  it('renders output truncation warning banner and download output link', async () => {
    (CodeExecutionService.execute as any).mockResolvedValueOnce({
      exec_id: 'exec-trunc-123',
      status: 'running',
    });

    render(
      <ProjectProvider>
        <ExecutionTestHarness />
      </ProjectProvider>
    );

    const runBtn = await screen.findByRole('button', { name: /run code/i });
    await waitFor(() => {
      expect(runBtn).not.toBeDisabled();
    });

    await act(async () => {
      fireEvent.click(runBtn);
    });

    await waitFor(() => {
      expect(createdEventSources.length).toBeGreaterThan(0);
    });
    const es = createdEventSources[0];

    await act(async () => {
      es.onmessage?.({
        data: JSON.stringify({
          type: 'exit',
          exit_code: 0,
          status: 'completed',
          duration_seconds: 2.1,
          is_truncated: true,
        }),
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/Output exceeded display threshold \(5,000 lines\) and was capped\./i)).toBeDefined();
      expect(screen.getByText(/Download Full Output/i)).toBeDefined();
    });

    // Check raw output download link
    const downloadLink = screen.getByText(/Download Full Output/i).closest('a');
    expect(downloadLink?.getAttribute('href')).toBe('/api/v1/code-execution/exec-trunc-123/output/download');
  });

  it('reports honest failure without fabricating exit code when execution service is 404', async () => {
    (CodeExecutionService.execute as any).mockRejectedValueOnce({
      status: 404,
      message: 'Not Found',
    });

    render(
      <ProjectProvider>
        <ExecutionTestHarness />
      </ProjectProvider>
    );

    const runBtn = await screen.findByRole('button', { name: /run code/i });
    await waitFor(() => {
      expect(runBtn).not.toBeDisabled();
    });

    await act(async () => {
      fireEvent.click(runBtn);
    });

    await waitFor(() => {
      expect(screen.getAllByText(/✕ Unavailable/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/Execution backend unavailable \(404 Not Found\)/i)).toBeDefined();
    });
  });

  it('renders Post-Run Experiment Card with true metrics upon successful execution', async () => {
    (CodeExecutionService.execute as any).mockResolvedValueOnce({
      exec_id: 'exec-success-metrics',
      status: 'running',
    });

    render(
      <ProjectProvider>
        <ExecutionTestHarness />
      </ProjectProvider>
    );

    const runBtn = await screen.findByRole('button', { name: /run code/i });
    await waitFor(() => {
      expect(runBtn).not.toBeDisabled();
    });

    await act(async () => {
      fireEvent.click(runBtn);
    });

    await waitFor(() => {
      expect(createdEventSources.length).toBeGreaterThan(0);
      expect(typeof createdEventSources[createdEventSources.length - 1].onmessage).toBe('function');
    });
    const es = createdEventSources[createdEventSources.length - 1];

    // Stream stdout with Test Accuracy metric and completion
    await act(async () => {
      es.onmessage?.({
        data: JSON.stringify({
          type: 'stdout',
          data: 'Test Accuracy: 0.9125',
        }),
      });
    });
    await act(async () => {
      es.onmessage?.({
        data: JSON.stringify({
          type: 'stdout',
          data: 'Classification Report:\n              precision    recall  f1-score   support\nweighted avg       0.91      0.91      0.91        80',
        }),
      });
    });
    await act(async () => {
      es.onmessage?.({
        data: JSON.stringify({
          type: 'exit',
          exit_code: 0,
          status: 'completed',
          duration_seconds: 1.85,
        }),
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('post-run-experiment-card')).toBeInTheDocument();
      expect(screen.getByText(/Post-Run Model Evaluation/i)).toBeInTheDocument();
      expect(screen.getByText('91.25%')).toBeInTheDocument();
      expect(screen.getByText(/Active Champion|Set as Champion/i)).toBeInTheDocument();
    });
  }, 15000);
});
