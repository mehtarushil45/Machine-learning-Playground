/**
 * Learning Context & State Provider.
 *
 * Coordinates:
 * - Global Learning Mode toggle (persisted, default true for students)
 * - Server-side / Exam learning aids gatekeeper (B10)
 * - Dismissible Heads-Up Cards evaluation per project
 * - Guided lesson progress and checks
 * - Private pilot signal telemetry
 */

import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react'
import { HeadsUpCard, LessonItem, PitfallStory, LearningProjectState } from '../rules/types'
import { evaluateHeadsUpRules } from '../rules/registry'
import lessonsContent from '../../../content/lessons/lessons.json'

interface LearningContextValue {
  learningMode: boolean
  toggleLearningMode: () => void
  learningAidsAllowed: boolean
  setLearningAidsAllowed: (allowed: boolean) => void
  activeCards: HeadsUpCard[]
  dismissCard: (ruleId: string) => void
  resetDismissedCards: () => void
  lessons: LessonItem[]
  completedLessonIds: string[]
  currentLessonId: string | null
  setCurrentLessonId: (id: string | null) => void
  completeLesson: (lessonId: string, answerOption?: number, evidence?: Record<string, any>) => Promise<boolean>
  stories: PitfallStory[]
  loadStoryDataset: (storyId: string) => Promise<any>
  logSignal: (eventType: string, cardId?: string, lessonId?: string, page?: string) => void
}

const LearningContext = createContext<LearningContextValue | null>(null)

export function LearningProvider({
  children,
  projectState,
  initialLearningAidsAllowed = true,
}: {
  children: React.ReactNode
  projectState?: LearningProjectState
  initialLearningAidsAllowed?: boolean
}) {
  // Global Learning Mode toggle (default true for student learning)
  const [learningMode, setLearningMode] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('apex_learning_mode_enabled')
      return stored !== null ? JSON.parse(stored) : true
    } catch {
      return true
    }
  })

  // Learning aids enabled by instructor (default true, false on strict exams)
  const [learningAidsAllowed, setLearningAidsAllowed] = useState<boolean>(initialLearningAidsAllowed)

  // Dismissed cards per project
  const [dismissedCardIds, setDismissedCardIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('apex_dismissed_cards')
      return stored ? new Set(JSON.parse(stored)) : new Set()
    } catch {
      return new Set()
    }
  })

  // Guided lessons
  const lessons = useMemo(() => lessonsContent as unknown as LessonItem[], [])
  const [completedLessonIds, setCompletedLessonIds] = useState<string[]>([])
  const [currentLessonId, setCurrentLessonId] = useState<string | null>('lesson-01-read-data')
  const [stories, setStories] = useState<PitfallStory[]>([])

  // Telemetry logger (Part F)
  const logSignal = useCallback((eventType: string, cardId?: string, lessonId?: string, page?: string) => {
    try {
      fetch('/api/v1/learning/signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: eventType,
          card_id: cardId,
          lesson_id: lessonId,
          context_page: page || window.location.pathname,
          learning_mode_enabled: learningMode,
        }),
      }).catch(() => {})
    } catch {
      // Telemetry fail-open
    }
  }, [learningMode])

  // Fetch initial progress & pitfall stories
  useEffect(() => {
    fetch('/api/v1/learning/progress')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.completed_lessons)) {
          setCompletedLessonIds(data.completed_lessons)
        }
      })
      .catch(() => {})

    fetch('/api/v1/learning/stories')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (Array.isArray(data)) {
          setStories(data)
        }
      })
      .catch(() => {})
  }, [])

  const toggleLearningMode = useCallback(() => {
    setLearningMode((prev) => {
      const next = !prev
      try {
        localStorage.setItem('apex_learning_mode_enabled', JSON.stringify(next))
      } catch {}
      logSignal('learning_mode_toggled', undefined, undefined, window.location.pathname)
      return next
    })
  }, [logSignal])

  const dismissCard = useCallback((ruleId: string) => {
    setDismissedCardIds((prev) => {
      const next = new Set(prev)
      next.add(ruleId)
      try {
        localStorage.setItem('apex_dismissed_cards', JSON.stringify(Array.from(next)))
      } catch {}
      logSignal('card_dismissed', ruleId, undefined, window.location.pathname)
      return next
    })
  }, [logSignal])

  const resetDismissedCards = useCallback(() => {
    setDismissedCardIds(new Set())
    try {
      localStorage.removeItem('apex_dismissed_cards')
    } catch {}
  }, [])

  // Evaluate active Heads-Up cards from real project state
  const activeCards = useMemo(() => {
    if (!learningAidsAllowed) return [] // Disabled by instructor on exam
    if (!projectState) return []
    return evaluateHeadsUpRules(projectState, dismissedCardIds)
  }, [projectState, dismissedCardIds, learningAidsAllowed])

  // Complete a lesson with check validation
  const completeLesson = useCallback(
    async (lessonId: string, answerOption?: number, evidence?: Record<string, any>): Promise<boolean> => {
      try {
        const res = await fetch(`/api/v1/learning/progress/${lessonId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            selected_option: answerOption,
            platform_state_evidence: evidence || { verified: true },
          }),
        })

        if (!res.ok) {
          const err = await res.json()
          alert(err.detail || 'Verification check not passed.')
          return false
        }

        setCompletedLessonIds((prev) => Array.from(new Set([...prev, lessonId])))
        logSignal('lesson_completed', undefined, lessonId, window.location.pathname)
        return true
      } catch {
        return false
      }
    },
    [logSignal],
  )

  const loadStoryDataset = useCallback(
    async (storyId: string) => {
      try {
        const res = await fetch(`/api/v1/learning/stories/${storyId}/load`, { method: 'POST' })
        if (!res.ok) throw new Error('Failed to load story dataset')
        return await res.json()
      } catch (err: any) {
        alert(err.message || 'Error loading story dataset')
        return null
      }
    },
    [],
  )

  const value: LearningContextValue = {
    learningMode,
    toggleLearningMode,
    learningAidsAllowed,
    setLearningAidsAllowed,
    activeCards,
    dismissCard,
    resetDismissedCards,
    lessons,
    completedLessonIds,
    currentLessonId,
    setCurrentLessonId,
    completeLesson,
    stories,
    loadStoryDataset,
    logSignal,
  }

  return <LearningContext.Provider value={value}>{children}</LearningContext.Provider>
}

export function useLearning() {
  const context = useContext(LearningContext)
  if (!context) {
    // Provide safe fallback if component is rendered outside provider
    return {
      learningMode: true,
      toggleLearningMode: () => {},
      learningAidsAllowed: true,
      setLearningAidsAllowed: () => {},
      activeCards: [],
      dismissCard: () => {},
      resetDismissedCards: () => {},
      lessons: lessonsContent as unknown as LessonItem[],
      completedLessonIds: [],
      currentLessonId: null,
      setCurrentLessonId: () => {},
      completeLesson: async () => false,
      stories: [],
      loadStoryDataset: async () => null,
      logSignal: () => {},
    }
  }
  return context
}
