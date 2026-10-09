/**
 * TypeScript type definitions for Student Learning Layer Heads-Up Rules (Part B).
 */

import { Dataset } from '../../../types/dataset'
import { JobEntity } from '../../../types/training'

export type CardSeverity = 'info' | 'warning'

export interface LearningProjectState {
  dataset: Dataset | null
  selectedFeatures: string[]
  selectedTarget: string | null
  taskType?: 'classification' | 'regression' | null
  activeJob?: JobEntity | null
  jobHistory?: JobEntity[]
  code?: string
  splitRatio?: number
  testSampleCount?: number
  classDistribution?: Record<string, number>
}

export interface HeadsUpTriggerResult {
  triggered: boolean
  message?: string
  details?: Record<string, any>
}

export interface HeadsUpRule {
  id: string
  title: string
  severity: CardSeverity
  lesson_id: string
  message: string
  why_it_matters: string
  how_to_fix: string
  trigger: (state: LearningProjectState) => HeadsUpTriggerResult | null
}

export interface HeadsUpCard {
  id: string
  rule_id: string
  title: string
  severity: CardSeverity
  lesson_id: string
  message: string
  why_it_matters: string
  how_to_fix: string
  details?: Record<string, any>
  dismissed?: boolean
}

export interface LessonCheckDetails {
  metric?: string
  description?: string
  question?: string
  options?: string[]
  correct_index?: number
  explanation?: string
}

export interface LessonItem {
  id: string
  number: number
  title: string
  page_route: string
  goal: string
  short_explanation: string
  task: string
  check_type: 'platform_state' | 'knowledge_check'
  check_details: LessonCheckDetails
  why_it_matters: string
  primary_source: string
  needs_instructor_review: boolean
}

export interface PitfallStory {
  id: string
  filename: string
  title: string
  story: string
  target: string
  problem_type: string
  pitfall_type: string
  pitfall_name: string
  hint: string
  reveal: string
  row_count: number
  columns: string[]
}
