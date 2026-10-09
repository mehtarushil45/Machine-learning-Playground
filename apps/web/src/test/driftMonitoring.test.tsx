import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DriftMonitoringPanel } from '../features/deployments/DriftMonitoringPanel';
import { LocalDeploymentService, type DeploymentDriftReport } from '../services/localDeploymentService';

describe('DriftMonitoringPanel Component', () => {
  const mockReport: DeploymentDriftReport = {
    deployment_id: 'dep-mock-123',
    drift_detected: true,
    overall_status: 'CRITICAL_DRIFT',
    overall_status_display: 'CRITICAL DRIFT',
    sample_count: 50,
    min_required: 50,
    highest_psi: 0.342,
    drifted_features: ['monthly_charges'],
    drifted_features_count: 1,
    total_features_count: 2,
    drifted_share: 0.5,
    importance_weighted_drift_score: 0.38,
    retrain_recommended: true,
    smoothing_constant: 0.0001,
    performance_confirmed: false,
    alert_badge_label: 'inputs changed — performance not yet confirmed',
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
        status_display: 'CRITICAL',
        test_name: 'Kolmogorov-Smirnov',
        test_statistic: 0.412,
        p_value: 0.002,
        test_display: 'KS (p=0.002)',
        importance: 0.65,
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
        status_display: 'STABLE',
        test_name: 'Chi-Squared',
        test_statistic: 1.25,
        p_value: 0.74,
        test_display: 'Chi-Sq (p=0.740)',
        importance: 0.35,
        baseline_mode: 'Month-to-month',
        distribution_comparison: [
          { bin: 'Month-to-month', baseline_pct: 55.0, current_pct: 54.0 },
          { bin: 'Two-year', baseline_pct: 45.0, current_pct: 46.0 },
        ],
      },
    },
    recommendation: "Significant distribution drift on high-importance features. Model retraining on fresh production data is strongly recommended.",
    retrain_context: {
      primary_feature: 'monthly_charges',
      primary_feature_importance: 0.65,
      drifted_features: ['monthly_charges'],
      severity: 'CRITICAL_DRIFT',
      importance_weighted_score: 0.38,
      guidance: '⚠️ Input Data Drift Detected. Retraining requires fresh production data reflecting the current distribution.',
    },
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

  it('displays critical data drift warning banner, unconfirmed performance badge, and retraining trigger button', async () => {
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
      expect(screen.getByText(/inputs changed — performance not yet confirmed/i)).toBeInTheDocument();
      expect(screen.getByText(/fresh production data reflecting the current distribution/i)).toBeInTheDocument();
    });

    const retrainBtn = screen.getByRole('button', { name: /Trigger Retrain in Code Studio/i });
    expect(retrainBtn).toBeInTheDocument();
    fireEvent.click(retrainBtn);
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });

  it('renders feature drift matrix with proper statistical tests by type (no KS for categorical)', async () => {
    vi.spyOn(LocalDeploymentService, 'getDriftReport').mockResolvedValue(mockReport);

    render(<DriftMonitoringPanel deploymentId="dep-mock-123" />);

    await waitFor(() => {
      expect(screen.getAllByText('monthly_charges').length).toBeGreaterThan(0);
      expect(screen.getByText('0.342')).toBeInTheDocument();
      expect(screen.getAllByText('KS (p=0.002)').length).toBeGreaterThan(0);
      expect(screen.getByText('Chi-Sq (p=0.740)')).toBeInTheDocument();
      expect(screen.getByText('65%')).toBeInTheDocument();
      expect(screen.getAllByText('CRITICAL').length).toBeGreaterThan(0);
    });
  });

  it('shows Insufficient data (n of N required) when sample count is below minimum threshold', async () => {
    const insufficientReport: DeploymentDriftReport = {
      deployment_id: 'dep-mock-123',
      drift_detected: false,
      overall_status: 'INSUFFICIENT_DATA',
      overall_status_display: 'Insufficient data (20 of 50 required)',
      insufficient_data: true,
      sample_count: 20,
      min_required: 50,
      highest_psi: 0.0,
      drifted_features: [],
      features: {
        monthly_charges: {
          feature: 'monthly_charges',
          type: 'numeric',
          psi: 0.0,
          status: 'INSUFFICIENT_DATA',
          status_display: 'Insufficient data (20 of 50 required)',
          test_display: 'Pending (20/50)',
          distribution_comparison: [],
        },
      },
      telemetry: mockReport.telemetry,
      recommendation: 'Accumulating production inferences (20 of 50 required).',
    };

    vi.spyOn(LocalDeploymentService, 'getDriftReport').mockResolvedValue(insufficientReport);

    render(<DriftMonitoringPanel deploymentId="dep-mock-123" />);

    await waitFor(() => {
      expect(screen.getAllByText(/Insufficient data \(20 of 50 required\)/i).length).toBeGreaterThan(0);
    });
  });

  it('supports isolated simulation mode and clears back to real telemetry in one click', async () => {
    vi.spyOn(LocalDeploymentService, 'getDriftReport').mockResolvedValue(mockReport);
    const mockSimReport: DeploymentDriftReport = {
      ...mockReport,
      is_simulation: true,
    };
    vi.spyOn(LocalDeploymentService, 'simulateDrift').mockResolvedValue(mockSimReport);

    render(<DriftMonitoringPanel deploymentId="dep-mock-123" />);

    await waitFor(() => {
      expect(screen.getByText('Simulate Drift')).toBeInTheDocument();
    });

    // Click Simulate Drift
    fireEvent.click(screen.getByText('Simulate Drift'));

    await waitFor(() => {
      expect(screen.getByText(/SIMULATION MODE \(Isolated Synthetic Sandbox\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Clear Simulation & Restore Live Telemetry/i)).toBeInTheDocument();
    });

    // Clear Simulation in 1 click
    fireEvent.click(screen.getByText(/Clear Simulation & Restore Live Telemetry/i));

    await waitFor(() => {
      expect(screen.queryByText(/SIMULATION MODE \(Isolated Synthetic Sandbox\)/i)).not.toBeInTheDocument();
    });
  });

  it('expands plain-language Copilot diagnostics using real numbers on screen', async () => {
    vi.spyOn(LocalDeploymentService, 'getDriftReport').mockResolvedValue(mockReport);

    render(<DriftMonitoringPanel deploymentId="dep-mock-123" />);

    await waitFor(() => {
      expect(screen.getByText("Explain 'monthly_charges' with Copilot")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Explain'));

    await waitFor(() => {
      expect(screen.getByText(/Feature 'monthly_charges' has critically shifted from training baseline/i)).toBeInTheDocument();
      expect(screen.getByText(/65\.0% model importance weight/i)).toBeInTheDocument();
      expect(screen.getByText(/smoothing constant ε = 0\.0001/i)).toBeInTheDocument();
    });
  });
});
