/**
 * Job Service — cookie-based auth edition.
 *
 * Every fetch now includes `credentials: 'include'` so the browser
 * automatically sends the httpOnly `access_token` cookie.  No manual
 * token handling in this file.
 *
 * Error handling
 * --------------
 * - HTTP 401: The server rejected the cookie (expired / revoked).
 *   We throw an AuthExpiredError so the caller can redirect to login.
 * - HTTP 403: Ownership check failed (trying to access another user's job).
 * - HTTP 4xx/5xx: Generic Error with the API's detail message.
 */

import type {
  JobEntity,
  JobListData,
  JobProgressInfo,
  JobCancelResult,
  JobRetryResult,
  TrainingRequestPayload,
} from '../types/job'
import { AuthExpiredError } from './api'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

// Shared fetch options — cookie auth
const COOKIE_OPTS: RequestInit = {
  credentials: 'include',     // ← send httpOnly access_token cookie
}

/**
 * Thin fetch wrapper that attaches cookie credentials and parses errors.
 */
async function apiFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...COOKIE_OPTS,
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string>),
    },
  })

  if (res.status === 401) {
    const err = await res.json().catch(() => ({}))
    throw new AuthExpiredError(err.detail ?? 'Session expired. Please log in again.')
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail ?? `Request failed (${res.status})`)
  }

  return res.json()
}

// ---------------------------------------------------------------------------
// Job API functions
// ---------------------------------------------------------------------------

export async function createTrainingJob(
  payload: TrainingRequestPayload,
): Promise<JobEntity> {
  return apiFetch<JobEntity>(`${API_BASE_URL}/api/v1/jobs/train`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function fetchJobs(skip = 0, limit = 50): Promise<JobListData> {
  try {
    return await apiFetch<JobListData>(
      `${API_BASE_URL}/api/v1/jobs?skip=${skip}&limit=${limit}`,
    )
  } catch (err) {
    if (err instanceof AuthExpiredError) throw err  // propagate 401
    return { total: 0, jobs: [] }
  }
}

export async function fetchJobDetails(jobId: string): Promise<JobEntity | null> {
  try {
    return await apiFetch<JobEntity>(`${API_BASE_URL}/api/v1/jobs/${jobId}`)
  } catch (err) {
    if (err instanceof AuthExpiredError) throw err
    return null
  }
}

export async function fetchJobProgress(jobId: string): Promise<JobProgressInfo | null> {
  try {
    return await apiFetch<JobProgressInfo>(
      `${API_BASE_URL}/api/v1/jobs/${jobId}/progress`,
    )
  } catch (err) {
    if (err instanceof AuthExpiredError) throw err
    return null
  }
}

export async function cancelJob(jobId: string): Promise<JobCancelResult | null> {
  try {
    return await apiFetch<JobCancelResult>(
      `${API_BASE_URL}/api/v1/jobs/${jobId}/cancel`,
      { method: 'POST' },
    )
  } catch (err) {
    if (err instanceof AuthExpiredError) throw err
    return null
  }
}

export async function retryJob(jobId: string): Promise<JobRetryResult | null> {
  try {
    return await apiFetch<JobRetryResult>(
      `${API_BASE_URL}/api/v1/jobs/${jobId}/retry`,
      { method: 'POST' },
    )
  } catch (err) {
    if (err instanceof AuthExpiredError) throw err
    return null
  }
}

export async function deleteJob(jobId: string): Promise<boolean> {
  try {
    await apiFetch<void>(`${API_BASE_URL}/api/v1/jobs/${jobId}`, {
      method: 'DELETE',
    })
    return true
  } catch (err) {
    if (err instanceof AuthExpiredError) throw err
    return false
  }
}
