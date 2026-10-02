/**
 * Local Deployment Service — Enterprise Model Deployment & Lifecycle Management.
 *
 * TypeScript client for /api/v1/local-deployments endpoints.
 * All types mirror the backend Pydantic schemas exactly.
 */

import { apiClient } from './apiClient';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FeatureSchemaEntry {
  type: 'numeric' | 'categorical' | 'boolean' | 'text';
  categories?: string[] | null;
  min?: number | null;
  max?: number | null;
}

export type LocalDeploymentStatus =
  | 'CREATED'
  | 'STARTING'
  | 'DEPLOYING'
  | 'RUNNING'
  | 'READY'
  | 'FAILED'
  | 'STOPPING'
  | 'STOPPED';

export interface LogEntry {
  ts: string;
  msg: string;
  event?: string;
  severity?: string;
}

export interface LocalDeploymentResponse {
  deployment_id: string;
  job_id: string;
  model_id: string;
  model_version: string;
  artifact_id: string;
  name: string;
  status: LocalDeploymentStatus;
  algorithm: string;
  problem_type: string;
  dataset_id: string;
  target_column: string;
  feature_columns: string[];
  input_schema: Record<string, FeatureSchemaEntry>;
  configuration: Record<string, any>;
  error_message?: string | null;
  started_at?: string | null;
  stopped_at?: string | null;
  created_at: string;
  logs: LogEntry[];
  total_predictions: number;
  endpoint_path: string;
  sample_inputs?: Record<string, any> | null;
  metrics?: Record<string, any> | null;
  dataset_name?: string | null;
  algorithm_display_name?: string | null;
}

export interface LocalDeploymentCreate {
  job_id: string;
  name?: string;
  configuration?: Record<string, any>;
}

export interface LocalDeploymentRedeploy {
  job_id?: string;
  model_id?: string;
  name?: string;
}

export interface LocalPredictRequest {
  inputs: Record<string, any>;
}

export interface LocalPredictResponse {
  inference_id?: string;
  deployment_id: string;
  job_id: string;
  model_id: string;
  model_version: string;
  prediction: any;
  probabilities?: Record<string, number> | null;
  confidence?: number | null;
  problem_type: string;
  latency_ms: number;
  timestamp: string;
  status: string;
}

export interface PredictionHistoryItem {
  id: string;
  deployment_id: string;
  model_id: string;
  model_version: string;
  inputs: Record<string, any>;
  prediction: any;
  confidence?: number | null;
  probabilities?: Record<string, number> | null;
  latency_ms: number;
  status: string;
  error_message?: string | null;
  created_at: string;
}

export interface ModelVersionOption {
  model_id: string;
  job_id?: string | null;
  version: string;
  algorithm: string;
  algorithm_display_name: string;
  registered_at: string;
  accuracy?: number | null;
  f1?: number | null;
  is_current: boolean;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  return apiClient.request<T>(endpoint, options);
}

export const LocalDeploymentService = {
  /**
   * Create a local deployment from a completed training job.
   * Returns RUNNING status if artifact is found and model loads successfully.
   */
  create: (jobId: string, name = 'Local Deployment', configuration?: Record<string, any>): Promise<LocalDeploymentResponse> =>
    request<LocalDeploymentResponse>('/local-deployments', {
      method: 'POST',
      body: JSON.stringify({ job_id: jobId, name, configuration }),
    }),

  /** List all deployments owned by the current user. */
  list: (): Promise<LocalDeploymentResponse[]> =>
    request<LocalDeploymentResponse[]>('/local-deployments'),

  /** Get a single deployment by ID. */
  get: (deploymentId: string): Promise<LocalDeploymentResponse> =>
    request<LocalDeploymentResponse>(`/local-deployments/${deploymentId}`),

  /** Start a STOPPED or FAILED deployment. */
  start: (deploymentId: string): Promise<LocalDeploymentResponse> =>
    request<LocalDeploymentResponse>(`/local-deployments/${deploymentId}/start`, {
      method: 'POST',
    }),

  /** Stop a RUNNING deployment (preserves model artifact). */
  stop: (deploymentId: string): Promise<LocalDeploymentResponse> =>
    request<LocalDeploymentResponse>(`/local-deployments/${deploymentId}/stop`, {
      method: 'POST',
    }),

  /** Restart a deployment. */
  restart: (deploymentId: string): Promise<LocalDeploymentResponse> =>
    request<LocalDeploymentResponse>(`/local-deployments/${deploymentId}/restart`, {
      method: 'POST',
    }),

  /** Redeploy a deployment, optionally upgrading to a new model version. */
  redeploy: (deploymentId: string, payload?: LocalDeploymentRedeploy): Promise<LocalDeploymentResponse> =>
    request<LocalDeploymentResponse>(`/local-deployments/${deploymentId}/redeploy`, {
      method: 'POST',
      body: payload ? JSON.stringify(payload) : undefined,
    }),

  /** Delete a deployment and its prediction history. */
  delete: (deploymentId: string): Promise<{ detail: string }> =>
    request<{ detail: string }>(`/local-deployments/${deploymentId}`, {
      method: 'DELETE',
    }),

  /** Execute a prediction against a RUNNING deployment with strict backend validation. */
  predict: (
    deploymentId: string,
    inputs: Record<string, any>
  ): Promise<LocalPredictResponse> =>
    request<LocalPredictResponse>(`/local-deployments/${deploymentId}/predict`, {
      method: 'POST',
      body: JSON.stringify({ inputs }),
    }),

  /** Fetch persisted prediction audit history for a deployment. */
  getPredictions: (deploymentId: string, limit = 50, offset = 0): Promise<PredictionHistoryItem[]> =>
    request<PredictionHistoryItem[]>(`/local-deployments/${deploymentId}/predictions?limit=${limit}&offset=${offset}`),

  /** Fetch available model versions for redeployment. */
  getVersions: (deploymentId: string): Promise<ModelVersionOption[]> =>
    request<ModelVersionOption[]>(`/local-deployments/${deploymentId}/versions`),

  /** List deployments created from a specific training job. */
  listForJob: (jobId: string): Promise<LocalDeploymentResponse[]> =>
    request<LocalDeploymentResponse[]>(`/jobs/${jobId}/local-deployments`),
};
