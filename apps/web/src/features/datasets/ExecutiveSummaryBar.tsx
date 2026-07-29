import { memo, useMemo } from 'react'
import type { Dataset, DatasetHealthReport, DatasetProfile, DatasetRecommendations } from '../../types/dataset'
import { Badge } from '../../components/ui/Badge'
import { Icon, type IconName } from '../../components/ui/Icon'
import { formatBytes } from '../../utils/validation'

export interface ExecutiveSummaryBarProps {
  dataset: Dataset
  profile: DatasetProfile | null
  health: DatasetHealthReport | null
  recommendations: DatasetRecommendations | null
}

export const ExecutiveSummaryBar = memo(function ExecutiveSummaryBar({
  dataset,
  profile,
  health,
  recommendations,
}: ExecutiveSummaryBarProps) {
  const readiness = recommendations?.overall_readiness || 'Needs Cleaning'
  const problemType = recommendations?.recommended_problem_type || 'Classification'
  const score = health?.health_score ?? 100
  const grade = health?.grade ?? 'Good'

  const readinessVariants: Record<string, { variant: 'success' | 'warning' | 'destructive'; icon: IconName }> = useMemo(
    () => ({
      'Ready for Training': { variant: 'success', icon: 'check' },
      'Needs Cleaning': { variant: 'warning', icon: 'alert-circle' },
      'Critical Remediation Required': { variant: 'destructive', icon: 'x' },
    }),
    [],
  )

  const rStyle = readinessVariants[readiness] || readinessVariants['Needs Cleaning']

  return (
    <div className="p-4 rounded-xl border border-primary/20 bg-card/80 backdrop-blur-md shadow-sm space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Dataset Branding */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
            <Icon name="database" size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-foreground tracking-tight">{dataset.fileName}</h3>
              <Badge variant="outline" size="sm" className="font-mono">
                {profile ? formatBytes(profile.memory_usage_bytes) : 'CSV'}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Enterprise ML Workspace Active Session
            </p>
          </div>
        </div>

        {/* Status Badges */}
        <div className="flex flex-wrap items-center gap-2.5">
          <Badge variant="primary" icon="cpu">
            {problemType}
          </Badge>

          <Badge variant={health && health.health_score >= 85 ? 'success' : 'warning'} icon="shield">
            Health: {score}/100 ({grade})
          </Badge>

          <Badge variant={rStyle.variant} icon={rStyle.icon}>
            {readiness}
          </Badge>
        </div>
      </div>

      {/* KPI Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3 pt-3 border-t border-border/40 text-xs">
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block">Rows</span>
          <span className="font-mono font-bold text-foreground text-sm">{profile?.row_count ?? dataset.rows.length}</span>
        </div>

        <div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block">Columns</span>
          <span className="font-mono font-bold text-foreground text-sm">{profile?.column_count ?? dataset.columns.length}</span>
        </div>

        <div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block">Missing Cells</span>
          <span className={`font-mono font-bold text-sm ${profile && profile.total_missing_values > 0 ? 'text-amber-500' : 'text-foreground'}`}>
            {profile?.total_missing_values ?? 0}
          </span>
        </div>

        <div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block">Duplicate Rows</span>
          <span className="font-mono font-bold text-foreground text-sm">{profile?.duplicate_rows ?? 0}</span>
        </div>

        <div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block">Empty Columns</span>
          <span className="font-mono font-bold text-foreground text-sm">{profile?.empty_columns ?? 0}</span>
        </div>

        <div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block">Target Candidate</span>
          <span className="font-mono font-bold text-purple-400 text-sm truncate block">
            {recommendations?.target_suggestions[0]?.column_name || 'None'}
          </span>
        </div>
      </div>
    </div>
  )
})
