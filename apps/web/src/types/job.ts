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

export interface TrainingRequestPayload {
  dataset_id: string
  target_column: string
  feature_columns: string[]
  algorithm?: string
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
    train_test_split?: number
    random_seed?: number | null
    cross_validation?: number | null
    normalization?: boolean
    feature_selection?: string
    class_weight?: string
    notes?: string
  }
}

export interface JobProgressInfo {
  job_id: string
  status: JobStatus
  progress: number
  current_stage: string
  message?: string | null
  estimated_seconds_remaining?: number | null
}

export interface JobListData {
  total: number
  jobs: JobEntity[]
}

export interface JobCancelResult {
  job_id: string
  status: string
  cancelled_at: string
  message: string
}

export interface JobRetryResult {
  original_job_id: string
  new_job_id: string
  status: string
  retry_count: number
  message: string
}
