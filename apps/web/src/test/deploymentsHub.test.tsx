import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeploymentsHub } from '../features/deployments/DeploymentsHub';
import { DeploymentStudio } from '../features/deployments/DeploymentStudio';
import { LocalDeploymentService, type LocalDeploymentResponse, type LocalBatchPredictResponse } from '../services/localDeploymentService';
import { ModelRegistryService } from '../services/modelRegistryService';
import { ProjectProvider } from '../providers/ProjectContext';

// Mock clipboard
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn().mockImplementation(() => Promise.resolve()),
  },
});

const mockDeployment: LocalDeploymentResponse = {
  deployment_id: 'dep-mock-batch-001',
  job_id: 'job-telco-churn-42',
  model_id: 'model-rf-churn-v1',
  model_version: 'v1.0.0',
  artifact_id: 'artifact-rf-churn.joblib',
  name: 'Telco Churn Production Endpoint',
  status: 'RUNNING',
  algorithm: 'random_forest_classifier',
  algorithm_display_name: 'Random Forest Classifier',
  problem_type: 'BinaryClassification',
  dataset_id: 'dataset-telco-churn',
  dataset_name: 'Customer Churn (Telco)',
  target_column: 'churn',
  feature_columns: ['tenure', 'monthly_charges', 'contract_type'],
  input_schema: {
    tenure: { type: 'numeric', min: 1, max: 72 },
    monthly_charges: { type: 'numeric', min: 18.25, max: 118.75 },
    contract_type: { type: 'categorical', categories: ['Month-to-month', 'One year', 'Two year'] },
  },
  configuration: { host: 'localhost', port: 8000 },
  logs: [
    { ts: '2026-10-15T12:00:00Z', msg: 'Endpoint initialized and running on port 8000', event: 'ENDPOINT_READY', severity: 'INFO' },
  ],
  total_predictions: 1420,
  endpoint_path: '/api/v1/local-deployments/dep-mock-batch-001/predict',
  created_at: '2026-10-15T12:00:00Z',
  started_at: '2026-10-15T12:00:01Z',
};

const mockBatchResult: LocalBatchPredictResponse = {
  deployment_id: 'dep-mock-batch-001',
  total_samples: 3,
  successful_predictions: 3,
  failed_predictions: 0,
  predictions_preview: [
    { row_index: 1, prediction: 'No', confidence: 0.94, probabilities: { No: 0.94, Yes: 0.06 } },
    { row_index: 2, prediction: 'Yes', confidence: 0.88, probabilities: { No: 0.12, Yes: 0.88 } },
    { row_index: 3, prediction: 'No', confidence: 0.91, probabilities: { No: 0.91, Yes: 0.09 } },
  ],
  class_distribution: { No: 2, Yes: 1 },
  avg_confidence: 0.91,
  latency_ms: 18.4,
  download_url: '/api/v1/predict/download/prediction_churn_batch.csv',
  status: 'SUCCESS',
  timestamp: '2026-10-15T12:05:00Z',
};

function renderWithProject(ui: React.ReactElement) {
  return render(<ProjectProvider>{ui}</ProjectProvider>);
}

describe('DeploymentsHub and DeploymentStudio (Day 12)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(LocalDeploymentService, 'list').mockResolvedValue([mockDeployment]);
    vi.spyOn(LocalDeploymentService, 'get').mockResolvedValue(mockDeployment);
    vi.spyOn(ModelRegistryService, 'listModels').mockResolvedValue({ models: [], total: 0 });
    vi.spyOn(ModelRegistryService, 'listFamilies').mockResolvedValue({ families: [], total: 0 });
  });

  it('renders deployment list table with status badges and metrics', async () => {
    renderWithProject(<DeploymentsHub />);

    await waitFor(() => {
      expect(screen.getByText('Telco Churn Production Endpoint')).toBeInTheDocument();
      expect(screen.getAllByText('RUNNING').length).toBeGreaterThan(0);
      expect(screen.getAllByText(/1,420/).length).toBeGreaterThan(0);
    });
  });

  it('navigates to DeploymentStudio and displays Single, Batch, and Monitoring console modes', async () => {
    renderWithProject(<DeploymentStudio selectedDeploymentId="dep-mock-batch-001" />);

    await waitFor(() => {
      expect(screen.getByText(/Single Record Real-Time/i)).toBeInTheDocument();
      expect(screen.getByText(/High-Throughput Batch CSV Scoring/i)).toBeInTheDocument();
      expect(screen.getByText(/Production Telemetry & Drift/i)).toBeInTheDocument();
    });
  });

  it('switches to Batch CSV Scoring console and triggers template CSV download', async () => {
    const downloadTemplateSpy = vi.spyOn(LocalDeploymentService, 'downloadTemplateCsv').mockResolvedValue();

    renderWithProject(<DeploymentStudio selectedDeploymentId="dep-mock-batch-001" />);

    await waitFor(() => {
      expect(screen.getByText(/High-Throughput Batch CSV Scoring/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/High-Throughput Batch CSV Scoring/i));

    // Check requirements banner shows required columns
    expect(screen.getByText('Batch Inference Schema Requirements')).toBeInTheDocument();
    expect(screen.getByText('tenure')).toBeInTheDocument();
    expect(screen.getByText('monthly_charges')).toBeInTheDocument();
    expect(screen.getByText('contract_type')).toBeInTheDocument();

    // Click Template CSV button
    const templateBtns = screen.getAllByText('Template CSV');
    fireEvent.click(templateBtns[templateBtns.length - 1]);

    await waitFor(() => {
      expect(downloadTemplateSpy).toHaveBeenCalledWith(
        'dep-mock-batch-001',
        expect.stringContaining('template.csv')
      );
    });
  });

  it('handles batch CSV upload, executes batch predict, and triggers enriched CSV download', async () => {
    const predictBatchSpy = vi.spyOn(LocalDeploymentService, 'predictBatch').mockResolvedValue(mockBatchResult);
    const downloadEnrichedSpy = vi.spyOn(LocalDeploymentService, 'downloadEnrichedCsv').mockResolvedValue();

    renderWithProject(<DeploymentStudio selectedDeploymentId="dep-mock-batch-001" />);

    await waitFor(() => {
      expect(screen.getByText(/High-Throughput Batch CSV Scoring/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/High-Throughput Batch CSV Scoring/i));

    // Simulate CSV file selection
    const file = new File(['tenure,monthly_charges,contract_type\n12,65.5,Month-to-month\n'], 'customers.csv', {
      type: 'text/csv',
    });
    const fileInput = document.getElementById('batch-csv-upload-input') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    // Verify file is shown in upload zone
    expect(screen.getByText('customers.csv')).toBeInTheDocument();

    // Execute scoring
    const scoreBtn = screen.getByText('Execute High-Throughput Batch Scoring');
    fireEvent.click(scoreBtn);

    await waitFor(() => {
      expect(predictBatchSpy).toHaveBeenCalledWith('dep-mock-batch-001', file, 1000, true);
    });

    // Check completion results
    await waitFor(() => {
      expect(screen.getByText('BATCH SCORING COMPLETED')).toBeInTheDocument();
      expect(screen.getByText('18.4')).toBeInTheDocument();
      expect(screen.getByText('Download Enriched CSV')).toBeInTheDocument();
    });

    // Click Download Enriched CSV button
    const downloadEnrichedBtn = screen.getByText('Download Enriched CSV');
    fireEvent.click(downloadEnrichedBtn);

    await waitFor(() => {
      expect(downloadEnrichedSpy).toHaveBeenCalledWith(
        '/api/v1/predict/download/prediction_churn_batch.csv',
        expect.stringContaining('predictions.csv')
      );
    });
  });

  it('renders SDK snippets for cURL, Python, and Node.js with Authorization headers', async () => {
    renderWithProject(<DeploymentStudio selectedDeploymentId="dep-mock-batch-001" />);

    await waitFor(() => {
      expect(screen.getByText(/Developer API Snippets/i)).toBeInTheDocument();
    });

    // Expand API snippets accordion
    fireEvent.click(screen.getByText(/Developer API Snippets/i));

    await waitFor(() => {
      expect(screen.getByText('cURL (Single)')).toBeInTheDocument();
    });

    // Check default cURL snippet contains Authorization
    const codeBlock = screen.getByText(/curl -X POST/i);
    expect(codeBlock.textContent).toContain('Authorization: Bearer');

    // Switch to Python tab
    fireEvent.click(screen.getByText('Python (Single)'));
    const pythonCode = screen.getByText(/import requests/i);
    expect(pythonCode.textContent).toContain('"Authorization": "Bearer');

    // Switch to Node.js tab
    fireEvent.click(screen.getByText('Node.js'));
    const jsCode = screen.getByText(/fetch\(/i);
    expect(jsCode.textContent).toContain('"Authorization": "Bearer');

    // Click Copy button
    const copyBtn = screen.getByText('Copy');
    fireEvent.click(copyBtn);
    expect(navigator.clipboard.writeText).toHaveBeenCalled();
  });
});
