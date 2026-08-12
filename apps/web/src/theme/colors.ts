/**
 * ML Playground — Blueberry & Maroon Design System
 * Color Tokens: semantic constants mapped from the brand palette.
 *
 * Brand direction: Sophisticated · Confident · Quietly Powerful
 * Reference: Closer to a private bank than a dev-tool dashboard.
 */

export const colors = {
  // ── Raw Palette ───────────────────────────────────────────────
  palette: {
    // Blueberry (primary brand)
    blueberry: {
      900: '#0D0A1E',   // deepest
      800: '#1B1530',   // surface
      700: '#2A2247',   // elevated
      600: '#3D3570',
      500: '#4B3B7C',   // primary
      400: '#6C5CA6',   // primary-light
      300: '#8A7DC0',
      200: 'rgba(107,92,166,0.35)', // ring
      100: 'rgba(107,92,166,0.18)', // border
      50:  'rgba(107,92,166,0.08)', // faint bg
    },
    // Maroon (CTA / active indicator)
    maroon: {
      900: '#3A0A12',
      800: '#5A1020',
      700: '#6E1423',   // maroon base
      600: '#8E2A3C',   // maroon hover
      500: '#B23A4E',   // error/lighter
      border: 'rgba(110,20,35,0.40)',
      faint:  'rgba(110,20,35,0.15)',
    },
    // Gold (success / best-value highlight)
    gold: {
      500: '#C9A24B',
      faint: 'rgba(201,162,75,0.12)',
    },
    // Text
    text: {
      primary:     '#F5F1EC',
      secondary:   '#9E93B8',
      placeholder: '#5E5480',
      disabled:    '#3D3558',
    },
    // Amber (warning — kept warm)
    amber: {
      500: '#D4882E',
      faint: 'rgba(212,136,46,0.12)',
    },
  },

  // ── Semantic Tokens ───────────────────────────────────────────
  tokens: {
    // Single mode — always dark (BB palette has no light variant)
    dark: {
      background:          '#0B0912',
      foreground:          '#F5F1EC',
      card:                '#1B1530',
      cardForeground:      '#F5F1EC',
      popover:             '#211C3C',
      popoverForeground:   '#F5F1EC',
      primary:             '#6E1423',   // maroon CTA
      primaryForeground:   '#F5F1EC',
      secondary:           '#2A2247',
      secondaryForeground: '#9E93B8',
      muted:               '#2A2247',
      mutedForeground:     '#9E93B8',
      accent:              '#4B3B7C',   // blueberry accent
      accentForeground:    '#F5F1EC',
      destructive:         '#B23A4E',
      destructiveForeground: '#F5F1EC',
      border:              'rgba(107,92,166,0.18)',
      input:               '#1B1530',
      ring:                'rgba(107,92,166,0.35)',
    },

    // Light mode — mapped to BB equivalents (softer but still warm)
    light: {
      background:          '#F7F4F0',
      foreground:          '#1A1530',
      card:                '#FFFFFF',
      cardForeground:      '#1A1530',
      popover:             '#FFFFFF',
      popoverForeground:   '#1A1530',
      primary:             '#6E1423',
      primaryForeground:   '#FFFFFF',
      secondary:           '#F0EBF8',
      secondaryForeground: '#4B3B7C',
      muted:               '#F0EBF8',
      mutedForeground:     '#6C5CA6',
      accent:              '#4B3B7C',
      accentForeground:    '#FFFFFF',
      destructive:         '#B23A4E',
      destructiveForeground: '#FFFFFF',
      border:              'rgba(107,92,166,0.22)',
      input:               'rgba(107,92,166,0.10)',
      ring:                'rgba(107,92,166,0.40)',
    },
  },
} as const

export type ColorToken = keyof typeof colors.tokens.dark
