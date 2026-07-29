/**
 * APEX Design System — Color Tokens & Palette Definition
 *
 * Defines semantic color tokens mapped to HSL/CSS custom properties.
 * Components must consume semantic color tokens rather than hardcoded hex codes.
 */

export const colors = {
  // Base Palette (Slate & Violet/Cyan Accents)
  palette: {
    slate: {
      50: '#f8fafc',
      100: '#f1f5f9',
      200: '#e2e8f0',
      300: '#cbd5e1',
      400: '#94a3b8',
      500: '#64748b',
      600: '#475569',
      700: '#334155',
      800: '#1e293b',
      900: '#0f172a',
      950: '#020617',
    },
    brand: {
      primary: '#6366f1', // Indigo 500
      primaryHover: '#4f46e5',
      accent: '#8b5cf6', // Violet 500
      accentGlow: 'rgba(139, 92, 246, 0.35)',
      cyan: '#06b6d4',
    },
    semantic: {
      success: '#10b981',
      warning: '#f59e0b',
      danger: '#ef4444',
      info: '#3b82f6',
    },
  },

  // Semantic Design Tokens for UI Components
  tokens: {
    light: {
      background: '#f8fafc',
      foreground: '#0f172a',
      card: '#ffffff',
      cardForeground: '#0f172a',
      popover: '#ffffff',
      popoverForeground: '#0f172a',
      primary: '#6366f1',
      primaryForeground: '#ffffff',
      secondary: '#f1f5f9',
      secondaryForeground: '#334155',
      muted: '#f1f5f9',
      mutedForeground: '#64748b',
      accent: '#8b5cf6',
      accentForeground: '#ffffff',
      destructive: '#ef4444',
      destructiveForeground: '#ffffff',
      border: '#e2e8f0',
      input: '#e2e8f0',
      ring: '#6366f1',
      glass: 'rgba(255, 255, 255, 0.75)',
      glassBorder: 'rgba(226, 232, 240, 0.6)',
    },
    dark: {
      background: '#090d16',
      foreground: '#f8fafc',
      card: '#0f172a',
      cardForeground: '#f8fafc',
      popover: '#0f172a',
      popoverForeground: '#f8fafc',
      primary: '#6366f1',
      primaryForeground: '#ffffff',
      secondary: '#1e293b',
      secondaryForeground: '#cbd5e1',
      muted: '#1e293b',
      mutedForeground: '#94a3b8',
      accent: '#8b5cf6',
      accentForeground: '#ffffff',
      destructive: '#f87171',
      destructiveForeground: '#0f172a',
      border: '#1e293b',
      input: '#1e293b',
      ring: '#8b5cf6',
      glass: 'rgba(15, 23, 42, 0.75)',
      glassBorder: 'rgba(30, 41, 59, 0.6)',
    },
  },
} as const

export type ColorToken = keyof typeof colors.tokens.light
