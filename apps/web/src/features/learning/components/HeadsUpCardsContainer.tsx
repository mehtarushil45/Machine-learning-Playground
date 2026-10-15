import { AlertCircle, Info, ArrowUpRight } from 'lucide-react'
import { useLearning } from '../context/LearningContext'
import { HeadsUpCard } from '../rules/types'

interface HeadsUpCardsContainerProps {
  cards?: HeadsUpCard[]
  className?: string
}

export function HeadsUpCardsContainer({
  cards: overrideCards,
  className = '',
}: HeadsUpCardsContainerProps) {
  const { activeCards, dismissCard, learningAidsAllowed } = useLearning()
  const displayCards = overrideCards || activeCards

  if (!learningAidsAllowed || displayCards.length === 0) {
    return null
  }

  return (
    <div
      data-testid="heads-up-cards-container"
      className={`space-y-3 my-3 ${className}`}
      role="region"
      aria-label="ML Mistake Feedback Cards"
    >
      {displayCards.map((card) => {
        const isWarning = card.severity === 'warning'
        const borderClass = isWarning
          ? 'border-slate-700 bg-[#121826] text-slate-200'
          : 'border-slate-800 bg-[#0F1420] text-slate-300'
        const badgeClass = isWarning
          ? 'bg-slate-800 text-slate-200 border-slate-600'
          : 'bg-slate-800/60 text-slate-400 border-slate-700'

        return (
          <div
            key={card.id}
            data-testid={`heads-up-card-${card.rule_id}`}
            className={`p-4 rounded-xl border shadow-sm transition-all animate-in fade-in duration-150 ${borderClass}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-slate-400" aria-hidden="true">
                  {isWarning ? <AlertCircle className="w-4 h-4 text-slate-300" /> : <Info className="w-4 h-4 text-slate-400" />}
                </span>
                <span
                  className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border ${badgeClass}`}
                >
                  {isWarning ? 'Attention' : 'Note'}
                </span>
                <h4 className="font-semibold text-xs text-slate-100">{card.title}</h4>
              </div>

              {/* Dismiss button (never blocks user) */}
              <button
                type="button"
                data-testid={`dismiss-card-${card.rule_id}`}
                onClick={() => dismissCard(card.rule_id)}
                className="text-xs text-slate-400 hover:text-slate-200 px-2 py-0.5 rounded hover:bg-slate-800/60 transition-colors"
                title="Dismiss this card"
                aria-label={`Dismiss ${card.title}`}
              >
                ✕ Dismiss
              </button>
            </div>

            <p className="mt-2 text-xs text-slate-300 leading-relaxed">
              {card.message}
            </p>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] pt-2 border-t border-slate-800/80">
              <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                <span className="font-semibold text-slate-400 block mb-0.5">
                  Why this happens:
                </span>
                <p className="text-slate-300 leading-relaxed">{card.why_it_matters}</p>
              </div>

              <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                <span className="font-semibold text-slate-400 block mb-0.5">
                  Recommended action:
                </span>
                <p className="text-slate-300 leading-relaxed">{card.how_to_fix}</p>
              </div>
            </div>

            {card.lesson_id && (
              <div className="mt-2 text-right">
                <button
                  type="button"
                  onClick={() => {
                    if (typeof window !== 'undefined') {
                      window.open(`${window.location.origin}${window.location.pathname}#guide`, '_blank')
                    }
                  }}
                  className="text-[11px] text-slate-400 hover:text-slate-200 font-medium hover:underline inline-flex items-center gap-1"
                >
                  <span>Learn more in Guide</span>
                  <ArrowUpRight className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
