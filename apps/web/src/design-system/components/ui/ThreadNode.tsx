/**
 * ThreadNode — Brand Signature Visual Motif
 * Renders the hand-drawn-feeling "thread and node" SVG illustration.
 * Used in: landing hero (very low opacity), empty states, error states, login panel.
 */
import type { CSSProperties } from 'react'

export type ThreadNodeVariant = 'hero' | 'empty' | 'error' | 'ghost' | 'progress'

interface Props {
  variant?: ThreadNodeVariant
  className?: string
  animated?: boolean
  /** override inline styles on the wrapping svg */
  style?: CSSProperties
}

const CONFIGS: Record<
  ThreadNodeVariant,
  { nodes: { cx: number; cy: number; r: number; fill: string }[]; edges: [number, number][]; opacity: number }
> = {
  hero: {
    opacity: 0.13,
    nodes: [
      { cx: 80,  cy: 60,  r: 5, fill: '#6C5CA6' },
      { cx: 220, cy: 110, r: 4, fill: '#4B3B7C' },
      { cx: 380, cy: 50,  r: 6, fill: '#6C5CA6' },
      { cx: 500, cy: 140, r: 4, fill: '#6E1423' },
      { cx: 640, cy: 70,  r: 5, fill: '#4B3B7C' },
      { cx: 760, cy: 160, r: 4, fill: '#6C5CA6' },
      { cx: 160, cy: 200, r: 3, fill: '#6E1423' },
      { cx: 320, cy: 180, r: 5, fill: '#4B3B7C' },
      { cx: 460, cy: 210, r: 3, fill: '#6C5CA6' },
      { cx: 580, cy: 190, r: 4, fill: '#4B3B7C' },
    ],
    edges: [[0,1],[1,2],[2,3],[3,4],[4,5],[1,6],[6,7],[7,8],[8,9],[2,7],[3,8]],
  },
  empty: {
    opacity: 0.50,
    nodes: [
      { cx: 100, cy: 80,  r: 6, fill: '#6C5CA6' },
      { cx: 210, cy: 50,  r: 5, fill: '#4B3B7C' },
      { cx: 160, cy: 160, r: 7, fill: '#6C5CA6' },
      { cx: 270, cy: 130, r: 5, fill: '#6E1423' },
      { cx: 70,  cy: 200, r: 4, fill: '#4B3B7C' },
    ],
    edges: [],  /* unconnected — waiting to link */
  },
  error: {
    opacity: 0.55,
    nodes: [
      { cx: 80,  cy: 80,  r: 6, fill: '#6C5CA6' },
      { cx: 170, cy: 60,  r: 5, fill: '#4B3B7C' },
      { cx: 260, cy: 100, r: 7, fill: '#B23A4E' }, /* broken node */
      { cx: 180, cy: 170, r: 5, fill: '#6C5CA6' },
      { cx: 90,  cy: 155, r: 4, fill: '#4B3B7C' },
    ],
    /* broken connections — edge 1→2 has a visual break via two segments with a gap */
    edges: [[0,4],[4,3],[3,1]],
  },
  ghost: {
    opacity: 0.22,
    nodes: [
      { cx: 80,  cy: 80,  r: 5, fill: '#4B3B7C' },
      { cx: 180, cy: 60,  r: 4, fill: '#3D3558' },
      { cx: 140, cy: 160, r: 6, fill: '#3D3558' },
      { cx: 250, cy: 130, r: 4, fill: '#4B3B7C' },
      { cx: 70,  cy: 190, r: 3, fill: '#3D3558' },
    ],
    edges: [[0,1],[1,3],[3,2],[2,4]],
  },
  progress: {
    opacity: 1,
    nodes: [
      { cx: 0,   cy: 12, r: 7, fill: '#C9A24B' },
      { cx: 120, cy: 12, r: 7, fill: '#C9A24B' },
      { cx: 240, cy: 12, r: 8, fill: '#6C5CA6' },
      { cx: 360, cy: 12, r: 6, fill: '#3D3558' },
      { cx: 480, cy: 12, r: 6, fill: '#3D3558' },
    ],
    edges: [[0,1],[1,2],[2,3],[3,4]],
  },
}

export function ThreadNode({ variant = 'empty', className = '', animated = false, style }: Props) {
  const cfg = CONFIGS[variant]

  /* Build edge paths */
  const edgePaths = cfg.edges.map(([a, b], i) => {
    const na = cfg.nodes[a]
    const nb = cfg.nodes[b]
    return (
      <line
        key={i}
        x1={na.cx} y1={na.cy}
        x2={nb.cx} y2={nb.cy}
        stroke="url(#bbGrad)"
        strokeWidth={variant === 'progress' ? 2 : 1}
        strokeLinecap="round"
        className={animated ? 'bb-weave' : ''}
        style={animated ? { animationDelay: `${i * 0.15}s` } : undefined}
      />
    )
  })

  /* For error variant: draw broken edge (node 1 → 2) with gap */
  const brokenEdge = variant === 'error' ? (
    <>
      <line x1={170} y1={60} x2={210} y2={80} stroke="url(#bbGrad)" strokeWidth={1} strokeLinecap="round" />
      {/* gap 210→240 intentionally missing */}
      <line x1={240} y1={90} x2={260} y2={100} stroke="#B23A4E" strokeWidth={1} strokeLinecap="round" strokeDasharray="4 4" />
    </>
  ) : null

  const viewBoxMap: Record<ThreadNodeVariant, string> = {
    hero:     '0 0 840 240',
    empty:    '0 0 340 250',
    error:    '0 0 340 220',
    ghost:    '0 0 300 240',
    progress: '0 0 480 24',
  }

  return (
    <svg
      viewBox={viewBoxMap[variant]}
      xmlns="http://www.w3.org/2000/svg"
      style={{ opacity: cfg.opacity, ...style }}
      className={`overflow-visible ${className}`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="bbGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#4B3B7C" />
          <stop offset="100%" stopColor="#6E1423" />
        </linearGradient>
      </defs>

      {edgePaths}
      {brokenEdge}

      {cfg.nodes.map((n, i) => (
        <circle
          key={i}
          cx={n.cx} cy={n.cy} r={n.r}
          fill={n.fill}
          style={variant === 'progress' && i < 2
            ? { filter: 'drop-shadow(0 0 4px #C9A24B66)' }
            : variant === 'progress' && i === 2
            ? { filter: 'drop-shadow(0 0 6px #6C5CA6AA)' }
            : undefined}
        />
      ))}

      {/* Active progress node ring */}
      {variant === 'progress' && (
        <circle cx={240} cy={12} r={13} fill="none" stroke="#6C5CA6" strokeWidth={1.5} strokeOpacity={0.4} />
      )}
    </svg>
  )
}
