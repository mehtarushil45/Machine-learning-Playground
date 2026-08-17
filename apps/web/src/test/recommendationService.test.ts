import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchSupportedAlgorithms,
  startRecommendation,
  getRecommendationJob,
  cancelRecommendation,
} from '../services/recommendationService';
import { apiClient } from '../services/apiClient';
import type { RecommendationRequest } from '../types/recommendation';

vi.mock('../services/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe('recommendationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetchSupportedAlgorithms calls /algorithms/supported and returns algorithm list', async () => {
    const mockAlgorithms = [
      {
        id: 'random_forest_classifier',
        name: 'Random Forest',
        category: 'tree',
        task_type: 'classification',
        is_available: true,
        expected_cost: 'medium',
        supports_sparse: false,
        requires_scaling: false,
      },
    ];

    vi.mocked(apiClient.get).mockResolvedValueOnce({
      total: 1,
      algorithms: mockAlgorithms,
    });

    const result = await fetchSupportedAlgorithms();
    expect(apiClient.get).toHaveBeenCalledWith('/algorithms/supported', { signal: undefined });
    expect(result).toEqual(mockAlgorithms);
  });

  it('startRecommendation posts payload to /datasets/:id/recommendations', async () => {
    const payload: RecommendationRequest = {
      target_column: 'target',
      feature_columns: ['f1', 'f2'],
      cv_folds: 5,
      train_test_split: 0.8,
      random_seed: 42,
    };

    const mockResponse = {
      job: {
        job_id: 'job-123',
        dataset_id: 'ds-123',
        organisation_id: 'org-123',
        status: 'QUEUED',
        stage: 'Queued',
        progress: 0,
        cache_key: 'abc',
        candidates: [],
        warnings: [],
        exclusions: [],
        reason_codes: [],
        limitations: [],
      },
      cached: false,
      deduplicated: false,
    };

    vi.mocked(apiClient.post).mockResolvedValueOnce(mockResponse);

    const result = await startRecommendation('ds-123', payload);
    expect(apiClient.post).toHaveBeenCalledWith(
      '/datasets/ds-123/recommendations',
      payload,
      { signal: undefined },
    );
    expect(result).toEqual(mockResponse);
  });

  it('getRecommendationJob polls /datasets/:id/recommendations/:jobId', async () => {
    const mockJob = {
      job_id: 'job-123',
      dataset_id: 'ds-123',
      organisation_id: 'org-123',
      status: 'VERIFYING',
      stage: 'Verification Tier Evaluation',
      progress: 75,
      cache_key: 'abc',
      candidates: [],
      warnings: [],
      exclusions: [],
      reason_codes: [],
      limitations: [],
    };

    vi.mocked(apiClient.get).mockResolvedValueOnce(mockJob);

    const result = await getRecommendationJob('ds-123', 'job-123');
    expect(apiClient.get).toHaveBeenCalledWith(
      '/datasets/ds-123/recommendations/job-123',
      { signal: undefined },
    );
    expect(result.status).toBe('VERIFYING');
    expect(result.progress).toBe(75);
  });

  it('cancelRecommendation calls cancel endpoint', async () => {
    const mockCancelledJob = {
      job_id: 'job-123',
      dataset_id: 'ds-123',
      organisation_id: 'org-123',
      status: 'CANCELLED',
      stage: 'Cancelled',
      progress: 0,
      cache_key: 'abc',
      candidates: [],
      warnings: [],
      exclusions: [],
      reason_codes: [],
      limitations: [],
    };

    vi.mocked(apiClient.post).mockResolvedValueOnce(mockCancelledJob);

    const result = await cancelRecommendation('ds-123', 'job-123');
    expect(apiClient.post).toHaveBeenCalledWith(
      '/datasets/ds-123/recommendations/job-123/cancel',
      {},
      { signal: undefined },
    );
    expect(result.status).toBe('CANCELLED');
  });
});
