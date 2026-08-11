import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Dataset, DatasetProfile, DatasetHealthReport } from '../types/dataset'
import type { JobListData } from '../types/job'
import { computeClientProfile } from '../services/profilerService'
import { computeClientHealth } from '../services/healthService'
import { apiClient } from '../services/apiClient'

// ── Query Keys ───────────────────────────────────────────────────────────────
export const ML_QUERY_KEYS = {
  datasetProfile: (id: string) => ['datasetProfile', id] as const,
  datasetHealth: (id: string) => ['datasetHealth', id] as const,
  jobsList: () => ['jobsList'] as const,
}

// ── 1. Dataset Profile Query (Stale-While-Revalidate 5m) ─────────────────────
export function useDatasetProfileQuery(dataset: Dataset | null) {
  const datasetId = dataset?.datasetId || dataset?.fileName || 'anonymous'

  return useQuery<DatasetProfile | null>({
    queryKey: ML_QUERY_KEYS.datasetProfile(datasetId),
    queryFn: async ({ signal }) => {
      if (!dataset) return null
      try {
        const profile = await apiClient.get<DatasetProfile>(`/datasets/${datasetId}/profile`, { signal })
        return profile
      } catch {
        // Fallback to offline client-side computation
        return computeClientProfile(dataset)
      }
    },
    enabled: !!dataset,
    staleTime: 1000 * 60 * 5, // 5 minutes stale-while-revalidate
  })
}

// ── 2. Dataset Health Query (Stale-While-Revalidate 5m) ──────────────────────
export function useDatasetHealthQuery(dataset: Dataset | null) {
  const datasetId = dataset?.datasetId || dataset?.fileName || 'anonymous'

  return useQuery<DatasetHealthReport | null>({
    queryKey: ML_QUERY_KEYS.datasetHealth(datasetId),
    queryFn: async ({ signal }) => {
      if (!dataset) return null
      try {
        const report = await apiClient.get<DatasetHealthReport>(`/datasets/${datasetId}/health`, { signal })
        return report
      } catch {
        const profile = computeClientProfile(dataset)
        return computeClientHealth(profile)
      }
    },
    enabled: !!dataset,
    staleTime: 1000 * 60 * 5, // 5 minutes stale-while-revalidate
  })
}

// ── 3. Jobs List Query with Automatic Background Refetching for Running Jobs ─
const ACTIVE_JOB_STATUSES = new Set([
  'PENDING',
  'QUEUED',
  'STARTING',
  'RUNNING',
  'VALIDATING',
  'TRAINING',
  'EVALUATING',
  'SAVING_MODEL',
  'RETRYING',
])

export function useJobsListQuery(pollIntervalMs: number = 5000) {
  return useQuery<JobListData>({
    queryKey: ML_QUERY_KEYS.jobsList(),
    queryFn: async ({ signal }) => {
      return await apiClient.get<JobListData>('/jobs?limit=50', { signal })
    },
    staleTime: 1000 * 10, // 10s stale time
    refetchInterval: (query) => {
      const jobs = query.state.data?.jobs || []
      const hasActiveJobs = jobs.some((job) => ACTIVE_JOB_STATUSES.has(job.status.toUpperCase()))
      // Automatically poll every pollIntervalMs while active training jobs exist!
      return hasActiveJobs ? pollIntervalMs : false
    },
  })
}

// ── 4. Optimistic Mutation for Job Cancellation ──────────────────────────────
export function useCancelJobMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (jobId: string) => {
      return await apiClient.post<{ message: string; job_id: string }>(`/jobs/${jobId}/cancel`, {})
    },
    // Optimistic Update: Immediately update cache before server responds
    onMutate: async (jobId: string) => {
      await queryClient.cancelQueries({ queryKey: ML_QUERY_KEYS.jobsList() })

      const previousJobsData = queryClient.getQueryData<JobListData>(ML_QUERY_KEYS.jobsList())

      if (previousJobsData) {
        queryClient.setQueryData<JobListData>(ML_QUERY_KEYS.jobsList(), {
          ...previousJobsData,
          jobs: previousJobsData.jobs.map((job) =>
            job.job_id === jobId
              ? {
                  ...job,
                  status: 'CANCELLED',
                  cancelled_at: new Date().toISOString(),
                  message: 'Job cancellation requested by user.',
                }
              : job
          ),
        })
      }

      return { previousJobsData }
    },
    // Rollback to previous cache snapshot if server mutation fails
    onError: (_err, _jobId, context) => {
      if (context?.previousJobsData) {
        queryClient.setQueryData<JobListData>(ML_QUERY_KEYS.jobsList(), context.previousJobsData)
      }
    },
    // Always refetch after error or success to ensure backend sync
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ML_QUERY_KEYS.jobsList() })
    },
  })
}
