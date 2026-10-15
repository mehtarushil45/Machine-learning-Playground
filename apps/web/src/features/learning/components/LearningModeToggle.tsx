import { Compass } from 'lucide-react'
import { useLearning } from '../context/LearningContext'

export function LearningModeToggle() {
  const { learningMode, toggleLearningMode } = useLearning()

  return (
    <button
      type="button"
      data-testid="learning-mode-toggle"
      onClick={toggleLearningMode}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
        learningMode
          ? 'bg-slate-800/95 border-slate-600 text-slate-100 shadow-sm'
          : 'bg-white/5 border-white/10 text-slate-400 hover:text-slate-200 hover:border-slate-700'
      }`}
      title="Toggle Page Guide: Shows step-by-step guidance on what to do on each page"
      aria-pressed={learningMode}
    >
      <Compass className="w-3.5 h-3.5 text-slate-300" aria-hidden="true" />
      <span>Page Guide:</span>
      <span
        className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
          learningMode
            ? 'bg-white/15 text-white border border-white/20'
            : 'bg-white/5 text-slate-400'
        }`}
      >
        {learningMode ? 'ON' : 'OFF'}
      </span>
    </button>
  )
}
