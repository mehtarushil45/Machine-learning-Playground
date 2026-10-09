import React, { useState } from 'react'
import { useLearning } from '../context/LearningContext'
import { LessonItem } from '../rules/types'

interface LessonGuideDrawerProps {
  isOpen: boolean
  onClose: () => void
  onNavigate?: (route: string) => void
}

export function LessonGuideDrawer({
  isOpen,
  onClose,
  onNavigate,
}: LessonGuideDrawerProps) {
  const {
    lessons,
    completedLessonIds,
    currentLessonId,
    setCurrentLessonId,
    completeLesson,
  } = useLearning()

  const [selectedLesson, setSelectedLesson] = useState<LessonItem | null>(() => {
    return lessons[0] || null
  })

  // Knowledge check state
  const [selectedOption, setSelectedOption] = useState<number | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ message: string; isCorrect: boolean } | null>(null)

  if (!isOpen) return null

  const activeLesson = selectedLesson || lessons[0]
  const isCompleted = completedLessonIds.includes(activeLesson.id)

  const handleSelectOption = (idx: number) => {
    setSelectedOption(idx)
    setFeedback(null)
  }

  const handleVerifyKnowledge = async () => {
    if (selectedOption === null) return
    setIsSubmitting(true)
    const success = await completeLesson(activeLesson.id, selectedOption)
    setIsSubmitting(false)

    if (success) {
      setFeedback({
        message: activeLesson.check_details.explanation || 'Correct! Well done.',
        isCorrect: true,
      })
    } else {
      setFeedback({
        message: activeLesson.check_details.explanation || 'Incorrect. Try reviewing the lesson material.',
        isCorrect: false,
      })
    }
  }

  const handleVerifyPlatform = async () => {
    setIsSubmitting(true)
    const success = await completeLesson(activeLesson.id, undefined, { verified: true })
    setIsSubmitting(false)
    if (success) {
      setFeedback({
        message: 'Platform state requirement verified successfully!',
        isCorrect: true,
      })
    }
  }

  return (
    <div
      data-testid="lesson-guide-drawer"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-end animate-in fade-in duration-200"
    >
      <div className="w-full max-w-2xl bg-card border-l border-border h-full flex flex-col shadow-2xl">
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between bg-black/20">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">🎓</span>
              <h3 className="font-bold text-base text-foreground">
                ML Guided Curriculum
              </h3>
              <span className="text-xs bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-medium">
                {completedLessonIds.length} / {lessons.length} Completed
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              10 structured, verifiable lessons mapped to production ML workflows
            </p>
          </div>

          <button
            type="button"
            data-testid="close-lesson-drawer"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-white/10"
          >
            ✕
          </button>
        </div>

        {/* Content split: Sidebar list + Detail view */}
        <div className="flex-1 flex overflow-hidden">
          {/* Lessons list */}
          <div className="w-64 border-r border-border overflow-y-auto p-2 space-y-1 bg-black/10">
            {lessons.map((lesson) => {
              const done = completedLessonIds.includes(lesson.id)
              const selected = activeLesson.id === lesson.id

              return (
                <button
                  key={lesson.id}
                  type="button"
                  data-testid={`lesson-item-${lesson.id}`}
                  onClick={() => {
                    setSelectedLesson(lesson)
                    setCurrentLessonId(lesson.id)
                    setSelectedOption(null)
                    setFeedback(null)
                  }}
                  className={`w-full text-left p-2.5 rounded-lg text-xs transition-colors flex items-start gap-2 ${
                    selected
                      ? 'bg-amber-500/20 text-amber-200 font-semibold border border-amber-500/40'
                      : 'hover:bg-white/5 text-muted-foreground'
                  }`}
                >
                  <span className="mt-0.5" aria-hidden="true">
                    {done ? '✅' : `${lesson.number}.`}
                  </span>
                  <div className="flex-1 truncate">
                    <div className="truncate text-foreground font-medium">
                      {lesson.title}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {lesson.page_route}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Lesson Details */}
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">
                  Lesson {activeLesson.number} of {lessons.length} • {activeLesson.page_route}
                </span>

                {isCompleted && (
                  <span className="text-xs bg-emerald-500/20 text-emerald-300 font-semibold px-2 py-0.5 rounded-full">
                    Completed ✓
                  </span>
                )}
              </div>

              <h2 className="text-lg font-bold text-foreground mt-2">
                {activeLesson.title}
              </h2>

              <p className="text-sm font-medium text-amber-200/90 mt-1">
                Goal: {activeLesson.goal}
              </p>
            </div>

            {/* Explanation */}
            <div className="bg-black/25 p-4 rounded-xl border border-white/5 space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Core Explanation
              </h4>
              <p className="text-xs text-foreground/80 leading-relaxed">
                {activeLesson.short_explanation}
              </p>
            </div>

            {/* Platform Task */}
            <div className="bg-amber-950/20 border border-amber-500/30 p-4 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                  <span>🛠️</span> Platform Task
                </h4>
                {onNavigate && (
                  <button
                    type="button"
                    onClick={() => {
                      onNavigate(activeLesson.page_route)
                      onClose()
                    }}
                    className="text-[11px] text-sky-400 hover:text-sky-300 font-medium underline"
                  >
                    Open Page ({activeLesson.page_route}) →
                  </button>
                )}
              </div>
              <p className="text-xs text-foreground/90">{activeLesson.task}</p>
            </div>

            {/* Why it matters */}
            <div className="bg-black/25 p-4 rounded-xl border border-white/5 space-y-1 text-xs">
              <h4 className="font-semibold text-muted-foreground">Why It Matters:</h4>
              <p className="text-foreground/80">{activeLesson.why_it_matters}</p>
            </div>

            {/* Verification Check */}
            <div className="border border-white/10 rounded-xl p-4 bg-black/30 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                  Verification Check (Honest Verification)
                </h4>
                <span className="text-[10px] text-muted-foreground">
                  {activeLesson.check_type === 'knowledge_check'
                    ? 'Conceptual Question'
                    : 'Platform State Verification'}
                </span>
              </div>

              {activeLesson.check_type === 'knowledge_check' && (
                <div className="space-y-3">
                  <p className="text-xs font-medium text-foreground">
                    {activeLesson.check_details.question}
                  </p>

                  <div className="space-y-2">
                    {activeLesson.check_details.options?.map((opt, optIdx) => (
                      <label
                        key={optIdx}
                        className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                          selectedOption === optIdx
                            ? 'bg-amber-500/15 border-amber-500/50 text-amber-200'
                            : 'border-white/10 hover:bg-white/5 text-foreground/80'
                        }`}
                      >
                        <input
                          type="radio"
                          name="knowledge_option"
                          checked={selectedOption === optIdx}
                          onChange={() => handleSelectOption(optIdx)}
                          className="mt-0.5 accent-amber-500"
                        />
                        <span>{opt}</span>
                      </label>
                    ))}
                  </div>

                  <button
                    type="button"
                    data-testid="submit-lesson-check"
                    disabled={selectedOption === null || isSubmitting}
                    onClick={handleVerifyKnowledge}
                    className="w-full py-2 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs disabled:opacity-50 transition-colors"
                  >
                    {isSubmitting ? 'Evaluating...' : 'Verify Answer & Complete Lesson'}
                  </button>
                </div>
              )}

              {activeLesson.check_type === 'platform_state' && (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Requirement: {activeLesson.check_details.description}
                  </p>

                  <button
                    type="button"
                    data-testid="verify-platform-state"
                    disabled={isSubmitting}
                    onClick={handleVerifyPlatform}
                    className="w-full py-2 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors"
                  >
                    {isSubmitting ? 'Verifying...' : 'Verify Task Completed on Platform'}
                  </button>
                </div>
              )}

              {feedback && (
                <div
                  className={`p-3 rounded-lg text-xs leading-relaxed border ${
                    feedback.isCorrect
                      ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                      : 'bg-rose-950/30 border-rose-500/40 text-rose-200'
                  }`}
                >
                  <span className="font-bold mr-1">
                    {feedback.isCorrect ? '✓ Verified:' : '✗ Notice:'}
                  </span>
                  {feedback.message}
                </div>
              )}
            </div>

            {/* Primary Source Citation */}
            <div className="pt-2 border-t border-white/5 text-[11px] text-muted-foreground space-y-1">
              <div>
                <span className="font-semibold text-foreground/70">Primary Source: </span>
                <span className="italic">{activeLesson.primary_source}</span>
              </div>
              <div className="text-[10px] text-amber-400/70">
                Status: Marked 'Needs Instructor Review' pending faculty sign-off.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
