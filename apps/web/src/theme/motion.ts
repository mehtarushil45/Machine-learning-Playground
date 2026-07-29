/**
 * APEX Design System — Motion System
 *
 * Provides standardized duration, easing curves, and reduced-motion support.
 */

export const motion = {
  durations: {
    instant: '0ms',
    fast: '150ms',
    normal: '250ms',
    slow: '400ms',
  },
  easing: {
    standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
    accelerate: 'cubic-bezier(0.4, 0, 1, 1)',
    decelerate: 'cubic-bezier(0, 0, 0.2, 1)',
    spring: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
  },
  // CSS Transition classes for Tailwind components
  transitions: {
    all: 'transition-all duration-200 ease-in-out motion-reduce:transition-none',
    colors: 'transition-colors duration-150 ease-in-out motion-reduce:transition-none',
    opacity: 'transition-opacity duration-200 ease-in-out motion-reduce:transition-none',
    transform: 'transition-transform duration-200 ease-out motion-reduce:transition-none',
  },
} as const

export type MotionToken = keyof typeof motion
