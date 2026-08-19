/**
 * Strictly typed definitions for Algorithm Recommendation Benchmarking.
 * Matches backend schemas in services/api/app/schemas/recommendation.py.
 */

export type RecommendationJobStatus =
  | 'PENDING'
  | 'QUEUED'
  | 'PROFILING'
  | 'SCREENING'
  | 'VERIFYING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'INSUFFICIENT_DATA';

export type CandidateStatus = 'completed' | 'skipped' | 'failed';

export interface SupportedAlgorithm {
  id: string;
  name: string;
  category: 'tree' | 'linear' | 'boosting' | 'distance' | 'kernel' | 'naive_bayes' | string;
  task_type: 'classification' | 'regression';
  is_available: boolean;
  expected_cost: 'low' | 'medium' | 'high';
  supports_sparse: boolean;
  requires_scaling: boolean;
  max_safe_rows?: number | null;
  missing_package?: string | null;
}

export interface SupportedAlgorithmsResponse {
  total: number;
  algorithms: SupportedAlgorithm[];
}

export interface RecommendationRequest {
  target_column: string;
  feature_columns?: string[] | null;
  metric?: string | null;
  cv_folds?: number;
  random_seed?: number;
  train_test_split?: number;
  max_training_seconds?: number;
  prefer_interpretable?: boolean;
}

export interface CandidateBenchmarkResult {
  algorithm_id: string;
  display_name: string;
  category: string;
  task_type: string;
  rank?: number | null;
  status: CandidateStatus;
  score?: number | null;
  score_std?: number | null;
  raw_metric_value?: number | null;
  validation_score?: number | null;
  ci_lower?: number | null;
  ci_upper?: number | null;
  metric_used?: string | null;
  fold_scores?: number[];
  training_seconds: number;
  training_time_seconds?: number | null;
  interpretability_score?: number | null;
  interpretability_label?: string | null;
  why_recommended?: string | null;
  risk_flags?: string[];
  reason_codes: string[];
  warnings: string[];
  skip_reason?: string | null;
  error_message?: string | null;
}

export interface ColumnExclusion {
  column_name: string;
  reason: string;
  category: string;
}

export interface RecommendationJobDetail {
  job_id: string;
  dataset_id: string;
  organisation_id: string;
  status: RecommendationJobStatus;
  stage: string;
  progress: number;
  message?: string | null;
  cache_key: string;
  created_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
  recommendation?: CandidateBenchmarkResult | null;
  candidates: CandidateBenchmarkResult[];
  warnings: string[];
  exclusions: ColumnExclusion[];
  reason_codes: string[];
  limitations: string[];
  reproducibility?: Record<string, unknown> | null;
  error_details?: {
    error_type?: string;
    message?: string;
  } | null;
}

export interface RecommendationJobCreateResponse {
  job: RecommendationJobDetail;
  cached: boolean;
  deduplicated: boolean;
}

export interface LatestBenchmarkSummary {
  job_id: string;
  status: string;
  algorithm_id?: string | null;
  algorithm_name?: string | null;
  score?: number | null;
  metric?: string | null;
  completed_at?: string | null;
}

/** Frontend UI State Machine for Algorithm Recommendation */
export type RecommendationUIState =
  | 'NO_TARGET'
  | 'READY_TO_ANALYZE'
  | 'SUBMITTING'
  | 'BENCHMARKING'
  | 'COMPLETED_RECOMMENDED'
  | 'COMPLETED_NO_CLEAR_WINNER'
  | 'INSUFFICIENT_DATA'
  | 'FAILED'
  | 'CANCELLED'
  | 'STALE'
  | 'MANUAL_OVERRIDE';
