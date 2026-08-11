/**
 * Enterprise MLPlayground REST API Service Layer — Phase 7.
 * 
 * Provides fully-typed TypeScript fetch/axios methods for:
 *   - Authentication & User Roles
 *   - Dataset Upload & Profiling
 *   - Training Jobs & Background Tracking
 *   - Visual Pipeline & Bi-Directional "View-as-Code" Studio
 *   - Inference & Batch Prediction Studio
 *   - Explainability (SHAP), Demographic Bias Auditing & What-If Simulation
 *   - Classroom System, Assignment Submissions & Automated Reproducibility Verification
 *   - Deployment Studio & Embeddable Web Widget Generation
 *   - Learner Portfolios & Cryptographic QR Certificate Verification
 */

import { apiClient, AuthExpiredError, ApiError, ApiTimeoutError } from './apiClient'
export { apiClient, AuthExpiredError, ApiError, ApiTimeoutError }

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  return apiClient.request<T>(endpoint, options)
}

// ---------------------------------------------------------------------------
// 1. Visual Pipeline & View-as-Code API
// ---------------------------------------------------------------------------

export interface PipelineNodeConfig {
  node_id: string;
  type: string;
  name: string;
  params: Record<string, any>;
}

export interface PipelineDAG {
  dataset_name: string;
  target_column: string;
  feature_columns: string[];
  nodes: PipelineNodeConfig[];
  connections?: { from_node: string; to_node: string }[];
}

export interface CodeStepExplanation {
  step_number: number;
  node_id: string;
  node_type: string;
  title: string;
  explanation: string;
  code_snippet: string;
}

export interface CodeGenerationResponse {
  python_code: string;
  steps_explanation: CodeStepExplanation[];
  is_valid_syntax: boolean;
  imports: string[];
  generated_at: string;
}

export interface PipelineValidationResponse {
  is_valid: boolean;
  errors: string[];
  warnings: string[];
}

export const PipelineService = {
  generateCode: (pipeline: PipelineDAG, includeComments = true, includeEvaluation = true) =>
    request<CodeGenerationResponse>('/pipelines/generate-code', {
      method: 'POST',
      body: JSON.stringify({ pipeline, include_comments: includeComments, include_evaluation: includeEvaluation }),
    }),

  validatePipeline: (pipeline: PipelineDAG) =>
    request<PipelineValidationResponse>('/pipelines/validate', {
      method: 'POST',
      body: JSON.stringify(pipeline),
    }),

  getTemplates: () => request<Record<string, PipelineDAG>>('/pipelines/templates'),
};

// ---------------------------------------------------------------------------
// 2. Explainability, Bias & What-If API
// ---------------------------------------------------------------------------

export interface FeatureImpact {
  feature_name: string;
  importance_score: number;
  impact_percentage: number;
  direction: string;
}

export interface GlobalExplainabilityResponse {
  model_id: string;
  algorithm: string;
  problem_type: string;
  global_feature_importance: FeatureImpact[];
  summary_explanation: string;
}

export interface FeatureContribution {
  feature_name: string;
  feature_value: any;
  contribution_score: number;
  impact_direction: string;
  plain_language_reason: string;
}

export interface LocalExplainabilityResponse {
  prediction_id: string;
  model_id: string;
  prediction: any;
  confidence?: number;
  base_value: number;
  contributions: FeatureContribution[];
  student_summary: string;
}

export interface FairnessMetricItem {
  metric_name: string;
  value: number;
  threshold: number;
  status: string;
  explanation: string;
}

export interface FairnessAuditResponse {
  sensitive_column: string;
  privileged_group: string;
  unprivileged_group: string;
  disparate_impact_ratio: number;
  equal_opportunity_difference: number;
  demographic_parity_ratio: number;
  overall_status: string;
  metrics: FairnessMetricItem[];
  recommendation: string;
}

export interface FeatureChange {
  feature_name: string;
  original_value: any;
  new_value: any;
  delta: number;
  impact: string;
}

export interface WhatIfResponse {
  original_prediction: any;
  desired_prediction: any;
  is_outcome_achieved: boolean;
  new_confidence: number;
  suggested_changes: FeatureChange[];
  explanation: string;
}

export const ExplainabilityService = {
  getGlobalExplainability: (modelId?: string, signal?: AbortSignal) =>
    request<GlobalExplainabilityResponse>('/explainability/global', {
      method: 'POST',
      body: JSON.stringify({ model_id: modelId }),
      signal,
    }),

  getLocalExplainability: (sample: Record<string, any>, modelId?: string) =>
    request<LocalExplainabilityResponse>('/explainability/local', {
      method: 'POST',
      body: JSON.stringify({ sample, model_id: modelId }),
    }),

  auditFairness: (sampleData: any[], sensitiveColumn: string, privilegedGroup: any, unprivilegedGroup: any, modelId?: string) =>
    request<FairnessAuditResponse>('/explainability/fairness', {
      method: 'POST',
      body: JSON.stringify({
        sample_data: sampleData,
        sensitive_column: sensitiveColumn,
        privileged_group: privilegedGroup,
        unprivileged_group: unprivilegedGroup,
        model_id: modelId,
      }),
    }),

  simulateWhatIf: (sample: Record<string, any>, desiredOutcome: any, modelId?: string) =>
    request<WhatIfResponse>('/explainability/what-if', {
      method: 'POST',
      body: JSON.stringify({ sample, desired_outcome: desiredOutcome, model_id: modelId }),
    }),
};

// ---------------------------------------------------------------------------
// 3. Classroom & Automated Reproducibility Audit API
// ---------------------------------------------------------------------------

export interface MetricDifference {
  metric_name: string;
  claimed_value: number;
  reproduced_value: number;
  difference: number;
  within_tolerance: boolean;
}

export interface ReproducibilityReportResponse {
  submission_id: string;
  experiment_id?: string;
  is_reproducible: boolean;
  verification_status: string;
  claimed_metrics: Record<string, number>;
  reproduced_metrics: Record<string, number>;
  metric_differences: MetricDifference[];
  audit_summary: string;
  verified_at: string;
}

export const ClassroomService = {
  verifyReproducibility: (submissionId: string, tolerance = 0.005) =>
    request<ReproducibilityReportResponse>(`/classrooms/submissions/${submissionId}/verify-reproducibility`, {
      method: 'POST',
      body: JSON.stringify({ submission_id: submissionId, tolerance }),
    }),

  getReproducibilityReport: (submissionId: string) =>
    request<ReproducibilityReportResponse>(`/classrooms/submissions/${submissionId}/reproducibility-report`),
};

// ---------------------------------------------------------------------------
// 4. Deployment Studio & Web Widget API
// ---------------------------------------------------------------------------

export interface DeploymentResponse {
  deployment_id: string;
  model_id: string;
  deployment_name: string;
  api_key: string;
  endpoint_url: string;
  status: string;
  rate_limit_rpm: number;
  total_requests: number;
  created_at: string;
}

export interface IntegrationSnippets {
  curl_snippet: string;
  python_snippet: string;
  javascript_snippet: string;
  embeddable_widget_html: string;
}

export interface DeploymentPredictResponse {
  prediction: any;
  confidence?: number;
  probabilities?: Record<string, number>;
  latency_ms: number;
  deployment_id: string;
}

export const DeploymentService = {
  createDeployment: (modelId: string, deploymentName: string, rateLimitRpm = 60) =>
    request<DeploymentResponse>('/deployments', {
      method: 'POST',
      body: JSON.stringify({ model_id: modelId, deployment_name: deploymentName, rate_limit_rpm: rateLimitRpm }),
    }),

  listDeployments: (signal?: AbortSignal) => request<DeploymentResponse[]>('/deployments', { signal }),

  getSnippets: (deploymentId: string) => request<IntegrationSnippets>(`/deployments/${deploymentId}/snippets`),

  predictWidget: (deploymentId: string, features: Record<string, any>, apiKey: string) =>
    request<DeploymentPredictResponse>(`/deployments/${deploymentId}/predict`, {
      method: 'POST',
      headers: { 'X-API-Key': apiKey },
      body: JSON.stringify({ features }),
    }),

  updateStatus: (deploymentId: string, newStatus: string) =>
    request<DeploymentResponse>(`/deployments/${deploymentId}/status?new_status=${newStatus}`, {
      method: 'PATCH',
    }),
};

// ---------------------------------------------------------------------------
// 5. Portfolio & Cryptographic Certificate API
// ---------------------------------------------------------------------------

export interface PortfolioProjectResponse {
  id: string;
  organisation_id: string;
  user_id: string;
  submission_id?: string;
  title: string;
  description: string;
  model_id?: string;
  experiment_id?: string;
  is_public: boolean;
  certificate_qr_code?: string;
  published_at: string;
}

export interface CertificateVerificationResponse {
  verified: boolean;
  verification_status: string;
  certificate_id: string;
  title: string;
  learner_id: string;
  published_at: string;
  issuer: string;
  signature: string;
  qr_code_url: string;
}

export const PortfolioService = {
  publishProject: (title: string, description: string, modelId?: string, experimentId?: string) =>
    request<PortfolioProjectResponse>('/portfolios', {
      method: 'POST',
      body: JSON.stringify({ title, description, model_id: modelId, experiment_id: experimentId, is_public: true }),
    }),

  getUserPortfolio: (userId: string) => request<PortfolioProjectResponse[]>(`/portfolios/user/${userId}`),

  verifyCertificate: (projectId: string) => request<CertificateVerificationResponse>(`/portfolios/verify/${projectId}`),
};
