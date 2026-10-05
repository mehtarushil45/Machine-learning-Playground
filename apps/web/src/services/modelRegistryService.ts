/**
 * Model Registry & Governance Service — Enterprise Model Lifecycle & Lineage.
 *
 * TypeScript client for /api/v1/models endpoints.
 * Integrates directly with the platform's Model Registry, Family Manager, and Lineage stores.
 */

import { apiClient } from './apiClient';

export interface ModelMetrics {
  accuracy?: number | null;
  f1_score?: number | null;
  roc_auc?: number | null;
  precision?: number | null;
  recall?: number | null;
  r2_score?: number | null;
  rmse?: number | null;
  mae?: number | null;
  [key: string]: any;
}

export interface ModelLineageDataset {
  dataset_id: string;
  dataset_name?: string;
  row_count?: number;
  feature_count?: number;
  target_column?: string;
}

export interface ModelLineage {
  model_id: string;
  algorithm: string;
  dataset_provenance?: ModelLineageDataset;
  job_id?: string;
  experiment_id?: string;
  hyperparameters?: Record<string, any>;
  feature_columns?: string[];
  metrics?: ModelMetrics;
  created_at?: string;
}

export interface RegisteredModel {
  model_id: string;
  job_id?: string | null;
  experiment_id?: string | null;
  algorithm: string;
  dataset_id: string;
  problem_type: string;
  model_version?: string;
  semantic_version?: string;
  version: string;
  status: 'ACTIVE' | 'ARCHIVED' | 'DEPRECATED';
  model_family?: string;
  owner?: string;
  description?: string;
  tags?: string[];
  metrics?: ModelMetrics;
  metrics_summary?: Record<string, any>;
  accuracy?: number | null;
  f1?: number | null;
  auc?: number | null;
  registered_at: string;
  promoted_at?: string | null;
  archived_at?: string | null;
  archive_reason?: string | null;
  model_path?: string;
  lineage?: ModelLineage;
}

export interface ModelFamily {
  family_key: string;
  algorithm: string;
  dataset_id: string;
  champion_model_id?: string | null;
  challenger_model_ids?: string[];
  version_count?: number;
  latest_version?: string;
}

export const ModelRegistryService = {
  /** List registered model versions with optional filters. */
  listModels: async (params?: {
    status?: string;
    algorithm?: string;
    dataset_id?: string;
    problem_type?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ total: number; models: RegisteredModel[] }> => {
    const q = new URLSearchParams();
    if (params?.status) q.append('status', params.status);
    if (params?.algorithm) q.append('algorithm', params.algorithm);
    if (params?.dataset_id) q.append('dataset_id', params.dataset_id);
    if (params?.problem_type) q.append('problem_type', params.problem_type);
    if (params?.limit) q.append('limit', String(params.limit));
    if (params?.offset) q.append('offset', String(params.offset));

    const qs = q.toString();
    return apiClient.request<{ total: number; models: RegisteredModel[] }>(
      `/models${qs ? `?${qs}` : ''}`
    );
  },

  /** List all model families tracked by the Version Manager. */
  listFamilies: async (): Promise<{ total: number; families: ModelFamily[] }> => {
    return apiClient.request<{ total: number; families: ModelFamily[] }>('/models/families');
  },

  /** Get metadata record for a specific model version. */
  getModel: async (modelId: string): Promise<RegisteredModel> => {
    return apiClient.request<RegisteredModel>(`/models/${modelId}`);
  },

  /** Get full lineage provenance record for a model version. */
  getLineage: async (modelId: string): Promise<ModelLineage> => {
    return apiClient.request<ModelLineage>(`/models/${modelId}/lineage`);
  },

  /** Promote a model to canonical ACTIVE (Champion). */
  promoteModel: async (modelId: string): Promise<RegisteredModel> => {
    return apiClient.request<RegisteredModel>(`/models/${modelId}/promote`, {
      method: 'POST',
    });
  },

  /** Archive a model version. */
  archiveModel: async (modelId: string, reason = ''): Promise<RegisteredModel> => {
    return apiClient.request<RegisteredModel>(`/models/${modelId}/archive`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  /** Restore an archived model back to ACTIVE status. */
  restoreModel: async (modelId: string): Promise<RegisteredModel> => {
    return apiClient.request<RegisteredModel>(`/models/${modelId}/restore`, {
      method: 'POST',
    });
  },

  /** Deprecate a model version. */
  deprecateModel: async (modelId: string): Promise<RegisteredModel> => {
    return apiClient.request<RegisteredModel>(`/models/${modelId}/deprecate`, {
      method: 'POST',
    });
  },

  /** Rollback to a specific model version within a model family. */
  rollbackFamily: async (
    familyKey: string,
    targetModelId: string,
    reason = 'Manual rollback from console'
  ): Promise<any> => {
    return apiClient.request<any>(`/models/families/${encodeURIComponent(familyKey)}/rollback`, {
      method: 'POST',
      body: JSON.stringify({ target_model_id: targetModelId, reason }),
    });
  },

  /** Get champion model details for a family. */
  getFamilyChampion: async (familyKey: string): Promise<any> => {
    return apiClient.request<any>(`/models/families/${encodeURIComponent(familyKey)}/champion`);
  },

  /** Get challenger models for a family. */
  getFamilyChallengers: async (familyKey: string): Promise<any> => {
    return apiClient.request<any>(`/models/families/${encodeURIComponent(familyKey)}/challengers`);
  },
};
