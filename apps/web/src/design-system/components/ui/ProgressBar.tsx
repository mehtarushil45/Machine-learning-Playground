/**
 * ProgressBar — thin blueberry track, blueberry→gold gradient fill.
 * Used for: training job progress, column completeness, resource usage.
 */
interface ProgressBarProps {
  value: number          /* 0–100 */
  height?: number        /* px, default 3 */
  showLabel?: boolean
  labelPosition?: 'right' | 'below'
  colorOverride?: 'gold' | 'error'
  animated?: boolean
  className?: string
}

export function ProgressBar({
  value,
  height = 3,
  showLabel = false,
  labelPosition = 'right',
  colorOverride,
  animated = true,
  className = '',
}: ProgressBarProps) {
  const clamp = Math.min(100, Math.max(0, value))

  const fillGradient = colorOverride === 'error'
    ? '#B23A4E'
    : colorOverride === 'gold'
    ? '#C9A24B'
    : 'linear-gradient(90deg, #4B3B7C, #C9A24B)'

  const isSolid = colorOverride === 'error' || colorOverride === 'gold'

  return (
    <div className={`flex flex-col gap-1 w-full ${className}`}>
      {showLabel && labelPosition === 'right' && (
        <div className="flex items-center justify-between mb-1">
          <span style={{ fontSize: '10px', color: '#9E93B8', fontFamily: 'var(--font-ui)' }}>
            Progress
          </span>
          <span style={{ fontSize: '11px', color: '#F5F1EC', fontFamily: 'var(--font-ui)', fontWeight: 600 }}>
            {clamp}%
          </span>
        </div>
      )}

      <div
        style={{
          height,
          width: '100%',
          background: 'rgba(75,59,124,0.20)',
          borderRadius: 9999,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width:  `${clamp}%`,
            background: isSolid ? fillGradient : fillGradient,
            borderRadius: 9999,
            transition: animated ? 'width 600ms cubic-bezier(0.4,0,0.2,1)' : undefined,
          }}
        />
      </div>

      {showLabel && labelPosition === 'below' && (
        <span style={{ fontSize: '10px', color: '#9E93B8', fontFamily: 'var(--font-ui)' }}>
          {clamp}% complete
        </span>
      )}
    </div>
  )
}

/** Circular progress ring for job monitoring */
interface CircleProgressProps {
  value: number  /* 0–100 */
  size?: number  /* px, default 160 */
  strokeWidth?: number
}

export function CircleProgress({ value, size = 160, strokeWidth = 8 }: CircleProgressProps) {
  const r = (size - strokeWidth * 2) / 2
  const circ = 2 * Math.PI * r
  const clamp = Math.min(100, Math.max(0, value))
  const offset = circ * (1 - clamp / 100)
  const cx = size / 2
  const cy = size / 2

  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <defs>
        <linearGradient id="circGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#4B3B7C" />
          <stop offset="60%"  stopColor="#6E1423" />
          <stop offset="100%" stopColor="#C9A24B" />
        </linearGradient>
      </defs>
      {/* Track */}
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke="rgba(75,59,124,0.20)"
        strokeWidth={strokeWidth}
      />
      {/* Fill */}
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke="url(#circGrad)"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        style={{ transition: 'stroke-dashoffset 800ms cubic-bezier(0.4,0,0.2,1)', filter: 'drop-shadow(0 0 6px rgba(201,162,75,0.35))' }}
      />
    </svg>
  )
}
