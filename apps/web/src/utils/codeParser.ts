/**
 * Enterprise Python ML Code AST / Token Parser Utility.
 * Extracts pipeline configuration (target column, feature columns, algorithm,
 * scaler, imputer, train/test split, random seed) from Python scripts.
 */

export interface ParsedPipelineConfig {
  target?: string;
  features?: string[];
  algorithm?: string;
  scaler?: string;
  imputer?: string;
  testSplit?: number;
  seed?: number;
}

export function parsePipelineTargetAndConfig(code: string): ParsedPipelineConfig {
  const result: ParsedPipelineConfig = {};
  if (!code || typeof code !== 'string') return result;

  // 1. Target column extraction
  // Patterns:
  //   target_col = "churn" / target_column = "churn"
  //   TARGET_COLUMN = "churn" / TARGET = "churn" / target = "churn"
  //   y = df["churn"] / y = data["churn"]
  //   target_column="churn"
  const targetMatch1 = code.match(/(?:target_col(?:umn)?|TARGET_COLUMN|TARGET|target)\s*=\s*['"]([^'"]+)['"]/);
  if (targetMatch1 && targetMatch1[1]?.trim()) {
    result.target = targetMatch1[1].trim();
  } else {
    const targetMatch2 = code.match(/\by\s*=\s*(?:df|data)\[['"]([^'"]+)['"]\]/);
    if (targetMatch2 && targetMatch2[1]?.trim()) {
      result.target = targetMatch2[1].trim();
    } else {
      const targetMatch3 = code.match(/target_column\s*=\s*['"]([^'"]+)['"]/);
      if (targetMatch3 && targetMatch3[1]?.trim()) {
        result.target = targetMatch3[1].trim();
      }
    }
  }

  // 2. Feature columns extraction
  // Pattern: feature_cols = [...]
  const featMatch = code.match(/feature_cols\s*=\s*\[([\s\S]*?)\]/);
  if (featMatch && featMatch[1]) {
    const items = featMatch[1].match(/['"]([^'"]+)['"]/g);
    if (items && items.length > 0) {
      result.features = items.map((s) => s.replace(/['"]/g, '').trim()).filter(Boolean);
    }
  }

  // 3. Algorithm extraction
  if (/RandomForestClassifier/i.test(code)) result.algorithm = 'random_forest_classifier';
  else if (/RandomForestRegressor/i.test(code)) result.algorithm = 'random_forest_regressor';
  else if (/GradientBoostingClassifier/i.test(code)) result.algorithm = 'gradient_boosting_classifier';
  else if (/GradientBoostingRegressor/i.test(code)) result.algorithm = 'gradient_boosting_regressor';
  else if (/DecisionTreeClassifier/i.test(code)) result.algorithm = 'decision_tree_classifier';
  else if (/DecisionTreeRegressor/i.test(code)) result.algorithm = 'decision_tree_regressor';
  else if (/LogisticRegression/i.test(code)) result.algorithm = 'logistic_regression';
  else if (/LinearRegression/i.test(code)) result.algorithm = 'linear_regression';
  else if (/Ridge/i.test(code)) result.algorithm = 'ridge';
  else if (/Lasso/i.test(code)) result.algorithm = 'lasso';
  else if (/SVC/i.test(code)) result.algorithm = 'svc';
  else if (/SVR/i.test(code)) result.algorithm = 'svr';
  else if (/KNeighborsClassifier/i.test(code)) result.algorithm = 'k_nearest_neighbors';
  else if (/KNeighborsRegressor/i.test(code)) result.algorithm = 'k_nearest_neighbors';

  // 4. Scaler extraction
  if (/StandardScaler/i.test(code)) result.scaler = 'standard_scaler';
  else if (/MinMaxScaler/i.test(code)) result.scaler = 'min_max_scaler';
  else if (/RobustScaler/i.test(code)) result.scaler = 'robust_scaler';
  else if (/MaxAbsScaler/i.test(code)) result.scaler = 'max_abs_scaler';

  // 5. Imputer extraction
  const impMatch = code.match(/SimpleImputer\s*\([^)]*strategy\s*=\s*['"]([^'"]+)['"]/i);
  if (impMatch && impMatch[1]) {
    result.imputer = impMatch[1].toLowerCase().trim();
  }

  // 6. Split extraction (test_size = 0.2 => train = 0.8)
  const splitMatch = code.match(/test_size\s*=\s*([0-9.]+)/i);
  if (splitMatch && splitMatch[1]) {
    const val = parseFloat(splitMatch[1]);
    if (!isNaN(val) && val > 0 && val < 1) {
      result.testSplit = Math.round((1 - val) * 100) / 100;
    }
  }

  // 7. Random seed extraction
  const seedMatch = code.match(/random_state\s*=\s*([0-9]+)/i);
  if (seedMatch && seedMatch[1]) {
    const s = parseInt(seedMatch[1], 10);
    if (!isNaN(s)) result.seed = s;
  }

  return result;
}
