import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DriftMonitoringPanel } from '../features/deployments/DriftMonitoringPanel';
import { LocalDeploymentService, type DeploymentDriftReport } from '../services/localDeploymentService';

describe('DriftMonitoringPanel Component', () => {
  const mockReport: DeploymentDriftReport = {
    deployment_id: 'dep-mock-123',
    drift_detected: true,
    overall_status: 'CRITICAL_DRIFT',
    sample_count: 50,
    min_required: 5,
    highest_psi: 0.342,
    drifted_features: ['monthly_charges'],
    telemetry: {
      total_requests: 50,
      success_rate: 98.0,
      error_count: 1,
      p50_ms: 4.8,
      p95_ms: 9.2,
      p99_ms: 15.6,
      avg_latency_ms: 5.3,
      throughput_rps: 12.5,
    },
    features: {
      monthly_charges: {
        feature: 'monthly_charges',
        type: 'numeric',
        psi: 0.342,
        status: 'CRITICAL',
        ks_statistic: 0.412,
        p_value: 0.002,
        baseline_mean: 64.5,
        current_mean: 82.1,
        distribution_comparison: [
          { bin: '[20, 35]', baseline_pct: 25.0, current_pct: 5.0 },
          { bin: '[35, 60]', baseline_pct: 35.0, current_pct: 20.0 },
          { bin: '[60, 95]', baseline_pct: 40.0, current_pct: 75.0 },
        ],
      },
      contract_type: {
        feature: 'contract_type',
        type: 'categorical',
        psi: 0.035,
        status: 'STABLE',
        ks_statistic: 0.0,
        p_value: 1.0,
        baseline_mode: 'Month-to-month',
        distribution_comparison: [
          { bin: 'Month-to-month', baseline_pct: 55.0, current_pct: 54.0 },
          { bin: 'Two-year', baseline_pct: 45.0, current_pct: 46.0 },
        ],
      },
    },
    recommendation: "Feature 'monthly_charges' has drifted (PSI = 0.342 > 0.25). Model retraining recommended.",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders telemetry metrics: P50, P95, P99 latency and success rate', async () => {
    vi.spyOn(LocalDeploymentService, 'getDriftReport').mockResolvedValue(mockReport);

    render(<DriftMonitoringPanel deploymentId="dep-mock-123" />);

    await waitFor(() => {
      expect(screen.getByText('4.8 ms')).toBeInTheDocument();
      expect(screen.getByText('9.2 ms')).toBeInTheDocument();
      expect(screen.getByText('15.6 ms')).toBeInTheDocument();
      expect(screen.getByText('98%')).toBeInTheDocument();
    });
  });

  it('displays critical data drift warning banner and retraining trigger button', async () => {
    vi.spyOn(LocalDeploymentService, 'getDriftReport').mockResolvedValue(mockReport);
    const mockNavigate = vi.fn();

    render(
      <DriftMonitoringPanel
        deploymentId="dep-mock-123"
        onNavigateToStudio={mockNavigate}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Significant Data Drift Detected/i)).toBeInTheDocument();
      expect(screen.getByText(/Feature 'monthly_charges' has drifted/i)).toBeInTheDocument();
    });

    const retrainBtn = screen.getByRole('button', { name: /Trigger Retrain in Code Studio/i });
    expect(retrainBtn).toBeInTheDocument();
    fireEvent.click(retrainBtn);
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });

  it('renders feature drift matrix with PSI and KS p-value', async () => {
    vi.spyOn(LocalDeploymentService, 'getDriftReport').mockResolvedValue(mockReport);

    render(<DriftMonitoringPanel deploymentId="dep-mock-123" />);

    await waitFor(() => {
      expect(screen.getAllByText('monthly_charges').length).toBeGreaterThan(0);
      expect(screen.getByText('0.342')).toBeInTheDocument();
      expect(screen.getByText('0.002')).toBeInTheDocument();
      expect(screen.getByText('CRITICAL')).toBeInTheDocument();
    });
  });

  it('renders comparative distribution shift bars for the selected feature', async () => {
    vi.spyOn(LocalDeploymentService, 'getDriftReport').mockResolvedValue(mockReport);

    render(<DriftMonitoringPanel deploymentId="dep-mock-123" />);

    await waitFor(() => {
      expect(screen.getByText('[20, 35]')).toBeInTheDocument();
      expect(screen.getByText('25%')).toBeInTheDocument();
      expect(screen.getByText('5%')).toBeInTheDocument();
    });
  });
});
