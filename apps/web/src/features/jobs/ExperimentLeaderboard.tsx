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
import { ModelRegistryService } from '../../services/modelRegistryService';

interface ExperimentLeaderboardProps {
  currentJob: JobEntity;
  fileJobs?: Record<string, JobEntity>;
  activeExperimentFile?: string;
  onSelectJob: (job: JobEntity, fileName?: string) => void;
  onDeployJob: (job: JobEntity) => void;
  onPromoteChampion?: (job: JobEntity) => void;
  targetColumn?: string;
}

/* ── Blueberry & Maroon Design System Tokens ───────────────────────── */
const T = {
  bg: 'var(--bb-surface, #1B1530)',
  surface: 'var(--bb-elevated, #2A2247)',
  elevated: 'var(--bb-elevated, #2A2247)',
  surfaceHover: 'var(--bb-primary-faint, rgba(107, 92, 166, 0.12))',
  border: 'var(--bb-primary-border, rgba(107, 92, 166, 0.18))',
  borderSubtle: 'rgba(107, 92, 166, 0.10)',
  accent: 'var(--bb-primary-light, #6C5CA6)',
  accentHover: '#8A7DC0',
  accentSubtle: 'var(--bb-primary-faint, rgba(107, 92, 166, 0.12))',
  accentBorder: 'var(--bb-primary-ring, rgba(107, 92, 166, 0.35))',
  gold: 'var(--bb-gold, #C9A24B)',
  goldSubtle: 'var(--bb-gold-faint, rgba(201, 162, 75, 0.12))',
  goldBorder: 'rgba(201, 162, 75, 0.35)',
  success: '#22C55E',
  successSubtle: 'rgba(34, 197, 94, 0.12)',
  successBorder: 'rgba(34, 197, 94, 0.35)',
  maroon: 'var(--bb-maroon, #6E1423)',
  maroonHover: 'var(--bb-maroon-hover, #8E2A3C)',
  maroonLight: '#B23A4E',
  error: 'var(--bb-error, #B23A4E)',
  text: 'var(--bb-text, #F5F1EC)',
  textSec: 'var(--bb-muted, #9E93B8)',
  textDim: 'var(--bb-placeholder, #5E5480)',
  mono: 'var(--font-mono, "JetBrains Mono", monospace)',
  ui: 'var(--font-ui, "Space Grotesk", sans-serif)',
};

const blueBadgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  width: 'fit-content',
  padding: '2px 8px',
  borderRadius: 4,
  background: 'rgba(0, 212, 255, 0.16)',
  border: '1px solid rgba(0, 212, 255, 0.38)',
  color: '#FFFFFF',
  fontSize: 10,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  fontFamily: 'var(--font-ui, "Space Grotesk", sans-serif)',
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
  onPromoteChampion,
  targetColumn,
}) => {
  const [remoteJobs, setRemoteJobs] = useState<JobEntity[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRunIds, setSelectedRunIds] = useState<string[]>([currentJob.job_id]);
  const [promotedJobId, setPromotedJobId] = useState<string | null>(null);

  const handlePromoteChampion = (job: JobEntity) => {
    setPromotedJobId(job.job_id);
    onPromoteChampion?.(job);
    if (job.job_id) {
      ModelRegistryService.promoteModel(job.job_id).catch(() => {});
    }
  };

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

    if (promotedJobId) {
      const pIdx = list.findIndex((r) => r.job.job_id === promotedJobId);
      if (pIdx > 0) {
        const [promoted] = list.splice(pIdx, 1);
        list.unshift(promoted);
      }
    }

    return list;
  }, [currentJob, fileJobs, activeExperimentFile, remoteJobs, promotedJobId]);

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
    <div style={{ display: 'flex', flexDirection: 'column', background: T.bg }}>
      {/* ── TOP STATS KPI STRIP (FLAT, CONNECTED, NO FLOATING BOXES) ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          borderBottom: `1px solid ${T.border}`,
          background: T.surface,
        }}
      >
        <div
          style={{
            padding: '14px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            borderRight: `1px solid ${T.border}`,
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 4,
              background: 'rgba(0, 212, 255, 0.16)',
              border: '1px solid rgba(0, 212, 255, 0.38)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Layers style={{ width: 16, height: 16, color: '#00D4FF' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
            <span style={blueBadgeStyle}>
              Tracked Experiments
            </span>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#FFFFFF', fontFamily: T.mono }}>
              {allRuns.length}
            </div>
          </div>
        </div>

        <div
          style={{
            padding: '14px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            borderRight: `1px solid ${T.border}`,
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 4,
              background: T.goldSubtle,
              border: `1px solid ${T.goldBorder}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Crown style={{ width: 16, height: 16, color: T.gold }} />
          </div>
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={blueBadgeStyle}>
              Champion Model
            </span>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: T.gold,
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
            padding: '14px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            borderRight: `1px solid ${T.border}`,
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 4,
              background: T.successSubtle,
              border: `1px solid ${T.successBorder}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Trophy style={{ width: 16, height: 16, color: T.success }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={blueBadgeStyle}>
              Best Score
            </span>
            <div
              style={{
                fontSize: 18,
                fontWeight: 800,
                color: T.success,
                fontFamily: T.mono,
              }}
            >
              {championRun ? formatScore(getScore(championRun.job).key, getScore(championRun.job).val) : '--'}
            </div>
          </div>
        </div>

        <div
          style={{
            padding: '14px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 4,
              background: 'rgba(0, 212, 255, 0.16)',
              border: '1px solid rgba(0, 212, 255, 0.38)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <GitCompare style={{ width: 16, height: 16, color: '#00D4FF' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={blueBadgeStyle}>
              Comparison Mode
            </span>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#FFFFFF' }}>
              {selectedRunIds.length === 2 ? '2 Runs Selected' : 'Select 2 to Diff'}
            </div>
          </div>
        </div>
      </div>

      {/* ── TOOLBAR: SEARCH & COUNT ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '12px 20px',
          borderBottom: `1px solid ${T.border}`,
          background: T.surface,
        }}
      >
        <div style={{ position: 'relative', width: 340 }}>
          <Search
            style={{
              position: 'absolute',
              left: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 14,
              height: 14,
              color: 'rgba(255, 255, 255, 0.6)',
            }}
          />
          <input
            type="text"
            placeholder="Filter runs by algorithm, file, or target..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '6px 10px 6px 32px',
              borderRadius: 4,
              border: '1px solid rgba(255, 255, 255, 0.2)',
              background: T.bg,
              color: '#FFFFFF',
              fontSize: 12,
              outline: 'none',
              fontFamily: T.ui,
            }}
          />
        </div>

        <div style={{ fontSize: 11, color: '#FFFFFF' }}>
          Showing <strong style={{ color: '#FFFFFF' }}>{filteredRuns.length}</strong> of {allRuns.length} runs
        </div>
      </div>

      {/* ── LEADERBOARD TABLE (FLAT, EDGE-TO-EDGE, NO SHADOW OR ROUNDED WRAPPERS) ── */}
      <div style={{ overflowX: 'auto', background: T.surface }}>
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
                background: T.bg,
                borderBottom: `1px solid ${T.border}`,
                color: '#FFFFFF',
                fontSize: 10,
                textTransform: 'uppercase',
                letterSpacing: '0.07em',
              }}
            >
              <th style={{ padding: '10px 14px', width: 44, textAlign: 'center' }}>
                <span style={blueBadgeStyle}>Diff</span>
              </th>
              <th style={{ padding: '10px 14px', width: 60 }}>
                <span style={blueBadgeStyle}>Rank</span>
              </th>
              <th style={{ padding: '10px 14px' }}>
                <span style={blueBadgeStyle}>Experiment Run</span>
              </th>
              <th style={{ padding: '10px 14px' }}>
                <span style={blueBadgeStyle}>Algorithm</span>
              </th>
              <th style={{ padding: '10px 14px' }}>
                <span style={blueBadgeStyle}>Target</span>
              </th>
              <th style={{ padding: '10px 14px' }}>
                <span style={blueBadgeStyle}>Primary Score</span>
              </th>
              <th style={{ padding: '10px 14px' }}>
                <span style={blueBadgeStyle}>Hyperparameters</span>
              </th>
              <th style={{ padding: '10px 14px' }}>
                <span style={blueBadgeStyle}>Status</span>
              </th>
              <th style={{ padding: '10px 14px', textAlign: 'right' }}>
                <span style={{ ...blueBadgeStyle, float: 'right' }}>Actions</span>
              </th>
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
                    borderBottom: `1px solid ${T.borderSubtle}`,
                    background: isCurrent
                      ? T.accentSubtle
                      : isSelectedForDiff
                      ? 'rgba(0, 212, 255, 0.08)'
                      : 'transparent',
                    transition: 'background 100ms ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isCurrent && !isSelectedForDiff) e.currentTarget.style.background = T.surfaceHover;
                  }}
                  onMouseLeave={(e) => {
                    if (!isCurrent && !isSelectedForDiff) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  {/* Checkbox for Diff */}
                  <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={isSelectedForDiff}
                      onChange={() => handleToggleSelect(job.job_id)}
                      style={{ cursor: 'pointer', accentColor: '#00D4FF' }}
                    />
                  </td>

                  {/* Rank */}
                  <td style={{ padding: '10px 14px' }}>
                    {isChampion ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '2px 7px',
                          borderRadius: 3,
                          background: T.goldSubtle,
                          color: T.gold,
                          fontWeight: 700,
                          fontSize: 11,
                          border: `1px solid ${T.goldBorder}`,
                        }}
                      >
                        <Crown size={11} /> #1
                      </span>
                    ) : (
                      <span style={{ fontWeight: 600, color: '#FFFFFF', fontFamily: T.mono, fontSize: 11 }}>
                        #{idx + 1}
                      </span>
                    )}
                  </td>

                  {/* Experiment Run / Source */}
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontWeight: 600, color: '#FFFFFF', fontFamily: T.mono, fontSize: 12 }}>
                        {fileName || `run-${job.job_id.slice(0, 8)}`}
                      </span>
                      {isCurrent && (
                        <span style={{ fontSize: 9.5, color: '#00D4FF', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          ● Active Buffer
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Algorithm */}
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontWeight: 500, color: '#FFFFFF' }}>
                      {formatAlgoName(job.algorithm)}
                    </span>
                  </td>

                  {/* Target */}
                  <td style={{ padding: '10px 14px' }}>
                    <span
                      style={{
                        padding: '2px 7px',
                        borderRadius: 3,
                        background: 'rgba(255, 255, 255, 0.05)',
                        color: '#FFFFFF',
                        fontFamily: T.mono,
                        fontSize: 11,
                        border: '1px solid rgba(255, 255, 255, 0.18)',
                      }}
                    >
                      {job.target_column || targetColumn || '--'}
                    </span>
                  </td>

                  {/* Primary Score */}
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          fontFamily: T.mono,
                          padding: '2px 6px',
                          borderRadius: 3,
                          background: isChampion ? T.successSubtle : 'rgba(255, 255, 255, 0.08)',
                          color: isChampion ? T.success : '#FFFFFF',
                          border: `1px solid ${isChampion ? T.successBorder : 'rgba(255, 255, 255, 0.2)'}`,
                        }}
                      >
                        {formatScore(score.key, score.val)}
                      </span>
                      <span style={{ fontSize: 10, color: '#FFFFFF', textTransform: 'uppercase' }}>
                        {score.key.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </td>

                  {/* Hyperparameters */}
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 11, fontFamily: T.mono }}>
                      <span style={{ color: '#FFFFFF' }}>
                        Scaler: <strong style={{ color: '#FFFFFF' }}>{(job.metadata?.scaler as string) || 'Standard'}</strong>
                      </span>
                      <span style={{ color: 'rgba(255, 255, 255, 0.3)' }}>|</span>
                      <span style={{ color: '#FFFFFF' }}>
                        CV: <strong style={{ color: '#FFFFFF' }}>{String(job.metadata?.cross_validation || 5)}x</strong>
                      </span>
                    </div>
                  </td>

                  {/* Status */}
                  <td style={{ padding: '10px 14px' }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '2px 7px',
                        borderRadius: 3,
                        background:
                          job.status === 'COMPLETED'
                            ? T.successSubtle
                            : T.goldSubtle,
                        color: job.status === 'COMPLETED' ? T.success : T.gold,
                        border: `1px solid ${job.status === 'COMPLETED' ? T.successBorder : T.goldBorder}`,
                      }}
                    >
                      {job.status}
                    </span>
                  </td>

                  {/* Actions */}
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <button
                        onClick={() => onSelectJob(job, fileName)}
                        style={{
                          padding: '3px 8px',
                          borderRadius: 3,
                          background: 'transparent',
                          border: '1px solid rgba(255, 255, 255, 0.25)',
                          color: '#FFFFFF',
                          fontSize: 11,
                          fontWeight: 500,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          fontFamily: T.ui,
                        }}
                        title="Inspect complete results and threshold optimizer"
                      >
                        <Eye size={11} /> Inspect
                      </button>
                      {job.status === 'COMPLETED' && !isChampion && (
                        <button
                          data-testid={`set-champion-${job.job_id}`}
                          onClick={() => handlePromoteChampion(job)}
                          style={{
                            padding: '3px 8px',
                            borderRadius: 3,
                            background: T.goldSubtle,
                            border: `1px solid ${T.goldBorder}`,
                            color: T.gold,
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            fontFamily: T.ui,
                          }}
                          title="Promote this candidate model to Champion"
                        >
                          <Crown size={11} /> Set as Champion
                        </button>
                      )}
                      {job.status === 'COMPLETED' && isChampion && (
                        <span
                          data-testid="champion-badge"
                          style={{
                            padding: '2px 7px',
                            borderRadius: 3,
                            background: T.goldSubtle,
                            border: `1px solid ${T.goldBorder}`,
                            color: T.gold,
                            fontSize: 10,
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            fontFamily: T.ui,
                          }}
                        >
                          <Crown size={10} /> Champion
                        </span>
                      )}
                      {job.status === 'COMPLETED' && (
                        <button
                          onClick={() => onDeployJob(job)}
                          style={{
                            padding: '3px 8px',
                            borderRadius: 3,
                            background: T.successSubtle,
                            border: `1px solid ${T.successBorder}`,
                            color: T.success,
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            fontFamily: T.ui,
                          }}
                          title="Deploy this run to a serving endpoint"
                        >
                          <Rocket size={11} /> Deploy
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

      {/* ── SIDE-BY-SIDE PARAM DIFF PANEL (FLAT, NO SHADOW OR ROUNDED CARD WRAPPER) ── */}
      {comparedRuns.length === 2 && (
        <div
          style={{
            borderTop: `1px solid ${T.border}`,
            background: T.surface,
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <GitCompare style={{ width: 15, height: 15, color: '#00D4FF' }} />
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '2px 8px',
                  borderRadius: 4,
                  background: 'rgba(0, 212, 255, 0.16)',
                  border: '1px solid rgba(0, 212, 255, 0.38)',
                  color: '#FFFFFF',
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  fontFamily: T.ui,
                }}
              >
                Side-by-Side Experiment Parameter Diff
              </span>
            </div>
            <button
              onClick={() => setSelectedRunIds([currentJob.job_id])}
              style={{
                fontSize: 11,
                padding: '3px 8px',
                borderRadius: 3,
                background: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.25)',
                color: '#FFFFFF',
                cursor: 'pointer',
                fontFamily: T.ui,
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
                fontSize: 11,
                fontFamily: T.mono,
              }}
            >
              <thead>
                <tr style={{ borderBottom: `1px solid ${T.border}`, color: '#FFFFFF', textAlign: 'left' }}>
                  <th style={{ padding: '6px 10px', width: 220 }}>
                    <span style={blueBadgeStyle}>Dimension / Config</span>
                  </th>
                  <th style={{ padding: '6px 10px' }}>
                    <span style={blueBadgeStyle}>Run A: {comparedRuns[0].fileName || comparedRuns[0].job.job_id.slice(0, 8)}</span>
                  </th>
                  <th style={{ padding: '6px 10px' }}>
                    <span style={blueBadgeStyle}>Run B: {comparedRuns[1].fileName || comparedRuns[1].job.job_id.slice(0, 8)}</span>
                  </th>
                  <th style={{ padding: '6px 10px', width: 80, textAlign: 'center' }}>
                    <span style={blueBadgeStyle}>Diff State</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {[
                  {
                    name: 'Algorithm',
                    a: comparedRuns[0].job.algorithm?.replace(/_/g, ' ') || '--',
                    b: comparedRuns[1].job.algorithm?.replace(/_/g, ' ') || '--',
                  },
                  {
                    name: 'Primary Metric Score',
                    a: formatScore(getScore(comparedRuns[0].job).key, getScore(comparedRuns[0].job).val),
                    b: formatScore(getScore(comparedRuns[1].job).key, getScore(comparedRuns[1].job).val),
                  },
                  {
                    name: 'Target Column',
                    a: comparedRuns[0].job.target_column || '--',
                    b: comparedRuns[1].job.target_column || '--',
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
                        borderBottom: `1px solid ${T.borderSubtle}`,
                        background: isDiff ? T.goldSubtle : 'transparent',
                      }}
                    >
                      <td style={{ padding: '6px 10px', fontWeight: 600, color: isDiff ? T.gold : '#FFFFFF' }}>
                        {name}
                      </td>
                      <td style={{ padding: '6px 10px', color: '#FFFFFF' }}>{a}</td>
                      <td style={{ padding: '6px 10px', color: '#FFFFFF' }}>{b}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                        {isDiff ? (
                          <span
                            style={{
                              fontSize: 9.5,
                              fontWeight: 800,
                              padding: '1px 5px',
                              borderRadius: 3,
                              background: T.goldSubtle,
                              color: T.gold,
                              border: `1px solid ${T.goldBorder}`,
                            }}
                          >
                            DIFF
                          </span>
                        ) : (
                          <span style={{ fontSize: 9.5, color: '#FFFFFF' }}>SAME</span>
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
