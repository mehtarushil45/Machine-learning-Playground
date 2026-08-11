import { useEffect, useState } from 'react'
import type { JobProgressInfo } from '../types/job'
import { subscribeToJobProgressSSE } from '../services/jobService'

export function useJobProgressStream(jobId: string | null) {
  const [progress, setProgress] = useState<JobProgressInfo | null>(null)
  const [isCompleted, setIsCompleted] = useState<boolean>(false)
  const [error, setError] = useState<any>(null)

  useEffect(() => {
    if (!jobId || isCompleted) return

    const unsubscribe = subscribeToJobProgressSSE(jobId, {
      onProgress: (data) => {
        setProgress(data)
      },
      onComplete: (data) => {
        setProgress(data)
        setIsCompleted(true)
      },
      onError: (err) => {
        setError(err)
      },
    })

    return () => {
      unsubscribe()
    }
  }, [jobId, isCompleted])

  return { progress, isCompleted, error }
}
