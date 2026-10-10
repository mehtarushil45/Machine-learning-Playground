import { useState } from 'react'
import { useLearning } from '../context/LearningContext'

interface PanelLearningCollapsibleProps {
  title: string
  concept: string
  details: string
  practicalTip?: string
  citation?: string
  className?: string
}

export function PanelLearningCollapsible({
  title,
  concept,
  details,
  practicalTip,
  citation,
  className = '',
}: PanelLearningCollapsibleProps) {
  const { learningMode } = useLearning()
  const [isOpen, setIsOpen] = useState(false)

  // Only visible when global Learning Mode is ON
  if (!learningMode) return null

  return (
    <div
      data-testid="panel-learning-collapsible"
      className={`border border-amber-500/25 bg-amber-950/15 rounded-xl overflow-hidden mb-4 transition-all ${className}`}
    >
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-center justify-between px-3.5 py-2 text-left text-xs font-semibold text-amber-300 hover:bg-amber-500/10 transition-colors"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2">
          <span>💡</span>
          <span>What is this? {title}</span>
        </div>
        <span className="text-[10px] text-amber-400/80 bg-amber-500/20 px-2 py-0.5 rounded-full">
          {isOpen ? 'Collapse ▲' : 'Expand ▼'}
        </span>
      </button>

      {isOpen && (
        <div className="px-4 pb-3 pt-1 text-xs text-foreground/80 space-y-2 border-t border-amber-500/20 animate-in fade-in duration-150">
          <p className="font-medium text-amber-100">{concept}</p>
          <p className="text-muted-foreground leading-relaxed">{details}</p>

          {practicalTip && (
            <div className="bg-black/30 p-2 rounded-lg text-[11px] text-foreground/90">
              <span className="font-semibold text-amber-300">Practical Tip: </span>
              {practicalTip}
            </div>
          )}

          {citation && (
            <p className="text-[10px] text-muted-foreground italic pt-1">
              Primary Reference: {citation}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
