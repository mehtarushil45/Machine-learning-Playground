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
// 3. University Lab Exam & Classroom Service
// ---------------------------------------------------------------------------

export interface LabExamInfo {
  id: string;
  title: string;
  course_code: string;
  duration_minutes: number;
  problem_type: string;
  dataset_name: string;
  dataset_id: string;
  target_column: string;
  feature_columns: string[];
  description: string;
  rubric: {
    min_accuracy?: number;
    min_f1?: number;
    min_r2?: number;
    max_latency_ms?: number;
    max_score?: number;
  };
  starter_code: string;
}

export interface LabExamSession {
  exam_id: string;
  student_id: string;
  active_deployment_id?: string | null;
  code_draft?: string | null;
  version_count: number;
  status: string;
  grade_score?: number | null;
  submitted_at?: string | null;
}

export interface LabDeployResponse {
  deployment_id: string;
  model_id: string;
  model_version: string;
  is_updated_in_place: boolean;
  status: string;
  endpoint_path: string;
  sample_inputs: Record<string, any>;
  input_schema: Record<string, any>;
  metrics: Record<string, number>;
  version_count: number;
  logs: Array<{ ts: string; msg: string; event: string; severity?: string }>;
}

export interface RubricCriterionResult {
  criterion: string;
  description: string;
  target: string;
  actual: string;
  passed: boolean;
  points_awarded: number;
  max_points: number;
}

export interface LabEvaluateResponse {
  score: number;
  max_score: number;
  percentage: number;
  passed: boolean;
  criteria_results: RubricCriterionResult[];
  summary: string;
}

export interface LabSubmitResponse {
  submission_id: string;
  status: string;
  grade_score: number;
  percentage: number;
  passed: boolean;
  submitted_at: string;
  message: string;
}

export const ClassroomService = {
  listExams: () => request<LabExamInfo[]>('/classrooms/exams'),

  getExam: (examId: string) => request<LabExamInfo>(`/classrooms/exams/${examId}`),

  getSession: (examId: string) => request<LabExamSession>(`/classrooms/exams/${examId}/session`),

  deployModel: (examId: string, modelId?: string, code?: string) =>
    request<LabDeployResponse>(`/classrooms/exams/${examId}/deploy`, {
      method: 'POST',
      body: JSON.stringify({ model_id: modelId, code }),
    }),

  evaluateModel: (examId: string, deploymentId: string) =>
    request<LabEvaluateResponse>(`/classrooms/exams/${examId}/evaluate`, {
      method: 'POST',
      body: JSON.stringify({ deployment_id: deploymentId }),
    }),

  submitExam: (examId: string, code: string, deploymentId?: string) =>
    request<LabSubmitResponse>(`/classrooms/exams/${examId}/submit`, {
      method: 'POST',
      body: JSON.stringify({ code, deployment_id: deploymentId }),
    }),
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
// Code Studio Execution API
// ---------------------------------------------------------------------------

export interface ExecuteRequest {
  code:       string;
  filename?:  string;
  dataset_id?: string;
  timeout?:   number;
}

export interface ExecuteResponse {
  exec_id:    string;
  status:     string;
  filename:   string;
  dataset_id: string | null;
}

export interface ExecutionResult {
  exec_id:          string;
  status:           string;
  filename:         string;
  exit_code:        number | null;
  stdout:           string;
  stderr:           string;
  artifacts:        string[];
  duration_seconds: number | null;
  error:            string | null;
  model_id?:        string | null;
}

export interface FormatResponse {
  code:    string;
  changed: boolean;
  error:   string | null;
}

export interface DiagnosticItemResponse {
  line:     number;
  col:      number;
  end_line: number;
  end_col:  number;
  severity: 'error' | 'warning' | 'info';
  message:  string;
  source:   'syntax' | 'pyflakes' | 'pep8' | 'runtime';
  code?:    string | null;
}

export interface LintResponse {
  diagnostics:   DiagnosticItemResponse[];
  valid:         boolean;
  error_count:   number;
  warning_count: number;
}

export const CodeExecutionService = {
  /** Submit code for execution. Returns exec_id immediately. */
  execute: (payload: ExecuteRequest) =>
    request<ExecuteResponse>('/code-execution/execute', {
      method: 'POST',
      body: JSON.stringify({ filename: 'train.py', timeout: 90, ...payload }),
    }),

  /** Stop a running execution. */
  stop: (execId: string) =>
    request<{ exec_id: string; status: string }>(`/code-execution/${execId}/stop`, { method: 'POST' }),

  /** Get the full result of a finished execution. */
  getResult: (execId: string) =>
    request<ExecutionResult>(`/code-execution/${execId}`),

  /** Format Python code using black/autopep8. */
  formatCode: (code: string) =>
    request<FormatResponse>('/code-execution/format', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),

  /** Lint Python code via server-side AST, pyflakes and PEP 8 analysis. */
  lintCode: (code: string, filename: string = 'train.py') =>
    request<LintResponse>('/code-execution/lint', {
      method: 'POST',
      body: JSON.stringify({ code, filename }),
    }),

  /**
   * Returns the SSE stream URL for a given exec_id.
   * The caller is responsible for creating the EventSource connection.
   */
  streamUrl: (execId: string) => `/api/v1/code-execution/${execId}/stream`,

  /**
   * Returns the WebSocket stream URL for a given exec_id.
   */
  wsStreamUrl: (execId: string) => {
    if (typeof window === 'undefined') return `/api/v1/code-execution/${execId}/ws`;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/api/v1/code-execution/${execId}/ws`;
  },
};

