import { memo } from 'react'
import type { JobEntity } from '../../types/job'
import { TrainingStatusBadge } from './TrainingStatusBadge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/Table'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Icon } from '../../components/ui/Icon'

export interface TrainingJobListProps {
  jobs: JobEntity[]
  onSelectJob?: (job: JobEntity) => void
  onCancelJob?: (jobId: string) => void
  onRetryJob?: (jobId: string) => void
  onDeleteJob?: (jobId: string) => void
}

export const TrainingJobList = memo(function TrainingJobList({
  jobs,
  onSelectJob,
  onCancelJob,
  onRetryJob,
  onDeleteJob,
}: TrainingJobListProps) {
  if (jobs.length === 0) {
    return (
      <div className="p-8 text-center border border-dashed border-border rounded-xl space-y-2">
        <div className="p-3 rounded-full bg-muted/50 text-muted-foreground w-fit mx-auto">
          <Icon name="cpu" size={24} />
        </div>
        <p className="text-sm font-medium text-muted-foreground">
          No training jobs created yet. Launch a model training job above to populate job history.
        </p>
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Job ID</TableHead>
          <TableHead>Algorithm</TableHead>
          <TableHead>Target</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Progress</TableHead>
          <TableHead>Created</TableHead>
          <TableHead>Retry</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>

      <TableBody>
        {jobs.map((job) => {
          const isTerminal = ['COMPLETED', 'FAILED', 'CANCELLED'].includes(job.status)

          return (
            <TableRow key={job.job_id} className="cursor-pointer hover:bg-muted/40">
              <TableCell
                className="font-mono text-xs font-semibold text-primary"
                onClick={() => onSelectJob && onSelectJob(job)}
              >
                {job.job_id.slice(0, 8)}
              </TableCell>

              <TableCell className="text-xs font-semibold text-foreground">
                {job.algorithm}
              </TableCell>

              <TableCell className="text-xs font-mono">
                {job.target_column}
              </TableCell>

              <TableCell>
                <TrainingStatusBadge status={job.status} size="sm" />
              </TableCell>

              <TableCell className="font-mono text-xs font-bold">
                {Math.round(job.progress)}%
              </TableCell>

              <TableCell className="text-xs text-muted-foreground">
                {new Date(job.created_at).toLocaleTimeString()}
              </TableCell>

              <TableCell className="font-mono text-xs text-center">
                <Badge variant="outline" size="sm">
                  {job.retry_count}
                </Badge>
              </TableCell>

              <TableCell>
                <div className="flex items-center gap-1.5">
                  {!isTerminal && onCancelJob && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        onCancelJob(job.job_id)
                      }}
                    >
                      Cancel
                    </Button>
                  )}

                  {isTerminal && onRetryJob && (
                    <Button
                      variant="outline"
                      size="sm"
                      leftIcon="refresh-cw"
                      onClick={(e) => {
                        e.stopPropagation()
                        onRetryJob(job.job_id)
                      }}
                    >
                      Retry
                    </Button>
                  )}

                  {onDeleteJob && (
                    <Button
                      variant="outline"
                      size="sm"
                      leftIcon="trash-2"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDeleteJob(job.job_id)
                      }}
                    />
                  )}
                </div>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
})
