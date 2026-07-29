import { memo, useCallback, useEffect, useRef, useState } from 'react'
import type { Dataset, DatasetHealthReport, DatasetProfile, DatasetRecommendations } from '../../types/dataset'
import { computeClientProfile, fetchDatasetProfile } from '../../services/profilerService'
import { computeClientHealth, fetchDatasetHealth } from '../../services/healthService'
import { computeClientRecommendations, fetchDatasetRecommendations } from '../../services/recommendationService'

import { DataUpload } from './DataUpload'
import { ExecutiveSummaryBar } from './ExecutiveSummaryBar'
import { ActionCenterPanel } from './ActionCenterPanel'
import { CollapsibleSection } from './CollapsibleSection'
import { RecommendationDashboard } from './RecommendationDashboard'
import { DatasetHealthCard } from './DatasetHealthCard'
import { DatasetSummary } from './DatasetSummary'
import { DataPreview } from './DataPreview'
import { ColumnSelector } from './ColumnSelector'
import { SectionErrorCard } from './SectionErrorCard'
import { Badge } from '../../components/ui/Badge'
import { Skeleton } from '../../components/ui/Skeleton'
import { Card, CardContent } from '../../components/ui/Card'

export interface EnterpriseWorkspaceProps {
  dataset: Dataset | null
  selectedFeatures: string[]
  selectedTarget: string | null
  onDataLoaded: (dataset: Dataset) => void
  onSelectedFeaturesChange: (features: string[]) => void
  onSelectedTargetChange: (target: string) => void
}

export const EnterpriseWorkspace = memo(function EnterpriseWorkspace({
  dataset,
  selectedFeatures,
  selectedTarget,
  onDataLoaded,
  onSelectedFeaturesChange,
  onSelectedTargetChange,
}: EnterpriseWorkspaceProps) {
  const [profile, setProfile] = useState<DatasetProfile | null>(null)
  const [health, setHealth] = useState<DatasetHealthReport | null>(null)
  const [recommendations, setRecommendations] = useState<DatasetRecommendations | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  const abortControllerRef = useRef<AbortController | null>(null)

  // Centralized Orchestration & Race Condition Prevention Effect
  useEffect(() => {
    // 1. Cancel obsolete pending requests if any
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    // 2. Spawn new AbortController for current dataset upload
    const controller = new AbortController()
    abortControllerRef.current = controller
    const signal = controller.signal

    const currentDataset = dataset

    async function orchestrateWorkspace() {
      if (!currentDataset) {
        if (!signal.aborted) {
          setProfile(null)
          setHealth(null)
          setRecommendations(null)
          setIsLoading(false)
          setError(null)
        }
        return
      }

      setIsLoading(true)
      setError(null)

      try {
        // Step A: Profiler Execution
        let prof: DatasetProfile | null = null
        if (currentDataset.datasetId) {
          prof = await fetchDatasetProfile(currentDataset.datasetId, signal)
        }
        if (!prof && !signal.aborted) {
          prof = computeClientProfile(currentDataset)
        }

        if (signal.aborted) return
        setProfile(prof)

        // Step B: Health Engine Execution (Consumes Profiler)
        let hlth: DatasetHealthReport | null = null
        if (currentDataset.datasetId) {
          hlth = await fetchDatasetHealth(currentDataset.datasetId, signal)
        }
        if (!hlth && prof && !signal.aborted) {
          hlth = computeClientHealth(prof)
        }

        if (signal.aborted) return
        setHealth(hlth)

        // Step C: Recommendation Engine Execution (Consumes Profiler + Health)
        let recs: DatasetRecommendations | null = null
        if (currentDataset.datasetId) {
          recs = await fetchDatasetRecommendations(currentDataset.datasetId, signal)
        }
        if (!recs && prof && hlth && !signal.aborted) {
          recs = computeClientRecommendations(prof, hlth)
        }

        if (signal.aborted) return
        setRecommendations(recs)
        setIsLoading(false)

        // Auto-select recommended target if non-selected
        if (recs && recs.target_suggestions.length > 0 && !selectedTarget) {
          onSelectedTargetChange(recs.target_suggestions[0].column_name)
        }
      } catch (err) {
        if (!signal.aborted) {
          setError(err instanceof Error ? err.message : 'Failed to analyze dataset.')
          setIsLoading(false)
        }
      }
    }

    orchestrateWorkspace()

    return () => {
      controller.abort()
    }
  }, [dataset, onSelectedTargetChange, selectedTarget])

  const scrollToSection = useCallback((sectionId: string) => {
    const elem = document.getElementById(sectionId)
    if (elem) {
      elem.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  return (
    <div className="space-y-6 pb-12">
      {/* Step 1: Ingestion Upload Card */}
      <DataUpload onDataLoaded={onDataLoaded} />

      {dataset ? (
        <>
          {isLoading ? (
            /* Enterprise Skeleton Loading State */
            <div className="space-y-6 animate-in fade-in-0 duration-300">
              <Card variant="glass" className="p-6">
                <CardContent className="space-y-4 pt-4">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-6 w-48" />
                    <Skeleton className="h-6 w-32" />
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-6 gap-3 pt-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card variant="default" className="p-6">
                <CardContent className="space-y-4 pt-4">
                  <Skeleton className="h-5 w-64" />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Skeleton className="h-32 w-full" />
                    <Skeleton className="h-32 w-full" />
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : error ? (
            <SectionErrorCard
              title="Workspace Analysis Engine"
              errorMessage={error}
              onRetry={() => {
                if (dataset) {
                  const prof = computeClientProfile(dataset)
                  const hlth = computeClientHealth(prof)
                  const recs = computeClientRecommendations(prof, hlth)
                  setProfile(prof)
                  setHealth(hlth)
                  setRecommendations(recs)
                  setError(null)
                }
              }}
            />
          ) : (
            <>
              {/* Section 1: Executive Summary Bar */}
              <ExecutiveSummaryBar
                dataset={dataset}
                profile={profile}
                health={health}
                recommendations={recommendations}
              />

              {/* Section 2: Action Center Panel */}
              <ActionCenterPanel
                profile={profile}
                health={health}
                recommendations={recommendations}
                onNavigateSection={scrollToSection}
              />

              {/* Section 3: ML Recommendation Engine (Collapsible) */}
              <CollapsibleSection
                id="section-recommendations"
                title="ML Recommendation Engine"
                description="Deterministic task identification, model architectures, and preprocessing pipeline"
                icon="sparkles"
                defaultExpanded={true}
                badge={
                  recommendations ? (
                    <Badge variant="primary" icon="cpu" size="sm">
                      {recommendations.recommended_problem_type} ({Math.round(recommendations.problem_type_confidence * 100)}%)
                    </Badge>
                  ) : null
                }
              >
                <RecommendationDashboard dataset={dataset} recommendations={recommendations} />
              </CollapsibleSection>

              {/* Section 4: Dataset Quality Health Audit (Collapsible) */}
              <CollapsibleSection
                id="section-health"
                title="Dataset Health Audit"
                description="Enterprise quality score, warning audit, and quality defect warnings"
                icon="shield"
                defaultExpanded={false}
                badge={
                  health ? (
                    <Badge
                      variant={health.health_score >= 85 ? 'success' : 'warning'}
                      icon="shield"
                      size="sm"
                    >
                      Score: {health.health_score}/100 ({health.grade})
                    </Badge>
                  ) : null
                }
              >
                <DatasetHealthCard dataset={dataset} healthReport={health} />
              </CollapsibleSection>

              {/* Section 5: Dataset Summary & Schema Profile (Collapsible) */}
              <CollapsibleSection
                id="section-summary"
                title="Dataset Schema Profile"
                description="Statistical distributions, column types, and missingness metrics"
                icon="activity"
                defaultExpanded={false}
                badge={
                  profile ? (
                    <Badge variant="outline" size="sm">
                      {profile.column_count} Columns | {profile.row_count} Rows
                    </Badge>
                  ) : null
                }
              >
                <DatasetSummary dataset={dataset} profile={profile} />
              </CollapsibleSection>

              {/* Section 6: Data Preview Table (Collapsible) */}
              <CollapsibleSection
                id="section-preview"
                title="Data Rows Preview"
                description="Tabular row preview of top rows"
                icon="table"
                defaultExpanded={false}
              >
                <DataPreview dataset={dataset} />
              </CollapsibleSection>

              {/* Section 7: Feature & Target Column Selection (Collapsible & Primary Action) */}
              <CollapsibleSection
                id="section-selector"
                title="Feature & Target Column Selection"
                description="Configure target variable and input feature matrix for training"
                icon="check-square"
                defaultExpanded={true}
                badge={
                  selectedTarget ? (
                    <Badge variant="success" icon="check" size="sm">
                      Target: {selectedTarget}
                    </Badge>
                  ) : (
                    <Badge variant="warning" size="sm">
                      Select Target Variable
                    </Badge>
                  )
                }
              >
                <ColumnSelector
                  dataset={dataset}
                  selectedFeatures={selectedFeatures}
                  selectedTarget={selectedTarget}
                  onSelectedFeaturesChange={onSelectedFeaturesChange}
                  onSelectedTargetChange={onSelectedTargetChange}
                />
              </CollapsibleSection>
            </>
          )}
        </>
      ) : null}
    </div>
  )
})
