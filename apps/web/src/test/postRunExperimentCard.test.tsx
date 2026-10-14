import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PostRunExperimentCard } from '../features/pipelines/PostRunExperimentCard';
import type { ExtractedMetrics } from '../utils/metricExtractor';

describe('PostRunExperimentCard Component', () => {
  const sampleMetrics: ExtractedMetrics = {
    problemType: 'classification',
    metrics: {
      accuracy: 0.88,
      f1_score: 0.86,
      precision: 0.89,
      recall: 0.84,
    },
    primaryMetric: {
      name: 'Accuracy',
      key: 'accuracy',
      value: 0.88,
      formatted: '88.00%',
    },
  };

  it('renders primary metric, exit status, and secondary metrics', () => {
    render(
      <PostRunExperimentCard
        execId="exec-12345"
        filename="pipeline_generated.py"
        durationSeconds={1.45}
        exitCode={0}
        extractedMetrics={sampleMetrics}
        algorithmName="Random Forest Classifier"
      />
    );

    expect(screen.getByTestId('post-run-experiment-card')).toBeInTheDocument();
    expect(screen.getByText('Post-Run Model Evaluation')).toBeInTheDocument();
    expect(screen.getByText('pipeline_generated.py')).toBeInTheDocument();
    expect(screen.getByText('88.00%')).toBeInTheDocument();
    expect(screen.getByText(/Random Forest Classifier/i)).toBeInTheDocument();
    expect(screen.getByText('Exit 0')).toBeInTheDocument();
  });

  it('renders positive delta comparison when outperforming Champion baseline', () => {
    const championMetrics = { accuracy: 0.84 };

    render(
      <PostRunExperimentCard
        execId="exec-12345"
        filename="pipeline_generated.py"
        durationSeconds={1.45}
        exitCode={0}
        extractedMetrics={sampleMetrics}
        championMetrics={championMetrics}
      />
    );

    expect(screen.getByText(/\+0\.0400 \(\+4\.8%\) vs Champion/i)).toBeInTheDocument();
  });

  it('triggers onPromoteChampion when Set as Champion button is clicked', () => {
    const onPromote = vi.fn();

    render(
      <PostRunExperimentCard
        execId="exec-12345"
        filename="pipeline_generated.py"
        durationSeconds={1.45}
        exitCode={0}
        extractedMetrics={sampleMetrics}
        onPromoteChampion={onPromote}
      />
    );

    const promoteBtn = screen.getByTestId('post-run-set-champion');
    expect(promoteBtn).toBeInTheDocument();
    fireEvent.click(promoteBtn);
    expect(onPromote).toHaveBeenCalledTimes(1);
  });

  it('triggers onViewInResults and onDismiss callbacks', () => {
    const onView = vi.fn();
    const onDismiss = vi.fn();

    render(
      <PostRunExperimentCard
        execId="exec-12345"
        filename="pipeline_generated.py"
        durationSeconds={1.45}
        exitCode={0}
        extractedMetrics={sampleMetrics}
        onViewInResults={onView}
        onDismiss={onDismiss}
      />
    );

    const viewBtn = screen.getByTestId('post-run-view-results');
    fireEvent.click(viewBtn);
    expect(onView).toHaveBeenCalledTimes(1);

    const dismissBtn = screen.getByTestId('post-run-dismiss');
    fireEvent.click(dismissBtn);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
