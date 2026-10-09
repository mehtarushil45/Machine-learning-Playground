import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  HEADS_UP_RULES,
  evaluateHeadsUpRules,
  calculateWilsonInterval,
  calculateMajorityBaseline,
} from '../features/learning/rules/registry'
import { LearningProjectState } from '../features/learning/rules/types'
import { HeadsUpCardsContainer } from '../features/learning/components/HeadsUpCardsContainer'
import { BaselineDisplay } from '../features/learning/components/BaselineDisplay'
import { LearningModeToggle } from '../features/learning/components/LearningModeToggle'
import { PanelLearningCollapsible } from '../features/learning/components/PanelLearningCollapsible'
import { LearningProvider } from '../features/learning/context/LearningContext'

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

describe('Part B: Heads-Up Rules Registry (Positive & Negative Fixtures)', () => {
  // B1: Identifier column selected as a feature
  describe('Rule B1: Identifier feature', () => {
    const rule = HEADS_UP_RULES.find((r) => r.id === 'rule_identifier_feature')!

    it('positive fixture: fires when identifier column is among selected features', () => {
      const state: LearningProjectState = {
        dataset: {
          fileName: 'users.csv',
          datasetId: 'ds-1',
          columns: ['user_uuid', 'age', 'tenure'],
          rows: [],
          rowCount: 500,
          profile: {
            row_count: 500,
            column_count: 3,
            memory_usage_bytes: 1000,
            duplicate_rows: 0,
            duplicate_columns: 0,
            empty_columns: 0,
            total_missing_values: 0,
            columns: [],
            governance: {
              has_leakage: false,
              leaked_features: [],
              multicollinear_pairs: [],
              constant_columns: [],
              identifier_columns: ['user_uuid'],
              imputation_strategies: {},
            },
          },
        },
        selectedFeatures: ['user_uuid', 'age'],
        selectedTarget: 'churn',
      }
      const res = rule.trigger(state)
      expect(res).not.toBeNull()
      expect(res?.triggered).toBe(true)
      expect(res?.message).toContain('user_uuid')
    })

    it('negative fixture: does not fire on regular features', () => {
      const state: LearningProjectState = {
        dataset: {
          fileName: 'users.csv',
          datasetId: 'ds-1',
          columns: ['age', 'tenure'],
          rows: [],
          rowCount: 500,
          profile: {
            row_count: 500,
            column_count: 2,
            memory_usage_bytes: 1000,
            duplicate_rows: 0,
            duplicate_columns: 0,
            empty_columns: 0,
            total_missing_values: 0,
            columns: [],
            governance: {
              has_leakage: false,
              leaked_features: [],
              multicollinear_pairs: [],
              constant_columns: [],
              identifier_columns: [],
              imputation_strategies: {},
            },
          },
        },
        selectedFeatures: ['age', 'tenure'],
        selectedTarget: 'churn',
      }
      const res = rule.trigger(state)
      expect(res).toBeNull()
    })
  })

  // B2: Target leakage
  describe('Rule B2: Target leakage', () => {
    const rule = HEADS_UP_RULES.find((r) => r.id === 'rule_target_leakage')!

    it('positive fixture 1: fires when target column itself is in features', () => {
      const state: LearningProjectState = {
        dataset: null,
        selectedFeatures: ['churn', 'age'],
        selectedTarget: 'churn',
      }
      const res = rule.trigger(state)
      expect(res).not.toBeNull()
      expect(res?.triggered).toBe(true)
      expect(res?.message).toContain("target column 'churn' was included")
    })

    it('positive fixture 2: fires when profiler flags critical correlation >= 0.90', () => {
      const state: LearningProjectState = {
        dataset: {
          fileName: 'churn.csv',
          datasetId: 'ds-2',
          columns: ['post_cancel_fee', 'age'],
          rows: [],
          rowCount: 1000,
          profile: {
            row_count: 1000,
            column_count: 2,
            memory_usage_bytes: 2000,
            duplicate_rows: 0,
            duplicate_columns: 0,
            empty_columns: 0,
            total_missing_values: 0,
            columns: [],
            governance: {
              has_leakage: true,
              leaked_features: [
                {
                  feature: 'post_cancel_fee',
                  target: 'churn',
                  correlation: 0.99,
                  severity: 'critical',
                  recommendation: 'Drop immediately',
                },
              ],
              multicollinear_pairs: [],
              constant_columns: [],
              identifier_columns: [],
              imputation_strategies: {},
            },
          },
        },
        selectedFeatures: ['post_cancel_fee', 'age'],
        selectedTarget: 'churn',
      }
      const res = rule.trigger(state)
      expect(res).not.toBeNull()
      expect(res?.triggered).toBe(true)
      expect(res?.message).toContain('post_cancel_fee')
    })

    it('negative fixture: does not fire on normal correlated features (r=0.35)', () => {
      const state: LearningProjectState = {
        dataset: {
          fileName: 'clean.csv',
          datasetId: 'ds-3',
          columns: ['age', 'tenure'],
          rows: [],
          rowCount: 1000,
          profile: {
            row_count: 1000,
            column_count: 2,
            memory_usage_bytes: 2000,
            duplicate_rows: 0,
            duplicate_columns: 0,
            empty_columns: 0,
            total_missing_values: 0,
            columns: [],
            governance: {
              has_leakage: false,
              leaked_features: [],
              multicollinear_pairs: [],
              constant_columns: [],
              identifier_columns: [],
              imputation_strategies: {},
            },
          },
        },
        selectedFeatures: ['age', 'tenure'],
        selectedTarget: 'churn',
      }
      const res = rule.trigger(state)
      expect(res).toBeNull()
    })
  })

  // B3: Suspiciously high test score
  describe('Rule B3: Suspiciously high score', () => {
    const rule = HEADS_UP_RULES.find((r) => r.id === 'rule_suspicious_high_score')!

    it('positive fixture: fires info card when test accuracy >= 99%', () => {
      const state: LearningProjectState = {
        dataset: null,
        selectedFeatures: ['f1'],
        selectedTarget: 't',
        activeJob: {
          job_id: 'j-1',
          status: 'COMPLETED',
          metrics: { accuracy: 0.996 },
        } as any,
      }
      const res = rule.trigger(state)
      expect(res).not.toBeNull()
      expect(res?.triggered).toBe(true)
      expect(res?.message).toContain('99.6%')
      expect(rule.severity).toBe('info')
    })

    it('negative fixture: does not fire on realistic test score (84%)', () => {
      const state: LearningProjectState = {
        dataset: null,
        selectedFeatures: ['f1'],
        selectedTarget: 't',
        activeJob: {
          job_id: 'j-2',
          status: 'COMPLETED',
          metrics: { accuracy: 0.84 },
        } as any,
      }
      expect(rule.trigger(state)).toBeNull()
    })
  })

  // B4: Baseline comparison
  describe('Rule B4: Baseline comparison on imbalanced data', () => {
    const rule = HEADS_UP_RULES.find((r) => r.id === 'rule_baseline_comparison')!

    it('positive fixture: fires when accuracy barely beats 95% majority baseline', () => {
      const state: LearningProjectState = {
        dataset: null,
        selectedFeatures: ['f1'],
        selectedTarget: 'default',
        taskType: 'classification',
        classDistribution: { non_default: 1900, default: 100 }, // 95/5
        activeJob: {
          job_id: 'j-3',
          status: 'COMPLETED',
          metrics: { accuracy: 0.952 }, // Barely beats 95.0%
        } as any,
      }
      const res = rule.trigger(state)
      expect(res).not.toBeNull()
      expect(res?.triggered).toBe(true)
      expect(res?.message).toContain('95.2%')
      expect(res?.message).toContain('95%')
    })

    it('negative fixture: does not fire when model significantly outperforms baseline', () => {
      const state: LearningProjectState = {
        dataset: null,
        selectedFeatures: ['f1'],
        selectedTarget: 'target',
        taskType: 'classification',
        classDistribution: { class_0: 500, class_1: 500 }, // 50/50
        activeJob: {
          job_id: 'j-4',
          status: 'COMPLETED',
          metrics: { accuracy: 0.88 }, // Far above 50%
        } as any,
      }
      expect(rule.trigger(state)).toBeNull()
    })
  })

  // B5: Small test set Wilson interval
  describe('Rule B5: Small test set', () => {
    const rule = HEADS_UP_RULES.find((r) => r.id === 'rule_small_test_set')!

    it('positive fixture: fires and computes Wilson interval for N=30', () => {
      const state: LearningProjectState = {
        dataset: null,
        selectedFeatures: ['f1'],
        selectedTarget: 't',
        testSampleCount: 30,
        activeJob: {
          job_id: 'j-5',
          status: 'COMPLETED',
          metrics: { accuracy: 0.80 },
        } as any,
      }
      const res = rule.trigger(state)
      expect(res).not.toBeNull()
      expect(res?.triggered).toBe(true)
      expect(res?.message).toContain('Wilson confidence interval')
      expect(res?.details?.lower).toBeDefined()
      expect(res?.details?.upper).toBeDefined()
      expect(res?.details?.lower).toBeLessThan(0.80)
    })

    it('negative fixture: does not fire for large test set (N=500)', () => {
      const state: LearningProjectState = {
        dataset: null,
        selectedFeatures: ['f1'],
        selectedTarget: 't',
        testSampleCount: 500,
        activeJob: {
          job_id: 'j-6',
          status: 'COMPLETED',
          metrics: { accuracy: 0.85 },
        } as any,
      }
      expect(rule.trigger(state)).toBeNull()
    })
  })

  // B6: Overfitting gap
  describe('Rule B6: Overfitting train vs test gap', () => {
    const rule = HEADS_UP_RULES.find((r) => r.id === 'rule_overfitting_gap')!

    it('positive fixture: fires when gap >= 15%', () => {
      const state: LearningProjectState = {
        dataset: null,
        selectedFeatures: ['f1'],
        selectedTarget: 't',
        activeJob: {
          job_id: 'j-7',
          status: 'COMPLETED',
          metrics: { train_accuracy: 0.95, test_accuracy: 0.72 }, // gap = 23%
        } as any,
      }
      const res = rule.trigger(state)
      expect(res).not.toBeNull()
      expect(res?.triggered).toBe(true)
      expect(res?.message).toContain('23.0 percentage points')
    })

    it('negative fixture: does not fire on close train and test metrics (gap = 3%)', () => {
      const state: LearningProjectState = {
        dataset: null,
        selectedFeatures: ['f1'],
        selectedTarget: 't',
        activeJob: {
          job_id: 'j-8',
          status: 'COMPLETED',
          metrics: { train_accuracy: 0.85, test_accuracy: 0.82 },
        } as any,
      }
      expect(rule.trigger(state)).toBeNull()
    })
  })

  // B7: Preprocessing leakage in code
  describe('Rule B7: Preprocessing leakage in code', () => {
    const rule = HEADS_UP_RULES.find((r) => r.id === 'rule_preprocessing_leakage')!

    it('positive fixture: fires when scaler is fit before train_test_split', () => {
      const badCode = `
const scaler = StandardScaler();
scaler.fit(df);
train_test_split(X, y);
`
      const state: LearningProjectState = {
        dataset: null,
        selectedFeatures: [],
        selectedTarget: null,
        code: badCode,
      }
      const res = rule.trigger(state)
      expect(res).not.toBeNull()
      expect(res?.triggered).toBe(true)
      expect(res?.message).toContain('StandardScaler')
    })

    it('negative fixture: does not fire on clean code splitting first', () => {
      const cleanCode = `
train_test_split(X, y);
pipeline = Pipeline([('scaler', StandardScaler())]);
pipeline.fit(X_train, y_train);
`
      const state: LearningProjectState = {
        dataset: null,
        selectedFeatures: [],
        selectedTarget: null,
        code: cleanCode,
      }
      expect(rule.trigger(state)).toBeNull()
    })
  })

  // B8: Test-set reuse
  describe('Rule B8: Test-set reuse across runs', () => {
    const rule = HEADS_UP_RULES.find((r) => r.id === 'rule_test_set_reuse')!

    it('positive fixture: fires when >= 3 runs evaluated on same split', () => {
      const state: LearningProjectState = {
        dataset: null,
        selectedFeatures: [],
        selectedTarget: null,
        jobHistory: [
          { job_id: 'j-1', status: 'COMPLETED' },
          { job_id: 'j-2', status: 'COMPLETED' },
          { job_id: 'j-3', status: 'COMPLETED' },
        ] as any[],
      }
      const res = rule.trigger(state)
      expect(res).not.toBeNull()
      expect(res?.triggered).toBe(true)
      expect(res?.message).toContain('3 runs have been evaluated')
    })

    it('negative fixture: does not fire on initial run (1 job)', () => {
      const state: LearningProjectState = {
        dataset: null,
        selectedFeatures: [],
        selectedTarget: null,
        jobHistory: [{ job_id: 'j-1', status: 'COMPLETED' }] as any[],
      }
      expect(rule.trigger(state)).toBeNull()
    })
  })

  // B9: Clean pipeline produces ZERO cards
  describe('Rule B9: Zero false alarms on clean pipeline', () => {
    it('clean pipeline state on clean dataset produces 0 cards', () => {
      const cleanState: LearningProjectState = {
        dataset: {
          fileName: 'clean.csv',
          datasetId: 'ds-clean',
          columns: ['feature_a', 'feature_b', 'target'],
          rows: [],
          rowCount: 1000,
          profile: {
            row_count: 1000,
            column_count: 3,
            memory_usage_bytes: 5000,
            duplicate_rows: 0,
            duplicate_columns: 0,
            empty_columns: 0,
            total_missing_values: 0,
            columns: [],
            governance: {
              has_leakage: false,
              leaked_features: [],
              multicollinear_pairs: [],
              constant_columns: [],
              identifier_columns: [],
              imputation_strategies: {},
            },
          },
        },
        selectedFeatures: ['feature_a', 'feature_b'],
        selectedTarget: 'target',
        taskType: 'classification',
        classDistribution: { '0': 500, '1': 500 },
        testSampleCount: 200,
        code: `
train_test_split(X, y);
pipeline = Pipeline([('scaler', StandardScaler())]);
pipeline.fit(X_train, y_train);
`,
        activeJob: {
          job_id: 'clean-job-1',
          status: 'COMPLETED',
          metrics: {
            train_accuracy: 0.86,
            test_accuracy: 0.83,
            accuracy: 0.83,
          },
        } as any,
        jobHistory: [{ job_id: 'clean-job-1', status: 'COMPLETED' }] as any[],
      }

      const cards = evaluateHeadsUpRules(cleanState)
      expect(cards).toHaveLength(0)
    })
  })
})

describe('Learning UI Components Integration', () => {
  it('renders HeadsUpCardsContainer and dismisses card on click', () => {
    const mockCard = {
      id: 'c1',
      rule_id: 'rule_target_leakage',
      title: 'Target Leakage Warning',
      severity: 'warning' as const,
      lesson_id: 'lesson-03-features-target-leakage',
      message: 'Feature cancellation_fee has near-perfect correlation with target.',
      why_it_matters: 'Post-event information is not available in production.',
      how_to_fix: 'Drop this feature from input selection.',
    }

    render(
      <LearningProvider>
        <HeadsUpCardsContainer cards={[mockCard]} />
      </LearningProvider>,
    )

    expect(screen.getByText('Target Leakage Warning')).toBeInTheDocument()
    expect(screen.getByText(/Feature cancellation_fee has near-perfect/)).toBeInTheDocument()
    expect(screen.getByText('Post-event information is not available in production.')).toBeInTheDocument()
  })

  it('renders BaselineDisplay with majority baseline and warning on imbalanced data', () => {
    render(
      <LearningProvider>
        <BaselineDisplay
          taskType="classification"
          modelMetricValue={0.952}
          classCounts={{ majority: 950, minority: 50 }}
          totalTestSamples={50}
        />
      </LearningProvider>,
    )

    expect(screen.getByText(/Majority Class Baseline \(95%\)/)).toBeInTheDocument()
    expect(screen.getByText(/95.2%/)).toBeInTheDocument()
    expect(screen.getByText(/Wilson Score CI/)).toBeInTheDocument()
    expect(screen.getByText(/Warning: Model accuracy barely beats the majority-class baseline/)).toBeInTheDocument()
  })

  it('renders LearningModeToggle and toggles state', () => {
    render(
      <LearningProvider>
        <LearningModeToggle />
      </LearningProvider>,
    )

    const toggleBtn = screen.getByTestId('learning-mode-toggle')
    expect(toggleBtn).toBeInTheDocument()
    fireEvent.click(toggleBtn)
  })

  it('renders PanelLearningCollapsible when learningMode is active', () => {
    render(
      <LearningProvider>
        <PanelLearningCollapsible
          title="Dataset Profiling & Governance"
          concept="Inspect column types and null counts before model fitting."
          details="Zero-copy out-of-core profiling surfaces anomalies early."
        />
      </LearningProvider>,
    )

    expect(screen.getByText('What is this? Dataset Profiling & Governance')).toBeInTheDocument()
    const expandBtn = screen.getByRole('button', { name: /What is this\? Dataset Profiling & Governance/i })
    fireEvent.click(expandBtn)
    expect(screen.getByText('Inspect column types and null counts before model fitting.')).toBeInTheDocument()
  })
})
