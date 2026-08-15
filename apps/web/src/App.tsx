import { useState, useEffect } from 'react';
import { useAuthContext, getInitials } from './providers/AuthContext';
import { ErrorBoundary } from './components/ui/ErrorBoundary';

import {
  Database,
  Code2,
  Sparkles,
  GraduationCap,
  Rocket,
  Award,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { ThemeProvider } from './providers/ThemeProvider';
import { AuthProvider } from './providers/AuthContext';
import { ProjectProvider, useProject } from './providers/ProjectContext';
import { SidebarUserAvatar } from './components/layout/SidebarUserAvatar';
import { LifecycleRail } from './components/layout/LifecycleRail';
import { NotificationBell } from './components/notifications/NotificationBell';
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
  // Group label
  groupLabel:    '#5E5480',
} as const;

function AppContent() {
  const latestModel = useLatestModel();
  const { user, isAuthenticated } = useAuthContext();
  const { lifecycleStage, setLifecycleStage } = useProject();
  const headerInitials = isAuthenticated
    ? getInitials(user?.full_name, user?.email)
    : 'ML';

  const [activeTab, setActiveTab]           = useState<PlatformTab>('workspace');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [toasts, setToasts]                 = useState<ToastMessage[]>([]);

  const showToast = (
    title: string,
    description?: string,
    type: 'success' | 'info' | 'error' = 'success',
  ) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, title, description, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  };

  /** Navigate to a tab — also keeps lifecycleStage in sync */
  const handleNavigate = (tab: PlatformTab) => {
    setActiveTab(tab);
    // Map tab → lifecycle stage for the LifecycleRail
    const tabToStage: Record<PlatformTab, typeof lifecycleStage> = {
      workspace:      'dataset',
      'code-studio':  'pipeline',
      explainability: 'evaluate',
      classrooms:     'verify',
      deployments:    'deploy',
      portfolios:     'certify',
    };
    setLifecycleStage(tabToStage[tab]);
  };

  // Keyboard shortcuts (⌘1–⌘6, ⌘B)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey) {
        if (e.key === '1') { e.preventDefault(); handleNavigate('workspace'); }
        if (e.key === '2') { e.preventDefault(); handleNavigate('code-studio'); }
        if (e.key === '3') { e.preventDefault(); handleNavigate('explainability'); }
        if (e.key === '4') { e.preventDefault(); handleNavigate('classrooms'); }
        if (e.key === '5') { e.preventDefault(); handleNavigate('deployments'); }
        if (e.key === '6') { e.preventDefault(); handleNavigate('portfolios'); }
        if (e.key === 'b') { e.preventDefault(); setIsSidebarCollapsed((prev) => !prev); }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navItems: { id: PlatformTab; label: string; icon: React.ReactNode; group: string }[] = [
    { id: 'workspace',      label: 'Dataset & Profiler',        icon: <Database className="w-4 h-4" />,      group: 'DATA LAB' },
    { id: 'code-studio',    label: 'View-as-Code Studio',       icon: <Code2 className="w-4 h-4" />,          group: 'DATA LAB' },
    { id: 'explainability', label: 'Explainability & Ethics',   icon: <Sparkles className="w-4 h-4" />,       group: 'EVALUATION' },
    { id: 'classrooms',     label: 'Classrooms & Audit',        icon: <GraduationCap className="w-4 h-4" />,  group: 'EVALUATION' },
    { id: 'deployments',    label: 'Deployment Studio',         icon: <Rocket className="w-4 h-4" />,         group: 'OPS & DEPLOY' },
    { id: 'portfolios',     label: 'Portfolios & Verification',  icon: <Award className="w-4 h-4" />,         group: 'OPS & DEPLOY' },
  ];

  const groups = Array.from(new Set(navItems.map((n) => n.group)));

  const breadcrumbLabels: Record<PlatformTab, string> = {
    workspace:      'Dataset Profiling & Model Training',
    'code-studio':  'Bi-Directional View-as-Code Studio',
    explainability: 'Explainability, Bias Audit & What-If',
    classrooms:     'Classroom & Submission Reproducibility Audit',
    deployments:    '1-Click REST Deployments & Web Widgets',
    portfolios:     'Learner Portfolios & Cryptographic QR Verification',
  };

  return (
    <div
      className="flex h-screen w-screen overflow-hidden antialiased"
      style={{
        /* BB canvas: very faint blueberry dot grid */
        backgroundColor: BB.base,
        backgroundImage: 'radial-gradient(rgba(107,92,166,0.07) 1px, transparent 1px)',
        backgroundSize: '32px 32px',
        fontFamily: 'var(--font-ui)',
        color: BB.text,
      }}
    >
      {/* ── 1. SIDEBAR ────────────────────────────────────────────── */}
      <aside
        style={{
          width: isSidebarCollapsed ? 64 : 240,
          backgroundColor: BB.surface,
          borderRight: `1px solid ${BB.border}`,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          transition: 'width 300ms cubic-bezier(0.4,0,0.2,1)',
          zIndex: 30,
        }}
      >
        {/* Logo row */}
        <div
          style={{
            height: 56,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 16px',
            borderBottom: `1px solid ${BB.border}`,
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
            {/* Thread-node brand mark */}
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

            {!isSidebarCollapsed && (
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                  fontSize: '1rem',
                  letterSpacing: '-0.01em',
                  color: BB.text,
                  whiteSpace: 'nowrap',
                }}
              >
                ML Lab
              </span>
            )}
          </div>

          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="btn-icon"
            title="Toggle Sidebar (⌘B)"
            style={{ flexShrink: 0 }}
          >
            {isSidebarCollapsed
              ? <ChevronRight className="w-4 h-4" style={{ color: BB.muted }} />
              : <ChevronLeft  className="w-4 h-4" style={{ color: BB.muted }} />}
          </button>
        </div>

        {/* Nav groups */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '16px 10px' }}>
          {groups.map((group, gi) => (
            <div key={group} style={{ marginBottom: gi < groups.length - 1 ? 24 : 0 }}>
              {!isSidebarCollapsed && (
                <div
                  style={{
                    padding: '0 10px',
                    marginBottom: 6,
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: BB.groupLabel,
                    fontFamily: 'var(--font-ui)',
                  }}
                >
                  {group}
                </div>
              )}
              {navItems
                .filter((item) => item.group === group)
                .map((item) => {
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleNavigate(item.id)}
                      title={isSidebarCollapsed ? item.label : undefined}
                      style={{
                        width: '100%',
                        height: 40,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '0 10px',
                        paddingLeft: isActive ? 8 : 10,
                        marginBottom: 2,
                        background: isActive ? 'rgba(107,92,166,0.09)' : 'transparent',
                        border: 'none',
                        // Maroon 2px left border for active state — the signature BB motif
                        borderLeft: `2px solid ${isActive ? BB.maroon : 'transparent'}`,
                        borderRadius: '0 6px 6px 0',
                        color: isActive ? BB.text : BB.muted,
                        fontFamily: 'var(--font-ui)',
                        fontSize: 12,
                        fontWeight: isActive ? 500 : 400,
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 150ms',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.background = 'rgba(107,92,166,0.06)'
                          e.currentTarget.style.color = BB.text
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.background = 'transparent'
                          e.currentTarget.style.color = BB.muted
                        }
                      }}
                    >
                      <span style={{ color: isActive ? BB.primaryLight : BB.disabled, flexShrink: 0 }}>
                        {item.icon}
                      </span>
                      {!isSidebarCollapsed && (
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.label}
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>
          ))}
        </nav>

        {/* User avatar at bottom */}
        <div
          style={{
            padding: '12px 10px',
            borderTop: `1px solid ${BB.border}`,
            background: BB.surface,
          }}
        >
          <SidebarUserAvatar isCollapsed={isSidebarCollapsed} />
        </div>
      </aside>

      {/* ── 2. MAIN CANVAS ─────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'visible',   // ← was 'hidden': caused header popovers (NotificationBell) to be clipped
          minWidth: 0,           // prevent flex blowout
          background: 'rgba(11,9,18,0.92)',
        }}
      >
        {/* Top header — 56px */}
        <header
          style={{
            height: 56,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 24px',
            backgroundColor: 'rgba(11,9,18,0.88)',
            backdropFilter: 'blur(12px)',
            borderBottom: `1px solid ${BB.border}`,
          }}
        >
          {/* Breadcrumb + Lifecycle Rail */}
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 16, fontFamily: 'var(--font-ui)', fontSize: 13, minWidth: 0, flex: 1 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span style={{ color: BB.muted }}>ML Playground</span>
              <span style={{ color: BB.disabled }}>›</span>
              <span
                style={{
                  color: BB.primaryLight,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {navItems.find((n) => n.id === activeTab)?.icon}
                {breadcrumbLabels[activeTab]}
              </span>
            </div>

            {/* Lifecycle Rail — always visible, tracks active tab */}
            <div style={{ flex: 1, minWidth: 0, marginLeft: 8 }}>
              <LifecycleRail
                currentStage={lifecycleStage}
                onNavigate={handleNavigate}
              />
            </div>
          </div>

          {/* Right controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Latest model pill — rendered when a real trained model exists */}
            {latestModel.hasModel && latestModel.displayText ? (
              <button
                onClick={() => latestModel.refetch()}
                title={`Active model: ${latestModel.displayText} — click to refresh`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '5px 12px',
                  background: 'transparent',
                  border: `1px solid ${BB.border}`,
                  borderRadius: '8px 8px 0 8px',
                  color: BB.muted,
                  fontFamily: 'var(--font-ui)',
                  fontSize: 11,
                  cursor: 'pointer',
                  transition: 'all 150ms',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = BB.primaryLight
                  e.currentTarget.style.color = BB.text
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = BB.border
                  e.currentTarget.style.color = BB.muted
                }}
              >
                {/* Gold dot = healthy model */}
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: BB.gold, boxShadow: `0 0 6px ${BB.gold}99`, flexShrink: 0 }}
                />
                <span>{latestModel.displayText}</span>
              </button>
            ) : null}

            {/* Notification bell */}
            <NotificationBell />

            {/* User avatar pill */}
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #4B3B7C, #6E1423)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: BB.text,
                fontSize: 11,
                fontWeight: 700,
                fontFamily: 'var(--font-ui)',
                boxShadow: '0 0 0 2px rgba(107,92,166,0.30)',
                userSelect: 'none',
                cursor: 'default',
              }}
              title={user?.full_name || user?.email || 'User'}
            >
              {headerInitials}
            </div>
          </div>
        </header>

        {/* Main content area */}
        <main
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 24,
            maxWidth: 1280,
            width: '100%',
            margin: '0 auto',
          }}
          className="space-y-8"
        >
          {activeTab === 'workspace' && (
            <ErrorBoundary key="workspace" onReset={() => handleNavigate('workspace')}>
              <DatasetProfilerPage
                onShowToast={showToast}
                onNavigate={handleNavigate}
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
              <DeploymentStudio onShowToast={showToast} />
            </ErrorBoundary>
          )}
          {activeTab === 'portfolios' && (
            <ErrorBoundary key="portfolios" onReset={() => setActiveTab('workspace')}>
              <PortfolioViewer onShowToast={showToast} />
            </ErrorBoundary>
          )}
        </main>
      </div>

      {/* ── 3. TOAST STACK ─────────────────────────────────────────── */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            variant={toast.type}
            title={toast.title}
            description={toast.description}
            onClose={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
          />
        ))}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider defaultTheme="system">
      <AuthProvider>
        <ProjectProvider>
          <AppContent />
        </ProjectProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
