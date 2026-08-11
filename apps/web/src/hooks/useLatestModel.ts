import { useState, useEffect, useCallback, useRef } from 'react'
import type { JobEntity, JobListData } from '../types/job'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1'
const DEFAULT_POLL_INTERVAL_MS = 30000 // 30 seconds

export interface LatestModelInfo {
  algorithm: string
  version: string
  jobId: string | null
  completedAt: string | null
  displayText: string
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
}

/**
 * Custom React Hook that polls GET /api/v1/jobs every 30 seconds
 * and returns the algorithm name and version of the most recently completed ML training job.
 */
export function useLatestModel(pollIntervalMs: number = DEFAULT_POLL_INTERVAL_MS): LatestModelInfo {
  const [latestJob, setLatestJob] = useState<JobEntity | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const isMountedRef = useRef<boolean>(true)

  const fetchJobs = useCallback(async () => {
    try {
      setError(null)
      const res = await fetch(`${API_BASE}/jobs?limit=50`, {
        credentials: 'include',
      })

      if (!res.ok) {
        throw new Error(`Failed to fetch jobs (${res.status})`)
      }

      const data: JobListData = await res.json()
      
      // Filter jobs with status COMPLETED or completed status string
      const completedJobs = (data.jobs || []).filter(
        (job) => job.status === 'COMPLETED' || job.status.toLowerCase() === 'completed'
      )

      if (completedJobs.length > 0) {
        // Sort descending by completed_at or updated_at / created_at
        completedJobs.sort((a, b) => {
          const timeA = new Date(a.completed_at || a.updated_at || a.created_at).getTime()
          const timeB = new Date(b.completed_at || b.updated_at || b.created_at).getTime()
          return timeB - timeA
        })
        if (isMountedRef.current) {
          setLatestJob(completedJobs[0])
        }
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load jobs')
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    isMountedRef.current = true
    // Immediate initial fetch
    fetchJobs()

    // 30-second interval timer
    const timer = setInterval(() => {
      fetchJobs()
    }, pollIntervalMs)

    return () => {
      isMountedRef.current = false
      clearInterval(timer)
    }
  }, [fetchJobs, pollIntervalMs])

  // Process algorithm name formatting
  const rawAlgorithm = latestJob?.algorithm || 'Random Forest'
  const algorithm = rawAlgorithm
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())

  // Derive version string (e.g. from job metadata or version property, defaulting to v2.4 / v1.0)
  const version = (latestJob?.metadata as any)?.version || (latestJob?.metadata as any)?.model_version || 'v2.4'
  const displayText = `${algorithm} ${version}`

  return {
    algorithm,
    version,
    jobId: latestJob?.job_id || null,
    completedAt: latestJob?.completed_at || null,
    displayText,
    isLoading,
    error,
    refetch: fetchJobs,
  }
}
