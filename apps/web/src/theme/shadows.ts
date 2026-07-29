/**
 * APEX Design System — Shadow & Elevation Tokens
 */

export const shadows = {
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
  inner: 'inset 0 2px 4px 0 rgb(0 0 0 / 0.05)',
  glow: {
    brand: '0 0 20px -3px rgba(99, 102, 241, 0.4)',
    accent: '0 0 20px -3px rgba(139, 92, 246, 0.4)',
    cyan: '0 0 20px -3px rgba(6, 182, 212, 0.4)',
  },
} as const

export type ShadowToken = keyof typeof shadows
