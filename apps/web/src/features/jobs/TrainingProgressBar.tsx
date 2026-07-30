import { memo } from 'react'
import type { JobStatus } from '../../types/job'
import { Spinner } from '../../components/ui/Spinner'

export interface TrainingProgressBarProps {
  progress: number
  stage: string
  status: JobStatus | string
}

export const TrainingProgressBar = memo(function TrainingProgressBar({
  progress,
  stage,
  status,
}: TrainingProgressBarProps) {
  const isRunning = [
    'PENDING',
    'QUEUED',
    'STARTING',
    'RUNNING',
    'VALIDATING',
    'TRAINING',
    'EVALUATING',
    'SAVING_MODEL',
    'RETRYING',
  ].includes(status)

  const isCompleted = status === 'COMPLETED'
  const isFailed = status === 'FAILED'
  const isCancelled = status === 'CANCELLED'

  let barColorClass = 'bg-primary'
  if (isCompleted) barColorClass = 'bg-emerald-500'
  else if (isFailed) barColorClass = 'bg-destructive'
  else if (isCancelled) barColorClass = 'bg-amber-500'

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          {isRunning && <Spinner size="sm" className="text-primary" />}
          <span className="font-semibold text-foreground">{stage}</span>
        </div>
        <span className="font-mono font-bold text-foreground">{Math.round(progress)}%</span>
      </div>

      <div className="w-full h-2.5 rounded-full bg-muted/60 overflow-hidden relative">
        <div
          className={`h-full transition-all duration-500 ease-out rounded-full ${barColorClass} ${
            isRunning ? 'animate-pulse' : ''
          }`}
          style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
        />
      </div>
    </div>
  )
})
