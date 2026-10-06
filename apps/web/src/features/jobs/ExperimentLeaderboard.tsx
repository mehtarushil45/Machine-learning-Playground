import React, { useState, useEffect, useMemo } from 'react';
import {
  Trophy,
  GitCompare,
  Rocket,
  Search,
  Eye,
  Layers,
  Crown,
} from 'lucide-react';
import type { JobEntity } from '../../types/job';
import { fetchJobs } from '../../services/jobService';

interface ExperimentLeaderboardProps {
  currentJob: JobEntity;
  fileJobs?: Record<string, JobEntity>;
  activeExperimentFile?: string;
  onSelectJob: (job: JobEntity, fileName?: string) => void;
  onDeployJob: (job: JobEntity) => void;
  targetColumn?: string;
}

const BB = {
  card: '#1D1737',
  cardHover: '#251D45',
  elevated: '#18132E',
  border: 'rgba(138, 121, 202, 0.22)',
  text: '#FFFFFF',
  textSecondary: '#E2E8F0',
  muted: '#94A3B8',
  subtle: '#64748B',
  primary: '#4B3B7C',
  primaryLight: '#8A79CA',
  gold: '#F59E0B',
  goldLight: '#FBBF24',
  success: '#10B981',
  successLight: '#34D399',
  error: '#F87171',
};

function getScore(job: JobEntity): { key: string; val: number | string } {
  const m = (job.metadata?.metrics || (job as any).metrics || {}) as Record<string, any>;
  for (const k of ['accuracy', 'f1_score', 'f1', 'r2_score', 'r2', 'precision', 'recall', 'rmse', 'mae']) {
    if (k in m && typeof m[k] === 'number') {
      return { key: k, val: m[k] };
    }
  }
  return { key: 'status', val: job.status };
}

function formatAlgoName(algo?: string): string {
  if (!algo) return 'Default';
  return algo.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatScore(key: string, val: number | string): string {
  if (typeof val !== 'number') return String(val);
  const lk = key.toLowerCase();
  if (['mae', 'mse', 'rmse', 'r2', 'r2_score'].includes(lk)) {
    return val.toFixed(4);
  }
  if (val >= 0 && val <= 1) {
    return `${(val * 100).toFixed(1)}%`;
  }
  return val.toFixed(4);
}

export const ExperimentLeaderboard: React.FC<ExperimentLeaderboardProps> = ({
  currentJob,
  fileJobs = {},
  activeExperimentFile,
  onSelectJob,
  onDeployJob,
  targetColumn,
}) => {
  const [remoteJobs, setRemoteJobs] = useState<JobEntity[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRunIds, setSelectedRunIds] = useState<string[]>([currentJob.job_id]);

  useEffect(() => {
    let active = true;
    fetchJobs(0, 30)
      .then((res) => {
        if (active && res && res.jobs) {
          setRemoteJobs(res.jobs);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Merge runs from fileJobs, currentJob, and remoteJobs, deduplicated by job_id
  const allRuns = useMemo(() => {
    const map = new Map<string, { job: JobEntity; fileName?: string }>();

    // 1. Current job
    if (currentJob?.job_id) {
      map.set(currentJob.job_id, { job: currentJob, fileName: activeExperimentFile });
    }

    // 2. File-associated jobs
    Object.entries(fileJobs).forEach(([file, j]) => {
      if (j && j.job_id) {
        map.set(j.job_id, { job: j, fileName: file });
      }
    });

    // 3. Remote jobs
    remoteJobs.forEach((j) => {
      if (j && j.job_id && !map.has(j.job_id)) {
        map.set(j.job_id, { job: j });
      }
    });

    const list = Array.from(map.values());

    // Sort by primary score descending
    list.sort((a, b) => {
      const sa = getScore(a.job);
      const sb = getScore(b.job);
      if (typeof sa.val === 'number' && typeof sb.val === 'number') {
        const isError = ['mae', 'mse', 'rmse'].includes(sa.key.toLowerCase());
        return isError ? sa.val - sb.val : sb.val - sa.val;
      }
      return 0;
    });

    return list;
  }, [currentJob, fileJobs, activeExperimentFile, remoteJobs]);

  const filteredRuns = useMemo(() => {
    if (!searchQuery.trim()) return allRuns;
    const q = searchQuery.toLowerCase();
    return allRuns.filter(({ job, fileName }) => {
      const algo = (job.algorithm || '').toLowerCase();
      const target = (job.target_column || '').toLowerCase();
      const file = (fileName || '').toLowerCase();
      const id = (job.job_id || '').toLowerCase();
      return algo.includes(q) || target.includes(q) || file.includes(q) || id.includes(q);
    });
  }, [allRuns, searchQuery]);

  // Toggle selection for comparison
  const handleToggleSelect = (jobId: string) => {
    setSelectedRunIds((prev) => {
      if (prev.includes(jobId)) {
        return prev.filter((id) => id !== jobId);
      }
      if (prev.length >= 2) {
        // Replace second selection
        return [prev[0], jobId];
      }
      return [...prev, jobId];
    });
  };

  const comparedRuns = useMemo(() => {
    return selectedRunIds
      .map((id) => allRuns.find((r) => r.job.job_id === id))
      .filter(Boolean) as Array<{ job: JobEntity; fileName?: string }>;
  }, [selectedRunIds, allRuns]);

  const championRun = allRuns[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ── TOP STATS KPI STRIP ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: 14,
        }}
      >
        <div
          style={{
            background: BB.card,
            border: `1px solid ${BB.border}`,
            borderRadius: 14,
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: 'rgba(138, 121, 202, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Layers style={{ width: 22, height: 22, color: BB.primaryLight }} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: BB.muted, textTransform: 'uppercase' }}>
              Tracked Experiments
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#FFF', fontFamily: 'var(--font-mono)' }}>
              {allRuns.length}
            </div>
          </div>
        </div>

        <div
          style={{
            background: BB.card,
            border: `1px solid ${BB.border}`,
            borderRadius: 14,
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: 'rgba(245, 158, 11, 0.18)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Crown style={{ width: 22, height: 22, color: BB.gold }} />
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: BB.muted, textTransform: 'uppercase' }}>
              Champion Model
            </div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 800,
                color: BB.gold,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {formatAlgoName(championRun?.job.algorithm)}
            </div>
          </div>
        </div>

        <div
          style={{
            background: BB.card,
            border: `1px solid ${BB.border}`,
            borderRadius: 14,
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: 'rgba(16, 185, 129, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Trophy style={{ width: 22, height: 22, color: BB.successLight }} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: BB.muted, textTransform: 'uppercase' }}>
              Best Score
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 900,
                color: BB.successLight,
                fontFamily: 'var(--font-mono)',
              }}
            >
              {championRun ? formatScore(getScore(championRun.job).key, getScore(championRun.job).val) : '—'}
            </div>
          </div>
        </div>

        <div
          style={{
            background: BB.card,
            border: `1px solid ${BB.border}`,
            borderRadius: 14,
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: 'rgba(56, 189, 248, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <GitCompare style={{ width: 22, height: 22, color: '#38BDF8' }} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: BB.muted, textTransform: 'uppercase' }}>
              Comparison Mode
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#38BDF8' }}>
              {selectedRunIds.length === 2 ? '2 Runs Selected' : 'Select 2 to Diff'}
            </div>
          </div>
        </div>
      </div>

      {/* ── TOOLBAR: SEARCH & ACTIONS ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div style={{ position: 'relative', width: 340 }}>
          <Search
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 15,
              height: 15,
              color: BB.muted,
            }}
          />
          <input
            type="text"
            placeholder="Filter runs by algorithm, file, or target..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px 8px 36px',
              borderRadius: 8,
              border: `1px solid ${BB.border}`,
              background: BB.elevated,
              color: '#FFF',
              fontSize: 12,
              outline: 'none',
            }}
          />
        </div>

        <div style={{ fontSize: 12, color: BB.muted }}>
          Showing <strong>{filteredRuns.length}</strong> of {allRuns.length} runs
        </div>
      </div>

      {/* ── LEADERBOARD TABLE ── */}
      <div
        style={{
          background: BB.card,
          border: `1px solid ${BB.border}`,
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 12,
              textAlign: 'left',
            }}
          >
            <thead>
              <tr
                style={{
                  background: BB.elevated,
                  borderBottom: `1px solid ${BB.border}`,
                  color: BB.muted,
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                <th style={{ padding: '12px 14px', width: 44, textAlign: 'center' }}>Diff</th>
                <th style={{ padding: '12px 14px', width: 60 }}>Rank</th>
                <th style={{ padding: '12px 14px' }}>Experiment Run</th>
                <th style={{ padding: '12px 14px' }}>Algorithm</th>
                <th style={{ padding: '12px 14px' }}>Target</th>
                <th style={{ padding: '12px 14px' }}>Primary Score</th>
                <th style={{ padding: '12px 14px' }}>Hyperparameters</th>
                <th style={{ padding: '12px 14px' }}>Status</th>
                <th style={{ padding: '12px 14px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRuns.map(({ job, fileName }, idx) => {
                const isChampion = idx === 0;
                const isSelectedForDiff = selectedRunIds.includes(job.job_id);
                const isCurrent = job.job_id === currentJob.job_id;
                const score = getScore(job);

                return (
                  <tr
                    key={job.job_id}
                    style={{
                      borderBottom: '1px solid rgba(138, 121, 202, 0.1)',
                      background: isCurrent
                        ? 'rgba(138, 121, 202, 0.1)'
                        : isSelectedForDiff
                        ? 'rgba(56, 189, 248, 0.05)'
                        : 'transparent',
                      transition: 'background 120ms ease',
                    }}
                  >
                    {/* Checkbox for Diff */}
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isSelectedForDiff}
                        onChange={() => handleToggleSelect(job.job_id)}
                        style={{ cursor: 'pointer', accentColor: '#38BDF8' }}
                      />
                    </td>

                    {/* Rank */}
                    <td style={{ padding: '12px 14px' }}>
                      {isChampion ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '2px 8px',
                            borderRadius: 12,
                            background: 'rgba(245, 158, 11, 0.2)',
                            color: BB.gold,
                            fontWeight: 800,
                            border: '1px solid rgba(245, 158, 11, 0.4)',
                          }}
                        >
                          <Crown size={12} /> #1
                        </span>
                      ) : (
                        <span style={{ fontWeight: 700, color: BB.muted, fontFamily: 'var(--font-mono)' }}>
                          #{idx + 1}
                        </span>
                      )}
                    </td>

                    {/* Experiment Run / Source */}
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 700, color: '#FFF', fontFamily: 'var(--font-mono)' }}>
                          {fileName || `run-${job.job_id.slice(0, 8)}`}
                        </span>
                        {isCurrent && (
                          <span style={{ fontSize: 10, color: BB.primaryLight, fontWeight: 700 }}>
                            ● Active Buffer
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Algorithm */}
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ fontWeight: 600, color: BB.textSecondary }}>
                        {formatAlgoName(job.algorithm)}
                      </span>
                    </td>

                    {/* Target */}
                    <td style={{ padding: '12px 14px' }}>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 6,
                          background: 'rgba(255, 255, 255, 0.05)',
                          color: '#FFF',
                          fontFamily: 'var(--font-mono)',
                          fontSize: 11,
                        }}
                      >
                        {job.target_column || targetColumn || '—'}
                      </span>
                    </td>

                    {/* Primary Score */}
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 900,
                            fontFamily: 'var(--font-mono)',
                            padding: '3px 8px',
                            borderRadius: 6,
                            background: isChampion
                              ? 'rgba(16, 185, 129, 0.2)'
                              : 'rgba(138, 121, 202, 0.15)',
                            color: isChampion ? BB.successLight : '#FFF',
                            border: `1px solid ${isChampion ? 'rgba(16, 185, 129, 0.35)' : 'rgba(138, 121, 202, 0.25)'}`,
                          }}
                        >
                          {formatScore(score.key, score.val)}
                        </span>
                        <span style={{ fontSize: 10, color: BB.muted, textTransform: 'uppercase' }}>
                          {score.key.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </td>

                    {/* Hyperparameters */}
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, fontSize: 10.5 }}>
                        <span style={{ color: BB.muted }}>
                          Scaler: <strong>{(job.metadata?.scaler as string) || 'Standard'}</strong>
                        </span>
                        <span style={{ color: BB.subtle }}>|</span>
                        <span style={{ color: BB.muted }}>
                          CV: <strong>{String(job.metadata?.cross_validation || 5)}x</strong>
                        </span>
                      </div>
                    </td>

                    {/* Status */}
                    <td style={{ padding: '12px 14px' }}>
                      <span
                        style={{
                          fontSize: 10.5,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 12,
                          background:
                            job.status === 'COMPLETED'
                              ? 'rgba(16, 185, 129, 0.15)'
                              : 'rgba(245, 158, 11, 0.15)',
                          color: job.status === 'COMPLETED' ? BB.successLight : BB.gold,
                        }}
                      >
                        {job.status}
                      </span>
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <button
                          onClick={() => onSelectJob(job, fileName)}
                          style={{
                            padding: '4px 10px',
                            borderRadius: 6,
                            background: isCurrent ? 'rgba(138, 121, 202, 0.3)' : BB.elevated,
                            border: `1px solid ${BB.border}`,
                            color: '#FFF',
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                          title="Inspect complete results and threshold optimizer"
                        >
                          <Eye size={12} /> Inspect
                        </button>
                        {job.status === 'COMPLETED' && (
                          <button
                            onClick={() => onDeployJob(job)}
                            style={{
                              padding: '4px 10px',
                              borderRadius: 6,
                              background: 'rgba(0, 245, 160, 0.15)',
                              border: '1px solid rgba(0, 245, 160, 0.4)',
                              color: '#00F5A0',
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                            title="Deploy this run to a serving endpoint"
                          >
                            <Rocket size={12} /> Deploy
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── SIDE-BY-SIDE PARAM DIFF PANEL ── */}
      {comparedRuns.length === 2 && (
        <div
          style={{
            background: BB.card,
            border: '1px solid rgba(56, 189, 248, 0.35)',
            borderRadius: 16,
            padding: '20px 24px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <GitCompare style={{ width: 18, height: 18, color: '#38BDF8' }} />
              <span style={{ fontSize: 14, fontWeight: 800, color: '#FFF' }}>
                Side-by-Side Experiment Parameter Diff
              </span>
            </div>
            <button
              onClick={() => setSelectedRunIds([currentJob.job_id])}
              style={{
                fontSize: 11,
                padding: '4px 10px',
                borderRadius: 6,
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: BB.muted,
                cursor: 'pointer',
              }}
            >
              Clear Comparison
            </button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 12,
                fontFamily: 'var(--font-mono)',
              }}
            >
              <thead>
                <tr style={{ borderBottom: `1px solid ${BB.border}`, color: BB.muted, textAlign: 'left' }}>
                  <th style={{ padding: '8px 12px', width: 220 }}>Dimension / Config</th>
                  <th style={{ padding: '8px 12px' }}>
                    Run A: {comparedRuns[0].fileName || comparedRuns[0].job.job_id.slice(0, 8)}
                  </th>
                  <th style={{ padding: '8px 12px' }}>
                    Run B: {comparedRuns[1].fileName || comparedRuns[1].job.job_id.slice(0, 8)}
                  </th>
                  <th style={{ padding: '8px 12px', width: 90, textAlign: 'center' }}>Diff State</th>
                </tr>
              </thead>
              <tbody>
                {[
                  {
                    name: 'Algorithm',
                    a: comparedRuns[0].job.algorithm?.replace(/_/g, ' ') || '—',
                    b: comparedRuns[1].job.algorithm?.replace(/_/g, ' ') || '—',
                  },
                  {
                    name: 'Primary Metric Score',
                    a: formatScore(getScore(comparedRuns[0].job).key, getScore(comparedRuns[0].job).val),
                    b: formatScore(getScore(comparedRuns[1].job).key, getScore(comparedRuns[1].job).val),
                  },
                  {
                    name: 'Target Column',
                    a: comparedRuns[0].job.target_column || '—',
                    b: comparedRuns[1].job.target_column || '—',
                  },
                  {
                    name: 'Feature Columns Count',
                    a: `${comparedRuns[0].job.feature_columns?.length || 0} features`,
                    b: `${comparedRuns[1].job.feature_columns?.length || 0} features`,
                  },
                  {
                    name: 'Feature Scaler',
                    a: (comparedRuns[0].job.metadata?.scaler as string) || 'Standard',
                    b: (comparedRuns[1].job.metadata?.scaler as string) || 'Standard',
                  },
                  {
                    name: 'Missing Value Imputer',
                    a: (comparedRuns[0].job.metadata?.imputer as string) || 'Median',
                    b: (comparedRuns[1].job.metadata?.imputer as string) || 'Median',
                  },
                  {
                    name: 'CV Folds',
                    a: String(comparedRuns[0].job.metadata?.cross_validation || 5),
                    b: String(comparedRuns[1].job.metadata?.cross_validation || 5),
                  },
                  {
                    name: 'Random Seed',
                    a: String(comparedRuns[0].job.metadata?.random_seed ?? 42),
                    b: String(comparedRuns[1].job.metadata?.random_seed ?? 42),
                  },
                ].map(({ name, a, b }) => {
                  const isDiff = a !== b;
                  return (
                    <tr
                      key={name}
                      style={{
                        borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                        background: isDiff ? 'rgba(245, 158, 11, 0.08)' : 'transparent',
                      }}
                    >
                      <td style={{ padding: '8px 12px', fontWeight: 700, color: isDiff ? BB.gold : BB.muted }}>
                        {name}
                      </td>
                      <td style={{ padding: '8px 12px', color: '#FFF' }}>{a}</td>
                      <td style={{ padding: '8px 12px', color: '#FFF' }}>{b}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        {isDiff ? (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 800,
                              padding: '2px 6px',
                              borderRadius: 4,
                              background: 'rgba(245, 158, 11, 0.25)',
                              color: BB.gold,
                              border: '1px solid rgba(245, 158, 11, 0.5)',
                            }}
                          >
                            DIFF
                          </span>
                        ) : (
                          <span style={{ fontSize: 10, color: BB.subtle }}>SAME</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
