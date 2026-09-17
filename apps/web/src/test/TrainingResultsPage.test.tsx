import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TrainingResultsPage } from '../features/jobs/TrainingResultsPage';
import { ProjectProvider, useProject } from '../providers/ProjectContext';
import type { JobEntity } from '../types/job';
import type { Dataset } from '../types/dataset';

// Mock jobService functions
vi.mock('../services/jobService', () => ({
  fetchJobDetails: vi.fn().mockResolvedValue(null),
  subscribeToJobProgressSSE: vi.fn().mockReturnValue(() => {}),
  pollJobUntilDone: vi.fn().mockResolvedValue(null),
}));

function createMockJob(overrides: Partial<JobEntity> = {}): JobEntity {
  return {
    job_id: 'job-1234567890',
    dataset_id: 'ds-test',
    status: 'COMPLETED',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    job_type: 'training',
    algorithm: 'logistic_regression',
    target_column: 'target',
    feature_columns: ['feat_a', 'feat_b'],
    progress: 100,
    current_stage: 'Completed',
    retry_count: 0,
    metadata: {},
    ...overrides,
  };
}

describe('TrainingResultsPage (Page 3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders accessible empty state with CTA when no active job is present', () => {
    const onNavigate = vi.fn();
    render(
      <ProjectProvider>
        <TrainingResultsPage onNavigate={onNavigate} />
      </ProjectProvider>
    );

    expect(screen.getByText('No Training Run Yet')).toBeInTheDocument();
    expect(screen.getByText(/Go to Dataset Setup, configure your model/i)).toBeInTheDocument();

    const ctaButton = screen.getByRole('button', { name: /Go to Dataset Setup/i });
    expect(ctaButton).toBeInTheDocument();
    fireEvent.click(ctaButton);
    expect(onNavigate).toHaveBeenCalledWith('workspace');
  });

  it('renders running progress state when job status is RUNNING', () => {
    const runningJob = createMockJob({
      status: 'RUNNING',
      progress: 65,
      current_stage: 'Fitting estimator...',
    });

    const Initializer = () => {
      const { setActiveJob } = useProject();
      React.useEffect(() => {
        setActiveJob(runningJob);
      }, [setActiveJob]);
      return <TrainingResultsPage onNavigate={vi.fn()} />;
    };

    render(
      <ProjectProvider>
        <Initializer />
      </ProjectProvider>
    );

    expect(screen.getByText('Training in Progress')).toBeInTheDocument();
    expect(screen.getByText('65%')).toBeInTheDocument();
    expect(screen.getByText(/Fitting estimator\.\.\./i)).toBeInTheDocument();
    expect(screen.getByText('Running')).toBeInTheDocument();
  });

  it('renders failed state with error message when job status is FAILED', () => {
    const failedJob = createMockJob({
      status: 'FAILED',
      progress: 0,
      current_stage: 'Error encountered',
      error_message: 'Target column contains only a single unique class.',
    });

    const Initializer = () => {
      const { setActiveJob } = useProject();
      React.useEffect(() => {
        setActiveJob(failedJob);
      }, [setActiveJob]);
      return <TrainingResultsPage onNavigate={vi.fn()} />;
    };

    render(
      <ProjectProvider>
        <Initializer />
      </ProjectProvider>
    );

    expect(screen.getByText('Training Failed')).toBeInTheDocument();
    expect(screen.getByText('Target column contains only a single unique class.')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });

  it('formats classification metrics as percentages and displays honest interpretation', () => {
    const completedJob = createMockJob({
      target_column: 'passed',
      feature_columns: ['score', 'hours'],
      algorithm: 'logistic_regression',
      started_at: new Date(Date.now() - 12000).toISOString(),
      completed_at: new Date().toISOString(),
      metadata: {
        metrics: {
          accuracy: 0.875,
          f1_score: 0.857,
          precision: 0.88,
          recall: 0.835,
        },
        scaler: 'standard_scaler',
        imputer: 'mean',
        cross_validation: 5,
        random_seed: 42,
      },
    });

    const mockDataset: Dataset = {
      fileName: 'student_grades.csv',
      columns: ['score', 'hours', 'passed'],
      rows: Array(100).fill({ score: 90, hours: 5, passed: 1 }),
      rowCount: 100,
    };

    const Initializer = () => {
      const { setActiveJob, setDataset, setTrainingConfig } = useProject();
      React.useEffect(() => {
        setActiveJob(completedJob);
        setTrainingConfig({
          dataset_id: 'ds-test',
          dataset_name: 'student_grades.csv',
          target_column: 'passed',
          feature_columns: ['score', 'hours'],
          algorithm: 'logistic_regression',
          scaler: 'standard_scaler',
          imputer: 'mean',
          train_test_split: 0.8,
          cv_folds: 5,
          random_seed: 42,
          selection_source: 'manual',
        });
        setDataset(mockDataset);
      }, [setActiveJob, setDataset, setTrainingConfig]);
      return <TrainingResultsPage onNavigate={vi.fn()} />;
    };

    render(
      <ProjectProvider>
        <Initializer />
      </ProjectProvider>
    );

    // Primary metric is Accuracy (appears in hero and grid)
    expect(screen.getAllByText('Accuracy').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('87.5')).toBeInTheDocument(); // in hero ring

    // Grid metrics formatted as percentages
    expect(screen.getByText('87.50%')).toBeInTheDocument();
    expect(screen.getByText('85.70%')).toBeInTheDocument();

    // Honest guidance: warns about overfitting / class imbalance instead of claiming "high quality"
    expect(screen.getByText(/Evaluate for overfitting and class imbalance before concluding quality\./i)).toBeInTheDocument();

    // Run configuration displayed from job.metadata
    expect(screen.getByText('standard scaler')).toBeInTheDocument();
    expect(screen.getByText('mean')).toBeInTheDocument();
    expect(screen.getByText('5-fold')).toBeInTheDocument();
    expect(screen.getByText('student_grades.csv')).toBeInTheDocument();
  });

  it('formats regression error metrics as raw floats without percentage signs', () => {
    const regressionJob = createMockJob({
      target_column: 'target_value',
      feature_columns: ['x1', 'x2'],
      algorithm: 'linear_regression',
      metadata: {
        metrics: {
          mae: 0.00392,
          rmse: 0.00481,
          r2_score: 0.985,
        },
        scaler: 'standard_scaler',
        imputer: 'median',
      },
    });

    const mockDataset: Dataset = {
      fileName: 'housing_prices.csv',
      columns: ['x1', 'x2', 'target_value'],
      rows: Array(100).fill({ x1: 1, x2: 2, target_value: 3.5 }),
      rowCount: 100,
    };

    const Initializer = () => {
      const { setActiveJob, setDataset } = useProject();
      React.useEffect(() => {
        setActiveJob(regressionJob);
        setDataset(mockDataset);
      }, [setActiveJob, setDataset]);
      return <TrainingResultsPage onNavigate={vi.fn()} />;
    };

    render(
      <ProjectProvider>
        <Initializer />
      </ProjectProvider>
    );

    // Primary metric is r2_score (appears in hero and grid)
    expect(screen.getAllByText('R2 Score').length).toBeGreaterThanOrEqual(1);

    // Regression metrics formatted as raw floats, NOT with percentage signs
    expect(screen.getByText('0.0039')).toBeInTheDocument();
    expect(screen.getByText('0.0048')).toBeInTheDocument();
    expect(screen.getByText('0.9850')).toBeInTheDocument();

    // Ensure MAE does NOT have % appended
    expect(screen.queryByText('0.0039%')).not.toBeInTheDocument();
  });

  it('displays small dataset warning banner when dataset has fewer than 50 rows', () => {
    const smallJob = createMockJob({
      algorithm: 'linear_regression',
      metadata: {
        metrics: { mae: 0.12 },
      },
    });

    const mockSmallDataset: Dataset = {
      fileName: 'tiny.csv',
      columns: ['x1', 'target'],
      rows: Array(20).fill({ x1: 1, target: 2 }),
      rowCount: 20, // < 50 rows!
    };

    const Initializer = () => {
      const { setActiveJob, setDataset } = useProject();
      React.useEffect(() => {
        setActiveJob(smallJob);
        setDataset(mockSmallDataset);
      }, [setActiveJob, setDataset]);
      return <TrainingResultsPage onNavigate={vi.fn()} />;
    };

    render(
      <ProjectProvider>
        <Initializer />
      </ProjectProvider>
    );

    expect(screen.getByText('Evaluation may be unreliable')).toBeInTheDocument();
    expect(screen.getByText(/Very small dataset \(20 rows\)\. Metrics may be unstable/i)).toBeInTheDocument();
  });

  it('handles invalid or NaN metric values gracefully with N/A', () => {
    const nanJob = createMockJob({
      algorithm: 'logistic_regression',
      metadata: {
        metrics: {
          accuracy: 0.8,
          auc: NaN,
        },
      },
    });

    const Initializer = () => {
      const { setActiveJob } = useProject();
      React.useEffect(() => {
        setActiveJob(nanJob);
      }, [setActiveJob]);
      return <TrainingResultsPage onNavigate={vi.fn()} />;
    };

    render(
      <ProjectProvider>
        <Initializer />
      </ProjectProvider>
    );

    expect(screen.getByText('N/A')).toBeInTheDocument();
    expect(screen.getByText('Not available for this evaluation')).toBeInTheDocument();
  });
});
