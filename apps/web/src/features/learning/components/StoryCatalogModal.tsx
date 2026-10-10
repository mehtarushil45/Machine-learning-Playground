import { useState } from 'react'
import { useLearning } from '../context/LearningContext'
import { PitfallStory } from '../rules/types'

interface StoryCatalogModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectStory?: (story: PitfallStory, datasetInfo: any) => void
}

export function StoryCatalogModal({
  isOpen,
  onClose,
  onSelectStory,
}: StoryCatalogModalProps) {
  const { stories, loadStoryDataset } = useLearning()
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [selectedStory, setSelectedStory] = useState<PitfallStory | null>(null)

  if (!isOpen) return null

  const handleLoad = async (story: PitfallStory) => {
    setLoadingId(story.id)
    const result = await loadStoryDataset(story.id)
    setLoadingId(null)
    if (result) {
      onSelectStory?.(story, result)
      onClose()
    }
  }

  return (
    <div
      data-testid="story-catalog-modal"
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
    >
      <div className="bg-card border border-border rounded-2xl max-w-4xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-border flex items-center justify-between bg-black/30">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">📚</span>
              <h3 className="font-bold text-lg text-foreground">
                Start with a Story: Pitfall Datasets
              </h3>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Synthetic, license-clean datasets designed to teach ML pitfalls (leakage, severe imbalance, multicollinearity, Simpson's paradox, identifier keys, MNAR).
            </p>
          </div>

          <button
            type="button"
            data-testid="close-story-catalog"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-white/10"
          >
            ✕
          </button>
        </div>

        {/* Stories Grid */}
        <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-4">
          {stories.map((s) => {
            const isSelected = selectedStory?.id === s.id
            const isLoading = loadingId === s.id

            return (
              <div
                key={s.id}
                data-testid={`story-card-${s.id}`}
                onClick={() => setSelectedStory(s)}
                className={`p-4 rounded-xl border transition-all flex flex-col justify-between cursor-pointer ${
                  isSelected
                    ? 'border-amber-500/60 bg-amber-950/20 shadow-md'
                    : 'border-white/10 bg-black/20 hover:border-white/20'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      {s.pitfall_name}
                    </span>
                    <span className="text-[11px] text-muted-foreground font-mono">
                      {s.row_count} rows • {s.problem_type}
                    </span>
                  </div>

                  <h4 className="font-bold text-sm text-foreground mt-2">
                    {s.title}
                  </h4>

                  <p className="text-xs text-foreground/80 mt-1 leading-relaxed">
                    {s.story}
                  </p>

                  <div className="mt-3 p-2.5 rounded-lg bg-black/40 border border-white/5 text-[11px] space-y-1">
                    <div className="text-amber-300/90 font-medium">
                      💡 Pre-Training Hint:
                    </div>
                    <p className="text-muted-foreground">{s.hint}</p>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">
                    Target: <code className="text-foreground">{s.target}</code>
                  </span>

                  <button
                    type="button"
                    data-testid={`load-story-${s.id}`}
                    disabled={isLoading}
                    onClick={() => handleLoad(s)}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs transition-colors flex items-center gap-1.5"
                  >
                    {isLoading ? 'Loading...' : 'Load Dataset →'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
