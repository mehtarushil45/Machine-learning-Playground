import React, { useState } from 'react'
import { Header } from './Header'
import { SidebarUserAvatar } from './SidebarUserAvatar'
import { Icon } from '../ui/Icon'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'

export interface AppLayoutProps {
  children: React.ReactNode
  currentView: 'app' | 'apex'
  onToggleView: (view: 'app' | 'apex') => void
}

export function AppLayout({ children, currentView, onToggleView }: AppLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false)

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Top Application Header */}
      <Header
        currentView={currentView}
        onToggleView={onToggleView}
        onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
        onToggleAiPanel={() => setIsAiPanelOpen((prev) => !prev)}
      />

      {/* Main Container Layout with Sidebar & AI Panel slots */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Left Navigation Sidebar (Reserved Placeholder Slot) */}
        <aside
          className={`w-64 border-r border-border/80 bg-card/40 backdrop-blur-xs flex flex-col transition-all duration-300 shrink-0 ${
            isSidebarOpen ? 'translate-x-0 ml-0' : '-ml-64 opacity-0 pointer-events-none'
          }`}
        >
          <div className="p-4 border-b border-border/40 flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Workspace Nav
            </span>
            <Badge variant="outline" size="sm">
              v0.1
            </Badge>
          </div>

          <nav className="p-3 space-y-1 text-sm flex-1">
            <a
              href="#datasets"
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-primary/10 text-primary font-medium"
            >
              <Icon name="database" size={16} />
              <span>Datasets Lab</span>
            </a>
            <a
              href="#models"
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-muted-foreground hover:bg-muted/50 transition-colors"
            >
              <Icon name="cpu" size={16} />
              <span>Model Training</span>
              <span className="ml-auto text-[10px] text-muted-foreground font-mono">Soon</span>
            </a>
            <a
              href="#pipelines"
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-muted-foreground hover:bg-muted/50 transition-colors"
            >
              <Icon name="layers" size={16} />
              <span>Pipeline Lab</span>
              <span className="ml-auto text-[10px] text-muted-foreground font-mono">Soon</span>
            </a>
            <a
              href="#analytics"
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-muted-foreground hover:bg-muted/50 transition-colors"
            >
              <Icon name="bar-chart" size={16} />
              <span>Analytics</span>
              <span className="ml-auto text-[10px] text-muted-foreground font-mono">Soon</span>
            </a>
          </nav>

          <div className="p-3 border-t border-border/40 text-xs text-muted-foreground">
            <SidebarUserAvatar isCollapsed={!isSidebarOpen} />
          </div>
        </aside>

        {/* Main Central Workspace */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 max-w-7xl mx-auto w-full">
          {children}
        </main>

        {/* Right AI Assistant Panel (Reserved Placeholder Slot) */}
        <aside
          className={`w-80 border-l border-border/80 bg-card/60 backdrop-blur-md p-4 flex flex-col transition-all duration-300 shrink-0 ${
            isAiPanelOpen ? 'translate-x-0 mr-0' : '-mr-80 opacity-0 pointer-events-none'
          }`}
        >
          <div className="flex items-center justify-between border-b border-border/40 pb-3 mb-4">
            <div className="flex items-center gap-2">
              <Icon name="sparkles" size={18} className="text-purple-400" />
              <h4 className="text-sm font-semibold">APEX Copilot</h4>
            </div>
            <button
              onClick={() => setIsAiPanelOpen(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              <Icon name="x" size={16} />
            </button>
          </div>

          <Card variant="glass" className="p-3 space-y-2 mb-4">
            <Badge variant="primary" size="sm">
              AI Insight
            </Badge>
            <p className="text-xs text-muted-foreground">
              Upload a dataset to automatically generate feature distribution profiles and model recommendations.
            </p>
          </Card>
        </aside>
      </div>
    </div>
  )
}
