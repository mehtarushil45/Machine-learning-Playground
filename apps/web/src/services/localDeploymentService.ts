/**
 * Local Deployment Service — Prototype 4.
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
  | 'DEPLOYING'
  | 'READY'
  | 'FAILED'
  | 'STOPPING'
  | 'STOPPED';

export interface LogEntry {
  ts: string;
  msg: string;
}

export interface LocalDeploymentResponse {
  deployment_id: string;
  job_id: string;
  model_id: string;
  name: string;
  status: LocalDeploymentStatus;
  algorithm: string;
  problem_type: string;
  dataset_id: string;
  target_column: string;
  feature_columns: string[];
  input_schema: Record<string, FeatureSchemaEntry>;
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
}

export interface LocalPredictRequest {
  inputs: Record<string, any>;
}

export interface LocalPredictResponse {
  deployment_id: string;
  job_id: string;
  model_id: string;
  prediction: any;
  probabilities?: Record<string, number> | null;
  confidence?: number | null;
  problem_type: string;
  latency_ms: number;
  timestamp: string;
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
   * Returns READY status if artifact is found and model loads successfully.
   */
  create: (jobId: string, name = 'Local Deployment'): Promise<LocalDeploymentResponse> =>
    request<LocalDeploymentResponse>('/local-deployments', {
      method: 'POST',
      body: JSON.stringify({ job_id: jobId, name }),
    }),

  /** List all deployments owned by the current user. */
  list: (): Promise<LocalDeploymentResponse[]> =>
    request<LocalDeploymentResponse[]>('/local-deployments'),

  /** Get a single deployment by ID. */
  get: (deploymentId: string): Promise<LocalDeploymentResponse> =>
    request<LocalDeploymentResponse>(`/local-deployments/${deploymentId}`),

  /** Execute a prediction against a READY deployment. */
  predict: (
    deploymentId: string,
    inputs: Record<string, any>
  ): Promise<LocalPredictResponse> =>
    request<LocalPredictResponse>(`/local-deployments/${deploymentId}/predict`, {
      method: 'POST',
      body: JSON.stringify({ inputs }),
    }),

  /** Stop a READY deployment (preserves artifact). */
  stop: (deploymentId: string): Promise<LocalDeploymentResponse> =>
    request<LocalDeploymentResponse>(`/local-deployments/${deploymentId}/stop`, {
      method: 'POST',
    }),

  /** Redeploy a STOPPED or FAILED deployment. */
  redeploy: (deploymentId: string): Promise<LocalDeploymentResponse> =>
    request<LocalDeploymentResponse>(`/local-deployments/${deploymentId}/redeploy`, {
      method: 'POST',
    }),

  /** List deployments created from a specific training job. */
  listForJob: (jobId: string): Promise<LocalDeploymentResponse[]> =>
    request<LocalDeploymentResponse[]>(`/jobs/${jobId}/local-deployments`),
};
