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

describe('ViewAsCodeStudio — Phase 6 Contract & State Precedence', { timeout: 20000 }, () => {
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
      const { setTrainingConfig, setSelectedTarget } = useProject();
      React.useEffect(() => {
        // Set selectedTarget so hasUsableConfig is true (required to exit empty state)
        setSelectedTarget('churn_label');
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
      }, [setTrainingConfig, setSelectedTarget]);
      return <ViewAsCodeStudio />;
    };

    render(
      <ProjectProvider>
        <Initializer />
      </ProjectProvider>,
    );

    // Verify Pipeline Summary, Pipeline Steps, and Technical Details are removed from Page 2
    expect(screen.queryByText(/Pipeline Summary/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Pipeline Steps/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Technical Details/i)).not.toBeInTheDocument();

    // Verify code lines count badge is removed from Page 2 (Task 2)
    expect(screen.queryByText(/lines/i)).not.toBeInTheDocument();

    // Verify DAG generation call received exact configuration with cleanly rounded test_size
    await waitFor(() => {
      expect(PipelineService.generateCode).toHaveBeenCalledWith(
        expect.objectContaining({
          dataset_name: 'customer_churn.csv',
          target_column: 'churn_label',
          feature_columns: ['tenure', 'monthly_charges', 'contract_type'],
          nodes: expect.arrayContaining([
            expect.objectContaining({
              type: 'train_test_split',
              params: expect.objectContaining({
                test_size: 0.2,
              }),
            }),
          ]),
        }),
        true,
        true,
      );
    });
  });

  it('renders full-width studio workspace and mounts AI Copilot side drawer when opened', async () => {
    const Initializer = () => {
      const { setTrainingConfig, setSelectedTarget } = useProject();
      React.useEffect(() => {
        setSelectedTarget('churn_label');
        setTrainingConfig({
          dataset_id: 'ds-123',
          dataset_name: 'customer_churn.csv',
          target_column: 'churn_label',
          feature_columns: ['tenure', 'monthly_charges'],
          algorithm: 'logistic_regression',
          scaler: 'standard_scaler',
          imputer: 'median',
          train_test_split: 0.65,
          cv_folds: 5,
          random_seed: 42,
          selection_source: 'manual',
        });
      }, [setTrainingConfig, setSelectedTarget]);
      return <ViewAsCodeStudio isCopilotOpen={true} />;
    };

    render(
      <ProjectProvider>
        <Initializer />
      </ProjectProvider>,
    );

    // Verify full-width editor renders code without technical details sidebar
    expect(screen.queryByRole('button', { name: /technical details/i })).not.toBeInTheDocument();
    expect(screen.getByText('pipeline_generated.py')).toBeInTheDocument();

    // Verify AI Copilot drawer is rendered
    const copilotAside = screen.getByRole('complementary', { name: /ai copilot agent drawer/i });
    expect(copilotAside).toBeInTheDocument();
  });

  it('renders symbol-only buttons in code header and permanently omits AST Valid, View Results, and Recompile', async () => {
    const Initializer = () => {
      const { setTrainingConfig, setSelectedTarget } = useProject();
      React.useEffect(() => {
        setSelectedTarget('target');
        setTrainingConfig({
          dataset_id: 'ds-123',
          dataset_name: 'data.csv',
          target_column: 'target',
          feature_columns: ['f1'],
          algorithm: 'logistic_regression',
          scaler: 'standard_scaler',
          imputer: 'median',
          train_test_split: 0.8,
          cv_folds: 5,
          random_seed: 42,
          selection_source: 'manual',
        });
      }, [setTrainingConfig, setSelectedTarget]);
      return <ViewAsCodeStudio />;
    };

    render(
      <ProjectProvider>
        <Initializer />
      </ProjectProvider>,
    );

    // Verify removed buttons are NOT present
    expect(screen.queryByText(/AST Valid/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/View Results/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /recompile/i })).not.toBeInTheDocument();

    // Verify symbol-only buttons are present via aria-label
    expect(await screen.findByRole('button', { name: 'Python Script' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Visual DAG Flow' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy code/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export \.py/i })).toBeInTheDocument();
  });
});
