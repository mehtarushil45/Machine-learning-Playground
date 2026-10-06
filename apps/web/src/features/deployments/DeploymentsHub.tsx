/**
 * DeploymentsHub — Centralized Model Deployments & Lifecycle Management.
 *
 * Provides a unified workspace for managing all active and stopped local endpoints:
 * - Real-time status indicators (RUNNING, STOPPED, FAILED, STARTING)
 * - Operational metrics (Inferences, Latency, Port/Host)
 * - Full lifecycle actions (Start, Stop, Restart, Redeploy, Delete, Open Studio)
 * - Traceable lineage from Dataset → Training Run → Model Artifact → Deployment
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Rocket,
  Play,
  Square,
  RotateCcw,
  RefreshCw,
  Trash2,
  Cpu,
  Zap,
  Terminal,
  Copy,
  Check,
  Search,
  Filter,
  Loader2,
  X,
  Layers,
  Crown,
  GitBranch,
  Archive,
  ArrowUpCircle,
  Database,
  CheckCircle2,
  History,
  ShieldCheck,
  Sliders,
} from 'lucide-react';
import {
  LocalDeploymentService,
  type LocalDeploymentResponse,
  type ModelVersionOption,
} from '../../services/localDeploymentService';
import {
  ModelRegistryService,
  type RegisteredModel,
  type ModelFamily,
  type ModelLineage,
} from '../../services/modelRegistryService';
import { DeploymentStudio } from './DeploymentStudio';
import { useProject } from '../../providers/ProjectContext';

interface DeploymentsHubProps {
  onShowToast?: (title: string, desc?: string, type?: 'success' | 'info' | 'error') => void;
  initialDeploymentId?: string | null;
}

const STATUS_CONFIG: Record<
  string,
  { bg: string; text: string; dot: string; label: string }
> = {
  RUNNING:   { bg: 'rgba(0,245,160,0.12)',   text: '#00F5A0', dot: '#00F5A0', label: 'RUNNING' },
  READY:     { bg: 'rgba(0,245,160,0.12)',   text: '#00F5A0', dot: '#00F5A0', label: 'RUNNING' },
  STARTING:  { bg: 'rgba(245,166,35,0.15)',  text: '#F5A623', dot: '#F5A623', label: 'STARTING' },
  DEPLOYING: { bg: 'rgba(245,166,35,0.15)',  text: '#F5A623', dot: '#F5A623', label: 'STARTING' },
  STOPPED:   { bg: 'rgba(100,116,139,0.15)', text: '#94A3B8', dot: '#64748B', label: 'STOPPED' },
  STOPPING:  { bg: 'rgba(245,166,35,0.12)',  text: '#F5A623', dot: '#F5A623', label: 'STOPPING' },
  FAILED:    { bg: 'rgba(239,68,68,0.15)',   text: '#FF4D6D', dot: '#FF4D6D', label: 'FAILED' },
  CREATED:   { bg: 'rgba(59,130,246,0.15)',  text: '#60A5FA', dot: '#60A5FA', label: 'CREATED' },
};

export const DeploymentsHub: React.FC<DeploymentsHubProps> = ({
  onShowToast,
  initialDeploymentId,
}) => {
  const { activeJob, selectedTarget } = useProject();
  const [deployments, setDeployments] = useState<LocalDeploymentResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Currently opened studio view (if null, list view is shown)
  const [activeDeploymentId, setActiveDeploymentId] = useState<string | null>(initialDeploymentId || null);

  // Hub Tab Navigation: 'endpoints' vs 'registry'
  const [hubTab, setHubTab] = useState<'endpoints' | 'registry'>('endpoints');

  // Model Registry State
  const [registeredModels, setRegisteredModels] = useState<RegisteredModel[]>([]);
  const [modelFamilies, setModelFamilies] = useState<ModelFamily[]>([]);
  const [registryLoading, setRegistryLoading] = useState(false);
  const [registrySearch, setRegistrySearch] = useState('');
  const [registryStatusFilter, setRegistryStatusFilter] = useState<string>('ALL');
  const [registryActionLoading, setRegistryActionLoading] = useState<Record<string, boolean>>({});

  // Lineage Drawer State
  const [lineageModalModel, setLineageModalModel] = useState<RegisteredModel | null>(null);
  const [lineageData, setLineageData] = useState<ModelLineage | null>(null);
  const [lineageLoading, setLineageLoading] = useState(false);
  const [lineageTab, setLineageTab] = useState<'diagram' | 'json'>('diagram');
  const [copiedLineageJson, setCopiedLineageJson] = useState(false);

  // Modals
  const [logsModalDep, setLogsModalDep] = useState<LocalDeploymentResponse | null>(null);
  const [redeployModalDep, setRedeployModalDep] = useState<LocalDeploymentResponse | null>(null);
  const [availableVersions, setAvailableVersions] = useState<ModelVersionOption[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string>('');
  const [redeployLoading, setRedeployLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Load all deployments
  const fetchDeployments = useCallback(async () => {
    try {
      const data = await LocalDeploymentService.list();
      setDeployments(data);
    } catch (err: any) {
      onShowToast?.('Failed to Load Deployments', err?.detail || err?.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [onShowToast]);

  // Load Model Registry
  const fetchRegistry = useCallback(async () => {
    setRegistryLoading(true);
    try {
      const [modelsRes, familiesRes] = await Promise.all([
        ModelRegistryService.listModels(),
        ModelRegistryService.listFamilies(),
      ]);
      setRegisteredModels(modelsRes.models || []);
      setModelFamilies(familiesRes.families || []);
    } catch {
      // ignore
    } finally {
      setRegistryLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDeployments();
    fetchRegistry();
  }, [fetchDeployments, fetchRegistry]);

  useEffect(() => {
    if (initialDeploymentId) {
      setActiveDeploymentId(initialDeploymentId);
      setHubTab('endpoints');
    }
  }, [initialDeploymentId]);

  // Model Registry Actions
  const handlePromote = async (modelId: string) => {
    setRegistryActionLoading((prev) => ({ ...prev, [modelId]: true }));
    try {
      await ModelRegistryService.promoteModel(modelId);
      onShowToast?.('Model Promoted to Champion!', 'Set as canonical production version.', 'success');
      await Promise.all([fetchRegistry(), fetchDeployments()]);
    } catch (err: any) {
      onShowToast?.('Promotion Failed', err?.detail || err?.message, 'error');
    } finally {
      setRegistryActionLoading((prev) => ({ ...prev, [modelId]: false }));
    }
  };

  const handleArchive = async (modelId: string) => {
    setRegistryActionLoading((prev) => ({ ...prev, [modelId]: true }));
    try {
      await ModelRegistryService.archiveModel(modelId, 'Archived via governance console');
      onShowToast?.('Model Archived', 'Model version archived.', 'info');
      await fetchRegistry();
    } catch (err: any) {
      onShowToast?.('Archive Failed', err?.detail || err?.message, 'error');
    } finally {
      setRegistryActionLoading((prev) => ({ ...prev, [modelId]: false }));
    }
  };

  const handleRestore = async (modelId: string) => {
    setRegistryActionLoading((prev) => ({ ...prev, [modelId]: true }));
    try {
      await ModelRegistryService.restoreModel(modelId);
      onShowToast?.('Model Restored', 'Model restored to active status.', 'success');
      await fetchRegistry();
    } catch (err: any) {
      onShowToast?.('Restore Failed', err?.detail || err?.message, 'error');
    } finally {
      setRegistryActionLoading((prev) => ({ ...prev, [modelId]: false }));
    }
  };

  const handleDeployModel = async (model: RegisteredModel) => {
    setRegistryActionLoading((prev) => ({ ...prev, [model.model_id]: true }));
    try {
      const dep = await LocalDeploymentService.create({
        jobId: model.job_id || undefined,
        modelId: model.model_id,
        name: `${model.algorithm} Service`,
      });
      onShowToast?.('Serving Endpoint Created!', `${model.algorithm} is live and ready for inference.`, 'success');
      await fetchDeployments();
      setActiveDeploymentId(dep.deployment_id);
    } catch (err: any) {
      onShowToast?.('Deployment Failed', err?.detail || err?.message, 'error');
    } finally {
      setRegistryActionLoading((prev) => ({ ...prev, [model.model_id]: false }));
    }
  };

  const handleOpenLineage = async (model: RegisteredModel) => {
    setLineageModalModel(model);
    setLineageLoading(true);
    try {
      const lin = await ModelRegistryService.getLineage(model.model_id);
      setLineageData(lin);
    } catch {
      setLineageData(null);
    } finally {
      setLineageLoading(false);
    }
  };

  // Synchronize initialDeploymentId prop & activeJob
  useEffect(() => {
    if (initialDeploymentId) {
      setActiveDeploymentId(initialDeploymentId);
      setHubTab('endpoints');
    } else if (activeJob?.job_id && deployments.length > 0) {
      const match = deployments.find((d) => d.job_id === activeJob.job_id);
      if (match) {
        setActiveDeploymentId(match.deployment_id);
      }
    }
  }, [initialDeploymentId, activeJob?.job_id, deployments]);


  /* ── Filtered Deployments ── */
  const filteredDeployments = useMemo(() => {
    return deployments.filter((d) => {
      const matchSearch =
        d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.algorithm.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.target_column.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (d.algorithm_display_name && d.algorithm_display_name.toLowerCase().includes(searchQuery.toLowerCase()));

      const isRunning = d.status === 'RUNNING' || d.status === 'READY';
      const isStopped = d.status === 'STOPPED';
      const isFailed = d.status === 'FAILED';

      if (statusFilter === 'RUNNING') return matchSearch && isRunning;
      if (statusFilter === 'STOPPED') return matchSearch && isStopped;
      if (statusFilter === 'FAILED') return matchSearch && isFailed;
      return matchSearch;
    });
  }, [deployments, searchQuery, statusFilter]);

  /* ── Metrics ── */
  const totalInferences = useMemo(
    () => deployments.reduce((acc, d) => acc + (d.total_predictions || 0), 0),
    [deployments]
  );
  const activeCount = useMemo(
    () => deployments.filter((d) => d.status === 'RUNNING' || d.status === 'READY').length,
    [deployments]
  );

  /* ── Model Registry Computations ── */
  const championModelIdSet = useMemo(() => {
    const s = new Set<string>();
    for (const fam of modelFamilies) {
      if (fam.champion_model_id) s.add(fam.champion_model_id);
    }
    return s;
  }, [modelFamilies]);

  const filteredRegisteredModels = useMemo(() => {
    return registeredModels.filter((m) => {
      const q = registrySearch.toLowerCase();
      const matchSearch =
        m.algorithm.toLowerCase().includes(q) ||
        (m.model_family && m.model_family.toLowerCase().includes(q)) ||
        m.model_id.toLowerCase().includes(q) ||
        (m.problem_type && m.problem_type.toLowerCase().includes(q)) ||
        (m.version && m.version.toLowerCase().includes(q));

      const isChamp = championModelIdSet.has(m.model_id);
      const isActive = m.status === 'ACTIVE';
      const isArchived = m.status === 'ARCHIVED';

      if (registryStatusFilter === 'CHAMPION') return matchSearch && isChamp;
      if (registryStatusFilter === 'ACTIVE') return matchSearch && isActive;
      if (registryStatusFilter === 'ARCHIVED') return matchSearch && isArchived;
      return matchSearch;
    });
  }, [registeredModels, registrySearch, registryStatusFilter, championModelIdSet]);

  const championCount = useMemo(() => {
    return registeredModels.filter((m) => championModelIdSet.has(m.model_id)).length;
  }, [registeredModels, championModelIdSet]);

  const governedActiveCount = useMemo(() => {
    return registeredModels.filter((m) => m.status === 'ACTIVE').length;
  }, [registeredModels]);

  const archivedCount = useMemo(() => {
    return registeredModels.filter((m) => m.status === 'ARCHIVED').length;
  }, [registeredModels]);

  /* ── Lifecycle Handlers ── */
  const handleStart = async (depId: string) => {
    setActionLoading((prev) => ({ ...prev, [depId]: true }));
    try {
      const updated = await LocalDeploymentService.start(depId);
      setDeployments((prev) => prev.map((d) => (d.deployment_id === depId ? updated : d)));
      onShowToast?.('Endpoint Started', 'Serving traffic on port 8000.', 'success');
    } catch (err: any) {
      onShowToast?.('Start Failed', err?.detail || err?.message, 'error');
    } finally {
      setActionLoading((prev) => ({ ...prev, [depId]: false }));
    }
  };

  const handleStop = async (depId: string) => {
    setActionLoading((prev) => ({ ...prev, [depId]: true }));
    try {
      const updated = await LocalDeploymentService.stop(depId);
      setDeployments((prev) => prev.map((d) => (d.deployment_id === depId ? updated : d)));
      onShowToast?.('Endpoint Stopped', 'Artifact preserved in registry.', 'info');
    } catch (err: any) {
      onShowToast?.('Stop Failed', err?.detail || err?.message, 'error');
    } finally {
      setActionLoading((prev) => ({ ...prev, [depId]: false }));
    }
  };

  const handleRestart = async (depId: string) => {
    setActionLoading((prev) => ({ ...prev, [depId]: true }));
    try {
      const updated = await LocalDeploymentService.restart(depId);
      setDeployments((prev) => prev.map((d) => (d.deployment_id === depId ? updated : d)));
      onShowToast?.('Endpoint Restarted', 'Model reloaded into cache.', 'success');
    } catch (err: any) {
      onShowToast?.('Restart Failed', err?.detail || err?.message, 'error');
    } finally {
      setActionLoading((prev) => ({ ...prev, [depId]: false }));
    }
  };

  const handleDelete = async (depId: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete "${name}" and all its prediction history?`)) {
      return;
    }
    setActionLoading((prev) => ({ ...prev, [depId]: true }));
    try {
      await LocalDeploymentService.delete(depId);
      setDeployments((prev) => prev.filter((d) => d.deployment_id !== depId));
      if (activeDeploymentId === depId) setActiveDeploymentId(null);
      onShowToast?.('Deployment Deleted', `Deleted "${name}".`, 'info');
    } catch (err: any) {
      onShowToast?.('Delete Failed', err?.detail || err?.message, 'error');
    } finally {
      setActionLoading((prev) => ({ ...prev, [depId]: false }));
    }
  };

  const openRedeployModal = async (dep: LocalDeploymentResponse) => {
    setRedeployModalDep(dep);
    setSelectedVersionId(dep.model_id);
    try {
      const versions = await LocalDeploymentService.getVersions(dep.deployment_id);
      setAvailableVersions(versions);
    } catch {
      setAvailableVersions([]);
    }
  };

  const handleExecuteRedeploy = async () => {
    if (!redeployModalDep) return;
    setRedeployLoading(true);
    try {
      const payload = selectedVersionId !== redeployModalDep.model_id ? { model_id: selectedVersionId } : undefined;
      const updated = await LocalDeploymentService.redeploy(redeployModalDep.deployment_id, payload);
      setDeployments((prev) =>
        prev.map((d) => (d.deployment_id === updated.deployment_id ? updated : d))
      );
      setRedeployModalDep(null);
      onShowToast?.('Redeployment Complete', `Serving version ${updated.model_version}`, 'success');
    } catch (err: any) {
      onShowToast?.('Redeploy Failed', err?.detail || err?.message, 'error');
    } finally {
      setRedeployLoading(false);
    }
  };

  const copyEndpoint = (endpointPath: string, id: string) => {
    const full = `http://localhost:8000${endpointPath}`;
    navigator.clipboard.writeText(full);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
    onShowToast?.('URL Copied', full, 'info');
  };

  /* ── If a Deployment is selected for Studio view ── */
  if (activeDeploymentId) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Studio Top Context Bar */}
        <div
          style={{
            padding: '12px 24px',
            background: '#040912',
            borderBottom: '1px solid #142236',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button
              onClick={() => setActiveDeploymentId(null)}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid #1A2C46',
                borderRadius: 8,
                padding: '6px 12px',
                color: '#94A3B8',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all 150ms ease',
              }}
            >
              ← All Deployments
            </button>

            {/* Deployment Switcher Dropdown */}
            {deployments.length > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: '#475569', fontWeight: 600 }}>SWITCH ENDPOINT:</span>
                <select
                  value={activeDeploymentId}
                  onChange={(e) => setActiveDeploymentId(e.target.value)}
                  style={{
                    background: '#071222',
                    border: '1px solid #1B3150',
                    borderRadius: 6,
                    color: '#E2E8F0',
                    fontSize: 12,
                    padding: '4px 10px',
                    outline: 'none',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  {deployments.map((d) => (
                    <option key={d.deployment_id} value={d.deployment_id}>
                      {d.name} — Target: {d.target_column || 'unknown'} ({d.status})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={fetchDeployments}
              style={{
                background: 'none',
                border: 'none',
                color: '#64748B',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 12,
              }}
            >
              <RefreshCw size={13} /> Refresh
            </button>
          </div>
        </div>

        {/* Studio Workspace */}
        <div style={{ flex: 1, minHeight: 0 }}>
          <DeploymentStudio
            onShowToast={onShowToast}
            selectedDeploymentId={activeDeploymentId}
            onDeploymentChange={fetchDeployments}
          />
        </div>
      </div>
    );
  }

  /* ── Deployments Management Area (Hub Table View) ── */
  return (
    <div
      style={{
        height: '100%',
        overflowY: 'auto',
        padding: '28px 36px',
        background: '#050B14',
        color: '#E2E8F0',
      }}
    >
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: '#F8FAFC',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              margin: 0,
            }}
          >
            {hubTab === 'endpoints' ? (
              <>
                <Rocket size={22} style={{ color: '#00F5A0' }} />
                Model Deployments & Lifecycle
              </>
            ) : (
              <>
                <Layers size={22} style={{ color: '#00D4FF' }} />
                Enterprise Model Registry & Governance
              </>
            )}
          </h1>
          <p style={{ fontSize: 13, color: '#64748B', margin: '4px 0 0 0' }}>
            {hubTab === 'endpoints'
              ? 'Production-grade local endpoints with persistent inference audits, schema validation, and zero-downtime redeployment.'
              : 'End-to-end lineage tracing from Dataset → Training Job → Model Weights → Active Serving Endpoints with Champion/Challenger promotion.'}
          </p>
        </div>

        <button
          onClick={hubTab === 'endpoints' ? fetchDeployments : fetchRegistry}
          disabled={hubTab === 'endpoints' ? loading : registryLoading}
          style={{
            background: '#0A1424',
            border: '1px solid #16263F',
            borderRadius: 8,
            padding: '8px 14px',
            color: '#94A3B8',
            fontSize: 12,
            fontWeight: 700,
            cursor: (hubTab === 'endpoints' ? loading : registryLoading) ? 'wait' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 7,
          }}
        >
          <RefreshCw
            size={14}
            className={(hubTab === 'endpoints' ? loading : registryLoading) ? 'animate-spin' : ''}
          />{' '}
          {hubTab === 'endpoints' ? 'Refresh Endpoints' : 'Refresh Registry'}
        </button>
      </div>

      {/* ── Sub-navigation Tabs: Active Endpoints vs Model Registry ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 24,
          borderBottom: '1px solid #14243B',
          paddingBottom: 12,
        }}
      >
        <button
          onClick={() => setHubTab('endpoints')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 18px',
            borderRadius: 8,
            background: hubTab === 'endpoints' ? 'rgba(0, 245, 160, 0.12)' : 'transparent',
            border: hubTab === 'endpoints' ? '1px solid rgba(0, 245, 160, 0.4)' : '1px solid transparent',
            color: hubTab === 'endpoints' ? '#00F5A0' : '#94A3B8',
            fontSize: 13,
            fontWeight: 800,
            cursor: 'pointer',
            transition: 'all 150ms ease',
          }}
        >
          <Rocket size={16} />
          <span>Active Serving Endpoints</span>
          <span
            style={{
              padding: '2px 7px',
              borderRadius: 99,
              fontSize: 11,
              fontWeight: 800,
              background: hubTab === 'endpoints' ? 'rgba(0, 245, 160, 0.2)' : 'rgba(255, 255, 255, 0.06)',
              color: hubTab === 'endpoints' ? '#00F5A0' : '#64748B',
            }}
          >
            {deployments.length}
          </span>
        </button>

        <button
          onClick={() => setHubTab('registry')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 18px',
            borderRadius: 8,
            background: hubTab === 'registry' ? 'rgba(0, 212, 255, 0.12)' : 'transparent',
            border: hubTab === 'registry' ? '1px solid rgba(0, 212, 255, 0.4)' : '1px solid transparent',
            color: hubTab === 'registry' ? '#00D4FF' : '#94A3B8',
            fontSize: 13,
            fontWeight: 800,
            cursor: 'pointer',
            transition: 'all 150ms ease',
          }}
        >
          <Layers size={16} />
          <span>Enterprise Model Registry & Lineage</span>
          <span
            style={{
              padding: '2px 7px',
              borderRadius: 99,
              fontSize: 11,
              fontWeight: 800,
              background: hubTab === 'registry' ? 'rgba(0, 212, 255, 0.2)' : 'rgba(255, 255, 255, 0.06)',
              color: hubTab === 'registry' ? '#00D4FF' : '#64748B',
            }}
          >
            {registeredModels.length}
          </span>
        </button>
      </div>

      {hubTab === 'endpoints' ? (
        <>
          {/* ── Active Project Model Ready to Deploy Banner ── */}
          {activeJob?.status === 'COMPLETED' && !deployments.some((d) => d.job_id === activeJob.job_id) && (
            <div
              style={{
                marginBottom: 20,
                padding: '14px 20px',
                background: 'linear-gradient(135deg, rgba(0, 245, 160, 0.12) 0%, rgba(0, 212, 255, 0.08) 100%)',
                border: '1px solid rgba(0, 245, 160, 0.35)',
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: 'rgba(0, 245, 160, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#00F5A0',
                  }}
                >
                  <Rocket size={18} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#FFFFFF' }}>
                    Active Trained Model Ready to Deploy
                  </div>
                  <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>
                    Algorithm: <strong style={{ color: '#00F5A0' }}>{activeJob.algorithm}</strong> • Target Column: <strong style={{ color: '#FCD34D' }}>{activeJob.target_column || selectedTarget}</strong> • Features: {activeJob.feature_columns?.length || 0}
                  </div>
                </div>
              </div>

              <button
                onClick={async () => {
                  try {
                    const dep = await LocalDeploymentService.create(
                      activeJob.job_id,
                      `${activeJob.algorithm || 'Model'} Service`
                    );
                    onShowToast?.(
                      'Serving Endpoint Created!',
                      `${activeJob.algorithm} endpoint is live for ${activeJob.target_column || selectedTarget}.`,
                      'success'
                    );
                    await fetchDeployments();
                    setActiveDeploymentId(dep.deployment_id);
                  } catch (err: any) {
                    onShowToast?.('Deployment Failed', err?.detail || err?.message, 'error');
                  }
                }}
                style={{
                  padding: '8px 18px',
                  borderRadius: 8,
                  background: 'linear-gradient(135deg, #00F5A0 0%, #00D4FF 100%)',
                  color: '#050B14',
                  fontWeight: 800,
                  fontSize: 12,
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  boxShadow: '0 0 16px rgba(0, 245, 160, 0.35)',
                  transition: 'all 150ms ease',
                }}
              >
                <Rocket size={14} />
                <span>Deploy Model to Serving Endpoint</span>
              </button>
            </div>
          )}

          {/* ── Metrics Bar ── */}
          <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            background: '#091322',
            border: '1px solid #14243B',
            borderRadius: 12,
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 10,
              background: 'rgba(0, 245, 160, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#00F5A0',
            }}
          >
            <Zap size={20} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
              Active Endpoints
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#FFFFFF', marginTop: 2 }}>
              {activeCount} <span style={{ fontSize: 13, fontWeight: 500, color: '#475569' }}>/ {deployments.length}</span>
            </div>
          </div>
        </div>

        <div
          style={{
            background: '#091322',
            border: '1px solid #14243B',
            borderRadius: 12,
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 10,
              background: 'rgba(0, 212, 255, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#00D4FF',
            }}
          >
            <Cpu size={20} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
              Total Inferences Served
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#FFFFFF', marginTop: 2 }}>
              {totalInferences.toLocaleString()} <span style={{ fontSize: 13, fontWeight: 500, color: '#475569' }}>reqs</span>
            </div>
          </div>
        </div>

        <div
          style={{
            background: '#091322',
            border: '1px solid #14243B',
            borderRadius: 12,
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 10,
              background: 'rgba(168, 85, 247, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#A855F7',
            }}
          >
            <Layers size={20} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
              Registered Deployments
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#FFFFFF', marginTop: 2 }}>
              {deployments.length} <span style={{ fontSize: 13, fontWeight: 500, color: '#475569' }}>models</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Search & Filter Controls ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 18,
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ position: 'relative', width: 340 }}>
          <Search
            size={15}
            style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#475569' }}
          />
          <input
            type="text"
            placeholder="Search deployments, algorithms, targets…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '9px 12px 9px 36px',
              borderRadius: 8,
              background: '#071220',
              border: '1px solid #172840',
              color: '#F1F5F9',
              fontSize: 13,
              outline: 'none',
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Filter size={13} style={{ color: '#64748B' }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Filter:</span>
          {(['ALL', 'RUNNING', 'STOPPED', 'FAILED'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: statusFilter === st ? '1px solid #00D4FF' : '1px solid #16263F',
                background: statusFilter === st ? 'rgba(0, 212, 255, 0.12)' : '#071220',
                color: statusFilter === st ? '#00D4FF' : '#94A3B8',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* ── Deployments List / Table ── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#64748B' }}>
          <Loader2 size={28} className="animate-spin" style={{ margin: '0 auto 12px' }} />
          Loading local deployments…
        </div>
      ) : filteredDeployments.length === 0 ? (
        <div
          style={{
            background: '#091322',
            border: '1px solid #152540',
            borderRadius: 14,
            padding: 56,
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <Rocket size={36} style={{ color: '#334155' }} />
          <div style={{ fontSize: 16, fontWeight: 700, color: '#94A3B8' }}>
            {deployments.length === 0 ? 'No Model Deployments Yet' : 'No Deployments Match Filter'}
          </div>
          <p style={{ fontSize: 13, color: '#475569', maxWidth: 440, margin: 0, lineHeight: 1.5 }}>
            {deployments.length === 0
              ? 'Train a model on the Dataset Profiler or Pipeline Studio page. Once completed, deploy it directly to start serving real-time local predictions.'
              : 'Try changing your search term or status filter above.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filteredDeployments.map((dep) => {
            const isRunning = dep.status === 'RUNNING' || dep.status === 'READY';
            const statusCfg = STATUS_CONFIG[dep.status] || STATUS_CONFIG.STOPPED;
            const isActionBusy = actionLoading[dep.deployment_id] || false;

            return (
              <div
                key={dep.deployment_id}
                style={{
                  background: '#071222',
                  border: isRunning ? '1px solid rgba(0, 245, 160, 0.25)' : '1px solid #14243B',
                  borderRadius: 12,
                  padding: '18px 22px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 20,
                  transition: 'border-color 150ms ease',
                }}
              >
                {/* Column 1: Identity & Model */}
                <div style={{ minWidth: 260 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <span style={{ fontSize: 16, fontWeight: 800, color: '#FFFFFF' }}>{dep.name}</span>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        padding: '2px 7px',
                        borderRadius: 4,
                        background: 'rgba(168, 85, 247, 0.15)',
                        color: '#C084FC',
                      }}
                    >
                      {dep.model_version}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#64748B' }}>
                    <span style={{ color: '#00D4FF', fontWeight: 600 }}>{dep.algorithm_display_name || dep.algorithm}</span>
                    <span>•</span>
                    <span>
                      Target: <strong style={{ color: '#00F5A0' }}>{dep.target_column}</strong>
                    </span>
                    <span>•</span>
                    <span>{dep.feature_columns.length} features</span>
                  </div>
                </div>

                {/* Column 2: Status & Endpoint URL */}
                <div style={{ minWidth: 240 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    {/* Status Pill */}
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '4px 10px',
                        borderRadius: 99,
                        background: statusCfg.bg,
                        border: `1px solid ${statusCfg.dot}33`,
                      }}
                    >
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: '50%',
                          background: statusCfg.dot,
                        }}
                      />
                      <span style={{ fontSize: 11, fontWeight: 800, color: statusCfg.text, letterSpacing: '0.06em' }}>
                        {statusCfg.label}
                      </span>
                    </div>

                    <span style={{ fontSize: 11, color: '#475569' }}>
                      Port: 8000
                    </span>
                  </div>

                  {/* Endpoint copyable pill */}
                  <div
                    onClick={() => copyEndpoint(dep.endpoint_path, dep.deployment_id)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '3px 8px',
                      borderRadius: 6,
                      background: '#040912',
                      border: '1px solid #142032',
                      fontSize: 11,
                      fontFamily: 'var(--font-mono, monospace)',
                      color: '#94A3B8',
                      cursor: 'pointer',
                    }}
                  >
                    <span>{dep.endpoint_path}</span>
                    {copiedId === dep.deployment_id ? (
                      <Check size={11} style={{ color: '#00F5A0' }} />
                    ) : (
                      <Copy size={11} style={{ color: '#475569' }} />
                    )}
                  </div>
                </div>

                {/* Column 3: Telemetry & Timestamps */}
                <div style={{ minWidth: 160, fontSize: 12 }}>
                  <div style={{ color: '#64748B', marginBottom: 4 }}>
                    Total Inferences:{' '}
                    <strong style={{ color: '#FFFFFF', fontFamily: 'var(--font-mono, monospace)' }}>
                      {dep.total_predictions.toLocaleString()}
                    </strong>
                  </div>
                  <div style={{ color: '#475569', fontSize: 11 }}>
                    Created: {new Date(dep.created_at).toLocaleDateString()}
                  </div>
                </div>

                {/* Column 4: Operational Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {/* Start / Stop Toggle */}
                  {isRunning ? (
                    <button
                      onClick={() => handleStop(dep.deployment_id)}
                      disabled={isActionBusy}
                      title="Stop Serving Endpoint"
                      style={{
                        padding: '7px 12px',
                        borderRadius: 8,
                        background: 'rgba(245,166,35,0.08)',
                        border: '1px solid rgba(245,166,35,0.3)',
                        color: '#F5A623',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <Square size={13} /> Stop
                    </button>
                  ) : (
                    <button
                      onClick={() => handleStart(dep.deployment_id)}
                      disabled={isActionBusy}
                      title="Start Serving Endpoint"
                      style={{
                        padding: '7px 12px',
                        borderRadius: 8,
                        background: 'rgba(0, 245, 160, 0.1)',
                        border: '1px solid rgba(0, 245, 160, 0.3)',
                        color: '#00F5A0',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <Play size={13} /> Start
                    </button>
                  )}

                  {/* Restart */}
                  <button
                    onClick={() => handleRestart(dep.deployment_id)}
                    disabled={isActionBusy}
                    title="Restart Endpoint"
                    style={{
                      padding: '7px 10px',
                      borderRadius: 8,
                      background: '#091526',
                      border: '1px solid #162A44',
                      color: '#94A3B8',
                      fontSize: 12,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <RotateCcw size={13} />
                  </button>

                  {/* Redeploy Version */}
                  <button
                    onClick={() => openRedeployModal(dep)}
                    disabled={isActionBusy}
                    title="Redeploy / Switch Version"
                    style={{
                      padding: '7px 10px',
                      borderRadius: 8,
                      background: '#091526',
                      border: '1px solid #162A44',
                      color: '#00D4FF',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                    }}
                  >
                    <RefreshCw size={12} /> Redeploy
                  </button>

                  {/* View Logs */}
                  <button
                    onClick={() => setLogsModalDep(dep)}
                    title="Lifecycle Logs"
                    style={{
                      padding: '7px 10px',
                      borderRadius: 8,
                      background: '#091526',
                      border: '1px solid #162A44',
                      color: '#94A3B8',
                      cursor: 'pointer',
                    }}
                  >
                    <Terminal size={13} />
                  </button>

                  {/* Primary Action: Open Studio */}
                  <button
                    onClick={() => setActiveDeploymentId(dep.deployment_id)}
                    style={{
                      padding: '7px 14px',
                      borderRadius: 8,
                      background: 'linear-gradient(135deg, #00D4FF, #00F5A0)',
                      border: 'none',
                      color: '#08111E',
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <Rocket size={13} /> Open Studio
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(dep.deployment_id, dep.name)}
                    disabled={isActionBusy}
                    title="Delete Deployment"
                    style={{
                      padding: '7px 9px',
                      borderRadius: 8,
                      background: 'rgba(239, 68, 68, 0.08)',
                      border: '1px solid rgba(239, 68, 68, 0.25)',
                      color: '#FF4D6D',
                      cursor: 'pointer',
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
        </>
      ) : (
        <>
          {/* ── Registry Metrics Bar (4 KPIs) ── */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 16,
              marginBottom: 24,
            }}
          >
            {/* Card 1: Registered Models */}
            <div
              style={{
                background: '#091322',
                border: '1px solid #14243B',
                borderRadius: 12,
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
              }}
            >
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 10,
                  background: 'rgba(0, 212, 255, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#00D4FF',
                }}
              >
                <Layers size={20} />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                  Total Registered Models
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#FFFFFF', marginTop: 2 }}>
                  {registeredModels.length} <span style={{ fontSize: 13, fontWeight: 500, color: '#475569' }}>versions</span>
                </div>
              </div>
            </div>

            {/* Card 2: Production Champions */}
            <div
              style={{
                background: '#091322',
                border: '1px solid #14243B',
                borderRadius: 12,
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
              }}
            >
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 10,
                  background: 'rgba(245, 166, 35, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#F5A623',
                }}
              >
                <Crown size={20} />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                  Production Champions
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#FFFFFF', marginTop: 2 }}>
                  {championCount} <span style={{ fontSize: 13, fontWeight: 500, color: '#475569' }}>active</span>
                </div>
              </div>
            </div>

            {/* Card 3: Model Families */}
            <div
              style={{
                background: '#091322',
                border: '1px solid #14243B',
                borderRadius: 12,
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
              }}
            >
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 10,
                  background: 'rgba(168, 85, 247, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#A855F7',
                }}
              >
                <GitBranch size={20} />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                  Tracked Model Families
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#FFFFFF', marginTop: 2 }}>
                  {modelFamilies.length} <span style={{ fontSize: 13, fontWeight: 500, color: '#475569' }}>families</span>
                </div>
              </div>
            </div>

            {/* Card 4: Governed Versions */}
            <div
              style={{
                background: '#091322',
                border: '1px solid #14243B',
                borderRadius: 12,
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
              }}
            >
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 10,
                  background: 'rgba(0, 245, 160, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#00F5A0',
                }}
              >
                <ShieldCheck size={20} />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                  Governed Active Versions
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#FFFFFF', marginTop: 2 }}>
                  {governedActiveCount} <span style={{ fontSize: 13, fontWeight: 500, color: '#475569' }}>models</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Registry Search & Filter Controls ── */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 18,
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ position: 'relative', width: 380 }}>
              <Search
                size={15}
                style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#475569' }}
              />
              <input
                type="text"
                placeholder="Search algorithm, family, model ID, or problem type…"
                value={registrySearch}
                onChange={(e) => setRegistrySearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px 9px 36px',
                  borderRadius: 8,
                  background: '#071220',
                  border: '1px solid #172840',
                  color: '#F1F5F9',
                  fontSize: 13,
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Filter size={13} style={{ color: '#64748B' }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Filter:</span>
              {(['ALL', 'CHAMPION', 'ACTIVE', 'ARCHIVED'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setRegistryStatusFilter(st)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: registryStatusFilter === st ? '1px solid #00D4FF' : '1px solid #16263F',
                    background: registryStatusFilter === st ? 'rgba(0, 212, 255, 0.12)' : '#071220',
                    color: registryStatusFilter === st ? '#00D4FF' : '#94A3B8',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {st === 'ALL' && `ALL (${registeredModels.length})`}
                  {st === 'CHAMPION' && `CHAMPIONS (${championCount})`}
                  {st === 'ACTIVE' && `ACTIVE (${governedActiveCount})`}
                  {st === 'ARCHIVED' && `ARCHIVED (${archivedCount})`}
                </button>
              ))}
            </div>
          </div>

          {/* ── Registry Models List ── */}
          {registryLoading ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#64748B' }}>
              <Loader2 size={28} className="animate-spin" style={{ margin: '0 auto 12px' }} />
              Loading Model Registry & Governance Records…
            </div>
          ) : filteredRegisteredModels.length === 0 ? (
            <div
              style={{
                background: '#091322',
                border: '1px solid #152540',
                borderRadius: 14,
                padding: 56,
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <Layers size={36} style={{ color: '#334155' }} />
              <div style={{ fontSize: 16, fontWeight: 700, color: '#94A3B8' }}>
                {registeredModels.length === 0 ? 'No Registered Models in Registry' : 'No Models Match Filter'}
              </div>
              <p style={{ fontSize: 13, color: '#475569', maxWidth: 440, margin: 0, lineHeight: 1.5 }}>
                {registeredModels.length === 0
                  ? 'Execute model training in Pipeline Studio. Trained models are automatically assigned semantic versions and registered here.'
                  : 'Try modifying your search query or switching your status filter.'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {filteredRegisteredModels.map((model) => {
                const isChamp = championModelIdSet.has(model.model_id);
                const isAct = model.status === 'ACTIVE';
                const isBusy = registryActionLoading[model.model_id] || false;
                const activeDep = deployments.find(
                  (d) => d.model_id === model.model_id || (model.job_id && d.job_id === model.job_id)
                );

                return (
                  <div
                    key={model.model_id}
                    style={{
                      background: '#071222',
                      border: isChamp
                        ? '1px solid rgba(245, 166, 35, 0.35)'
                        : isAct
                        ? '1px solid #162A44'
                        : '1px solid #111D2E',
                      borderRadius: 12,
                      padding: '20px 24px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 14,
                      position: 'relative',
                      boxShadow: isChamp ? '0 0 20px rgba(245, 166, 35, 0.05)' : 'none',
                    }}
                  >
                    {/* Top Row: Badges, Algorithm & Version */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        {/* Champion / Challenger badge */}
                        {isChamp ? (
                          <div
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '4px 10px',
                              borderRadius: 99,
                              background: 'rgba(245, 166, 35, 0.15)',
                              border: '1px solid rgba(245, 166, 35, 0.45)',
                              color: '#FFD166',
                              fontSize: 11,
                              fontWeight: 800,
                              letterSpacing: '0.04em',
                            }}
                          >
                            <Crown size={13} style={{ color: '#F5A623' }} /> PRODUCTION CHAMPION
                          </div>
                        ) : isAct ? (
                          <div
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '4px 10px',
                              borderRadius: 99,
                              background: 'rgba(0, 212, 255, 0.12)',
                              border: '1px solid rgba(0, 212, 255, 0.3)',
                              color: '#00D4FF',
                              fontSize: 11,
                              fontWeight: 800,
                              letterSpacing: '0.04em',
                            }}
                          >
                            <Zap size={12} /> CHALLENGER / CANDIDATE
                          </div>
                        ) : (
                          <div
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '4px 10px',
                              borderRadius: 99,
                              background: 'rgba(100, 116, 139, 0.15)',
                              border: '1px solid #1E293B',
                              color: '#94A3B8',
                              fontSize: 11,
                              fontWeight: 800,
                              letterSpacing: '0.04em',
                            }}
                          >
                            <Archive size={12} /> ARCHIVED
                          </div>
                        )}

                        {/* Semantic Version Pill */}
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 800,
                            padding: '3px 9px',
                            borderRadius: 6,
                            background: 'rgba(168, 85, 247, 0.15)',
                            border: '1px solid rgba(168, 85, 247, 0.3)',
                            color: '#C084FC',
                            fontFamily: 'var(--font-mono, monospace)',
                          }}
                        >
                          {model.semantic_version || model.version}
                        </span>

                        {/* Problem Type Tag */}
                        {model.problem_type && (
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              padding: '3px 8px',
                              borderRadius: 6,
                              background: '#0B182B',
                              border: '1px solid #16263F',
                              color: '#64748B',
                            }}
                          >
                            {model.problem_type}
                          </span>
                        )}

                        {/* Operational Deployment Indicator */}
                        {activeDep && (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              fontSize: 11,
                              fontWeight: 700,
                              color: '#00F5A0',
                              background: 'rgba(0, 245, 160, 0.1)',
                              border: '1px solid rgba(0, 245, 160, 0.3)',
                              padding: '3px 9px',
                              borderRadius: 6,
                            }}
                          >
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#00F5A0' }} />
                            Live on Port 8000 ({activeDep.total_predictions.toLocaleString()} reqs)
                          </span>
                        )}
                      </div>

                      {/* Model ID Pill */}
                      <span
                        style={{
                          fontSize: 11,
                          fontFamily: 'var(--font-mono, monospace)',
                          color: '#475569',
                        }}
                      >
                        ID: {model.model_id}
                      </span>
                    </div>

                    {/* Middle Section: Algorithm Name + Family + Metrics */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(280px, 1.2fr) minmax(320px, 2fr)',
                        gap: 20,
                        alignItems: 'center',
                      }}
                    >
                      {/* Left: Algorithm & Family */}
                      <div>
                        <div style={{ fontSize: 17, fontWeight: 800, color: '#FFFFFF', marginBottom: 4 }}>
                          {model.algorithm}
                        </div>
                        <div style={{ fontSize: 12, color: '#64748B', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <GitBranch size={13} style={{ color: '#00D4FF' }} />
                          <span style={{ fontFamily: 'var(--font-mono, monospace)', color: '#94A3B8' }}>
                            {model.model_family || `${model.algorithm}@${model.dataset_id.slice(0, 12)}…`}
                          </span>
                        </div>
                      </div>

                      {/* Right: Key Performance Metrics Strip */}
                      <div
                        style={{
                          background: '#040812',
                          border: '1px solid #122034',
                          borderRadius: 8,
                          padding: '10px 16px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 18,
                          flexWrap: 'wrap',
                        }}
                      >
                        {/* Accuracy or R2 */}
                        <div>
                          <div style={{ fontSize: 10, color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                            {model.problem_type?.toLowerCase().includes('regress') ? 'R² Score' : 'Accuracy'}
                          </div>
                          <div style={{ fontSize: 15, fontWeight: 800, color: '#00F5A0', fontFamily: 'var(--font-mono, monospace)', marginTop: 2 }}>
                            {model.accuracy != null
                              ? `${(model.accuracy * 100).toFixed(1)}%`
                              : typeof model.metrics?.accuracy === 'number'
                              ? `${(model.metrics.accuracy * 100).toFixed(1)}%`
                              : typeof model.metrics?.r2_score === 'number'
                              ? model.metrics.r2_score.toFixed(3)
                              : typeof model.metrics_summary?.r2_score === 'number'
                              ? model.metrics_summary.r2_score.toFixed(3)
                              : '—'}
                          </div>
                        </div>

                        {/* F1 or RMSE */}
                        <div>
                          <div style={{ fontSize: 10, color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                            {model.problem_type?.toLowerCase().includes('regress') ? 'RMSE' : 'F1 Score'}
                          </div>
                          <div style={{ fontSize: 15, fontWeight: 800, color: '#00D4FF', fontFamily: 'var(--font-mono, monospace)', marginTop: 2 }}>
                            {model.f1 != null
                              ? model.f1.toFixed(3)
                              : typeof model.metrics?.f1_score === 'number'
                              ? model.metrics.f1_score.toFixed(3)
                              : typeof model.metrics?.rmse === 'number'
                              ? model.metrics.rmse.toFixed(3)
                              : typeof model.metrics_summary?.rmse === 'number'
                              ? model.metrics_summary.rmse.toFixed(3)
                              : '—'}
                          </div>
                        </div>

                        {/* AUC or MAE */}
                        <div>
                          <div style={{ fontSize: 10, color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                            {model.problem_type?.toLowerCase().includes('regress') ? 'MAE' : 'ROC AUC'}
                          </div>
                          <div style={{ fontSize: 15, fontWeight: 800, color: '#A855F7', fontFamily: 'var(--font-mono, monospace)', marginTop: 2 }}>
                            {model.auc != null
                              ? model.auc.toFixed(3)
                              : typeof model.metrics?.roc_auc === 'number'
                              ? model.metrics.roc_auc.toFixed(3)
                              : typeof model.metrics?.mae === 'number'
                              ? model.metrics.mae.toFixed(3)
                              : typeof model.metrics_summary?.mae === 'number'
                              ? model.metrics_summary.mae.toFixed(3)
                              : '—'}
                          </div>
                        </div>

                        {/* Training Job ID */}
                        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                          <div style={{ fontSize: 10, color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                            Job Provenance
                          </div>
                          <div style={{ fontSize: 11, color: '#94A3B8', fontFamily: 'var(--font-mono, monospace)', marginTop: 2 }}>
                            {model.job_id ? model.job_id.slice(0, 16) + '…' : 'Manual Upload'}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Row: Metadata info + Action Buttons */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingTop: 12,
                        borderTop: '1px solid #101D30',
                        gap: 16,
                        flexWrap: 'wrap',
                      }}
                    >
                      {/* Left: Provenance metadata */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12, color: '#64748B' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <Database size={13} style={{ color: '#00D4FF' }} />
                          Dataset: <strong style={{ color: '#CBD5E1' }}>{model.dataset_id.slice(0, 16)}…</strong>
                        </span>
                        <span>•</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <History size={13} style={{ color: '#A855F7' }} />
                          Registered: {new Date(model.registered_at).toLocaleDateString()}
                        </span>
                      </div>

                      {/* Right: Governance Actions */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {/* Promote to Champion */}
                        {!isChamp && isAct && (
                          <button
                            onClick={() => handlePromote(model.model_id)}
                            disabled={isBusy}
                            style={{
                              padding: '7px 12px',
                              borderRadius: 8,
                              background: 'rgba(245, 166, 35, 0.1)',
                              border: '1px solid rgba(245, 166, 35, 0.35)',
                              color: '#FFD166',
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: isBusy ? 'wait' : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            <ArrowUpCircle size={13} /> Promote to Champion
                          </button>
                        )}

                        {/* Deploy Serving Endpoint */}
                        {isAct && !activeDep && (
                          <button
                            onClick={() => handleDeployModel(model)}
                            disabled={isBusy}
                            style={{
                              padding: '7px 13px',
                              borderRadius: 8,
                              background: 'rgba(0, 245, 160, 0.12)',
                              border: '1px solid rgba(0, 245, 160, 0.35)',
                              color: '#00F5A0',
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: isBusy ? 'wait' : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            {isBusy ? <Loader2 size={13} className="animate-spin" /> : <Rocket size={13} />}
                            Deploy Endpoint
                          </button>
                        )}

                        {/* If already active endpoint deployed, open studio */}
                        {activeDep && (
                          <button
                            onClick={() => setActiveDeploymentId(activeDep.deployment_id)}
                            style={{
                              padding: '7px 13px',
                              borderRadius: 8,
                              background: 'linear-gradient(135deg, #00D4FF, #00F5A0)',
                              border: 'none',
                              color: '#08111E',
                              fontSize: 12,
                              fontWeight: 800,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            <Rocket size={13} /> Open Studio
                          </button>
                        )}

                        {/* View Lineage */}
                        <button
                          onClick={() => handleOpenLineage(model)}
                          style={{
                            padding: '7px 12px',
                            borderRadius: 8,
                            background: '#091526',
                            border: '1px solid #162A44',
                            color: '#00D4FF',
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                          }}
                        >
                          <GitBranch size={13} /> Lineage
                        </button>

                        {/* Archive / Restore */}
                        {isAct ? (
                          <button
                            onClick={() => handleArchive(model.model_id)}
                            disabled={isBusy}
                            title="Archive Model Version"
                            style={{
                              padding: '7px 10px',
                              borderRadius: 8,
                              background: 'rgba(100, 116, 139, 0.1)',
                              border: '1px solid #1C2B42',
                              color: '#94A3B8',
                              fontSize: 12,
                              cursor: 'pointer',
                            }}
                          >
                            <Archive size={13} />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleRestore(model.model_id)}
                            disabled={isBusy}
                            title="Restore Model Version"
                            style={{
                              padding: '7px 10px',
                              borderRadius: 8,
                              background: 'rgba(0, 245, 160, 0.1)',
                              border: '1px solid rgba(0, 245, 160, 0.3)',
                              color: '#00F5A0',
                              fontSize: 12,
                              cursor: 'pointer',
                            }}
                          >
                            <RotateCcw size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── Lifecycle Logs Modal ── */}
      <AnimatePresence>
        {logsModalDep && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.7)',
              backdropFilter: 'blur(4px)',
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 24,
            }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              style={{
                background: '#071222',
                border: '1px solid #1B3150',
                borderRadius: 14,
                width: '100%',
                maxWidth: 700,
                maxHeight: '80vh',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  padding: '16px 20px',
                  borderBottom: '1px solid #14243B',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Terminal size={16} style={{ color: '#00D4FF' }} />
                  <span style={{ fontSize: 14, fontWeight: 800, color: '#FFFFFF' }}>
                    Lifecycle Logs: {logsModalDep.name}
                  </span>
                </div>
                <button
                  onClick={() => setLogsModalDep(null)}
                  style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer' }}
                >
                  <X size={18} />
                </button>
              </div>

              <div
                style={{
                  padding: 16,
                  overflowY: 'auto',
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: 11,
                  background: '#040812',
                  flex: 1,
                }}
              >
                {logsModalDep.logs && logsModalDep.logs.length > 0 ? (
                  [...logsModalDep.logs].reverse().map((l, i) => (
                    <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 6 }}>
                      <span style={{ color: '#475569', flexShrink: 0 }}>
                        {new Date(l.ts).toLocaleTimeString()}
                      </span>
                      {l.event && (
                        <span style={{ color: '#00D4FF', fontWeight: 700, flexShrink: 0 }}>
                          [{l.event}]
                        </span>
                      )}
                      <span style={{ color: l.severity === 'ERROR' ? '#FF4D6D' : '#94A3B8' }}>
                        {l.msg}
                      </span>
                    </div>
                  ))
                ) : (
                  <div style={{ color: '#475569' }}>No log entries recorded.</div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Redeploy / Version Upgrade Modal ── */}
      <AnimatePresence>
        {redeployModalDep && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.7)',
              backdropFilter: 'blur(4px)',
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 24,
            }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              style={{
                background: '#071222',
                border: '1px solid #1B3150',
                borderRadius: 14,
                width: '100%',
                maxWidth: 580,
                padding: 24,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <RefreshCw size={18} style={{ color: '#00D4FF' }} />
                  <span style={{ fontSize: 16, fontWeight: 800, color: '#FFFFFF' }}>
                    Redeploy Endpoint: {redeployModalDep.name}
                  </span>
                </div>
                <button
                  onClick={() => setRedeployModalDep(null)}
                  style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer' }}
                >
                  <X size={18} />
                </button>
              </div>

              <p style={{ fontSize: 13, color: '#94A3B8', marginBottom: 18 }}>
                Select a model version to deploy. Upgrading to a new model version updates the input schema and preprocessor while preserving historical prediction records.
              </p>

              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
                  Target Model Version
                </label>
                {availableVersions.length > 0 ? (
                  <select
                    value={selectedVersionId}
                    onChange={(e) => setSelectedVersionId(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 8,
                      background: '#040912',
                      border: '1px solid #1E293B',
                      color: '#F1F5F9',
                      fontSize: 13,
                      outline: 'none',
                    }}
                  >
                    {availableVersions.map((v) => (
                      <option key={v.model_id} value={v.model_id}>
                        {v.algorithm_display_name} — {v.version} {v.is_current ? '(Currently Deployed)' : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div style={{ fontSize: 12, color: '#64748B', padding: 8 }}>
                    Current artifact: <strong>{redeployModalDep.model_version}</strong> (Only 1 version registered)
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  onClick={() => setRedeployModalDep(null)}
                  style={{
                    padding: '9px 16px',
                    borderRadius: 8,
                    background: 'transparent',
                    border: '1px solid #1E293B',
                    color: '#94A3B8',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleExecuteRedeploy}
                  disabled={redeployLoading}
                  style={{
                    padding: '9px 18px',
                    borderRadius: 8,
                    background: 'linear-gradient(135deg, #00D4FF, #00F5A0)',
                    border: 'none',
                    color: '#08111E',
                    fontSize: 13,
                    fontWeight: 800,
                    cursor: redeployLoading ? 'wait' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  {redeployLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  Confirm Redeployment
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Model Lineage & Provenance Modal ── */}
      <AnimatePresence>
        {lineageModalModel && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.75)',
              backdropFilter: 'blur(5px)',
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 24,
            }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              style={{
                background: '#071222',
                border: '1px solid #1B3150',
                borderRadius: 16,
                width: '100%',
                maxWidth: 960,
                maxHeight: '85vh',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
              }}
            >
              {/* Modal Header */}
              <div
                style={{
                  padding: '18px 24px',
                  borderBottom: '1px solid #14243B',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: '#050B15',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      background: 'rgba(0, 212, 255, 0.12)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#00D4FF',
                    }}
                  >
                    <GitBranch size={18} />
                  </div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: 8 }}>
                      Lineage Provenance: {lineageModalModel.algorithm}
                      <span
                        style={{
                          fontSize: 11,
                          padding: '2px 7px',
                          borderRadius: 4,
                          background: 'rgba(168, 85, 247, 0.2)',
                          color: '#C084FC',
                          fontFamily: 'var(--font-mono, monospace)',
                        }}
                      >
                        {lineageModalModel.semantic_version || lineageModalModel.version}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: '#64748B', marginTop: 2, fontFamily: 'var(--font-mono, monospace)' }}>
                      Model ID: {lineageModalModel.model_id}
                    </div>
                  </div>
                </div>

                {/* Tab Switcher & Close */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ display: 'flex', background: '#091526', padding: 3, borderRadius: 8, border: '1px solid #162A44' }}>
                    <button
                      onClick={() => setLineageTab('diagram')}
                      style={{
                        padding: '5px 12px',
                        borderRadius: 6,
                        border: 'none',
                        background: lineageTab === 'diagram' ? '#00D4FF' : 'transparent',
                        color: lineageTab === 'diagram' ? '#08111E' : '#94A3B8',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Visual Flow DAG
                    </button>
                    <button
                      onClick={() => setLineageTab('json')}
                      style={{
                        padding: '5px 12px',
                        borderRadius: 6,
                        border: 'none',
                        background: lineageTab === 'json' ? '#00D4FF' : 'transparent',
                        color: lineageTab === 'json' ? '#08111E' : '#94A3B8',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Audit JSON
                    </button>
                  </div>

                  <button
                    onClick={() => {
                      setLineageModalModel(null);
                      setLineageData(null);
                    }}
                    style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', padding: 4 }}
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div style={{ padding: 24, overflowY: 'auto', flex: 1, background: '#050B14' }}>
                {lineageLoading ? (
                  <div style={{ textAlign: 'center', padding: 60, color: '#64748B' }}>
                    <Loader2 size={28} className="animate-spin" style={{ margin: '0 auto 12px' }} />
                    Tracing Lineage Graph across data stores…
                  </div>
                ) : lineageTab === 'diagram' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <div style={{ fontSize: 13, color: '#94A3B8', lineHeight: 1.5 }}>
                      Full end-to-end cryptographic and metadata audit trail linking the source dataset profile through training job hyperparameters, checkpoint artifact weights, and operational serving endpoints:
                    </div>

                    {/* Visual 4-Node Pipeline Flow */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, 1fr)',
                        gap: 14,
                        position: 'relative',
                      }}
                    >
                      {/* Node 1: Dataset Provenance */}
                      <div
                        style={{
                          background: '#071222',
                          border: '1px solid #15263F',
                          borderRadius: 12,
                          padding: 16,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 10,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Database size={16} style={{ color: '#00D4FF' }} />
                          <span style={{ fontSize: 12, fontWeight: 800, color: '#FFFFFF', textTransform: 'uppercase' }}>
                            1. Dataset Profile
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: '#64748B' }}>
                          Source identifier & schema profile:
                        </div>
                        <div
                          style={{
                            background: '#040812',
                            padding: '8px 10px',
                            borderRadius: 6,
                            fontSize: 11,
                            fontFamily: 'var(--font-mono, monospace)',
                            color: '#94A3B8',
                          }}
                        >
                          <div style={{ color: '#00D4FF', marginBottom: 2 }}>
                            {lineageData?.dataset_provenance?.dataset_name || lineageModalModel.dataset_id}
                          </div>
                          <div>Rows: {lineageData?.dataset_provenance?.row_count ?? 'N/A'}</div>
                          <div>Features: {lineageData?.dataset_provenance?.feature_count ?? lineageData?.feature_columns?.length ?? 'N/A'}</div>
                          <div>Target: {lineageData?.dataset_provenance?.target_column || 'Target Column'}</div>
                        </div>
                      </div>

                      {/* Node 2: Training Job Execution */}
                      <div
                        style={{
                          background: '#071222',
                          border: '1px solid #15263F',
                          borderRadius: 12,
                          padding: 16,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 10,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Cpu size={16} style={{ color: '#A855F7' }} />
                          <span style={{ fontSize: 12, fontWeight: 800, color: '#FFFFFF', textTransform: 'uppercase' }}>
                            2. Training Run
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: '#64748B' }}>
                          Execution parameters & job ID:
                        </div>
                        <div
                          style={{
                            background: '#040812',
                            padding: '8px 10px',
                            borderRadius: 6,
                            fontSize: 11,
                            fontFamily: 'var(--font-mono, monospace)',
                            color: '#94A3B8',
                          }}
                        >
                          <div style={{ color: '#A855F7', marginBottom: 2 }}>
                            Job: {lineageModalModel.job_id ? lineageModalModel.job_id.slice(0, 16) + '…' : 'Manual'}
                          </div>
                          <div>Task: {lineageModalModel.problem_type || 'Classification'}</div>
                          <div>Algorithm: {lineageModalModel.algorithm}</div>
                          <div>Framework: Scikit-Learn</div>
                        </div>
                      </div>

                      {/* Node 3: Registered Artifact */}
                      <div
                        style={{
                          background: '#071222',
                          border: '1px solid #15263F',
                          borderRadius: 12,
                          padding: 16,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 10,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Layers size={16} style={{ color: '#F5A623' }} />
                          <span style={{ fontSize: 12, fontWeight: 800, color: '#FFFFFF', textTransform: 'uppercase' }}>
                            3. Model Artifact
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: '#64748B' }}>
                          Versioned checkpoint & metrics:
                        </div>
                        <div
                          style={{
                            background: '#040812',
                            padding: '8px 10px',
                            borderRadius: 6,
                            fontSize: 11,
                            fontFamily: 'var(--font-mono, monospace)',
                            color: '#94A3B8',
                          }}
                        >
                          <div style={{ color: '#FFD166', marginBottom: 2 }}>
                            Version: {lineageModalModel.semantic_version || lineageModalModel.version}
                          </div>
                          <div>Status: {lineageModalModel.status}</div>
                          <div>
                            Score:{' '}
                            {lineageModalModel.accuracy != null
                              ? `${(lineageModalModel.accuracy * 100).toFixed(1)}% Acc`
                              : typeof lineageModalModel.metrics?.r2_score === 'number'
                              ? `${lineageModalModel.metrics.r2_score.toFixed(3)} R²`
                              : 'Trained'}
                          </div>
                          <div>Format: Joblib binary</div>
                        </div>
                      </div>

                      {/* Node 4: Serving Deployment */}
                      {(() => {
                        const activeDep = deployments.find(
                          (d) => d.model_id === lineageModalModel.model_id || (lineageModalModel.job_id && d.job_id === lineageModalModel.job_id)
                        );
                        return (
                          <div
                            style={{
                              background: '#071222',
                              border: activeDep ? '1px solid rgba(0, 245, 160, 0.4)' : '1px solid #15263F',
                              borderRadius: 12,
                              padding: 16,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 10,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <Rocket size={16} style={{ color: activeDep ? '#00F5A0' : '#64748B' }} />
                              <span style={{ fontSize: 12, fontWeight: 800, color: '#FFFFFF', textTransform: 'uppercase' }}>
                                4. Live Serving
                              </span>
                            </div>
                            <div style={{ fontSize: 11, color: '#64748B' }}>
                              Operational endpoint status:
                            </div>
                            <div
                              style={{
                                background: '#040812',
                                padding: '8px 10px',
                                borderRadius: 6,
                                fontSize: 11,
                                fontFamily: 'var(--font-mono, monospace)',
                                color: '#94A3B8',
                              }}
                            >
                              {activeDep ? (
                                <>
                                  <div style={{ color: '#00F5A0', marginBottom: 2, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
                                    <CheckCircle2 size={12} /> {activeDep.status}
                                  </div>
                                  <div>Port: 8000</div>
                                  <div>Requests: {activeDep.total_predictions.toLocaleString()}</div>
                                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    Path: {activeDep.endpoint_path}
                                  </div>
                                </>
                              ) : (
                                <div style={{ color: '#64748B', fontStyle: 'italic', padding: '6px 0' }}>
                                  No live endpoint running for this model artifact.
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Hyperparameters & Feature Columns Breakdown */}
                    <div
                      style={{
                        background: '#071222',
                        border: '1px solid #14243B',
                        borderRadius: 12,
                        padding: 16,
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#FFFFFF', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Sliders size={15} style={{ color: '#00D4FF' }} />
                        Trained Hyperparameters & Feature Schema
                      </div>

                      {lineageData?.hyperparameters && Object.keys(lineageData.hyperparameters).length > 0 ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {Object.entries(lineageData.hyperparameters).map(([k, v]) => (
                            <div
                              key={k}
                              style={{
                                background: '#040812',
                                border: '1px solid #16263F',
                                borderRadius: 6,
                                padding: '4px 10px',
                                fontSize: 11,
                                fontFamily: 'var(--font-mono, monospace)',
                              }}
                            >
                              <span style={{ color: '#64748B' }}>{k}: </span>
                              <span style={{ color: '#00D4FF', fontWeight: 700 }}>{JSON.stringify(v)}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, color: '#64748B' }}>
                          Standard default algorithm hyperparameters used during fit.
                        </div>
                      )}

                      {/* Feature Columns */}
                      {lineageData?.feature_columns && lineageData.feature_columns.length > 0 && (
                        <div style={{ marginTop: 14 }}>
                          <div style={{ fontSize: 11, color: '#64748B', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>
                            Input Feature Columns ({lineageData.feature_columns.length}):
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {lineageData.feature_columns.map((col) => (
                              <span
                                key={col}
                                style={{
                                  background: '#091526',
                                  padding: '2px 8px',
                                  borderRadius: 4,
                                  fontSize: 11,
                                  fontFamily: 'var(--font-mono, monospace)',
                                  color: '#CBD5E1',
                                }}
                              >
                                {col}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
                      <button
                        onClick={() => {
                          const str = JSON.stringify({ model: lineageModalModel, lineage: lineageData }, null, 2);
                          navigator.clipboard.writeText(str);
                          setCopiedLineageJson(true);
                          setTimeout(() => setCopiedLineageJson(false), 2000);
                        }}
                        style={{
                          background: '#091526',
                          border: '1px solid #162A44',
                          borderRadius: 6,
                          padding: '6px 12px',
                          color: '#00D4FF',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        {copiedLineageJson ? <Check size={13} style={{ color: '#00F5A0' }} /> : <Copy size={13} />}
                        {copiedLineageJson ? 'Copied Audit JSON!' : 'Copy Lineage JSON'}
                      </button>
                    </div>
                    <pre
                      style={{
                        background: '#040812',
                        border: '1px solid #122034',
                        borderRadius: 10,
                        padding: 16,
                        color: '#94A3B8',
                        fontSize: 12,
                        fontFamily: 'var(--font-mono, monospace)',
                        maxHeight: 500,
                        overflowY: 'auto',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {JSON.stringify({ model: lineageModalModel, lineage: lineageData }, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
