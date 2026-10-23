import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ErrorBoundary } from './components/ui/ErrorBoundary';

import {
  Database,
  Code2,
  BarChart2,
  Sparkles,
  Rocket,
  Search,
  FolderOpen,
  GraduationCap,
  User,
  LogIn,
  LogOut,
  X,
} from 'lucide-react';
import { ThemeProvider } from './providers/ThemeProvider';
import { AuthProvider, useAuthContext } from './providers/AuthContext';
import { ProjectProvider, useProject, type LifecycleStage } from './providers/ProjectContext';
import { Toast } from './components/ui/Toast';
import { DatasetProfilerPage } from './features/datasets/DatasetProfilerPage';
import { ProjectGatekeeper } from './features/datasets/ProjectGatekeeper';
import { ViewAsCodeStudio } from './features/pipelines/ViewAsCodeStudio';
import { TrainingResultsPage } from './features/jobs/TrainingResultsPage';
import { DeploymentsHub } from './features/deployments/DeploymentsHub';
import { ClassroomHub } from './features/classrooms/ClassroomHub';
import { LoginPage } from './features/auth';
import { UserGuidePage } from './features/guide/UserGuidePage';
import {
  LearningProvider,
  LearningModeToggle,
  type LearningProjectState,
} from './features/learning';

export type PlatformTab =
  | 'workspace'
  | 'code-studio'
  | 'training-results'
  | 'deployments'
  | 'classroom'
  | 'login'
  | 'guide';

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  type: 'success' | 'info' | 'error';
}

/* ─── Brand color constants ─────────────────────────────────────── */
const BB = {
  base:          '#0B0912',
  surface:       '#1B1530',
  elevated:      '#2A2247',
  border:        'rgba(107,92,166,0.18)',
  borderHover:   'rgba(107,92,166,0.35)',
  primary:       '#4B3B7C',
  primaryLight:  '#6C5CA6',
  maroon:        '#6E1423',
  gold:          '#C9A24B',
  text:          '#F5F1EC',
  muted:         '#9E93B8',
  disabled:      '#3D3558',
} as const;

function AppContent() {
  const project = useProject();
  const { setLifecycleStage, isProjectInitialized, dataset, activeExperimentFile, resetProject } = project;
  const { user, isAuthenticated, logout } = useAuthContext();

  // Map ProjectContext to reactive LearningProjectState for Heads-Up Rules (Part B)
  const learningState: LearningProjectState = useMemo(() => ({
    dataset: project.dataset,
    selectedFeatures: project.selectedFeatures,
    selectedTarget: project.selectedTarget,
    taskType: project.inferredTaskType,
    activeJob: project.activeJob,
    jobHistory: Object.values(project.fileJobs || {}),
    code: project.activeExperimentFile ? project.experimentFiles?.[project.activeExperimentFile] : undefined,
    splitRatio: project.trainingConfig?.train_test_split,
  }), [project]);

  const [activeTab, setActiveTab] = useState<PlatformTab>(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace('#', '').toLowerCase();
      if (hash === 'classroom' || window.location.pathname.includes('classroom')) {
        return 'classroom';
      }
      if (hash === 'login' || window.location.pathname.includes('login')) {
        return 'login';
      }
      if (hash === 'guide' || hash === 'user-guide' || window.location.pathname.includes('guide')) {
        return 'guide';
      }
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      if (tabParam === 'classroom') return 'classroom';
      if (tabParam === 'login') return 'login';
      if (tabParam === 'guide') return 'guide';
    }
    return 'workspace';
  });
  const [activeDeploymentId, setActiveDeploymentId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [hoveredNav, setHoveredNav] = useState<string | null>(null);
  const [globalSearch, setGlobalSearch] = useState<string>('');
  const [isCopilotOpen, setIsCopilotOpen] = useState<boolean>(false);
  /** Lifted from ClassroomHub — hides sidebar during exam lockdown */
  const [isExamLocked, setIsExamLocked] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '').toLowerCase();
      if (hash === 'classroom') {
        setActiveTab('classroom');
      } else if (hash === 'login') {
        setActiveTab('login');
      } else if (hash === 'guide' || hash === 'user-guide') {
        setActiveTab('guide');
      } else if (hash === 'workspace' || hash === 'code-studio' || hash === 'training-results' || hash === 'deployments') {
        setActiveTab(hash as PlatformTab);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        const active = document.activeElement;
        // If focus is inside Monaco editor or Code Studio, editor owns Ctrl+K chords
        if (
          active?.closest('.monaco-editor') ||
          active?.closest('[data-testid="monaco-code-studio-container"]') ||
          active?.getAttribute('data-testid') === 'monaco-code-editor'
        ) {
          return;
        }
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const showToast = useCallback((
    title: string,
    description?: string,
    type: 'success' | 'info' | 'error' = 'success',
  ) => {
    // Task 1: Suppress low-importance / spammy notification events
    const lowerTitle = title.toLowerCase();
    if (
      lowerTitle.includes('exam switched') ||
      lowerTitle.includes('file saved') ||
      lowerTitle.includes('prediction received') ||
      lowerTitle.includes('auto-saved') ||
      lowerTitle.includes('draft saved')
    ) {
      return;
    }

    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => {
      // Prevent duplicate stacked notifications with identical title and description
      const exists = prev.some((t) => t.title === title && t.description === description && t.type === type);
      if (exists) return prev;
      const next = [...prev, { id, title, description, type }];
      return next.slice(-3);
    });
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Global search catalog (Task 4)
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchableItems = useMemo(() => [
    { title: 'Datasets & Profiler', category: 'Platform', tab: 'workspace', description: 'Upload CSV, inspect distributions, correlations & data leakage' },
    { title: 'Code Studio (Pipeline IDE)', category: 'Platform', tab: 'code-studio', description: 'Interactive Python editor with sandboxed execution & scripts' },
    { title: 'Training & Experiments', category: 'Platform', tab: 'training-results', description: 'Multi-run leaderboard, confusion matrix, ROC/PR & SHAP curves' },
    { title: 'Model Deployments & Serving', category: 'Platform', tab: 'deployments', description: 'Real-time REST endpoints & high-throughput batch CSV scoring' },
    { title: 'Model Registry & Governance', category: 'Deployments', tab: 'deployments', description: 'Production Champion models, lineage tracing & version promotion' },
    { title: 'Machine Learning User Guide', category: 'Documentation', tab: 'guide', description: 'Complete plain-English encyclopedia of algorithms, knobs & metrics' },
    { title: 'Random Forest Classifier', category: 'Algorithms', tab: 'guide', description: 'Ensemble of decision trees voting on predictions' },
    { title: 'XGBoost & LightGBM', category: 'Algorithms', tab: 'guide', description: 'High-performance gradient boosting for structured tabular datasets' },
    { title: 'Confusion Matrix & Metrics', category: 'Evaluation', tab: 'guide', description: 'Precision, Recall, F1-Score, and ROC-AUC explained' },
  ], []);

  const searchResults = useMemo(() => {
    if (!globalSearch.trim()) return [];
    const q = globalSearch.toLowerCase().trim();
    return searchableItems.filter(
      (item) => item.title.toLowerCase().includes(q) ||
                item.description.toLowerCase().includes(q) ||
                item.category.toLowerCase().includes(q)
    );
  }, [globalSearch, searchableItems]);

  const handleNavigate = (tab: PlatformTab | string, deploymentId?: string) => {
    let resolvedTab: PlatformTab = 'workspace';
    if (tab === '/datasets' || tab === 'workspace') resolvedTab = 'workspace';
    else if (tab === '/studio' || tab === '/pipelines' || tab === 'code-studio') resolvedTab = 'code-studio';
    else if (tab === '/results' || tab === '/explainability' || tab === 'training-results') resolvedTab = 'training-results';
    else if (tab === '/deployments' || tab === 'deployments') resolvedTab = 'deployments';
    else if (tab === '/classroom' || tab === 'classroom') resolvedTab = 'classroom';
    else if (tab === '/login' || tab === 'login') resolvedTab = 'login';
    else if (tab === '/guide' || tab === 'guide' || tab === 'user-guide') resolvedTab = 'guide';
    else if (tab.startsWith('/')) resolvedTab = 'workspace';
    else resolvedTab = tab as PlatformTab;

    setActiveTab(resolvedTab);
    if (typeof window !== 'undefined') {
      window.location.hash = resolvedTab === 'workspace' ? '' : `#${resolvedTab}`;
    }
    if (deploymentId) {
      setActiveDeploymentId(deploymentId);
    }
    const tabToStage: Partial<Record<PlatformTab, LifecycleStage>> = {
      workspace:          'dataset',
      'code-studio':      'pipeline',
      'training-results': 'evaluate',
      deployments:        'deploy',
    };
    const stage = tabToStage[resolvedTab];
    if (stage) setLifecycleStage(stage);
  };

  const navItems = [
    { id: 'workspace',        label: 'Datasets & Profiler',       icon: <Database className="w-5 h-5" />  },
    { id: 'code-studio',      label: 'Pipeline (Code Studio)',    icon: <Code2 className="w-5 h-5" />     },
    { id: 'training-results', label: 'Training & Experiments',    icon: <BarChart2 className="w-5 h-5" /> },
    { id: 'deployments',      label: 'Model Deployments',         icon: <Rocket className="w-5 h-5" />    },
  ];

  if (activeTab === 'guide') {
    return (
      <LearningProvider projectState={learningState}>
        <UserGuidePage onNavigate={(tab) => handleNavigate(tab)} />
        {/* Global Toast notifications container */}
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            zIndex: 99999,
            maxWidth: 360,
            pointerEvents: 'none',
          }}
        >
          {toasts.map((toast) => (
            <Toast
              key={toast.id}
              variant={toast.type === 'error' ? 'error' : toast.type === 'success' ? 'success' : 'info'}
              title={toast.title}
              description={toast.description}
              onClose={() => removeToast(toast.id)}
            />
          ))}
        </div>
      </LearningProvider>
    );
  }

  if (activeTab === 'login') {
    return (
      <LearningProvider projectState={learningState}>
        <LoginPage
          onSuccess={() => handleNavigate('workspace')}
          onNavigate={(tab) => handleNavigate(tab)}
        />
        {/* Global Toast notifications container */}
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            zIndex: 99999,
            maxWidth: 360,
            pointerEvents: 'none',
          }}
        >
          {toasts.map((toast) => (
            <Toast
              key={toast.id}
              variant={toast.type === 'error' ? 'error' : toast.type === 'success' ? 'success' : 'info'}
              title={toast.title}
              description={toast.description}
              onClose={() => removeToast(toast.id)}
            />
          ))}
        </div>
      </LearningProvider>
    );
  }

  return (
    <LearningProvider projectState={learningState}>
      <div
        className="flex h-screen w-screen overflow-hidden antialiased bb-canvas neural-grid-bg"
      style={{
        backgroundColor: BB.base,
        color: BB.text,
        fontFamily: 'var(--font-ui)',
      }}
    >
      {/* ── 1. COMPACT ICON-ONLY SIDEBAR (A1, A3, A5) ──────────────── */}
      <aside
        style={{
          width: isExamLocked ? 0 : 58,
          overflow: 'hidden',
          backgroundColor: BB.surface,
          borderRight: `1px solid ${BB.border}`,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          zIndex: 30,
          transition: 'width 0.25s ease',
        }}
      >
        {/* Brand Mark Icon Only (A1: ML Lab text removed) */}
        <div
          style={{
            height: 48,
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderBottom: `1px solid ${BB.border}`,
            flexShrink: 0,
          }}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 22 22"
            fill="none"
            style={{ flexShrink: 0 }}
          >
            <circle cx="11" cy="11" r="4" fill={BB.maroon} />
            <circle cx="3"  cy="3"  r="2" fill={BB.primary} />
            <circle cx="19" cy="3"  r="2" fill={BB.primary} />
            <circle cx="3"  cy="19" r="2" fill={BB.primary} />
            <line x1="5"  y1="5"  x2="8.2"  y2="8.2"  stroke={BB.border} strokeWidth="1" />
            <line x1="17" y1="5"  x2="13.8" y2="8.2"  stroke={BB.border} strokeWidth="1" />
            <line x1="5"  y1="17" x2="8.2"  y2="13.8" stroke={BB.border} strokeWidth="1" />
          </svg>
        </div>

        {/* Navigation Icons with Hover Tooltips (A3) */}
        <nav
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10,
            padding: '16px 0',
            width: '100%',
          }}
        >
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            const isHovered = hoveredNav === item.id;

            return (
              <React.Fragment key={item.id}>
                <div
                  style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}
                  onMouseEnter={() => setHoveredNav(item.id)}
                  onMouseLeave={() => setHoveredNav(null)}
                >
                  <button
                    onClick={() => handleNavigate(item.id as PlatformTab)}
                    title={item.label}
                    style={{
                      width: 40,
                      height: 40,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 8,
                      background: isActive
                        ? 'rgba(107,92,166,0.18)'
                        : isHovered
                        ? 'rgba(107,92,166,0.10)'
                        : 'transparent',
                      border: `1px solid ${
                        isActive
                          ? BB.primaryLight
                          : 'transparent'
                      }`,
                      color: isActive
                        ? BB.text
                        : isHovered
                        ? BB.text
                        : BB.muted,
                      cursor: 'pointer',
                      transition: 'all 150ms ease',
                      position: 'relative',
                    }}
                  >
                    {/* Left active indicator bar */}
                    {isActive && (
                      <div
                        style={{
                          position: 'absolute',
                          left: -8,
                          top: 8,
                          bottom: 8,
                          width: 3,
                          borderRadius: '0 3px 3px 0',
                          background: BB.maroon,
                        }}
                      />
                    )}
                    {item.icon}
                  </button>

                  {/* White font hover tooltip (A3) */}
                  {isHovered && (
                    <div
                      style={{
                        position: 'absolute',
                        left: 54,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        backgroundColor: '#1B1530',
                        color: '#FFFFFF',
                        fontSize: 11,
                        fontWeight: 500,
                        padding: '5px 10px',
                        borderRadius: 6,
                        border: '1px solid rgba(107,92,166,0.35)',
                        boxShadow: '0 6px 16px rgba(0,0,0,0.5)',
                        whiteSpace: 'nowrap',
                        pointerEvents: 'none',
                        zIndex: 9999,
                        letterSpacing: '0.02em',
                      }}
                    >
                      {item.label}
                    </div>
                  )}
                </div>
              </React.Fragment>
            );
          })}
        </nav>

        {/* User Account / Sign In button at bottom of sidebar */}
        <div style={{ paddingBottom: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            onClick={() => handleNavigate(isAuthenticated ? 'workspace' : 'login')}
            title={isAuthenticated ? (user?.email || 'Account') : 'Sign In'}
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: isAuthenticated ? 'linear-gradient(135deg, #3B82F6, #8B5CF6)' : 'rgba(107,92,166,0.18)',
              border: `1px solid ${isAuthenticated ? '#60A5FA' : BB.border}`,
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 700,
              transition: 'all 150ms ease',
            }}
          >
            {isAuthenticated ? (
              (user?.full_name || user?.email || 'U')[0].toUpperCase()
            ) : (
              <User className="w-4 h-4" style={{ color: BB.muted }} />
            )}
          </button>

          {isAuthenticated && (
            <button
              type="button"
              onClick={async () => {
                try {
                  await logout();
                  showToast('Signed Out', 'You have been signed out successfully.', 'info');
                } catch {
                  showToast('Sign Out Error', 'Failed to clear session', 'error');
                }
              }}
              title="Sign Out"
              aria-label="Sign Out"
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                color: '#F87171',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 150ms ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.22)';
                e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.5)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.25)';
              }}
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </aside>

      {/* ── 2. MAIN CANVAS ─────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          background: 'transparent',
          height: '100vh',
        }}
      >
        {/* Top header — 48px clean bar (A1, A4, C3) */}
        <header
          style={{
            height: 48,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 16px',
            backgroundColor: 'rgba(27,21,48,0.85)',
            backdropFilter: 'blur(12px)',
            borderBottom: `1px solid ${BB.border}`,
            gap: 16,
            position: 'relative',
            zIndex: 1000,
          }}
        >
          {/* Header left: dataset + experiment context pill (shown when project initialized) */}
          <div style={{ width: 220, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            {isProjectInitialized && dataset ? (
              <>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '4px 10px', borderRadius: 6,
                  background: 'rgba(138, 121, 202, 0.1)',
                  border: `1px solid ${BB.border}`,
                  maxWidth: 180, overflow: 'hidden',
                }}
                title={`Dataset: ${dataset.fileName} • Experiment: ${activeExperimentFile}`}
                >
                  <FolderOpen style={{ width: 11, height: 11, color: BB.primaryLight, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: BB.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {activeExperimentFile}
                  </span>
                </div>
                <button
                  onClick={resetProject}
                  title="New Project — reset to dataset upload"
                  style={{
                    padding: '4px 8px', borderRadius: 5, fontSize: 10, fontWeight: 700,
                    border: `1px solid ${BB.border}`, background: 'transparent',
                    color: BB.disabled, cursor: 'pointer', transition: 'all 150ms', flexShrink: 0,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = BB.muted; e.currentTarget.style.borderColor = BB.borderHover; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = BB.disabled; e.currentTarget.style.borderColor = BB.border; }}
                >
                  New Project
                </button>
              </>
            ) : null}
          </div>

          {/* Header Center: C3 Global Search Bar */}
          <div
            style={{
              flex: 1,
              maxWidth: 440,
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              zIndex: 1001,
            }}
          >
            <Search
              style={{
                position: 'absolute',
                left: 10,
                width: 14,
                height: 14,
                color: BB.muted,
                pointerEvents: 'none',
              }}
            />
            <input
              ref={searchInputRef}
              type="text"
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = BB.primaryLight;
                setIsSearchFocused(true);
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = BB.border;
                setTimeout(() => setIsSearchFocused(false), 200);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && searchResults.length > 0) {
                  handleNavigate(searchResults[0].tab as PlatformTab);
                  setGlobalSearch('');
                  setIsSearchFocused(false);
                  searchInputRef.current?.blur();
                } else if (e.key === 'Escape') {
                  setGlobalSearch('');
                  setIsSearchFocused(false);
                  searchInputRef.current?.blur();
                }
              }}
              placeholder="Search datasets, models, pipelines... (Ctrl+K)"
              style={{
                width: '100%',
                padding: '6px 52px 6px 32px',
                borderRadius: 7,
                border: `1px solid ${BB.border}`,
                background: BB.surface,
                color: BB.text,
                fontSize: 11,
                fontFamily: 'var(--font-ui)',
                outline: 'none',
                transition: 'border-color 150ms',
              }}
            />
            {globalSearch ? (
              <button
                type="button"
                onClick={() => {
                  setGlobalSearch('');
                  searchInputRef.current?.focus();
                }}
                title="Clear search"
                style={{
                  position: 'absolute',
                  right: 28,
                  background: 'none',
                  border: 'none',
                  color: BB.muted,
                  cursor: 'pointer',
                  padding: 2,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <X style={{ width: 12, height: 12 }} />
              </button>
            ) : null}
            <span
              style={{
                position: 'absolute',
                right: 8,
                fontSize: 9,
                color: BB.disabled,
                padding: '1px 4px',
                borderRadius: 3,
                border: `1px solid ${BB.border}`,
                background: BB.elevated,
                fontFamily: 'var(--font-mono)',
                pointerEvents: 'none',
              }}
            >
              ⌘K
            </span>

            {/* Live Search Results Dropdown */}
            {isSearchFocused && globalSearch.trim() && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  left: 0,
                  right: 0,
                  maxHeight: 340,
                  overflowY: 'auto',
                  borderRadius: 10,
                  background: 'rgba(18, 14, 34, 0.96)',
                  backdropFilter: 'blur(16px)',
                  border: '1px solid rgba(107, 92, 166, 0.35)',
                  boxShadow: '0 16px 40px rgba(0, 0, 0, 0.5), 0 0 20px rgba(0, 212, 255, 0.1)',
                  zIndex: 9999,
                  padding: '6px 0',
                }}
              >
                <div
                  style={{
                    padding: '6px 12px 4px',
                    fontSize: 10,
                    fontWeight: 700,
                    color: BB.muted,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>Search Results ({searchResults.length})</span>
                  <span>Press Enter to Jump</span>
                </div>

                {searchResults.length === 0 ? (
                  <div style={{ padding: '16px 14px', fontSize: 12, color: BB.muted, textAlign: 'center' }}>
                    No results found for &ldquo;{globalSearch}&rdquo;
                  </div>
                ) : (
                  searchResults.map((item, idx) => (
                    <div
                      key={idx}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleNavigate(item.tab as PlatformTab);
                        setGlobalSearch('');
                        setIsSearchFocused(false);
                      }}
                      style={{
                        padding: '8px 12px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 10,
                        borderBottom: '1px solid rgba(107, 92, 166, 0.12)',
                        transition: 'background 120ms',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(0, 212, 255, 0.1)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#FFFFFF' }}>{item.title}</div>
                        <div style={{ fontSize: 10.5, color: BB.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.description}
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: 9.5,
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: 'rgba(201, 162, 75, 0.15)',
                          border: '1px solid rgba(201, 162, 75, 0.3)',
                          color: BB.gold,
                          flexShrink: 0,
                          textTransform: 'uppercase',
                        }}
                      >
                        {item.category}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Header Right: Learning Mode + Lessons + AI Copilot */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            {/* Global Learning Mode Toggle (Part E1) */}
            <LearningModeToggle />

            {/* User Guide Button (Opens comprehensive guide in new window) */}
            <button
              type="button"
              data-testid="open-user-guide-btn"
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.open(`${window.location.origin}${window.location.pathname}#guide`, '_blank');
                }
              }}
              title="Open Student User Guide (opens in new window)"
              style={{
                height: 32,
                padding: '0 10px',
                borderRadius: 7,
                border: `1px solid ${BB.border}`,
                background: 'rgba(27,21,48,0.8)',
                color: BB.text,
                fontSize: 11,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                cursor: 'pointer',
                transition: 'all 150ms',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = BB.primaryLight;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = BB.border;
              }}
            >
              <span>📖</span>
              <span>User Guide ↗</span>
            </button>

            {/* A4: AI Copilot on top of right side — Symbol only */}
            <button
              onClick={() => setIsCopilotOpen((prev) => !prev)}
              title={isCopilotOpen ? 'Close AI Copilot' : 'Open AI Copilot'}
              style={{
                width: 32,
                height: 32,
                borderRadius: 7,
                border: `1px solid ${isCopilotOpen ? BB.primaryLight : BB.border}`,
                background: isCopilotOpen
                  ? 'rgba(107,92,166,0.22)'
                  : 'rgba(27,21,48,0.8)',
                color: isCopilotOpen ? BB.text : BB.muted,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 150ms',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = BB.primaryLight;
                e.currentTarget.style.color = BB.text;
              }}
              onMouseLeave={(e) => {
                if (!isCopilotOpen) {
                  e.currentTarget.style.borderColor = BB.border;
                  e.currentTarget.style.color = BB.muted;
                }
              }}
            >
              <Sparkles className="w-4 h-4" style={{ color: isCopilotOpen ? BB.gold : 'inherit' }} />
            </button>

            {/* Auth status: Sign In Button if not authenticated (Avatar kept exclusively on bottom-left sidebar) */}
            {!isAuthenticated && (
              <button
                type="button"
                onClick={() => handleNavigate('login')}
                style={{
                  height: 32,
                  padding: '0 12px',
                  borderRadius: 7,
                  background: 'linear-gradient(135deg, #2563EB, #1D4ED8)',
                  color: '#FFFFFF',
                  fontSize: 11,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(37,99,235,0.3)',
                  transition: 'all 150ms',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(37,99,235,0.45)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(37,99,235,0.3)';
                }}
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Sign In</span>
              </button>
            )}
          </div>
        </header>

        {/* Main content area — Studio Canvas */}
        <main
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            padding: activeTab === 'code-studio' ? 0 : 6,
            width: '100%',
            height: 'calc(100vh - 48px)',
            boxSizing: 'border-box',
          }}
        >
          {/* ── GATEKEEPER WALL ─────────────────────────────────────────────────
               When no dataset+file is initialized (cold start, after reset, or
               when the user navigates to any tab without a project), we render
               the ProjectGatekeeper full-screen regardless of activeTab.
               Once initializeProject() is called, isProjectInitialized becomes
               true and we drop through to the studio pages below.
          ─────────────────────────────────────────────────────────────────── */}
          {!isProjectInitialized ? (
            <ProjectGatekeeper onNavigate={handleNavigate} />
          ) : (
            <>
              <div style={{ display: activeTab === 'classroom' ? 'flex' : 'none', flex: 1, flexDirection: 'column', minHeight: 0, overflow: 'auto', padding: '10px 16px', width: '100%' }}>
                <ErrorBoundary key="classroom" onReset={() => handleNavigate('classroom')}>
                  <ClassroomHub
                    onShowToast={showToast}
                    onExamLockChange={setIsExamLocked}
                  />
                </ErrorBoundary>
              </div>

              <div style={{ display: activeTab === 'workspace' ? 'flex' : 'none', flex: 1, flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                <ErrorBoundary key="workspace" onReset={() => handleNavigate('workspace')}>
                  <DatasetProfilerPage
                    onShowToast={showToast}
                    onNavigate={handleNavigate}
                    isCopilotOpen={isCopilotOpen}
                    onToggleCopilot={() => setIsCopilotOpen((prev) => !prev)}
                  />
                </ErrorBoundary>
              </div>

              <div style={{ display: activeTab === 'code-studio' ? 'flex' : 'none', flex: 1, flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                <ErrorBoundary key="code-studio" onReset={() => handleNavigate('workspace')}>
                  <ViewAsCodeStudio
                    isActive={activeTab === 'code-studio'}
                    onShowToast={showToast}
                    onNavigate={(tab, depId) => handleNavigate(tab as PlatformTab, depId)}
                    isCopilotOpen={isCopilotOpen}
                    onToggleCopilot={() => setIsCopilotOpen((prev) => !prev)}
                  />
                </ErrorBoundary>
              </div>

              <div style={{ display: activeTab === 'training-results' ? 'flex' : 'none', flex: 1, flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                <ErrorBoundary key="training-results" onReset={() => handleNavigate('workspace')}>
                  <TrainingResultsPage
                    onNavigate={handleNavigate}
                    onShowToast={showToast}
                  />
                </ErrorBoundary>
              </div>

              <div style={{ display: activeTab === 'deployments' ? 'flex' : 'none', flex: 1, flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                <ErrorBoundary key="deployments" onReset={() => setActiveTab('workspace')}>
                  <DeploymentsHub
                    isActive={activeTab === 'deployments'}
                    initialDeploymentId={activeDeploymentId}
                    onShowToast={showToast}
                    onNavigateToStudio={() => setActiveTab('code-studio')}
                  />
                </ErrorBoundary>
              </div>
            </>
          )}
        </main>
      </div>

      {/* Global Toast notifications container */}
      <div
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          zIndex: 99999,
          maxWidth: 360,
          pointerEvents: 'none',
        }}
      >
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            variant={toast.type === 'error' ? 'error' : toast.type === 'success' ? 'success' : 'info'}
            title={toast.title}
            description={toast.description}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </div>
    </div>
  </LearningProvider>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ProjectProvider>
          <AppContent />
        </ProjectProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
export default App;
