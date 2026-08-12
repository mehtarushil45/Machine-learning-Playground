/**
 * Design Token Constants — Blueberry & Maroon
 * Single source of truth for all inline style values and class fragments.
 */

export const colors = {
  base:          '#0B0912',
  surface:       '#1B1530',
  elevated:      '#2A2247',
  overlay:       '#211C3C',
  primary:       '#4B3B7C',
  light:         '#6C5CA6',
  faint:         'rgba(107,92,166,0.12)',
  border:        'rgba(107,92,166,0.18)',
  ring:          'rgba(107,92,166,0.35)',
  maroon:        '#6E1423',
  maroonHover:   '#8E2A3C',
  maroonFaint:   'rgba(110,20,35,0.15)',
  maroonBorder:  'rgba(110,20,35,0.40)',
  gold:          '#C9A24B',
  goldFaint:     'rgba(201,162,75,0.12)',
  error:         '#B23A4E',
  errorFaint:    'rgba(178,58,78,0.12)',
  text:          '#F5F1EC',
  muted:         '#9E93B8',
  placeholder:   '#5E5480',
  disabled:      '#3D3558',
  tableZebra:    'rgba(75,59,124,0.07)',
  tableHeader:   '#2A2247',
} as const

export const fonts = {
  display: "'Fraunces', 'Georgia', serif",
  ui:      "'Space Grotesk', 'Inter', sans-serif",
  mono:    "'JetBrains Mono', 'Fira Code', monospace",
} as const

export const radius = {
  sharp:  '0px',
  sm:     '4px',
  md:     '8px',
  lg:     '12px',
  xl:     '16px',
  full:   '9999px',
  brand:  '8px 8px 0px 8px',
  card:   '12px 12px 0px 12px',
} as const

/** Status badge configurations */
export const statusConfig = {
  complete: {
    dot:  colors.gold,
    bg:   colors.goldFaint,
    text: colors.gold,
    label: 'Complete',
  },
  running: {
    dot:  colors.light,
    bg:   colors.faint,
    text: colors.light,
    label: 'Running',
  },
  failed: {
    dot:  colors.error,
    bg:   colors.errorFaint,
    text: colors.error,
    label: 'Failed',
  },
  pending: {
    dot:  '#4A4260',
    bg:   'rgba(74,66,96,0.20)',
    text: colors.muted,
    label: 'Pending',
  },
  production: {
    dot:  colors.gold,
    bg:   colors.goldFaint,
    text: colors.gold,
    label: 'Production',
  },
  staging: {
    dot:  colors.light,
    bg:   colors.faint,
    text: colors.light,
    label: 'Staging',
  },
  archived: {
    dot:  '#3D3558',
    bg:   'rgba(61,53,88,0.20)',
    text: colors.disabled,
    label: 'Archived',
  },
} as const

export type StatusKey = keyof typeof statusConfig

/** Nav item type for Sidebar */
export interface NavItem {
  id: string
  label: string
  icon: string
  group: string
  badge?: number
}
