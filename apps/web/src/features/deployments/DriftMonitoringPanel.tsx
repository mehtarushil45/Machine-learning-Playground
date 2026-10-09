/**
 * DriftMonitoringPanel — Enterprise Real-Time Telemetry & Data Drift Monitoring
 *
 * Implements Pillar 4 MLOps Requirements:
 * - Proper Statistical Test Selection (B1):
 *   - Numeric small (< 1000): Kolmogorov-Smirnov (KS test with p-value)
 *   - Numeric large (>= 1000): Wasserstein distance (Earth Mover's Distance)
 *   - Categorical small (< 1000): Chi-Squared test (never KS!)
 *   - Categorical large (>= 1000): Jensen-Shannon divergence
 *   - Binary: Two-Proportion Z-Test
 *   - Identifier & Temporal columns: Excluded from scoring with visible badges
 * - Decile Bucketing & Documented Smoothing (B2):
 *   - Training baseline decile edges with EPSILON = 0.0001
 * - Minimum-Sample Guard (B3):
 *   - Below required threshold, explicitly displays "Insufficient data (n of N required)"
 * - Importance-Weighted Retraining Alert & Actuals Check (C1, C2):
 *   - Dataset-level summary with share of drifted features and importance-weighted score
 *   - "inputs changed — performance not yet confirmed" alert badge
 * - Rolling Windows Drift-Over-Time (C3)
 * - Retrain Context with Fresh Data Warning (C4)
 * - Simulation Isolation & 1-Click Clear (D1)
 * - Tooltips & Plain-Language Copilot Explanation (D2)
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  HelpCircle,
  X,
  History,
  BarChart2,
  Bot,
} from 'lucide-react';
import {
  LocalDeploymentService,
  type DeploymentDriftReport,
  type FeatureDriftDetail,
  type RollingWindowTrend,
} from '../../services/localDeploymentService';

interface DriftMonitoringPanelProps {
  deploymentId: string;
  onNavigateToStudio?: () => void;
  onShowToast?: (title: string, desc?: string, type?: 'success' | 'info' | 'error') => void;
}

/* ── Tooltip Component ─────────────────────────────────────────────────── */
const Tooltip: React.FC<{ content: string; children: React.ReactNode }> = ({ content, children }) => {
  const [show, setShow] = useState(false);

  return (
    <div
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div
          style={{
            position: 'absolute',
            bottom: '125%',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9999,
            padding: '6px 10px',
            background: '#0F172A',
            color: '#F1F5F9',
            fontSize: 11,
            lineHeight: 1.4,
            fontWeight: 500,
            borderRadius: 6,
            border: '1px solid rgba(255, 255, 255, 0.15)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            whiteSpace: 'normal',
            width: 'max-content',
            maxWidth: 280,
            pointerEvents: 'none',
          }}
        >
          {content}
        </div>
      )}
    </div>
  );
};

export const DriftMonitoringPanel: React.FC<DriftMonitoringPanelProps> = ({
  deploymentId,
  onNavigateToStudio,
  onShowToast,
}) => {
  const [realReport, setRealReport] = useState<DeploymentDriftReport | null>(null);
  const [simulationReport, setSimulationReport] = useState<DeploymentDriftReport | null>(null);
  const [isSimulationMode, setIsSimulationMode] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<'distribution' | 'timeline'>('distribution');
  const [showCopilotExplain, setShowCopilotExplain] = useState(false);

  const report = isSimulationMode ? simulationReport : realReport;

  const fetchDrift = useCallback(async () => {
    setLoading(true);
    try {
      const data = await LocalDeploymentService.getDriftReport(deploymentId, 50);
      setRealReport(data);
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

  // ── D1: SIMULATION ISOLATION & ONE-CLICK CLEAR ───────────────────────────
  const handleSimulateDrift = async (targetFeature?: string) => {
    setSimulating(true);
    try {
      const simData = await LocalDeploymentService.simulateDrift(deploymentId, 3.0, targetFeature);
      setSimulationReport(simData);
      setIsSimulationMode(true);
      if (simData.drifted_features.length > 0) {
        setSelectedFeature(simData.drifted_features[0]);
      }
      onShowToast?.('Simulation Mode Active', 'Generated isolated synthetic preview. Real telemetry untouched.', 'info');
    } catch (err: any) {
      onShowToast?.('Simulation Failed', err?.message || 'Could not simulate drift', 'error');
    } finally {
      setSimulating(false);
    }
  };

  const handleClearSimulation = () => {
    setIsSimulationMode(false);
    setSimulationReport(null);
    if (realReport && realReport.features && Object.keys(realReport.features).length > 0) {
      setSelectedFeature(Object.keys(realReport.features)[0]);
    }
    onShowToast?.('Simulation Cleared', 'Restored live production telemetry view.', 'info');
  };

  // ── C4: TRIGGER RETRAIN IN CODE STUDIO WITH CONTEXT ──────────────────────
  const handleTriggerRetrain = () => {
    if (!report) return;

    const context = report.retrain_context || {
      primary_feature: selectedFeature || 'input',
      severity: report.overall_status,
      importance_weighted_score: report.importance_weighted_drift_score || 0.0,
      guidance: (
        '⚠️ Input Data Drift Detected. Retraining requires fresh production data ' +
        'reflecting the current distribution — retraining on the original historical training dataset cannot fix input drift.'
      ),
    };

    try {
      localStorage.setItem('ml_playground_retrain_drift_context', JSON.stringify(context));
      window.dispatchEvent(new CustomEvent('ml-drift-retrain-trigger', { detail: context }));
    } catch {
      // Ignored if storage is restricted
    }

    onShowToast?.(
      'Retraining Triggered',
      'Context sent to Code Studio. Ensure fresh data reflecting current distribution is loaded.',
      'info'
    );

    if (onNavigateToStudio) {
      onNavigateToStudio();
    }
  };

  const activeFeatureDetail: FeatureDriftDetail | null =
    selectedFeature && report?.features ? report.features[selectedFeature] || null : null;

  const rollingTrends: RollingWindowTrend[] =
    selectedFeature && report?.drift_over_time ? report.drift_over_time[selectedFeature] || [] : [];

  // Plain language Copilot explanation of current feature (D2)
  const copilotExplanation = useMemo(() => {
    if (!activeFeatureDetail) return null;
    const feat = activeFeatureDetail;
    const featName = feat.feature;
    const impPct = feat.importance !== undefined ? (feat.importance * 100).toFixed(1) : '0.0';
    const psiVal = feat.psi.toFixed(3);
    const testDesc = feat.test_display || 'test statistic';

    if (feat.status === 'EXCLUDED') {
      return `Column '${featName}' is flagged as an ${feat.status_display}. It has been excluded from statistical drift scoring to prevent false alarms.`;
    }

    if (feat.status === 'INSUFFICIENT_DATA') {
      return `Feature '${featName}' has recorded ${report?.sample_count || 0} production inferences so far. A minimum of ${report?.min_required || 50} requests is required to establish statistical confidence before calculating drift.`;
    }

    if (feat.status === 'CRITICAL') {
      return `Feature '${featName}' has critically shifted from training baseline: ${testDesc} and PSI of ${psiVal} (deciles bucketed with smoothing constant ε = 0.0001). Because '${featName}' carries a ${impPct}% model importance weight, this shift directly compromises inference reliability. Retraining on fresh production data is strongly recommended.`;
    }

    if (feat.status === 'MODERATE') {
      return `Feature '${featName}' shows moderate distribution shift (PSI = ${psiVal}, ${testDesc}). It carries a ${impPct}% model weight. Continue monitoring closely; no immediate retraining required unless performance drops.`;
    }

    return `Feature '${featName}' is stable and closely aligns with training data (${testDesc}, PSI = ${psiVal} < 0.10). Model predictions remain reliable for this input.`;
  }, [activeFeatureDetail, report]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ── D1: Prominent Simulation Mode Banner (When Active) ── */}
      {isSimulationMode && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
            padding: '12px 18px',
            borderRadius: 10,
            background: 'linear-gradient(90deg, rgba(245, 158, 11, 0.18) 0%, rgba(168, 85, 247, 0.18) 100%)',
            border: '1px solid rgba(245, 158, 11, 0.5)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Sparkles size={18} color="#FBBF24" />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#FDE68A' }}>
                🧪 SIMULATION MODE (Isolated Synthetic Sandbox)
              </div>
              <div style={{ fontSize: 11.5, color: '#E2E8F0', marginTop: 2 }}>
                Viewing simulated production inferences with synthetic distribution shift. Real production telemetry is completely isolated and untouched.
              </div>
            </div>
          </div>

          <button
            onClick={handleClearSimulation}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              borderRadius: 6,
              background: '#F59E0B',
              border: 'none',
              color: '#0B0912',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 0 10px rgba(245, 158, 11, 0.3)',
            }}
          >
            <X size={14} />
            <span>Clear Simulation & Restore Live Telemetry</span>
          </button>
        </motion.div>
      )}

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Activity size={18} color="#38BDF8" />
          <span style={{ fontSize: 14, fontWeight: 700, color: '#F1F5F9', letterSpacing: '0.02em' }}>
            Production Telemetry & Drift Guardrails
          </span>

          {report && (
            <Tooltip content="Health assessment based on importance-weighted distribution shift and statistical confidence.">
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
                    report.insufficient_data
                      ? 'rgba(56, 189, 248, 0.15)'
                      : report.overall_status === 'CRITICAL_DRIFT'
                      ? 'rgba(239, 68, 68, 0.15)'
                      : report.overall_status === 'MODERATE_SHIFT'
                      ? 'rgba(245, 158, 11, 0.15)'
                      : 'rgba(16, 185, 129, 0.15)',
                  color:
                    report.insufficient_data
                      ? '#38BDF8'
                      : report.overall_status === 'CRITICAL_DRIFT'
                      ? '#F87171'
                      : report.overall_status === 'MODERATE_SHIFT'
                      ? '#FBBF24'
                      : '#34D399',
                  border: `1px solid ${
                    report.insufficient_data
                      ? 'rgba(56, 189, 248, 0.3)'
                      : report.overall_status === 'CRITICAL_DRIFT'
                      ? 'rgba(239, 68, 68, 0.3)'
                      : report.overall_status === 'MODERATE_SHIFT'
                      ? 'rgba(245, 158, 11, 0.3)'
                      : 'rgba(16, 185, 129, 0.3)'
                  }`,
                }}
              >
                {report.insufficient_data ? (
                  <Info size={12} />
                ) : report.overall_status === 'CRITICAL_DRIFT' ? (
                  <AlertTriangle size={12} />
                ) : report.overall_status === 'MODERATE_SHIFT' ? (
                  <Sliders size={12} />
                ) : (
                  <ShieldCheck size={12} />
                )}
                {report.insufficient_data
                  ? `Insufficient data (${report.sample_count} of ${report.min_required} required)`
                  : report.overall_status === 'CRITICAL_DRIFT'
                  ? 'CRITICAL DRIFT'
                  : report.overall_status === 'MODERATE_SHIFT'
                  ? 'MODERATE SHIFT'
                  : 'STABLE'}
              </span>
            </Tooltip>
          )}

          {/* C2: Unconfirmed Performance Badge */}
          {report?.alert_badge_label && (
            <Tooltip content="Inputs have significantly shifted, but no ground-truth actuals have been submitted yet to confirm accuracy degradation.">
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '3px 8px',
                  borderRadius: 6,
                  fontSize: 10.5,
                  fontWeight: 600,
                  background: 'rgba(245, 158, 11, 0.12)',
                  color: '#FBBF24',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                }}
              >
                <AlertTriangle size={11} />
                {report.alert_badge_label}
              </span>
            </Tooltip>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => handleSimulateDrift()}
            disabled={simulating || loading}
            title="Preview drift detection in an isolated simulation mode without touching real database logs"
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

      {/* ── C1: Retraining Alert Banner (Shown when Critical Drift on High-Importance Features) ── */}
      {report && report.overall_status === 'CRITICAL_DRIFT' && (
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
                width: 34,
                height: 34,
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
              <div style={{ fontSize: 11, color: '#FDA4AF', marginTop: 4, fontWeight: 500 }}>
                💡 Note: Retraining requires fresh production data reflecting the current distribution — retraining on the original dataset cannot fix drift.
              </div>
            </div>
          </div>

          <button
            onClick={handleTriggerRetrain}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
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
        </motion.div>
      )}

      {/* ── C1: Moderate Shift Banner (Shift on Low-Importance Features) ── */}
      {report && report.overall_status === 'MODERATE_SHIFT' && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 16px',
            borderRadius: 10,
            background: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
          }}
        >
          <Sliders size={18} color="#FBBF24" />
          <div style={{ fontSize: 12, color: '#E2E8F0' }}>
            <strong style={{ color: '#FBBF24' }}>Moderate Distribution Shift: </strong>
            {report.recommendation}
          </div>
        </motion.div>
      )}

      {/* ── D2: Telemetry Scorecards with Plain-Language Tooltips ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
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
          <Tooltip content="Median response duration: 50% of production prediction requests completed in under this duration.">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#94A3B8', fontSize: 11, fontWeight: 600, cursor: 'help' }}>
              <Clock size={13} color="#38BDF8" />
              P50 LATENCY
              <HelpCircle size={10} color="#64748B" />
            </div>
          </Tooltip>
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
          <Tooltip content="95th percentile duration: 95% of live inference calls responded faster than this threshold.">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#94A3B8', fontSize: 11, fontWeight: 600, cursor: 'help' }}>
              <Zap size={13} color="#F59E0B" />
              P95 LATENCY
              <HelpCircle size={10} color="#64748B" />
            </div>
          </Tooltip>
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
          <Tooltip content="99th percentile tail latency: Worst-case response duration under production load.">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#94A3B8', fontSize: 11, fontWeight: 600, cursor: 'help' }}>
              <AlertTriangle size={13} color="#EC4899" />
              P99 LATENCY
              <HelpCircle size={10} color="#64748B" />
            </div>
          </Tooltip>
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
          <Tooltip content="Percentage of inference requests returning HTTP 200 SUCCESS without error.">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#94A3B8', fontSize: 11, fontWeight: 600, cursor: 'help' }}>
              <CheckCircle2 size={13} color="#10B981" />
              SUCCESS RATE
              <HelpCircle size={10} color="#64748B" />
            </div>
          </Tooltip>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#10B981', marginTop: 6 }}>
            {report?.telemetry?.success_rate !== undefined ? `${report.telemetry.success_rate}%` : '100%'}
          </div>
          <div style={{ fontSize: 10, color: '#64748B', marginTop: 4 }}>
            {report?.telemetry?.total_requests || 0} total requests served
          </div>
        </div>

        {/* C1: Dataset-Level Importance-Weighted Drift Scorecard */}
        <div
          style={{
            padding: '14px 16px',
            borderRadius: 10,
            background: 'rgba(15, 23, 42, 0.65)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <Tooltip content="Importance-Weighted Drift Score: Aggregates feature drift weighted by each feature's contribution in the trained model. A score >= 0.25 triggers retraining.">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#94A3B8', fontSize: 11, fontWeight: 600, cursor: 'help' }}>
              <Sliders size={13} color="#A855F7" />
              WEIGHTED DRIFT
              <HelpCircle size={10} color="#64748B" />
            </div>
          </Tooltip>
          <div style={{ fontSize: 20, fontWeight: 800, color: (report?.importance_weighted_drift_score || 0) >= 0.25 ? '#F87171' : '#38BDF8', marginTop: 6 }}>
            {report?.importance_weighted_drift_score !== undefined ? `${report.importance_weighted_drift_score.toFixed(2)}` : '0.00'}
          </div>
          <div style={{ fontSize: 10, color: '#64748B', marginTop: 4 }}>
            {report?.drifted_features_count ?? report?.drifted_features?.length ?? 0} of {report?.total_features_count ?? Object.keys(report?.features || {}).length} features shifted
          </div>
        </div>
      </div>

      {/* ── B3: Insufficient Data Accumulation Banner ── */}
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
            Production Inference Data is Accumulating ({report.sample_count} of {report.min_required} required)
          </div>
          <div style={{ fontSize: 12.5, color: '#94A3B8', maxWidth: 560 }}>
            Statistical drift calculation requires at least {report.min_required} production inference records to avoid false alarms
            and establish statistical confidence. Currently, {report.sample_count} requests have been logged.
            Run live predictions or test guardrails using <strong>Simulate Drift</strong>.
          </div>
          <button
            onClick={() => handleSimulateDrift()}
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
            {simulating ? 'Simulating Inferences...' : 'Simulate 50 Inferences (Preview Engine)'}
          </button>
        </div>
      )}

      {/* ── Main Feature Drift Table & Distribution Comparison Grid ── */}
      {report && !report.insufficient_data && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16 }}>
          {/* Left: Feature Drift Matrix Table */}
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.65)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 10,
              padding: '16px',
              overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#F1F5F9' }}>
                Feature Drift Matrix (Multi-Test Statistical Engine)
              </div>
              <Tooltip content="Statistical tests match feature type and baseline volume: KS (numeric small), Wasserstein (numeric large), Chi-Sq (categorical small), Jensen-Shannon (categorical large), Z-test (binary).">
                <span style={{ fontSize: 11, color: '#38BDF8', cursor: 'help', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <HelpCircle size={12} /> Test Rules
                </span>
              </Tooltip>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#64748B', textAlign: 'left' }}>
                    <th style={{ padding: '8px 6px' }}>Feature</th>
                    <th style={{ padding: '8px 6px' }}>Type</th>
                    <th style={{ padding: '8px 6px' }}>
                      <Tooltip content="Population Stability Index: measures distribution shift across training deciles (smoothing constant ε = 0.0001).">
                        <span style={{ cursor: 'help', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          PSI <HelpCircle size={10} />
                        </span>
                      </Tooltip>
                    </th>
                    <th style={{ padding: '8px 6px' }}>
                      <Tooltip content="Specific statistical hypothesis test evaluated based on feature type and sample volume.">
                        <span style={{ cursor: 'help', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          Statistical Test <HelpCircle size={10} />
                        </span>
                      </Tooltip>
                    </th>
                    <th style={{ padding: '8px 6px' }}>
                      <Tooltip content="Feature importance weight from trained model. High-importance features trigger retraining when shifted.">
                        <span style={{ cursor: 'help', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          Weight <HelpCircle size={10} />
                        </span>
                      </Tooltip>
                    </th>
                    <th style={{ padding: '8px 6px' }}>Status</th>
                    <th style={{ padding: '8px 6px', textAlign: 'right' }}>Inspect</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(report.features).map(([featName, feat]) => {
                    const isSelected = selectedFeature === featName;
                    const isExcluded = feat.status === 'EXCLUDED';
                    const isInsufficient = feat.status === 'INSUFFICIENT_DATA';
                    const statusColor =
                      feat.status === 'CRITICAL'
                        ? '#EF4444'
                        : feat.status === 'MODERATE'
                        ? '#F59E0B'
                        : isExcluded
                        ? '#64748B'
                        : isInsufficient
                        ? '#38BDF8'
                        : '#10B981';

                    const typeBadgeText =
                      feat.type === 'numeric'
                        ? 'NUM'
                        : feat.type === 'binary'
                        ? 'BIN'
                        : feat.type === 'excluded_identifier' || feat.type === 'excluded_temporal'
                        ? 'EXCL'
                        : 'CAT';

                    const typeBadgeColor =
                      feat.type === 'numeric'
                        ? '#38BDF8'
                        : feat.type === 'binary'
                        ? '#10B981'
                        : isExcluded
                        ? '#64748B'
                        : '#C084FC';

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
                              background: `${typeBadgeColor}22`,
                              color: typeBadgeColor,
                            }}
                          >
                            {typeBadgeText}
                          </span>
                        </td>
                        <td style={{ padding: '10px 6px', fontFamily: 'monospace', fontWeight: 700, color: statusColor }}>
                          {isExcluded ? '—' : feat.psi.toFixed(3)}
                        </td>
                        <td style={{ padding: '10px 6px', fontFamily: 'monospace', color: '#CBD5E1', fontSize: 11 }}>
                          {feat.test_display || (feat.p_value !== undefined && feat.p_value !== null ? `p=${feat.p_value.toFixed(3)}` : '—')}
                        </td>
                        <td style={{ padding: '10px 6px', fontFamily: 'monospace', color: '#94A3B8', fontSize: 11 }}>
                          {feat.importance !== undefined ? `${(feat.importance * 100).toFixed(0)}%` : '—'}
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
                            {feat.status_display || feat.status}
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

          {/* Right: Comparative Distribution & Rolling Timeline Inspection */}
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#F1F5F9' }}>
                Inspection: <span style={{ color: '#38BDF8' }}>{selectedFeature}</span>
              </div>

              {/* View Switcher: Distribution Shift vs Rolling Windows Timeline */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 6, padding: 2 }}>
                <button
                  onClick={() => setDetailTab('distribution')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '4px 8px',
                    borderRadius: 4,
                    fontSize: 10.5,
                    fontWeight: 600,
                    border: 'none',
                    background: detailTab === 'distribution' ? '#0284C7' : 'transparent',
                    color: detailTab === 'distribution' ? '#FFF' : '#94A3B8',
                    cursor: 'pointer',
                  }}
                >
                  <BarChart2 size={12} /> Bins
                </button>
                <button
                  onClick={() => setDetailTab('timeline')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '4px 8px',
                    borderRadius: 4,
                    fontSize: 10.5,
                    fontWeight: 600,
                    border: 'none',
                    background: detailTab === 'timeline' ? '#0284C7' : 'transparent',
                    color: detailTab === 'timeline' ? '#FFF' : '#94A3B8',
                    cursor: 'pointer',
                  }}
                >
                  <History size={12} /> Timeline
                </button>
              </div>
            </div>

            {/* D2: Copilot Plain-Language Explanation Trigger Button */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: 'rgba(56, 189, 248, 0.08)', borderRadius: 8, border: '1px solid rgba(56, 189, 248, 0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#E2E8F0' }}>
                <Bot size={14} color="#38BDF8" />
                <span>Explain '{selectedFeature}' with Copilot</span>
              </div>
              <button
                onClick={() => setShowCopilotExplain(!showCopilotExplain)}
                style={{
                  padding: '3px 8px',
                  borderRadius: 4,
                  background: '#38BDF8',
                  color: '#0B0912',
                  fontSize: 10.5,
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {showCopilotExplain ? 'Hide' : 'Explain'}
              </button>
            </div>

            {/* Expandable Copilot Plain-Language Explanation Card */}
            {showCopilotExplain && copilotExplanation && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: '#0B0F19',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  fontSize: 11.5,
                  color: '#E2E8F0',
                  lineHeight: 1.5,
                }}
              >
                <div style={{ fontWeight: 700, color: '#38BDF8', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Sparkles size={12} /> Real Data Diagnostics:
                </div>
                {copilotExplanation}
              </motion.div>
            )}

            {activeFeatureDetail ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {activeFeatureDetail.status === 'EXCLUDED' ? (
                  <div style={{ padding: 20, textAlign: 'center', color: '#94A3B8', fontSize: 12 }}>
                    This feature is marked as <strong>{activeFeatureDetail.status_display}</strong> and is excluded from drift monitoring.
                  </div>
                ) : detailTab === 'distribution' ? (
                  /* ── DISTRIBUTION COMPARISON TAB ── */
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94A3B8' }}>
                      <span>
                        {activeFeatureDetail.type === 'numeric'
                          ? `Baseline Mean: ${activeFeatureDetail.baseline_mean ?? '—'} | Current: ${activeFeatureDetail.current_mean ?? '—'}`
                          : `Baseline Mode: ${activeFeatureDetail.baseline_mode ?? '—'}`}
                      </span>
                      <span style={{ color: '#38BDF8', fontWeight: 600 }}>
                        {activeFeatureDetail.test_display}
                      </span>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                        maxHeight: 260,
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
                            <div
                              style={{
                                width: `${Math.min(item.baseline_pct, 100)}%`,
                                background: '#38BDF8',
                                borderRadius: 2,
                              }}
                            />
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
                  </>
                ) : (
                  /* ── C3: ROLLING WINDOWS DRIFT-OVER-TIME TAB ── */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 260, overflowY: 'auto' }}>
                    <div style={{ fontSize: 11, color: '#94A3B8' }}>
                      Chronological drift trend across rolling inference windows:
                    </div>
                    {rollingTrends.length === 0 ? (
                      <div style={{ padding: 16, textAlign: 'center', color: '#64748B', fontSize: 11.5 }}>
                        Collecting rolling inference chunks. Accumulate at least 15 inferences to view timeline windows.
                      </div>
                    ) : (
                      rollingTrends.map((trend, idx) => {
                        const statusColor =
                          trend.status === 'CRITICAL'
                            ? '#EF4444'
                            : trend.status === 'MODERATE'
                            ? '#F59E0B'
                            : '#10B981';

                        return (
                          <div
                            key={idx}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '8px 10px',
                              borderRadius: 6,
                              background: 'rgba(255,255,255,0.03)',
                              border: '1px solid rgba(255,255,255,0.06)',
                              fontSize: 11,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#F1F5F9' }}>
                                {trend.window}
                              </span>
                              <span style={{ fontSize: 10, color: '#64748B' }}>
                                ({trend.sample_count} reqs)
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span style={{ fontFamily: 'monospace', color: '#94A3B8' }}>
                                PSI: <strong>{trend.psi.toFixed(3)}</strong>
                              </span>
                              <span
                                style={{
                                  fontSize: 9.5,
                                  fontWeight: 700,
                                  padding: '2px 6px',
                                  borderRadius: 4,
                                  background: `${statusColor}22`,
                                  color: statusColor,
                                }}
                              >
                                {trend.status}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
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
