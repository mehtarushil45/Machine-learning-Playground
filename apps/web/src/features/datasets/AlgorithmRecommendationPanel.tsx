/**
 * AlgorithmRecommendationPanel — Evidence-Based Machine Learning Recommendation UI.
 *
 * Provides:
 *  - Non-blocking target guidance before target selection
 *  - "Analyze & Recommend Algorithms" benchmark submission
 *  - Real-time stage & progress polling (Profiling -> Screening -> Verifying -> Completed)
 *  - Cooperative cancellation
 *  - Evidence summary with metric scores & confidence intervals
 *  - "Why this model?" accessible candidate benchmark breakdown modal
 *  - Stale detection on dataset/feature/target modification
 *  - Manual override protection and 1-click restore
 *  - Insufficient data guidance & fallback
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Award,
  CheckCircle2,
  HelpCircle,
  Info,
  Loader2,
  RotateCcw,
  Sparkles,
  StopCircle,
  X,
} from 'lucide-react';
import type { Dataset } from '../../types/dataset';
import type {
  CandidateBenchmarkResult,
  RecommendationJobDetail,
  RecommendationRequest,
  RecommendationUIState,
} from '../../types/recommendation';
import {
  cancelRecommendation,
  getRecommendationJob,
  startRecommendation,
} from '../../services/recommendationService';
import { ApiError } from '../../services/apiClient';

/* ── BB Brand Tokens ─────────────────────────────────────────────────── */
const BB = {
  base: '#0B0912',
  surface: '#1B1530',
  elevated: '#2A2247',
  border: 'rgba(107,92,166,0.18)',
  borderHover: 'rgba(107,92,166,0.38)',
  primary: '#4B3B7C',
  primaryLight: '#6C5CA6',
  maroon: '#6E1423',
  maroonLight: '#B23A4E',
  gold: '#C9A24B',
  text: '#F5F1EC',
  muted: '#9E93B8',
  disabled: '#3D3558',
  success: '#22c55e',
  warning: '#f59e0b',
} as const;

export interface AlgorithmRecommendationPanelProps {
  dataset: Dataset | null;
  selectedTarget: string | null;
  selectedFeatures: string[];
  selectedAlgorithm: string;
  onSelectAlgorithm: (algorithmKey: string) => void;
  cvFolds: number;
  trainTestSplit: number;
  onShowToast?: (title: string, description?: string, type?: 'success' | 'info' | 'error') => void;
  onRecommendationChange?: (info: {
    recommendationJobId: string | null;
    isRecommended: boolean;
    recommendedAlgorithmId: string | null;
  }) => void;
}

export function AlgorithmRecommendationPanel({
  dataset,
  selectedTarget,
  selectedFeatures,
  selectedAlgorithm,
  onSelectAlgorithm,
  cvFolds,
  trainTestSplit,
  onShowToast,
  onRecommendationChange,
}: AlgorithmRecommendationPanelProps) {
  /* ── Recommendation Job State ────────────────────────────────────── */
  const [activeJob, setActiveJob] = useState<RecommendationJobDetail | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastAnalyzedFingerprint, setLastAnalyzedFingerprint] = useState<string | null>(null);
  const [recommendedAlgorithmId, setRecommendedAlgorithmId] = useState<string | null>(null);
  const [showEvidenceModal, setShowEvidenceModal] = useState(false);

  /* ── Fingerprint for Stale Detection ─────────────────────────────── */
  const effectiveDatasetId = dataset?.datasetId || (dataset ? `ds-${dataset.fileName || 'local'}` : undefined);

  const currentFingerprint = useMemo(() => {
    if (!effectiveDatasetId || !selectedTarget || selectedFeatures.length === 0) return null;
    const sortedFeats = [...selectedFeatures].sort().join(',');
    return `${effectiveDatasetId}:${selectedTarget}:${sortedFeats}:${cvFolds}:${trainTestSplit}`;
  }, [effectiveDatasetId, selectedTarget, selectedFeatures, cvFolds, trainTestSplit]);

  /* ── Derived Manual Override Flag ────────────────────────────────── */
  const isManualOverride = Boolean(
    recommendedAlgorithmId && selectedAlgorithm !== recommendedAlgorithmId,
  );

  /* ── Notify Parent of Provenance State ───────────────────────────── */
  useEffect(() => {
    if (activeJob?.status === 'COMPLETED' && activeJob.job_id) {
      onRecommendationChange?.({
        recommendationJobId: activeJob.job_id,
        isRecommended: !isManualOverride,
        recommendedAlgorithmId,
      });
    } else {
      onRecommendationChange?.({
        recommendationJobId: null,
        isRecommended: false,
        recommendedAlgorithmId: null,
      });
    }
  }, [activeJob?.status, activeJob?.job_id, isManualOverride, recommendedAlgorithmId, onRecommendationChange]);

  /* ── UI State Machine Calculation ────────────────────────────────── */
  const uiState: RecommendationUIState = useMemo(() => {
    if (!dataset || !selectedTarget) {
      return 'NO_TARGET';
    }
    if (isSubmitting) {
      return 'SUBMITTING';
    }
    if (
      activeJob &&
      ['PENDING', 'QUEUED', 'PROFILING', 'SCREENING', 'VERIFYING'].includes(activeJob.status)
    ) {
      return 'BENCHMARKING';
    }
    if (
      activeJob &&
      lastAnalyzedFingerprint !== null &&
      currentFingerprint !== lastAnalyzedFingerprint
    ) {
      return 'STALE';
    }
    if (activeJob?.status === 'COMPLETED') {
      if (isManualOverride) {
        return 'MANUAL_OVERRIDE';
      }
      if (
        activeJob.reason_codes?.includes('practical_equivalence_tie') ||
        activeJob.reason_codes?.includes('no_clear_winner')
      ) {
        return 'COMPLETED_NO_CLEAR_WINNER';
      }
      return 'COMPLETED_RECOMMENDED';
    }
    if (activeJob?.status === 'INSUFFICIENT_DATA') {
      return 'INSUFFICIENT_DATA';
    }
    if (activeJob?.status === 'FAILED') {
      return 'FAILED';
    }
    if (activeJob?.status === 'CANCELLED') {
      return 'CANCELLED';
    }
    return 'READY_TO_ANALYZE';
  }, [
    dataset,
    selectedTarget,
    isSubmitting,
    activeJob,
    lastAnalyzedFingerprint,
    currentFingerprint,
    isManualOverride,
  ]);

  /* ── Adaptive Polling Loop with Bounded Timeout ─────────────────── */
  const pollingRef = useRef<number | null>(null);
  const abortCtrlRef = useRef<AbortController | null>(null);
  const pollJobRef = useRef<((datasetId: string, jobId: string) => Promise<void>) | null>(null);
  const pollStartTimeRef = useRef<number>(0);
  const pollErrorCountRef = useRef<number>(0);

  const eligibilityReason = useMemo<string | null>(() => {
    if (!dataset) {
      return 'Upload a dataset to begin.';
    }
    if (!selectedTarget) {
      return 'Select a target column.';
    }
    if (selectedFeatures.length === 0) {
      return 'Select at least one feature column.';
    }
    if (selectedFeatures.includes(selectedTarget)) {
      return `Remove "${selectedTarget}" from features because it is the target.`;
    }
    const usableFeatures = selectedFeatures.filter((f) => f !== selectedTarget);
    if (usableFeatures.length === 0) {
      return 'Select at least one non-target feature column.';
    }
    if (isSubmitting) {
      return 'Submitting recommendation benchmark...';
    }
    if (uiState === 'BENCHMARKING') {
      return 'Benchmarking algorithms in progress...';
    }
    return null;
  }, [dataset, selectedTarget, selectedFeatures, isSubmitting, uiState]);

  const isEligibleToAnalyze = eligibilityReason === null;

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      window.clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
    if (abortCtrlRef.current) {
      abortCtrlRef.current.abort();
      abortCtrlRef.current = null;
    }
  }, []);

  const pollJob = useCallback(
    async (datasetId: string, jobId: string) => {
      stopPolling();
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        // Paused while tab is hidden
        return;
      }

      // Check for 45s client-side timeout
      if (pollStartTimeRef.current > 0 && Date.now() - pollStartTimeRef.current > 45000) {
        stopPolling();
        const timeoutMsg = 'Recommendation benchmark timed out after 45 seconds without worker completion. Please retry.';
        setErrorMessage(timeoutMsg);
        setActiveJob((prev) =>
          prev
            ? {
                ...prev,
                status: 'FAILED',
                stage: 'Failed',
                error_details: {
                  error_type: 'TimeoutError',
                  message: timeoutMsg,
                },
              }
            : null,
        );
        onShowToast?.('Benchmark Timeout', timeoutMsg, 'error');
        return;
      }

      const ctrl = new AbortController();
      abortCtrlRef.current = ctrl;

      try {
        const job = await getRecommendationJob(datasetId, jobId, ctrl.signal);
        if (!job || !job.status) {
          throw new Error('Invalid job response received');
        }
        pollErrorCountRef.current = 0; // Reset consecutive errors on success
        setActiveJob(job);

        const isActive = ['PENDING', 'QUEUED', 'PROFILING', 'SCREENING', 'VERIFYING'].includes(
          job.status,
        );

        if (isActive) {
          pollingRef.current = window.setTimeout(() => {
            pollJobRef.current?.(datasetId, jobId);
          }, 1500);
        } else {
          // Terminal reached
          stopPolling();
          if (job.status === 'COMPLETED' && job.recommendation?.algorithm_id) {
            setRecommendedAlgorithmId(job.recommendation.algorithm_id);
            onSelectAlgorithm(job.recommendation.algorithm_id);
            onShowToast?.(
              'Recommendation Ready',
              `Selected ${job.recommendation.display_name} based on cross-validation benchmarking.`,
              'success',
            );
          } else if (job.status === 'INSUFFICIENT_DATA') {
            onShowToast?.(
              'Benchmark Notice',
              'Target data is insufficient for multi-algorithm benchmarking. Standard manual controls remain available.',
              'info',
            );
          } else if (job.status === 'FAILED') {
            const failMsg = job.error_details?.message || 'Benchmark execution encountered an error.';
            setErrorMessage(failMsg);
            onShowToast?.('Benchmark Failed', failMsg, 'error');
          }
        }
      } catch (err) {
        if (ctrl.signal.aborted) return;
        pollErrorCountRef.current += 1;
        if (pollErrorCountRef.current >= 4) {
          stopPolling();
          const errDetail =
            err instanceof ApiError
              ? err.detail
              : err instanceof Error
              ? err.message
              : 'Failed to communicate with recommendation worker service.';
          setErrorMessage(errDetail);
          setActiveJob((prev) =>
            prev
              ? {
                  ...prev,
                  status: 'FAILED',
                  stage: 'Failed',
                  error_details: {
                    error_type: 'NetworkError',
                    message: errDetail,
                  },
                }
              : null,
          );
          onShowToast?.('Benchmark Communication Error', errDetail, 'error');
          return;
        }

        // Non-fatal poll error, retry after delay
        pollingRef.current = window.setTimeout(() => {
          pollJobRef.current?.(datasetId, jobId);
        }, 2500);
      }
    },
    [stopPolling, onSelectAlgorithm, onShowToast],
  );

  useEffect(() => {
    pollJobRef.current = pollJob;
  }, [pollJob]);

  /* ── Tab Visibility Listener ─────────────────────────────────────── */
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (
        document.visibilityState === 'visible' &&
        activeJob &&
        ['PENDING', 'QUEUED', 'PROFILING', 'SCREENING', 'VERIFYING'].includes(activeJob.status) &&
        effectiveDatasetId
      ) {
        pollJob(effectiveDatasetId, activeJob.job_id);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [activeJob, effectiveDatasetId, pollJob]);

  /* ── Clean Up on Unmount ─────────────────────────────────────────── */
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  /* ── Submit Benchmark Request ────────────────────────────────────── */
  const handleStartAnalysis = async () => {
    if (!effectiveDatasetId || !selectedTarget) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    const payload: RecommendationRequest = {
      target_column: selectedTarget,
      feature_columns: selectedFeatures.filter((f) => f !== selectedTarget),
      cv_folds: cvFolds,
      train_test_split: trainTestSplit,
      random_seed: 42,
      max_training_seconds: 120,
      prefer_interpretable: false,
    };

    try {
      const res = await startRecommendation(effectiveDatasetId, payload);
      setActiveJob(res.job);
      setLastAnalyzedFingerprint(currentFingerprint);

      if (res.cached) {
        // Immediate cache hit
        if (res.job.recommendation?.algorithm_id) {
          setRecommendedAlgorithmId(res.job.recommendation.algorithm_id);
          onSelectAlgorithm(res.job.recommendation.algorithm_id);
        }
        onShowToast?.(
          'Recommendation Cache Hit',
          `Loaded verified benchmark recommendation for target '${selectedTarget}'.`,
          'success',
        );
      } else {
        // Start polling with fresh timers
        pollStartTimeRef.current = Date.now();
        pollErrorCountRef.current = 0;
        pollJob(effectiveDatasetId, res.job.job_id);
        if (res.deduplicated) {
          onShowToast?.(
            'Joined Benchmark',
            'Attached to in-progress recommendation benchmark for this dataset configuration.',
            'info',
          );
        }
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.detail);
      } else {
        setErrorMessage('Failed to start recommendation benchmark. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ── Cancel Benchmark Request ────────────────────────────────────── */
  const handleCancelAnalysis = async () => {
    if (!effectiveDatasetId || !activeJob?.job_id) return;
    setIsCancelling(true);
    try {
      const updated = await cancelRecommendation(effectiveDatasetId, activeJob.job_id);
      setActiveJob(updated);
      stopPolling();
      onShowToast?.('Benchmark Cancelled', 'Algorithm recommendation was cancelled.', 'info');
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.detail);
      }
    } finally {
      setIsCancelling(false);
    }
  };

  /* ── Modal Close on ESC ──────────────────────────────────────────── */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showEvidenceModal) {
        setShowEvidenceModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showEvidenceModal]);

  return (
    <div
      style={{
        background: BB.elevated,
        border: `1px solid ${BB.border}`,
        borderRadius: 8,
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {/* ── Sub-Panel Header ────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Sparkles style={{ width: 14, height: 14, color: BB.gold }} />
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: BB.text, letterSpacing: '0.06em' }}>
            Algorithm Benchmark
          </span>
        </div>

        {/* Status Badges */}
        {uiState === 'COMPLETED_RECOMMENDED' && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 9,
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: 4,
              background: 'rgba(201,162,75,0.15)',
              border: `1px solid ${BB.gold}`,
              color: BB.gold,
            }}
          >
            <CheckCircle2 style={{ width: 10, height: 10 }} />
            Recommended
          </span>
        )}

        {uiState === 'COMPLETED_NO_CLEAR_WINNER' && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 9,
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: 4,
              background: 'rgba(107,92,166,0.18)',
              border: `1px solid ${BB.primaryLight}`,
              color: BB.primaryLight,
            }}
          >
            <Info style={{ width: 10, height: 10 }} />
            Tie-Break Selected
          </span>
        )}

        {uiState === 'MANUAL_OVERRIDE' && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 9,
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: 4,
              background: 'rgba(158,147,184,0.12)',
              border: `1px solid ${BB.muted}`,
              color: BB.muted,
            }}
          >
            Manual Choice
          </span>
        )}

        {uiState === 'STALE' && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 9,
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: 4,
              background: 'rgba(245,158,11,0.15)',
              border: `1px solid ${BB.warning}`,
              color: BB.warning,
            }}
          >
            Inputs Changed
          </span>
        )}
      </div>

      {/* ── State Renderings ────────────────────────────────────────── */}

      {/* 1. NO TARGET */}
      {uiState === 'NO_TARGET' && (
        <p style={{ margin: 0, fontSize: 10, color: BB.muted, lineHeight: 1.4 }}>
          Select a target column in the Columns table to generate an evidence-based algorithm recommendation.
        </p>
      )}

      {/* 2. READY TO ANALYZE */}
      {uiState === 'READY_TO_ANALYZE' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <p style={{ margin: 0, fontSize: 10, color: BB.muted }}>
            Run a leakage-safe 2-tier cross-validation benchmark across all compatible estimators.
          </p>
          {errorMessage && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 6px',
                borderRadius: 4,
                background: 'rgba(110,20,35,0.18)',
                border: '1px solid rgba(178,58,78,0.30)',
                color: BB.maroonLight,
                fontSize: 9,
              }}
            >
              <AlertCircle style={{ width: 12, height: 12, flexShrink: 0 }} />
              <span>{errorMessage}</span>
            </div>
          )}
          {!isEligibleToAnalyze && eligibilityReason && (
            <div
              data-testid="recommendation-eligibility-reason"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 8px',
                borderRadius: 4,
                background: 'rgba(201,162,75,0.08)',
                border: `1px solid rgba(201,162,75,0.25)`,
                color: BB.gold,
                fontSize: 9,
                lineHeight: 1.3,
              }}
            >
              <Info style={{ width: 11, height: 11, flexShrink: 0 }} />
              <span>{eligibilityReason}</span>
            </div>
          )}
          <button
            onClick={handleStartAnalysis}
            disabled={!isEligibleToAnalyze}
            aria-label="Analyze & Recommend Algorithms"
            title={!isEligibleToAnalyze && eligibilityReason ? eligibilityReason : 'Analyze & Recommend Algorithms'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '6px 10px',
              borderRadius: 6,
              background: isEligibleToAnalyze ? `linear-gradient(135deg, ${BB.primary}, ${BB.maroon})` : BB.disabled,
              border: `1px solid ${isEligibleToAnalyze ? BB.primaryLight : 'transparent'}`,
              color: BB.text,
              fontSize: 10,
              fontWeight: 700,
              cursor: isEligibleToAnalyze ? 'pointer' : 'not-allowed',
              transition: 'all 150ms ease',
            }}
          >
            <Sparkles style={{ width: 12, height: 12 }} />
            Analyze & Recommend Algorithms
          </button>
        </div>
      )}

      {/* 3. SUBMITTING */}
      {uiState === 'SUBMITTING' && (
        <div
          aria-live="polite"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 8px',
            borderRadius: 6,
            background: 'rgba(107,92,166,0.12)',
            border: `1px solid ${BB.border}`,
          }}
        >
          <Loader2 className="animate-spin" style={{ width: 14, height: 14, color: BB.gold }} />
          <span style={{ fontSize: 10, color: BB.text }}>Queueing recommendation benchmark...</span>
        </div>
      )}

      {/* 4. BENCHMARKING (ACTIVE) */}
      {uiState === 'BENCHMARKING' && activeJob && (
        <div
          aria-live="polite"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            padding: '8px 10px',
            borderRadius: 6,
            background: 'rgba(107,92,166,0.10)',
            border: `1px solid rgba(107,92,166,0.25)`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Loader2 className="animate-spin" style={{ width: 12, height: 12, color: BB.gold }} />
              <span style={{ fontSize: 10, fontWeight: 600, color: BB.text }}>
                {activeJob.stage || 'Benchmarking algorithms...'}
              </span>
            </div>
            <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: BB.muted }}>
              {Math.round(activeJob.progress || 0)}%
            </span>
          </div>

          {/* Progress Bar */}
          <div
            style={{
              width: '100%',
              height: 4,
              borderRadius: 2,
              background: 'rgba(61,53,88,0.40)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${Math.max(5, Math.min(100, activeJob.progress || 0))}%`,
                height: '100%',
                background: `linear-gradient(90deg, ${BB.primaryLight}, ${BB.gold})`,
                transition: 'width 300ms ease',
              }}
            />
          </div>

          {/* Cancel Button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 2 }}>
            <button
              onClick={handleCancelAnalysis}
              disabled={isCancelling}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '3px 8px',
                borderRadius: 4,
                background: 'transparent',
                border: `1px solid rgba(178,58,78,0.4)`,
                color: BB.maroonLight,
                fontSize: 9,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <StopCircle style={{ width: 10, height: 10 }} />
              {isCancelling ? 'Cancelling...' : 'Cancel Benchmark'}
            </button>
          </div>
        </div>
      )}

      {/* 5. COMPLETED (RECOMMENDED OR TIE-BREAK) */}
      {(uiState === 'COMPLETED_RECOMMENDED' || uiState === 'COMPLETED_NO_CLEAR_WINNER') && activeJob?.recommendation && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div
            style={{
              padding: '10px 12px',
              borderRadius: 8,
              background: 'linear-gradient(145deg, rgba(201,162,75,0.08), rgba(201,162,75,0.02))',
              border: `1px solid rgba(201,162,75,0.3)`,
              position: 'relative',
            }}
          >
            <div style={{ position: 'absolute', top: -8, right: 10, background: BB.surface, padding: '0 6px', border: `1px solid ${BB.gold}`, borderRadius: 12, fontSize: 8, fontWeight: 700, color: BB.gold }}>
              #1 RECOMMENDATION
            </div>
            
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
              <div>
                <span style={{ fontSize: 13, fontWeight: 700, color: BB.text, display: 'block' }}>
                  {activeJob.recommendation.display_name}
                </span>
                <span style={{ fontSize: 9, color: BB.muted, textTransform: 'capitalize' }}>
                  {activeJob.recommendation.category}
                </span>
              </div>
              
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-mono)', color: BB.success }}>
                  {activeJob.recommendation.validation_score?.toFixed(3) || activeJob.recommendation.score?.toFixed(3)}
                </span>
                {activeJob.recommendation.ci_lower !== null && activeJob.recommendation.ci_lower !== undefined && (
                  <div style={{ fontSize: 8, color: BB.muted, fontFamily: 'var(--font-mono)' }}>
                    95% CI: [{activeJob.recommendation.ci_lower.toFixed(3)}, {activeJob.recommendation.ci_upper?.toFixed(3)}]
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, marginBottom: 8 }}>
              {activeJob.recommendation.interpretability_score && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} title="Interpretability Rating">
                  <div style={{ display: 'flex' }}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Sparkles key={i} style={{ width: 10, height: 10, color: i < (activeJob.recommendation!.interpretability_score || 0) ? BB.gold : BB.disabled }} />
                    ))}
                  </div>
                  <span style={{ fontSize: 9, color: BB.text }}>{activeJob.recommendation.interpretability_label} Int.</span>
                </div>
              )}
              {activeJob.recommendation.training_time_seconds !== undefined && (
                <div style={{ fontSize: 9, color: BB.muted, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span>⚡</span> {(activeJob.recommendation.training_time_seconds || 0).toFixed(2)}s
                </div>
              )}
            </div>
            
            {activeJob.recommendation.why_recommended && (
              <div style={{ fontSize: 10, color: BB.muted, lineHeight: 1.4, padding: '6px 8px', background: 'rgba(0,0,0,0.2)', borderRadius: 4, marginTop: 6, borderLeft: `2px solid ${BB.gold}` }}>
                {activeJob.recommendation.why_recommended}
              </div>
            )}
            
            {activeJob.recommendation.risk_flags && activeJob.recommendation.risk_flags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                {activeJob.recommendation.risk_flags.map((flag, idx) => (
                  <span key={idx} style={{ fontSize: 8, padding: '2px 6px', background: 'rgba(245,158,11,0.1)', color: BB.warning, borderRadius: 4, border: `1px solid rgba(245,158,11,0.2)` }}>
                    ⚠️ {flag}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              onClick={() => setShowEvidenceModal(true)}
              aria-label="Why this model?"
              style={{
                flex: 1,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                padding: '6px 8px',
                borderRadius: 5,
                background: 'transparent',
                border: `1px solid ${BB.primaryLight}`,
                color: BB.text,
                fontSize: 10,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <HelpCircle style={{ width: 12, height: 12, color: BB.gold }} />
              Compare Top {activeJob.candidates?.length || 5} Models
            </button>

            <button
              onClick={handleStartAnalysis}
              disabled={!isEligibleToAnalyze}
              title="Re-run benchmark"
              aria-label="Re-run benchmark"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '6px 10px',
                borderRadius: 5,
                background: 'transparent',
                border: `1px solid ${BB.border}`,
                color: BB.muted,
                cursor: isEligibleToAnalyze ? 'pointer' : 'not-allowed',
              }}
            >
              <RotateCcw style={{ width: 12, height: 12 }} />
            </button>
          </div>
        </div>
      )}

      {/* 6. MANUAL OVERRIDE */}
      {uiState === 'MANUAL_OVERRIDE' && activeJob?.recommendation && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            padding: '6px 8px',
            borderRadius: 6,
            background: 'rgba(158,147,184,0.08)',
            border: `1px solid ${BB.border}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
            <Info style={{ width: 12, height: 12, color: BB.muted, flexShrink: 0, marginTop: 1 }} />
            <p style={{ margin: 0, fontSize: 9, color: BB.muted, lineHeight: 1.3 }}>
              Manual model selection active. Recommended for this dataset was{' '}
              <strong style={{ color: BB.gold }}>{activeJob.recommendation.display_name}</strong>
              {activeJob.recommendation.score ? ` (${activeJob.recommendation.score.toFixed(3)})` : ''}.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => {
                if (activeJob.recommendation?.algorithm_id) {
                  onSelectAlgorithm(activeJob.recommendation.algorithm_id);
                }
              }}
              style={{
                flex: 1,
                padding: '4px 6px',
                borderRadius: 5,
                background: 'rgba(201,162,75,0.12)',
                border: `1px solid ${BB.gold}`,
                color: BB.gold,
                fontSize: 9,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Use Recommended ({activeJob.recommendation.display_name})
            </button>

            <button
              onClick={() => setShowEvidenceModal(true)}
              style={{
                padding: '4px 6px',
                borderRadius: 5,
                background: 'transparent',
                border: `1px solid ${BB.border}`,
                color: BB.text,
                fontSize: 9,
                cursor: 'pointer',
              }}
            >
              Evidence
            </button>
          </div>
        </div>
      )}

      {/* 7. STALE */}
      {uiState === 'STALE' && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            padding: '6px 8px',
            borderRadius: 6,
            background: 'rgba(245,158,11,0.08)',
            border: `1px solid rgba(245,158,11,0.25)`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertCircle style={{ width: 12, height: 12, color: BB.warning, flexShrink: 0 }} />
            <span style={{ fontSize: 9, color: BB.text }}>
              Target or features changed since previous benchmark.
            </span>
          </div>

          {!isEligibleToAnalyze && eligibilityReason && (
            <div
              data-testid="recommendation-stale-eligibility-reason"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 8px',
                borderRadius: 4,
                background: 'rgba(201,162,75,0.08)',
                border: `1px solid rgba(201,162,75,0.25)`,
                color: BB.gold,
                fontSize: 9,
                lineHeight: 1.3,
              }}
            >
              <Info style={{ width: 11, height: 11, flexShrink: 0 }} />
              <span>{eligibilityReason}</span>
            </div>
          )}

          <button
            onClick={handleStartAnalysis}
            disabled={!isEligibleToAnalyze}
            title={!isEligibleToAnalyze && eligibilityReason ? eligibilityReason : 'Re-analyze with New Settings'}
            style={{
              width: '100%',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              padding: '4px 8px',
              borderRadius: 5,
              background: isEligibleToAnalyze ? `linear-gradient(135deg, ${BB.primary}, ${BB.maroon})` : BB.disabled,
              border: `1px solid ${isEligibleToAnalyze ? BB.primaryLight : 'transparent'}`,
              color: BB.text,
              fontSize: 9,
              fontWeight: 700,
              cursor: isEligibleToAnalyze ? 'pointer' : 'not-allowed',
            }}
          >
            <RotateCcw style={{ width: 10, height: 10 }} />
            Re-analyze with New Settings
          </button>
        </div>
      )}

      {/* 8. INSUFFICIENT DATA */}
      {uiState === 'INSUFFICIENT_DATA' && activeJob && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            padding: '6px 8px',
            borderRadius: 6,
            background: 'rgba(107,92,166,0.08)',
            border: `1px solid ${BB.border}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Info style={{ width: 12, height: 12, color: BB.muted }} />
            <span style={{ fontSize: 10, fontWeight: 600, color: BB.text }}>Insufficient Data for Benchmarking</span>
          </div>
          <p style={{ margin: 0, fontSize: 9, color: BB.muted, lineHeight: 1.3 }}>
            {activeJob.limitations?.[0] || 'Target variable requires at least 2 distinct classes. You may continue with manual algorithm selection.'}
          </p>
        </div>
      )}

      {/* 9. FAILED */}
      {uiState === 'FAILED' && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            padding: '6px 8px',
            borderRadius: 6,
            background: 'rgba(110,20,35,0.18)',
            border: `1px solid rgba(178,58,78,0.30)`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertCircle style={{ width: 12, height: 12, color: BB.maroonLight, flexShrink: 0 }} />
            <span style={{ fontSize: 9, color: BB.text }}>
              {activeJob?.error_details?.message || errorMessage || 'Benchmark execution encountered an error.'}
            </span>
          </div>
          <button
            onClick={handleStartAnalysis}
            disabled={!isEligibleToAnalyze}
            style={{
              padding: '3px 8px',
              borderRadius: 4,
              background: 'transparent',
              border: `1px solid rgba(178,58,78,0.4)`,
              color: BB.maroonLight,
              fontSize: 9,
              fontWeight: 600,
              cursor: isEligibleToAnalyze ? 'pointer' : 'not-allowed',
            }}
          >
            Retry Analysis
          </button>
        </div>
      )}

      {/* 10. CANCELLED */}
      {uiState === 'CANCELLED' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 9, color: BB.muted }}>Analysis was cancelled.</span>
          <button
            onClick={handleStartAnalysis}
            disabled={!isEligibleToAnalyze}
            style={{
              padding: '3px 6px',
              borderRadius: 4,
              background: 'transparent',
              border: `1px solid ${BB.border}`,
              color: BB.text,
              fontSize: 9,
              cursor: isEligibleToAnalyze ? 'pointer' : 'not-allowed',
            }}
          >
            Re-analyze
          </button>
        </div>
      )}

      {/* ── Accessible Evidence Breakdown Modal ──────────────────────── */}
      {showEvidenceModal && activeJob && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="evidence-modal-title"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: 20,
          }}
          onClick={() => setShowEvidenceModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: BB.surface,
              border: `1px solid ${BB.border}`,
              borderRadius: 12,
              width: '100%',
              maxWidth: 680,
              maxHeight: '85vh',
              boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: '14px 18px',
                borderBottom: `1px solid ${BB.border}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: BB.elevated,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: 'rgba(201,162,75,0.15)',
                    border: `1px solid ${BB.gold}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Award style={{ width: 16, height: 16, color: BB.gold }} />
                </div>
                <div>
                  <h3
                    id="evidence-modal-title"
                    style={{ margin: 0, fontSize: 13, fontWeight: 700, color: BB.text }}
                  >
                    Algorithm Recommendation Evidence
                  </h3>
                  <span style={{ fontSize: 10, color: BB.muted }}>
                    Target: <strong style={{ color: BB.gold }}>{selectedTarget}</strong> ·{' '}
                    {activeJob.reproducibility?.task_type ? `${String(activeJob.reproducibility.task_type).toUpperCase()} · ` : ''}
                    Metric: {activeJob.reproducibility?.metric ? String(activeJob.reproducibility.metric).toUpperCase() : 'CV Score'}
                  </span>
                </div>
              </div>

              <button
                onClick={() => setShowEvidenceModal(false)}
                aria-label="Close evidence modal"
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  background: 'transparent',
                  border: `1px solid ${BB.border}`,
                  color: BB.muted,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <X style={{ width: 14, height: 14 }} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: 18, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Winner Summary Card */}
              {activeJob.recommendation && (
                <div
                  style={{
                    background: 'rgba(201,162,75,0.08)',
                    border: `1px solid rgba(201,162,75,0.25)`,
                    borderRadius: 8,
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: BB.gold,
                          color: BB.base,
                        }}
                      >
                        TOP PICK
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: BB.text }}>
                        {activeJob.recommendation.display_name}
                      </span>
                    </div>

                    {activeJob.recommendation.score !== null && activeJob.recommendation.score !== undefined && (
                      <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)', color: BB.gold }}>
                        {activeJob.recommendation.score.toFixed(4)}
                        {activeJob.recommendation.score_std ? ` ± ${activeJob.recommendation.score_std.toFixed(4)}` : ''}
                      </span>
                    )}
                  </div>

                  {activeJob.recommendation.reason_codes && activeJob.recommendation.reason_codes.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
                      {activeJob.recommendation.reason_codes.map((rc) => (
                        <span
                          key={rc}
                          style={{
                            fontSize: 9,
                            padding: '1px 5px',
                            borderRadius: 3,
                            background: 'rgba(107,92,166,0.20)',
                            color: BB.text,
                          }}
                        >
                          {rc.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Contenders Benchmark Table */}
              <div>
                <span
                  style={{
                    display: 'block',
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: BB.muted,
                    marginBottom: 8,
                  }}
                >
                  Evaluated Candidate Contenders ({activeJob.candidates?.length || 0})
                </span>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {(activeJob.candidates || []).map((c: CandidateBenchmarkResult, idx: number) => {
                    const isWinner = activeJob.recommendation?.algorithm_id === c.algorithm_id;
                    return (
                      <div
                        key={c.algorithm_id || idx}
                        style={{
                          border: `1px solid ${isWinner ? BB.gold : BB.border}`,
                          background: isWinner ? 'rgba(201,162,75,0.04)' : 'rgba(0,0,0,0.2)',
                          borderRadius: 8,
                          padding: 12,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                          position: 'relative'
                        }}
                      >
                        {isWinner && (
                          <div style={{ position: 'absolute', top: -8, right: 12, background: BB.surface, padding: '0 6px', border: `1px solid ${BB.gold}`, borderRadius: 12, fontSize: 8, fontWeight: 700, color: BB.gold }}>
                            #1 RECOMMENDED
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 13, fontWeight: 700, color: BB.text }}>{c.rank ? `#${c.rank} ` : ''}{c.display_name}</span>
                              <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'rgba(107,92,166,0.15)', color: BB.primaryLight, textTransform: 'capitalize' }}>
                                {c.category}
                              </span>
                            </div>
                            {c.why_recommended && (
                              <div style={{ fontSize: 10, color: BB.muted, marginTop: 4, lineHeight: 1.4 }}>
                                {c.why_recommended}
                              </div>
                            )}
                          </div>
                          
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-mono)', color: isWinner ? BB.gold : BB.success }}>
                              {c.validation_score?.toFixed(3) || c.score?.toFixed(3) || '-'}
                            </div>
                            {c.ci_lower !== null && c.ci_lower !== undefined && (
                              <div style={{ fontSize: 8, color: BB.muted, fontFamily: 'var(--font-mono)' }}>
                                95% CI: [{c.ci_lower.toFixed(3)}, {c.ci_upper?.toFixed(3)}]
                              </div>
                            )}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 4 }}>
                          {c.interpretability_score && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <div style={{ display: 'flex' }}>
                                {Array.from({ length: 5 }).map((_, i) => (
                                  <Sparkles key={i} style={{ width: 10, height: 10, color: i < (c.interpretability_score || 0) ? BB.gold : BB.disabled }} />
                                ))}
                              </div>
                              <span style={{ fontSize: 9, color: BB.muted }}>{c.interpretability_label} Int.</span>
                            </div>
                          )}
                          <div style={{ fontSize: 9, color: BB.muted, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span>⚡</span> {(c.training_time_seconds || c.training_seconds || 0).toFixed(2)}s train time
                          </div>
                        </div>

                        {c.risk_flags && c.risk_flags.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                            {c.risk_flags.map((flag, i) => (
                              <span key={i} style={{ fontSize: 8, padding: '2px 6px', background: 'rgba(245,158,11,0.1)', color: BB.warning, borderRadius: 4, border: `1px solid rgba(245,158,11,0.2)` }}>
                                ⚠️ {flag}
                              </span>
                            ))}
                          </div>
                        )}
                        
                        <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => {
                              onSelectAlgorithm(c.algorithm_id);
                              setShowEvidenceModal(false);
                            }}
                            style={{
                              padding: '4px 12px',
                              borderRadius: 4,
                              background: isWinner ? `linear-gradient(135deg, ${BB.primary}, ${BB.maroon})` : 'transparent',
                              border: `1px solid ${isWinner ? 'transparent' : BB.primaryLight}`,
                              color: BB.text,
                              fontSize: 10,
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            {isWinner ? 'Use Recommended Model' : 'Override & Use Model'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Limitations & Exclusions */}
              {((activeJob.limitations && activeJob.limitations.length > 0) ||
                (activeJob.exclusions && activeJob.exclusions.length > 0)) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: BB.muted }}>
                    Sanitization & Admission Notes
                  </span>
                  {activeJob.exclusions?.map((ex, i) => (
                    <span key={i} style={{ fontSize: 9, color: BB.muted }}>
                      · Dropped column <strong style={{ color: BB.text }}>{ex.column_name}</strong>: {ex.reason}
                    </span>
                  ))}
                  {activeJob.limitations?.map((lim, i) => (
                    <span key={i} style={{ fontSize: 9, color: BB.muted }}>
                      · {lim}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: '10px 18px',
                borderTop: `1px solid ${BB.border}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: BB.elevated,
              }}
            >
              <span style={{ fontSize: 9, color: BB.disabled, fontFamily: 'var(--font-mono)' }}>
                Cache Key: {activeJob.cache_key?.slice(0, 16)}...
              </span>
              <button
                onClick={() => setShowEvidenceModal(false)}
                style={{
                  padding: '5px 14px',
                  borderRadius: 6,
                  background: BB.primary,
                  border: `1px solid ${BB.primaryLight}`,
                  color: BB.text,
                  fontSize: 10,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
