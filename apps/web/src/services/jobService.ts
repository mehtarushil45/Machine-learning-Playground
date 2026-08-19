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
  TrainingOptions,
} from '../types/job'
import { CANONICAL_TRAINING_OPTIONS } from '../types/job'
import { apiClient, AuthExpiredError } from './apiClient'
export { AuthExpiredError }

export async function fetchTrainingOptions(signal?: AbortSignal): Promise<TrainingOptions> {
  try {
    const data = await apiClient.get<TrainingOptions>('/training-options', { signal })
    if (data && data.algorithms && data.algorithms.length > 0) {
      return data
    }
    return CANONICAL_TRAINING_OPTIONS
  } catch (err) {
    if (err instanceof Error && (err.name === 'AbortError' || err.name === 'CanceledError')) {
      throw err
    }
    return CANONICAL_TRAINING_OPTIONS
  }
}

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

export async function pollJobUntilDone(
  jobId: string,
  onUpdate: (job: JobEntity) => void,
  signal?: AbortSignal
): Promise<JobEntity | null> {
  let attempt = 0
  let delay = 1000
  
  while (!signal?.aborted) {
    const job = await fetchJobDetails(jobId)
    if (!job) return null
    
    onUpdate(job)
    
    if (job.status === 'COMPLETED' || job.status === 'FAILED' || job.status === 'CANCELLED') {
      return job
    }
    
    await new Promise((resolve) => {
      const timeoutId = setTimeout(resolve, delay)
      if (signal) {
        signal.addEventListener('abort', () => {
          clearTimeout(timeoutId)
          resolve(undefined)
        })
      }
    })
    
    attempt++
    if (attempt > 2) delay = 2000
    if (attempt > 5) delay = 3000
    if (attempt > 10) delay = 5000
  }
  return null
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

export interface JobProgressSSECallbacks {
  onProgress?: (progress: JobProgressInfo) => void
  onComplete?: (progress: JobProgressInfo) => void
  onError?: (error: unknown) => void
}

/**
 * Subscribe to live job progress updates via Server-Sent Events (SSE).
 *
 * Features:
 * - Automatic reconnection with exponential backoff on connection drop
 * - Explicit connection cleanup on job completion (`event: complete`)
 * - Cleanup function returned for unmounting React components
 */
export function subscribeToJobProgressSSE(
  jobId: string,
  callbacks: JobProgressSSECallbacks,
  maxReconnectAttempts = 5
): () => void {
  const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1'
  const url = `${baseUrl}/jobs/${jobId}/stream`

  let eventSource: EventSource | null = null
  let reconnectAttempts = 0
  let isClosed = false
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null

  function connect() {
    if (isClosed) return
    eventSource = new EventSource(url, { withCredentials: true })

    eventSource.addEventListener('progress', (e: MessageEvent) => {
      try {
        const data: JobProgressInfo = JSON.parse(e.data)
        callbacks.onProgress?.(data)
        reconnectAttempts = 0 // reset backoff on valid progress frame
      } catch (err) {
        callbacks.onError?.(err)
      }
    })

    eventSource.addEventListener('complete', (e: MessageEvent) => {
      try {
        const data: JobProgressInfo = JSON.parse(e.data)
        callbacks.onComplete?.(data)
      } catch (err) {
        callbacks.onError?.(err)
      } finally {
        cleanup() // Cleanup EventSource client connection on job completion
      }
    })

    eventSource.onerror = (err) => {
      if (isClosed) return
      callbacks.onError?.(err)
      if (eventSource) {
        eventSource.close()
        eventSource = null
      }

      if (reconnectAttempts < maxReconnectAttempts) {
        reconnectAttempts++
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000)
        reconnectTimer = setTimeout(connect, delay)
      }
    }
  }

  function cleanup() {
    isClosed = true
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (eventSource) {
      eventSource.close()
      eventSource = null
    }
  }

  connect()
  return cleanup
}
