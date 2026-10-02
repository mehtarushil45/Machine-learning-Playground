/**
 * DeploymentStudio — Enterprise Model Deployment & Live Prediction Console
 *
 * Professional ML platform deployment interface modeled after industry standards
 * (AWS SageMaker Real-Time Endpoints, DataRobot, Vertex AI).
 *
 * Design Principles:
 * - Enterprise Cleanliness: Replaces raw internal UUIDs with human-readable model,
 *   dataset, and target metadata. Technical identifiers are neatly tucked into
 *   a collapsed developer audit drawer.
 * - Dynamic Feature Typing: Categorical features render as rich select dropdowns
 *   using exact categories extracted from the model's fitted preprocessor.
 *   Numeric features render with numeric steppers; boolean features render as toggles.
 * - Auto-Fill Sample Data: 1-click testing with realistic dataset values.
 * - Developer Integration: Ready-to-copy cURL, Python, and JavaScript snippets.
 * - Live Probabilities & Session History: Interactive results with class distributions
 *   and recent inference logs.
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  Sparkles,
  RotateCcw,
  Code2,
  Copy,
  Check,
  Zap,
  Clock,
  Terminal,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ArrowLeft,
} from 'lucide-react';
import { useProject } from '../../providers/ProjectContext';
import { fetchJobDetails } from '../../services/jobService';
import {
  LocalDeploymentService,
  type LocalDeploymentResponse,
  type LocalPredictResponse,
  type FeatureSchemaEntry,
  type PredictionHistoryItem,
} from '../../services/localDeploymentService';

/* ─── Type Badge Helpers ───────────────────────────────────── */
function TypeBadge({ type }: { type: string }) {
  if (type === 'categorical') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 3,
          padding: '2px 7px',
          borderRadius: 4,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.04em',
          background: 'rgba(168, 85, 247, 0.15)',
          color: '#C084FC',
          border: '1px solid rgba(168, 85, 247, 0.3)',
        }}
      >
        CAT
      </span>
    );
  }
  if (type === 'boolean') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 3,
          padding: '2px 7px',
          borderRadius: 4,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.04em',
          background: 'rgba(59, 130, 246, 0.15)',
          color: '#60A5FA',
          border: '1px solid rgba(59, 130, 246, 0.3)',
        }}
      >
        BOOL
      </span>
    );
  }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        padding: '2px 7px',
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.04em',
        background: 'rgba(0, 212, 255, 0.12)',
        color: '#00D4FF',
        border: '1px solid rgba(0, 212, 255, 0.25)',
      }}
    >
      NUM
    </span>
  );
}

/* ─── Status Badge ─────────────────────────────────────────── */
const STATUS_CONFIG: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  READY:     { bg: 'rgba(0,245,160,0.12)', text: '#00F5A0', dot: '#00F5A0', label: 'RUNNING' },
  RUNNING:   { bg: 'rgba(0,245,160,0.12)', text: '#00F5A0', dot: '#00F5A0', label: 'RUNNING' },
  DEPLOYING: { bg: 'rgba(245,166,35,0.15)', text: '#F5A623', dot: '#F5A623', label: 'STARTING' },
  STARTING:  { bg: 'rgba(245,166,35,0.15)', text: '#F5A623', dot: '#F5A623', label: 'STARTING' },
  STOPPING:  { bg: 'rgba(245,166,35,0.12)', text: '#F5A623', dot: '#F5A623', label: 'STOPPING' },
  STOPPED:   { bg: 'rgba(100,116,139,0.15)', text: '#94A3B8', dot: '#64748B', label: 'STOPPED' },
  FAILED:    { bg: 'rgba(239,68,68,0.15)', text: '#FF4D6D', dot: '#FF4D6D', label: 'FAILED' },
};

function StatusIndicator({ status }: { status: string }) {
  const c = STATUS_CONFIG[status] || { bg: 'rgba(100,116,139,0.15)', text: '#94A3B8', dot: '#94A3B8', label: status };
  const isAnimated = status === 'READY' || status === 'RUNNING' || status === 'DEPLOYING' || status === 'STARTING';
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '5px 12px',
        borderRadius: 99,
        background: c.bg,
        border: `1px solid ${c.dot}33`,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: c.dot,
          boxShadow: isAnimated ? `0 0 10px ${c.dot}` : undefined,
          animation: isAnimated ? 'deployPulse 1.8s ease-in-out infinite' : undefined,
        }}
      />
      <span style={{ fontSize: 11, fontWeight: 800, color: c.text, letterSpacing: '0.08em' }}>
        {c.label}
      </span>
    </div>
  );
}

/* ─── Smart Feature Input Component ────────────────────────── */
function SmartFeatureInput({
  name,
  schema,
  value,
  onChange,
}: {
  name: string;
  schema?: FeatureSchemaEntry;
  value: string;
  onChange: (v: string) => void;
}) {
  const type = schema?.type || 'numeric';
  const hasCategories = type === 'categorical' && schema?.categories && schema.categories.length > 0;
  const isBoolean = type === 'boolean' || (schema?.categories?.length === 2 && schema.categories.includes('0') && schema.categories.includes('1'));

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '9px 12px',
    borderRadius: 8,
    background: '#040912',
    border: '1px solid #1E293B',
    color: '#E2E8F0',
    fontSize: 13,
    fontFamily: 'var(--font-mono, monospace)',
    outline: 'none',
    transition: 'all 150ms ease',
  };

  if (hasCategories) {
    const selected = value || (schema!.categories && schema!.categories.length > 0 ? schema!.categories[0] : '');
    return (
      <select
        value={selected}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...inputStyle, cursor: 'pointer' }}
      >
        {schema!.categories!.map((cat) => (
          <option key={cat} value={cat}>
            {cat}
          </option>
        ))}
      </select>
    );
  }

  if (isBoolean) {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...inputStyle, cursor: 'pointer' }}
      >
        <option value="1">1 — True / Positive</option>
        <option value="0">0 — False / Negative</option>
      </select>
    );
  }

  if (type === 'categorical' || type === 'text') {
    return (
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`Enter ${name.replace(/_/g, ' ')}…`}
        style={inputStyle}
      />
    );
  }

  return (
    <input
      type="number"
      step="any"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={schema?.min != null ? `e.g. ${schema.min}` : '0.0'}
      style={inputStyle}
    />
  );
}

/* ─── API Integration Snippet Panel ────────────────────────── */
function ApiIntegrationTabs({
  endpointUrl,
  samplePayload,
}: {
  endpointUrl: string;
  samplePayload: Record<string, any>;
}) {
  const [activeTab, setActiveTab] = useState<'curl' | 'python' | 'javascript'>('curl');
  const [copied, setCopied] = useState(false);

  const curlSnippet = useMemo(() => {
    return `curl -X POST "${endpointUrl}" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify({ inputs: samplePayload }, null, 2)}'`;
  }, [endpointUrl, samplePayload]);

  const pythonSnippet = useMemo(() => {
    return `import requests

url = "${endpointUrl}"
payload = {
    "inputs": ${JSON.stringify(samplePayload, null, 4)}
}

response = requests.post(url, json=payload)
result = response.json()
print("Prediction:", result["prediction"])
print("Confidence:", result.get("confidence"))`;
  }, [endpointUrl, samplePayload]);

  const jsSnippet = useMemo(() => {
    return `const res = await fetch("${endpointUrl}", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    inputs: ${JSON.stringify(samplePayload, null, 4)}
  })
});
const data = await res.json();
console.log("Prediction:", data.prediction);`;
  }, [endpointUrl, samplePayload]);

  const activeSnippet =
    activeTab === 'curl' ? curlSnippet : activeTab === 'python' ? pythonSnippet : jsSnippet;

  const handleCopy = () => {
    navigator.clipboard.writeText(activeSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ borderRadius: 10, background: '#030810', border: '1px solid #152540', overflow: 'hidden' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          background: '#070F1E',
          borderBottom: '1px solid #152540',
        }}
      >
        <div style={{ display: 'flex', gap: 6 }}>
          {(['curl', 'python', 'javascript'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                border: 'none',
                background: activeTab === tab ? '#1E293B' : 'transparent',
                color: activeTab === tab ? '#00D4FF' : '#64748B',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                textTransform: 'uppercase',
              }}
            >
              {tab === 'javascript' ? 'Node.js' : tab}
            </button>
          ))}
        </div>
        <button
          onClick={handleCopy}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '4px 8px',
            borderRadius: 6,
            background: 'rgba(0,212,255,0.08)',
            border: '1px solid rgba(0,212,255,0.2)',
            color: copied ? '#00F5A0' : '#00D4FF',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre
        style={{
          margin: 0,
          padding: 12,
          color: '#94A3B8',
          fontSize: 11,
          fontFamily: 'var(--font-mono, monospace)',
          lineHeight: 1.5,
          overflowX: 'auto',
          maxHeight: 160,
        }}
      >
        {activeSnippet}
      </pre>
    </div>
  );
}

/* ─── Main DeploymentStudio Component ──────────────────────── */
interface DeploymentStudioProps {
  onShowToast?: (title: string, description?: string, type?: 'success' | 'info' | 'error') => void;
  selectedDeploymentId?: string | null;
  onDeploymentChange?: () => void;
  onBack?: () => void;
}

export const DeploymentStudio: React.FC<DeploymentStudioProps> = ({
  onShowToast,
  selectedDeploymentId,
  onDeploymentChange,
  onBack,
}) => {
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

  // Real persisted prediction history
  const [history, setHistory] = useState<PredictionHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Collapsible drawers
  const [showLogs, setShowLogs] = useState(false);
  const [showApiTab, setShowApiTab] = useState(false);

  const jobId = activeJob?.job_id;
  const isCompleted = activeJob?.status === 'COMPLETED';

  // Inject CSS keyframe for pulse animation
  useEffect(() => {
    if (typeof document !== 'undefined' && !document.getElementById('deploy-pulse-kf')) {
      const style = document.createElement('style');
      style.id = 'deploy-pulse-kf';
      style.textContent = `
        @keyframes deployPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.15); }
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  // Fetch prediction history
  const loadHistory = useCallback(async (depId: string) => {
    setHistoryLoading(true);
    try {
      const records = await LocalDeploymentService.getPredictions(depId);
      setHistory(records);
    } catch {
      // ignore
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // Fetch deployment on mount / selection / job change
  useEffect(() => {
    if (selectedDeploymentId) {
      LocalDeploymentService.get(selectedDeploymentId)
        .then((dep) => {
          setDeployment(dep);
          loadHistory(dep.deployment_id);
          if (dep.job_id && dep.job_id !== jobId) {
            fetchJobDetails(dep.job_id).then((j) => { if (j) setActiveJob(j); }).catch(() => {});
          }
        })
        .catch((err) => {
          onShowToast?.('Load Error', err?.detail || err?.message, 'error');
        });
      return;
    }

    if (!jobId) return;
    LocalDeploymentService.listForJob(jobId)
      .then((deps) => {
        if (deps.length > 0) {
          setDeployment(deps[0]);
          loadHistory(deps[0].deployment_id);
        }
      })
      .catch(() => {});

    // Refresh activeJob metadata if missing
    if (!activeJob?.metadata?.['model_id'] || !activeJob?.metadata?.['metrics']) {
      fetchJobDetails(jobId)
        .then((full) => {
          if (full) setActiveJob(full);
        })
        .catch(() => {});
    }
  }, [selectedDeploymentId, jobId, loadHistory]);

  // Synchronize input fields when deployment is ready
  useEffect(() => {
    if (deployment?.feature_columns) {
      const init: Record<string, string> = {};
      const sample = deployment.sample_inputs || {};
      deployment.feature_columns.forEach((col) => {
        if (sample[col] != null) {
          init[col] = String(sample[col]);
        } else {
          const schema = deployment.input_schema?.[col];
          if (schema?.type === 'categorical' && schema.categories?.length) {
            init[col] = schema.categories[0];
          } else if (schema?.type === 'boolean') {
            init[col] = '1';
          } else {
            init[col] = '';
          }
        }
      });
      setInputValues(init);
    }
  }, [deployment?.deployment_id, deployment?.feature_columns]);

  /* ── Computed Metadata ── */
  const friendlyAlgorithmName = useMemo(() => {
    if (deployment?.algorithm_display_name) return deployment.algorithm_display_name;
    const algo = activeJob?.algorithm || deployment?.algorithm || 'Model';
    return algo
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }, [activeJob?.algorithm, deployment]);

  const friendlyDatasetName = useMemo(() => {
    if (deployment?.dataset_name) return deployment.dataset_name;
    const notes = activeJob?.metadata?.['notes'] as string | undefined;
    if (notes && notes.includes('Trained on ')) {
      const match = notes.match(/Trained on ([\w\.-]+)/);
      if (match) return match[1];
    }
    return 'Uploaded Training Dataset';
  }, [deployment?.dataset_name, activeJob?.metadata]);

  const metrics = deployment?.metrics || (activeJob?.metadata?.['metrics'] as Record<string, any> | undefined);

  const isRunning = deployment?.status === 'RUNNING' || deployment?.status === 'READY';
  const isStopped = deployment?.status === 'STOPPED';
  const isFailed = deployment?.status === 'FAILED';
  const isStarting = deployment?.status === 'STARTING' || deployment?.status === 'DEPLOYING';

  const canDeploy = isCompleted && !deployment;
  const canPredict = isRunning;
  const canStart = isStopped || isFailed;
  const canStop = isRunning || isStarting;
  const canRestart = isRunning || isStopped;
  const canRedeploy = true;

  /* ── Handlers ── */
  const handleDeploy = async () => {
    if (!jobId) return;
    setDeployLoading(true);
    setDeployError(null);
    try {
      const dep = await LocalDeploymentService.create(jobId, friendlyAlgorithmName);
      setDeployment(dep);
      loadHistory(dep.deployment_id);
      if (dep.status === 'RUNNING' || dep.status === 'READY') {
        onShowToast?.('Endpoint Live!', `${friendlyAlgorithmName} is active and ready for inference.`, 'success');
      } else if (dep.status === 'FAILED') {
        onShowToast?.('Deployment Issue', dep.error_message || 'Could not load model.', 'error');
      }
      onDeploymentChange?.();
    } catch (err: any) {
      const msg = err?.detail || err?.message || 'Deployment failed';
      setDeployError(msg);
      onShowToast?.('Deployment Failed', msg, 'error');
    } finally {
      setDeployLoading(false);
    }
  };

  const handleStart = async () => {
    if (!deployment) return;
    setDeployLoading(true);
    try {
      const updated = await LocalDeploymentService.start(deployment.deployment_id);
      setDeployment(updated);
      onShowToast?.('Endpoint Started', 'Serving traffic on port 8000.', 'success');
      onDeploymentChange?.();
    } catch (err: any) {
      onShowToast?.('Start Failed', err?.detail || err?.message, 'error');
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
      onShowToast?.('Endpoint Stopped', 'Model artifact preserved in registry.', 'info');
      onDeploymentChange?.();
    } catch (err: any) {
      onShowToast?.('Stop Failed', err?.detail || err?.message, 'error');
    } finally {
      setDeployLoading(false);
    }
  };

  const handleRestart = async () => {
    if (!deployment) return;
    setDeployLoading(true);
    try {
      const updated = await LocalDeploymentService.restart(deployment.deployment_id);
      setDeployment(updated);
      onShowToast?.('Endpoint Restarted', 'Model reloaded into cache.', 'success');
      onDeploymentChange?.();
    } catch (err: any) {
      onShowToast?.('Restart Failed', err?.detail || err?.message, 'error');
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
      onShowToast?.('Endpoint Active!', 'Model artifact reloaded.', 'success');
      onDeploymentChange?.();
    } catch (err: any) {
      onShowToast?.('Redeploy Failed', err?.detail || err?.message, 'error');
    } finally {
      setDeployLoading(false);
    }
  };

  const handleAutoFill = () => {
    if (!deployment?.feature_columns) return;
    const sample = deployment.sample_inputs || {};
    const filled: Record<string, string> = {};

    deployment.feature_columns.forEach((col) => {
      if (sample[col] != null) {
        filled[col] = String(sample[col]);
      } else {
        const schema = deployment.input_schema[col];
        if (schema?.type === 'categorical' && schema.categories?.length) {
          filled[col] = schema.categories[0];
        } else if (schema?.type === 'boolean') {
          filled[col] = '1';
        } else {
          filled[col] = '1.0';
        }
      }
    });

    setInputValues(filled);
    onShowToast?.('Example Values Loaded', 'Populated inputs with valid training data sample.', 'info');
  };

  const handleClear = () => {
    if (!deployment?.feature_columns) return;
    const cleared: Record<string, string> = {};
    deployment.feature_columns.forEach((col) => {
      const schema = deployment.input_schema?.[col];
      if (schema?.type === 'categorical' && schema.categories?.length) {
        cleared[col] = schema.categories[0];
      } else if (schema?.type === 'boolean') {
        cleared[col] = '1';
      } else {
        cleared[col] = '';
      }
    });
    setInputValues(cleared);
  };

  const handlePredict = async () => {
    if (!deployment || !canPredict) return;
    setPredLoading(true);
    setPredError(null);
    setPredResult(null);

    // Build payload according to feature schema types
    const inputs: Record<string, any> = {};
    for (const [k, v] of Object.entries(inputValues)) {
      const schema = deployment.input_schema?.[k];
      if (schema?.type === 'categorical' || schema?.type === 'text') {
        inputs[k] = v;
      } else if (schema?.type === 'boolean') {
        inputs[k] = v === '1' || v === 'true' ? 1 : 0;
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

      // Refresh persisted prediction records from backend
      await loadHistory(deployment.deployment_id);
    } catch (err: any) {
      const msg = err?.detail || err?.message || 'Prediction failed';
      setPredError(msg);
      onShowToast?.('Prediction Error', msg, 'error');
      if (deployment) {
        loadHistory(deployment.deployment_id);
      }
    } finally {
      setPredLoading(false);
    }
  };

  /* ── Styles ── */
  const CARD_STYLE: React.CSSProperties = {
    background: '#0A1424',
    border: '1px solid #152540',
    borderRadius: 14,
    padding: 22,
  };

  const SECTION_LABEL: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.08em',
    color: '#64748B',
    textTransform: 'uppercase',
    marginBottom: 12,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      style={{ height: '100%', overflowY: 'auto', padding: 24, background: '#050B14' }}
    >
      {/* ── Top Navigation Bar (Back to Hub) ── */}
      {onBack && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <button
            onClick={onBack}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid #1E293B',
              borderRadius: 8,
              padding: '7px 14px',
              color: '#94A3B8',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 150ms ease',
            }}
          >
            <ArrowLeft size={14} /> Back to Deployments
          </button>
          {deployment && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, color: '#64748B' }}>Deployment:</span>
              <span style={{ fontSize: 12, fontFamily: 'var(--font-mono, monospace)', color: '#00D4FF', fontWeight: 600 }}>
                {deployment.name || deployment.deployment_id.slice(0, 12)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── No Job or Deployment State ── */}
      {!activeJob && !deployment && (
        <div
          style={{
            ...CARD_STYLE,
            textAlign: 'center',
            padding: 56,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <AlertCircle size={36} style={{ color: '#475569' }} />
          <div style={{ fontSize: 16, fontWeight: 700, color: '#94A3B8' }}>No Active Model or Deployment Found</div>
          <div style={{ fontSize: 13, color: '#475569', maxWidth: 420, lineHeight: 1.6 }}>
            Train a model on the Dataset Profiler or Pipeline Studio page first, or select an existing deployment from the Deployments Hub.
          </div>
        </div>
      )}

      {(activeJob || deployment) && (
        <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', gap: 24, alignItems: 'start' }}>
          {/* ═══════════════════════════════════════════════════════════════════
              LEFT COLUMN: MODEL OVERVIEW, ENDPOINT CONTROLS & API SNIPPETS
             ═══════════════════════════════════════════════════════════════════ */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* ── Production Model Overview Card (Enterprise Clean) ── */}
            <div style={CARD_STYLE}>
              <div style={SECTION_LABEL}>
                <Cpu size={12} style={{ color: '#00D4FF' }} /> Model Specification
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#F1F5F9', marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>{friendlyAlgorithmName}</span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 4,
                      background: 'rgba(0, 245, 160, 0.15)',
                      color: '#00F5A0',
                      border: '1px solid rgba(0, 245, 160, 0.3)',
                    }}
                  >
                    {deployment?.model_version || 'v1.0.0'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 4,
                      background: 'rgba(0, 212, 255, 0.12)',
                      color: '#00D4FF',
                    }}
                  >
                    {activeJob?.algorithm ? activeJob.algorithm.replace(/_/g, ' ') : deployment?.algorithm || 'Model'}
                  </span>
                  <span style={{ fontSize: 12, color: '#475569' }}>•</span>
                  <span style={{ fontSize: 12, color: '#94A3B8' }}>
                    Target: <strong style={{ color: '#00F5A0' }}>{deployment?.target_column || activeJob?.target_column || '—'}</strong>
                  </span>
                </div>
                {deployment?.artifact_id && (
                  <div style={{ marginTop: 8, fontSize: 11, color: '#64748B', fontFamily: 'var(--font-mono, monospace)' }} title={deployment.artifact_id}>
                    Artifact: {deployment.artifact_id.slice(0, 16)}…
                  </div>
                )}
              </div>

              {/* Dataset & Feature Metrics */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 10,
                  padding: 12,
                  borderRadius: 10,
                  background: '#040912',
                  border: '1px solid #152540',
                  marginBottom: 16,
                }}
              >
                <div>
                  <div style={{ fontSize: 10, color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                    Source Dataset
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#E2E8F0',
                      marginTop: 3,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={friendlyDatasetName}
                  >
                    {friendlyDatasetName}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 10, color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                    Input Features
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#00D4FF', marginTop: 3 }}>
                    {deployment?.feature_columns?.length || activeJob?.feature_columns?.length || 0} columns
                  </div>
                </div>
              </div>

              {/* Performance Metrics Chips (if available) */}
              {metrics && (
                <div>
                  <div style={{ fontSize: 10, color: '#64748B', fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 }}>
                    Trained Model Performance
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                    {metrics.accuracy != null && (
                      <div style={{ padding: '8px 10px', borderRadius: 8, background: '#050D1A', border: '1px solid #1E293B' }}>
                        <div style={{ fontSize: 10, color: '#64748B' }}>Accuracy</div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: '#00F5A0', marginTop: 2 }}>
                          {(metrics.accuracy * 100).toFixed(1)}%
                        </div>
                      </div>
                    )}
                    {metrics.f1_score != null && (
                      <div style={{ padding: '8px 10px', borderRadius: 8, background: '#050D1A', border: '1px solid #1E293B' }}>
                        <div style={{ fontSize: 10, color: '#64748B' }}>F1 Score</div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: '#38BDF8', marginTop: 2 }}>
                          {metrics.f1_score.toFixed(3)}
                        </div>
                      </div>
                    )}
                    {metrics.precision != null && (
                      <div style={{ padding: '8px 10px', borderRadius: 8, background: '#050D1A', border: '1px solid #1E293B' }}>
                        <div style={{ fontSize: 10, color: '#64748B' }}>Precision</div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: '#A855F7', marginTop: 2 }}>
                          {metrics.precision.toFixed(3)}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ── Endpoint Deployment Controls ── */}
            {deployment ? (
              <div style={CARD_STYLE}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ ...SECTION_LABEL, marginBottom: 0 }}>
                    <Zap size={12} style={{ color: '#00F5A0' }} /> Serving Endpoint
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 11, color: '#64748B', fontFamily: 'var(--font-mono, monospace)' }}>
                      Port: 8000
                    </span>
                    <StatusIndicator status={deployment.status} />
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: '#64748B' }}>Total Inferences</span>
                    <span style={{ fontWeight: 700, color: '#F1F5F9', fontFamily: 'var(--font-mono, monospace)' }}>
                      {deployment.total_predictions} requests
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: '#64748B' }}>Active Since</span>
                    <span style={{ color: '#94A3B8' }}>
                      {deployment.started_at ? new Date(deployment.started_at).toLocaleTimeString() : '—'}
                    </span>
                  </div>
                </div>

                {deployment.error_message && (
                  <div
                    style={{
                      padding: '10px 14px',
                      borderRadius: 8,
                      background: 'rgba(239,68,68,0.08)',
                      border: '1px solid rgba(239,68,68,0.25)',
                      fontSize: 12,
                      color: '#FF4D6D',
                      marginBottom: 14,
                    }}
                  >
                    {deployment.error_message}
                  </div>
                )}

                {/* Control Action Buttons */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {canStart && (
                    <button
                      onClick={handleStart}
                      disabled={deployLoading}
                      style={{
                        flex: 1,
                        padding: '9px 14px',
                        borderRadius: 8,
                        background: 'rgba(0,245,160,0.12)',
                        border: '1px solid rgba(0,245,160,0.4)',
                        color: '#00F5A0',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                      }}
                    >
                      <Play size={13} /> Start Endpoint
                    </button>
                  )}
                  {canStop && (
                    <button
                      onClick={handleStop}
                      disabled={deployLoading}
                      style={{
                        flex: 1,
                        padding: '9px 14px',
                        borderRadius: 8,
                        background: 'rgba(245,166,35,0.08)',
                        border: '1px solid rgba(245,166,35,0.3)',
                        color: '#F5A623',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                      }}
                    >
                      <Square size={13} /> Stop Endpoint
                    </button>
                  )}
                  {canRestart && (
                    <button
                      onClick={handleRestart}
                      disabled={deployLoading}
                      style={{
                        padding: '9px 14px',
                        borderRadius: 8,
                        background: 'rgba(56, 189, 248, 0.1)',
                        border: '1px solid rgba(56, 189, 248, 0.3)',
                        color: '#38BDF8',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                      }}
                    >
                      <RefreshCw size={13} /> Restart
                    </button>
                  )}
                  {canRedeploy && (
                    <button
                      onClick={handleRedeploy}
                      disabled={deployLoading}
                      title="Reload model artifact"
                      style={{
                        padding: '9px 12px',
                        borderRadius: 8,
                        background: 'transparent',
                        border: '1px solid #1E293B',
                        color: '#94A3B8',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                      }}
                    >
                      <RotateCcw size={12} /> Redeploy
                    </button>
                  )}
                </div>
              </div>
            ) : (
              /* Deploy Button (When no deployment created yet) */
              <div style={CARD_STYLE}>
                <div style={SECTION_LABEL}>
                  <Rocket size={12} style={{ color: '#00F5A0' }} /> Launch Real-Time Endpoint
                </div>
                <p style={{ fontSize: 13, color: '#64748B', lineHeight: 1.5, marginBottom: 16 }}>
                  Deploys this model artifact to an in-memory cached endpoint capable of executing predictions
                  in under 5 milliseconds.
                </p>

                {deployError && (
                  <div
                    style={{
                      padding: '10px 14px',
                      borderRadius: 8,
                      background: 'rgba(239,68,68,0.08)',
                      border: '1px solid rgba(239,68,68,0.25)',
                      fontSize: 12,
                      color: '#FF4D6D',
                      marginBottom: 14,
                    }}
                  >
                    {deployError}
                  </div>
                )}

                <button
                  onClick={handleDeploy}
                  disabled={!canDeploy || deployLoading}
                  style={{
                    width: '100%',
                    padding: '12px 18px',
                    borderRadius: 10,
                    border: 'none',
                    background:
                      canDeploy && !deployLoading
                        ? 'linear-gradient(135deg, #00D4FF, #00F5A0)'
                        : '#152540',
                    color: canDeploy && !deployLoading ? '#08111E' : '#475569',
                    fontWeight: 800,
                    fontSize: 14,
                    cursor: canDeploy ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    boxShadow: canDeploy && !deployLoading ? '0 0 20px rgba(0,245,160,0.2)' : 'none',
                    transition: 'all 200ms ease',
                  }}
                >
                  {deployLoading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> Initializing Endpoint…
                    </>
                  ) : (
                    <>
                      <Rocket size={16} /> Deploy Model to Local Endpoint
                    </>
                  )}
                </button>
              </div>
            )}

            {/* ── Developer Integration Accordion (cURL / Python) ── */}
            {deployment && (
              <div style={{ ...CARD_STYLE, padding: 14 }}>
                <button
                  onClick={() => setShowApiTab((prev) => !prev)}
                  style={{
                    width: '100%',
                    background: 'none',
                    border: 'none',
                    color: '#94A3B8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#00D4FF' }}>
                    <Code2 size={14} /> Developer API Snippets
                  </span>
                  {showApiTab ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>

                <AnimatePresence>
                  {showApiTab && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      style={{ overflow: 'hidden', marginTop: 12 }}
                    >
                      <ApiIntegrationTabs
                        endpointUrl={`http://localhost:8000/api/v1/local-deployments/${deployment.deployment_id}/predict`}
                        samplePayload={deployment.sample_inputs || {}}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* ── Deployment Logs Accordion ── */}
            {deployment && (
              <div style={{ ...CARD_STYLE, padding: 14 }}>
                <button
                  onClick={() => setShowLogs((prev) => !prev)}
                  style={{
                    width: '100%',
                    background: 'none',
                    border: 'none',
                    color: '#94A3B8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <Terminal size={14} /> Lifecycle Logs ({deployment.logs?.length || 0})
                  </span>
                  {showLogs ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>

                <AnimatePresence>
                  {showLogs && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      style={{ overflow: 'hidden', marginTop: 12 }}
                    >
                      <div
                        style={{
                          background: '#030810',
                          padding: 12,
                          borderRadius: 8,
                          maxHeight: 180,
                          overflowY: 'auto',
                          fontFamily: 'var(--font-mono, monospace)',
                          fontSize: 11,
                        }}
                      >
                        {deployment.logs && deployment.logs.length > 0 ? (
                          [...deployment.logs].reverse().map((l, i) => (
                            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                              <span style={{ color: '#475569', flexShrink: 0 }}>
                                {new Date(l.ts).toLocaleTimeString()}
                              </span>
                              <span style={{ color: l.msg.startsWith('ERROR') ? '#FF4D6D' : '#94A3B8' }}>
                                {l.msg}
                              </span>
                            </div>
                          ))
                        ) : (
                          <div style={{ color: '#475569' }}>No log entries.</div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* ═══════════════════════════════════════════════════════════════════
              RIGHT COLUMN: INTERACTIVE PREDICTION CONSOLE
             ═══════════════════════════════════════════════════════════════════ */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={CARD_STYLE}>
              {/* Card Header & Toolbar */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 16,
                  paddingBottom: 14,
                  borderBottom: '1px solid #152540',
                }}
              >
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#F8FAFC' }}>
                    Interactive Inference Console
                  </div>
                  <div style={{ fontSize: 12, color: '#64748B' }}>
                    Execute test inputs directly against the compiled model artifact.
                  </div>
                </div>

                {deployment && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      onClick={handleAutoFill}
                      title="Load representative values from the training dataset"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '6px 12px',
                        borderRadius: 8,
                        background: 'rgba(0, 245, 160, 0.08)',
                        border: '1px solid rgba(0, 245, 160, 0.25)',
                        color: '#00F5A0',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'all 150ms ease',
                      }}
                    >
                      <Sparkles size={13} /> Auto-Fill Example
                    </button>

                    <button
                      onClick={handleClear}
                      title="Clear all fields"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '6px 10px',
                        borderRadius: 8,
                        background: 'transparent',
                        border: '1px solid #1E293B',
                        color: '#64748B',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      <RotateCcw size={12} /> Clear
                    </button>
                  </div>
                )}
              </div>

              {!deployment ? (
                <div style={{ padding: 48, textAlign: 'center', color: '#64748B' }}>
                  <HelpCircle size={32} style={{ marginBottom: 10, color: '#334155' }} />
                  <div style={{ fontSize: 14, fontWeight: 700 }}>Model Not Deployed Yet</div>
                  <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>
                    Deploy this model from the left panel to unlock the interactive prediction console.
                  </div>
                </div>
              ) : (
                /* Feature Input Fields Grid */
                <div>
                  {isStopped && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '12px 16px',
                        borderRadius: 8,
                        background: 'rgba(245, 166, 35, 0.08)',
                        border: '1px solid rgba(245, 166, 35, 0.3)',
                        color: '#F5A623',
                        fontSize: 12,
                        marginBottom: 16,
                      }}
                    >
                      <AlertCircle size={15} style={{ flexShrink: 0 }} />
                      <span>Endpoint is currently <strong>STOPPED</strong>. Predictions are offline. Click <strong>Start Endpoint</strong> in the left panel to resume live serving.</span>
                    </div>
                  )}

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
                      gap: 14,
                      marginBottom: 20,
                    }}
                  >
                    {deployment.feature_columns.map((colName) => {
                      const schema = deployment.input_schema[colName];
                      const colType = schema?.type || 'numeric';

                      return (
                        <div
                          key={colName}
                          style={{
                            background: '#060D1A',
                            border: '1px solid #142236',
                            borderRadius: 10,
                            padding: 12,
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              marginBottom: 8,
                            }}
                          >
                            <label
                              style={{
                                fontSize: 12,
                                fontWeight: 700,
                                color: '#CBD5E1',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                              title={colName}
                            >
                              {colName.replace(/_/g, ' ')}
                            </label>
                            <TypeBadge type={colType} />
                          </div>

                          <SmartFeatureInput
                            name={colName}
                            schema={schema}
                            value={inputValues[colName] ?? ''}
                            onChange={(val) => setInputValues((prev) => ({ ...prev, [colName]: val }))}
                          />
                        </div>
                      );
                    })}
                  </div>

                  {/* Prediction Error Alert */}
                  {predError && (
                    <div
                      style={{
                        padding: '12px 16px',
                        borderRadius: 10,
                        background: 'rgba(239, 68, 68, 0.08)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        color: '#FF4D6D',
                        fontSize: 13,
                        marginBottom: 16,
                        display: 'flex',
                        gap: 10,
                        alignItems: 'center',
                      }}
                    >
                      <AlertCircle size={16} style={{ flexShrink: 0 }} />
                      <div>{predError}</div>
                    </div>
                  )}

                  {/* Run Prediction Button */}
                  <button
                    onClick={handlePredict}
                    disabled={predLoading || !canPredict}
                    style={{
                      width: '100%',
                      padding: '12px 20px',
                      borderRadius: 10,
                      border: 'none',
                      background: canPredict
                        ? 'linear-gradient(135deg, #00D4FF, #00F5A0)'
                        : '#1E293B',
                      color: canPredict ? '#08111E' : '#64748B',
                      fontWeight: 800,
                      fontSize: 14,
                      cursor: predLoading ? 'wait' : !canPredict ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      boxShadow: canPredict ? '0 0 20px rgba(0,245,160,0.18)' : 'none',
                      transition: 'all 150ms ease',
                    }}
                  >
                    {predLoading ? (
                      <>
                        <Loader2 size={16} className="animate-spin" /> Executing Prediction…
                      </>
                    ) : isStopped ? (
                      <>
                        <Square size={15} /> Endpoint Stopped — Start to Predict
                      </>
                    ) : (
                      <>
                        <Play size={16} /> Run Live Prediction
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* ── Live Prediction Result Panel ── */}
            <AnimatePresence>
              {predResult && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  style={{
                    ...CARD_STYLE,
                    background: 'rgba(0, 245, 160, 0.03)',
                    border: '1px solid rgba(0, 245, 160, 0.3)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 14,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#00F5A0', fontWeight: 800, fontSize: 12 }}>
                      <CheckCircle2 size={15} /> PREDICTION RESULT
                    </div>
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: 6,
                        background: '#050D1A',
                        color: '#64748B',
                        fontFamily: 'var(--font-mono, monospace)',
                        fontSize: 11,
                      }}
                    >
                      Latency: <strong style={{ color: '#00F5A0' }}>{predResult.latency_ms.toFixed(1)} ms</strong>
                    </span>
                  </div>

                  {/* Primary Predicted Class Hero */}
                  <div
                    style={{
                      padding: 18,
                      borderRadius: 12,
                      background: '#040A14',
                      border: '1px solid #162C46',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 16,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 11, color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                        Target Outcome ({deployment?.target_column})
                      </div>
                      <div style={{ fontSize: 24, fontWeight: 900, color: '#FFFFFF', marginTop: 4 }}>
                        {String(predResult.prediction)}
                      </div>
                    </div>

                    {predResult.confidence != null && (
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 11, color: '#64748B', fontWeight: 700 }}>CONFIDENCE</div>
                        <div style={{ fontSize: 22, fontWeight: 900, color: '#00F5A0', marginTop: 2 }}>
                          {(predResult.confidence * 100).toFixed(1)}%
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Class Probabilities Distribution */}
                  {predResult.probabilities && Object.keys(predResult.probabilities).length > 0 && (
                    <div>
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: '#64748B',
                          textTransform: 'uppercase',
                          marginBottom: 10,
                        }}
                      >
                        Class Probability Distribution
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {Object.entries(predResult.probabilities)
                          .sort(([, a], [, b]) => b - a)
                          .map(([label, prob]) => {
                            const isWinner = label === String(predResult.prediction);
                            const pct = (prob * 100).toFixed(1);

                            return (
                              <div key={label}>
                                <div
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    fontSize: 12,
                                    marginBottom: 4,
                                    color: isWinner ? '#00F5A0' : '#94A3B8',
                                    fontWeight: isWinner ? 700 : 500,
                                  }}
                                >
                                  <span>{label}</span>
                                  <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>{pct}%</span>
                                </div>
                                <div
                                  style={{
                                    height: 7,
                                    borderRadius: 99,
                                    background: '#0D1B2E',
                                    overflow: 'hidden',
                                  }}
                                >
                                  <div
                                    style={{
                                      height: '100%',
                                      width: `${pct}%`,
                                      borderRadius: 99,
                                      background: isWinner
                                        ? 'linear-gradient(90deg, #00D4FF, #00F5A0)'
                                        : '#1E3A5F',
                                      transition: 'width 300ms ease',
                                    }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Persisted Prediction History Section ── */}
            {deployment && (
              <div style={CARD_STYLE}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ ...SECTION_LABEL, marginBottom: 0 }}>
                    <Clock size={12} style={{ color: '#00D4FF' }} /> Prediction History ({history.length})
                  </div>
                  <button
                    onClick={() => loadHistory(deployment.deployment_id)}
                    disabled={historyLoading}
                    title="Refresh prediction history from database"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      background: 'none',
                      border: 'none',
                      color: '#64748B',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <RefreshCw size={11} className={historyLoading ? 'animate-spin' : ''} /> Refresh
                  </button>
                </div>

                {history.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#475569', textAlign: 'center', padding: '16px 0' }}>
                    No inferences executed yet for this deployment.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {history.slice(0, 10).map((item) => {
                      const isSuccess = item.status === 'SUCCESS';
                      return (
                        <div
                          key={item.id}
                          style={{
                            padding: '10px 14px',
                            borderRadius: 8,
                            background: '#040912',
                            border: `1px solid ${isSuccess ? '#142236' : 'rgba(239, 68, 68, 0.25)'}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            fontSize: 12,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <span style={{ color: '#475569', fontSize: 11 }}>
                              {item.created_at ? new Date(item.created_at).toLocaleTimeString() : '—'}
                            </span>
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 800,
                                padding: '1px 6px',
                                borderRadius: 4,
                                background: isSuccess ? 'rgba(0, 245, 160, 0.12)' : 'rgba(239, 68, 68, 0.15)',
                                color: isSuccess ? '#00F5A0' : '#FF4D6D',
                                border: `1px solid ${isSuccess ? 'rgba(0, 245, 160, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                              }}
                            >
                              {item.status || 'SUCCESS'}
                            </span>
                            {isSuccess ? (
                              <>
                                <span style={{ color: '#E2E8F0', fontWeight: 700 }}>
                                  Result: <strong style={{ color: '#00F5A0' }}>{String(item.prediction)}</strong>
                                </span>
                                {item.confidence != null && (
                                  <span style={{ color: '#64748B', fontSize: 11 }}>
                                    ({(item.confidence * 100).toFixed(0)}% conf)
                                  </span>
                                )}
                              </>
                            ) : (
                              <span style={{ color: '#FF4D6D', fontSize: 11 }}>
                                {item.error_message || 'Inference error'}
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {item.model_version && (
                              <span style={{ fontSize: 10, color: '#64748B', fontFamily: 'var(--font-mono, monospace)' }}>
                                {item.model_version}
                              </span>
                            )}
                            <span style={{ color: '#475569', fontFamily: 'var(--font-mono, monospace)', fontSize: 11 }}>
                              {item.latency_ms != null ? `${item.latency_ms.toFixed(1)}ms` : '—'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
};
