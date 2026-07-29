import { memo, useMemo } from 'react'
import type { DatasetHealthReport, DatasetProfile, DatasetRecommendations } from '../../types/dataset'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Icon, type IconName } from '../../components/ui/Icon'

export interface ActionCenterPanelProps {
  profile: DatasetProfile | null
  health: DatasetHealthReport | null
  recommendations: DatasetRecommendations | null
  onNavigateSection: (sectionId: string) => void
}

export interface ActionItem {
  id: string
  title: string
  description: string
  status: 'Required' | 'Recommended' | 'Ready'
  icon: IconName
  sectionId: string
  buttonText: string
}

export const ActionCenterPanel = memo(function ActionCenterPanel({
  profile,
  health,
  recommendations,
  onNavigateSection,
}: ActionCenterPanelProps) {
  // Generate prioritized Next Best Actions (memoized)
  const actions: ActionItem[] = useMemo(() => {
    const list: ActionItem[] = []

    // Action 1: Quality Defects & Remediations
    if (profile && (profile.empty_columns > 0 || profile.duplicate_rows > 0 || profile.total_missing_values > 0)) {
      list.push({
        id: 'remediation',
        title: 'Remediate Dataset Quality Defects',
        description: `Fix ${profile.duplicate_rows} duplicate rows, ${profile.empty_columns} empty columns, or ${profile.total_missing_values} missing cells.`,
        status: health && health.health_score < 70 ? 'Required' : 'Recommended',
        icon: 'alert-circle',
        sectionId: 'section-health',
        buttonText: 'View Quality Audit',
      })
    }

    // Action 2: Preprocessing Pipeline
    if (recommendations && recommendations.recommended_preprocessing.length > 0) {
      list.push({
        id: 'preprocessing',
        title: 'Configure Preprocessing Pipeline',
        description: `Apply ${recommendations.recommended_preprocessing.join(', ')} to features.`,
        status: 'Recommended',
        icon: 'refresh-cw',
        sectionId: 'section-recommendations',
        buttonText: 'View Pipeline Steps',
      })
    }

    // Action 3: Target & Feature Selection
    list.push({
      id: 'column-selection',
      title: 'Confirm Feature & Target Selection',
      description: `Target candidate: '${recommendations?.target_suggestions[0]?.column_name || 'None'}'. Select feature matrix columns for training.`,
      status: 'Ready',
      icon: 'check-square',
      sectionId: 'section-selector',
      buttonText: 'Configure Columns',
    })

    // Action 4: Launch Training
    list.push({
      id: 'model-training',
      title: 'Launch ML Model Training',
      description: `Train ${recommendations?.recommended_problem_type || 'Classification'} models (${recommendations?.recommended_models.slice(0, 2).join(', ') || 'Random Forest'}).`,
      status: 'Ready',
      icon: 'cpu',
      sectionId: 'section-selector',
      buttonText: 'Ready to Train',
    })

    return list
  }, [profile, health, recommendations])

  const statusBadges: Record<string, { variant: 'destructive' | 'warning' | 'success'; icon: IconName }> = useMemo(
    () => ({
      Required: { variant: 'destructive', icon: 'x' },
      Recommended: { variant: 'warning', icon: 'alert-circle' },
      Ready: { variant: 'success', icon: 'check' },
    }),
    [],
  )

  return (
    <Card variant="glass" className="border-primary/30 shadow-md">
      <CardHeader>
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-500 text-white shadow-xs">
            <Icon name="sparkles" size={20} />
          </div>
          <div>
            <CardTitle>Next Best Action Center</CardTitle>
            <CardDescription>
              Prioritized step-by-step workflow guide tailored to your dataset analysis.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {actions.map((action: ActionItem) => {
            const badgeStyle = statusBadges[action.status] || statusBadges['Ready']

            return (
              <div
                key={action.id}
                className="p-4 rounded-xl border border-border/80 bg-card hover:border-primary/50 transition-all duration-200 flex flex-col justify-between space-y-3"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-foreground flex items-center gap-2">
                      <Icon name={action.icon} size={16} className="text-primary" />
                      {action.title}
                    </span>
                    <Badge variant={badgeStyle.variant} size="sm" icon={badgeStyle.icon}>
                      {action.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {action.description}
                  </p>
                </div>

                <div className="pt-2 border-t border-border/40 flex justify-end">
                  <Button
                    variant={action.status === 'Required' ? 'primary' : 'outline'}
                    size="sm"
                    rightIcon="chevron-right"
                    onClick={() => onNavigateSection(action.sectionId)}
                  >
                    {action.buttonText}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
})
