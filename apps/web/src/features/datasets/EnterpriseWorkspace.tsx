import { memo, useCallback, useEffect, useRef, useState } from 'react'
import type { Dataset, DatasetHealthReport, DatasetProfile, DatasetRecommendations } from '../../types/dataset'
import type { JobEntity, TrainingRequestPayload } from '../../types/job'
import { computeClientProfile, fetchDatasetProfile } from '../../services/profilerService'
import { computeClientHealth, fetchDatasetHealth } from '../../services/healthService'
import { computeClientRecommendations, fetchDatasetRecommendations } from '../../services/recommendationService'
import { cancelJob, createTrainingJob, deleteJob, fetchJobs, retryJob } from '../../services/jobService'

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

import { TrainingConfigurationPanel } from '../jobs/TrainingConfigurationPanel'
import { TrainingJobCard } from '../jobs/TrainingJobCard'
import { TrainingJobList } from '../jobs/TrainingJobList'
import { TrainingHistoryDrawer } from '../jobs/TrainingHistoryDrawer'
import { TrainingStatusBadge } from '../jobs/TrainingStatusBadge'

import { Badge } from '../../components/ui/Badge'
import { Skeleton } from '../../components/ui/Skeleton'
import { Card, CardContent } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'

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

  // Job Orchestration State
  const [activeJob, setActiveJob] = useState<JobEntity | null>(null)
  const [jobsList, setJobsList] = useState<JobEntity[]>([])
  const [isLaunchingJob, setIsLaunchingJob] = useState<boolean>(false)
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState<boolean>(false)

  const abortControllerRef = useRef<AbortController | null>(null)

  // Load active jobs list from API on mount
  useEffect(() => {
    async function loadJobs() {
      const data = await fetchJobs()
      setJobsList(data.jobs)
      if (data.jobs.length > 0) {
        setActiveJob((current) => current || data.jobs[0])
      }
    }
    loadJobs()
  }, [])

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
  }, [dataset, onSelectedTargetChange])

  const scrollToSection = useCallback((sectionId: string) => {
    const elem = document.getElementById(sectionId)
    if (elem) {
      elem.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  // Job Orchestration Event Handlers
  const handleLaunchJob = useCallback(async (payload: TrainingRequestPayload) => {
    setIsLaunchingJob(true)
    try {
      const createdJob = await createTrainingJob(payload)
      setActiveJob(createdJob)
      setJobsList((prev) => [createdJob, ...prev.filter((j) => j.job_id !== createdJob.job_id)])
      setIsLaunchingJob(false)
      scrollToSection('section-job-card')
    } catch (err) {
      setIsLaunchingJob(false)
      throw err
    }
  }, [scrollToSection])

  const handleRefreshJobs = useCallback(async () => {
    const data = await fetchJobs()
    setJobsList(data.jobs)
  }, [])

  const handleCancelJobInList = useCallback(async (jobId: string) => {
    const res = await cancelJob(jobId)
    if (res) {
      handleRefreshJobs()
    }
  }, [handleRefreshJobs])

  const handleRetryJobInList = useCallback(async (jobId: string) => {
    const res = await retryJob(jobId)
    if (res) {
      handleRefreshJobs()
    }
  }, [handleRefreshJobs])

  const handleDeleteJobInList = useCallback(async (jobId: string) => {
    const ok = await deleteJob(jobId)
    if (ok) {
      setJobsList((prev) => prev.filter((j) => j.job_id !== jobId))
      if (activeJob?.job_id === jobId) {
        setActiveJob(null)
      }
    }
  }, [activeJob])

  return (
    <div className="mlp-page mlp-anim-fadeInUp space-y-6 pb-12">
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

              {/* Section 8: ML Model Training Configuration */}
              <CollapsibleSection
                id="section-training-config"
                title="ML Model Training Setup"
                description="Configure algorithm choices, train/test split ratio, cross validation, and hyperparameters"
                icon="cpu"
                defaultExpanded={true}
                badge={
                  selectedTarget ? (
                    <Badge variant="primary" icon="layers" size="sm">
                      Ready to Train
                    </Badge>
                  ) : (
                    <Badge variant="outline" size="sm">
                      Setup Required
                    </Badge>
                  )
                }
              >
                <TrainingConfigurationPanel
                  dataset={dataset}
                  selectedFeatures={selectedFeatures}
                  selectedTarget={selectedTarget}
                  recommendations={recommendations}
                  onLaunchJob={handleLaunchJob}
                  isLaunching={isLaunchingJob}
                />
              </CollapsibleSection>

              {/* Section 9: Active Training Job Telemetry (Rendered when job active/selected) */}
              {activeJob && (
                <CollapsibleSection
                  id="section-job-card"
                  title="Live ML Job Orchestration & Progress"
                  description="Real-time telemetry, stage progression, and job cancellation/retry controls"
                  icon="activity"
                  defaultExpanded={true}
                  badge={<TrainingStatusBadge status={activeJob.status} size="sm" />}
                >
                  <TrainingJobCard
                    job={activeJob}
                    onJobUpdated={(updated) => {
                      setActiveJob(updated)
                      setJobsList((prev) =>
                        prev.map((j) => (j.job_id === updated.job_id ? updated : j)),
                      )
                    }}
                    onJobRetried={(newJob) => {
                      setActiveJob(newJob)
                      setJobsList((prev) => [newJob, ...prev])
                    }}
                  />
                </CollapsibleSection>
              )}

              {/* Section 10: ML Job History Log */}
              <CollapsibleSection
                id="section-job-history"
                title="ML Job History & Audit Log"
                description="Complete execution history of training jobs in this session"
                icon="clock"
                defaultExpanded={false}
                badge={
                  <Badge variant="outline" size="sm">
                    {jobsList.length} History Jobs
                  </Badge>
                }
              >
                <div className="space-y-4">
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      leftIcon="clock"
                      onClick={() => setIsHistoryDrawerOpen(true)}
                    >
                      Open Full History Drawer
                    </Button>
                  </div>

                  <TrainingJobList
                    jobs={jobsList}
                    onSelectJob={(j) => {
                      setActiveJob(j)
                      scrollToSection('section-job-card')
                    }}
                    onCancelJob={handleCancelJobInList}
                    onRetryJob={handleRetryJobInList}
                    onDeleteJob={handleDeleteJobInList}
                  />

                  <TrainingHistoryDrawer
                    jobs={jobsList}
                    isOpen={isHistoryDrawerOpen}
                    onClose={() => setIsHistoryDrawerOpen(false)}
                    onSelectJob={(j) => {
                      setActiveJob(j)
                      setIsHistoryDrawerOpen(false)
                      scrollToSection('section-job-card')
                    }}
                    onCancelJob={handleCancelJobInList}
                    onRetryJob={handleRetryJobInList}
                    onDeleteJob={handleDeleteJobInList}
                    onRefresh={handleRefreshJobs}
                  />
                </div>
              </CollapsibleSection>
            </>
          )}
        </>
      ) : null}
    </div>
  )
})
