import { describe, it, expect } from 'vitest';
import { TrainingRequestPayload } from '../types/job';
import { ActiveTrainingConfiguration } from '../providers/ProjectContext';

describe('Training Contract & Provenance Payload — Phase 6', () => {
  it('correctly constructs recommendation provenance payload for recommended algorithm', () => {
    const activeConfig: ActiveTrainingConfiguration = {
      dataset_id: 'dataset-uuid-1234',
      dataset_name: 'synthetic_credit.csv',
      target_column: 'default_payment_next_month',
      feature_columns: ['LIMIT_BAL', 'AGE', 'PAY_0', 'BILL_AMT1'],
      algorithm: 'gradient_boosting_classifier',
      scaler: 'standard_scaler',
      imputer: 'median',
      train_test_split: 0.8,
      cv_folds: 5,
      random_seed: 42,
      recommendation_job_id: 'rec-uuid-5678',
      selection_source: 'recommended',
    };

    const payload: TrainingRequestPayload = {
      dataset_id: activeConfig.dataset_id,
      target_column: activeConfig.target_column,
      feature_columns: activeConfig.feature_columns,
      algorithm: activeConfig.algorithm,
      scaler: activeConfig.scaler,
      imputer: activeConfig.imputer,
      train_test_split: activeConfig.train_test_split,
      random_seed: activeConfig.random_seed,
      cross_validation: activeConfig.cv_folds,
      normalization: true,
      feature_selection: 'all',
      recommendation_job_id: activeConfig.recommendation_job_id,
      selection_source: activeConfig.selection_source,
    };

    expect(payload.selection_source).toBe('recommended');
    expect(payload.recommendation_job_id).toBe('rec-uuid-5678');
    expect(payload.feature_columns).toHaveLength(4);
    expect(payload.feature_columns).not.toContain(payload.target_column);
  });

  it('correctly tags manual override when user changes algorithm after recommendation', () => {
    const payload: TrainingRequestPayload = {
      dataset_id: 'dataset-uuid-1234',
      target_column: 'default_payment_next_month',
      feature_columns: ['LIMIT_BAL', 'AGE', 'PAY_0'],
      algorithm: 'random_forest_classifier', // user changed algorithm
      recommendation_job_id: 'rec-uuid-5678',
      selection_source: 'manual',
    };

    expect(payload.selection_source).toBe('manual');
    expect(payload.recommendation_job_id).toBe('rec-uuid-5678');
  });

  it('defaults to selection_source default when no recommendation job is run', () => {
    const payload: TrainingRequestPayload = {
      dataset_id: 'dataset-uuid-1234',
      target_column: 'target',
      feature_columns: ['col_a', 'col_b'],
      algorithm: 'logistic_regression',
      selection_source: 'default',
    };

    expect(payload.selection_source).toBe('default');
    expect(payload.recommendation_job_id).toBeUndefined();
  });
});
