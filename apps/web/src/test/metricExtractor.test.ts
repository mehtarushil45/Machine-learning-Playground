import { describe, it, expect } from 'vitest';
import { extractExecutionMetrics, compareWithChampion } from '../utils/metricExtractor';

describe('metricExtractor Utility Tests', () => {
  it('extracts classification accuracy and report metrics from stdout', () => {
    const stdout = [
      '[ML Playground] Starting: pipeline_generated.py',
      'Test Accuracy: 0.8800',
      'Classification Report:',
      '              precision    recall  f1-score   support',
      '           0       0.90      0.85      0.87        40',
      '           1       0.86      0.91      0.88        40',
      '    accuracy                           0.88        80',
      '   macro avg       0.88      0.88      0.88        80',
      'weighted avg       0.88      0.88      0.88        80',
      "Saved model pipeline to 'trained_model_pipeline.joblib'",
    ];

    const result = extractExecutionMetrics(stdout);
    expect(result.problemType).toBe('classification');
    expect(result.metrics.accuracy).toBe(0.88);
    expect(result.metrics.f1_score).toBe(0.88);
    expect(result.metrics.precision).toBe(0.88);
    expect(result.metrics.recall).toBe(0.88);
    expect(result.primaryMetric).toEqual({
      name: 'Accuracy',
      key: 'accuracy',
      value: 0.88,
      formatted: '88.00%',
    });
  });

  it('extracts regression R² and RMSE metrics correctly', () => {
    const stdout = [
      'Test R² Score: 0.8520',
      'Test RMSE: 2.3410',
      'Test MAE: 1.5200',
    ];

    const result = extractExecutionMetrics(stdout);
    expect(result.problemType).toBe('regression');
    expect(result.metrics.r2_score).toBe(0.852);
    expect(result.metrics.rmse).toBe(2.341);
    expect(result.metrics.mae).toBe(1.52);
    expect(result.primaryMetric?.name).toBe('R² Score');
    expect(result.primaryMetric?.formatted).toBe('0.8520');
  });

  it('computes comparison deltas vs Champion baseline', () => {
    const currentMetrics = { accuracy: 0.88, f1_score: 0.86 };
    const championMetrics = { accuracy: 0.84, f1_score: 0.81 };

    const comp = compareWithChampion(currentMetrics, championMetrics);
    expect(comp).not.toBeNull();
    expect(comp?.metricKey).toBe('accuracy');
    expect(comp?.delta).toBeCloseTo(0.04, 4);
    expect(comp?.isImprovement).toBe(true);
    expect(comp?.deltaPercentage).toBeCloseTo(4.76, 1);
  });

  it('correctly flags lower error metrics as improvements in regression', () => {
    const currentMetrics = { rmse: 1.8 };
    const championMetrics = { rmse: 2.4 };

    const comp = compareWithChampion(currentMetrics, championMetrics);
    expect(comp).not.toBeNull();
    expect(comp?.isImprovement).toBe(true);
    expect(comp?.delta).toBeCloseTo(-0.6, 4);
  });
});
