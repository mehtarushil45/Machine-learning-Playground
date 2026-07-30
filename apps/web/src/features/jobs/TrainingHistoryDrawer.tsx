import { memo } from 'react'
import type { JobEntity } from '../../types/job'
import { TrainingJobList } from './TrainingJobList'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Icon } from '../../components/ui/Icon'

export interface TrainingHistoryDrawerProps {
  jobs: JobEntity[]
  isOpen: boolean
  onClose: () => void
  onSelectJob?: (job: JobEntity) => void
  onCancelJob?: (jobId: string) => void
  onRetryJob?: (jobId: string) => void
  onDeleteJob?: (jobId: string) => void
  onRefresh?: () => void
}

export const TrainingHistoryDrawer = memo(function TrainingHistoryDrawer({
  jobs,
  isOpen,
  onClose,
  onSelectJob,
  onCancelJob,
  onRetryJob,
  onDeleteJob,
  onRefresh,
}: TrainingHistoryDrawerProps) {
  if (!isOpen) return null

  return (
    <Card variant="glass" className="border-primary/40 shadow-xl animate-in fade-in-0 duration-200 mt-4">
      <CardHeader className="border-b border-border/40 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Icon name="clock" size={20} />
            </div>
            <div>
              <CardTitle>ML Job History & Audit Log</CardTitle>
              <CardDescription>
                Complete history of all model training sessions and execution stage telemetry.
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="outline" size="md">
              {jobs.length} Total Jobs
            </Badge>

            {onRefresh && (
              <Button variant="outline" size="sm" leftIcon="refresh-cw" onClick={onRefresh}>
                Refresh History
              </Button>
            )}

            <Button variant="outline" size="sm" leftIcon="x" onClick={onClose}>
              Close Drawer
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-4 max-h-96 overflow-y-auto pr-1">
        <TrainingJobList
          jobs={jobs}
          onSelectJob={onSelectJob}
          onCancelJob={onCancelJob}
          onRetryJob={onRetryJob}
          onDeleteJob={onDeleteJob}
        />
      </CardContent>
    </Card>
  )
})
