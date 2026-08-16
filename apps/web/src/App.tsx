import { useState } from 'react';
import { ErrorBoundary } from './components/ui/ErrorBoundary';

import {
  Database,
  Code2,
  Sparkles,
  GraduationCap,
  Rocket,
  Award,
  Search,
} from 'lucide-react';
import { ThemeProvider } from './providers/ThemeProvider';
import { AuthProvider } from './providers/AuthContext';
import { ProjectProvider, useProject } from './providers/ProjectContext';
import { Toast } from './components/ui/Toast';
import { useLatestModel } from './hooks/useLatestModel';
import { DatasetProfilerPage } from './features/datasets/DatasetProfilerPage';
import { ViewAsCodeStudio } from './features/pipelines/ViewAsCodeStudio';
import { ExplainabilityHub } from './features/explainability/ExplainabilityHub';
import { ClassroomHub } from './features/classrooms/ClassroomHub';
import { DeploymentStudio } from './features/deployments/DeploymentStudio';
import { PortfolioViewer } from './features/portfolios/PortfolioViewer';

export type PlatformTab =
  | 'workspace'
  | 'code-studio'
  | 'explainability'
  | 'classrooms'
  | 'deployments'
  | 'portfolios';

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
  const latestModel = useLatestModel();
  const { setLifecycleStage } = useProject();

  const [activeTab, setActiveTab] = useState<PlatformTab>('workspace');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [hoveredNav, setHoveredNav] = useState<string | null>(null);
  const [globalSearch, setGlobalSearch] = useState<string>('');
  const [isCopilotOpen, setIsCopilotOpen] = useState<boolean>(false);

  const showToast = (
    title: string,
    description?: string,
    type: 'success' | 'info' | 'error' = 'success',
  ) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, title, description, type }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const handleNavigate = (tab: PlatformTab) => {
    setActiveTab(tab);
    const tabToStage: Record<PlatformTab, any> = {
      workspace:      'dataset',
      'code-studio':  'pipeline',
      explainability: 'evaluate',
      classrooms:     'verify',
      deployments:    'deploy',
      portfolios:     'certify',
    };
    if (tabToStage[tab]) {
      setLifecycleStage(tabToStage[tab]);
    }
  };

  const navItems = [
    { id: 'workspace',      label: 'Dataset & Profiler',        icon: <Database className="w-5 h-5" /> },
    { id: 'code-studio',    label: 'Pipeline (Code Studio)',    icon: <Code2 className="w-5 h-5" /> },
    { id: 'explainability', label: 'Explainability & What-If',  icon: <Sparkles className="w-5 h-5" /> },
    { id: 'classrooms',     label: 'Classrooms & Auditing',     icon: <GraduationCap className="w-5 h-5" /> },
    { id: 'deployments',    label: 'Deployment Studio',         icon: <Rocket className="w-5 h-5" /> },
    { id: 'portfolios',     label: 'Portfolios & Verification',  icon: <Award className="w-5 h-5" /> },
  ];

  return (
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

            return (
              <div
                key={item.id}
                style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}
                onMouseEnter={() => setHoveredNav(item.id)}
                onMouseLeave={() => setHoveredNav(null)}
              >
                <button
                  onClick={() => handleNavigate(item.id as PlatformTab)}
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
                    border: `1px solid ${isActive ? BB.primaryLight : 'transparent'}`,
                    color: isActive ? BB.text : isHovered ? BB.text : BB.muted,
                    cursor: 'pointer',
                    transition: 'all 150ms ease',
                    position: 'relative',
                  }}
                >
                  {/* Left maroon active indicator bar */}
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
          {/* Header left: Clean (A1: text removed) */}
          <div style={{ width: 120, flexShrink: 0 }} />

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

          {/* Header Right: Active Model Pill + A4 AI Copilot Symbol */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            {/* Latest model pill */}
            {latestModel.hasModel && latestModel.displayText ? (
              <button
                onClick={() => latestModel.refetch()}
                title={`Active model: ${latestModel.displayText} — click to refresh`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '4px 10px',
                  background: 'transparent',
                  border: `1px solid ${BB.border}`,
                  borderRadius: '6px',
                  color: BB.muted,
                  fontFamily: 'var(--font-ui)',
                  fontSize: 11,
                  cursor: 'pointer',
                  transition: 'all 150ms',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = BB.primaryLight;
                  e.currentTarget.style.color = BB.text;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = BB.border;
                  e.currentTarget.style.color = BB.muted;
                }}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: BB.gold, boxShadow: `0 0 6px ${BB.gold}99`, flexShrink: 0 }}
                />
                <span>{latestModel.displayText}</span>
              </button>
            ) : null}

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
            padding: 12,
            width: '100%',
            height: 'calc(100vh - 48px)',
            boxSizing: 'border-box',
          }}
        >
          {activeTab === 'workspace' && (
            <ErrorBoundary key="workspace" onReset={() => handleNavigate('workspace')}>
              <DatasetProfilerPage
                onShowToast={showToast}
                onNavigate={handleNavigate}
                isCopilotOpen={isCopilotOpen}
                onToggleCopilot={() => setIsCopilotOpen((prev) => !prev)}
              />
            </ErrorBoundary>
          )}
          {activeTab === 'code-studio' && (
            <ErrorBoundary key="code-studio" onReset={() => setActiveTab('workspace')}>
              <ViewAsCodeStudio onShowToast={showToast} />
            </ErrorBoundary>
          )}
          {activeTab === 'explainability' && (
            <ErrorBoundary key="explainability" onReset={() => setActiveTab('workspace')}>
              <ExplainabilityHub />
            </ErrorBoundary>
          )}
          {activeTab === 'classrooms' && (
            <ErrorBoundary key="classrooms" onReset={() => setActiveTab('workspace')}>
              <ClassroomHub />
            </ErrorBoundary>
          )}
          {activeTab === 'deployments' && (
            <ErrorBoundary key="deployments" onReset={() => setActiveTab('workspace')}>
              <DeploymentStudio />
            </ErrorBoundary>
          )}
          {activeTab === 'portfolios' && (
            <ErrorBoundary key="portfolios" onReset={() => setActiveTab('workspace')}>
              <PortfolioViewer />
            </ErrorBoundary>
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
