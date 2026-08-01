import { useState, useEffect } from 'react';
import {
  Database,
  Code2,
  Sparkles,
  GraduationCap,
  Rocket,
  Award,
  Search,
  ChevronLeft,
  ChevronRight,
  Command,
  Activity,
  Layers,
  CheckCircle2,
  X,
  User,
  Sliders,
  Gauge
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

  const navItems: { id: PlatformTab; label: string; icon: React.ReactNode; shortcut: string; group: string }[] = [
    { id: 'workspace',      label: 'Dataset & Profiler',      icon: <Database className="w-4 h-4" />,      shortcut: '⌘1', group: 'Data Lab' },
    { id: 'code-studio',    label: 'View-as-Code Studio',     icon: <Code2 className="w-4 h-4" />,         shortcut: '⌘2', group: 'Data Lab' },
    { id: 'explainability', label: 'Explainability & Ethics', icon: <Sparkles className="w-4 h-4" />,      shortcut: '⌘3', group: 'Evaluation' },
    { id: 'classrooms',     label: 'Classrooms & Audit',      icon: <GraduationCap className="w-4 h-4" />, shortcut: '⌘4', group: 'Evaluation' },
    { id: 'deployments',    label: 'Deployment Studio',       icon: <Rocket className="w-4 h-4" />,        shortcut: '⌘5', group: 'Ops & Deploy' },
    { id: 'portfolios',     label: 'Portfolios & Verification',icon: <Award className="w-4 h-4" />,         shortcut: '⌘6', group: 'Ops & Deploy' },
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
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 font-sans antialiased selection:bg-indigo-500/30 selection:text-indigo-200">
      
      {/* ── 1. COLLAPSIBLE ENTERPRISE SIDEBAR ───────────────────────── */}
      <aside
        className={`relative z-30 flex flex-col bg-slate-900/80 backdrop-blur-xl border-r border-slate-800/80 transition-all duration-300 ease-in-out shrink-0 ${
          isSidebarCollapsed ? 'w-16' : 'w-64'
        }`}
      >
        {/* Brand Header */}
        <div className="flex items-center justify-between h-14 px-4 border-b border-slate-800/80">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 via-purple-600 to-cyan-400 flex items-center justify-center text-white shadow-lg shadow-indigo-500/25 shrink-0">
              <Layers className="w-4 h-4" />
            </div>
            {!isSidebarCollapsed && (
              <div className="flex flex-col">
                <span className="font-extrabold text-sm tracking-tight text-white flex items-center gap-1.5">
                  MLPlayground <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">PRO</span>
                </span>
                <span className="text-[10px] text-slate-400 tracking-wider uppercase font-semibold">Enterprise OS</span>
              </div>
            )}
          </div>

          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800/60 transition-colors"
            title="Toggle Sidebar (⌘B)"
          >
            {isSidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Grouped Navigation */}
        <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-5">
          {groups.map((group) => (
            <div key={group} className="space-y-1">
              {!isSidebarCollapsed && (
                <div className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
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
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-150 relative group ${
                        isActive
                          ? 'bg-indigo-600/15 text-indigo-300 border border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.15)] font-semibold'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
                      }`}
                      title={isSidebarCollapsed ? item.label : undefined}
                    >
                      <span className={`shrink-0 ${isActive ? 'text-indigo-400' : 'text-slate-400 group-hover:text-slate-200'}`}>
                        {item.icon}
                      </span>
                      
                      {!isSidebarCollapsed && (
                        <span className="flex-1 text-left truncate">{item.label}</span>
                      )}

                      {/* Active Indicator Bar */}
                      {isActive && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-indigo-500 rounded-r-full shadow-[0_0_8px_#6366f1]" />
                      )}
                    </button>
                  );
                })}
            </div>
          ))}
        </nav>

        {/* Footer Workspace / User Profile */}
        <div className="p-3 border-t border-slate-800/80 bg-slate-900/40">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-md">
              MR
            </div>
            {!isSidebarCollapsed && (
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-xs font-semibold text-slate-200 truncate">Mehta R.</span>
                <span className="text-[10px] text-slate-400 truncate">Acme ML Labs</span>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* ── 2. MAIN WORKSPACE CONTAINER ───────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-slate-950">
        
        {/* Persistent Top Navbar */}
        <header className="h-14 border-b border-slate-800/80 bg-slate-900/50 backdrop-blur-md px-6 flex items-center justify-between shrink-0">
          {/* Breadcrumb & Title */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400 font-medium">MLPlayground</span>
            <span className="text-slate-400">/</span>
            <span className="text-indigo-400 font-semibold flex items-center gap-1.5">
              {navItems.find((n) => n.id === activeTab)?.icon}
              {breadcrumbLabels[activeTab]}
            </span>
          </div>

          {/* Right Top Actions */}
          <div className="flex items-center gap-4">
            {/* Quick Command Box */}
            <div className="relative hidden md:flex items-center w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search models, datasets... (⌘K)"
                className="w-full bg-slate-900/90 border border-slate-800 rounded-lg pl-9 pr-8 py-1.5 text-xs text-slate-200 placeholder-slate-400 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30"
              />
              <span className="absolute right-2.5 text-[10px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700/60">
                ⌘K
              </span>
            </div>

            {/* API Status Badge */}
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#10b981]" />
              FastAPI Engine Live
            </div>
          </div>
        </header>

        {/* Dynamic Studio Page Views */}
        <main className="flex-1 overflow-y-auto">
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
            className="pointer-events-auto flex items-start gap-3 p-4 rounded-xl border border-indigo-500/30 bg-slate-900/90 text-white shadow-2xl backdrop-blur-xl animate-in slide-in-from-bottom-5 fade-in duration-200"
          >
            <div className="mt-0.5 text-emerald-400 shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h5 className="text-xs font-bold text-slate-100">{toast.title}</h5>
              {toast.description && <p className="text-[11px] text-slate-400 mt-0.5">{toast.description}</p>}
            </div>
            <button
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
              className="text-slate-400 hover:text-slate-200"
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
