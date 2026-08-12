/**
 * StatusBadge — dot indicator + soft-tinted pill.
 * Never solid saturated fill — always a faint background + colored dot + text.
 */
import { statusConfig, type StatusKey } from '../../tokens'

interface StatusBadgeProps {
  status: StatusKey
  pulse?: boolean  /* animate dot for 'running' states */
  className?: string
}

export function StatusBadge({ status, pulse = false, className = '' }: StatusBadgeProps) {
  const cfg = statusConfig[status]
  const shouldPulse = pulse && status === 'running'

  return (
    <span
      style={{
        display:        'inline-flex',
        alignItems:     'center',
        gap:            '5px',
        padding:        '2px 8px',
        borderRadius:   '9999px',
        background:     cfg.bg,
        fontFamily:     'var(--font-ui)',
        fontSize:       '10px',
        fontWeight:     600,
        letterSpacing:  '0.08em',
        textTransform:  'uppercase',
        color:          cfg.text,
        whiteSpace:     'nowrap',
      }}
      className={className}
    >
      <span
        style={{
          width:        6,
          height:       6,
          borderRadius: '50%',
          background:   cfg.dot,
          display:      'inline-block',
          flexShrink:   0,
        }}
        className={shouldPulse ? 'bb-pulse' : ''}
      />
      {cfg.label}
    </span>
  )
}

/** Inline colored dot only — for table cells */
export function StatusDot({ status, pulse }: { status: StatusKey; pulse?: boolean }) {
  const cfg = statusConfig[status]
  return (
    <span
      style={{ width: 7, height: 7, borderRadius: '50%', background: cfg.dot, display: 'inline-block', flexShrink: 0 }}
      className={pulse && status === 'running' ? 'bb-pulse' : ''}
    />
  )
}

/** Data type chip — for column profiling cards */
type DataType = 'numeric' | 'categorical' | 'datetime' | 'text' | 'boolean' | 'identifier'

const dataTypeColors: Record<DataType, { bg: string; text: string }> = {
  numeric:     { bg: 'rgba(107,92,166,0.18)', text: '#9E93B8' },
  categorical: { bg: 'rgba(107,92,166,0.12)', text: '#6C5CA6' },
  datetime:    { bg: 'rgba(201,162,75,0.14)', text: '#C9A24B' },
  text:        { bg: 'rgba(75,59,124,0.10)',  text: '#9E93B8' },
  boolean:     { bg: 'rgba(201,162,75,0.10)', text: '#C9A24B' },
  identifier:  { bg: 'rgba(110,20,35,0.12)',  text: '#8E2A3C' },
}

export function DataTypeBadge({ type }: { type: DataType }) {
  const { bg, text } = dataTypeColors[type] ?? dataTypeColors.text
  return (
    <span style={{
      background: bg, color: text,
      fontSize: '10px', fontWeight: 600,
      padding: '1px 7px', borderRadius: '9999px',
      fontFamily: 'var(--font-ui)', letterSpacing: '0.06em',
      textTransform: 'uppercase',
    }}>
      {type}
    </span>
  )
}
