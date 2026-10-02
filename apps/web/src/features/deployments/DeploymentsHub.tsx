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
} from 'lucide-react';
import {
  LocalDeploymentService,
  type LocalDeploymentResponse,
  type ModelVersionOption,
} from '../../services/localDeploymentService';
import { DeploymentStudio } from './DeploymentStudio';

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
  const [deployments, setDeployments] = useState<LocalDeploymentResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Currently opened studio view (if null, list view is shown)
  const [activeDeploymentId, setActiveDeploymentId] = useState<string | null>(initialDeploymentId || null);

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

  useEffect(() => {
    fetchDeployments();
  }, [fetchDeployments]);

  // Synchronize initialDeploymentId prop
  useEffect(() => {
    if (initialDeploymentId) {
      setActiveDeploymentId(initialDeploymentId);
    }
  }, [initialDeploymentId]);

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
                      {d.name} ({d.model_version}) — {d.status}
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
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
            <Rocket size={22} style={{ color: '#00F5A0' }} />
            Model Deployments & Lifecycle
          </h1>
          <p style={{ fontSize: 13, color: '#64748B', margin: '4px 0 0 0' }}>
            Production-grade local endpoints with persistent inference audits, schema validation, and zero-downtime redeployment.
          </p>
        </div>

        <button
          onClick={fetchDeployments}
          disabled={loading}
          style={{
            background: '#0A1424',
            border: '1px solid #16263F',
            borderRadius: 8,
            padding: '8px 14px',
            color: '#94A3B8',
            fontSize: 12,
            fontWeight: 700,
            cursor: loading ? 'wait' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 7,
          }}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh Endpoints
        </button>
      </div>

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
    </div>
  );
};
