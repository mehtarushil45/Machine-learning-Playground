/**
 * Machine Learning Job Orchestration TypeScript definitions.
 */

export type JobStatus =
  | 'PENDING'
  | 'QUEUED'
  | 'STARTING'
  | 'RUNNING'
  | 'VALIDATING'
  | 'TRAINING'
  | 'EVALUATING'
  | 'SAVING_MODEL'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'RETRYING'

export interface OptionItem {
  value: string
  label: string
}

export interface TrainingOptions {
  algorithms: {
    classification: string[]
    regression: string[]
  }
  scalers: OptionItem[]
  imputers: OptionItem[]
  default_cv_folds: number
  default_train_test_split: number
  min_train_test_split?: number
  max_train_test_split?: number
  min_cv_folds?: number
  max_cv_folds?: number
}

export interface TrainingRequestPayload {
  dataset_id: string
  target_column: string
  feature_columns: string[]
  algorithm?: string
  scaler?: string
  imputer?: string
  train_test_split?: number
  random_seed?: number | null
  cross_validation?: number | null
  normalization?: boolean
  feature_selection?: string
  class_weight?: string
  notes?: string
}

export interface JobEntity {
  job_id: string
  dataset_id: string
  status: JobStatus
  created_at: string
  updated_at: string
  started_at?: string | null
  completed_at?: string | null
  cancelled_at?: string | null
  job_type: string
  algorithm: string
  target_column: string
  feature_columns: string[]
  progress: number
  current_stage: string
  message?: string | null
  estimated_seconds?: number | null
  worker_id?: string | null
  error_message?: string | null
  retry_count: number
  owner_id?: string | null
  metadata?: {
    scaler?: string
    imputer?: string
    train_test_split?: number
    random_seed?: number | null
    cross_validation?: number | null
    normalization?: boolean
    feature_selection?: string
    class_weight?: string
    [key: string]: any
  }
}

export interface JobListData {
  total: number
  jobs: JobEntity[]
}

export interface JobProgressInfo {
  job_id: string
  status: JobStatus
  progress: number
  current_stage: string
  message?: string | null
  estimated_seconds?: number | null
  estimated_seconds_remaining?: number | null
  error_message?: string | null
  updated_at: string
}

export interface JobCancelResult {
  job_id: string
  status: JobStatus
  message: string
}

export interface JobRetryResult {
  job_id: string
  status: JobStatus
  message: string
  retry_count: number
  new_job_id?: string | null
}
