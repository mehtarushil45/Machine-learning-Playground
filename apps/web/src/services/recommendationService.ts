import type {
  DatasetProfile,
  DatasetHealthReport,
  DatasetRecommendations,
  TargetSuggestion,
  FeatureRecommendation,
  SupportedAlgorithm,
  SupportedAlgorithmsResponse,
  RecommendationRequest,
  RecommendationJobCreateResponse,
  RecommendationJobDetail,
} from '../types/dataset'

import { apiClient } from './apiClient'

/**
 * Fetch supported algorithms catalog from the backend API.
 */
export async function fetchSupportedAlgorithms(
  signal?: AbortSignal,
): Promise<SupportedAlgorithm[]> {
  const resp = await apiClient.get<SupportedAlgorithmsResponse>('/algorithms/supported', { signal })
  return resp?.algorithms || []
}

/**
 * Start or deduplicate an evidence-based algorithm recommendation benchmark job.
 */
export async function startRecommendation(
  datasetId: string,
  payload: RecommendationRequest,
  signal?: AbortSignal,
): Promise<RecommendationJobCreateResponse> {
  return await apiClient.post<RecommendationJobCreateResponse>(
    `/datasets/${datasetId}/recommendations`,
    payload,
    { signal },
  )
}

/**
 * Poll or fetch the status and candidate benchmarks of a recommendation job.
 */
export async function getRecommendationJob(
  datasetId: string,
  jobId: string,
  signal?: AbortSignal,
): Promise<RecommendationJobDetail> {
  return await apiClient.get<RecommendationJobDetail>(
    `/datasets/${datasetId}/recommendations/${jobId}`,
    { signal },
  )
}

/**
 * Cancel an in-flight recommendation job.
 */
export async function cancelRecommendation(
  datasetId: string,
  jobId: string,
  signal?: AbortSignal,
): Promise<RecommendationJobDetail> {
  return await apiClient.post<RecommendationJobDetail>(
    `/datasets/${datasetId}/recommendations/${jobId}/cancel`,
    {},
    { signal },
  )
}

export async function fetchDatasetRecommendations(
  datasetId: string,
  signal?: AbortSignal,
): Promise<DatasetRecommendations | null> {
  try {
    return await apiClient.get<DatasetRecommendations>(`/datasets/${datasetId}/recommendations`, { signal })
  } catch {
    return null
  }
}

/**
 * Computes a client-side dataset recommendation report from DatasetProfile + DatasetHealthReport.
 * Consumes ONLY profiler and health outputs as sources of truth.
 */
export function computeClientRecommendations(
  profile: DatasetProfile,
  health: DatasetHealthReport,
): DatasetRecommendations {
  const warnings: string[] = [...health.warnings]

  // 1. Overall Readiness
  let overall_readiness = 'Needs Cleaning'
  let readiness_reasoning = `Dataset health score is ${health.health_score}/100 (${health.grade}).`

  if (health.health_score >= 85 && profile.empty_columns === 0) {
    overall_readiness = 'Ready for Training'
    readiness_reasoning = `Dataset health score is excellent (${health.health_score}/100) with zero empty columns and clean feature distributions.`
  } else if (health.health_score < 50) {
    overall_readiness = 'Critical Remediation Required'
    readiness_reasoning = `Dataset health score is critical (${health.health_score}/100). Remediation is required before training.`
  }

  // 2. Target Variable Suggestions
  const target_suggestions: TargetSuggestion[] = []
  const targetKeywords = ['target', 'label', 'class', 'y', 'response', 'outcome', 'status', 'price', 'sales']

  profile.columns.forEach((col) => {
    const nameLower = col.name.toLowerCase()
    if (col.type === 'identifier') return

    if (targetKeywords.some((kw) => nameLower.includes(kw))) {
      const task = col.type === 'categorical' || col.type === 'boolean' ? 'Classification' : 'Regression'
      target_suggestions.push({
        column_name: col.name,
        confidence: 'High',
        suggested_task: task,
        reasoning: `Column name '${col.name}' explicitly matches standard machine learning target keywords.`,
      })
    } else if ((col.type === 'categorical' || col.type === 'boolean') && col.unique >= 2 && col.unique <= 20) {
      target_suggestions.push({
        column_name: col.name,
        confidence: col.name === profile.columns[profile.columns.length - 1]?.name ? 'High' : 'Medium',
        suggested_task: 'Classification',
        reasoning: `Discrete target candidate with ${col.unique} unique category values.`,
      })
    } else if (col.type === 'numeric' && col.unique > 10) {
      target_suggestions.push({
        column_name: col.name,
        confidence: col.name === profile.columns[profile.columns.length - 1]?.name ? 'High' : 'Medium',
        suggested_task: 'Regression',
        reasoning: `Continuous numeric target candidate with min/max range.`,
      })
    }
  })

  if (target_suggestions.length === 0 && profile.columns.length > 0) {
    const lastCol = profile.columns[profile.columns.length - 1]
    const task = lastCol.type === 'categorical' || lastCol.type === 'boolean' ? 'Classification' : 'Regression'
    target_suggestions.push({
      column_name: lastCol.name,
      confidence: 'Medium',
      suggested_task: task,
      reasoning: `Positioned as the final column in dataset '${lastCol.name}'.`,
    })
  }

  target_suggestions.sort((a) => (a.confidence === 'High' ? -1 : 1))

  // 3. Problem Type & Models
  const primaryTarget = target_suggestions[0]
  const datetimeCols = profile.columns.filter((c) => c.type === 'datetime')

  let recommended_problem_type = 'Clustering'
  let problem_type_confidence = 0.75
  let problem_type_reasoning = 'No explicit target variable specified; unsupervised feature clustering recommended.'
  // Training choices come from the API-backed registry. This offline analyzer
  // identifies the task only; it never owns a duplicate algorithm list.
  const recommended_models: string[] = []

  if (primaryTarget && primaryTarget.suggested_task === 'Classification') {
    recommended_problem_type = 'Classification'
    problem_type_confidence = 0.95
    problem_type_reasoning = `Primary target candidate '${primaryTarget.column_name}' is discrete classification.`
  } else if (primaryTarget && primaryTarget.suggested_task === 'Regression') {
    recommended_problem_type = 'Regression'
    problem_type_confidence = 0.90
    problem_type_reasoning = `Primary target candidate '${primaryTarget.column_name}' is continuous numerical regression.`
  } else if (datetimeCols.length > 0) {
    recommended_problem_type = 'Time Series'
    problem_type_confidence = 0.85
    problem_type_reasoning = `Dataset contains datetime temporal feature '${datetimeCols[0].name}'.`
  }

  // 4. Preprocessing Pipeline
  const recommended_preprocessing: string[] = []
  if (profile.duplicate_rows > 0) recommended_preprocessing.push('Duplicate Row Removal')
  if (profile.empty_columns > 0) recommended_preprocessing.push('Empty Column Removal')
  if (profile.columns.some((c) => c.type === 'identifier')) recommended_preprocessing.push('Identifier Column Dropping')
  if (profile.total_missing_values > 0) recommended_preprocessing.push('Missing Value Imputation (Median / Mode)')
  if (profile.columns.some((c) => c.type === 'categorical' || c.type === 'boolean'))
    recommended_preprocessing.push('One-Hot / Target Encoding')
  if (profile.columns.some((c) => c.type === 'numeric'))
    recommended_preprocessing.push('Feature Normalization')

  // 5. Feature Action Recommendations
  const feature_recommendations: FeatureRecommendation[] = profile.columns.map((col) => {
    if (col.type === 'identifier') {
      return {
        column_name: col.name,
        recommended_action: 'drop',
        reasoning: 'Primary key identifier column provides zero generalizable predictive signal.',
      }
    }
    if (col.missing_percentage >= 100) {
      return {
        column_name: col.name,
        recommended_action: 'drop',
        reasoning: 'Column is 100% empty.',
      }
    }
    if (col.unique === 1) {
      return {
        column_name: col.name,
        recommended_action: 'drop',
        reasoning: 'Zero-variance constant feature contains identical values across all rows.',
      }
    }
    if (col.type === 'categorical' || col.type === 'boolean') {
      return {
        column_name: col.name,
        recommended_action: 'encode',
        reasoning: `Categorical feature with ${col.unique} unique values requires One-Hot or Ordinal encoding.`,
      }
    }
    if (col.type === 'numeric') {
      return {
        column_name: col.name,
        recommended_action: col.missing === 0 ? 'scale' : 'impute',
        reasoning: `Continuous numeric feature requires scaling/imputation.`,
      }
    }
    return {
      column_name: col.name,
      recommended_action: 'keep',
      reasoning: 'Feature formatted appropriately.',
    }
  })

  return {
    dataset_id: profile.dataset_id,
    filename: profile.filename,
    overall_readiness,
    readiness_reasoning,
    recommended_problem_type,
    problem_type_confidence,
    problem_type_reasoning,
    recommended_models,
    recommended_preprocessing,
    target_suggestions,
    feature_recommendations,
    warnings,
  }
}
