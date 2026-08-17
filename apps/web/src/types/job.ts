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

export interface TrainingOption {
  key: string
  display_name: string
}

export interface AlgorithmTrainingOption extends TrainingOption {
  task_type: 'classification' | 'regression'
}

export interface TrainingOptions {
  algorithms: AlgorithmTrainingOption[]
  scalers: TrainingOption[]
  imputers: TrainingOption[]
  default_cv_folds: number
  default_train_test_split: number
  min_train_test_split?: number
  max_train_test_split?: number
  min_cv_folds?: number
  max_cv_folds?: number
}

export const CANONICAL_TRAINING_OPTIONS: TrainingOptions = {
  algorithms: [
    { key: 'random_forest_classifier', display_name: 'Random Forest Classifier', task_type: 'classification' },
    { key: 'logistic_regression', display_name: 'Logistic Regression', task_type: 'classification' },
    { key: 'decision_tree_classifier', display_name: 'Decision Tree Classifier', task_type: 'classification' },
    { key: 'k_nearest_neighbors_classifier', display_name: 'K-Nearest Neighbors Classifier', task_type: 'classification' },
    { key: 'support_vector_classifier', display_name: 'Support Vector Classifier (SVC)', task_type: 'classification' },
    { key: 'gradient_boosting_classifier', display_name: 'Gradient Boosting Classifier', task_type: 'classification' },
    { key: 'xgboost_classifier', display_name: 'XGBoost Classifier', task_type: 'classification' },
    { key: 'lightgbm_classifier', display_name: 'LightGBM Classifier', task_type: 'classification' },
    { key: 'gaussian_nb', display_name: 'Naive Bayes (GaussianNB)', task_type: 'classification' },
    { key: 'ridge_classifier', display_name: 'Ridge Classifier', task_type: 'classification' },
    { key: 'random_forest_regressor', display_name: 'Random Forest Regressor', task_type: 'regression' },
    { key: 'linear_regression', display_name: 'Linear Regression', task_type: 'regression' },
    { key: 'decision_tree_regressor', display_name: 'Decision Tree Regressor', task_type: 'regression' },
    { key: 'k_nearest_neighbors_regressor', display_name: 'K-Nearest Neighbors Regressor', task_type: 'regression' },
    { key: 'support_vector_regressor', display_name: 'Support Vector Regressor (SVR)', task_type: 'regression' },
    { key: 'gradient_boosting_regressor', display_name: 'Gradient Boosting Regressor', task_type: 'regression' },
    { key: 'xgboost_regressor', display_name: 'XGBoost Regressor', task_type: 'regression' },
    { key: 'lightgbm_regressor', display_name: 'LightGBM Regressor', task_type: 'regression' },
    { key: 'ridge_regressor', display_name: 'Ridge Regressor', task_type: 'regression' },
    { key: 'lasso_regressor', display_name: 'Lasso Regressor', task_type: 'regression' },
  ],
  scalers: [
    { key: 'standard_scaler', display_name: 'StandardScaler' },
    { key: 'min_max_scaler', display_name: 'MinMaxScaler' },
    { key: 'robust_scaler', display_name: 'RobustScaler' },
    { key: 'max_abs_scaler', display_name: 'MaxAbsScaler' },
    { key: 'normalizer', display_name: 'Normalizer' },
  ],
  imputers: [
    { key: 'mean', display_name: 'Mean' },
    { key: 'median', display_name: 'Median' },
    { key: 'most_frequent', display_name: 'Most Frequent' },
    { key: 'constant', display_name: 'Constant' },
    { key: 'knn_imputer', display_name: 'K-Nearest Neighbors Imputer' },
  ],
  default_cv_folds: 5,
  default_train_test_split: 0.8,
  min_train_test_split: 0.5,
  max_train_test_split: 0.95,
  min_cv_folds: 2,
  max_cv_folds: 20,
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
  recommendation_job_id?: string | null
  selection_source?: 'recommended' | 'manual' | 'default'
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
    random_seed?: number | null
    cross_validation?: number | null
    normalization?: boolean
    feature_selection?: string
    class_weight?: string
    recommendation_job_id?: string | null
    selection_source?: string
    [key: string]: unknown
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
