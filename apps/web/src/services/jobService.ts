import type {
  JobEntity,
  JobListData,
  JobProgressInfo,
  JobCancelResult,
  JobRetryResult,
  TrainingRequestPayload,
} from '../types/job'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

export async function createTrainingJob(
  payload: TrainingRequestPayload,
): Promise<JobEntity> {
  const res = await fetch(`${API_BASE_URL}/api/v1/jobs/train`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.detail || 'Failed to initialize training job.')
  }

  return res.json()
}

export async function fetchJobs(skip = 0, limit = 50): Promise<JobListData> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/jobs?skip=${skip}&limit=${limit}`)
    if (!res.ok) {
      return { total: 0, jobs: [] }
    }
    return res.json()
  } catch {
    return { total: 0, jobs: [] }
  }
}

export async function fetchJobDetails(jobId: string): Promise<JobEntity | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/jobs/${jobId}`)
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function fetchJobProgress(jobId: string): Promise<JobProgressInfo | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/jobs/${jobId}/progress`)
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function cancelJob(jobId: string): Promise<JobCancelResult | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/jobs/${jobId}/cancel`, {
      method: 'POST',
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function retryJob(jobId: string): Promise<JobRetryResult | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/jobs/${jobId}/retry`, {
      method: 'POST',
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function deleteJob(jobId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/jobs/${jobId}`, {
      method: 'DELETE',
    })
    return res.ok
  } catch {
    return false
  }
}
