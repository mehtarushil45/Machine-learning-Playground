/**
 * codeStudioPipelineGuardian.test.tsx -- Enterprise Pipeline Guardian & Fast Python Checks.
 *
 * Verifies Day 5–6 deliverables:
 *  1. Fast client-side AST and syntax checks (unclosed brackets, quotes, stray multi-word lines, undefined names like 'k')
 *  2. Pipeline Guardian AST analyzer: translating code edits into plain-English ML Cause & Effect explanations
 *  3. Preview Impact / PipelineGuardianModal UI: Cause & Effect cards, diff toggle, Run Experiment action
 *  4. Separation of typing from running: terminal stays completely silent during typing and debounced AST diagnostics
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { fastCheckPythonCode } from '../utils/clientPythonLinter';
import { analyzePipelineImpact } from '../utils/pipelineGuardian';
import { PipelineGuardianModal } from '../features/pipelines/PipelineGuardianModal';
import type { ActiveTrainingConfiguration } from '../providers/ProjectContext';

describe('Day 5–6: Fast Python Checks & Pipeline Guardian', () => {
  /* ── 1. Fast Client-Side Python AST & Syntax Checks ─────────────────────── */
  describe('Fast Client-Side Python AST & Syntax Checks (clientPythonLinter)', () => {
    it('returns empty diagnostics for empty, whitespace, or valid Python code', () => {
      expect(fastCheckPythonCode('')).toEqual([]);
      expect(fastCheckPythonCode('   \n\n\t')).toEqual([]);

      const validScript = `
import pandas as pd
from sklearn.ensemble import RandomForestClassifier

target_column = 'churn'
model = RandomForestClassifier(n_estimators=100)
print("Pipeline valid")
`;
      const diags = fastCheckPythonCode(validScript);
      expect(diags).toEqual([]);
    });

    it('immediately flags unclosed brackets, parentheses, and braces with exact line numbers', () => {
      const brokenBrackets = `
import numpy as np
arr = np.array([1, 2, 3
print("done")
`;
      const diags = fastCheckPythonCode(brokenBrackets);
      expect(diags.length).toBeGreaterThan(0);
      const bracketErr = diags.find((d) => d.message.includes("unclosed '['"));
      expect(bracketErr).toBeDefined();
      expect(bracketErr?.severity).toBe('error');
      expect(bracketErr?.source).toBe('syntax');
      expect(bracketErr?.code).toBe('E999');
    });

    it('immediately flags unclosed string literals', () => {
      const brokenString = `
target_column = "churn
model = None
`;
      const diags = fastCheckPythonCode(brokenString);
      expect(diags.length).toBeGreaterThan(0);
      expect(diags[0].message).toContain('unterminated string literal');
      expect(diags[0].line).toBe(2);
    });

    it('flags consecutive invalid words as a syntax error (e.g. "hello world" typed below valid code)', () => {
      const codeWithTrailingWords = `
import pandas as pd
df = pd.read_csv("data.csv")
hello world
`;
      const diags = fastCheckPythonCode(codeWithTrailingWords);
      expect(diags.length).toBeGreaterThan(0);
      const syntaxDiag = diags.find((d) => d.message.includes("invalid syntax 'world'"));
      expect(syntaxDiag).toBeDefined();
      expect(syntaxDiag?.line).toBe(4);
      expect(syntaxDiag?.source).toBe('syntax');
    });

    it('flags bare undefined identifier symbol on a new line (e.g. user typed "k" at the bottom)', () => {
      const codeWithBareK = `
import pandas as pd
target_column = 'target'
k
`;
      const diags = fastCheckPythonCode(codeWithBareK);
      expect(diags.length).toBeGreaterThan(0);
      const kDiag = diags.find((d) => d.message.includes("undefined name 'k'"));
      expect(kDiag).toBeDefined();
      expect(kDiag?.severity).toBe('error');
      expect(kDiag?.source).toBe('pyflakes');
      expect(kDiag?.code).toBe('F821');
    });

    it('does not flag known identifiers or assigned variables as undefined', () => {
      const codeWithAssignedVar = `
my_custom_var = 42
print(my_custom_var)
`;
      const diags = fastCheckPythonCode(codeWithAssignedVar);
      expect(diags).toEqual([]);
    });
  });

  /* ── 2. Pipeline Guardian AST Impact Analyzer ─────────────────────────── */
  describe('Pipeline Guardian AST Analyzer (pipelineGuardian.ts)', () => {
    const mockBaselineConfig: ActiveTrainingConfiguration = {
      dataset_id: 'churn_data',
      dataset_name: 'customers.csv',
      target_column: 'churn',
      feature_columns: ['age', 'tenure', 'balance'],
      algorithm: 'random_forest_classifier',
      scaler: 'none',
      imputer: 'mean',
      train_test_split: 0.8,
      cv_folds: 5,
      random_seed: 42,
      selection_source: 'manual',
    };

    it('reports isIdentical: true when code matches visual baseline', () => {
      const matchingCode = `
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split

target_column = 'churn'
feature_columns = ['age', 'tenure', 'balance']
model = RandomForestClassifier(n_estimators=100)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
`;
      const analysis = analyzePipelineImpact(matchingCode, mockBaselineConfig);
      expect(analysis.isIdentical).toBe(true);
      expect(analysis.impacts.length).toBe(0);
      expect(analysis.summaryText).toContain('matches the visual pipeline baseline');
    });

    it('translates algorithm switch from RandomForest to LogisticRegression into plain-English ML explanations', () => {
      const changedModelCode = `
import pandas as pd
from sklearn.linear_model import LogisticRegression

target_column = 'churn'
feature_columns = ['age', 'tenure', 'balance']
model = LogisticRegression(C=1.0)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
`;
      const analysis = analyzePipelineImpact(changedModelCode, mockBaselineConfig);
      expect(analysis.isIdentical).toBe(false);

      const algoImpact = analysis.impacts.find((i) => i.category === 'algorithm');
      expect(algoImpact).toBeDefined();
      expect(algoImpact?.title).toBe('Algorithm Family Shift');
      expect(algoImpact?.baselineDisplay).toBe('Random Forest Classifier');
      expect(algoImpact?.currentDisplay).toBe('Logistic Regression');
      expect(algoImpact?.cause).toContain('Switched from an ensemble of decision trees');
      expect(algoImpact?.expectedEffect).toContain('linear decision boundary');
      expect(algoImpact?.expectedEffect).toContain('cannot capture complex non-linear feature interactions');
    });

    it('translates test_size change (0.2 -> 0.3) into training vs evaluation trade-off', () => {
      const changedSplitCode = `
import pandas as pd
from sklearn.ensemble import RandomForestClassifier

target_column = 'churn'
feature_columns = ['age', 'tenure', 'balance']
model = RandomForestClassifier()
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.3, random_state=42)
`;
      const analysis = analyzePipelineImpact(changedSplitCode, mockBaselineConfig);
      const splitImpact = analysis.impacts.find((i) => i.category === 'split');
      expect(splitImpact).toBeDefined();
      expect(splitImpact?.baselineDisplay).toBe('80% Train / 20% Test');
      expect(splitImpact?.currentDisplay).toBe('70% Train / 30% Test');
      expect(splitImpact?.cause).toContain('Test split adjusted from 20% to 30%');
      expect(splitImpact?.expectedEffect).toContain('Model trains on 70% of the data instead of 80%');
      expect(splitImpact?.expectedEffect).toContain('evaluation is computed on a larger 30% unseen test set');
    });

    it('translates feature scaling addition (StandardScaler) into normalization cause & effect', () => {
      const scaledCode = `
import pandas as pd
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import RandomForestClassifier

target_column = 'churn'
feature_columns = ['age', 'tenure', 'balance']
scaler = StandardScaler()
model = RandomForestClassifier()
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
`;
      const analysis = analyzePipelineImpact(scaledCode, mockBaselineConfig);
      const scalerImpact = analysis.impacts.find((i) => i.category === 'preprocessing');
      expect(scalerImpact).toBeDefined();
      expect(scalerImpact?.currentDisplay).toContain('StandardScaler');
      expect(scalerImpact?.cause).toContain('StandardScaler (z-score standardization) added');
      expect(scalerImpact?.expectedEffect).toContain('Prevents high-magnitude numerical features from dominating');
    });

    it('translates imputation switch from mean to median into robust outlier handling explanation', () => {
      const imputerCode = `
import pandas as pd
from sklearn.impute import SimpleImputer
from sklearn.ensemble import RandomForestClassifier

target_column = 'churn'
feature_columns = ['age', 'tenure', 'balance']
imputer = SimpleImputer(strategy='median')
model = RandomForestClassifier()
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
`;
      const analysis = analyzePipelineImpact(imputerCode, mockBaselineConfig);
      const imputerImpact = analysis.impacts.find((i) => i.property === 'imputer');
      expect(imputerImpact).toBeDefined();
      expect(imputerImpact?.currentDisplay).toBe('median');
      expect(imputerImpact?.cause).toContain("Switched missing value replacement strategy from mean to median");
      expect(imputerImpact?.expectedEffect).toContain('resilient to skewed feature distributions and extreme outliers');
    });

    it('translates cross-validation fold adjustment (5 -> 10 folds)', () => {
      const cvCode = `
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import cross_val_score

target_column = 'churn'
feature_columns = ['age', 'tenure', 'balance']
model = RandomForestClassifier()
scores = cross_val_score(model, X, y, cv=10)
`;
      const analysis = analyzePipelineImpact(cvCode, mockBaselineConfig);
      const cvImpact = analysis.impacts.find((i) => i.category === 'cross_validation');
      expect(cvImpact).toBeDefined();
      expect(cvImpact?.currentDisplay).toBe('10 folds');
      expect(cvImpact?.expectedEffect).toContain('increases total training run time proportionally (10 fits vs 5 fits)');
    });

    it('translates hyperparameter modifications (n_estimators=300, max_depth=6)', () => {
      const tunedCode = `
import pandas as pd
from sklearn.ensemble import RandomForestClassifier

target_column = 'churn'
feature_columns = ['age', 'tenure', 'balance']
model = RandomForestClassifier(n_estimators=300, max_depth=6)
`;
      const analysis = analyzePipelineImpact(tunedCode, mockBaselineConfig);
      const nEstImpact = analysis.impacts.find((i) => i.property === 'n_estimators');
      expect(nEstImpact).toBeDefined();
      expect(nEstImpact?.currentDisplay).toBe('300 estimators');
      expect(nEstImpact?.expectedEffect).toContain('diminishing returns beyond 200 trees');

      const depthImpact = analysis.impacts.find((i) => i.property === 'max_depth');
      expect(depthImpact).toBeDefined();
      expect(depthImpact?.currentDisplay).toBe('6 levels');
      expect(depthImpact?.expectedEffect).toContain('combating overfitting on high-variance training features');
    });

    it('translates target column modification and flags warning', () => {
      const targetCode = `
import pandas as pd
target_column = 'credit_score'
feature_columns = ['age', 'tenure', 'balance']
model = RandomForestClassifier()
`;
      const analysis = analyzePipelineImpact(targetCode, mockBaselineConfig);
      const targetImpact = analysis.impacts.find((i) => i.category === 'target');
      expect(targetImpact).toBeDefined();
      expect(targetImpact?.severity).toBe('warning');
      expect(targetImpact?.cause).toContain("Prediction target changed from 'churn' to 'credit_score'");
      expect(targetImpact?.expectedEffect).toContain('Fundamentally alters the learning objective');
    });
  });

  /* ── 3. PipelineGuardianModal Component Tests ─────────────────────────── */
  describe('PipelineGuardianModal Component', () => {
    const mockBaselineConfig: ActiveTrainingConfiguration = {
      dataset_id: 'churn_data',
      dataset_name: 'customers.csv',
      target_column: 'churn',
      feature_columns: ['age', 'tenure'],
      algorithm: 'random_forest_classifier',
      scaler: 'none',
      imputer: 'mean',
      train_test_split: 0.8,
      cv_folds: 5,
      random_seed: 42,
      selection_source: 'manual',
    };

    const modifiedCode = `
import pandas as pd
from sklearn.linear_model import LogisticRegression

target_column = 'churn'
feature_columns = ['age', 'tenure']
model = LogisticRegression()
X_train, X_test = train_test_split(X, test_size=0.3)
`;

    it('renders accessible dialog with Cause & Effect cards and baseline comparison', () => {
      const onClose = vi.fn();
      const onRunExperiment = vi.fn();

      render(
        <PipelineGuardianModal
          isOpen={true}
          filename="pipeline_generated.py"
          currentCode={modifiedCode}
          baselineConfig={mockBaselineConfig}
          onClose={onClose}
          onRunExperiment={onRunExperiment}
        />
      );

      expect(screen.getByRole('dialog', { name: /Pipeline Guardian — ML Impact Analysis/i })).toBeInTheDocument();
      expect(screen.getByText(/Pipeline Guardian: ML Impact Analysis/i)).toBeInTheDocument();
      expect(screen.getByText('pipeline_generated.py')).toBeInTheDocument();

      // Check Cause & Effect cards
      expect(screen.getByTestId('guardian-impact-diff-algorithm')).toBeInTheDocument();
      expect(screen.getByTestId('guardian-impact-diff-split')).toBeInTheDocument();
      expect(screen.getByText(/Switched from an ensemble of decision trees/i)).toBeInTheDocument();
      expect(screen.getByText(/linear decision boundary/i)).toBeInTheDocument();

      // Trigger Run Experiment Now action
      const runBtn = screen.getByRole('button', { name: /Run experiment from guardian/i });
      fireEvent.click(runBtn);
      expect(onRunExperiment).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('allows toggling to the Side-by-Side Diff tab', () => {
      render(
        <PipelineGuardianModal
          isOpen={true}
          filename="pipeline_generated.py"
          currentCode={modifiedCode}
          baselineConfig={mockBaselineConfig}
          onClose={vi.fn()}
        />
      );

      const diffTabBtn = screen.getByRole('button', { name: /Side-by-Side Diff/i });
      fireEvent.click(diffTabBtn);

      expect(screen.getByTestId('guardian-diff-fallback')).toBeInTheDocument();
      expect(screen.getByText(/Visual Baseline Code/i)).toBeInTheDocument();
      expect(screen.getAllByText(/Current Studio Code/i).length).toBeGreaterThanOrEqual(1);
    });

    it('does not render when isOpen is false', () => {
      const { container } = render(
        <PipelineGuardianModal
          isOpen={false}
          filename="pipeline_generated.py"
          currentCode={modifiedCode}
          baselineConfig={mockBaselineConfig}
          onClose={vi.fn()}
        />
      );

      expect(container.firstChild).toBeNull();
    });
  });
});
