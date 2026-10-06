import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FeatureImportanceCard } from '../features/jobs/FeatureImportanceCard';
import { ThresholdOptimizer } from '../features/jobs/ThresholdOptimizer';
import { ExperimentLeaderboard } from '../features/jobs/ExperimentLeaderboard';
import type { JobEntity } from '../types/job';

// Mock fetchJobs from jobService
vi.mock('../services/jobService', () => ({
  fetchJobs: vi.fn().mockResolvedValue({ total: 0, jobs: [] }),
}));

function createMockJob(overrides: Partial<JobEntity> = {}): JobEntity {
  return {
    job_id: 'job-run-1',
    dataset_id: 'ds-test',
    status: 'COMPLETED',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    job_type: 'training',
    algorithm: 'random_forest_classifier',
    target_column: 'course',
    feature_columns: ['study_hours', 'attendance', 'assignments'],
    progress: 100,
    current_stage: 'Completed',
    retry_count: 0,
    metadata: {
      metrics: {
        accuracy: 0.88,
        f1_score: 0.86,
        precision: 0.89,
        recall: 0.83,
      },
      confusion_matrix: [
        [40, 10],
        [8, 42],
      ],
      feature_importance: [
        { feature: 'study_hours', importance: 0.65, rank: 1 },
        { feature: 'attendance', importance: 0.25, rank: 2 },
        { feature: 'assignments', importance: 0.1, rank: 3 },
      ],
    },
    ...overrides,
  };
}

describe('Milestone 3: Deep Experiment Tracking & Diagnostics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('FeatureImportanceCard', () => {
    it('renders feature importance weights ranked in descending order', () => {
      render(
        <FeatureImportanceCard
          featureImportance={[
            { feature: 'study_hours', importance: 0.65, rank: 1 },
            { feature: 'attendance', importance: 0.25, rank: 2 },
          ]}
          featureColumns={['study_hours', 'attendance']}
        />
      );

      expect(screen.getByText(/Feature Importance & Contribution/i)).toBeInTheDocument();
      expect(screen.getByText('study_hours')).toBeInTheDocument();
      expect(screen.getByText('attendance')).toBeInTheDocument();
      expect(screen.getByText('#1')).toBeInTheDocument();
      expect(screen.getByText('#2')).toBeInTheDocument();
      expect(screen.getByText('100% weight')).toBeInTheDocument(); // normalized to top feature
    });

    it('returns null if no features exist', () => {
      const { container } = render(
        <FeatureImportanceCard featureImportance={[]} featureColumns={[]} />
      );
      expect(container.firstChild).toBeNull();
    });
  });

  describe('ThresholdOptimizer', () => {
    it('renders threshold slider and 2x2 confusion matrix with τ = 0.50', () => {
      const mockJob = createMockJob();
      render(
        <ThresholdOptimizer
          job={mockJob}
          targetColumn="course"
          baseMetrics={mockJob.metadata?.metrics as any}
          confusionMatrix={mockJob.metadata?.confusion_matrix as any}
        />
      );

      expect(screen.getByText(/Threshold Optimizer \(course\) & Confusion Matrix/i)).toBeInTheDocument();
      expect(screen.getByText('τ = 0.50')).toBeInTheDocument();
      expect(screen.getByText('True Positive (TP)')).toBeInTheDocument();
      expect(screen.getByText('False Positive (FP)')).toBeInTheDocument();
      expect(screen.getByText('True Negative (TN)')).toBeInTheDocument();
      expect(screen.getByText('False Negative (FN)')).toBeInTheDocument();
    });

    it('updates simulated operating metrics when threshold slider is changed', () => {
      const mockJob = createMockJob();
      render(
        <ThresholdOptimizer
          job={mockJob}
          targetColumn="course"
          baseMetrics={mockJob.metadata?.metrics as any}
          confusionMatrix={mockJob.metadata?.confusion_matrix as any}
        />
      );

      const slider = screen.getByRole('slider');
      expect(slider).toBeInTheDocument();

      // Change threshold to 0.80 (strict cutoff)
      fireEvent.change(slider, { target: { value: '0.8' } });
      expect(screen.getByText('τ = 0.80')).toBeInTheDocument();
      expect(screen.getByText(/Conservative Threshold/i)).toBeInTheDocument();
    });

    it('toggles matrix display mode between Counts, Recall %, and Precision %', () => {
      const mockJob = createMockJob();
      render(
        <ThresholdOptimizer
          job={mockJob}
          targetColumn="course"
          baseMetrics={mockJob.metadata?.metrics as any}
          confusionMatrix={mockJob.metadata?.confusion_matrix as any}
        />
      );

      const recallBtn = screen.getByRole('button', { name: /Recall %/i });
      fireEvent.click(recallBtn);
      expect(screen.getAllByText(/%/i).length).toBeGreaterThan(0);
    });
  });

  describe('ExperimentLeaderboard', () => {
    it('renders multi-run leaderboard with champion model #1 badge', () => {
      const job1 = createMockJob({ job_id: 'job-1', algorithm: 'random_forest_classifier' });
      const job2 = createMockJob({
        job_id: 'job-2',
        algorithm: 'logistic_regression',
        metadata: { metrics: { accuracy: 0.75 } },
      });

      const onSelectJob = vi.fn();
      const onDeployJob = vi.fn();

      render(
        <ExperimentLeaderboard
          currentJob={job1}
          fileJobs={{ 'exp_1.py': job1, 'exp_2.py': job2 }}
          onSelectJob={onSelectJob}
          onDeployJob={onDeployJob}
          targetColumn="course"
        />
      );

      expect(screen.getByText(/Tracked Experiments/i)).toBeInTheDocument();
      expect(screen.getByText(/Champion Model/i)).toBeInTheDocument();
      expect(screen.getByText('#1')).toBeInTheDocument();
      expect(screen.getAllByText('Random Forest Classifier').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Logistic Regression')).toBeInTheDocument();
    });

    it('enables side-by-side hyperparameter diff when two runs are selected', () => {
      const job1 = createMockJob({
        job_id: 'job-1',
        algorithm: 'random_forest_classifier',
        metadata: { scaler: 'standard_scaler' },
      });
      const job2 = createMockJob({
        job_id: 'job-2',
        algorithm: 'logistic_regression',
        metadata: { scaler: 'min_max_scaler' },
      });

      render(
        <ExperimentLeaderboard
          currentJob={job1}
          fileJobs={{ 'exp_1.py': job1, 'exp_2.py': job2 }}
          onSelectJob={vi.fn()}
          onDeployJob={vi.fn()}
          targetColumn="course"
        />
      );

      // Initially job-1 is selected. Click checkbox for job-2 to select both
      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes.length).toBeGreaterThanOrEqual(2);
      fireEvent.click(checkboxes[1]);

      // Side-by-side diff table should appear
      expect(screen.getByText(/Side-by-Side Experiment Parameter Diff/i)).toBeInTheDocument();
      expect(screen.getAllByText('DIFF').length).toBeGreaterThanOrEqual(1);
    });

    it('triggers onSelectJob and onDeployJob callbacks when action buttons are clicked', () => {
      const job1 = createMockJob({ job_id: 'job-1' });
      const onSelectJob = vi.fn();
      const onDeployJob = vi.fn();

      render(
        <ExperimentLeaderboard
          currentJob={job1}
          fileJobs={{ 'exp_1.py': job1 }}
          onSelectJob={onSelectJob}
          onDeployJob={onDeployJob}
          targetColumn="course"
        />
      );

      const inspectBtn = screen.getByRole('button', { name: /Inspect/i });
      fireEvent.click(inspectBtn);
      expect(onSelectJob).toHaveBeenCalledWith(job1, 'exp_1.py');

      const deployBtn = screen.getByRole('button', { name: /Deploy/i });
      fireEvent.click(deployBtn);
      expect(onDeployJob).toHaveBeenCalledWith(job1);
    });
  });
});
