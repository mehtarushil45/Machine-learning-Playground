import { useState } from 'react';
import { ThemeProvider } from './providers/ThemeProvider';
import { AppLayout } from './components/layout/AppLayout';
import { EnterpriseWorkspace } from './features/datasets/EnterpriseWorkspace';
import { ViewAsCodeStudio } from './features/pipelines/ViewAsCodeStudio';
import { ExplainabilityHub } from './features/explainability/ExplainabilityHub';
import { ClassroomHub } from './features/classrooms/ClassroomHub';
import { DeploymentStudio } from './features/deployments/DeploymentStudio';
import { PortfolioViewer } from './features/portfolios/PortfolioViewer';
import type { Dataset } from './types/dataset';

export type PlatformTab = 'workspace' | 'code-studio' | 'explainability' | 'classrooms' | 'deployments' | 'portfolios';

function AppContent() {
  const [activeTab, setActiveTab] = useState<PlatformTab>('workspace');
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);

  const handleDataLoaded = (loadedDataset: Dataset) => {
    setDataset(loadedDataset);
    setSelectedFeatures([]);
    setSelectedTarget(null);
  };

  const navItems: { id: PlatformTab; label: string; icon: string; group: string }[] = [
    { id: 'workspace',      label: 'Dataset & Training',      icon: '📊', group: 'Core'       },
    { id: 'code-studio',    label: 'View-as-Code',            icon: '⚡', group: 'Core'       },
    { id: 'explainability', label: 'Explainability & Ethics', icon: '🧬', group: 'Insights'   },
    { id: 'classrooms',     label: 'Classrooms & Audit',      icon: '🎓', group: 'Insights'   },
    { id: 'deployments',    label: 'Deployment Studio',       icon: '🚀', group: 'Production'  },
    { id: 'portfolios',     label: 'Learner Portfolios',      icon: '📜', group: 'Production'  },
  ];

  const groups = Array.from(new Set(navItems.map((n) => n.group)));

  const pageTitles: Record<PlatformTab, string> = {
    workspace:      'Dataset & Training Workspace',
    'code-studio':  'View-as-Code Studio',
    explainability: 'Explainability, Bias & What-If',
    classrooms:     'Classroom System & Reproducibility',
    deployments:    'Deployment Studio',
    portfolios:     'Learner Portfolios & Certificates',
  };

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg-base)' }}>

      {/* ── Sidebar ─────────────────────────────────────── */}
      <aside style={{
        width: 232,
        flexShrink: 0,
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>

        {/* Brand */}
        <div style={{
          padding: '20px 20px 16px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <div style={{
            width: 36, height: 36,
            borderRadius: 10,
            background: 'linear-gradient(135deg, #7c5af7 0%, #22d3ee 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18,
            boxShadow: '0 0 16px rgba(124,90,247,0.4)',
            flexShrink: 0,
          }}>🧪</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text-primary)', lineHeight: 1.2 }}>
              MLPlayground
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--brand-violet)', textTransform: 'uppercase', marginTop: 2 }}>
              Enterprise ML OS
            </div>
          </div>
        </div>

        {/* Nav groups */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '12px 10px' }}>
          {groups.map((group) => (
            <div key={group} style={{ marginBottom: 20 }}>
              <div style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
                textTransform: 'uppercase', color: 'var(--text-tertiary)',
                padding: '0 8px 6px',
              }}>
                {group}
              </div>
              {navItems.filter((n) => n.group === group).map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`mlp-nav-item${activeTab === item.id ? ' active' : ''}`}
                  style={{ width: '100%', border: 'none', textAlign: 'left', marginBottom: 2, fontFamily: 'inherit' }}
                >
                  <span className="mlp-nav-icon">{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        {/* Footer user badge */}
        <div style={{
          padding: '12px 14px',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'linear-gradient(135deg, #7c5af7, #22d3ee)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 800, color: '#fff', flexShrink: 0,
          }}>ML</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Mehta R.
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Organisation Admin</div>
          </div>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: 'var(--brand-green)',
            boxShadow: '0 0 6px rgba(16,185,129,0.6)',
          }} />
        </div>
      </aside>

      {/* ── Main content area ────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Top bar */}
        <header style={{
          height: 52,
          flexShrink: 0,
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 28px',
          gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>{navItems.find((n) => n.id === activeTab)?.icon}</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              {pageTitles[activeTab]}
            </span>
          </div>

          <div style={{ flex: 1 }} />

          {/* Global search */}
          <div style={{ position: 'relative', width: 240 }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', fontSize: 13 }}>
              🔍
            </span>
            <input
              placeholder="Search datasets, models…"
              className="mlp-input"
              style={{ paddingLeft: 32, height: 34, fontSize: 13 }}
            />
          </div>

          {/* Status pill */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 12px',
            background: 'rgba(16,185,129,0.1)',
            border: '1px solid rgba(16,185,129,0.25)',
            borderRadius: 'var(--radius-full)',
            fontSize: 12, fontWeight: 600, color: 'var(--brand-green)',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--brand-green)', boxShadow: '0 0 6px rgba(16,185,129,0.7)', display: 'inline-block' }} />
            API Connected
          </div>
        </header>

        {/* Page content */}
        <main style={{ flex: 1, overflowY: 'auto' }} className="mlp-anim-fadeIn">
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
          {activeTab === 'code-studio'    && <ViewAsCodeStudio />}
          {activeTab === 'explainability' && <ExplainabilityHub />}
          {activeTab === 'classrooms'     && <ClassroomHub />}
          {activeTab === 'deployments'    && <DeploymentStudio />}
          {activeTab === 'portfolios'     && <PortfolioViewer />}
        </main>
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
