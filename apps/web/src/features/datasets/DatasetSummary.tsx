import { memo, useMemo } from 'react'
import type { Dataset, DatasetProfile, ColumnProfile } from '../../types/dataset'
import { useDatasetProfileQuery } from '../../hooks/useMLQueries'
import { formatBytes } from '../../utils/validation'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/Table'
import { Badge } from '../../components/ui/Badge'
import { Icon, type IconName } from '../../components/ui/Icon'
import { TableSkeleton } from '../../components/ui/Skeleton'

export interface DatasetSummaryProps {
  dataset: Dataset | null
  profile?: DatasetProfile | null
}

export const DatasetSummary = memo(function DatasetSummary({ dataset, profile: initialProfile }: DatasetSummaryProps) {
  const { data: queriedProfile, isLoading } = useDatasetProfileQuery(dataset)
  const profile = initialProfile || queriedProfile

  // Count column types for overview distribution (memoized)
  const typeCounts = useMemo(() => {
    if (!profile) return {}
    const counts: Record<string, number> = {}
    profile.columns.forEach((col) => {
      counts[col.type] = (counts[col.type] || 0) + 1
    })
    return counts
  }, [profile])

  const typeBadges: Record<string, { variant: 'primary' | 'success' | 'warning' | 'outline' | 'destructive' | 'default'; icon: IconName }> = useMemo(
    () => ({
      numeric: { variant: 'primary', icon: 'cpu' },
      categorical: { variant: 'outline', icon: 'layers' },
      boolean: { variant: 'success', icon: 'check-square' },
      datetime: { variant: 'warning', icon: 'activity' },
      identifier: { variant: 'default', icon: 'shield' },
      text: { variant: 'outline', icon: 'file-text' },
    }),
    [],
  )

  if (!dataset) {
    return null
  }

  if (isLoading && !profile) {
    return <TableSkeleton rows={5} cols={4} />
  }

  if (!profile) {
    return null
  }

  return (
    <Card variant="default" className="border-cyan-500/20 shadow-md">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-500">
              <Icon name="activity" size={20} />
            </div>
            <div>
              <CardTitle>Dataset Profile & Summary</CardTitle>
              <CardDescription>
                Deterministic schema inference, statistical distributions, and quality metrics.
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {Object.entries(typeCounts).map(([type, count]) => {
              const badgeInfo = typeBadges[type] || { variant: 'outline', icon: 'info' }
              return (
                <Badge key={type} variant={badgeInfo.variant} icon={badgeInfo.icon} size="sm">
                  {count} {type}
                </Badge>
              )
            })}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* 1. Dataset Overview KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
          <div className="p-3.5 rounded-xl border border-border/80 bg-muted/20 flex flex-col">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Rows</span>
            <span className="text-base font-bold font-mono text-foreground mt-0.5">{profile.row_count}</span>
          </div>

          <div className="p-3.5 rounded-xl border border-border/80 bg-muted/20 flex flex-col">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Columns</span>
            <span className="text-base font-bold font-mono text-foreground mt-0.5">{profile.column_count}</span>
          </div>

          <div className="p-3.5 rounded-xl border border-border/80 bg-muted/20 flex flex-col">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Memory</span>
            <span className="text-base font-bold font-mono text-foreground mt-0.5">{formatBytes(profile.memory_usage_bytes)}</span>
          </div>

          <div className="p-3.5 rounded-xl border border-border/80 bg-muted/20 flex flex-col">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Missing Values</span>
            <span className={`text-base font-bold font-mono mt-0.5 ${profile.total_missing_values > 0 ? 'text-amber-500' : 'text-foreground'}`}>
              {profile.total_missing_values}
            </span>
          </div>

          <div className="p-3.5 rounded-xl border border-border/80 bg-muted/20 flex flex-col">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Duplicate Rows</span>
            <span className={`text-base font-bold font-mono mt-0.5 ${profile.duplicate_rows > 0 ? 'text-amber-500' : 'text-foreground'}`}>
              {profile.duplicate_rows}
            </span>
          </div>

          <div className="p-3.5 rounded-xl border border-border/80 bg-muted/20 flex flex-col">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Duplicate Cols</span>
            <span className="text-base font-bold font-mono text-foreground mt-0.5">{profile.duplicate_columns}</span>
          </div>

          <div className="p-3.5 rounded-xl border border-border/80 bg-muted/20 flex flex-col col-span-2 sm:col-span-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Empty Cols</span>
            <span className={`text-base font-bold font-mono mt-0.5 ${profile.empty_columns > 0 ? 'text-destructive' : 'text-foreground'}`}>
              {profile.empty_columns}
            </span>
          </div>
        </div>

        {/* 2. Column Summary Table */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Icon name="grid" size={14} className="text-primary" />
            Column Schema & Statistical Distributions
          </h4>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Column Name</TableHead>
                <TableHead>Detected Type</TableHead>
                <TableHead>Missing Cells</TableHead>
                <TableHead>Unique Values</TableHead>
                <TableHead>Statistical Summary</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {profile.columns.map((col: ColumnProfile) => {
                const badgeInfo = typeBadges[col.type] || { variant: 'outline', icon: 'info' }
                const isNumeric = col.type === 'numeric'
                const stats = col.statistics

                return (
                  <TableRow key={col.name}>
                    <TableCell className="font-mono text-xs font-semibold text-foreground">
                      {col.name}
                    </TableCell>

                    <TableCell>
                      <Badge variant={badgeInfo.variant} icon={badgeInfo.icon} size="sm">
                        {col.type}
                      </Badge>
                    </TableCell>

                    <TableCell>
                      {col.missing > 0 ? (
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs font-medium text-amber-500">{col.missing}</span>
                          <span className="text-[10px] text-muted-foreground">({col.missing_percentage}%)</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">0 (0%)</span>
                      )}
                    </TableCell>

                    <TableCell className="font-mono text-xs">
                      {col.unique} <span className="text-[10px] text-muted-foreground">unique</span>
                    </TableCell>

                    <TableCell className="text-xs text-muted-foreground">
                      {isNumeric ? (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px]">
                          <span><strong className="text-foreground">Min:</strong> {stats.min ?? '—'}</span>
                          <span><strong className="text-foreground">Max:</strong> {stats.max ?? '—'}</span>
                          <span><strong className="text-foreground">Mean:</strong> {stats.mean ?? '—'}</span>
                          <span><strong className="text-foreground">Std:</strong> {stats.std ?? '—'}</span>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                          <span>
                            <strong className="text-foreground font-mono">Card:</strong> {stats.cardinality ?? col.unique}
                          </span>
                          {stats.most_frequent_value ? (
                            <span>
                              <strong className="text-foreground">Top:</strong> "{stats.most_frequent_value}" ({stats.frequency_count})
                            </span>
                          ) : null}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
})
