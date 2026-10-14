/**
 * pipelineGuardian.ts -- Enterprise Pipeline Guardian & ML Impact Analyzer.
 *
 * Compares current Python code in Monaco Editor against the Visual Builder baseline configuration.
 * Generates plain-English ML Cause & Effect explanations and trade-offs before execution:
 *  - Algorithm changes (e.g. RandomForest -> LogisticRegression)
 *  - Train/Test split changes (e.g. test_size: 0.20 -> 0.30)
 *  - Preprocessing scalers (StandardScaler, MinMaxScaler, RobustScaler, None)
 *  - Imputation strategies (mean, median, most_frequent)
 *  - Cross-validation folds (e.g. 5 -> 10 folds)
 *  - Feature space alterations (added/removed columns)
 *  - Model hyperparameters (n_estimators, max_depth, learning_rate, C)
 */

import { parsePipelineTargetAndConfig } from './codeParser';
import type { ActiveTrainingConfiguration } from '../providers/ProjectContext';

export interface MLImpactDiff {
  id: string;
  category: 'algorithm' | 'split' | 'preprocessing' | 'features' | 'hyperparameters' | 'target' | 'cross_validation';
  badge: string;
  title: string;
  property: string;
  baselineDisplay: string;
  currentDisplay: string;
  severity: 'positive' | 'warning' | 'info';
  cause: string;
  expectedEffect: string;
  recommendation?: string;
}

export interface PipelineGuardianAnalysis {
  isIdentical: boolean;
  hasSignificantChanges: boolean;
  baseline: {
    algorithm: string;
    target: string;
    features: string[];
    split: number;
    scaler: string;
    imputer: string;
    cvFolds: number;
  };
  current: {
    algorithm?: string;
    target?: string;
    features?: string[];
    split?: number;
    scaler?: string;
    imputer?: string;
    cvFolds?: number;
  };
  impacts: MLImpactDiff[];
  summaryText: string;
}

const ALGORITHM_NAMES: Record<string, string> = {
  random_forest_classifier: 'Random Forest Classifier',
  random_forest_regressor: 'Random Forest Regressor',
  gradient_boosting_classifier: 'Gradient Boosting Classifier',
  gradient_boosting_regressor: 'Gradient Boosting Regressor',
  decision_tree_classifier: 'Decision Tree Classifier',
  decision_tree_regressor: 'Decision Tree Regressor',
  logistic_regression: 'Logistic Regression',
  linear_regression: 'Linear Regression',
  ridge: 'Ridge Regression',
  lasso: 'Lasso Regression',
  svc: 'Support Vector Classifier (SVC)',
  svr: 'Support Vector Regressor (SVR)',
  k_nearest_neighbors: 'K-Nearest Neighbors',
};

const SCALER_NAMES: Record<string, string> = {
  standard_scaler: 'StandardScaler (z-score)',
  min_max_scaler: 'MinMaxScaler ([0, 1])',
  robust_scaler: 'RobustScaler (IQR-based)',
  max_abs_scaler: 'MaxAbsScaler',
  none: 'None (Raw scale)',
};

export function analyzePipelineImpact(
  currentCode: string,
  baselineConfig?: ActiveTrainingConfiguration | null,
  baselineCode?: string | null
): PipelineGuardianAnalysis {
  const parsedCurrent = parsePipelineTargetAndConfig(currentCode);

  // Derive baseline: either from ActiveTrainingConfiguration or parsed from baselineCode
  const parsedBaselineCode = baselineCode ? parsePipelineTargetAndConfig(baselineCode) : null;

  const baseline = {
    algorithm: baselineConfig?.algorithm || parsedBaselineCode?.algorithm || 'random_forest_classifier',
    target: baselineConfig?.target_column || parsedBaselineCode?.target || 'target',
    features: baselineConfig?.feature_columns || parsedBaselineCode?.features || [],
    split: baselineConfig?.train_test_split ?? parsedBaselineCode?.testSplit ?? 0.8,
    scaler: baselineConfig?.scaler || parsedBaselineCode?.scaler || 'none',
    imputer: baselineConfig?.imputer || parsedBaselineCode?.imputer || 'mean',
    cvFolds: baselineConfig?.cv_folds ?? parsedBaselineCode?.cvFolds ?? 5,
  };

  const current = {
    algorithm: parsedCurrent.algorithm || baseline.algorithm,
    target: parsedCurrent.target || baseline.target,
    features: parsedCurrent.features && parsedCurrent.features.length > 0 ? parsedCurrent.features : baseline.features,
    split: parsedCurrent.testSplit ?? baseline.split,
    scaler: parsedCurrent.scaler || 'none',
    imputer: parsedCurrent.imputer || baseline.imputer,
    cvFolds: parsedCurrent.cvFolds ?? baseline.cvFolds,
  };

  const impacts: MLImpactDiff[] = [];

  // 1. Algorithm Comparison
  if (current.algorithm && current.algorithm !== baseline.algorithm) {
    const baseName = ALGORITHM_NAMES[baseline.algorithm] || baseline.algorithm;
    const currName = ALGORITHM_NAMES[current.algorithm] || current.algorithm;

    let cause = `Switched model family from ${baseName} to ${currName}.`;
    let expectedEffect = '';
    let severity: 'positive' | 'warning' | 'info' = 'info';

    if (current.algorithm === 'logistic_regression' && baseline.algorithm.includes('random_forest')) {
      cause = 'Switched from an ensemble of decision trees (Random Forest) to a linear model (Logistic Regression).';
      expectedEffect =
        'Instantaneous training speed and direct coefficient interpretability. However, assumes a linear decision boundary and cannot capture complex non-linear feature interactions without manual polynomial expansion.';
      severity = 'info';
    } else if (current.algorithm.includes('random_forest') && baseline.algorithm === 'logistic_regression') {
      cause = 'Switched from a linear classifier to a non-linear Random Forest ensemble.';
      expectedEffect =
        'Enables modeling of complex non-linear feature interactions without manual scaling. Higher memory footprint and training latency.';
      severity = 'positive';
    } else if (current.algorithm.includes('gradient_boosting')) {
      cause = `Switched from ${baseName} to sequential Gradient Boosting.`;
      expectedEffect =
        'Typically achieves superior predictive performance by sequentially correcting residual errors, but requires careful regularization (learning rate, early stopping) to prevent overfitting.';
      severity = 'positive';
    } else if (current.algorithm === 'decision_tree_classifier') {
      cause = 'Switched from an ensemble to a single Decision Tree.';
      expectedEffect =
        'Full visual explainability of decision paths, but susceptible to high variance and unstable predictions compared to ensemble bagging.';
      severity = 'warning';
    } else {
      expectedEffect = `Model inductive bias changed from ${baseName} to ${currName}. Evaluated metrics will reflect the new hypothesis class.`;
    }

    impacts.push({
      id: 'diff-algorithm',
      category: 'algorithm',
      badge: '⚡ Model Architecture',
      title: 'Algorithm Family Shift',
      property: 'algorithm',
      baselineDisplay: baseName,
      currentDisplay: currName,
      severity,
      cause,
      expectedEffect,
    });
  }

  // 2. Train/Test Split Comparison
  const baselineTestRatio = Math.round((1 - baseline.split) * 100);
  const currentTestRatio = Math.round((1 - current.split) * 100);

  if (Math.abs(baselineTestRatio - currentTestRatio) >= 1) {
    const baselineTrainRatio = 100 - baselineTestRatio;
    const currentTrainRatio = 100 - currentTestRatio;

    let cause = `Test split adjusted from ${baselineTestRatio}% to ${currentTestRatio}% (training split: ${baselineTrainRatio}% → ${currentTrainRatio}%).`;
    let expectedEffect = '';
    let severity: 'positive' | 'warning' | 'info' = 'info';

    if (currentTestRatio > baselineTestRatio) {
      expectedEffect = `Model trains on ${currentTrainRatio}% of the data instead of ${baselineTrainRatio}%; evaluation is computed on a larger ${currentTestRatio}% unseen test set. Provides tighter confidence bounds on test metrics, but reduces total training sample volume.`;
      severity = 'info';
    } else {
      expectedEffect = `Model receives more training data (${currentTrainRatio}% vs ${baselineTrainRatio}%), improving gradient convergence on smaller datasets. However, the smaller test holdout (${currentTestRatio}%) has higher variance in validation metrics.`;
      severity = currentTestRatio < 15 ? 'warning' : 'info';
    }

    impacts.push({
      id: 'diff-split',
      category: 'split',
      badge: '📊 Data Partitioning',
      title: 'Train / Test Partition Ratio',
      property: 'test_size',
      baselineDisplay: `${baselineTrainRatio}% Train / ${baselineTestRatio}% Test`,
      currentDisplay: `${currentTrainRatio}% Train / ${currentTestRatio}% Test`,
      severity,
      cause,
      expectedEffect,
      recommendation: currentTestRatio < 15 ? 'Test holdouts below 15% risk high score volatility.' : undefined,
    });
  }

  // 3. Preprocessing Scaler Comparison
  const baseScaler = baseline.scaler || 'none';
  const currScaler = current.scaler || 'none';

  if (baseScaler !== currScaler) {
    const baseScalerName = SCALER_NAMES[baseScaler] || baseScaler;
    const currScalerName = SCALER_NAMES[currScaler] || currScaler;

    let cause = `Feature scaling modified from ${baseScalerName} to ${currScalerName}.`;
    let expectedEffect = '';
    let severity: 'positive' | 'warning' | 'info' = 'info';

    if (currScaler === 'standard_scaler') {
      cause = 'StandardScaler (z-score standardization) added: transforms features to zero mean (μ=0) and unit variance (σ=1).';
      expectedEffect =
        'Prevents high-magnitude numerical features from dominating model weights. Crucial for distance-based estimators (KNN, SVM) and gradient-descent optimization (Logistic Regression).';
      severity = 'positive';
    } else if (currScaler === 'min_max_scaler') {
      cause = 'MinMaxScaler applied: compresses feature values strictly into the [0, 1] range.';
      expectedEffect =
        'Preserves zero values in sparse matrices, but can compress normal data if extreme outliers exist.';
      severity = 'info';
    } else if (currScaler === 'none') {
      cause = 'Feature scaling removed: raw unnormalized feature scales will be used.';
      expectedEffect =
        'Raw numerical ranges will directly influence optimization gradients and distance calculations. Features with large values will dominate model decision boundaries unless using tree-based algorithms.';
      severity = current.algorithm.includes('forest') || current.algorithm.includes('tree') ? 'info' : 'warning';
    } else {
      expectedEffect = `Feature distributions transformed using ${currScalerName}.`;
    }

    impacts.push({
      id: 'diff-scaler',
      category: 'preprocessing',
      badge: '🛡️ Feature Preprocessing',
      title: 'Numerical Scaling Strategy',
      property: 'scaler',
      baselineDisplay: baseScalerName,
      currentDisplay: currScalerName,
      severity,
      cause,
      expectedEffect,
    });
  }

  // 4. Imputation Strategy Comparison
  if (current.imputer && baseline.imputer && current.imputer !== baseline.imputer) {
    let cause = `Missing value imputation strategy switched from '${baseline.imputer}' to '${current.imputer}'.`;
    let expectedEffect = '';
    let severity: 'positive' | 'warning' | 'info' = 'info';

    if (current.imputer === 'median') {
      cause = 'Switched missing value replacement strategy from mean to median.';
      expectedEffect =
        'Median imputation is resilient to skewed feature distributions and extreme outliers, preventing outlier distortion in imputations.';
      severity = 'positive';
    } else if (current.imputer === 'most_frequent') {
      cause = 'Switched to most-frequent (mode) imputation.';
      expectedEffect =
        'Best suited for categorical or discrete count features, replacing nulls with the dominant class.';
      severity = 'info';
    } else {
      expectedEffect = `Missing entries will now be imputed via '${current.imputer}'.`;
    }

    impacts.push({
      id: 'diff-imputer',
      category: 'preprocessing',
      badge: '🛡️ Data Imputation',
      title: 'Missing Value Strategy',
      property: 'imputer',
      baselineDisplay: baseline.imputer,
      currentDisplay: current.imputer,
      severity,
      cause,
      expectedEffect,
    });
  }

  // 5. Cross-Validation Folds Comparison
  if (current.cvFolds && baseline.cvFolds && current.cvFolds !== baseline.cvFolds) {
    const cause = `K-Fold cross-validation folds adjusted from ${baseline.cvFolds} to ${current.cvFolds} folds.`;
    const isHigher = current.cvFolds > baseline.cvFolds;
    const expectedEffect = isHigher
      ? `Increasing to ${current.cvFolds} folds reduces estimation variance and pessimistic bias, but increases total training run time proportionally (${current.cvFolds} fits vs ${baseline.cvFolds} fits).`
      : `Decreasing to ${current.cvFolds} folds reduces training time, but each fold tests on a larger partition, which may slightly underestimate model capacity.`;

    impacts.push({
      id: 'diff-cv',
      category: 'cross_validation',
      badge: '🔄 Cross-Validation',
      title: 'Validation Fold Strategy',
      property: 'cv_folds',
      baselineDisplay: `${baseline.cvFolds} folds`,
      currentDisplay: `${current.cvFolds} folds`,
      severity: 'info',
      cause,
      expectedEffect,
    });
  }

  // 6. Feature Space Changes
  const baseFeatSet = new Set(baseline.features);
  const currFeatSet = new Set(current.features);

  const addedFeatures = (current.features || []).filter((f) => !baseFeatSet.has(f));
  const removedFeatures = (baseline.features || []).filter((f) => !currFeatSet.has(f));

  if (addedFeatures.length > 0 || removedFeatures.length > 0) {
    const parts: string[] = [];
    if (addedFeatures.length > 0) parts.push(`Added: [${addedFeatures.join(', ')}]`);
    if (removedFeatures.length > 0) parts.push(`Removed: [${removedFeatures.join(', ')}]`);

    const cause = `Feature selection modified. ${parts.join('; ')}.`;
    const expectedEffect =
      addedFeatures.length > 0
        ? `Added ${addedFeatures.length} feature(s), expanding the feature space dimensionality. Verify that added columns do not introduce post-event data leakage.`
        : `Removed ${removedFeatures.length} feature(s), regularizing the model by eliminating potentially noisy or non-informative attributes.`;

    impacts.push({
      id: 'diff-features',
      category: 'features',
      badge: '🧩 Feature Space',
      title: 'Input Feature Selection',
      property: 'feature_columns',
      baselineDisplay: `${baseline.features.length} features`,
      currentDisplay: `${current.features.length} features (${addedFeatures.length > 0 ? `+${addedFeatures.length}` : ''}${removedFeatures.length > 0 ? `-${removedFeatures.length}` : ''})`,
      severity: addedFeatures.length > 0 ? 'info' : 'positive',
      cause,
      expectedEffect,
    });
  }

  // 7. Target Column Changes
  if (current.target && baseline.target && current.target !== baseline.target) {
    impacts.push({
      id: 'diff-target',
      category: 'target',
      badge: '🎯 Target Objective',
      title: 'Prediction Target Column',
      property: 'target_column',
      baselineDisplay: baseline.target,
      currentDisplay: current.target,
      severity: 'warning',
      cause: `Prediction target changed from '${baseline.target}' to '${current.target}'.`,
      expectedEffect:
        'Fundamentally alters the learning objective and problem definition. Previous benchmark metrics, accuracy scores, and loss values cannot be directly compared.',
      recommendation: 'Verify that the new target corresponds to the intended prediction task.',
    });
  }

  // 8. Hyperparameter Changes
  const hyp = parsedCurrent.hyperparameters || {};
  const baseHyp = parsedBaselineCode?.hyperparameters || {};

  if (hyp.n_estimators !== undefined) {
    const baseN = baseHyp.n_estimators ?? 100;
    const currN = hyp.n_estimators;
    if (currN !== baseN) {
      impacts.push({
        id: 'diff-n-estimators',
        category: 'hyperparameters',
        badge: '⚙️ Hyperparameter',
        title: 'Ensemble Estimator Count',
        property: 'n_estimators',
        baselineDisplay: `${baseN} estimators`,
        currentDisplay: `${currN} estimators`,
        severity: currN > 250 ? 'info' : 'positive',
        cause: `Ensemble tree count adjusted from ${baseN} to ${currN}.`,
        expectedEffect:
          currN > baseN
            ? 'Reduces prediction variance and stabilizes decision boundaries, but yields diminishing returns beyond 200 trees while linearly increasing training latency.'
            : 'Reduces training latency, but may increase prediction variance compared to larger ensembles.',
      });
    }
  }

  if (hyp.max_depth !== undefined) {
    const baseD = baseHyp.max_depth ?? null;
    const currD = hyp.max_depth;
    if (currD !== baseD) {
      impacts.push({
        id: 'diff-max-depth',
        category: 'hyperparameters',
        badge: '⚙️ Hyperparameter',
        title: 'Maximum Tree Depth',
        property: 'max_depth',
        baselineDisplay: baseD === null ? 'None (Unbounded)' : `${baseD} levels`,
        currentDisplay: currD === null ? 'None' : `${currD} levels`,
        severity: currD !== null ? 'positive' : 'warning',
        cause: currD !== null ? `Constrained maximum tree depth to ${currD} levels.` : 'Unconstrained tree depth.',
        expectedEffect:
          currD !== null
            ? `Regularizes tree depth to ${currD}, directly combating overfitting on high-variance training features.`
            : 'Allows decision trees to grow arbitrarily deep, increasing the risk of leaf-node memorization and overfitting on small datasets.',
      });
    }
  }

  if (hyp.learning_rate !== undefined) {
    const baseLr = baseHyp.learning_rate ?? 0.1;
    const lr = hyp.learning_rate;
    if (lr !== baseLr) {
      impacts.push({
        id: 'diff-learning-rate',
        category: 'hyperparameters',
        badge: '⚙️ Hyperparameter',
        title: 'Boosting Learning Rate',
        property: 'learning_rate',
        baselineDisplay: `${baseLr}`,
        currentDisplay: `${lr}`,
        severity: lr < 0.05 ? 'positive' : 'info',
        cause: `Gradient boosting shrinkage step adjusted from ${baseLr} to ${lr}.`,
        expectedEffect:
          lr < baseLr
            ? 'Smaller shrinkage values prevent overshooting loss minima, but require a higher number of estimators (n_estimators) to achieve convergence.'
            : 'Larger learning rates converge in fewer iterations, but risk oscillating or diverging around loss minima.',
      });
    }
  }

  const isIdentical = impacts.length === 0;
  const hasSignificantChanges = impacts.some((i) => i.severity === 'warning' || i.category === 'algorithm' || i.category === 'target');

  const summaryText = isIdentical
    ? 'Code matches the visual pipeline baseline. Execution will train the exact configuration specified in the Visual Builder.'
    : `Detected ${impacts.length} machine learning architectural modification${impacts.length > 1 ? 's' : ''} compared to the visual baseline.`;

  return {
    isIdentical,
    hasSignificantChanges,
    baseline,
    current,
    impacts,
    summaryText,
  };
}
