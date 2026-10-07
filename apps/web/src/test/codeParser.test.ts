import { describe, it, expect } from 'vitest';
import { parsePipelineTargetAndConfig } from '../utils/codeParser';

describe('codeParser — Enterprise Pipeline AST & Token Parser', () => {
  it('extracts target column from standard target_col assignment', () => {
    const code = `
import pandas as pd
target_col = "churn_status"
feature_cols = ["age", "tenure"]
X = df[feature_cols]
y = df[target_col]
`;
    const res = parsePipelineTargetAndConfig(code);
    expect(res.target).toBe('churn_status');
    expect(res.features).toEqual(['age', 'tenure']);
  });

  it('extracts target column from TARGET_COLUMN uppercase assignment', () => {
    const code = `
TARGET_COLUMN = "is_fraud"
target_col = TARGET_COLUMN
`;
    const res = parsePipelineTargetAndConfig(code);
    expect(res.target).toBe('is_fraud');
  });

  it('extracts target column from y = df["column_name"] bracket indexing', () => {
    const code = `
import pandas as pd
df = pd.read_csv("data.csv")
X = df.drop(columns=["salary"])
y = df["salary"]
`;
    const res = parsePipelineTargetAndConfig(code);
    expect(res.target).toBe('salary');
  });

  it('extracts algorithm, scaler, and test_size split', () => {
    const code = `
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.preprocessing import RobustScaler
from sklearn.impute import SimpleImputer
from sklearn.model_selection import train_test_split

target_col = "target"
feature_cols = ["f1", "f2"]
imputer = SimpleImputer(strategy="median")
scaler = RobustScaler()
clf = GradientBoostingClassifier(random_state=42)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.25, random_state=42)
`;
    const res = parsePipelineTargetAndConfig(code);
    expect(res.target).toBe('target');
    expect(res.features).toEqual(['f1', 'f2']);
    expect(res.algorithm).toBe('gradient_boosting_classifier');
    expect(res.scaler).toBe('robust_scaler');
    expect(res.imputer).toBe('median');
    expect(res.testSplit).toBe(0.75);
    expect(res.seed).toBe(42);
  });
});
