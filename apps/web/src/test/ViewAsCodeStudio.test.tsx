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

    // Target and feature columns are now read-only display divs (not inputs).
    // They are accessible via aria-label.
    await waitFor(() => {
      const targetDiv = screen.getByLabelText('Target column (read-only)');
      expect(targetDiv).toHaveTextContent('churn_label');
    });

    // Feature columns strip shows badges for up to 6 features
    await waitFor(() => {
      expect(screen.getByLabelText('Feature columns (read-only)')).toBeInTheDocument();
    });

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

  it('renders slider with step 0.01 and mounts AI Copilot side drawer when opened', async () => {
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

    // Expand Technical Details to access the train/test split slider
    const techDetailsBtn = await screen.findByRole('button', { name: /technical details/i });
    fireEvent.click(techDetailsBtn);

    // Verify slider rendered with step 0.01 and 65% train
    const slider = await screen.findByRole('slider', { name: /train\/test split: 65% train/i });
    expect(slider).toBeInTheDocument();
    expect(slider).toHaveAttribute('step', '0.01');
    expect(slider).toHaveValue('0.65');

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
