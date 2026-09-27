/**
 * DeploymentStudio — Prototype 4: Local Deployment Studio
 *
 * Connects a completed training run to a live local prediction endpoint.
 * All model metadata is sourced from the active training job — never from
 * Page 1 configuration.  The prediction form is generated dynamically from
 * the artifact's feature schema.
 *
 * Architecture:
 *   activeJob (ProjectContext)
 *     -> job_id + metadata.model_id
 *     -> POST /api/v1/local-deployments        (create)
 *     -> POST /api/v1/local-deployments/{id}/predict  (predict)
 *
 * Immutability: model_path is snapshotted at creation time.
 * A new training run cannot change an existing deployment.
 */
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Rocket,
  Loader2,
  Play,
  Square,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Cpu,
  Database,
  Target,
  Layers,
  Hash,
  AlertCircle,
  Activity,
  Zap,
  BarChart3,
  ListOrdered,
  Clock,
} from 'lucide-react';
import { useProject } from '../../providers/ProjectContext';
import { fetchJobDetails } from '../../services/jobService';
import {
  LocalDeploymentService,
  type LocalDeploymentResponse,
  type LocalPredictResponse,
  type FeatureSchemaEntry,
} from '../../services/localDeploymentService';

/* ─── Status badge helpers ─────────────────────────────────── */
const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  CREATED:   { bg: 'rgba(100,116,139,0.15)', text: '#94A3B8',  dot: '#94A3B8' },
  DEPLOYING: { bg: 'rgba(245,166,35,0.15)',  text: '#F5A623',  dot: '#F5A623' },
  READY:     { bg: 'rgba(0,245,160,0.15)',   text: '#00F5A0',  dot: '#00F5A0' },
  FAILED:    { bg: 'rgba(239,68,68,0.15)',   text: '#FF4D6D',  dot: '#FF4D6D' },
  STOPPING:  { bg: 'rgba(245,166,35,0.12)',  text: '#F5A623',  dot: '#F5A623' },
  STOPPED:   { bg: 'rgba(100,116,139,0.12)', text: '#64748B',  dot: '#64748B' },
};

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.CREATED;
  const isAnimated = status === 'DEPLOYING' || status === 'STOPPING';
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '3px 10px', borderRadius: 99,
        background: c.bg, color: c.text,
        fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
      }}
    >
      <span
        style={{
          width: 7, height: 7, borderRadius: '50%',
          background: c.dot,
          animation: isAnimated ? 'pulse 1.2s ease-in-out infinite' : undefined,
        }}
      />
      {status}
    </span>
  );
}

/* ─── Numeric / categorical input field ─────────────────────── */
function FeatureInput({
  schema,
  value,
  onChange,
}: {
  name: string;
  schema: FeatureSchemaEntry;
  value: string;
  onChange: (v: string) => void;
}) {
  const isCateg = schema.type === 'categorical' && schema.categories && schema.categories.length > 0;
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '7px 10px', borderRadius: 8,
    background: '#040912', border: '1px solid #152540',
    color: '#E2E8F0', fontSize: 13, fontFamily: 'var(--font-mono)',
    outline: 'none', transition: 'border-color 150ms',
  };

  if (isCateg) {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
        <option value="">Select…</option>
        {schema.categories!.map((cat) => (
          <option key={cat} value={cat}>{cat}</option>
        ))}
      </select>
    );
  }
  return (
    <input
      type="number"
      step="any"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={schema.min != null ? `e.g. ${schema.min}` : '0'}
      style={inputStyle}
    />
  );
}

/* ─── Prediction result panel ─────────────────────────────── */
function PredictionResult({ result }: { result: LocalPredictResponse }) {
  const isClassification = result.problem_type.toLowerCase().includes('classif');
  const probs = result.probabilities;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        padding: 16, borderRadius: 12,
        background: 'rgba(0,245,160,0.05)',
        border: '1px solid rgba(0,245,160,0.25)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#00F5A0', letterSpacing: '0.05em' }}>
          PREDICTION RESULT
        </span>
        <span style={{ fontSize: 11, color: '#475569', fontFamily: 'var(--font-mono)' }}>
          {result.latency_ms.toFixed(1)}ms
        </span>
      </div>

      {/* Primary prediction */}
      <div style={{
        padding: '12px 16px', borderRadius: 10,
        background: '#040912', border: '1px solid #152540', marginBottom: 12,
      }}>
        <div style={{ fontSize: 11, color: '#475569', marginBottom: 4 }}>Predicted Value</div>
        <div style={{ fontSize: 28, fontWeight: 800, color: '#E2E8F0', fontFamily: 'var(--font-mono)' }}>
          {String(result.prediction)}
        </div>
        {result.confidence != null && (
          <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 4 }}>
            Confidence: <strong style={{ color: '#00F5A0' }}>{(result.confidence * 100).toFixed(1)}%</strong>
          </div>
        )}
      </div>

      {/* Probabilities */}
      {isClassification && probs && Object.keys(probs).length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 11, color: '#475569', marginBottom: 4 }}>Class Probabilities</div>
          {Object.entries(probs)
            .sort(([, a], [, b]) => b - a)
            .map(([cls, prob]) => (
              <div key={cls}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 12, color: '#94A3B8' }}>{cls}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#E2E8F0', fontFamily: 'var(--font-mono)' }}>
                    {(prob * 100).toFixed(1)}%
                  </span>
                </div>
                <div style={{ height: 5, borderRadius: 99, background: '#152540', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${(prob * 100).toFixed(1)}%`,
                    background: 'linear-gradient(90deg, #00D4FF, #00F5A0)',
                    borderRadius: 99, transition: 'width 500ms ease',
                  }} />
                </div>
              </div>
            ))}
        </div>
      )}
    </motion.div>
  );
}

/* ─── Log panel ──────────────────────────────────────────── */
function LogPanel({ logs }: { logs: { ts: string; msg: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderRadius: 10, border: '1px solid #152540', overflow: 'hidden' }}>
      <button
        onClick={() => setOpen((p) => !p)}
        style={{
          width: '100%', padding: '10px 14px',
          background: '#040912', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          color: '#64748B', fontSize: 12, fontWeight: 600,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <ListOrdered size={13} /> Deployment Logs ({logs.length})
        </span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{
              background: '#030810', padding: 12,
              maxHeight: 220, overflowY: 'auto',
              fontFamily: 'var(--font-mono)', fontSize: 11,
            }}>
              {logs.length === 0 ? (
                <div style={{ color: '#475569' }}>No log entries yet.</div>
              ) : (
                [...logs].reverse().map((l, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 6 }}>
                    <span style={{ color: '#334155', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {new Date(l.ts).toLocaleTimeString()}
                    </span>
                    <span style={{ color: l.msg.startsWith('ERROR') ? '#FF4D6D' : '#94A3B8' }}>
                      {l.msg}
                    </span>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────── */
interface DeploymentStudioProps {
  onShowToast?: (title: string, description?: string, type?: 'success' | 'info' | 'error') => void;
}

export const DeploymentStudio: React.FC<DeploymentStudioProps> = ({ onShowToast }) => {
  const { activeJob, setActiveJob } = useProject();

  // Deployment lifecycle state
  const [deployment, setDeployment] = useState<LocalDeploymentResponse | null>(null);
  const [deployLoading, setDeployLoading] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);

  // Prediction form state
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [predLoading, setPredLoading] = useState(false);
  const [predResult, setPredResult] = useState<LocalPredictResponse | null>(null);
  const [predError, setPredError] = useState<string | null>(null);

  // On mount: try to fetch existing deployment for this job
  const jobId = activeJob?.job_id;
  const modelId: string | undefined =
    (activeJob?.metadata?.['model_id'] as string | undefined) ||
    (jobId ? `model-${jobId.slice(0, 8)}` : undefined);
  const isCompleted = activeJob?.status === 'COMPLETED';

  useEffect(() => {
    if (!jobId) return;
    LocalDeploymentService.listForJob(jobId)
      .then((deps) => {
        if (deps.length > 0) setDeployment(deps[0]);
      })
      .catch(() => {/* silent — no existing deployment */});

    // Refresh activeJob metadata from server if model_id or metrics missing
    if (!activeJob?.metadata?.['model_id']) {
      fetchJobDetails(jobId)
        .then((full) => {
          if (full) setActiveJob(full);
        })
        .catch(() => {/* silent */});
    }
  }, [jobId]);

  // Reset prediction when deployment changes
  useEffect(() => {
    setPredResult(null);
    setPredError(null);
    if (deployment?.feature_columns) {
      const init: Record<string, string> = {};
      deployment.feature_columns.forEach((f) => { init[f] = ''; });
      setInputValues(init);
    }
  }, [deployment?.deployment_id]);

  /* ── Actions ── */
  const handleDeploy = async () => {
    if (!jobId) return;
    setDeployLoading(true);
    setDeployError(null);
    try {
      const dep = await LocalDeploymentService.create(jobId, 'Local Deployment');
      setDeployment(dep);
      if (dep.status === 'READY') {
        onShowToast?.('Deployment Ready!', `Model ${dep.model_id} is live.`, 'success');
      } else if (dep.status === 'FAILED') {
        onShowToast?.('Deployment Failed', dep.error_message || 'Model could not be loaded.', 'error');
      }
    } catch (err: any) {
      const msg = err?.detail || err?.message || 'Deployment failed';
      setDeployError(msg);
      onShowToast?.('Deployment Failed', msg, 'error');
    } finally {
      setDeployLoading(false);
    }
  };

  const handleStop = async () => {
    if (!deployment) return;
    setDeployLoading(true);
    try {
      const updated = await LocalDeploymentService.stop(deployment.deployment_id);
      setDeployment(updated);
      onShowToast?.('Deployment Stopped', 'Model artifact preserved.', 'info');
    } catch (err: any) {
      onShowToast?.('Stop Failed', err?.detail || err?.message, 'error');
    } finally {
      setDeployLoading(false);
    }
  };

  const handleRedeploy = async () => {
    if (!deployment) return;
    setDeployLoading(true);
    try {
      const updated = await LocalDeploymentService.redeploy(deployment.deployment_id);
      setDeployment(updated);
      if (updated.status === 'READY') {
        onShowToast?.('Redeployed!', 'Model is live again.', 'success');
      }
    } catch (err: any) {
      onShowToast?.('Redeploy Failed', err?.detail || err?.message, 'error');
    } finally {
      setDeployLoading(false);
    }
  };

  const handlePredict = async () => {
    if (!deployment || deployment.status !== 'READY') return;
    setPredLoading(true);
    setPredError(null);
    setPredResult(null);

    // Coerce values
    const inputs: Record<string, any> = {};
    for (const [k, v] of Object.entries(inputValues)) {
      const schema = deployment.input_schema[k];
      if (schema?.type === 'categorical') {
        inputs[k] = v;
      } else {
        const n = parseFloat(v);
        inputs[k] = isNaN(n) ? v : n;
      }
    }

    try {
      const res = await LocalDeploymentService.predict(deployment.deployment_id, inputs);
      setPredResult(res);
      setDeployment((prev) =>
        prev ? { ...prev, total_predictions: (prev.total_predictions || 0) + 1 } : prev
      );
    } catch (err: any) {
      const msg = err?.detail || err?.message || 'Prediction failed';
      setPredError(msg);
      onShowToast?.('Prediction Error', msg, 'error');
    } finally {
      setPredLoading(false);
    }
  };

  /* ── Computed ── */
  const canDeploy = isCompleted && !deployment;
  const canPredict = deployment?.status === 'READY';
  const canStop = deployment?.status === 'READY' || deployment?.status === 'DEPLOYING';
  const canRedeploy = deployment?.status === 'STOPPED' || deployment?.status === 'FAILED';

  /* ── Pulse animation keyframe (injected once) ── */
  if (typeof document !== 'undefined' && !document.getElementById('deploy-pulse-kf')) {
    const style = document.createElement('style');
    style.id = 'deploy-pulse-kf';
    style.textContent = `@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`;
    document.head.appendChild(style);
  }

  const CARD: React.CSSProperties = {
    background: '#0A1628',
    border: '1px solid #152540',
    borderRadius: 14,
    padding: 20,
  };
  const LABEL: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
    color: '#475569', textTransform: 'uppercase' as const, marginBottom: 8,
    display: 'flex', alignItems: 'center', gap: 5,
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      style={{ height: '100%', overflowY: 'auto', padding: 24 }}
    >
      {/* ── Page Header ── */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{
          fontSize: 22, fontWeight: 800, color: '#E2E8F0',
          display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4,
        }}>
          <Rocket size={22} style={{ color: '#00F5A0' }} />
          Deployment Studio
        </h1>
        <p style={{ fontSize: 13, color: '#64748B' }}>
          Deploy a completed training run to a local prediction endpoint. Predictions execute
          the actual saved model artifact.
        </p>
      </div>

      {/* ── No active job guard ── */}
      {!activeJob && (
        <div style={{
          ...CARD, textAlign: 'center', padding: 48,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
        }}>
          <AlertCircle size={32} style={{ color: '#475569' }} />
          <div style={{ fontSize: 15, fontWeight: 700, color: '#64748B' }}>No Training Run Selected</div>
          <div style={{ fontSize: 13, color: '#475569', maxWidth: 380, lineHeight: 1.6 }}>
            Complete a training job first. Once a job is{' '}
            <span style={{ color: '#00F5A0', fontWeight: 600 }}>COMPLETED</span>,
            return here to deploy it.
          </div>
        </div>
      )}

      {activeJob && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>

          {/* ══ LEFT COLUMN ════════════════════════════════════════════════ */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* ── Model Info Card ── */}
            <div style={CARD}>
              <div style={LABEL}><Cpu size={11} /> Model Artifact</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Row icon={<Hash size={11} />} label="Job ID" value={activeJob.job_id} mono />
                <Row icon={<Cpu size={11} />} label="Algorithm" value={activeJob.algorithm} />
                <Row icon={<Database size={11} />} label="Dataset" value={activeJob.dataset_id} mono />
                <Row icon={<Target size={11} />} label="Target" value={activeJob.target_column} mono />
                <Row
                  icon={<Layers size={11} />}
                  label="Features"
                  value={`${activeJob.feature_columns.length} columns`}
                />
                <Row
                  icon={<Activity size={11} />}
                  label="Status"
                  value={<span style={{ color: isCompleted ? '#00F5A0' : '#F5A623' }}>{activeJob.status}</span>}
                />
                {modelId && (
                  <Row icon={<Hash size={11} />} label="Model ID" value={modelId} mono />
                )}
              </div>
            </div>

            {/* ── Deployment Status Card ── */}
            {deployment && (
              <div style={CARD}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={LABEL}><Rocket size={11} /> Deployment</div>
                  <StatusBadge status={deployment.status} />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                  <Row icon={<Hash size={11} />} label="Deployment ID" value={deployment.deployment_id} mono small />
                  <Row icon={<Zap size={11} />} label="Total Predictions" value={String(deployment.total_predictions)} />
                  <Row
                    icon={<Clock size={11} />}
                    label="Started"
                    value={deployment.started_at ? new Date(deployment.started_at).toLocaleString() : '—'}
                    small
                  />
                </div>

                {deployment.error_message && (
                  <div style={{
                    padding: '8px 12px', borderRadius: 8,
                    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
                    fontSize: 12, color: '#FF4D6D', marginBottom: 12,
                  }}>
                    {deployment.error_message}
                  </div>
                )}

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: 8 }}>
                  {canStop && (
                    <button onClick={handleStop} disabled={deployLoading} style={btnStyle('#F5A623', 'rgba(245,166,35,0.1)')}>
                      <Square size={13} /> Stop
                    </button>
                  )}
                  {canRedeploy && (
                    <button onClick={handleRedeploy} disabled={deployLoading} style={btnStyle('#00D4FF', 'rgba(0,212,255,0.1)')}>
                      <RefreshCw size={13} /> Redeploy
                    </button>
                  )}
                </div>

                <div style={{ marginTop: 14 }}>
                  <LogPanel logs={deployment.logs || []} />
                </div>
              </div>
            )}

            {/* ── Deploy Button (only when no deployment exists yet) ── */}
            {!deployment && (
              <div style={CARD}>
                <div style={LABEL}><Rocket size={11} /> Deploy This Model</div>
                {!isCompleted && (
                  <div style={{
                    padding: '10px 14px', borderRadius: 8,
                    background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.2)',
                    fontSize: 12, color: '#F5A623', marginBottom: 14,
                  }}>
                    Training is not yet complete. Wait for COMPLETED status before deploying.
                  </div>
                )}
                {deployError && (
                  <div style={{
                    padding: '10px 14px', borderRadius: 8,
                    background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                    fontSize: 12, color: '#FF4D6D', marginBottom: 14,
                  }}>
                    {deployError}
                  </div>
                )}
                <button
                  onClick={handleDeploy}
                  disabled={!canDeploy || deployLoading}
                  style={{
                    width: '100%', padding: '11px 18px', borderRadius: 10, border: 'none',
                    background: canDeploy && !deployLoading
                      ? 'linear-gradient(135deg, #00D4FF, #00F5A0)'
                      : '#152540',
                    color: canDeploy && !deployLoading ? '#0B0912' : '#475569',
                    fontWeight: 700, fontSize: 14, cursor: canDeploy ? 'pointer' : 'not-allowed',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    transition: 'all 200ms',
                  }}
                >
                  {deployLoading ? (
                    <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Deploying…</>
                  ) : (
                    <><Rocket size={16} /> Deploy Model</>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* ══ RIGHT COLUMN ═══════════════════════════════════════════════ */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* ── Prediction Form ── */}
            <div style={CARD}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={LABEL}><BarChart3 size={11} /> Run Prediction</div>
                {deployment && <StatusBadge status={deployment.status} />}
              </div>

              {!deployment ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: '#475569', fontSize: 13 }}>
                  Deploy the model first to enable predictions.
                </div>
              ) : !canPredict ? (
                <div style={{ textAlign: 'center', padding: '16px 0', color: '#475569', fontSize: 13 }}>
                  {deployment.status === 'FAILED'
                    ? 'Deployment failed. Redeploy to enable predictions.'
                    : deployment.status === 'STOPPED'
                    ? 'Deployment is stopped. Redeploy to enable predictions.'
                    : 'Starting up…'}
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                    {deployment.feature_columns.map((feat) => {
                      const schema = deployment.input_schema[feat] || { type: 'numeric' };
                      return (
                        <div key={feat}>
                          <label style={{
                            fontSize: 11, fontWeight: 600, color: '#64748B',
                            marginBottom: 5, display: 'flex', alignItems: 'center', gap: 5,
                          }}>
                            <span style={{
                              padding: '1px 5px', borderRadius: 4, fontSize: 9,
                              background: schema.type === 'categorical' ? 'rgba(0,212,255,0.1)' : 'rgba(0,245,160,0.1)',
                              color: schema.type === 'categorical' ? '#00D4FF' : '#00F5A0',
                              fontWeight: 700, letterSpacing: '0.05em',
                            }}>
                              {schema.type === 'categorical' ? 'CAT' : 'NUM'}
                            </span>
                            {feat}
                          </label>
                          <FeatureInput
                            name={feat}
                            schema={schema as FeatureSchemaEntry}
                            value={inputValues[feat] || ''}
                            onChange={(v) => setInputValues((prev) => ({ ...prev, [feat]: v }))}
                          />
                        </div>
                      );
                    })}
                  </div>

                  {predError && (
                    <div style={{
                      padding: '8px 12px', borderRadius: 8,
                      background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                      fontSize: 12, color: '#FF4D6D', marginBottom: 12,
                    }}>
                      {predError}
                    </div>
                  )}

                  <button
                    onClick={handlePredict}
                    disabled={predLoading}
                    style={{
                      width: '100%', padding: '10px', borderRadius: 10, border: 'none',
                      background: 'linear-gradient(135deg, #00D4FF, #00F5A0)',
                      color: '#0B0912', fontWeight: 700, fontSize: 13,
                      cursor: predLoading ? 'wait' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}
                  >
                    {predLoading ? (
                      <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Running…</>
                    ) : (
                      <><Play size={14} /> Run Prediction</>
                    )}
                  </button>
                </>
              )}
            </div>

            {/* ── Prediction Result ── */}
            {predResult && <PredictionResult result={predResult} />}
          </div>
        </div>
      )}

      {/* Spin keyframe */}
      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </motion.div>
  );
};

/* ─── Row helper ─────────────────────────────────────────────── */
function Row({
  icon, label, value, mono = false, small = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  small?: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <span style={{
        display: 'flex', alignItems: 'center', gap: 5,
        fontSize: small ? 11 : 12, color: '#475569', flexShrink: 0,
      }}>
        <span style={{ color: '#334155' }}>{icon}</span>
        {label}
      </span>
      <span style={{
        fontSize: small ? 11 : 12,
        color: typeof value === 'string' ? '#94A3B8' : undefined,
        fontFamily: mono ? 'var(--font-mono)' : undefined,
        textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        maxWidth: 200,
      }}>
        {value}
      </span>
    </div>
  );
}

function btnStyle(color: string, bg: string): React.CSSProperties {
  return {
    flex: 1, padding: '8px 14px', borderRadius: 8, border: `1px solid ${color}40`,
    background: bg, color, fontWeight: 700, fontSize: 12, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    transition: 'all 150ms',
  };
}
