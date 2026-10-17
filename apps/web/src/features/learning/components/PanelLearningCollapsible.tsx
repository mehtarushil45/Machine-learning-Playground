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
      className={`border rounded-xl overflow-hidden mb-4 shadow-sm transition-all ${className}`}
      style={{
        backgroundColor: 'rgba(27, 21, 48, 0.75)',
        borderColor: 'rgba(107, 92, 166, 0.3)',
        flexShrink: 0,
      }}
    >
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-center justify-between px-3.5 py-2.5 text-left text-xs font-semibold text-white transition-colors"
        style={{
          background: 'rgba(42, 34, 71, 0.35)',
        }}
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2.5">
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: 4,
              background: 'rgba(0, 212, 255, 0.16)',
              border: '1px solid rgba(0, 212, 255, 0.38)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Compass style={{ width: 14, height: 14, color: '#00D4FF' }} />
          </div>
          <div className="flex items-center gap-2">
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '2px 8px',
                borderRadius: 4,
                background: 'rgba(0, 212, 255, 0.16)',
                border: '1px solid rgba(0, 212, 255, 0.38)',
                color: '#FFFFFF',
                fontSize: 10,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.07em',
              }}
            >
              Page Guide
            </span>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#FFFFFF' }}>
              What is this? {title}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            style={{
              fontSize: 10,
              color: '#FFFFFF',
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              padding: '2px 8px',
              borderRadius: 4,
              fontWeight: 500,
            }}
          >
            {isOpen ? 'Hide Guide ▲' : 'Show Guide ▼'}
          </span>
        </div>
      </button>

      {isOpen && (
        <div
          className="px-4 pb-3.5 pt-2 text-xs space-y-3 animate-in fade-in duration-150"
          style={{ backgroundColor: 'rgba(15, 23, 42, 0.45)' }}
        >
          {/* Action-oriented steps: What to do on this page */}
          {steps && steps.length > 0 && (
            <div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: '#FFFFFF',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  marginBottom: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <ListChecks style={{ width: 14, height: 14, color: '#00D4FF' }} />
                <span>What to do on this page:</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {steps.map((st, i) => {
                  const stepTitle = typeof st === 'string' ? `Step ${i + 1}` : st.title
                  const stepAction = typeof st === 'string' ? st : st.action
                  return (
                    <div
                      key={i}
                      className="p-2.5 rounded-lg flex flex-col justify-between"
                      style={{
                        background: 'rgba(27, 21, 48, 0.85)',
                        border: '1px solid rgba(107, 92, 166, 0.25)',
                      }}
                    >
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            style={{
                              width: 18,
                              height: 18,
                              borderRadius: '50%',
                              background: 'rgba(0, 212, 255, 0.16)',
                              border: '1px solid rgba(0, 212, 255, 0.38)',
                              color: '#FFFFFF',
                              fontSize: 10,
                              fontWeight: 700,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            {i + 1}
                          </span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#FFFFFF' }}>{stepTitle}</span>
                        </div>
                        <p style={{ fontSize: 11, color: '#FFFFFF', lineHeight: 1.5, paddingLeft: 26, opacity: 0.9 }}>
                          {stepAction}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Simple concepts or details */}
          {concept && (
            <p style={{ fontWeight: 500, color: '#FFFFFF' }}>{concept}</p>
          )}
          {details && (
            <p style={{ color: '#FFFFFF', lineHeight: 1.6, opacity: 0.85 }}>{details}</p>
          )}

          {/* Helpful practical tip */}
          {(quickTip || practicalTip) && (
            <div
              className="p-2.5 rounded-lg flex items-start gap-2"
              style={{
                background: 'rgba(27, 21, 48, 0.85)',
                border: '1px solid rgba(107, 92, 166, 0.25)',
                fontSize: 11,
                color: '#FFFFFF',
              }}
            >
              <span style={{ fontWeight: 700, color: '#00D4FF', flexShrink: 0 }}>Helpful Tip:</span>
              <span style={{ color: '#FFFFFF', opacity: 0.95 }}>{quickTip || practicalTip}</span>
            </div>
          )}

          {citation && (
            <p style={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.6)', fontStyle: 'italic', paddingTop: 2 }}>
              Reference: {citation}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
