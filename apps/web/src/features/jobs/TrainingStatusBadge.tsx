import { memo, useMemo } from 'react'
import type { JobStatus } from '../../types/job'
import { Badge } from '../../components/ui/Badge'
import { type IconName } from '../../components/ui/Icon'

export interface TrainingStatusBadgeProps {
  status: JobStatus | string
  size?: 'sm' | 'md'
}

export const TrainingStatusBadge = memo(function TrainingStatusBadge({
  status,
  size = 'md',
}: TrainingStatusBadgeProps) {
  const statusConfig: Record<
    string,
    { variant: 'success' | 'primary' | 'warning' | 'destructive' | 'outline'; icon: IconName; label: string }
  > = useMemo(
    () => ({
      PENDING: { variant: 'outline', icon: 'clock', label: 'Pending' },
      QUEUED: { variant: 'outline', icon: 'clock', label: 'Queued' },
      STARTING: { variant: 'primary', icon: 'cpu', label: 'Starting' },
      RUNNING: { variant: 'primary', icon: 'cpu', label: 'Running' },
      VALIDATING: { variant: 'warning', icon: 'shield', label: 'Validating' },
      TRAINING: { variant: 'primary', icon: 'cpu', label: 'Training' },
      EVALUATING: { variant: 'primary', icon: 'activity', label: 'Evaluating' },
      SAVING_MODEL: { variant: 'success', icon: 'sparkles', label: 'Saving Model' },
      COMPLETED: { variant: 'success', icon: 'check', label: 'Completed' },
      FAILED: { variant: 'destructive', icon: 'x', label: 'Failed' },
      CANCELLED: { variant: 'warning', icon: 'alert-circle', label: 'Cancelled' },
      RETRYING: { variant: 'primary', icon: 'refresh-cw', label: 'Retrying' },
    }),
    [],
  )

  const cfg = statusConfig[status] || { variant: 'outline', icon: 'info', label: status }

  return (
    <Badge variant={cfg.variant} icon={cfg.icon} size={size}>
      {cfg.label}
    </Badge>
  )
})
