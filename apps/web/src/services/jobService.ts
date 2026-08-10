/**
 * Job Service — centralized ApiClient edition.
 */

import type {
  JobEntity,
  JobListData,
  JobProgressInfo,
  JobCancelResult,
  JobRetryResult,
  TrainingRequestPayload,
} from '../types/job'
import { apiClient, AuthExpiredError } from './apiClient'
export { AuthExpiredError }

// ---------------------------------------------------------------------------
// Job API functions
// ---------------------------------------------------------------------------

export async function createTrainingJob(
  payload: TrainingRequestPayload,
): Promise<JobEntity> {
  return apiClient.post<JobEntity>('/jobs/train', payload)
}

export async function fetchJobs(skip = 0, limit = 50): Promise<JobListData> {
  try {
    return await apiClient.get<JobListData>('/jobs', {
      params: { skip, limit },
    })
  } catch (err) {
    if (err instanceof AuthExpiredError) throw err
    return { total: 0, jobs: [] }
  }
}

export async function fetchJobDetails(jobId: string): Promise<JobEntity | null> {
  try {
    return await apiClient.get<JobEntity>(`/jobs/${jobId}`)
  } catch (err) {
    if (err instanceof AuthExpiredError) throw err
    return null
  }
}

export async function fetchJobProgress(jobId: string): Promise<JobProgressInfo | null> {
  try {
    return await apiClient.get<JobProgressInfo>(`/jobs/${jobId}/progress`)
  } catch (err) {
    if (err instanceof AuthExpiredError) throw err
    return null
  }
}

export async function cancelJob(jobId: string): Promise<JobCancelResult | null> {
  try {
    return await apiClient.post<JobCancelResult>(`/jobs/${jobId}/cancel`)
  } catch (err) {
    if (err instanceof AuthExpiredError) throw err
    return null
  }
}

export async function retryJob(jobId: string): Promise<JobRetryResult | null> {
  try {
    return await apiClient.post<JobRetryResult>(`/jobs/${jobId}/retry`)
  } catch (err) {
    if (err instanceof AuthExpiredError) throw err
    return null
  }
}

export async function deleteJob(jobId: string): Promise<boolean> {
  try {
    await apiClient.delete<void>(`/jobs/${jobId}`)
    return true
  } catch (err) {
    if (err instanceof AuthExpiredError) throw err
    return false
  }
}
