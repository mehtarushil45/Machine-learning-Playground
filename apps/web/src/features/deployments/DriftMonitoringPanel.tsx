/**
 * DriftMonitoringPanel — Enterprise Real-Time Telemetry & Data Drift Monitoring
 *
 * Implements Pillar 4 MLOps Requirements:
 * - Real-time Population Stability Index (PSI) calculation
 * - Two-sample Kolmogorov-Smirnov (KS) test statistics and p-values
 * - P50, P95, and P99 serving latency quantiles
 * - Interactive visual side-by-side distribution comparisons (Baseline vs Production)
 * - Automated drift alert banner with 1-click Code Studio retraining trigger
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  ShieldCheck,
  AlertTriangle,
  Activity,
  Zap,
  Clock,
  Sparkles,
  ArrowRight,
  Sliders,
  CheckCircle2,
  Info,
  RefreshCw,
} from 'lucide-react';
import {
  LocalDeploymentService,
  type DeploymentDriftReport,
  type FeatureDriftDetail,
} from '../../services/localDeploymentService';

interface DriftMonitoringPanelProps {
  deploymentId: string;
  onNavigateToStudio?: () => void;
  onShowToast?: (title: string, desc?: string, type?: 'success' | 'info' | 'error') => void;
}

export const DriftMonitoringPanel: React.FC<DriftMonitoringPanelProps> = ({
  deploymentId,
  onNavigateToStudio,
  onShowToast,
}) => {
  const [report, setReport] = useState<DeploymentDriftReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState<string | null>(null);

  const fetchDrift = useCallback(async () => {
    setLoading(true);
    try {
      const data = await LocalDeploymentService.getDriftReport(deploymentId);
      setReport(data);
      if (!selectedFeature && data.features && Object.keys(data.features).length > 0) {
        setSelectedFeature(Object.keys(data.features)[0]);
      }
    } catch (err: any) {
      onShowToast?.('Monitoring Error', err?.message || 'Failed to fetch drift report', 'error');
    } finally {
      setLoading(false);
    }
  }, [deploymentId, selectedFeature, onShowToast]);

  useEffect(() => {
    fetchDrift();
  }, [fetchDrift]);

  const handleSimulateDrift = async () => {
    setSimulating(true);
    try {
      const simData = await LocalDeploymentService.simulateDrift(deploymentId, 3.0);
      setReport(simData);
      if (simData.drifted_features.length > 0) {
        setSelectedFeature(simData.drifted_features[0]);
      }
      onShowToast?.('Drift Injected', 'Simulated 50 production inferences with distribution shift.', 'info');
    } catch (err: any) {
      onShowToast?.('Simulation Failed', err?.message || 'Could not simulate drift', 'error');
    } finally {
      setSimulating(false);
    }
  };

  const activeFeatureDetail: FeatureDriftDetail | null =
    selectedFeature && report?.features ? report.features[selectedFeature] || null : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ── Header Controls ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          padding: '14px 18px',
          background: 'rgba(18, 14, 34, 0.7)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Activity size={18} color="#38BDF8" />
          <span style={{ fontSize: 14, fontWeight: 700, color: '#F1F5F9', letterSpacing: '0.02em' }}>
            Production Telemetry & Drift Guardrails
          </span>
          {report && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '3px 10px',
                borderRadius: 20,
                fontSize: 11,
                fontWeight: 700,
                background:
                  report.overall_status === 'CRITICAL_DRIFT'
                    ? 'rgba(239, 68, 68, 0.15)'
                    : report.overall_status === 'MODERATE_DRIFT'
                    ? 'rgba(245, 158, 11, 0.15)'
                    : 'rgba(16, 185, 129, 0.15)',
                color:
                  report.overall_status === 'CRITICAL_DRIFT'
                    ? '#F87171'
                    : report.overall_status === 'MODERATE_DRIFT'
                    ? '#FBBF24'
                    : '#34D399',
                border: `1px solid ${
                  report.overall_status === 'CRITICAL_DRIFT'
                    ? 'rgba(239, 68, 68, 0.3)'
                    : report.overall_status === 'MODERATE_DRIFT'
                    ? 'rgba(245, 158, 11, 0.3)'
                    : 'rgba(16, 185, 129, 0.3)'
                }`,
              }}
            >
              {report.overall_status === 'CRITICAL_DRIFT' ? (
                <AlertTriangle size={12} />
              ) : report.overall_status === 'MODERATE_DRIFT' ? (
                <Sliders size={12} />
              ) : (
                <ShieldCheck size={12} />
              )}
              {report.overall_status === 'CRITICAL_DRIFT'
                ? 'CRITICAL DRIFT'
                : report.overall_status === 'MODERATE_DRIFT'
                ? 'MODERATE SHIFT'
                : 'STABLE'}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={handleSimulateDrift}
            disabled={simulating || loading}
            title="Simulate 50 production inferences with distribution shift to test guardrails"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              borderRadius: 6,
              background: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              color: '#FBBF24',
              fontSize: 12,
              fontWeight: 600,
              cursor: simulating || loading ? 'not-allowed' : 'pointer',
              transition: 'all 150ms ease',
            }}
          >
            <Sparkles size={13} />
            {simulating ? 'Simulating...' : 'Simulate Drift'}
          </button>

          <button
            onClick={fetchDrift}
            disabled={loading}
            title="Refresh drift statistics"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '6px 12px',
              borderRadius: 6,
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: '#E2E8F0',
              fontSize: 12,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Critical Drift Warning Banner ── */}
      {report?.overall_status === 'CRITICAL_DRIFT' && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 14,
            padding: '14px 18px',
            borderRadius: 10,
            background: 'linear-gradient(90deg, rgba(239, 68, 68, 0.16) 0%, rgba(136, 19, 55, 0.22) 100%)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: 'rgba(239, 68, 68, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#EF4444',
                flexShrink: 0,
              }}
            >
              <AlertTriangle size={18} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#FCA5A5' }}>
                Automated Retraining Alert: Significant Data Drift Detected
              </div>
              <div style={{ fontSize: 12, color: '#E2E8F0', marginTop: 2 }}>
                {report.recommendation}
              </div>
            </div>
          </div>

          {onNavigateToStudio && (
            <button
              onClick={onNavigateToStudio}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 14px',
                borderRadius: 6,
                background: '#EF4444',
                border: 'none',
                color: '#FFFFFF',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 0 12px rgba(239, 68, 68, 0.4)',
              }}
            >
              <span>Trigger Retrain in Code Studio</span>
              <ArrowRight size={13} />
            </button>
          )}
        </motion.div>
      )}

      {/* ── Telemetry Scorecards ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
        }}
      >
        <div
          style={{
            padding: '14px 16px',
            borderRadius: 10,
            background: 'rgba(15, 23, 42, 0.65)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#94A3B8', fontSize: 11, fontWeight: 600 }}>
            <Clock size={13} color="#38BDF8" />
            P50 LATENCY
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#F8FAFC', marginTop: 6 }}>
            {report?.telemetry?.p50_ms ? `${report.telemetry.p50_ms} ms` : '—'}
          </div>
          <div style={{ fontSize: 10, color: '#64748B', marginTop: 4 }}>Median response duration</div>
        </div>

        <div
          style={{
            padding: '14px 16px',
            borderRadius: 10,
            background: 'rgba(15, 23, 42, 0.65)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#94A3B8', fontSize: 11, fontWeight: 600 }}>
            <Zap size={13} color="#F59E0B" />
            P95 LATENCY
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#F8FAFC', marginTop: 6 }}>
            {report?.telemetry?.p95_ms ? `${report.telemetry.p95_ms} ms` : '—'}
          </div>
          <div style={{ fontSize: 10, color: '#64748B', marginTop: 4 }}>95th percentile threshold</div>
        </div>

        <div
          style={{
            padding: '14px 16px',
            borderRadius: 10,
            background: 'rgba(15, 23, 42, 0.65)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#94A3B8', fontSize: 11, fontWeight: 600 }}>
            <AlertTriangle size={13} color="#EC4899" />
            P99 LATENCY
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#F8FAFC', marginTop: 6 }}>
            {report?.telemetry?.p99_ms ? `${report.telemetry.p99_ms} ms` : '—'}
          </div>
          <div style={{ fontSize: 10, color: '#64748B', marginTop: 4 }}>Tail latency worst-case</div>
        </div>

        <div
          style={{
            padding: '14px 16px',
            borderRadius: 10,
            background: 'rgba(15, 23, 42, 0.65)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#94A3B8', fontSize: 11, fontWeight: 600 }}>
            <CheckCircle2 size={13} color="#10B981" />
            SUCCESS RATE
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#10B981', marginTop: 6 }}>
            {report?.telemetry?.success_rate !== undefined ? `${report.telemetry.success_rate}%` : '100%'}
          </div>
          <div style={{ fontSize: 10, color: '#64748B', marginTop: 4 }}>
            {report?.telemetry?.total_requests || 0} total requests served
          </div>
        </div>
      </div>

      {/* ── Insufficient Data Accumulation Banner ── */}
      {report?.insufficient_data && (
        <div
          style={{
            padding: 24,
            borderRadius: 10,
            background: 'rgba(56, 189, 248, 0.06)',
            border: '1px solid rgba(56, 189, 248, 0.2)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: 12,
          }}
        >
          <Info size={28} color="#38BDF8" />
          <div style={{ fontSize: 14, fontWeight: 700, color: '#F1F5F9' }}>
            Production Inference Data is Accumulating
          </div>
          <div style={{ fontSize: 12.5, color: '#94A3B8', maxWidth: 540 }}>
            Drift calculation requires at least {report.min_required} production inference records to ensure
            statistical confidence (currently {report.sample_count} recorded). Run single predictions, execute a
            batch CSV, or click <strong>Simulate Drift</strong> to preview the statistical engine.
          </div>
          <button
            onClick={handleSimulateDrift}
            disabled={simulating}
            style={{
              marginTop: 4,
              padding: '8px 16px',
              borderRadius: 6,
              background: '#0284C7',
              border: 'none',
              color: '#FFF',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {simulating ? 'Simulating Inferences...' : 'Simulate 50 Inferences Now'}
          </button>
        </div>
      )}

      {/* ── Feature Drift Table & Distribution Comparison Grid ── */}
      {report && !report.insufficient_data && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16 }}>
          {/* Left: Feature Drift Breakdown Table */}
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.65)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 10,
              padding: '16px',
              overflow: 'hidden',
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: '#F1F5F9', marginBottom: 12 }}>
              Feature Drift Matrix (PSI & Kolmogorov-Smirnov)
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#64748B', textAlign: 'left' }}>
                    <th style={{ padding: '8px 6px' }}>Feature</th>
                    <th style={{ padding: '8px 6px' }}>Type</th>
                    <th style={{ padding: '8px 6px' }}>PSI</th>
                    <th style={{ padding: '8px 6px' }}>KS p-value</th>
                    <th style={{ padding: '8px 6px' }}>Status</th>
                    <th style={{ padding: '8px 6px', textAlign: 'right' }}>Inspect</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(report.features).map(([featName, feat]) => {
                    const isSelected = selectedFeature === featName;
                    const statusColor =
                      feat.status === 'CRITICAL'
                        ? '#EF4444'
                        : feat.status === 'MODERATE'
                        ? '#F59E0B'
                        : '#10B981';

                    return (
                      <tr
                        key={featName}
                        onClick={() => setSelectedFeature(featName)}
                        style={{
                          borderBottom: '1px solid rgba(255,255,255,0.04)',
                          background: isSelected ? 'rgba(56, 189, 248, 0.08)' : 'transparent',
                          cursor: 'pointer',
                          transition: 'background 120ms ease',
                        }}
                      >
                        <td style={{ padding: '10px 6px', fontWeight: 600, color: '#F1F5F9' }}>
                          {featName}
                        </td>
                        <td style={{ padding: '10px 6px' }}>
                          <span
                            style={{
                              fontSize: 9.5,
                              fontWeight: 700,
                              padding: '2px 5px',
                              borderRadius: 3,
                              background: feat.type === 'numeric' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(168, 85, 247, 0.15)',
                              color: feat.type === 'numeric' ? '#38BDF8' : '#C084FC',
                            }}
                          >
                            {feat.type === 'numeric' ? 'NUM' : 'CAT'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 6px', fontFamily: 'monospace', fontWeight: 700, color: statusColor }}>
                          {feat.psi.toFixed(3)}
                        </td>
                        <td style={{ padding: '10px 6px', fontFamily: 'monospace', color: '#94A3B8' }}>
                          {feat.p_value !== undefined ? feat.p_value.toFixed(3) : '—'}
                        </td>
                        <td style={{ padding: '10px 6px' }}>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              padding: '2px 7px',
                              borderRadius: 4,
                              background: `${statusColor}22`,
                              color: statusColor,
                              border: `1px solid ${statusColor}44`,
                            }}
                          >
                            {feat.status}
                          </span>
                        </td>
                        <td style={{ padding: '10px 6px', textAlign: 'right' }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedFeature(featName);
                            }}
                            style={{
                              padding: '3px 8px',
                              borderRadius: 4,
                              background: isSelected ? '#0284C7' : 'rgba(255,255,255,0.08)',
                              border: 'none',
                              color: '#FFF',
                              fontSize: 10,
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            {isSelected ? 'Viewing' : 'Inspect'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right: Comparative Distribution Histogram */}
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.65)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 10,
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#F1F5F9' }}>
                Distribution Shift: <span style={{ color: '#38BDF8' }}>{selectedFeature}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 10.5, color: '#94A3B8' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: '#38BDF8' }} />
                  Training Baseline %
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: '#F59E0B' }} />
                  Live Production %
                </div>
              </div>
            </div>

            {activeFeatureDetail ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                <div style={{ fontSize: 11, color: '#94A3B8' }}>
                  {activeFeatureDetail.type === 'numeric'
                    ? `Baseline Mean: ${activeFeatureDetail.baseline_mean ?? '—'} | Production Mean: ${activeFeatureDetail.current_mean ?? '—'}`
                    : `Baseline Mode: ${activeFeatureDetail.baseline_mode ?? '—'}`}
                </div>

                {/* Comparative Bar Chart */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    maxHeight: 280,
                    overflowY: 'auto',
                    paddingRight: 4,
                  }}
                >
                  {activeFeatureDetail.distribution_comparison.map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#94A3B8' }}>
                          <span style={{ fontFamily: 'monospace' }}>{item.bin}</span>
                          <span>
                            Base: <strong>{item.baseline_pct}%</strong> | Prod: <strong>{item.current_pct}%</strong>
                          </span>
                        </div>
                        <div style={{ display: 'flex', height: 8, gap: 2, background: 'rgba(255,255,255,0.04)', borderRadius: 2 }}>
                          {/* Baseline bar */}
                          <div
                            style={{
                              width: `${Math.min(item.baseline_pct, 100)}%`,
                              background: '#38BDF8',
                              borderRadius: 2,
                            }}
                          />
                          {/* Production bar */}
                          <div
                            style={{
                              width: `${Math.min(item.current_pct, 100)}%`,
                              background: activeFeatureDetail.status === 'CRITICAL' ? '#EF4444' : '#F59E0B',
                              borderRadius: 2,
                            }}
                          />
                        </div>
                      </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: '#64748B', textAlign: 'center', padding: 24 }}>
                Select a feature from the table to inspect distribution shifts.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
