import { memo, useMemo } from 'react'
import type { Dataset, DatasetHealthReport, HealthIssue } from '../../types/dataset'
import { useDatasetHealthQuery } from '../../hooks/useMLQueries'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Icon, type IconName } from '../../components/ui/Icon'

export interface DatasetHealthCardProps {
  dataset: Dataset | null
  healthReport?: DatasetHealthReport | null
}

export const DatasetHealthCard = memo(function DatasetHealthCard({
  dataset,
  healthReport: initialHealthReport,
}: DatasetHealthCardProps) {
  const { data: queriedHealthReport } = useDatasetHealthQuery(dataset)
  const healthReport = initialHealthReport || queriedHealthReport

  // Visual Theme Mapping by Grade (memoized)
  const gradeStyles: Record<
    string,
    {
      strokeColor: string
      textColor: string
      bgColor: string
      borderColor: string
      badgeVariant: 'success' | 'primary' | 'warning' | 'destructive' | 'outline'
      icon: IconName
    }
  > = useMemo(
    () => ({
      Excellent: {
        strokeColor: '#10b981',
        textColor: 'text-emerald-500',
        bgColor: 'bg-emerald-500/10',
        borderColor: 'border-emerald-500/30',
        badgeVariant: 'success',
        icon: 'check',
      },
      Good: {
        strokeColor: '#3b82f6',
        textColor: 'text-blue-500',
        bgColor: 'bg-blue-500/10',
        borderColor: 'border-blue-500/30',
        badgeVariant: 'primary',
        icon: 'shield',
      },
      Fair: {
        strokeColor: '#f59e0b',
        textColor: 'text-amber-500',
        bgColor: 'bg-amber-500/10',
        borderColor: 'border-amber-500/30',
        badgeVariant: 'warning',
        icon: 'alert-circle',
      },
      Poor: {
        strokeColor: '#f97316',
        textColor: 'text-orange-500',
        bgColor: 'bg-orange-500/10',
        borderColor: 'border-orange-500/30',
        badgeVariant: 'warning',
        icon: 'alert-circle',
      },
      Critical: {
        strokeColor: '#ef4444',
        textColor: 'text-destructive',
        bgColor: 'bg-destructive/10',
        borderColor: 'border-destructive/30',
        badgeVariant: 'destructive',
        icon: 'x',
      },
    }),
    [],
  )

  const severityBadges: Record<string, { variant: 'outline' | 'warning' | 'destructive' | 'primary'; icon: IconName }> = useMemo(
    () => ({
      info: { variant: 'outline', icon: 'info' },
      warning: { variant: 'warning', icon: 'alert-circle' },
      high: { variant: 'warning', icon: 'alert-circle' },
      critical: { variant: 'destructive', icon: 'x' },
    }),
    [],
  )

  if (!dataset || !healthReport) {
    return null
  }

  const { health_score, grade, summary, warnings, recommendations, issues } = healthReport
  const currentGradeStyle = gradeStyles[grade] || gradeStyles['Good']

  // SVG Circular Gauge Math
  const radius = 36
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (health_score / 100) * circumference

  return (
    <Card variant="default" className={`${currentGradeStyle.borderColor} shadow-md`}>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-lg ${currentGradeStyle.bgColor} ${currentGradeStyle.textColor}`}>
              <Icon name="shield" size={20} />
            </div>
            <div>
              <CardTitle>Enterprise Dataset Health Engine</CardTitle>
              <CardDescription>
                Quality evaluation, severity warnings, and actionable optimization steps.
              </CardDescription>
            </div>
          </div>

          <Badge variant={currentGradeStyle.badgeVariant} icon={currentGradeStyle.icon}>
            Grade: {grade} ({health_score}/100)
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Top: Score Gauge & Executive Summary */}
        <div className="flex flex-col sm:flex-row items-center gap-6 p-5 rounded-xl border border-border/80 bg-card/60">
          {/* Circular Score Gauge */}
          <div className="relative flex items-center justify-center shrink-0">
            <svg className="w-24 h-24 transform -rotate-90">
              <circle
                cx="48"
                cy="48"
                r={radius}
                className="text-muted/40"
                strokeWidth="8"
                stroke="currentColor"
                fill="transparent"
              />
              <circle
                cx="48"
                cy="48"
                r={radius}
                stroke={currentGradeStyle.strokeColor}
                strokeWidth="8"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                fill="transparent"
                className="transition-all duration-1000 ease-out"
              />
            </svg>
            <div className="absolute flex flex-col items-center justify-center text-center">
              <span className={`text-2xl font-bold font-mono tracking-tight ${currentGradeStyle.textColor}`}>
                {health_score}
              </span>
              <span className="text-[10px] text-muted-foreground uppercase font-semibold">Score</span>
            </div>
          </div>

          {/* Executive Summary */}
          <div className="space-y-1.5 text-center sm:text-left flex-1">
            <div className="flex items-center justify-center sm:justify-start gap-2">
              <h4 className="text-base font-semibold text-foreground">Health Assessment: {grade}</h4>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {summary}
            </p>
          </div>
        </div>

        {/* Grid: Issues & Recommendations */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Detected Issues */}
          <div className="p-4 rounded-xl border border-border/80 bg-muted/20 space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Icon name="alert-circle" size={14} className="text-amber-500" />
              Detected Quality Issues ({issues.length})
            </h4>

            {issues.length > 0 ? (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {issues.map((issue: HealthIssue, idx: number) => {
                  const sBadge = severityBadges[issue.severity] || severityBadges['info']

                  return (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg border border-border/60 bg-card text-xs flex items-start gap-2"
                    >
                      <Badge variant={sBadge.variant} size="sm" icon={sBadge.icon} className="mt-0.5 shrink-0">
                        {issue.severity}
                      </Badge>
                      <span className="text-foreground/90 leading-tight">{issue.message}</span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">No dataset issues detected.</p>
            )}
          </div>

          {/* Actionable Recommendations */}
          <div className="p-4 rounded-xl border border-border/80 bg-muted/20 space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Icon name="sparkles" size={14} className="text-primary" />
              Optimization Recommendations ({recommendations.length})
            </h4>

            {recommendations.length > 0 ? (
              <ul className="space-y-2 text-xs max-h-48 overflow-y-auto pr-1">
                {recommendations.map((rec: string, idx: number) => (
                  <li key={idx} className="flex items-start gap-2 p-2 rounded-lg bg-card border border-border/60">
                    <Icon name="check" size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                    <span className="text-foreground/90 leading-tight">{rec}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground italic">No additional recommendations required.</p>
            )}
          </div>
        </div>

        {/* Warnings Banner */}
        {warnings.length > 0 && warnings[0] !== 'No major quality warnings detected.' && (
          <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/5 text-xs text-amber-600 dark:text-amber-400 flex items-start gap-2">
            <Icon name="info" size={16} className="mt-0.5 shrink-0" />
            <div>
              <span className="font-semibold block mb-0.5">Quality Audit Warnings:</span>
              <ul className="list-disc list-inside space-y-0.5">
                {warnings.map((w: string, idx: number) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
})
