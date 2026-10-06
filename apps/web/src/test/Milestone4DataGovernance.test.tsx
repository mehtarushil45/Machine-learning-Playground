import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DataGovernanceCard } from '../features/datasets/DataGovernanceCard';
import type { DatasetProfile } from '../types/dataset';

describe('Milestone 4: Enterprise Dataset Governance & DuckDB Guardrails', () => {
  const mockProfileWithLeakage: DatasetProfile = {
    dataset_id: 'test-ds-123',
    filename: 'churn_records.parquet',
    row_count: 5000,
    column_count: 8,
    file_format: 'parquet',
    engine: 'duckdb',
    version: 'v1',
    content_hash: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    memory_usage_bytes: 450000,
    duplicate_rows: 12,
    duplicate_columns: 0,
    empty_columns: 0,
    total_missing_values: 35,
    columns: [
      {
        name: 'account_id',
        type: 'identifier',
        nullable: false,
        missing: 0,
        missing_percentage: 0,
        unique: 5000,
        duplicate_count: 0,
        statistics: {},
      },
      {
        name: 'churn_label',
        type: 'numeric',
        nullable: false,
        missing: 0,
        missing_percentage: 0,
        unique: 2,
        duplicate_count: 4998,
        statistics: {},
      },
      {
        name: 'post_event_cancellation_flag',
        type: 'numeric',
        nullable: false,
        missing: 0,
        missing_percentage: 0,
        unique: 2,
        duplicate_count: 4998,
        statistics: {},
      },
      {
        name: 'monthly_charges',
        type: 'numeric',
        nullable: false,
        missing: 0,
        missing_percentage: 0,
        unique: 1200,
        duplicate_count: 3800,
        statistics: {},
      },
      {
        name: 'total_charges_proxy',
        type: 'numeric',
        nullable: false,
        missing: 0,
        missing_percentage: 0,
        unique: 1195,
        duplicate_count: 3805,
        statistics: {},
      },
      {
        name: 'constant_region',
        type: 'categorical',
        nullable: false,
        missing: 0,
        missing_percentage: 0,
        unique: 1,
        duplicate_count: 4999,
        statistics: {},
      },
    ],
    governance: {
      has_leakage: true,
      leaked_features: [
        {
          feature: 'post_event_cancellation_flag',
          target: 'churn_label',
          correlation: 0.9921,
          severity: 'critical',
          recommendation: 'Immediate drop recommended: Extreme target correlation (>= 0.98) indicates post-event data leakage.',
        },
      ],
      multicollinear_pairs: [
        {
          feature_a: 'monthly_charges',
          feature_b: 'total_charges_proxy',
          correlation: 0.9654,
          recommendation: "Features share almost identical variance; consider dropping 'total_charges_proxy' to stabilize coefficients.",
        },
      ],
      constant_columns: ['constant_region'],
      identifier_columns: ['account_id'],
      imputation_strategies: {
        tenure_months: 'median',
        contract_type: 'most_frequent',
      },
    },
  };

  it('renders DuckDB engine badge, file format, and immutable SHA-256 fingerprint', () => {
    render(<DataGovernanceCard profile={mockProfileWithLeakage} />);

    expect(screen.getByText('DuckDB Out-of-Core')).toBeInTheDocument();
    expect(screen.getByText('PARQUET')).toBeInTheDocument();
    expect(screen.getByText('v1')).toBeInTheDocument();
    expect(screen.getByText(/sha256:9f86d081/i)).toBeInTheDocument();
  });

  it('displays critical target leakage alert when correlation >= 0.98', () => {
    render(<DataGovernanceCard profile={mockProfileWithLeakage} />);

    expect(screen.getByText(/post_event_cancellation_flag/i)).toBeInTheDocument();
    expect(screen.getByText(/critical/i)).toBeInTheDocument();
    expect(screen.getByText(/\|r\| = 0.9921/i)).toBeInTheDocument();
    expect(screen.getByText(/Immediate drop recommended/i)).toBeInTheDocument();
  });

  it('switches to multicollinearity tab and displays redundant feature pairs', () => {
    render(<DataGovernanceCard profile={mockProfileWithLeakage} />);

    // Click Multicollinear tab
    const multicollinearTabBtn = screen.getByText('Multicollinear');
    fireEvent.click(multicollinearTabBtn);

    expect(screen.getByText(/monthly_charges ↔ total_charges_proxy/i)).toBeInTheDocument();
    expect(screen.getByText(/r = 0.9654/i)).toBeInTheDocument();
  });

  it('switches to hygiene tab and displays constant and identifier columns', () => {
    render(<DataGovernanceCard profile={mockProfileWithLeakage} />);

    // Click ID & Zero Variance tab
    const hygieneTabBtn = screen.getByText('ID & Zero Variance');
    fireEvent.click(hygieneTabBtn);

    expect(screen.getByText(/constant_region \(0 variance - drop\)/i)).toBeInTheDocument();
    expect(screen.getByText(/account_id \(auto-excluded from training\)/i)).toBeInTheDocument();
  });

  it('switches to imputation tab and displays recommended strategies', () => {
    render(<DataGovernanceCard profile={mockProfileWithLeakage} />);

    // Click Imputation tab
    const imputationTabBtn = screen.getByText('Imputation');
    fireEvent.click(imputationTabBtn);

    expect(screen.getByText('tenure_months')).toBeInTheDocument();
    expect(screen.getByText('median')).toBeInTheDocument();
    expect(screen.getByText('contract_type')).toBeInTheDocument();
    expect(screen.getByText('most frequent')).toBeInTheDocument();
  });

  it('renders green checked state when dataset has zero leakage', () => {
    const cleanProfile: DatasetProfile = {
      ...mockProfileWithLeakage,
      governance: {
        has_leakage: false,
        leaked_features: [],
        multicollinear_pairs: [],
        constant_columns: [],
        identifier_columns: [],
        imputation_strategies: {},
      },
    };

    render(<DataGovernanceCard profile={cleanProfile} />);

    expect(screen.getByText('Zero Target Leakage Detected')).toBeInTheDocument();
    expect(screen.getByText('Clear')).toBeInTheDocument();
  });
});
