/**
 * Unified Heads-Up Rule Registry (Part B).
 *
 * Implements:
 * - B1: Identifier column selected as a feature
 * - B2: Target leakage (numeric |correlation| >= 0.90, categorical Cramér's V >= 0.85)
 * - B3: Suspiciously high test score (info: "worth checking for leakage")
 * - B4: Baseline comparison (majority-class accuracy / mean predictor) & warning when barely beating baseline
 * - B5: Small test set Wilson confidence interval
 * - B6: Overfitting train vs CV/test score gap
 * - B7: Preprocessing leakage (scaler/imputer fit before train_test_split in code)
 * - B8: Test-set reuse across multiple runs
 */

import { HeadsUpRule, HeadsUpCard, LearningProjectState, HeadsUpTriggerResult } from './types'

export function calculateWilsonInterval(
  accuracy: number,
  n: number,
  confidence = 0.95,
): [number, number] {
  if (n <= 0) return [accuracy, accuracy]
  const z = confidence === 0.99 ? 2.576 : 1.96
  const p = Math.max(0, Math.min(1, accuracy))
  const denominator = 1 + (z * z) / n
  const centre = (p + (z * z) / (2 * n)) / denominator
  const spread = (z / denominator) * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))
  const lower = Math.max(0, centre - spread)
  const upper = Math.min(1, centre + spread)
  return [Number(lower.toFixed(4)), Number(upper.toFixed(4))]
}

export function calculateMajorityBaseline(
  classCounts?: Record<string, number>,
): { baselineValue: number; percentage: number; majorityClass: string } {
  if (!classCounts || Object.keys(classCounts).length === 0) {
    return { baselineValue: 0.5, percentage: 50.0, majorityClass: 'Majority' }
  }
  let maxCount = 0
  let total = 0
  let majorityClass = ''
  for (const [cls, cnt] of Object.entries(classCounts)) {
    total += cnt
    if (cnt > maxCount) {
      maxCount = cnt
      majorityClass = cls
    }
  }
  const ratio = total > 0 ? maxCount / total : 0.5
  return {
    baselineValue: Number(ratio.toFixed(4)),
    percentage: Number((ratio * 100).toFixed(1)),
    majorityClass,
  }
}

export const HEADS_UP_RULES: HeadsUpRule[] = [
  // B1: Identifier column selected as a feature
  {
    id: 'rule_identifier_feature',
    title: 'Identifier Column Selected as Feature',
    severity: 'warning',
    lesson_id: 'lesson-02-missing-identifiers',
    message: 'An identifier column is included among your model features.',
    why_it_matters:
      'Database keys, user UUIDs, or row IDs carry no generalizing predictive relationship. Decision trees will easily split on unique IDs to artificially lower training error while failing on real future data.',
    how_to_fix: 'Uncheck the identifier column from your feature selection list.',
    trigger: (state: LearningProjectState): HeadsUpTriggerResult | null => {
      const governance = state.dataset?.profile?.governance
      const idColumns = new Set(governance?.identifier_columns || [])

      // Also check standard ID patterns in feature names
      const idPattern = /^(id|_id|uuid|account_id|customer_id|user_id|row_id|account_seq_id)$/i
      const flagged = state.selectedFeatures.filter(
        (f) => idColumns.has(f) || idPattern.test(f),
      )

      if (flagged.length > 0) {
        return {
          triggered: true,
          message: `The following identifier column(s) are selected as features: ${flagged.join(', ')}.`,
          details: { flagged_columns: flagged },
        }
      }
      return null
    },
  },

  // B2: Target leakage
  {
    id: 'rule_target_leakage',
    title: 'Potential Target Leakage Detected',
    severity: 'warning',
    lesson_id: 'lesson-03-features-target-leakage',
    message: 'One or more selected features share near-perfect correlation or association with the target.',
    why_it_matters:
      'Target leakage happens when a feature includes post-event outcome information that would not be available when generating real predictions in production.',
    how_to_fix: 'Inspect and drop features that occur after the event or deterministically encode the target.',
    trigger: (state: LearningProjectState): HeadsUpTriggerResult | null => {
      // 1. Direct target included as feature
      if (state.selectedTarget && state.selectedFeatures.includes(state.selectedTarget)) {
        return {
          triggered: true,
          message: `The target column '${state.selectedTarget}' was included in the input feature list.`,
          details: { leaked_features: [state.selectedTarget], reason: 'target_in_features' },
        }
      }

      // 2. Profiler governance leakage findings
      const leakedFindings: any[] = state.dataset?.profile?.governance?.leaked_features || []
      const selectedLeaked = leakedFindings.filter(
        (item: any) => state.selectedFeatures.includes(item.feature) && (item.correlation >= 0.90 || item.severity === 'critical'),
      )

      if (selectedLeaked.length > 0) {
        const names = selectedLeaked.map((item: any) => `${item.feature} (score=${item.correlation})`).join(', ')
        return {
          triggered: true,
          message: `Features with extreme target correlation/association selected: ${names}.`,
          details: { leaked_features: selectedLeaked },
        }
      }
      return null
    },
  },

  // B3: Suspiciously high test score
  {
    id: 'rule_suspicious_high_score',
    title: 'Suspiciously High Test Metric',
    severity: 'info',
    lesson_id: 'lesson-03-features-target-leakage',
    message: 'The evaluated model achieved a test score above 99%. It is worth checking for leakage.',
    why_it_matters:
      'Near-perfect test metrics (accuracy or R² > 0.99) on real-world problems are uncommon and often stem from subtle feature leakage or test split contamination rather than genuine algorithm strength.',
    how_to_fix: 'Review your feature list for proxy target columns or ensure test data was partitioned before feature transformations.',
    trigger: (state: LearningProjectState): HeadsUpTriggerResult | null => {
      const metrics = state.activeJob?.metrics
      if (!metrics) return null

      const acc = metrics.accuracy ?? metrics.test_accuracy
      const r2 = metrics.r2_score ?? metrics.r2
      const roc = metrics.roc_auc ?? metrics.auc

      const isSuspicious = (acc !== undefined && acc >= 0.99) ||
                           (r2 !== undefined && r2 >= 0.99) ||
                           (roc !== undefined && roc >= 0.99)

      if (isSuspicious) {
        const val = acc ?? r2 ?? roc
        return {
          triggered: true,
          message: `Model achieved test score of ${((val as number) * 100).toFixed(1)}%. Worth checking for feature leakage.`,
          details: { metric_value: val },
        }
      }
      return null
    },
  },

  // B4: Baseline comparison (majority class / mean predictor)
  {
    id: 'rule_baseline_comparison',
    title: 'Model Barely Outperforms Naive Baseline',
    severity: 'warning',
    lesson_id: 'lesson-07-metrics-thresholds',
    message: 'On imbalanced data, this model’s accuracy barely beats a dummy majority-class predictor.',
    why_it_matters:
      'When 95% of rows belong to one class, a model that predicts the majority class for all rows gets 95% accuracy without learning anything. Evaluating with accuracy alone hides failure on the minority class.',
    how_to_fix: 'Evaluate using Balanced Accuracy, Recall, or PR-AUC, and adjust the decision threshold.',
    trigger: (state: LearningProjectState): HeadsUpTriggerResult | null => {
      const task = state.taskType || (state.activeJob?.metrics?.r2 !== undefined ? 'regression' : 'classification')
      if (task === 'regression') return null

      const acc = state.activeJob?.metrics?.accuracy ?? state.activeJob?.metrics?.test_accuracy
      if (acc === undefined) return null

      const baselineInfo = calculateMajorityBaseline(state.classDistribution)
      // If dataset is imbalanced (majority >= 70%) and model accuracy is within 2% of baseline
      if (baselineInfo.baselineValue >= 0.70 && acc <= baselineInfo.baselineValue + 0.02) {
        return {
          triggered: true,
          message: `Model accuracy (${(acc * 100).toFixed(1)}%) is nearly identical to the naive majority-class baseline (${baselineInfo.percentage}%).`,
          details: { model_accuracy: acc, baseline: baselineInfo },
        }
      }
      return null
    },
  },

  // B5: Small test set Wilson confidence interval
  {
    id: 'rule_small_test_set',
    title: 'High Uncertainty from Small Test Sample',
    severity: 'info',
    lesson_id: 'lesson-04-train-test-split',
    message: 'The test split contains fewer than 100 instances; reported accuracy has a wide confidence interval.',
    why_it_matters:
      'With small test sets, random sample variance strongly impacts observed accuracy. A model scoring 80% on 25 samples has a 95% Wilson confidence interval spanning 60% to 92%.',
    how_to_fix: 'Use K-fold cross-validation or collect more test samples to narrow confidence intervals.',
    trigger: (state: LearningProjectState): HeadsUpTriggerResult | null => {
      const acc = state.activeJob?.metrics?.accuracy ?? state.activeJob?.metrics?.test_accuracy
      if (acc === undefined) return null

      const totalRows = state.dataset?.rowCount ?? state.dataset?.row_count
      const testN = state.testSampleCount ||
        (totalRows && state.splitRatio ? Math.round(totalRows * (1 - state.splitRatio)) : null)

      if (testN !== null && testN > 0 && testN < 100) {
        const [low, high] = calculateWilsonInterval(acc, testN)
        return {
          triggered: true,
          message: `Test sample size is N=${testN}. 95% Wilson confidence interval for ${(acc * 100).toFixed(1)}% accuracy is [${(low * 100).toFixed(1)}%, ${(high * 100).toFixed(1)}%].`,
          details: { n: testN, accuracy: acc, lower: low, upper: high },
        }
      }
      return null
    },
  },

  // B6: Overfitting train vs CV/test score gap
  {
    id: 'rule_overfitting_gap',
    title: 'Substantial Overfitting Gap Detected',
    severity: 'warning',
    lesson_id: 'lesson-06-overfitting-cv',
    message: 'Training score is significantly higher than validation/test score (>15% gap).',
    why_it_matters:
      'A wide gap between training score and validation score indicates high variance: the estimator has memorized noise in the training split that does not generalize to new samples.',
    how_to_fix: 'Add regularization (e.g. limit max_depth, increase min_samples_split, or add L1/L2 penalties) or prune features.',
    trigger: (state: LearningProjectState): HeadsUpTriggerResult | null => {
      const metrics = state.activeJob?.metrics
      if (!metrics) return null

      const trainScore = metrics.train_accuracy ?? metrics.train_score ?? metrics.training_accuracy
      const testScore = metrics.test_accuracy ?? metrics.accuracy ?? metrics.val_accuracy ?? metrics.test_score

      if (trainScore !== undefined && testScore !== undefined) {
        const gap = trainScore - testScore
        if (gap >= 0.15) {
          return {
            triggered: true,
            message: `Train score (${(trainScore * 100).toFixed(1)}%) exceeds test score (${(testScore * 100).toFixed(1)}%) by ${(gap * 100).toFixed(1)} percentage points.`,
            details: { train_score: trainScore, test_score: testScore, gap },
          }
        }
      }
      return null
    },
  },

  // B7: Preprocessing leakage
  {
    id: 'rule_preprocessing_leakage',
    title: 'Preprocessing Leakage in Code',
    severity: 'warning',
    lesson_id: 'lesson-05-first-model-code',
    message: 'Data scaler or imputer was fitted before train_test_split in code.',
    why_it_matters:
      'Fitting scalers or imputers on the full dataset before splitting leaks test set statistics into the training features, leading to overly optimistic test performance.',
    how_to_fix: 'Split data first, then call fit_transform on training data only, or encapsulate preprocessing inside a scikit-learn Pipeline.',
    trigger: (state: LearningProjectState): HeadsUpTriggerResult | null => {
      const code = state.code
      if (!code) return null

      // Check for scaler/imputer fit calls before train_test_split in code
      const splitIndex = code.indexOf('train_test_split')
      const transformers = ['StandardScaler', 'MinMaxScaler', 'SimpleImputer', 'OneHotEncoder', 'RobustScaler']

      for (const t of transformers) {
        const transIndex = code.indexOf(t)
        const fitIndex = code.indexOf('.fit', transIndex)

        if (splitIndex !== -1 && fitIndex !== -1 && fitIndex < splitIndex) {
          return {
            triggered: true,
            message: `Transformer '${t}' is fitted before 'train_test_split' in code.`,
            details: { transformer: t, reason: 'fit_before_split' },
          }
        }

        // Also check if fit_transform is called directly on df / X before split
        const dfFitPattern = new RegExp(`${t}[^;]*?\\.fit_transform\\s*\\(\\s*(?:df|data|X)\\s*\\)`)
        if (splitIndex !== -1 && dfFitPattern.test(code)) {
          return {
            triggered: true,
            message: `Transformer '${t}' is applied to unpartitioned dataset variable rather than X_train.`,
            details: { transformer: t, reason: 'fit_on_full_dataset' },
          }
        }
      }

      return null
    },
  },

  // B8: Test-set reuse
  {
    id: 'rule_test_set_reuse',
    title: 'Repeated Test-Set Evaluation',
    severity: 'warning',
    lesson_id: 'lesson-06-overfitting-cv',
    message: 'Several model iterations were evaluated against the exact same test split.',
    why_it_matters:
      'Repeatedly tuning hyperparameters and selecting models based on the test split risks overfitting to that specific test subset. The test set becomes an informal validation set.',
    how_to_fix: 'Use K-Fold Cross-Validation on the training set for hyperparameter tuning and model selection, reserving the test set for final verification.',
    trigger: (state: LearningProjectState): HeadsUpTriggerResult | null => {
      const history = state.jobHistory || []
      // 3 or more completed runs without cross-validation
      if (history.length >= 3) {
        const completedRuns = history.filter((j) => j.status === 'COMPLETED')
        if (completedRuns.length >= 3) {
          return {
            triggered: true,
            message: `${completedRuns.length} runs have been evaluated on the same test split. Consider cross-validation to select the best candidate.`,
            details: { runs_count: completedRuns.length },
          }
        }
      }
      return null
    },
  },
]

/**
 * Evaluate all Heads-Up rules against the current project state.
 * Returns only active cards that have not been dismissed by the student.
 */
export function evaluateHeadsUpRules(
  state: LearningProjectState,
  dismissedCardIds: Set<string> = new Set(),
): HeadsUpCard[] {
  const cards: HeadsUpCard[] = []

  for (const rule of HEADS_UP_RULES) {
    if (dismissedCardIds.has(rule.id)) continue

    const result = rule.trigger(state)
    if (result && result.triggered) {
      cards.push({
        id: `${rule.id}-${state.activeJob?.job_id || 'active'}`,
        rule_id: rule.id,
        title: rule.title,
        severity: rule.severity,
        lesson_id: rule.lesson_id,
        message: result.message || rule.message,
        why_it_matters: rule.why_it_matters,
        how_to_fix: rule.how_to_fix,
        details: result.details,
      })
    }
  }

  return cards
}
