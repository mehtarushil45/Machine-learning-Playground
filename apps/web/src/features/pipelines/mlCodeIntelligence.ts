/**
 * ML Code Intelligence Engine -- Schema-Aware Completions, Hover Docstrings & Signatures
 *
 * Implements Phase 5 ML-Native Editing:
 *  5.1 Schema-aware completions: column names inside df["..."], targets and features from active schema
 *  5.2 Hover and signature help from pinned library docstrings (scikit-learn 1.9.0, Python 3.12, pandas, joblib)
 *  5.3 Complete ML snippet set with educational explanations for Learning Mode
 */

export interface DatasetColumnInfo {
  name: string;
  type?: string;
}

export interface MLCompletionItem {
  label: string;
  kind: number; // Monaco CompletionItemKind
  detail: string;
  documentation: string;
  insertText: string;
  isSnippet?: boolean;
  sortText?: string;
}

export interface MLHoverInfo {
  contents: string[];
}

export interface MLSignatureParam {
  label: string;
  documentation: string;
}

export interface MLSignatureInfo {
  label: string;
  documentation: string;
  parameters: MLSignatureParam[];
}

export interface MLSnippetDefinition {
  id: string;
  label: string;
  title: string;
  insertText: string;
  documentation: string;
  learningExplanation: string;
}

/* ── 5.3 Small Snippet Set with Working Code & Educational Explanations ───── */
export const ML_SNIPPETS: MLSnippetDefinition[] = [
  {
    id: 'train-test-split',
    label: 'snippet:train-test-split',
    title: 'Train / Test Partitioning',
    insertText: [
      'from sklearn.model_selection import train_test_split',
      '',
      '# 1. Partition features and target into train (80%) and test (20%) sets',
      'X_train, X_test, y_train, y_test = train_test_split(',
      '    ${1:X}, ${2:y}, test_size=${3:0.2}, random_state=42${4:, stratify=y}',
      ')',
      'print(f"Dataset split: {len(X_train)} train rows, {len(X_test)} test rows")',
    ].join('\n'),
    documentation: 'Split dataset arrays into unbiased train and test partitions with random seed',
    learningExplanation:
      'Always partition data before fitting scalers, encoders, or models. Fitting preprocessing transformers on the full dataset before splitting leaks test distribution information into training, resulting in falsely optimistic validation scores (Data Leakage).',
  },
  {
    id: 'ml-pipeline',
    label: 'snippet:ml-pipeline',
    title: 'Scikit-Learn Pipeline',
    insertText: [
      'from sklearn.pipeline import Pipeline',
      'from sklearn.preprocessing import StandardScaler',
      'from sklearn.impute import SimpleImputer',
      'from sklearn.ensemble import RandomForestClassifier',
      '',
      '# 2. Encapsulate preprocessing and estimator inside a leak-proof Pipeline',
      'pipeline = Pipeline([',
      '    ("imputer", SimpleImputer(strategy="median")),',
      '    ("scaler", StandardScaler()),',
      '    ("classifier", RandomForestClassifier(n_estimators=100, random_state=42)),',
      '])',
      'pipeline.fit(X_train, y_train)',
      'print("Pipeline successfully fitted without data leakage.")',
    ].join('\n'),
    documentation: 'Complete scikit-learn Pipeline encapsulating imputation, scaling, and classification',
    learningExplanation:
      'Wrapping transformers and models into a single Pipeline ensures preprocessing parameters (such as mean and variance) are computed strictly from training folds during cross-validation, completely eliminating leakage.',
  },
  {
    id: 'cross-validation',
    label: 'snippet:cross-validation',
    title: 'K-Fold Cross-Validation',
    insertText: [
      'from sklearn.model_selection import cross_val_score',
      '',
      '# 3. Perform 5-fold cross-validation to assess generalization variance',
      'cv_scores = cross_val_score(${1:pipeline}, ${2:X_train}, ${3:y_train}, cv=5)',
      'print(f"5-Fold CV Accuracy: {cv_scores.mean():.4f} (+/- {cv_scores.std():.4f})")',
    ].join('\n'),
    documentation: 'Evaluate model stability and generalization across 5 cross-validation splits',
    learningExplanation:
      'A single train/test split can be lucky or unlucky depending on the seed. K-fold cross-validation partitions training data into K subsets and computes metric variance, giving an honest measure of model stability.',
  },
  {
    id: 'confusion-matrix',
    label: 'snippet:confusion-matrix',
    title: 'Confusion Matrix & Classification Report',
    insertText: [
      'from sklearn.metrics import confusion_matrix, classification_report',
      '',
      '# 4. Diagnostic evaluation on the held-out test split',
      'y_pred = ${1:pipeline}.predict(X_test)',
      'cm = confusion_matrix(y_test, y_pred)',
      'print("Confusion Matrix:")',
      'print(cm)',
      'print("\\nDetailed Classification Report:")',
      'print(classification_report(y_test, y_pred))',
    ].join('\n'),
    documentation: 'Inspect precision, recall, f1-score, and quadrant misclassifications',
    learningExplanation:
      'Accuracy alone can be misleading on imbalanced datasets (e.g. 99% accuracy by predicting only the majority class). A confusion matrix breaks down False Positives (Type I errors) and False Negatives (Type II errors) to expose true model behavior.',
  },
  {
    id: 'feature-importance',
    label: 'snippet:feature-importance',
    title: 'Feature Importance Attribution',
    insertText: [
      'import pandas as pd',
      '',
      '# 5. Extract feature importances from tree-based estimator',
      'clf = getattr(${1:pipeline}, "named_steps", {}).get("classifier", ${1:pipeline})',
      'if hasattr(clf, "feature_importances_"):',
      '    feat_imp = pd.Series(clf.feature_importances_, index=${2:X_train.columns}).sort_values(ascending=False)',
      '    print("Top Feature Importances:")',
      '    print(feat_imp.head(10))',
    ].join('\n'),
    documentation: 'Extract and rank Gini impurity reduction across feature columns',
    learningExplanation:
      'Feature importance quantifies how much each input column contributed to decreasing impurity across all decision trees. Features with near-zero importance can often be pruned to reduce model complexity and latency.',
  },
];

/* ── 5.2 Pinned Library Docstrings & Signatures (scikit-learn 1.9, Python 3.12) ── */
export const ML_DOCSTRINGS: Record<string, string> = {
  RandomForestClassifier: [
    '### `class sklearn.ensemble.RandomForestClassifier`',
    '*Version: scikit-learn 1.9.0 | Runtime: Python 3.12*',
    '',
    'A random forest is a meta estimator that fits a number of decision tree classifiers on various sub-samples of the dataset and uses averaging to improve predictive accuracy and control over-fitting.',
    '',
    '#### Key Parameters:',
    '- `n_estimators` *(int, default=100)*: The number of trees in the forest.',
    '- `criterion` *({"gini", "entropy", "log_loss"}, default="gini")*: Split quality measure.',
    '- `max_depth` *(int, default=None)*: Maximum depth of the tree. If None, nodes are expanded until pure.',
    '- `min_samples_split` *(int or float, default=2)*: Minimum samples required to split an internal node.',
    '- `random_state` *(int, default=None)*: Controls randomness of bootstrapping and feature selection.',
    '',
    '#### Methods:',
    '- `fit(X, y)`: Build forest of trees from training set.',
    '- `predict(X)`: Predict classes for X.',
    '- `predict_proba(X)`: Predict class probabilities for X.',
    '- `score(X, y)`: Return mean accuracy on test data.',
  ].join('\n'),

  GradientBoostingClassifier: [
    '### `class sklearn.ensemble.GradientBoostingClassifier`',
    '*Version: scikit-learn 1.9.0 | Runtime: Python 3.12*',
    '',
    'Gradient Boosting classification builds an additive model in a forward stage-wise fashion, optimizing arbitrary differentiable loss functions.',
    '',
    '#### Key Parameters:',
    '- `learning_rate` *(float, default=0.1)*: Shrinks contribution of each tree.',
    '- `n_estimators` *(int, default=100)*: Number of boosting stages to perform.',
    '- `max_depth` *(int, default=3)*: Maximum depth of individual regression estimators.',
    '- `subsample` *(float, default=1.0)*: Fraction of samples used for fitting base learners.',
    '- `random_state` *(int, default=None)*: Seed for reproducible random splits.',
  ].join('\n'),

  LogisticRegression: [
    '### `class sklearn.linear_model.LogisticRegression`',
    '*Version: scikit-learn 1.9.0 | Runtime: Python 3.12*',
    '',
    'Logistic Regression classifier using regularized linear models (L1, L2, ElasticNet).',
    '',
    '#### Key Parameters:',
    '- `C` *(float, default=1.0)*: Inverse of regularization strength (smaller = stronger regularization).',
    '- `penalty` *({"l1", "l2", "elasticnet", None}, default="l2")*: Norm of the penalty.',
    '- `solver` *({"lbfgs", "liblinear", "saga"}, default="lbfgs")*: Optimization algorithm.',
    '- `max_iter` *(int, default=1000)*: Maximum number of iterations for solver convergence.',
  ].join('\n'),

  StandardScaler: [
    '### `class sklearn.preprocessing.StandardScaler`',
    '*Version: scikit-learn 1.9.0 | Runtime: Python 3.12*',
    '',
    'Standardize features by removing the mean and scaling to unit variance: `z = (x - u) / s`.',
    '',
    '⚠️ **ML Guardrail**: Always fit on training split only (`scaler.fit(X_train)`) and transform test split (`scaler.transform(X_test)`) to avoid data leakage!',
    '',
    '#### Key Parameters:',
    '- `with_mean` *(bool, default=True)*: Center data before scaling.',
    '- `with_std` *(bool, default=True)*: Scale data to unit variance.',
  ].join('\n'),

  SimpleImputer: [
    '### `class sklearn.impute.SimpleImputer`',
    '*Version: scikit-learn 1.9.0 | Runtime: Python 3.12*',
    '',
    'Univariate imputer for completing missing values with simple statistical strategies.',
    '',
    '#### Key Parameters:',
    '- `strategy` *({"mean", "median", "most_frequent", "constant"}, default="mean")*: Imputation rule.',
    '- `missing_values` *(int, float, str, np.nan, default=np.nan)*: Placeholder for missing values.',
  ].join('\n'),

  Pipeline: [
    '### `class sklearn.pipeline.Pipeline`',
    '*Version: scikit-learn 1.9.0 | Runtime: Python 3.12*',
    '',
    'Sequentially apply a list of transforms and a final estimator. Intermediate steps must implement `fit` and `transform`.',
    '',
    '#### Benefits in ML Playground:',
    '- Completely prevents data leakage across train/validation splits.',
    '- Enables 1-Click export to model registry (`model.joblib`).',
  ].join('\n'),

  ColumnTransformer: [
    '### `class sklearn.compose.ColumnTransformer`',
    '*Version: scikit-learn 1.9.0 | Runtime: Python 3.12*',
    '',
    'Applies transformers to subsets of columns of an array or pandas DataFrame in parallel.',
    '',
    '#### Parameters:',
    '- `transformers`: List of `(name, transformer, columns)` tuples.',
    '- `remainder` *({"drop", "passthrough"}, default="drop")*: By default unlisted columns are dropped.',
  ].join('\n'),

  train_test_split: [
    '### `def sklearn.model_selection.train_test_split(*arrays, test_size=None, random_state=None, stratify=None)`',
    '*Version: scikit-learn 1.9.0 | Runtime: Python 3.12*',
    '',
    'Split arrays or matrices into random train and test subsets.',
    '',
    '#### Parameters:',
    '- `test_size` *(float, default=None)*: Proportion of the dataset to include in the test split (e.g. 0.2).',
    '- `random_state` *(int, default=None)*: Controls shuffling applied to the data before splitting.',
    '- `stratify` *(array-like, default=None)*: If specified, data is split in a stratified fashion.',
  ].join('\n'),

  cross_val_score: [
    '### `def sklearn.model_selection.cross_val_score(estimator, X, y=None, cv=5, scoring=None)`',
    '*Version: scikit-learn 1.9.0 | Runtime: Python 3.12*',
    '',
    'Evaluate a score by cross-validation across K folds.',
    '',
    '#### Parameters:',
    '- `estimator`: The object to use to fit the data.',
    '- `cv` *(int, default=5)*: Number of folds in a (Stratified)KFold.',
    '- `scoring` *(str, default=None)*: Evaluation metric string (e.g. "roc_auc", "f1", "accuracy").',
  ].join('\n'),

  confusion_matrix: [
    '### `def sklearn.metrics.confusion_matrix(y_true, y_pred, labels=None, normalize=None)`',
    '*Version: scikit-learn 1.9.0 | Runtime: Python 3.12*',
    '',
    'Compute confusion matrix to evaluate accuracy of classification predictions.',
    'Row index = True Class, Column index = Predicted Class.',
  ].join('\n'),

  classification_report: [
    '### `def sklearn.metrics.classification_report(y_true, y_pred, digits=2)`',
    '*Version: scikit-learn 1.9.0 | Runtime: Python 3.12*',
    '',
    'Build a text report showing Precision, Recall, F1-Score, and Support per class.',
  ].join('\n'),

  'joblib.dump': [
    '### `def joblib.dump(value, filename, compress=0)`',
    '*Version: joblib 1.4.2 | Runtime: Python 3.12*',
    '',
    'Persist an arbitrary Python object to disk. Models saved to `outputs/model.joblib` can be deployed via the Model Registry.',
  ].join('\n'),

  'pd.read_csv': [
    '### `def pandas.read_csv(filepath_or_buffer, ...)`',
    '*Version: pandas 2.2.3 | Runtime: Python 3.12*',
    '',
    'Read a comma-separated values (csv) file into pandas DataFrame.',
    'In ML Playground workspaces, staged project datasets reside at `data/dataset.csv`.',
  ].join('\n'),
};

/* ── 5.2 Parameter Signatures for Signature Help ─────────────────────────── */
export const ML_SIGNATURES: Record<string, MLSignatureInfo> = {
  train_test_split: {
    label: 'train_test_split(*arrays, test_size=0.2, random_state=42, stratify=None)',
    documentation: 'Split arrays or matrices into random train and test subsets.',
    parameters: [
      { label: '*arrays', documentation: 'Sequence of indexables with same length / shape[0]' },
      { label: 'test_size=0.2', documentation: 'Proportion of dataset to include in test split (e.g. 0.2 for 20%)' },
      { label: 'random_state=42', documentation: 'Seed for reproducible pseudo-random splitting' },
      { label: 'stratify=None', documentation: 'If provided, data is split preserving class proportions' },
    ],
  },
  RandomForestClassifier: {
    label: 'RandomForestClassifier(n_estimators=100, max_depth=None, min_samples_split=2, random_state=42)',
    documentation: 'A random forest classifier with ensemble decision trees.',
    parameters: [
      { label: 'n_estimators=100', documentation: 'The number of trees in the forest' },
      { label: 'max_depth=None', documentation: 'The maximum depth of individual trees (None = expanded until pure)' },
      { label: 'min_samples_split=2', documentation: 'Minimum samples required to split an internal node' },
      { label: 'random_state=42', documentation: 'Seed for reproducible bootstrapping and feature selection' },
    ],
  },
  GradientBoostingClassifier: {
    label: 'GradientBoostingClassifier(learning_rate=0.1, n_estimators=100, max_depth=3, random_state=42)',
    documentation: 'Gradient Boosting classification tree ensemble.',
    parameters: [
      { label: 'learning_rate=0.1', documentation: 'Learning rate shrinks contribution of each tree' },
      { label: 'n_estimators=100', documentation: 'Number of boosting stages to perform' },
      { label: 'max_depth=3', documentation: 'Maximum depth of individual regression trees' },
      { label: 'random_state=42', documentation: 'Seed for reproducible randomness' },
    ],
  },
  LogisticRegression: {
    label: 'LogisticRegression(C=1.0, max_iter=1000, random_state=42)',
    documentation: 'Regularized logistic regression linear model.',
    parameters: [
      { label: 'C=1.0', documentation: 'Inverse regularization strength (smaller = stronger penalty)' },
      { label: 'max_iter=1000', documentation: 'Maximum iterations for numerical solver convergence' },
      { label: 'random_state=42', documentation: 'Seed for solver shuffling' },
    ],
  },
  StandardScaler: {
    label: 'StandardScaler(with_mean=True, with_std=True)',
    documentation: 'Standardize features to zero mean and unit variance.',
    parameters: [
      { label: 'with_mean=True', documentation: 'If True, center data before scaling' },
      { label: 'with_std=True', documentation: 'If True, scale data to unit variance' },
    ],
  },
  SimpleImputer: {
    label: 'SimpleImputer(strategy="median", missing_values=np.nan)',
    documentation: 'Univariate imputation transformer for missing values.',
    parameters: [
      { label: 'strategy="median"', documentation: 'Imputation strategy: "mean", "median", "most_frequent", "constant"' },
      { label: 'missing_values=np.nan', documentation: 'The placeholder for missing values to be imputed' },
    ],
  },
  cross_val_score: {
    label: 'cross_val_score(estimator, X, y=None, cv=5, scoring=None)',
    documentation: 'Evaluate a score by K-fold cross-validation.',
    parameters: [
      { label: 'estimator', documentation: 'The scikit-learn model or Pipeline to evaluate' },
      { label: 'X', documentation: 'Feature matrix or DataFrame' },
      { label: 'y=None', documentation: 'Target labels array or Series' },
      { label: 'cv=5', documentation: 'Number of cross-validation folds' },
      { label: 'scoring=None', documentation: 'Scoring metric name (e.g. "roc_auc", "f1", "accuracy")' },
    ],
  },
};

/* ── 5.1 Schema-Aware Completion Helper ──────────────────────────────────── */
export function getSchemaCompletions(
  code: string,
  lineNumber: number,
  column: number,
  datasetColumns: DatasetColumnInfo[] = [],
  selectedTarget?: string | null,
  selectedFeatures: string[] = [],
  datasetName?: string
): MLCompletionItem[] {
  const lines = code.split('\n');
  const currentLine = lines[lineNumber - 1] || '';
  const textBeforeCursor = currentLine.substring(0, column - 1);

  // Check if cursor is inside a dataframe column indexing context:
  // e.g. df["...", data['...', X["...", df.drop(columns=["...
  const insideIndexing = /(?:df|data|dataset|X|X_train|X_test|y|train_df|test_df)\[\s*["']?([^"'\]]*)$/.test(
    textBeforeCursor
  );
  const insideDrop = /\.drop\s*\(\s*(?:columns\s*=\s*)?\[\s*["']?([^"'\]]*)$/.test(textBeforeCursor);
  const insideColumnsList = /(?:columns|features|subset)\s*=\s*\[[^\]]*["']([^"']*)$/.test(textBeforeCursor);
  const insideQuotesAfterBracket = /\[\s*["']([^"']*)$/.test(textBeforeCursor);

  const isColumnContext = insideIndexing || insideDrop || insideColumnsList || insideQuotesAfterBracket;

  // Determine if quote is already opened before cursor
  const quoteMatch = textBeforeCursor.match(/["']([^"']*)$/);
  const hasOpenQuote = Boolean(quoteMatch);

  const suggestions: MLCompletionItem[] = [];

  if (datasetColumns.length > 0) {
    for (const col of datasetColumns) {
      const isTarget = col.name === selectedTarget;
      const isSelectedFeature = selectedFeatures.includes(col.name);

      const roleBadge = isTarget ? '🎯 Target Variable' : isSelectedFeature ? '★ Selected Feature' : 'Feature';
      const insertText = hasOpenQuote ? col.name : `"${col.name}"`;

      suggestions.push({
        label: col.name,
        kind: 5, // Monaco CompletionItemKind.Field
        detail: `${col.type || 'numeric'} column (${roleBadge})`,
        documentation: [
          `**Dataset Column:** \`${col.name}\``,
          `- **Type:** \`${col.type || 'numeric'}\``,
          `- **Dataset:** \`${datasetName || 'active dataset'}\``,
          `- **Role:** ${roleBadge}`,
          '',
          isColumnContext
            ? '✅ Matches active dataset schema'
            : 'Available feature column in active dataset',
        ].join('\n'),
        insertText,
        isSnippet: false,
        sortText: isTarget ? `00_${col.name}` : isSelectedFeature ? `01_${col.name}` : `02_${col.name}`,
      });
    }

    // Special target completion shortcut
    if (selectedTarget) {
      suggestions.push({
        label: 'TARGET_COLUMN',
        kind: 14, // Monaco CompletionItemKind.Constant
        detail: `"${selectedTarget}" (Active target variable)`,
        documentation: `Configured primary target column \`${selectedTarget}\` for this dataset.`,
        insertText: `"${selectedTarget}"`,
        sortText: '000_TARGET',
      });
    }

    // Feature columns array shortcut
    if (selectedFeatures.length > 0) {
      suggestions.push({
        label: 'FEATURE_COLUMNS',
        kind: 14, // Monaco CompletionItemKind.Constant
        detail: `[${selectedFeatures.length} feature columns]`,
        documentation: `List of all ${selectedFeatures.length} selected features in active dataset: ${selectedFeatures.join(', ')}.`,
        insertText: JSON.stringify(selectedFeatures),
        sortText: '000_FEATURES',
      });
    }
  }

  // Also include ML primitives (classes, functions) and snippets if not strictly inside quotes
  if (!hasOpenQuote) {
    for (const [name, doc] of Object.entries(ML_DOCSTRINGS)) {
      const isClass = /^[A-Z]/.test(name);
      suggestions.push({
        label: name,
        kind: isClass ? 7 : 3, // Monaco CompletionItemKind.Class (7) or Function (3)
        detail: `sklearn / pandas (${isClass ? 'Class' : 'Function'})`,
        documentation: doc,
        insertText: name,
        isSnippet: false,
        sortText: `50_${name}`,
      });
    }

    for (const snip of ML_SNIPPETS) {
      suggestions.push({
        label: snip.label,
        kind: 27, // Monaco CompletionItemKind.Snippet
        detail: snip.title,
        documentation: `${snip.documentation}\n\n💡 *Learning Mode Note:*\n${snip.learningExplanation}`,
        insertText: snip.insertText,
        isSnippet: true,
        sortText: `90_${snip.id}`,
      });
    }
  }

  return suggestions;
}

/* ── 5.2 Hover Inspection Helper ─────────────────────────────────────────── */
export function getHoverDocstring(
  word: string,
  datasetColumns: DatasetColumnInfo[] = [],
  datasetName?: string,
  selectedTarget?: string | null
): MLHoverInfo | null {
  if (!word) return null;

  // 1. Check if word matches an active dataset column
  const matchedCol = datasetColumns.find((c) => c.name === word);
  if (matchedCol) {
    const isTarget = matchedCol.name === selectedTarget;
    return {
      contents: [
        `### 📊 Dataset Column: \`${matchedCol.name}\``,
        `- **Data Type:** \`${matchedCol.type || 'numeric'}\``,
        `- **Source Dataset:** \`${datasetName || 'active dataset'}\``,
        `- **Role:** ${isTarget ? '🎯 Primary Target Variable' : 'Feature Column'}`,
        '',
        isTarget
          ? 'This column is configured as the prediction target variable for model evaluation.'
          : 'This column is an input feature passed to the model training pipeline.',
      ],
    };
  }

  // 2. Check if word matches library docstrings
  if (ML_DOCSTRINGS[word]) {
    return {
      contents: [ML_DOCSTRINGS[word]],
    };
  }

  return null;
}

/* ── 5.2 Signature Help Helper ───────────────────────────────────────────── */
export function getSignatureHelp(lineText: string, cursorCol: number): { signature: MLSignatureInfo; activeParameter: number } | null {
  const textBefore = lineText.substring(0, cursorCol);

  // Match function name right before open parenthesis: func_name(arg1, arg2, ...
  const match = textBefore.match(/([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)$/);
  if (!match) return null;

  const funcName = match[1];
  const argsText = match[2];

  const sig = ML_SIGNATURES[funcName];
  if (!sig) return null;

  // Count commas not inside quotes or brackets to determine active parameter index
  let activeParam = 0;
  let inQuote = false;
  let quoteChar = '';
  for (let i = 0; i < argsText.length; i++) {
    const ch = argsText[i];
    if ((ch === '"' || ch === "'") && !inQuote) {
      inQuote = true;
      quoteChar = ch;
    } else if (ch === quoteChar && inQuote) {
      inQuote = false;
    } else if (ch === ',' && !inQuote) {
      activeParam++;
    }
  }

  return {
    signature: sig,
    activeParameter: Math.min(activeParam, sig.parameters.length - 1),
  };
}
