import { memo, useEffect, useMemo, useState } from 'react'
import type {
  Dataset,
  DatasetRecommendations,
  TargetSuggestion,
  FeatureRecommendation,
} from '../../types/dataset'
import { computeClientProfile } from '../../services/profilerService'
import { computeClientHealth } from '../../services/healthService'
import {
  fetchDatasetRecommendations,
  computeClientRecommendations,
} from '../../services/recommendationService'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/Table'
import { Badge } from '../../components/ui/Badge'
import { Icon, type IconName } from '../../components/ui/Icon'

export interface RecommendationDashboardProps {
  dataset: Dataset | null
  recommendations?: DatasetRecommendations | null
}

export const RecommendationDashboard = memo(function RecommendationDashboard({
  dataset,
  recommendations: initialRecommendations,
}: RecommendationDashboardProps) {
  const [recommendations, setRecommendations] = useState<DatasetRecommendations | null>(
    initialRecommendations || null,
  )

  useEffect(() => {
    let isMounted = true

    async function loadRecommendations() {
      if (initialRecommendations) {
        if (isMounted) setRecommendations(initialRecommendations)
        return
      }

      if (!dataset) {
        if (isMounted) setRecommendations(null)
        return
      }

      const currentDataset = dataset

      if (currentDataset.datasetId) {
        const remoteRecs = await fetchDatasetRecommendations(currentDataset.datasetId)
        if (remoteRecs && isMounted) {
          setRecommendations(remoteRecs)
          return
        }
      }

      // Compute client-side recommendations from profiler + health outputs
      const profile = computeClientProfile(currentDataset)
      const health = computeClientHealth(profile)
      const clientRecs = computeClientRecommendations(profile, health)
      if (isMounted) {
        setRecommendations(clientRecs)
      }
    }

    loadRecommendations()

    return () => {
      isMounted = false
    }
  }, [dataset, initialRecommendations])

  const readinessStyles: Record<
    string,
    { variant: 'success' | 'warning' | 'destructive' | 'primary'; icon: IconName }
  > = useMemo(
    () => ({
      'Ready for Training': { variant: 'success', icon: 'check' },
      'Needs Cleaning': { variant: 'warning', icon: 'alert-circle' },
      'Critical Remediation Required': { variant: 'destructive', icon: 'x' },
    }),
    [],
  )

  const actionBadges: Record<
    string,
    { variant: 'primary' | 'success' | 'warning' | 'destructive' | 'outline'; icon: IconName }
  > = useMemo(
    () => ({
      keep: { variant: 'success', icon: 'check' },
      scale: { variant: 'primary', icon: 'cpu' },
      encode: { variant: 'outline', icon: 'layers' },
      impute: { variant: 'warning', icon: 'alert-circle' },
      drop: { variant: 'destructive', icon: 'x' },
    }),
    [],
  )

  if (!dataset || !recommendations) {
    return null
  }

  const {
    overall_readiness,
    readiness_reasoning,
    recommended_problem_type,
    problem_type_confidence,
    problem_type_reasoning,
    recommended_models,
    recommended_preprocessing,
    target_suggestions,
    feature_recommendations,
  } = recommendations

  const currentReadinessStyle =
    readinessStyles[overall_readiness] || readinessStyles['Needs Cleaning']

  return (
    <Card variant="default" className="border-purple-500/20 shadow-md">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-500">
              <Icon name="sparkles" size={20} />
            </div>
            <div>
              <CardTitle>ML Recommendation Engine</CardTitle>
              <CardDescription>
                Deterministic model architecture, preprocessing pipeline, and target candidate recommendations.
              </CardDescription>
            </div>
          </div>

          <Badge
            variant={currentReadinessStyle.variant}
            icon={currentReadinessStyle.icon}
          >
            {overall_readiness}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* 1. Readiness Banner */}
        <div className="p-4 rounded-xl border border-border/80 bg-card/60 space-y-1 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground">Readiness Assessment:</span>
            <Badge variant={currentReadinessStyle.variant} size="sm">
              {overall_readiness}
            </Badge>
          </div>
          <p className="text-muted-foreground leading-relaxed">{readiness_reasoning}</p>
        </div>

        {/* 2. Problem Type & Recommended Models Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Problem Type Card */}
          <div className="p-4 rounded-xl border border-border/80 bg-muted/20 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Icon name="cpu" size={14} className="text-primary" />
                Problem Task Type
              </span>
              <Badge variant="primary" size="sm">
                {(problem_type_confidence * 100).toFixed(0)}% Confidence
              </Badge>
            </div>

            <div>
              <h4 className="text-lg font-bold text-foreground">{recommended_problem_type}</h4>
              <p className="text-xs text-muted-foreground mt-0.5">{problem_type_reasoning}</p>
            </div>
          </div>

          {/* Recommended Models Card */}
          <div className="p-4 rounded-xl border border-border/80 bg-muted/20 space-y-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Icon name="layers" size={14} className="text-purple-400" />
              Recommended Algorithms
            </span>

            <div className="flex flex-wrap gap-2 pt-1">
              {recommended_models.map((model: string) => (
                <Badge key={model} variant="outline" size="md">
                  {model}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        {/* 3. Target Variable Candidates */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Icon name="circle-dot" size={14} className="text-purple-400" />
            Target Variable Candidates
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {target_suggestions.map((ts: TargetSuggestion) => (
              <div
                key={ts.column_name}
                className="p-3.5 rounded-xl border border-border/80 bg-card space-y-2 text-xs flex flex-col justify-between"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-foreground truncate">{ts.column_name}</span>
                  <Badge
                    variant={ts.confidence === 'High' ? 'success' : 'outline'}
                    size="sm"
                  >
                    {ts.confidence}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">{ts.reasoning}</p>
                <div className="pt-1 flex items-center gap-1 text-[10px] text-purple-400 font-medium">
                  <Icon name="cpu" size={12} />
                  <span>Suggested Task: {ts.suggested_task}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 4. Preprocessing Pipeline Steps */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Icon name="refresh-cw" size={14} className="text-primary" />
            Automated Preprocessing Pipeline
          </h4>

          <div className="flex flex-wrap gap-2">
            {recommended_preprocessing.map((step: string, idx: number) => (
              <div
                key={step}
                className="flex items-center gap-2 p-2.5 px-3.5 rounded-lg border border-border/60 bg-muted/30 text-xs font-medium text-foreground"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-mono text-primary font-bold">
                  {idx + 1}
                </span>
                <span>{step}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 5. Feature Action Recommendations Table */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Icon name="grid" size={14} className="text-primary" />
            Feature Engineering Actions
          </h4>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Column Name</TableHead>
                <TableHead>Recommended Action</TableHead>
                <TableHead>Reasoning & Engineering Rationale</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {feature_recommendations.map((fr: FeatureRecommendation) => {
                const badgeInfo = actionBadges[fr.recommended_action] || actionBadges['keep']

                return (
                  <TableRow key={fr.column_name}>
                    <TableCell className="font-mono text-xs font-semibold text-foreground">
                      {fr.column_name}
                    </TableCell>

                    <TableCell>
                      <Badge variant={badgeInfo.variant} icon={badgeInfo.icon} size="sm">
                        {fr.recommended_action}
                      </Badge>
                    </TableCell>

                    <TableCell className="text-xs text-muted-foreground">
                      {fr.reasoning}
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
