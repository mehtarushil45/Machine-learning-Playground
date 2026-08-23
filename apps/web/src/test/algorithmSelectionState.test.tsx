import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TrainingConfigurationPanel } from '../features/jobs/TrainingConfigurationPanel';
import type { Dataset, DatasetRecommendations } from '../types/dataset';
import type { TrainingRequestPayload } from '../types/job';

vi.mock('../services/jobService', () => ({
  fetchTrainingOptions: vi.fn().mockResolvedValue(null), // fallback to CANONICAL_TRAINING_OPTIONS
}));

const mockDataset: Dataset = {
  fileName: 'housing.csv',
  datasetId: 'ds-housing-123',
  columns: ['sqft', 'bedrooms', 'price'],
  rows: [
    { sqft: 1200, bedrooms: 3, price: 350000 },
    { sqft: 850, bedrooms: 2, price: 240000 },
  ],
  rowCount: 100,
};

const classificationRecommendations: DatasetRecommendations = {
  dataset_id: 'ds-housing-123',
  filename: 'housing.csv',
  overall_readiness: 'Ready for Training',
  readiness_reasoning: 'Clean data',
  recommended_problem_type: 'Classification',
  problem_type_confidence: 0.95,
  problem_type_reasoning: 'Discrete target candidate',
  recommended_models: ['Random Forest Classifier', 'Logistic Regression'],
  recommended_preprocessing: ['StandardScaler Feature Normalization'],
  target_suggestions: [
    {
      column_name: 'bedrooms',
      confidence: 'High',
      suggested_task: 'Classification',
      reasoning: 'Discrete class',
    },
  ],
  feature_recommendations: [],
  warnings: [],
};

const regressionRecommendations: DatasetRecommendations = {
  dataset_id: 'ds-housing-123',
  filename: 'housing.csv',
  overall_readiness: 'Ready for Training',
  readiness_reasoning: 'Clean data',
  recommended_problem_type: 'Regression',
  problem_type_confidence: 0.95,
  problem_type_reasoning: 'Continuous numeric target candidate',
  recommended_models: ['Random Forest Regressor', 'Linear Regression'],
  recommended_preprocessing: ['StandardScaler Feature Normalization'],
  target_suggestions: [
    {
      column_name: 'price',
      confidence: 'High',
      suggested_task: 'Regression',
      reasoning: 'Continuous numerical range',
    },
  ],
  feature_recommendations: [],
  warnings: [],
};

describe('Frontend Algorithm Selection State Synchronization — Step 4', () => {
  it('initial loading for regression task type selects a compatible regressor, never classifier', async () => {
    let capturedPayload: TrainingRequestPayload | null = null;
    const handleLaunch = vi.fn(async (payload: TrainingRequestPayload) => {
      capturedPayload = payload;
    });

    render(
      <TrainingConfigurationPanel
        dataset={mockDataset}
        selectedFeatures={['sqft', 'bedrooms']}
        selectedTarget="price"
        recommendations={regressionRecommendations}
        onLaunchJob={handleLaunch}
      />,
    );

    const launchButton = screen.getByRole('button', { name: /launch ml model training job/i });
    fireEvent.click(launchButton);

    expect(handleLaunch).toHaveBeenCalledTimes(1);
    expect(capturedPayload).not.toBeNull();
    // Regression task must have selected a regressor (e.g. random_forest_regressor), NOT random_forest_classifier
    expect(capturedPayload!.algorithm).toBe('random_forest_regressor');
  });

  it('initial loading for classification task type selects a compatible classifier', async () => {
    let capturedPayload: TrainingRequestPayload | null = null;
    const handleLaunch = vi.fn(async (payload: TrainingRequestPayload) => {
      capturedPayload = payload;
    });

    render(
      <TrainingConfigurationPanel
        dataset={mockDataset}
        selectedFeatures={['sqft', 'price']}
        selectedTarget="bedrooms"
        recommendations={classificationRecommendations}
        onLaunchJob={handleLaunch}
      />,
    );

    const launchButton = screen.getByRole('button', { name: /launch ml model training job/i });
    fireEvent.click(launchButton);

    expect(handleLaunch).toHaveBeenCalledTimes(1);
    expect(capturedPayload).not.toBeNull();
    expect(capturedPayload!.algorithm).toBe('random_forest_classifier');
  });

  it('switching from classification to regression automatically updates algorithm to a compatible regressor', async () => {
    let capturedPayload: TrainingRequestPayload | null = null;
    const handleLaunch = vi.fn(async (payload: TrainingRequestPayload) => {
      capturedPayload = payload;
    });

    const { rerender } = render(
      <TrainingConfigurationPanel
        dataset={mockDataset}
        selectedFeatures={['sqft', 'price']}
        selectedTarget="bedrooms"
        recommendations={classificationRecommendations}
        onLaunchJob={handleLaunch}
      />,
    );

    // Initial launch under classification
    const launchButton = screen.getByRole('button', { name: /launch ml model training job/i });
    fireEvent.click(launchButton);
    expect(capturedPayload!.algorithm).toBe('random_forest_classifier');

    // Switch task to regression
    rerender(
      <TrainingConfigurationPanel
        dataset={mockDataset}
        selectedFeatures={['sqft', 'bedrooms']}
        selectedTarget="price"
        recommendations={regressionRecommendations}
        onLaunchJob={handleLaunch}
      />,
    );

    fireEvent.click(launchButton);
    // Algorithm must have shifted to a regressor, not leaving random_forest_classifier
    expect(capturedPayload!.algorithm).toBe('random_forest_regressor');
  });

  it('switching from regression to classification automatically updates algorithm to a compatible classifier', async () => {
    let capturedPayload: TrainingRequestPayload | null = null;
    const handleLaunch = vi.fn(async (payload: TrainingRequestPayload) => {
      capturedPayload = payload;
    });

    const { rerender } = render(
      <TrainingConfigurationPanel
        dataset={mockDataset}
        selectedFeatures={['sqft', 'bedrooms']}
        selectedTarget="price"
        recommendations={regressionRecommendations}
        onLaunchJob={handleLaunch}
      />,
    );

    // Initial launch under regression
    const launchButton = screen.getByRole('button', { name: /launch ml model training job/i });
    fireEvent.click(launchButton);
    expect(capturedPayload!.algorithm).toBe('random_forest_regressor');

    // Switch task to classification
    rerender(
      <TrainingConfigurationPanel
        dataset={mockDataset}
        selectedFeatures={['sqft', 'price']}
        selectedTarget="bedrooms"
        recommendations={classificationRecommendations}
        onLaunchJob={handleLaunch}
      />,
    );

    fireEvent.click(launchButton);
    // Algorithm must have shifted to a classifier
    expect(capturedPayload!.algorithm).toBe('random_forest_classifier');
  });

  it('preserves compatible user-selected algorithm across re-renders when task remains the same', async () => {
    let capturedPayload: TrainingRequestPayload | null = null;
    const handleLaunch = vi.fn(async (payload: TrainingRequestPayload) => {
      capturedPayload = payload;
    });

    const { rerender } = render(
      <TrainingConfigurationPanel
        dataset={mockDataset}
        selectedFeatures={['sqft', 'bedrooms']}
        selectedTarget="price"
        recommendations={regressionRecommendations}
        onLaunchJob={handleLaunch}
      />,
    );

    // Click algorithm select trigger to open dropdown
    const algoTrigger = screen.getByText('Random Forest Regressor');
    fireEvent.click(algoTrigger);

    // Click Linear Regression option in dropdown
    const linearOption = screen.getByText('Linear Regression');
    fireEvent.click(linearOption);

    // Rerender with same regression task
    rerender(
      <TrainingConfigurationPanel
        dataset={mockDataset}
        selectedFeatures={['bedrooms']}
        selectedTarget="price"
        recommendations={regressionRecommendations}
        onLaunchJob={handleLaunch}
      />,
    );

    const launchButton = screen.getByRole('button', { name: /launch ml model training job/i });
    fireEvent.click(launchButton);

    // User selection 'linear_regression' was preserved!
    expect(capturedPayload!.algorithm).toBe('linear_regression');
  });
});
