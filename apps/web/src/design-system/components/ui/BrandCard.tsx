/**
 * BrandCard — Surface card with hairline border and asymmetric corners.
 * Elevation via background lightening, not shadow.
 */
import type { HTMLAttributes, ReactNode } from 'react'
import { colors } from '../../tokens'

type Elevation = 'flat' | 'raised' | 'danger'

interface BrandCardProps extends HTMLAttributes<HTMLDivElement> {
  elevation?: Elevation
  noPadding?: boolean
  children: ReactNode
  as?: 'div' | 'article' | 'section'
}

const BG: Record<Elevation, string> = {
  flat:   colors.surface,
  raised: colors.elevated,
  danger: colors.surface,
}

const BORDER: Record<Elevation, string> = {
  flat:   `1px solid ${colors.border}`,
  raised: `1px solid rgba(107,92,166,0.28)`,
  danger: `1px solid ${colors.maroonBorder}`,
}

export function BrandCard({
  elevation = 'flat',
  noPadding = false,
  children,
  className = '',
  as: Tag = 'div',
  style,
  ...rest
}: BrandCardProps) {
  return (
    <Tag
      style={{
        background:   BG[elevation],
        border:       BORDER[elevation],
        borderRadius: '12px 12px 0px 12px',  /* asymmetric card */
        padding:      noPadding ? undefined : '1.5rem',
        ...style,
      }}
      className={`overflow-hidden ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  )
}

/** Lightweight section header pattern inside a card */
export function CardLabel({ children }: { children: ReactNode }) {
  return (
    <p
      className="text-[10px] font-semibold uppercase tracking-[0.12em] mb-3"
      style={{ color: colors.muted, fontFamily: 'var(--font-ui)' }}
    >
      {children}
    </p>
  )
}

/** Hero numeric value in display serif */
export function CardMetric({
  value,
  label,
  accent = false,
}: {
  value: string | number
  label: string
  accent?: boolean
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className="text-4xl font-semibold tabular-nums leading-none"
        style={{
          fontFamily: 'var(--font-display)',
          color: accent ? colors.gold : colors.text,
        }}
      >
        {value}
      </span>
      <span className="text-xs" style={{ color: colors.muted, fontFamily: 'var(--font-ui)' }}>
        {label}
      </span>
    </div>
  )
}
