import { useState } from 'react'
import { Compass, ListChecks } from 'lucide-react'
import { useLearning } from '../context/LearningContext'

export interface GuideStep {
  title: string
  action: string
}

export interface PanelLearningCollapsibleProps {
  title: string
  concept?: string
  details?: string
  practicalTip?: string
  citation?: string
  className?: string
  steps?: (GuideStep | string)[]
  quickTip?: string
  defaultOpen?: boolean
}

export function PanelLearningCollapsible({
  title,
  concept,
  details,
  practicalTip,
  citation,
  className = '',
  steps,
  quickTip,
  defaultOpen,
}: PanelLearningCollapsibleProps) {
  const { learningMode } = useLearning()
  // Default to open if steps are provided (or defaultOpen true), else default to false for legacy theory stubs
  const [isOpen, setIsOpen] = useState(() => defaultOpen ?? (steps !== undefined && steps.length > 0))

  // Only visible when global Learning Mode is ON
  if (!learningMode) return null

  return (
    <div
      data-testid="panel-learning-collapsible"
      className={`border border-slate-700/60 bg-[#111622] rounded-xl overflow-hidden mb-4 shadow-sm transition-all ${className}`}
      style={{
        backgroundColor: '#111622',
        borderColor: 'rgba(51, 65, 85, 0.7)',
        flexShrink: 0,
      }}
    >
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-center justify-between px-3.5 py-2.5 text-left text-xs font-semibold text-slate-200 hover:bg-slate-800/40 transition-colors"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-5 h-5 rounded bg-slate-800 border border-slate-700 text-slate-300 flex items-center justify-center shrink-0">
            <Compass className="w-3.5 h-3.5" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
              Page Guide
            </span>
            <span className="text-xs font-semibold text-slate-200">
              What is this? {title}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-slate-400 bg-slate-800/80 border border-slate-700 px-2 py-0.5 rounded font-medium">
            {isOpen ? 'Hide Guide ▲' : 'Show Guide ▼'}
          </span>
        </div>
      </button>

      {isOpen && (
        <div
          className="px-4 pb-3.5 pt-2 text-xs bg-slate-900/40 space-y-3 animate-in fade-in duration-150"
          style={{ backgroundColor: 'rgba(15, 23, 42, 0.65)' }}
        >
          {/* Action-oriented steps: What to do on this page */}
          {steps && steps.length > 0 && (
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <ListChecks className="w-3.5 h-3.5 text-slate-400" />
                <span>What to do on this page:</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {steps.map((st, i) => {
                  const stepTitle = typeof st === 'string' ? `Step ${i + 1}` : st.title
                  const stepAction = typeof st === 'string' ? st : st.action
                  return (
                    <div
                      key={i}
                      className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800/90 flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="w-4 h-4 rounded-full bg-slate-800 border border-slate-700 text-slate-300 text-[10px] font-bold flex items-center justify-center shrink-0">
                            {i + 1}
                          </span>
                          <span className="text-xs font-semibold text-slate-100">{stepTitle}</span>
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed pl-6">{stepAction}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Simple concepts or details */}
          {concept && (
            <p className="font-medium text-slate-200">{concept}</p>
          )}
          {details && (
            <p className="text-slate-400 leading-relaxed">{details}</p>
          )}

          {/* Helpful practical tip */}
          {(quickTip || practicalTip) && (
            <div className="bg-slate-900/90 border border-slate-800 p-2.5 rounded-lg text-[11px] text-slate-300 flex items-start gap-2">
              <span className="font-semibold text-slate-200 shrink-0">Helpful Tip:</span>
              <span className="text-slate-300">{quickTip || practicalTip}</span>
            </div>
          )}

          {citation && (
            <p className="text-[10px] text-slate-500 italic pt-0.5">
              Reference: {citation}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
