/**
 * metricExtractor.ts — True metric extraction from Python execution logs
 * and baseline comparison vs Champion models.
 */

export interface ExtractedMetrics {
  metrics: Record<string, number>;
  primaryMetric: {
    name: string;
    key: string;
    value: number;
    formatted: string;
  } | null;
  problemType: 'classification' | 'regression';
}

export interface MetricComparison {
  metricKey: string;
  metricName: string;
  currentValue: number;
  championValue: number;
  delta: number;
  deltaPercentage: number;
  isImprovement: boolean;
  isEqual: boolean;
}

const REGRESSION_ERROR_METRICS = new Set(['mae', 'mse', 'rmse', 'mean_absolute_error', 'mean_squared_error', 'root_mean_squared_error']);

/**
 * Parses Python execution output lines to extract scikit-learn metrics.
 */
export function extractExecutionMetrics(outputLines: string[]): ExtractedMetrics {
  const metrics: Record<string, number> = {};
  const fullText = outputLines.join('\n');

  // 1. Accuracy
  // Matches: "Test Accuracy: 0.8800", "Accuracy: 0.88", "accuracy = 0.88"
  const accMatch = fullText.match(/(?:Test\s+)?Accuracy\s*[:=]\s*([0-9.]+)/i);
  if (accMatch) {
    const val = parseFloat(accMatch[1]);
    if (!isNaN(val)) metrics.accuracy = val;
  }

  // 2. R² Score
  // Matches: "Test R² Score: 0.8520", "Test R2 Score: 0.85", "R2 Score: 0.85", "r2_score: 0.85"
  const r2Match = fullText.match(/(?:Test\s+)?R[²2](?:\s*Score)?\s*[:=]\s*([0-9.-]+)/i) ||
                  fullText.match(/r2_score\s*[:=]\s*([0-9.-]+)/i);
  if (r2Match) {
    const val = parseFloat(r2Match[1]);
    if (!isNaN(val)) metrics.r2_score = val;
  }

  // 3. RMSE
  // Matches: "Test RMSE: 2.3410", "RMSE: 2.34"
  const rmseMatch = fullText.match(/(?:Test\s+)?RMSE\s*[:=]\s*([0-9.]+)/i);
  if (rmseMatch) {
    const val = parseFloat(rmseMatch[1]);
    if (!isNaN(val)) metrics.rmse = val;
  }

  // 4. MAE
  // Matches: "Test MAE: 1.2340", "MAE: 1.23"
  const maeMatch = fullText.match(/(?:Test\s+)?MAE\s*[:=]\s*([0-9.]+)/i);
  if (maeMatch) {
    const val = parseFloat(maeMatch[1]);
    if (!isNaN(val)) metrics.mae = val;
  }

  // 5. F1 Score
  // Matches: "F1 Score: 0.86", "f1_score: 0.86"
  const f1Match = fullText.match(/(?:Test\s+)?F1(?:\s*Score)?\s*[:=]\s*([0-9.]+)/i) ||
                  fullText.match(/f1_score\s*[:=]\s*([0-9.]+)/i);
  if (f1Match) {
    const val = parseFloat(f1Match[1]);
    if (!isNaN(val)) metrics.f1_score = val;
  }

  // 6. Precision
  const precMatch = fullText.match(/(?:Test\s+)?Precision\s*[:=]\s*([0-9.]+)/i);
  if (precMatch) {
    const val = parseFloat(precMatch[1]);
    if (!isNaN(val)) metrics.precision = val;
  }

  // 7. Recall
  const recMatch = fullText.match(/(?:Test\s+)?Recall\s*[:=]\s*([0-9.]+)/i);
  if (recMatch) {
    const val = parseFloat(recMatch[1]);
    if (!isNaN(val)) metrics.recall = val;
  }

  // 8. Classification Report parser (weighted avg fallback)
  // Example: "weighted avg       0.88      0.88      0.88        50"
  const reportWeightedMatch = fullText.match(/weighted avg\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)/i);
  if (reportWeightedMatch) {
    if (metrics.precision === undefined) metrics.precision = parseFloat(reportWeightedMatch[1]);
    if (metrics.recall === undefined) metrics.recall = parseFloat(reportWeightedMatch[2]);
    if (metrics.f1_score === undefined) metrics.f1_score = parseFloat(reportWeightedMatch[3]);
  }

  // Determine problem type and primary metric
  const isRegression = metrics.r2_score !== undefined || metrics.rmse !== undefined || metrics.mae !== undefined;
  const problemType: 'classification' | 'regression' = isRegression ? 'regression' : 'classification';

  let primaryMetric: ExtractedMetrics['primaryMetric'] = null;

  if (problemType === 'regression') {
    if (metrics.r2_score !== undefined) {
      primaryMetric = {
        name: 'R² Score',
        key: 'r2_score',
        value: metrics.r2_score,
        formatted: metrics.r2_score.toFixed(4),
      };
    } else if (metrics.rmse !== undefined) {
      primaryMetric = {
        name: 'RMSE',
        key: 'rmse',
        value: metrics.rmse,
        formatted: metrics.rmse.toFixed(4),
      };
    } else if (metrics.mae !== undefined) {
      primaryMetric = {
        name: 'MAE',
        key: 'mae',
        value: metrics.mae,
        formatted: metrics.mae.toFixed(4),
      };
    }
  } else {
    if (metrics.accuracy !== undefined) {
      primaryMetric = {
        name: 'Accuracy',
        key: 'accuracy',
        value: metrics.accuracy,
        formatted: `${(metrics.accuracy * 100).toFixed(2)}%`,
      };
    } else if (metrics.f1_score !== undefined) {
      primaryMetric = {
        name: 'F1 Score',
        key: 'f1_score',
        value: metrics.f1_score,
        formatted: `${(metrics.f1_score * 100).toFixed(2)}%`,
      };
    }
  }

  return {
    metrics,
    primaryMetric,
    problemType,
  };
}

/**
 * Compares current run metrics against a Champion baseline.
 */
export function compareWithChampion(
  currentMetrics: Record<string, number>,
  championMetrics?: Record<string, any> | null
): MetricComparison | null {
  if (!championMetrics) return null;

  // Determine which metric to compare
  const candidateKeys = ['accuracy', 'r2_score', 'r2', 'f1_score', 'f1', 'rmse', 'mae'];
  let targetKey: string | null = null;

  for (const k of candidateKeys) {
    if (typeof currentMetrics[k] === 'number' && typeof championMetrics[k] === 'number') {
      targetKey = k;
      break;
    }
  }

  if (!targetKey) return null;

  const currentVal = currentMetrics[targetKey];
  const champVal = Number(championMetrics[targetKey]);
  if (!Number.isFinite(currentVal) || !Number.isFinite(champVal)) return null;

  const delta = currentVal - champVal;
  const isLowerBetter = REGRESSION_ERROR_METRICS.has(targetKey.toLowerCase());
  const isImprovement = isLowerBetter ? delta < 0 : delta > 0;
  const isEqual = Math.abs(delta) < 0.00001;

  const denominator = Math.abs(champVal) > 0.00001 ? Math.abs(champVal) : 1;
  const deltaPercentage = (delta / denominator) * 100;

  const metricName = targetKey
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return {
    metricKey: targetKey,
    metricName,
    currentValue: currentVal,
    championValue: champVal,
    delta,
    deltaPercentage,
    isImprovement,
    isEqual,
  };
}
