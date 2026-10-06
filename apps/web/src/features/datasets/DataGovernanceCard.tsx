import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Check,
  Database,
  Hash,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Split,
  Sparkles,
  Zap,
} from 'lucide-react';
import type { DataGovernanceReport, DatasetProfile } from '../../types/dataset';

interface DataGovernanceCardProps {
  profile: DatasetProfile;
}

export const DataGovernanceCard: React.FC<DataGovernanceCardProps> = ({ profile }) => {
  const [copiedHash, setCopiedHash] = useState(false);
  const [activeTab, setActiveTab] = useState<'leakage' | 'multicollinearity' | 'hygiene' | 'imputation'>('leakage');

  const governance: DataGovernanceReport = profile.governance || {
    has_leakage: false,
    leaked_features: [],
    multicollinear_pairs: [],
    constant_columns: [],
    identifier_columns: [],
    imputation_strategies: {},
  };

  const handleCopyHash = () => {
    if (profile.content_hash) {
      navigator.clipboard.writeText(profile.content_hash);
      setCopiedHash(true);
      setTimeout(() => setCopiedHash(false), 2000);
    }
  };

  const leakedCount = governance.leaked_features?.length || 0;
  const collinearCount = governance.multicollinear_pairs?.length || 0;
  const constantCount = governance.constant_columns?.length || 0;
  const idCount = governance.identifier_columns?.length || 0;
  const imputationCount = Object.keys(governance.imputation_strategies || {}).length;

  return (
    <div
      data-testid="data-governance-card"
      style={{
        borderRadius: '12px',
        backgroundColor: '#120E22',
        border: '1px solid rgba(107,92,166,0.25)',
        padding: '20px',
        color: '#F5F1EC',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
      }}
    >
      {/* Top Header & Engine Telemetry */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          borderBottom: '1px solid rgba(107,92,166,0.18)',
          paddingBottom: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, rgba(75,59,124,0.6), rgba(110,20,35,0.6))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(162,138,245,0.3)',
            }}
          >
            <Shield style={{ width: '18px', height: '18px', color: '#C9A24B' }} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, letterSpacing: '-0.01em' }}>
                Governance & Leakage Guardrails
              </h3>
              <span
                style={{
                  fontSize: '11px',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  backgroundColor: 'rgba(34,197,94,0.12)',
                  color: '#4ade80',
                  border: '1px solid rgba(34,197,94,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontWeight: 500,
                }}
              >
                <Zap style={{ width: '10px', height: '10px' }} />
                {profile.engine === 'duckdb' ? 'DuckDB Out-of-Core' : 'Streaming Engine'}
              </span>
            </div>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#9E93B8' }}>
              Zero-copy schema introspection, target leakage guardrails, and immutable audit hashes
            </p>
          </div>
        </div>

        {/* Version & Fingerprint Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              fontSize: '11px',
              padding: '3px 8px',
              borderRadius: '6px',
              backgroundColor: 'rgba(75,59,124,0.3)',
              color: '#F5F1EC',
              border: '1px solid rgba(107,92,166,0.3)',
              textTransform: 'uppercase',
              fontWeight: 600,
              letterSpacing: '0.04em',
            }}
          >
            {(profile.file_format || 'csv').toUpperCase()}
          </span>
          <span
            style={{
              fontSize: '11px',
              padding: '3px 8px',
              borderRadius: '6px',
              backgroundColor: 'rgba(201,162,75,0.15)',
              color: '#F5D061',
              border: '1px solid rgba(201,162,75,0.35)',
              fontWeight: 600,
            }}
          >
            {profile.version || 'v1'}
          </span>
          {profile.content_hash && (
            <button
              type="button"
              onClick={handleCopyHash}
              title="Click to copy immutable SHA-256 hash"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '11px',
                padding: '3px 8px',
                borderRadius: '6px',
                backgroundColor: 'rgba(255,255,255,0.04)',
                color: '#9E93B8',
                border: '1px solid rgba(107,92,166,0.2)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <Hash style={{ width: '11px', height: '11px' }} />
              <span>sha256:{profile.content_hash.slice(0, 8)}...</span>
              {copiedHash ? (
                <Check style={{ width: '11px', height: '11px', color: '#22c55e' }} />
              ) : (
                <Copy style={{ width: '11px', height: '11px' }} />
              )}
            </button>
          )}
        </div>
      </div>

      {/* KPI Toggles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
        <button
          type="button"
          onClick={() => setActiveTab('leakage')}
          style={{
            padding: '10px 12px',
            borderRadius: '8px',
            backgroundColor: activeTab === 'leakage' ? 'rgba(110,20,35,0.25)' : 'rgba(27,21,48,0.5)',
            border: activeTab === 'leakage' ? '1px solid #B23A4E' : '1px solid rgba(107,92,166,0.2)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: '4px',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#9E93B8' }}>
            <ShieldAlert style={{ width: '12px', height: '12px', color: leakedCount > 0 ? '#ef4444' : '#22c55e' }} />
            <span>Target Leakage</span>
          </div>
          <span
            style={{
              fontSize: '16px',
              fontWeight: 700,
              color: leakedCount > 0 ? '#f87171' : '#4ade80',
            }}
          >
            {leakedCount > 0 ? `${leakedCount} Alert` : 'Clear'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('multicollinearity')}
          style={{
            padding: '10px 12px',
            borderRadius: '8px',
            backgroundColor: activeTab === 'multicollinearity' ? 'rgba(201,162,75,0.2)' : 'rgba(27,21,48,0.5)',
            border: activeTab === 'multicollinearity' ? '1px solid #C9A24B' : '1px solid rgba(107,92,166,0.2)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: '4px',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#9E93B8' }}>
            <Split style={{ width: '12px', height: '12px', color: collinearCount > 0 ? '#f59e0b' : '#22c55e' }} />
            <span>Multicollinear</span>
          </div>
          <span
            style={{
              fontSize: '16px',
              fontWeight: 700,
              color: collinearCount > 0 ? '#fbbf24' : '#4ade80',
            }}
          >
            {collinearCount > 0 ? `${collinearCount} Pairs` : 'None'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('hygiene')}
          style={{
            padding: '10px 12px',
            borderRadius: '8px',
            backgroundColor: activeTab === 'hygiene' ? 'rgba(75,59,124,0.3)' : 'rgba(27,21,48,0.5)',
            border: activeTab === 'hygiene' ? '1px solid #6C5CA6' : '1px solid rgba(107,92,166,0.2)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: '4px',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#9E93B8' }}>
            <Database style={{ width: '12px', height: '12px', color: '#9E93B8' }} />
            <span>ID & Zero Variance</span>
          </div>
          <span style={{ fontSize: '16px', fontWeight: 700, color: '#F5F1EC' }}>
            {constantCount + idCount} Columns
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('imputation')}
          style={{
            padding: '10px 12px',
            borderRadius: '8px',
            backgroundColor: activeTab === 'imputation' ? 'rgba(75,59,124,0.3)' : 'rgba(27,21,48,0.5)',
            border: activeTab === 'imputation' ? '1px solid #6C5CA6' : '1px solid rgba(107,92,166,0.2)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: '4px',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#9E93B8' }}>
            <Sparkles style={{ width: '12px', height: '12px', color: '#9E93B8' }} />
            <span>Imputation</span>
          </div>
          <span style={{ fontSize: '16px', fontWeight: 700, color: '#F5F1EC' }}>
            {imputationCount} Rules
          </span>
        </button>
      </div>

      {/* Tab Panels */}
      <div
        style={{
          borderRadius: '8px',
          backgroundColor: '#161228',
          border: '1px solid rgba(107,92,166,0.2)',
          padding: '14px',
          minHeight: '120px',
        }}
      >
        {activeTab === 'leakage' && (
          <div>
            {leakedCount > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(239,68,68,0.12)',
                    border: '1px solid rgba(239,68,68,0.3)',
                    color: '#f87171',
                    fontSize: '12px',
                    fontWeight: 500,
                  }}
                >
                  <AlertTriangle style={{ width: '14px', height: '14px', flexShrink: 0 }} />
                  <span>
                    Auto-flagged {leakedCount} column(s) with &ge;0.90 correlation to target. Severe risk of post-event data leakage.
                  </span>
                </div>
                {governance.leaked_features.map((item, idx) => (
                  <div
                    key={`${item.feature}-${idx}`}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '6px',
                      backgroundColor: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(239,68,68,0.2)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, color: '#F5F1EC', fontSize: '13px' }}>
                        {item.feature}
                      </span>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <span
                          style={{
                            fontSize: '10px',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: item.severity === 'critical' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)',
                            color: item.severity === 'critical' ? '#f87171' : '#fbbf24',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                          }}
                        >
                          {item.severity}
                        </span>
                        <span style={{ fontSize: '12px', color: '#f87171', fontWeight: 600 }}>
                          |r| = {item.correlation}
                        </span>
                      </div>
                    </div>
                    <p style={{ margin: 0, fontSize: '12px', color: '#9E93B8' }}>{item.recommendation}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '12px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(34,197,94,0.08)',
                  border: '1px solid rgba(34,197,94,0.25)',
                  color: '#4ade80',
                }}
              >
                <ShieldCheck style={{ width: '20px', height: '20px', flexShrink: 0 }} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: '13px' }}>Zero Target Leakage Detected</div>
                  <div style={{ fontSize: '12px', color: '#9E93B8' }}>
                    No features exhibit anomalous (&ge;0.98) target correlation. Data is safe for training and validation splits.
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'multicollinearity' && (
          <div>
            {collinearCount > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(245,158,11,0.12)',
                    border: '1px solid rgba(245,158,11,0.3)',
                    color: '#fbbf24',
                    fontSize: '12px',
                    fontWeight: 500,
                  }}
                >
                  <AlertTriangle style={{ width: '14px', height: '14px', flexShrink: 0 }} />
                  <span>
                    Detected {collinearCount} highly redundant feature pair(s) (&ge;0.95 cross-correlation).
                  </span>
                </div>
                {governance.multicollinear_pairs.map((pair, idx) => (
                  <div
                    key={`${pair.feature_a}-${pair.feature_b}-${idx}`}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '6px',
                      backgroundColor: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(245,158,11,0.2)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, color: '#F5F1EC', fontSize: '13px' }}>
                        {pair.feature_a} &harr; {pair.feature_b}
                      </span>
                      <span style={{ fontSize: '12px', color: '#fbbf24', fontWeight: 600 }}>
                        r = {pair.correlation}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '12px', color: '#9E93B8' }}>{pair.recommendation}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '12px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(34,197,94,0.08)',
                  border: '1px solid rgba(34,197,94,0.25)',
                  color: '#4ade80',
                }}
              >
                <CheckCircle2 style={{ width: '20px', height: '20px', flexShrink: 0 }} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: '13px' }}>Feature Independence Confirmed</div>
                  <div style={{ fontSize: '12px', color: '#9E93B8' }}>
                    All numeric feature pairs maintain &lt;0.95 collinearity. No redundant variance inflation.
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'hygiene' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#C9A24B', marginBottom: '6px' }}>
                Zero-Variance (Constant) Columns: {constantCount}
              </div>
              {constantCount > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {governance.constant_columns.map((col) => (
                    <span
                      key={col}
                      style={{
                        padding: '3px 8px',
                        borderRadius: '4px',
                        backgroundColor: 'rgba(239,68,68,0.15)',
                        border: '1px solid rgba(239,68,68,0.3)',
                        fontSize: '11px',
                        color: '#f87171',
                      }}
                    >
                      {col} (0 variance - drop)
                    </span>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: '12px', color: '#9E93B8' }}>
                  No constant columns found; all columns contain signal.
                </div>
              )}
            </div>

            <div style={{ borderTop: '1px solid rgba(107,92,166,0.15)', paddingTop: '10px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#6C5CA6', marginBottom: '6px' }}>
                Identifier / Primary Key Columns: {idCount}
              </div>
              {idCount > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {governance.identifier_columns.map((col) => (
                    <span
                      key={col}
                      style={{
                        padding: '3px 8px',
                        borderRadius: '4px',
                        backgroundColor: 'rgba(107,92,166,0.2)',
                        border: '1px solid rgba(107,92,166,0.3)',
                        fontSize: '11px',
                        color: '#c4b5fd',
                      }}
                    >
                      {col} (auto-excluded from training)
                    </span>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: '12px', color: '#9E93B8' }}>No unique ID columns detected.</div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'imputation' && (
          <div>
            {imputationCount > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ fontSize: '12px', color: '#9E93B8', marginBottom: '4px' }}>
                  Recommended data cleaning &amp; imputation strategies based on distribution skew and missingness:
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px' }}>
                  {Object.entries(governance.imputation_strategies).map(([col, strategy]) => (
                    <div
                      key={col}
                      style={{
                        padding: '8px 10px',
                        borderRadius: '6px',
                        backgroundColor: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(107,92,166,0.2)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span style={{ fontSize: '12px', fontWeight: 500, color: '#F5F1EC' }}>{col}</span>
                      <span
                        style={{
                          fontSize: '11px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          backgroundColor: 'rgba(75,59,124,0.3)',
                          color: '#C9A24B',
                          fontWeight: 600,
                          textTransform: 'capitalize',
                        }}
                      >
                        {strategy.replace('_', ' ')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '12px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(34,197,94,0.08)',
                  border: '1px solid rgba(34,197,94,0.25)',
                  color: '#4ade80',
                }}
              >
                <CheckCircle2 style={{ width: '20px', height: '20px', flexShrink: 0 }} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: '13px' }}>Dataset Fully Imputed</div>
                  <div style={{ fontSize: '12px', color: '#9E93B8' }}>
                    Zero missing values detected. No imputation required prior to pipeline ingestion.
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
