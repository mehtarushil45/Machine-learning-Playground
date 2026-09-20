import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectProvider, useProject } from '../providers/ProjectContext';
import { ViewAsCodeStudio } from '../features/pipelines/ViewAsCodeStudio';
import { PipelineService, type PipelineDAG } from '../services/api';
import type { JobEntity } from '../types/job';

vi.mock('../services/api', () => ({
  PipelineService: {
    generateCode: vi.fn().mockImplementation((dag: PipelineDAG) =>
      Promise.resolve({
        python_code: `# Generated for ${dag.target_column} with algo ${dag.nodes[3]?.params?.algorithm || 'unknown'}`,
        steps_explanation: [],
        is_valid_syntax: true,
        imports: ['import sklearn'],
        generated_at: new Date().toISOString(),
      }),
    ),
    validatePipeline: vi.fn().mockResolvedValue({ is_valid: true, errors: [], warnings: [] }),
    getTemplates: vi.fn().mockResolvedValue({}),
  },
}));

function TestHarness() {
  const {
    experimentFiles,
    openTabs,
    activeExperimentFile,
    createExperimentFile,
    setActiveExperimentFile,
    setActiveJob,
    setTrainingConfig,
    setSelectedTarget,
  } = useProject();

  return (
    <div>
      <div data-testid="active-file">{activeExperimentFile}</div>
      <div data-testid="open-tabs">{openTabs.join(',')}</div>
      <div data-testid="file-count">{Object.keys(experimentFiles).length}</div>
      <button
        data-testid="add-file-btn"
        onClick={() => createExperimentFile('model_rf.py', '# Custom RF Code')}
      >
        Add File
      </button>
      <button
        data-testid="switch-file-btn"
        onClick={() => setActiveExperimentFile('model_rf.py')}
      >
        Switch to RF
      </button>
      <button
        data-testid="launch-job-btn"
        onClick={() => {
          setSelectedTarget('churn');
          setTrainingConfig({
            dataset_id: 'ds-1',
            dataset_name: 'test.csv',
            target_column: 'churn',
            feature_columns: ['f1', 'f2'],
            algorithm: 'xgboost',
            scaler: 'standard_scaler',
            imputer: 'median',
            train_test_split: 0.8,
            cv_folds: 5,
            random_seed: 42,
            selection_source: 'manual',
          });
          const mockJob: JobEntity = {
            job_id: 'job-new-123',
            dataset_id: 'ds-1',
            status: 'RUNNING',
            job_type: 'training',
            algorithm: 'xgboost',
            target_column: 'churn',
            feature_columns: ['f1', 'f2'],
            progress: 0,
            current_stage: 'training',
            retry_count: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          setActiveJob(mockJob);
        }}
      >
        Launch Job
      </button>

      <ViewAsCodeStudio isActive={true} />
    </div>
  );
}

describe('IDE Multi-File Persistence and Synchronization', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('preserves first file when second file is created and switches seamlessly', async () => {
    render(
      <ProjectProvider>
        <TestHarness />
      </ProjectProvider>,
    );

    // Initial state: pipeline_generated.py is present
    expect(screen.getByTestId('active-file').textContent).toBe('pipeline_generated.py');
    expect(screen.getByTestId('open-tabs').textContent).toContain('pipeline_generated.py');

    // Create second file
    act(() => {
      fireEvent.click(screen.getByTestId('add-file-btn'));
    });

    // Both files must be in openTabs and experimentFiles
    expect(screen.getByTestId('file-count').textContent).toBe('2');
    expect(screen.getByTestId('open-tabs').textContent).toContain('pipeline_generated.py');
    expect(screen.getByTestId('open-tabs').textContent).toContain('model_rf.py');
    expect(screen.getByTestId('active-file').textContent).toBe('model_rf.py');
  });

  it('applies Page 1 training launch updates directly to the active second file without overwriting first file', async () => {
    render(
      <ProjectProvider>
        <TestHarness />
      </ProjectProvider>,
    );

    // Create and switch to second file
    act(() => {
      fireEvent.click(screen.getByTestId('add-file-btn'));
    });

    expect(screen.getByTestId('active-file').textContent).toBe('model_rf.py');

    // Launch a training job (simulating Page 1 Launch Training Job)
    await act(async () => {
      fireEvent.click(screen.getByTestId('launch-job-btn'));
    });

    await waitFor(() => {
      expect(PipelineService.generateCode).toHaveBeenCalled();
    });

    // Both files must still be present
    expect(screen.getByTestId('file-count').textContent).toBe('2');
    expect(screen.getByTestId('open-tabs').textContent).toContain('pipeline_generated.py');
    expect(screen.getByTestId('open-tabs').textContent).toContain('model_rf.py');
  });
});
