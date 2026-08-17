import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ViewAsCodeStudio } from '../features/pipelines/ViewAsCodeStudio';
import { ProjectProvider, useProject } from '../providers/ProjectContext';
import { PipelineService } from '../services/api';

// Mock PipelineService
vi.mock('../services/api', () => ({
  PipelineService: {
    generateCode: vi.fn().mockResolvedValue({
      python_code: 'import sklearn\n# test code',
      is_valid_syntax: true,
      execution_order: ['n1', 'n2', 'n3', 'n4'],
      imports: ['pandas as pd', 'numpy as np'],
    }),
  },
}));

// Mock fetchTrainingOptions
vi.mock('../services/jobService', () => ({
  fetchTrainingOptions: vi.fn().mockResolvedValue({
    algorithms: [
      { key: 'random_forest_classifier', display_name: 'Random Forest Classifier', task_type: 'classification' },
      { key: 'logistic_regression', display_name: 'Logistic Regression', task_type: 'classification' },
    ],
    scalers: [
      { key: 'standard_scaler', display_name: 'Standard Scaler' },
      { key: 'minmax_scaler', display_name: 'MinMax Scaler' },
    ],
    imputers: [
      { key: 'median', display_name: 'Median Imputer' },
      { key: 'mean', display_name: 'Mean Imputer' },
    ],
  }),
}));

describe('ViewAsCodeStudio — Phase 6 Contract & State Precedence', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined' && localStorage.clear) {
      localStorage.clear();
    }
    vi.clearAllMocks();
  });

  it('renders accessible Empty State with CTA when no active dataset or configuration exists', () => {
    const onNavigate = vi.fn();
    render(
      <ProjectProvider>
        <ViewAsCodeStudio onNavigate={onNavigate} />
      </ProjectProvider>,
    );

    expect(screen.getByRole('region', { name: /empty pipeline studio/i })).toBeInTheDocument();
    expect(screen.getByText(/no active dataset or training configuration/i)).toBeInTheDocument();

    const ctaButton = screen.getByRole('button', { name: /go to dataset and profiler/i });
    expect(ctaButton).toBeInTheDocument();
    fireEvent.click(ctaButton);
    expect(onNavigate).toHaveBeenCalledWith('workspace');
  });

  it('renders active training configuration from ProjectContext before job creation', async () => {
    // Helper component to initialize ProjectContext with ActiveTrainingConfiguration
    const Initializer = () => {
      const { setTrainingConfig } = useProject();
      React.useEffect(() => {
        setTrainingConfig({
          dataset_id: 'ds-123',
          dataset_name: 'customer_churn.csv',
          target_column: 'churn_label',
          feature_columns: ['tenure', 'monthly_charges', 'contract_type'],
          algorithm: 'random_forest_classifier',
          scaler: 'standard_scaler',
          imputer: 'median',
          train_test_split: 0.8,
          cv_folds: 5,
          random_seed: 42,
          selection_source: 'recommended',
          recommendation_job_id: 'rec-job-999',
        });
      }, [setTrainingConfig]);
      return <ViewAsCodeStudio />;
    };

    render(
      <ProjectProvider>
        <Initializer />
      </ProjectProvider>,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('churn_label')).toBeInTheDocument();
      expect(screen.getByDisplayValue('tenure, monthly_charges, contract_type')).toBeInTheDocument();
    });

    // Verify DAG generation call received exact configuration
    await waitFor(() => {
      expect(PipelineService.generateCode).toHaveBeenCalledWith(
        expect.objectContaining({
          dataset_name: 'customer_churn.csv',
          target_column: 'churn_label',
          feature_columns: ['tenure', 'monthly_charges', 'contract_type'],
        }),
        true,
        true,
      );
    });
  });
});
