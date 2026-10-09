import React from 'react'
import { useLearning } from '../context/LearningContext'
import { HeadsUpCard } from '../rules/types'

interface HeadsUpCardsContainerProps {
  cards?: HeadsUpCard[]
  className?: string
  onNavigateToLesson?: (lessonId: string) => void
}

export function HeadsUpCardsContainer({
  cards: overrideCards,
  className = '',
  onNavigateToLesson,
}: HeadsUpCardsContainerProps) {
  const { activeCards, dismissCard, learningAidsAllowed } = useLearning()
  const displayCards = overrideCards || activeCards

  if (!learningAidsAllowed || displayCards.length === 0) {
    return null
  }

  return (
    <div
      data-testid="heads-up-cards-container"
      className={`space-y-3 my-4 ${className}`}
      role="region"
      aria-label="ML Mistake Feedback Cards"
    >
      {displayCards.map((card) => {
        const isWarning = card.severity === 'warning'
        const borderClass = isWarning
          ? 'border-amber-500/30 bg-amber-950/20 text-amber-200'
          : 'border-sky-500/30 bg-sky-950/20 text-sky-200'
        const badgeClass = isWarning
          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
          : 'bg-sky-500/20 text-sky-300 border-sky-500/40'

        return (
          <div
            key={card.id}
            data-testid={`heads-up-card-${card.rule_id}`}
            className={`p-4 rounded-xl border backdrop-blur-md shadow-lg transition-all animate-in fade-in duration-200 ${borderClass}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-lg" aria-hidden="true">
                  {isWarning ? '⚠️' : 'ℹ️'}
                </span>
                <span
                  className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full border ${badgeClass}`}
                >
                  {isWarning ? 'Heads-Up Warning' : 'Observation'}
                </span>
                <h4 className="font-semibold text-sm text-foreground">{card.title}</h4>
              </div>

              {/* Dismiss button (never blocks user) */}
              <button
                type="button"
                data-testid={`dismiss-card-${card.rule_id}`}
                onClick={() => dismissCard(card.rule_id)}
                className="text-xs text-muted-foreground hover:text-foreground px-2 py-0.5 rounded hover:bg-white/10 transition-colors"
                title="Dismiss this card for this project"
                aria-label={`Dismiss ${card.title}`}
              >
                ✕ Dismiss
              </button>
            </div>

            <p className="mt-2 text-xs font-medium text-foreground/90 leading-relaxed">
              {card.message}
            </p>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] pt-2 border-t border-white/5">
              <div className="bg-black/20 p-2 rounded-lg">
                <span className="font-semibold text-muted-foreground block mb-0.5">
                  Why it matters:
                </span>
                <p className="text-foreground/80">{card.why_it_matters}</p>
              </div>

              <div className="bg-black/20 p-2 rounded-lg">
                <span className="font-semibold text-muted-foreground block mb-0.5">
                  How to fix:
                </span>
                <p className="text-foreground/80">{card.how_to_fix}</p>
              </div>
            </div>

            {card.lesson_id && (
              <div className="mt-2 text-right">
                <button
                  type="button"
                  onClick={() => onNavigateToLesson?.(card.lesson_id)}
                  className="text-[11px] text-sky-400 hover:text-sky-300 font-medium hover:underline inline-flex items-center gap-1"
                >
                  Learn concept in Lesson Guide →
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
