import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
} from 'lucide-react';
import { ThemeProvider } from './providers/ThemeProvider';
import { AuthProvider } from './providers/AuthContext';
import { ProjectProvider, useProject, type LifecycleStage } from './providers/ProjectContext';
import { Toast } from './components/ui/Toast';
import { DatasetProfilerPage } from './features/datasets/DatasetProfilerPage';
import { ProjectGatekeeper } from './features/datasets/ProjectGatekeeper';
import { ViewAsCodeStudio } from './features/pipelines/ViewAsCodeStudio';
import { TrainingResultsPage } from './features/jobs/TrainingResultsPage';
import { DeploymentsHub } from './features/deployments/DeploymentsHub';
import { ClassroomHub } from './features/classrooms/ClassroomHub';
import {
  LearningProvider,
  LearningModeToggle,
  LessonGuideDrawer,
  type LearningProjectState,
} from './features/learning';

export type PlatformTab =
  | 'workspace'
  | 'code-studio'
  | 'training-results'
  | 'deployments'
  | 'classroom';

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
  const [isLessonDrawerOpen, setIsLessonDrawerOpen] = useState(false);

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
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      if (tabParam === 'classroom') return 'classroom';
    }
    return 'workspace';
  });
  const [activeDeploymentId, setActiveDeploymentId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [hoveredNav, setHoveredNav] = useState<string | null>(null);
  const [globalSearch, setGlobalSearch] = useState<string>('');
  const [isCopilotOpen, setIsCopilotOpen] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '').toLowerCase();
      if (hash === 'classroom') {
        setActiveTab('classroom');
      } else if (hash === 'workspace' || hash === 'code-studio' || hash === 'training-results' || hash === 'deployments') {
        setActiveTab(hash as PlatformTab);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const showToast = useCallback((
    title: string,
    description?: string,
    type: 'success' | 'info' | 'error' = 'success',
  ) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => {
      // Prevent duplicate stacked notifications with identical title and description
      const exists = prev.some((t) => t.title === title && t.description === description && t.type === type);
      if (exists) return prev;
      const next = [...prev, { id, title, description, type }];
      return next.slice(-4);
    });
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleNavigate = (tab: PlatformTab | string, deploymentId?: string) => {
    let resolvedTab: PlatformTab = 'workspace';
    if (tab === '/datasets' || tab === 'workspace') resolvedTab = 'workspace';
    else if (tab === '/studio' || tab === '/pipelines' || tab === 'code-studio') resolvedTab = 'code-studio';
    else if (tab === '/results' || tab === '/explainability' || tab === 'training-results') resolvedTab = 'training-results';
    else if (tab === '/deployments' || tab === 'deployments') resolvedTab = 'deployments';
    else if (tab === '/classroom' || tab === 'classroom') resolvedTab = 'classroom';
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
    { id: 'classroom',        label: 'Classroom (Lab Exam)',      icon: <GraduationCap className="w-5 h-5" /> },
  ];

  return (
    <LearningProvider projectState={learningState}>
      <div
        className="flex h-screen w-screen overflow-hidden antialiased"
      style={{
        backgroundColor: BB.base,
        color: BB.text,
        fontFamily: 'var(--font-ui)',
      }}
    >
      {/* ── 1. COMPACT ICON-ONLY SIDEBAR (A1, A3, A5) ──────────────── */}
      <aside
        style={{
          width: 58,
          backgroundColor: BB.surface,
          borderRight: `1px solid ${BB.border}`,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          zIndex: 30,
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
            const isClassroom = item.id === 'classroom';

            return (
              <React.Fragment key={item.id}>
                {isClassroom && (
                  <div
                    style={{
                      width: 24,
                      height: 1,
                      backgroundColor: 'rgba(107,92,166,0.3)',
                      margin: '4px 0',
                    }}
                  />
                )}
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
                        ? isClassroom
                          ? 'rgba(0,212,255,0.18)'
                          : 'rgba(107,92,166,0.18)'
                        : isHovered
                        ? isClassroom
                          ? 'rgba(0,212,255,0.12)'
                          : 'rgba(107,92,166,0.10)'
                        : isClassroom
                        ? 'rgba(0,212,255,0.06)'
                        : 'transparent',
                      border: `1px solid ${
                        isActive
                          ? isClassroom
                            ? '#00D4FF'
                            : BB.primaryLight
                          : isClassroom
                          ? 'rgba(0,212,255,0.25)'
                          : 'transparent'
                      }`,
                      color: isActive
                        ? isClassroom
                          ? '#00D4FF'
                          : BB.text
                        : isHovered
                        ? isClassroom
                          ? '#00D4FF'
                          : BB.text
                        : isClassroom
                        ? '#00D4FF'
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
                          background: isClassroom ? '#00D4FF' : BB.maroon,
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

        {/* A5: Account button removed from bottom left for temporary purpose */}
      </aside>

      {/* ── 2. MAIN CANVAS ─────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          background: 'rgba(11,9,18,0.92)',
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
            backgroundColor: 'rgba(11,9,18,0.88)',
            backdropFilter: 'blur(12px)',
            borderBottom: `1px solid ${BB.border}`,
            gap: 16,
          }}
        >
          {/* Header left: dataset + experiment context pill (shown when project initialized or classroom) */}
          <div style={{ width: 220, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            {activeTab === 'classroom' ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 10px',
                  borderRadius: 6,
                  background: 'rgba(0, 212, 255, 0.1)',
                  border: '1px solid rgba(0, 212, 255, 0.3)',
                  maxWidth: 200,
                  overflow: 'hidden',
                }}
                title="Active Page: University Lab Exam Environment"
              >
                <GraduationCap style={{ width: 14, height: 14, color: '#00D4FF', flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: '#00D4FF', whiteSpace: 'nowrap' }}>
                  University Lab Exam
                </span>
              </div>
            ) : isProjectInitialized && dataset ? (
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
              type="text"
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              placeholder="Search datasets, models, pipelines... (Ctrl+K)"
              style={{
                width: '100%',
                padding: '6px 36px 6px 32px',
                borderRadius: 7,
                border: `1px solid ${BB.border}`,
                background: BB.surface,
                color: BB.text,
                fontSize: 11,
                fontFamily: 'var(--font-ui)',
                outline: 'none',
                transition: 'border-color 150ms',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = BB.primaryLight;
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = BB.border;
              }}
            />
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
              }}
            >
              ⌘K
            </span>
          </div>

          {/* Header Right: Learning Mode + Lessons + AI Copilot */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            {/* Global Learning Mode Toggle (Part E1) */}
            <LearningModeToggle />

            {/* Guided Lessons Drawer Button (Part C) */}
            <button
              type="button"
              data-testid="open-lesson-guide-btn"
              onClick={() => setIsLessonDrawerOpen(true)}
              title="Open Guided ML Curriculum"
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
              <span>🎓</span>
              <span>Lessons</span>
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
          {activeTab === 'classroom' ? (
            <div style={{ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0, overflow: 'auto', padding: '10px 16px', width: '100%' }}>
              <ErrorBoundary key="classroom" onReset={() => handleNavigate('classroom')}>
                <ClassroomHub onShowToast={showToast} />
              </ErrorBoundary>
            </div>
          ) : !isProjectInitialized ? (
            <ProjectGatekeeper />
          ) : (
            <>
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

      {/* Guided ML Curriculum Drawer (Part C) */}
      <LessonGuideDrawer
        isOpen={isLessonDrawerOpen}
        onClose={() => setIsLessonDrawerOpen(false)}
        onNavigate={(route) => handleNavigate(route)}
      />
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
