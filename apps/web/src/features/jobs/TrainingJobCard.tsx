import { memo, useEffect, useState } from 'react'
import type { JobEntity } from '../../types/job'
import { cancelJob, fetchJobProgress, retryJob } from '../../services/jobService'
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

  // Polling Effect for Live Progress Telemetry
  useEffect(() => {
    setJob(initialJob)

    const terminalStatuses = ['COMPLETED', 'FAILED', 'CANCELLED']
    if (terminalStatuses.includes(initialJob.status)) {
      return
    }

    let isMounted = true
    const interval = setInterval(async () => {
      const liveProg = await fetchJobProgress(initialJob.job_id)
      if (liveProg && isMounted) {
        setJob((prev) => {
          const next = {
            ...prev,
            status: liveProg.status,
            progress: liveProg.progress,
            current_stage: liveProg.current_stage,
            estimated_seconds: liveProg.estimated_seconds_remaining,
          }
          if (onJobUpdated) onJobUpdated(next)
          return next
        })

        if (terminalStatuses.includes(liveProg.status)) {
          clearInterval(interval)
        }
      }
    }, 1000)

    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [initialJob, onJobUpdated])

  const handleCancel = async () => {
    setIsActionLoading(true)
    const result = await cancelJob(job.job_id)
    setIsActionLoading(false)
    if (result) {
      const cancelledJob = {
        ...job,
        status: 'CANCELLED' as const,
        current_stage: 'Job execution cancelled by user',
      }
      setJob(cancelledJob)
      if (onJobUpdated) onJobUpdated(cancelledJob)
    }
  }

  const handleRetry = async () => {
    setIsActionLoading(true)
    const result = await retryJob(job.job_id)
    setIsActionLoading(false)
    if (result && onJobRetried) {
      const newJobEntity: JobEntity = {
        ...job,
        job_id: result.new_job_id,
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
