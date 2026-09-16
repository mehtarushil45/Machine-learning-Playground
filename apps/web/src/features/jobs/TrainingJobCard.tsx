import { memo, useEffect, useRef, useState } from 'react'
import type { JobEntity } from '../../types/job'
import { fetchJobDetails, pollJobUntilDone, retryJob, subscribeToJobProgressSSE } from '../../services/jobService'
import { useCancelJobMutation } from '../../hooks/useMLQueries'
import { TrainingStatusBadge } from './TrainingStatusBadge'
import { TrainingProgressBar } from './TrainingProgressBar'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Icon } from '../../components/ui/Icon'

export interface TrainingJobCardProps {
  job: JobEntity
  onJobUpdated?: (updatedJob: JobEntity) => void
  onJobRetried?: (newJob: JobEntity) => void
}

export const TrainingJobCard = memo(function TrainingJobCard({
  job: initialJob,
  onJobUpdated,
  onJobRetried,
}: TrainingJobCardProps) {
  const [job, setJob] = useState<JobEntity>(initialJob)
  const [isActionLoading, setIsActionLoading] = useState(false)
  const onJobUpdatedRef = useRef(onJobUpdated)
  onJobUpdatedRef.current = onJobUpdated
  const fetchedDetailsRef = useRef<string | null>(null)

  const notifyUpdated = (updatedJob: JobEntity) => {
    queueMicrotask(() => {
      onJobUpdatedRef.current?.(updatedJob)
    })
  }

  useEffect(() => {
    setJob((prev) => (prev.job_id === initialJob.job_id ? { ...prev, ...initialJob } : initialJob))
  }, [initialJob.job_id, initialJob.status, initialJob.progress])

  // Live Telemetry (SSE + resilient Polling fallback)
  useEffect(() => {
    const terminalStatuses = ['COMPLETED', 'FAILED', 'CANCELLED']
    if (terminalStatuses.includes(initialJob.status)) {
      if (initialJob.status === 'COMPLETED' && !initialJob.metadata?.metrics && fetchedDetailsRef.current !== initialJob.job_id) {
        fetchedDetailsRef.current = initialJob.job_id
        fetchJobDetails(initialJob.job_id).then((fullJob) => {
          if (fullJob) {
            setJob(fullJob)
            notifyUpdated(fullJob)
          }
        }).catch(() => {})
      }
      return
    }

    let isSubscribed = true
    const abortController = new AbortController()

    const unsubscribe = subscribeToJobProgressSSE(initialJob.job_id, {
      onProgress: (liveProg) => {
        if (!isSubscribed) return
        setJob((prev) => {
          const next = {
            ...prev,
            status: liveProg.status,
            progress: liveProg.progress,
            current_stage: liveProg.current_stage,
            estimated_seconds: liveProg.estimated_seconds_remaining,
          }
          notifyUpdated(next)
          return next
        })
      },
      onComplete: async () => {
        if (!isSubscribed) return
        abortController.abort()
        fetchedDetailsRef.current = initialJob.job_id
        const fullJob = await fetchJobDetails(initialJob.job_id).catch(() => null)
        if (fullJob && isSubscribed) {
          setJob(fullJob)
          notifyUpdated(fullJob)
        }
      },
    })

    pollJobUntilDone(
      initialJob.job_id,
      (polledJob) => {
        if (!isSubscribed) return
        setJob(polledJob)
        notifyUpdated(polledJob)
      },
      abortController.signal,
    ).catch(() => {})

    return () => {
      isSubscribed = false
      abortController.abort()
      unsubscribe()
    }
  }, [initialJob.job_id])

  const cancelJobMutation = useCancelJobMutation()

  const handleCancel = async () => {
    const cancelledJob = {
      ...job,
      status: 'CANCELLED' as const,
      current_stage: 'Job execution cancelled by user',
    }
    setJob(cancelledJob)
    if (onJobUpdated) onJobUpdated(cancelledJob)

    cancelJobMutation.mutate(job.job_id)
  }

  const handleRetry = async () => {
    setIsActionLoading(true)
    const result = await retryJob(job.job_id)
    setIsActionLoading(false)
    if (result && onJobRetried) {
      const newJobEntity: JobEntity = {
        ...job,
        job_id: result.new_job_id || result.job_id || job.job_id,
        status: 'QUEUED',
        progress: 0,
        current_stage: 'Retrying training execution',
        retry_count: result.retry_count,
        created_at: new Date().toISOString(),
      }
      onJobRetried(newJobEntity)
    }
  }

  const isTerminal = ['COMPLETED', 'FAILED', 'CANCELLED'].includes(job.status)
  const metrics = (job.metadata?.metrics || (job as any).metrics) as Record<string, number | string> | undefined

  return (
    <Card variant="glass" className="border-primary/40 shadow-md">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Icon name="cpu" size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle>Active Training Job</CardTitle>
                <Badge variant="outline" className="font-mono text-[10px]">
                  {job.job_id.slice(0, 8)}
                </Badge>
              </div>
              <CardDescription>
                Algorithm: <strong>{job.algorithm}</strong> | Target: <strong>{job.target_column}</strong>
              </CardDescription>
            </div>
          </div>

          <TrainingStatusBadge status={job.status} size="md" />
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Progress Bar & Telemetry */}
        <TrainingProgressBar
          progress={job.progress}
          stage={job.current_stage}
          status={job.status}
        />

        {/* Details Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl border border-border/60 bg-muted/20 text-xs">
          <div>
            <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
              Estimated Time
            </span>
            <span className="font-mono font-bold text-foreground">
              {job.estimated_seconds ? `${job.estimated_seconds.toFixed(1)}s` : '0.0s'}
            </span>
          </div>

          <div>
            <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
              Features Count
            </span>
            <span className="font-mono font-bold text-foreground">
              {job.feature_columns.length} columns
            </span>
          </div>

          <div>
            <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
              Retry Count
            </span>
            <span className="font-mono font-bold text-foreground">
              {job.retry_count}
            </span>
          </div>

          <div>
            <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
              Worker ID
            </span>
            <span className="font-mono font-bold text-foreground truncate block">
              {job.worker_id || 'unassigned'}
            </span>
          </div>
        </div>

        {/* Evaluation Metrics on Completion */}
        {metrics && Object.keys(metrics).length > 0 && (
          <div className="p-3 rounded-xl border border-primary/30 bg-primary/5 space-y-2">
            <span className="text-[10px] text-primary font-bold uppercase tracking-wider block">
              Trained Model Evaluation Metrics
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {Object.entries(metrics).map(([key, val]) => (
                <div key={key} className="p-2 rounded-lg bg-card/60 border border-border/50 text-center">
                  <span className="text-[9px] text-muted-foreground uppercase font-semibold block truncate">
                    {key.replace('_', ' ')}
                  </span>
                  <span className="font-mono text-sm font-bold text-foreground">
                    {typeof val === 'number'
                      ? (val <= 1 && val >= 0 && key !== 'mae' && key !== 'mse' && key !== 'rmse'
                          ? (val * 100).toFixed(1) + '%'
                          : val.toFixed(4))
                      : String(val ?? '—')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions Footer */}
        <div className="flex items-center justify-between gap-3 pt-2">
          <span className="text-[11px] text-muted-foreground">
            Created: {new Date(job.created_at).toLocaleTimeString()}
          </span>

          <div className="flex items-center gap-2">
            {!isTerminal && (
              <Button
                variant="outline"
                size="sm"
                leftIcon="x"
                isLoading={isActionLoading}
                onClick={handleCancel}
              >
                Cancel Job
              </Button>
            )}

            {isTerminal && (
              <Button
                variant="primary"
                size="sm"
                leftIcon="refresh-cw"
                isLoading={isActionLoading}
                onClick={handleRetry}
              >
                Retry Job
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
})
