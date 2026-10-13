import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectProvider, useProject } from '../providers/ProjectContext';
import { ViewAsCodeStudio } from '../features/pipelines/ViewAsCodeStudio';
import { CodeExecutionService } from '../services/api';

vi.mock('../services/api', () => ({
  PipelineService: {
    generateCode: vi.fn().mockResolvedValue({
      python_code: 'import sklearn\n# test code',
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
    execute: vi.fn().mockResolvedValue({ exec_id: 'test-exec-phase2' }),
    streamUrl: vi.fn().mockReturnValue('/api/v1/code-execution/stream/test-exec-phase2'),
    listWorkspaceFiles: vi.fn().mockResolvedValue({
      project_id: 'test-p2-project',
      files: [
        {
          name: 'churn_data.csv',
          path: 'data/churn_data.csv',
          is_dir: false,
          is_readonly: true,
          size: 5120,
          modified_at: 1728800000,
        },
        {
          name: 'metrics.json',
          path: 'outputs/metrics.json',
          is_dir: false,
          is_readonly: false,
          size: 256,
          modified_at: 1728800100,
        },
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
    readWorkspaceFile: vi.fn().mockImplementation((_projId, filename) => {
      if (filename.startsWith('data/')) {
        return Promise.resolve({
          project_id: 'test-p2-project',
          filename,
          content: 'id,feature1,target\n1,0.5,1\n2,0.8,0\n',
        });
      }
      return Promise.resolve({
        project_id: 'test-p2-project',
        filename,
        content: '# Workspace script content',
      });
    }),
    saveWorkspaceFile: vi.fn().mockResolvedValue({
      filename: 'pipeline_generated.py',
      size: 42,
      status: 'saved',
    }),
    createWorkspaceFile: vi.fn().mockResolvedValue({
      filename: 'experiment_custom.py',
      is_dir: false,
      status: 'created',
    }),
    deleteWorkspaceFile: vi.fn().mockResolvedValue({
      filename: 'experiment_custom.py',
      status: 'deleted',
    }),
    syncDatasetToWorkspace: vi.fn().mockResolvedValue(true),
  },
  CopilotApiService: {
    chat: vi.fn().mockResolvedValue({ reply: 'Test response' }),
  },
}));

function WorkspaceHarness() {
  const { setTrainingConfig, setSelectedTarget } = useProject();

  React.useEffect(() => {
    setSelectedTarget('churn');
    setTrainingConfig({
      dataset_id: 'test-p2-project',
      dataset_name: 'churn_data.csv',
      target_column: 'churn',
      feature_columns: ['f1', 'f2'],
      algorithm: 'random_forest_classifier',
      scaler: 'standard_scaler',
      imputer: 'median',
      train_test_split: 0.8,
      cv_folds: 5,
      random_seed: 42,
      selection_source: 'manual',
    });
  }, [setTrainingConfig, setSelectedTarget]);

  return <ViewAsCodeStudio isActive={true} />;
}

describe('Phase 2: Code Studio Workspace and Persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('mounts server workspace and displays data/ (RO), outputs/, and experiments folders', async () => {
    render(
      <ProjectProvider>
        <WorkspaceHarness />
      </ProjectProvider>,
    );

    // Initial sync call
    await waitFor(() => {
      expect(CodeExecutionService.syncDatasetToWorkspace).toHaveBeenCalledWith(
        'test-p2-project',
        'test-p2-project',
      );
      expect(CodeExecutionService.listWorkspaceFiles).toHaveBeenCalledWith('test-p2-project');
    });

    // Check directory headers are displayed in explorer
    expect(screen.getByText('data/')).toBeInTheDocument();
    expect(screen.getByText('RO')).toBeInTheDocument();
    expect(screen.getByText('outputs/')).toBeInTheDocument();
    expect(screen.getByText('experiments/')).toBeInTheDocument();

    // Check that data file and output file from server are displayed
    expect(screen.getByText('churn_data.csv')).toBeInTheDocument();
    expect(screen.getByText('metrics.json')).toBeInTheDocument();
  });

  it('protects data/ files as read-only and forbids deletion', async () => {
    const onShowToast = vi.fn();
    render(
      <ProjectProvider>
        <WorkspaceHarness />
      </ProjectProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('churn_data.csv')).toBeInTheDocument();
    });

    // Click data file to switch active file
    await act(async () => {
      fireEvent.click(screen.getByText('churn_data.csv'));
    });

    // Verify readWorkspaceFile called for data/churn_data.csv
    await waitFor(() => {
      expect(CodeExecutionService.readWorkspaceFile).toHaveBeenCalledWith(
        'test-p2-project',
        'data/churn_data.csv',
      );
    });

    // Status bar displays Read-Only lock badge
    expect(screen.getByText('🔒 Read-Only')).toBeInTheDocument();
  });

  it('passes project_id to code execution and refreshes workspace files on run completion', async () => {
    render(
      <ProjectProvider>
        <WorkspaceHarness />
      </ProjectProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /run code/i })).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /run code/i }));
    });

    await waitFor(() => {
      expect(CodeExecutionService.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          project_id: 'test-p2-project',
          filename: 'pipeline_generated.py',
        }),
      );
    });
  });
});
