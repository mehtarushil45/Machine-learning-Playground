import { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AlgorithmRecommendationPanel } from '../features/datasets/AlgorithmRecommendationPanel';
import * as recommendationService from '../services/recommendationService';
import type { Dataset } from '../types/dataset';
import type { RecommendationJobDetail } from '../types/recommendation';
import { ApiError } from '../services/apiClient';

vi.mock('../services/recommendationService', () => ({
  startRecommendation: vi.fn(),
  getRecommendationJob: vi.fn(),
  cancelRecommendation: vi.fn(),
  fetchSupportedAlgorithms: vi.fn(),
  fetchDatasetRecommendations: vi.fn(),
}));

const mockDataset: Dataset = {
  fileName: 'test.csv',
  datasetId: 'ds-test-123',
  columns: ['feature1', 'feature2', 'target'],
  rows: [
    { feature1: 1, feature2: 2, target: 0 },
    { feature1: 3, feature2: 4, target: 1 },
  ],
  rowCount: 100,
};

function StatefulPanelWrapper({
  initialAlgo = 'random_forest_classifier',
  target = 'target' as string | null,
  features = ['feature1', 'feature2'],
  onSelect = vi.fn(),
  onToast = vi.fn(),
}: {
  initialAlgo?: string;
  target?: string | null;
  features?: string[];
  onSelect?: (a: string) => void;
  onToast?: (t: string, d?: string, type?: 'success' | 'info' | 'error') => void;
}) {
  const [algo, setAlgo] = useState(initialAlgo);
  return (
    <AlgorithmRecommendationPanel
      dataset={mockDataset}
      selectedTarget={target}
      selectedFeatures={features}
      selectedAlgorithm={algo}
      onSelectAlgorithm={(newAlgo) => {
        setAlgo(newAlgo);
        onSelect(newAlgo);
      }}
      cvFolds={5}
      trainTestSplit={0.8}
      onShowToast={onToast}
    />
  );
}

describe('AlgorithmRecommendationPanel Component', () => {
  const onSelectAlgorithm = vi.fn();
  const onShowToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders NO_TARGET state when selectedTarget is null', () => {
    render(
      <AlgorithmRecommendationPanel
        dataset={mockDataset}
        selectedTarget={null}
        selectedFeatures={['feature1', 'feature2']}
        selectedAlgorithm="random_forest_classifier"
        onSelectAlgorithm={onSelectAlgorithm}
        cvFolds={5}
        trainTestSplit={0.8}
        onShowToast={onShowToast}
      />,
    );

    expect(
      screen.getByText(/Select a target column in the Columns table to generate an evidence-based algorithm recommendation/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Analyze & Recommend Algorithms/i })).not.toBeInTheDocument();
  });

  it('renders READY_TO_ANALYZE and disables button if target is included in features or features empty', () => {
    const { rerender } = render(
      <AlgorithmRecommendationPanel
        dataset={mockDataset}
        selectedTarget="target"
        selectedFeatures={[]}
        selectedAlgorithm="random_forest_classifier"
        onSelectAlgorithm={onSelectAlgorithm}
        cvFolds={5}
        trainTestSplit={0.8}
        onShowToast={onShowToast}
      />,
    );

    const btn = screen.getByRole('button', { name: /Analyze & Recommend Algorithms/i });
    expect(btn).toBeDisabled();

    // Re-render with target included in features (invalid)
    rerender(
      <AlgorithmRecommendationPanel
        dataset={mockDataset}
        selectedTarget="target"
        selectedFeatures={['feature1', 'target']}
        selectedAlgorithm="random_forest_classifier"
        onSelectAlgorithm={onSelectAlgorithm}
        cvFolds={5}
        trainTestSplit={0.8}
        onShowToast={onShowToast}
      />,
    );

    expect(screen.getByRole('button', { name: /Analyze & Recommend Algorithms/i })).toBeDisabled();

    // Re-render with valid target and separate features
    rerender(
      <AlgorithmRecommendationPanel
        dataset={mockDataset}
        selectedTarget="target"
        selectedFeatures={['feature1', 'feature2']}
        selectedAlgorithm="random_forest_classifier"
        onSelectAlgorithm={onSelectAlgorithm}
        cvFolds={5}
        trainTestSplit={0.8}
        onShowToast={onShowToast}
      />,
    );

    expect(screen.getByRole('button', { name: /Analyze & Recommend Algorithms/i })).toBeEnabled();
  });

  it('submits recommendation job and handles immediate cache hit', async () => {
    const user = userEvent.setup();
    const mockCompletedJob: RecommendationJobDetail = {
      job_id: 'job-cached-1',
      dataset_id: 'ds-test-123',
      organisation_id: 'org-1',
      status: 'COMPLETED',
      stage: 'Completed',
      progress: 100,
      cache_key: 'cached-key-1',
      recommendation: {
        algorithm_id: 'gradient_boosting_classifier',
        display_name: 'Gradient Boosting',
        category: 'boosting',
        task_type: 'classification',
        score: 0.942,
        score_std: 0.012,
        training_seconds: 1.2,
        status: 'completed',
        reason_codes: ['top_validation_score'],
        warnings: [],
      },
      candidates: [
        {
          algorithm_id: 'gradient_boosting_classifier',
          display_name: 'Gradient Boosting',
          category: 'boosting',
          task_type: 'classification',
          rank: 1,
          score: 0.942,
          score_std: 0.012,
          training_seconds: 1.2,
          status: 'completed',
          reason_codes: ['top_validation_score'],
          warnings: [],
        },
      ],
      warnings: [],
      exclusions: [],
      reason_codes: ['top_validation_score'],
      limitations: [],
      reproducibility: {
        metric: 'roc_auc',
        cv_folds: 5,
        task_type: 'classification',
      },
    };

    vi.mocked(recommendationService.startRecommendation).mockResolvedValueOnce({
      job: mockCompletedJob,
      cached: true,
      deduplicated: false,
    });
    vi.mocked(recommendationService.getRecommendationJob).mockResolvedValue(mockCompletedJob);

    render(
      <StatefulPanelWrapper
        onSelect={onSelectAlgorithm}
        onToast={onShowToast}
      />,
    );

    const btn = screen.getByRole('button', { name: /Analyze & Recommend Algorithms/i });
    await user.click(btn);

    await waitFor(() => {
      expect(recommendationService.startRecommendation).toHaveBeenCalledTimes(1);
      expect(onSelectAlgorithm).toHaveBeenCalledWith('gradient_boosting_classifier');
      expect(screen.getByText('Gradient Boosting')).toBeInTheDocument();
      expect(screen.getByText(/0.942/)).toBeInTheDocument();
      expect(screen.getByText(/Recommended/i)).toBeInTheDocument();
    });
  });

  it('submits job and displays active progress', async () => {
    const user = userEvent.setup();
    const queuedJob: RecommendationJobDetail = {
      job_id: 'job-poll-1',
      dataset_id: 'ds-test-123',
      organisation_id: 'org-1',
      status: 'PROFILING',
      stage: 'Profiling and Validating Dataset',
      progress: 20,
      cache_key: 'cache-1',
      candidates: [],
      warnings: [],
      exclusions: [],
      reason_codes: [],
      limitations: [],
    };

    vi.mocked(recommendationService.startRecommendation).mockResolvedValueOnce({
      job: queuedJob,
      cached: false,
      deduplicated: false,
    });
    vi.mocked(recommendationService.getRecommendationJob).mockResolvedValue(queuedJob);

    render(
      <AlgorithmRecommendationPanel
        dataset={mockDataset}
        selectedTarget="target"
        selectedFeatures={['feature1', 'feature2']}
        selectedAlgorithm="random_forest_classifier"
        onSelectAlgorithm={onSelectAlgorithm}
        cvFolds={5}
        trainTestSplit={0.8}
        onShowToast={onShowToast}
      />,
    );

    const btn = screen.getByRole('button', { name: /Analyze & Recommend Algorithms/i });
    await user.click(btn);

    await waitFor(() => {
      expect(screen.getByText('Profiling and Validating Dataset')).toBeInTheDocument();
      expect(screen.getByText('20%')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Cancel Benchmark/i })).toBeInTheDocument();
    });
  });

  it('allows cooperative cancellation during benchmarking', async () => {
    const user = userEvent.setup();
    const activeJob: RecommendationJobDetail = {
      job_id: 'job-cancel-1',
      dataset_id: 'ds-test-123',
      organisation_id: 'org-1',
      status: 'VERIFYING',
      stage: 'Verifying Top Candidates',
      progress: 70,
      cache_key: 'cache-1',
      candidates: [],
      warnings: [],
      exclusions: [],
      reason_codes: [],
      limitations: [],
    };

    const cancelledJob: RecommendationJobDetail = {
      ...activeJob,
      status: 'CANCELLED',
      stage: 'Cancelled',
      progress: 0,
    };

    vi.mocked(recommendationService.startRecommendation).mockResolvedValueOnce({
      job: activeJob,
      cached: false,
      deduplicated: false,
    });
    vi.mocked(recommendationService.getRecommendationJob).mockResolvedValue(activeJob);

    vi.mocked(recommendationService.cancelRecommendation).mockResolvedValueOnce(cancelledJob);

    render(
      <AlgorithmRecommendationPanel
        dataset={mockDataset}
        selectedTarget="target"
        selectedFeatures={['feature1', 'feature2']}
        selectedAlgorithm="random_forest_classifier"
        onSelectAlgorithm={onSelectAlgorithm}
        cvFolds={5}
        trainTestSplit={0.8}
        onShowToast={onShowToast}
      />,
    );

    const btn = screen.getByRole('button', { name: /Analyze & Recommend Algorithms/i });
    await user.click(btn);

    await waitFor(() => {
      expect(screen.getByText('Verifying Top Candidates')).toBeInTheDocument();
    });

    const cancelBtn = screen.getByRole('button', { name: /Cancel Benchmark/i });
    await user.click(cancelBtn);

    await waitFor(() => {
      expect(recommendationService.cancelRecommendation).toHaveBeenCalledWith('ds-test-123', 'job-cancel-1');
      expect(screen.getByText(/Analysis was cancelled/i)).toBeInTheDocument();
    });
  });

  it('opens and closes the "Why this model?" accessible modal on button click and ESC key', async () => {
    const user = userEvent.setup();
    const mockCompletedJob: RecommendationJobDetail = {
      job_id: 'job-evidence-1',
      dataset_id: 'ds-test-123',
      organisation_id: 'org-1',
      status: 'COMPLETED',
      stage: 'Completed',
      progress: 100,
      cache_key: 'cached-key-1',
      recommendation: {
        algorithm_id: 'random_forest_classifier',
        display_name: 'Random Forest',
        category: 'tree',
        task_type: 'classification',
        score: 0.915,
        score_std: 0.008,
        training_seconds: 0.45,
        status: 'completed',
        reason_codes: ['top_score'],
        warnings: [],
      },
      candidates: [
        {
          algorithm_id: 'random_forest_classifier',
          display_name: 'Random Forest',
          category: 'tree',
          task_type: 'classification',
          rank: 1,
          score: 0.915,
          score_std: 0.008,
          training_seconds: 0.45,
          status: 'completed',
          reason_codes: ['top_score'],
          warnings: [],
        },
        {
          algorithm_id: 'logistic_regression',
          display_name: 'Logistic Regression',
          category: 'linear',
          task_type: 'classification',
          rank: 2,
          score: 0.880,
          score_std: 0.015,
          training_seconds: 0.12,
          status: 'completed',
          reason_codes: [],
          warnings: [],
        },
      ],
      warnings: [],
      exclusions: [{ column_name: 'id_col', reason: 'High cardinality identifier', category: 'identifier' }],
      reason_codes: ['top_score'],
      limitations: ['Verified with 5-fold cross-validation.'],
      reproducibility: {
        metric: 'roc_auc',
        cv_folds: 5,
        task_type: 'classification',
      },
    };

    vi.mocked(recommendationService.startRecommendation).mockResolvedValueOnce({
      job: mockCompletedJob,
      cached: true,
      deduplicated: false,
    });

    render(
      <AlgorithmRecommendationPanel
        dataset={mockDataset}
        selectedTarget="target"
        selectedFeatures={['feature1', 'feature2']}
        selectedAlgorithm="random_forest_classifier"
        onSelectAlgorithm={onSelectAlgorithm}
        cvFolds={5}
        trainTestSplit={0.8}
        onShowToast={onShowToast}
      />,
    );

    const btn = screen.getByRole('button', { name: /Analyze & Recommend Algorithms/i });
    await user.click(btn);

    const whyBtn = await screen.findByRole('button', { name: /Why this model/i });
    await user.click(whyBtn);

    // Modal dialog rendered
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Algorithm Recommendation Evidence')).toBeInTheDocument();
    expect(screen.getByText('Logistic Regression')).toBeInTheDocument();
    expect(screen.getByText(/High cardinality identifier/)).toBeInTheDocument();

    // Close via ESC
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('marks state as STALE when features or target change after benchmark', async () => {
    const user = userEvent.setup();
    const mockCompletedJob: RecommendationJobDetail = {
      job_id: 'job-stale-1',
      dataset_id: 'ds-test-123',
      organisation_id: 'org-1',
      status: 'COMPLETED',
      stage: 'Completed',
      progress: 100,
      cache_key: 'cached-key-1',
      recommendation: {
        algorithm_id: 'random_forest_classifier',
        display_name: 'Random Forest',
        category: 'tree',
        task_type: 'classification',
        score: 0.9,
        score_std: 0.01,
        training_seconds: 0.5,
        status: 'completed',
        reason_codes: [],
        warnings: [],
      },
      candidates: [],
      warnings: [],
      exclusions: [],
      reason_codes: [],
      limitations: [],
    };

    vi.mocked(recommendationService.startRecommendation).mockResolvedValueOnce({
      job: mockCompletedJob,
      cached: true,
      deduplicated: false,
    });

    const { rerender } = render(
      <AlgorithmRecommendationPanel
        dataset={mockDataset}
        selectedTarget="target"
        selectedFeatures={['feature1']}
        selectedAlgorithm="random_forest_classifier"
        onSelectAlgorithm={onSelectAlgorithm}
        cvFolds={5}
        trainTestSplit={0.8}
        onShowToast={onShowToast}
      />,
    );

    const btn = screen.getByRole('button', { name: /Analyze & Recommend Algorithms/i });
    await user.click(btn);

    await waitFor(() => {
      expect(screen.getByText('Recommended')).toBeInTheDocument();
    });

    // Change features -> triggers stale
    rerender(
      <AlgorithmRecommendationPanel
        dataset={mockDataset}
        selectedTarget="target"
        selectedFeatures={['feature1', 'feature2']}
        selectedAlgorithm="random_forest_classifier"
        onSelectAlgorithm={onSelectAlgorithm}
        cvFolds={5}
        trainTestSplit={0.8}
        onShowToast={onShowToast}
      />,
    );

    expect(screen.getByText('Inputs Changed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Re-analyze with New Settings/i })).toBeInTheDocument();
  });

  it('handles MANUAL_OVERRIDE when user selects a different model after recommendation', async () => {
    const user = userEvent.setup();
    const mockCompletedJob: RecommendationJobDetail = {
      job_id: 'job-manual-1',
      dataset_id: 'ds-test-123',
      organisation_id: 'org-1',
      status: 'COMPLETED',
      stage: 'Completed',
      progress: 100,
      cache_key: 'cached-key-1',
      recommendation: {
        algorithm_id: 'gradient_boosting_classifier',
        display_name: 'Gradient Boosting',
        category: 'boosting',
        task_type: 'classification',
        score: 0.94,
        training_seconds: 1.0,
        status: 'completed',
        reason_codes: [],
        warnings: [],
      },
      candidates: [],
      warnings: [],
      exclusions: [],
      reason_codes: [],
      limitations: [],
    };

    vi.mocked(recommendationService.startRecommendation).mockResolvedValueOnce({
      job: mockCompletedJob,
      cached: true,
      deduplicated: false,
    });

    const { rerender } = render(
      <AlgorithmRecommendationPanel
        dataset={mockDataset}
        selectedTarget="target"
        selectedFeatures={['feature1', 'feature2']}
        selectedAlgorithm="gradient_boosting_classifier"
        onSelectAlgorithm={onSelectAlgorithm}
        cvFolds={5}
        trainTestSplit={0.8}
        onShowToast={onShowToast}
      />,
    );

    const btn = screen.getByRole('button', { name: /Analyze & Recommend Algorithms/i });
    await user.click(btn);

    await waitFor(() => {
      expect(screen.getByText('Recommended')).toBeInTheDocument();
    });

    // User switches algorithm in dropdown to logistic_regression
    rerender(
      <AlgorithmRecommendationPanel
        dataset={mockDataset}
        selectedTarget="target"
        selectedFeatures={['feature1', 'feature2']}
        selectedAlgorithm="logistic_regression"
        onSelectAlgorithm={onSelectAlgorithm}
        cvFolds={5}
        trainTestSplit={0.8}
        onShowToast={onShowToast}
      />,
    );

    expect(screen.getByText('Manual Choice')).toBeInTheDocument();
    const restoreBtn = screen.getByRole('button', { name: /Use Recommended \(Gradient Boosting\)/i });
    expect(restoreBtn).toBeInTheDocument();

    await user.click(restoreBtn);
    expect(onSelectAlgorithm).toHaveBeenCalledWith('gradient_boosting_classifier');
  });

  it('displays non-error guidance for INSUFFICIENT_DATA status', async () => {
    const user = userEvent.setup();
    const mockInsufficientJob: RecommendationJobDetail = {
      job_id: 'job-insufficient-1',
      dataset_id: 'ds-test-123',
      organisation_id: 'org-1',
      status: 'INSUFFICIENT_DATA',
      stage: 'Insufficient Data for Benchmarking',
      progress: 0,
      cache_key: 'cached-key-1',
      candidates: [],
      warnings: ['Target column has only 1 unique class.'],
      exclusions: [],
      reason_codes: ['single_class_target'],
      limitations: ['Classification requires at least 2 distinct target classes.'],
    };

    vi.mocked(recommendationService.startRecommendation).mockResolvedValueOnce({
      job: mockInsufficientJob,
      cached: false,
      deduplicated: false,
    });
    vi.mocked(recommendationService.getRecommendationJob).mockResolvedValue(mockInsufficientJob);

    render(
      <AlgorithmRecommendationPanel
        dataset={mockDataset}
        selectedTarget="target"
        selectedFeatures={['feature1', 'feature2']}
        selectedAlgorithm="random_forest_classifier"
        onSelectAlgorithm={onSelectAlgorithm}
        cvFolds={5}
        trainTestSplit={0.8}
        onShowToast={onShowToast}
      />,
    );

    const btn = screen.getByRole('button', { name: /Analyze & Recommend Algorithms/i });
    await user.click(btn);

    await waitFor(() => {
      expect(screen.getByText('Insufficient Data for Benchmarking')).toBeInTheDocument();
      expect(screen.getByText(/Classification requires at least 2 distinct target classes/i)).toBeInTheDocument();
    });
  });

  it('displays sanitized error message on API failure', async () => {
    const user = userEvent.setup();
    vi.mocked(recommendationService.startRecommendation).mockRejectedValueOnce(
      new ApiError(503, 'Recommendation service is temporarily busy. Please retry in a few moments.'),
    );

    render(
      <AlgorithmRecommendationPanel
        dataset={mockDataset}
        selectedTarget="target"
        selectedFeatures={['feature1', 'feature2']}
        selectedAlgorithm="random_forest_classifier"
        onSelectAlgorithm={onSelectAlgorithm}
        cvFolds={5}
        trainTestSplit={0.8}
        onShowToast={onShowToast}
      />,
    );

    const btn = screen.getByRole('button', { name: /Analyze & Recommend Algorithms/i });
    await user.click(btn);

    await waitFor(() => {
      expect(
        screen.getByText('Recommendation service is temporarily busy. Please retry in a few moments.'),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Analyze & Recommend Algorithms/i })).toBeInTheDocument();
    });
  });

  it('displays FAILED state with Retry Analysis button when job fails', async () => {
    const user = userEvent.setup();
    const mockFailedJob: RecommendationJobDetail = {
      job_id: 'job-failed-1',
      dataset_id: 'ds-test-123',
      organisation_id: 'org-1',
      status: 'FAILED',
      stage: 'Failed',
      progress: 0,
      cache_key: 'cached-key-1',
      candidates: [],
      warnings: [],
      exclusions: [],
      reason_codes: [],
      limitations: [],
      error_details: {
        error_type: 'DataProcessingError',
        message: 'Unable to process dataset features due to severe corruptions.',
      },
    };

    vi.mocked(recommendationService.startRecommendation).mockResolvedValueOnce({
      job: mockFailedJob,
      cached: false,
      deduplicated: false,
    });
    vi.mocked(recommendationService.getRecommendationJob).mockResolvedValue(mockFailedJob);

    render(
      <AlgorithmRecommendationPanel
        dataset={mockDataset}
        selectedTarget="target"
        selectedFeatures={['feature1', 'feature2']}
        selectedAlgorithm="random_forest_classifier"
        onSelectAlgorithm={onSelectAlgorithm}
        cvFolds={5}
        trainTestSplit={0.8}
        onShowToast={onShowToast}
      />,
    );

    const btn = screen.getByRole('button', { name: /Analyze & Recommend Algorithms/i });
    await user.click(btn);

    await waitFor(() => {
      expect(
        screen.getByText('Unable to process dataset features due to severe corruptions.'),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Retry Analysis/i })).toBeInTheDocument();
    });
  });
});
