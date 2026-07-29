import { Icon } from '../ui/Icon'
import { Input } from '../ui/Input'
import { ThemeToggle } from '../ui/ThemeToggle'
import { Avatar } from '../ui/Avatar'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'

export interface HeaderProps {
  currentView: 'app' | 'apex'
  onToggleView: (view: 'app' | 'apex') => void
  onToggleSidebar?: () => void
  onToggleAiPanel?: () => void
}

export function Header({
  currentView,
  onToggleView,
  onToggleSidebar,
  onToggleAiPanel,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 flex h-14 w-full items-center justify-between border-b border-border/80 bg-card/80 px-4 backdrop-blur-md">
      {/* Left: Branding & Sidebar Toggle */}
      <div className="flex items-center gap-3">
        {onToggleSidebar && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleSidebar}
            aria-label="Toggle Navigation Sidebar"
          >
            <Icon name="layers" size={18} />
          </Button>
        )}

        <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => onToggleView('app')}>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-indigo-500 via-purple-500 to-cyan-400 text-white shadow-sm shadow-indigo-500/20">
            <Icon name="cpu" size={18} />
          </div>

          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm tracking-tight text-foreground">
                ML Playground
              </span>
              <Badge variant="primary" size="sm">
                APEX v1.0
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Center: Search Placeholder */}
      <div className="hidden md:flex items-center max-w-sm w-full mx-4">
        <Input
          placeholder="Search datasets, models, experiments... (⌘K)"
          startIcon="search"
          fullWidth
          className="bg-muted/40 h-8 text-xs border-border/60"
        />
      </div>

      {/* Right: View Switcher, Theme Toggle, Profile */}
      <div className="flex items-center gap-2">
        <Button
          variant={currentView === 'apex' ? 'primary' : 'ghost'}
          size="sm"
          onClick={() => onToggleView(currentView === 'app' ? 'apex' : 'app')}
          className="text-xs gap-1.5"
        >
          <Icon name="sparkles" size={14} />
          {currentView === 'app' ? 'APEX Design System' : 'ML Workspace'}
        </Button>

        <ThemeToggle />

        {onToggleAiPanel && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleAiPanel}
            aria-label="Toggle AI Assistant Panel"
            title="AI Assistant Panel"
          >
            <Icon name="sparkles" size={18} className="text-purple-400" />
          </Button>
        )}

        <div className="h-4 w-px bg-border/60 mx-1" />

        <Avatar fallback="ML" size="sm" className="cursor-pointer" />
      </div>
    </header>
  )
}
