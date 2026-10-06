/**
 * Tabular dataset, profiler, health engine, and recommendation engine TypeScript definitions.
 */

export type CellValue = string | number | boolean | null

export interface Row {
  [column: string]: CellValue
}

export interface Dataset {
  /** All rows parsed from the CSV file. */
  rows: Row[]
  /** Ordered list of column names (from the CSV header). */
  columns: string[]
  /** Original filename supplied by the browser. */
  fileName: string
  /** Optional server dataset ID if uploaded to API. */
  datasetId?: string
  /** Optional row count for parsed or API datasets. */
  rowCount?: number
  /** Immutable dataset version tag (e.g. "v1") */
  version?: string
  /** SHA-256 content fingerprint */
  contentHash?: string
  /** Format of dataset file */
  fileFormat?: 'csv' | 'parquet' | string
}

export interface ColumnProfile {
  name: string
  type: 'numeric' | 'categorical' | 'boolean' | 'datetime' | 'text' | 'identifier' | string
  nullable: boolean
  missing: number
  missing_percentage: number
  unique: number
  duplicate_count: number
  statistics: {
    mean?: number | null
    median?: number | null
    std?: number | null
    min?: number | null
    max?: number | null
    variance?: number | null
    cardinality?: number
    most_frequent_value?: string | null
    frequency_count?: number | null
    sample_values?: string[]
  }
}

export interface DataLeakageFinding {
  feature: string
  target: string
  correlation: number
  severity: 'critical' | 'high' | string
  recommendation: string
}

export interface MulticollinearityFinding {
  feature_a: string
  feature_b: string
  correlation: number
  recommendation: string
}

export interface DataGovernanceReport {
  has_leakage: boolean
  leaked_features: DataLeakageFinding[]
  multicollinear_pairs: MulticollinearityFinding[]
  constant_columns: string[]
  identifier_columns: string[]
  imputation_strategies: Record<string, string>
}

export interface DatasetProfile {
  dataset_id: string
  filename: string
  row_count: number
  column_count: number
  file_format?: 'csv' | 'parquet' | string
  engine?: 'duckdb' | string
  version?: string
  content_hash?: string | null
  memory_usage_bytes: number
  duplicate_rows: number
  duplicate_columns: number
  empty_columns: number
  total_missing_values: number
  columns: ColumnProfile[]
  governance?: DataGovernanceReport
}

export interface HealthIssue {
  severity: 'info' | 'warning' | 'high' | 'critical' | string
  message: string
  column_name?: string | null
}

export interface DatasetHealthReport {
  dataset_id: string
  filename: string
  health_score: number
  grade: 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'Critical' | string
  summary: string
  warnings: string[]
  recommendations: string[]
  issues: HealthIssue[]
}

export interface TargetSuggestion {
  column_name: string
  confidence: 'High' | 'Medium' | 'Low' | string
  suggested_task: 'Classification' | 'Regression' | string
  reasoning: string
}

export interface FeatureRecommendation {
  column_name: string
  recommended_action: 'keep' | 'drop' | 'encode' | 'scale' | 'impute' | string
  reasoning: string
}

import type { LatestBenchmarkSummary } from './recommendation'

export interface DatasetRecommendations {
  dataset_id: string
  filename: string
  overall_readiness: 'Ready for Training' | 'Needs Cleaning' | 'Critical Remediation Required' | string
  readiness_reasoning: string
  recommended_problem_type: 'Classification' | 'Regression' | 'Clustering' | 'Anomaly Detection' | 'Time Series' | string
  problem_type_confidence: number
  problem_type_reasoning: string
  recommended_models: string[]
  recommended_preprocessing: string[]
  target_suggestions: TargetSuggestion[]
  feature_recommendations: FeatureRecommendation[]
  warnings: string[]
  latest_benchmark?: LatestBenchmarkSummary | null
}

export * from './recommendation'
