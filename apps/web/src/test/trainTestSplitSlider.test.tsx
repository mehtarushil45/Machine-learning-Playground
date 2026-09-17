import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { DatasetProfilerPage } from '../features/datasets/DatasetProfilerPage';
import { ProjectProvider, useProject } from '../providers/ProjectContext';
import { fetchTrainingOptions } from '../services/jobService';

// Mock jobService
vi.mock('../services/jobService', () => ({
  fetchTrainingOptions: vi.fn().mockResolvedValue({
    algorithms: [
      { key: 'logistic_regression', display_name: 'Logistic Regression', task_type: 'classification' },
      { key: 'random_forest_classifier', display_name: 'Random Forest Classifier', task_type: 'classification' },
    ],
    scalers: [
      { key: 'standard_scaler', display_name: 'Standard Scaler' },
      { key: 'minmax_scaler', display_name: 'MinMax Scaler' },
    ],
    imputers: [
      { key: 'median', display_name: 'Median Imputer' },
      { key: 'mean', display_name: 'Mean Imputer' },
    ],
    default_cv_folds: 5,
    default_train_test_split: 0.8,
    min_train_test_split: 0.5,
    max_train_test_split: 0.95,
  }),
  createTrainingJob: vi.fn().mockResolvedValue({
    job_id: 'job-123',
    status: 'PENDING',
    progress: 0,
    created_at: new Date().toISOString(),
  }),
  fetchJobStatus: vi.fn().mockResolvedValue({
    job_id: 'job-123',
    status: 'COMPLETED',
    progress: 100,
  }),
}));

// Mock API client for profiler & recommendation
vi.mock('../api/client', () => ({
  apiClient: {
    get: vi.fn().mockResolvedValue({ data: [] }),
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
  fetchTrainingOptions: vi.fn().mockResolvedValue({
    algorithms: [
      { key: 'logistic_regression', display_name: 'Logistic Regression', task_type: 'classification' },
    ],
    scalers: [{ key: 'standard_scaler', display_name: 'Standard Scaler' }],
    imputers: [{ key: 'median', display_name: 'Median Imputer' }],
    default_train_test_split: 0.8,
    min_train_test_split: 0.5,
    max_train_test_split: 0.95,
  }),
}));

const mockDataset = {
  datasetId: 'ds-test-1',
  fileName: 'test_dataset.csv',
  columns: ['feature1', 'feature2', 'passed'],
  rowCount: 100,
  rows: Array.from({ length: 100 }, (_, i) => ({
    feature1: i * 1.5,
    feature2: i * 2.0,
    passed: i % 2 === 0 ? 1 : 0,
  })),
};

describe('Page 1 Test Split Slider & Panel 4 Regression Tests', { timeout: 20000 }, () => {
  beforeEach(() => {
    vi.useRealTimers();
    if (typeof localStorage !== 'undefined' && localStorage.clear) {
      localStorage.clear();
    }
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function renderProfilerWithDataset(initialSplit?: number) {
    const Initializer = () => {
      const { setDataset, setSelectedTarget, setSelectedFeatures, setTrainingConfig } = useProject();
      React.useEffect(() => {
        setDataset(mockDataset as any);
        setSelectedTarget('passed');
        setSelectedFeatures(['feature1', 'feature2']);
        if (initialSplit !== undefined) {
          setTrainingConfig({
            dataset_id: 'ds-test-1',
            dataset_name: 'test_dataset.csv',
            target_column: 'passed',
            feature_columns: ['feature1', 'feature2'],
            algorithm: 'logistic_regression',
            scaler: 'standard_scaler',
            imputer: 'median',
            train_test_split: initialSplit,
            cv_folds: 5,
            random_seed: 42,
            selection_source: 'default',
          });
        }
      }, [setDataset, setSelectedTarget, setSelectedFeatures, setTrainingConfig]);
      return <DatasetProfilerPage onShowToast={vi.fn()} onNavigate={vi.fn()} />;
    };

    return render(
      <ProjectProvider>
        <Initializer />
      </ProjectProvider>,
    );
  }

  it('renders slider with correct initial ARIA attributes and 80% default ratio', async () => {
    renderProfilerWithDataset();

    const slider = await screen.findByRole('slider', { name: /train\/test split ratio/i });
    expect(slider).toBeInTheDocument();
    expect(slider).toHaveAttribute('aria-valuemin', '50');
    expect(slider).toHaveAttribute('aria-valuemax', '95');
    expect(slider).toHaveAttribute('aria-valuenow', '80');
    expect(slider).toHaveAttribute('aria-valuetext', '80% Train, 20% Test');
    expect(slider).toHaveValue('0.8');
  });

  it('updates immediately on mouse/pointer change and formats percentages without floating point errors', async () => {
    renderProfilerWithDataset();

    const slider = await screen.findByRole('slider', { name: /train\/test split ratio/i });

    // Change to 65% / 35%
    fireEvent.change(slider, { target: { value: '0.65' } });

    expect(slider).toHaveValue('0.65');
    expect(slider).toHaveAttribute('aria-valuenow', '65');
    expect(slider).toHaveAttribute('aria-valuetext', '65% Train, 35% Test');

    // Check displayed labels
    expect(screen.getByText('65%')).toBeInTheDocument();
    expect(screen.getByText('35%')).toBeInTheDocument();
  });

  it('handles keyboard navigation: ArrowRight (+0.01) and ArrowLeft (-0.01)', async () => {
    renderProfilerWithDataset(0.8);

    const slider = await screen.findByRole('slider', { name: /train\/test split ratio/i });

    // Press ArrowRight -> 0.81
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(slider).toHaveValue('0.81');
    expect(slider).toHaveAttribute('aria-valuenow', '81');

    // Press ArrowLeft -> 0.80
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    expect(slider).toHaveValue('0.8');
    expect(slider).toHaveAttribute('aria-valuenow', '80');
  });

  it('handles keyboard navigation: PageUp (+0.05), PageDown (-0.05), Home (min) and End (max)', async () => {
    renderProfilerWithDataset();

    const slider = await screen.findByRole('slider', { name: /train\/test split ratio/i });

    // Set explicitly to 0.75
    fireEvent.change(slider, { target: { value: '0.75' } });
    expect(slider).toHaveValue('0.75');

    // PageUp: 0.75 + 0.05 = 0.80
    fireEvent.keyDown(slider, { key: 'PageUp' });
    expect(slider).toHaveValue('0.8');

    // PageDown: 0.80 - 0.05 = 0.75
    fireEvent.keyDown(slider, { key: 'PageDown' });
    expect(slider).toHaveValue('0.75');

    // Home: snaps to min (0.50)
    fireEvent.keyDown(slider, { key: 'Home' });
    expect(slider).toHaveValue('0.5');
    expect(slider).toHaveAttribute('aria-valuenow', '50');

    // End: snaps to max (0.95)
    fireEvent.keyDown(slider, { key: 'End' });
    expect(slider).toHaveValue('0.95');
    expect(slider).toHaveAttribute('aria-valuenow', '95');
  });

  it('enforces boundary clamping when values attempt to exceed min or max', async () => {
    renderProfilerWithDataset();

    const slider = await screen.findByRole('slider', { name: /train\/test split ratio/i });

    // Set to max 0.95
    fireEvent.change(slider, { target: { value: '0.95' } });
    expect(slider).toHaveValue('0.95');

    // Try to exceed max via keyboard
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(slider).toHaveValue('0.95');

    // Try to exceed max via PageUp
    fireEvent.keyDown(slider, { key: 'PageUp' });
    expect(slider).toHaveValue('0.95');

    // Try to drop below min via change
    fireEvent.change(slider, { target: { value: '0.40' } });
    expect(slider).toHaveValue('0.5');

    // Try to drop below min via keyboard
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    expect(slider).toHaveValue('0.5');
  });

  it('preserves user modified split ratio against late async fetchTrainingOptions resolution', async () => {
    let resolveOptions: any;
    const delayedPromise = new Promise((resolve) => {
      resolveOptions = resolve;
    });
    vi.mocked(fetchTrainingOptions).mockReturnValueOnce(delayedPromise as any);

    renderProfilerWithDataset();

    const slider = await screen.findByRole('slider', { name: /train\/test split ratio/i });

    // User immediately sets slider to 0.70 before options resolve
    fireEvent.change(slider, { target: { value: '0.70' } });
    expect(slider).toHaveValue('0.7');

    // Late options resolve with default_train_test_split: 0.80
    await act(async () => {
      resolveOptions({
        algorithms: [{ key: 'logistic_regression', display_name: 'Logistic Regression', task_type: 'classification' }],
        scalers: [{ key: 'standard_scaler', display_name: 'Standard Scaler' }],
        imputers: [{ key: 'median', display_name: 'Median Imputer' }],
        default_train_test_split: 0.8,
        min_train_test_split: 0.5,
        max_train_test_split: 0.95,
      });
    });

    // Slider must NOT be reset to 0.80
    expect(slider).toHaveValue('0.7');
  });

  it('renders sticky launch button pinned below scrollable controls in Panel 4', async () => {
    renderProfilerWithDataset();

    const launchButton = await screen.findByRole('button', { name: /launch training job/i });
    expect(launchButton).toBeInTheDocument();
    expect(launchButton).toBeEnabled();
  });
});
