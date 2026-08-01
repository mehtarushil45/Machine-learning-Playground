import { useState, useEffect } from 'react';
import {
  Database,
  Code2,
  Sparkles,
  GraduationCap,
  Rocket,
  Award,
  ChevronLeft,
  ChevronRight,
  Bell,
  CheckCircle2,
  X
} from 'lucide-react';
import { ThemeProvider } from './providers/ThemeProvider';
import { EnterpriseWorkspace } from './features/datasets/EnterpriseWorkspace';
import { ViewAsCodeStudio } from './features/pipelines/ViewAsCodeStudio';
import { ExplainabilityHub } from './features/explainability/ExplainabilityHub';
import { ClassroomHub } from './features/classrooms/ClassroomHub';
import { DeploymentStudio } from './features/deployments/DeploymentStudio';
import { PortfolioViewer } from './features/portfolios/PortfolioViewer';
import type { Dataset } from './types/dataset';

export type PlatformTab = 'workspace' | 'code-studio' | 'explainability' | 'classrooms' | 'deployments' | 'portfolios';

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  type: 'success' | 'info' | 'error';
}

function AppContent() {
  const [activeTab, setActiveTab] = useState<PlatformTab>('workspace');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = (title: string, description?: string, type: 'success' | 'info' | 'error' = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, title, description, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  };

  const handleDataLoaded = (loadedDataset: Dataset) => {
    setDataset(loadedDataset);
    setSelectedFeatures([]);
    setSelectedTarget(null);
    showToast('Dataset Ingested', `Successfully loaded dataset with ${loadedDataset.rowCount || 0} rows.`);
  };

  // Keyboard Navigation Shortcuts (⌘1 through ⌘6)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey) {
        if (e.key === '1') { e.preventDefault(); setActiveTab('workspace'); }
        if (e.key === '2') { e.preventDefault(); setActiveTab('code-studio'); }
        if (e.key === '3') { e.preventDefault(); setActiveTab('explainability'); }
        if (e.key === '4') { e.preventDefault(); setActiveTab('classrooms'); }
        if (e.key === '5') { e.preventDefault(); setActiveTab('deployments'); }
        if (e.key === '6') { e.preventDefault(); setActiveTab('portfolios'); }
        if (e.key === 'b') { e.preventDefault(); setIsSidebarCollapsed((prev) => !prev); }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const navItems: { id: PlatformTab; label: string; icon: React.ReactNode; group: string }[] = [
    { id: 'workspace',      label: 'Dataset & Profiler',      icon: <Database className="w-4 h-4" />,      group: 'DATA LAB' },
    { id: 'code-studio',    label: 'View-as-Code Studio',     icon: <Code2 className="w-4 h-4" />,         group: 'DATA LAB' },
    { id: 'explainability', label: 'Explainability & Ethics', icon: <Sparkles className="w-4 h-4" />,      group: 'EVALUATION' },
    { id: 'classrooms',     label: 'Classrooms & Audit',      icon: <GraduationCap className="w-4 h-4" />, group: 'EVALUATION' },
    { id: 'deployments',    label: 'Deployment Studio',       icon: <Rocket className="w-4 h-4" />,        group: 'OPS & DEPLOY' },
    { id: 'portfolios',     label: 'Portfolios & Verification',icon: <Award className="w-4 h-4" />,         group: 'OPS & DEPLOY' },
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
    <div className="flex h-screen w-screen overflow-hidden neural-grid-bg text-slate-100 font-sans antialiased selection:bg-[#00D4FF]/30 selection:text-[#00D4FF]">
      
      {/* ── 1. SIDEBAR (LEFT NAV) — 240px / 64px ──────────────────── */}
      <aside
        style={{
          width: isSidebarCollapsed ? 64 : 240,
          backgroundColor: '#0C1A30',
          borderRight: '1px solid rgba(0, 212, 255, 0.08)',
        }}
        className="relative z-30 flex flex-col transition-all duration-300 ease-in-out shrink-0"
      >
        {/* Logo Area */}
        <div className="flex items-center justify-between h-[56px] px-4 border-b border-[rgba(0,212,255,0.08)]">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="text-[#00D4FF] text-xl font-bold drop-shadow-[0_0_10px_rgba(0,212,255,0.6)] shrink-0">
              ◈
            </div>
            {!isSidebarCollapsed && (
              <span className="font-display font-bold text-base tracking-tight text-white uppercase">
                ML LAB
              </span>
            )}
          </div>

          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="btn-icon"
            title="Toggle Sidebar (⌘B)"
          >
            {isSidebarCollapsed ? <ChevronRight className="w-4 h-4 text-[#94A3B8]" /> : <ChevronLeft className="w-4 h-4 text-[#94A3B8]" />}
          </button>
        </div>

        {/* Grouped Nav Items */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {groups.map((group) => (
            <div key={group} className="space-y-1">
              {!isSidebarCollapsed && (
                <div className="px-3 text-[10px] font-medium tracking-[0.12em] uppercase text-[#334155] mb-2">
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
                      onClick={() => setActiveTab(item.id)}
                      style={
                        isActive
                          ? {
                              backgroundColor: 'rgba(0, 212, 255, 0.1)',
                              borderLeft: '3px solid #00D4FF',
                              color: '#00D4FF',
                            }
                          : {
                              color: '#64748B',
                            }
                      }
                      className={`w-full h-[44px] px-3 flex items-center gap-3 rounded-r-lg text-xs font-medium transition-all duration-150 cursor-pointer ${
                        !isActive ? 'hover:bg-[rgba(255,255,255,0.04)] hover:text-slate-200' : ''
                      }`}
                      title={isSidebarCollapsed ? item.label : undefined}
                    >
                      <span style={{ color: isActive ? '#00D4FF' : '#475569' }} className="shrink-0">
                        {item.icon}
                      </span>
                      
                      {!isSidebarCollapsed && (
                        <span className="flex-1 text-left truncate">{item.label}</span>
                      )}
                    </button>
                  );
                })}
            </div>
          ))}
        </nav>

        {/* Bottom User Avatar */}
        <div className="p-3 border-t border-[rgba(0,212,255,0.08)] bg-[#0C1A30]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#101E36] border-2 border-[#7B5CF5] flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-[0_0_12px_rgba(123,92,245,0.4)]">
              MR
            </div>
            {!isSidebarCollapsed && (
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-xs font-semibold text-slate-200 truncate">Mehta R.</span>
                <span className="text-[10px] text-[#64748B] truncate">Quantum ML Infrastructure</span>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* ── 2. MAIN WORKSPACE CANVAS ───────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-[#070E1C]/90">
        
        {/* Top Header Bar — 56px */}
        <header
          style={{
            height: 56,
            backgroundColor: 'rgba(7, 14, 28, 0.8)',
            backdropFilter: 'blur(12px)',
            borderBottom: '1px solid rgba(0, 212, 255, 0.07)',
          }}
          className="px-6 flex items-center justify-between shrink-0"
        >
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 font-display text-sm">
            <span className="text-[#64748B]">ML Playground</span>
            <span className="text-[#334155]">&gt;</span>
            <span className="text-[#00D4FF] font-semibold flex items-center gap-2">
              {navItems.find((n) => n.id === activeTab)?.icon}
              {breadcrumbLabels[activeTab]}
            </span>
          </div>

          {/* Right Header Controls */}
          <div className="flex items-center gap-4">
            {/* Model Selector Pill */}
            <button className="btn-secondary !py-1.5 !px-3 text-xs flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#00F5A0] shadow-[0_0_8px_#00F5A0]" />
              Random Forest v2.4
            </button>

            {/* Notification Bell */}
            <button className="btn-icon relative">
              <Bell className="w-4 h-4 text-[#94A3B8]" />
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#00D4FF] animate-ping" />
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#00D4FF]" />
            </button>

            {/* User Avatar Pill */}
            <div className="w-7 h-7 rounded-full bg-[#101E36] border border-[#7B5CF5] flex items-center justify-center text-white text-xs font-bold">
              MR
            </div>
          </div>
        </header>

        {/* Dynamic Page Views */}
        <main className="flex-1 overflow-y-auto p-6 max-w-[1400px] w-full mx-auto space-y-8">
          {activeTab === 'workspace' && (
            <EnterpriseWorkspace
              dataset={dataset}
              selectedFeatures={selectedFeatures}
              selectedTarget={selectedTarget}
              onDataLoaded={handleDataLoaded}
              onSelectedFeaturesChange={setSelectedFeatures}
              onSelectedTargetChange={setSelectedTarget}
            />
          )}
          {activeTab === 'code-studio'    && <ViewAsCodeStudio onShowToast={showToast} />}
          {activeTab === 'explainability' && <ExplainabilityHub />}
          {activeTab === 'classrooms'     && <ClassroomHub />}
          {activeTab === 'deployments'    && <DeploymentStudio onShowToast={showToast} />}
          {activeTab === 'portfolios'     && <PortfolioViewer onShowToast={showToast} />}
        </main>
      </div>

      {/* ── 3. FLOATING TOAST NOTIFICATIONS ───────────────────────── */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto flex items-start gap-3 p-4 rounded-xl border border-[rgba(0,212,255,0.3)] bg-[#0C1A30]/95 text-white shadow-2xl backdrop-blur-xl animate-in slide-in-from-bottom-5 duration-200"
          >
            <div className="mt-0.5 text-[#00F5A0] shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h5 className="text-xs font-bold text-slate-100">{toast.title}</h5>
              {toast.description && <p className="text-[11px] text-[#64748B] mt-0.5">{toast.description}</p>}
            </div>
            <button
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
              className="text-[#64748B] hover:text-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider defaultTheme="system">
      <AppContent />
    </ThemeProvider>
  );
}
