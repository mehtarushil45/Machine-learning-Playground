import React from 'react'
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
          ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.2)]'
          : 'bg-white/5 border-white/10 text-muted-foreground hover:text-foreground'
      }`}
      title="Toggle Learning Mode: adds educational guidance, 'What is this?' panels, and metric tooltips"
      aria-pressed={learningMode}
    >
      <span className="text-sm" aria-hidden="true">
        {learningMode ? '🎓' : '⚙️'}
      </span>
      <span>Learning Mode:</span>
      <span
        className={`px-1.5 py-0.2 rounded text-[10px] font-bold uppercase tracking-wider ${
          learningMode ? 'bg-amber-500/25 text-amber-200' : 'bg-white/10 text-muted-foreground'
        }`}
      >
        {learningMode ? 'ON' : 'OFF'}
      </span>
    </button>
  )
}
