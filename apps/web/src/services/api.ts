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
  copilot_policy?: string;
  open_time?: string | null;
  close_time?: string | null;
  is_closed?: boolean;
  protected_regions?: string[];
  learning_aids_enabled?: boolean;
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
  is_locked?: boolean;
  submission_receipt?: any;
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
  hint?: string | null;
}

export interface LabEvaluateResponse {
  score: number;
  max_score: number;
  percentage: number;
  passed: boolean;
  criteria_results: RubricCriterionResult[];
  summary: string;
  guardrail_warnings?: string[];
  latency_method?: string;
}

export interface LabSubmitResponse {
  submission_id: string;
  status: string;
  grade_score: number;
  percentage: number;
  passed: boolean;
  submitted_at: string;
  code_sha256?: string;
  model_sha256?: string;
  rubric_snapshot?: any;
  reproducibility_verified?: boolean;
  guardrail_flags?: string[];
  message: string;
}

export interface ClassroomRosterMember {
  user_id: string;
  email: string;
  full_name?: string | null;
  role: string;
  joined_at: string;
}

export interface SubmissionDashboardItem {
  submission_id: string;
  learner_id: string;
  learner_name: string;
  learner_email: string;
  status: string;
  grade_score?: number | null;
  submitted_at?: string | null;
  reproducibility_verified: boolean;
  code_sha256?: string | null;
  model_sha256?: string | null;
  guardrail_flags: string[];
  code_snippet?: string | null;
}

export interface ReproduceAuditResponse {
  submission_id: string;
  original_score: number;
  reproduced_score: number;
  tolerance: number;
  verified: boolean;
  reproduced_metrics: Record<string, any>;
  details: string;
}

export interface ClassroomSummary {
  id: string;
  name: string;
  course_id?: string | null;
  description?: string | null;
  role: 'owner' | 'student' | 'member';
  status: string;
  join_code?: string | null;
  join_code_active?: boolean;
  member_count: number;
  created_at: string;
  exam_start_time?: string | null;
  exam_end_time?: string | null;
  is_exam_started?: boolean;
  is_archived?: boolean;
  user_score?: number | null;
}

export interface MyClassroomsResponse {
  owned: ClassroomSummary[];
  joined: ClassroomSummary[];
  active_exam_resume?: {
    classroom_id: string;
    classroom_name: string;
    assignment_id: string;
    status: string;
  } | null;
}

export interface ClassroomCreateEnhanced {
  name: string;
  course_id?: string;
  description?: string;
  assignment_title?: string;
  instructions?: string;
  starter_code?: string;
  rubric_json?: any;
  allowed_divisions?: string[];
  allowed_batches?: string[];
  enrollment_format_hint?: string;
  enrollment_pattern?: string;
  require_approval?: boolean;
  exam_start_time?: string;
  exam_end_time?: string;
}

export interface JoinPreviewResponse {
  id: string;
  name: string;
  course_id?: string | null;
  description?: string | null;
  owner_name: string;
  require_approval: boolean;
}

export interface JoinClassroomResponse {
  classroom_id: string;
  classroom_name: string;
  status: string;
  require_approval: boolean;
  message: string;
}

export interface MemberDetailsResponse {
  classroom_id: string;
  classroom_name: string;
  full_name: string;
  enrollment_number?: string | null;
  division?: string | null;
  batch?: string | null;
  status: string;
  allowed_divisions: string[];
  allowed_batches: string[];
  enrollment_format_hint?: string | null;
  is_exam_started: boolean;
  can_edit: boolean;
}

export interface SaveMemberDetailsRequest {
  full_name: string;
  enrollment_number: string;
  division?: string;
  batch?: string;
}

export interface ExamLobbyResponse {
  classroom_id: string;
  classroom_name: string;
  status: string;
  is_exam_started: boolean;
  exam_start_time?: string | null;
  exam_end_time?: string | null;
  server_time: string;
  countdown_seconds: number;
  can_enter_workspace: boolean;
  message: string;
}

export interface RosterMemberItem {
  user_id: string;
  full_name: string;
  enrollment_number?: string | null;
  division?: string | null;
  batch?: string | null;
  status: string;
  score?: number | null;
  submission_time?: string | null;
  last_activity?: string | null;
  joined_at: string;
  time_extension_minutes: number;
  is_reopened: boolean;
}

export interface RosterPaginationResponse {
  items: RosterMemberItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface ParticipantInspectionResponse {
  classroom_id: string;
  user_id: string;
  full_name: string;
  enrollment_number?: string | null;
  division?: string | null;
  batch?: string | null;
  status: string;
  starter_code: string;
  final_code: string;
  rubric_breakdown: Record<string, any>;
  metrics_and_summary: Record<string, any>;
  event_timeline: Array<{ event: string; timestamp: string; details?: any }>;
  reproducibility_verified?: boolean | null;
  reproduced_score?: number | null;
  score?: number | null;
  feedback?: string | null;
}

export const ClassroomService = {
  // Student Lab Exam Methods
  listExams: () => request<LabExamInfo[]>('/classrooms/exams'),

  getExam: (examId: string) => request<LabExamInfo>(`/classrooms/exams/${examId}`),

  getSession: (examId: string) => request<LabExamSession>(`/classrooms/exams/${examId}/session`),

  saveDraft: (examId: string, code: string) =>
    request<{ saved_at: string; message: string }>(`/classrooms/exams/${examId}/draft`, {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),

  copilotAsk: (examId: string, prompt: string, codeContext?: string) =>
    request<{ reply: string; policy: string; allowed: boolean }>(`/classrooms/exams/${examId}/copilot`, {
      method: 'POST',
      body: JSON.stringify({ prompt, code_context: codeContext }),
    }),

  stopLabSlot: (examId: string) =>
    request<{ status: string; message: string }>(`/classrooms/exams/${examId}/stop`, {
      method: 'POST',
    }),

  resetSession: (examId: string) =>
    request<{ status: string; message: string }>(`/classrooms/exams/${examId}/reset`, {
      method: 'POST',
    }),

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

  // Enhanced Classroom Entry & Management Methods (Parts B-I)
  listMyClassrooms: () => request<MyClassroomsResponse>('/classrooms/my'),

  createClassroomEnhanced: (data: ClassroomCreateEnhanced) =>
    request<any>('/classrooms/enhanced', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  previewJoinCode: (code: string) =>
    request<JoinPreviewResponse>(`/classrooms/join-preview?code=${encodeURIComponent(code)}`),

  joinClassroom: (code: string) =>
    request<JoinClassroomResponse>('/classrooms/join', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),

  getMyDetails: (classroomId: string) =>
    request<MemberDetailsResponse>(`/classrooms/${classroomId}/my-details`),

  saveMyDetails: (classroomId: string, data: SaveMemberDetailsRequest) =>
    request<MemberDetailsResponse>(`/classrooms/${classroomId}/my-details`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  getExamLobby: (classroomId: string) =>
    request<ExamLobbyResponse>(`/classrooms/${classroomId}/lobby`),

  startClassroomExam: (classroomId: string) =>
    request<any>(`/classrooms/${classroomId}/start-exam`, {
      method: 'POST',
    }),

  enterExamWorkspace: (classroomId: string) =>
    request<any>(`/classrooms/${classroomId}/enter-workspace`, {
      method: 'POST',
    }),

  getRosterPaginated: (
    classroomId: string,
    params: {
      page?: number;
      page_size?: number;
      search?: string;
      division?: string;
      batch?: string;
      status?: string;
      sort_by?: string;
      sort_order?: string;
    } = {}
  ) => {
    const q = new URLSearchParams();
    if (params.page) q.set('page', String(params.page));
    if (params.page_size) q.set('page_size', String(params.page_size));
    if (params.search) q.set('search', params.search);
    if (params.division) q.set('division', params.division);
    if (params.batch) q.set('batch', params.batch);
    if (params.status) q.set('status', params.status);
    if (params.sort_by) q.set('sort_by', params.sort_by);
    if (params.sort_order) q.set('sort_order', params.sort_order);
    return request<RosterPaginationResponse>(`/classrooms/${classroomId}/roster-paginated?${q.toString()}`);
  },

  getRosterExportCsvUrl: (classroomId: string) => `/api/v1/classrooms/${classroomId}/roster/export.csv`,

  inspectParticipant: (classroomId: string, userId: string) =>
    request<ParticipantInspectionResponse>(`/classrooms/${classroomId}/participants/${userId}/inspect`),

  resetJoinCode: (classroomId: string) =>
    request<{ join_code: string; message: string }>(`/classrooms/${classroomId}/reset-code`, {
      method: 'POST',
    }),

  toggleJoinCode: (classroomId: string, active: boolean) =>
    request<any>(`/classrooms/${classroomId}/toggle-join-code`, {
      method: 'POST',
      body: JSON.stringify({ active }),
    }),

  setMemberApproval: (classroomId: string, userId: string, approve: boolean) =>
    request<any>(`/classrooms/${classroomId}/members/${userId}/approval`, {
      method: 'POST',
      body: JSON.stringify({ approve }),
    }),

  grantTimeExtension: (classroomId: string, userId: string, minutes: number) =>
    request<any>(`/classrooms/${classroomId}/members/${userId}/extension`, {
      method: 'POST',
      body: JSON.stringify({ minutes }),
    }),

  reopenSubmission: (classroomId: string, userId: string, reopen: boolean) =>
    request<any>(`/classrooms/${classroomId}/members/${userId}/reopen`, {
      method: 'POST',
      body: JSON.stringify({ reopen }),
    }),

  removeMember: (classroomId: string, userId: string) =>
    request<any>(`/classrooms/${classroomId}/members/${userId}`, {
      method: 'DELETE',
    }),

  archiveClassroom: (classroomId: string, isArchived: boolean) =>
    request<any>(`/classrooms/${classroomId}/archive`, {
      method: 'POST',
      body: JSON.stringify({ is_archived: isArchived }),
    }),

  // Legacy Instructor Management Methods (Parts B1-B6)
  listClassrooms: () => request<any[]>('/classrooms'),

  createClassroom: (data: { course_id: string; name: string; code: string; term?: string }) =>
    request<any>('/classrooms', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getRoster: (classroomId: string) => request<ClassroomRosterMember[]>(`/classrooms/${classroomId}/roster`),

  inviteStudent: (classroomId: string, data: { email?: string; invite_code?: string; role?: string }) =>
    request<any>(`/classrooms/${classroomId}/invite`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  listAssignments: (classroomId?: string) =>
    request<any[]>(classroomId ? `/classrooms/assignments?classroom_id=${classroomId}` : '/classrooms/assignments'),

  createAssignment: (data: any) =>
    request<any>('/classrooms/assignments', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getSubmissions: (assignmentId: string) =>
    request<SubmissionDashboardItem[]>(`/classrooms/assignments/${assignmentId}/submissions`),

  getGradesCsvUrl: (assignmentId: string) => `/api/v1/classrooms/assignments/${assignmentId}/grades.csv`,

  auditReproducibility: (submissionId: string) =>
    request<ReproduceAuditResponse>(`/classrooms/submissions/${submissionId}/reproduce`, {
      method: 'POST',
    }),

  gradeSubmission: (submissionId: string, data: { score: number; comments: string }) =>
    request<any>(`/classrooms/submissions/${submissionId}/grade`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  listTemplates: () => request<any[]>('/classrooms/templates'),

  saveTemplate: (data: any) =>
    request<any>('/classrooms/templates', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getCurriculumInstructorSummary: async () => {
    const summary = await request<{ total_students_active: number; lesson_completion_counts: Record<string, number> }>(
      '/learning/progress/instructor-summary'
    ).catch(() => ({ total_students_active: 0, lesson_completion_counts: {} as Record<string, number> }));

    const lessons = await request<any[]>('/learning/lessons').catch(() => []);

    return {
      total_students_active: summary?.total_students_active || 0,
      lessons: (lessons || []).map((l: any) => ({
        lesson_id: l.id,
        lesson_number: l.number,
        lesson_title: l.title,
        completed_count: summary?.lesson_completion_counts?.[l.id] || 0,
        page_route: l.page_route,
        goal: l.goal,
      })),
    };
  },
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

// ---------------------------------------------------------------------------
// 7. Student Learning Layer Service (Guided Lessons, Stories, Signals, Code Lint)
// ---------------------------------------------------------------------------

export interface LessonProgressPayload {
  selected_option?: number;
  platform_state_evidence?: Record<string, any>;
}

export const LearningService = {
  getLessons: () => request<any[]>('/learning/lessons'),
  getProgress: () => request<{ student_id: string; completed_lessons: string[]; last_updated: string }>('/learning/progress'),
  completeLesson: (lessonId: string, payload: LessonProgressPayload) =>
    request<any>(`/learning/progress/${lessonId}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getInstructorSummary: () => request<any>('/learning/progress/instructor-summary'),
  logSignal: (payload: { event_type: string; card_id?: string; lesson_id?: string; context_page?: string; learning_mode_enabled?: boolean }) =>
    request<any>('/learning/signals', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  auditCode: (code: string, filename?: string) =>
    request<any>('/learning/code-lint', {
      method: 'POST',
      body: JSON.stringify({ code, filename }),
    }),
  getStories: () => request<any[]>('/learning/stories'),
  loadStory: (storyId: string) =>
    request<any>(`/learning/stories/${storyId}/load`, {
      method: 'POST',
    }),
};

// ---------------------------------------------------------------------------
// 8. Enterprise AI Copilot Service (LLM Pair-Programmer & Code Assistant)
// ---------------------------------------------------------------------------

export interface CopilotChatPayload {
  prompt: string;
  code_context?: string;
  dataset_name?: string;
  dataset_schema?: Record<string, any>;
  error_traceback?: string;
  chat_history?: Array<{ role: string; content: string }>;
  policy?: string;
}

export interface CopilotChatResult {
  reply: string;
  provider: string;
  model: string;
  allowed: boolean;
  configured: boolean;
  error?: string;
}

export interface CopilotStatusResult {
  configured: boolean;
  provider: string;
  model: string;
  requires_key: boolean;
}

export const CopilotApiService = {
  chat: (payload: CopilotChatPayload) =>
    request<CopilotChatResult>('/copilot/chat', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getStatus: () => request<CopilotStatusResult>('/copilot/status'),
};

