import React from 'react'
import { cn } from '../../utils/cn'

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'circular' | 'rectangular'
}

export function Skeleton({
  className,
  variant = 'rectangular',
  ...props
}: SkeletonProps) {
  const variants = {
    text:        'h-4 w-full rounded-md',
    circular:    'rounded-full',
    rectangular: 'rounded-tl-lg rounded-tr-lg rounded-bl-lg rounded-br-none', // asymmetric
  }

  return (
    <div
      className={cn(
        'animate-pulse bg-[#2A2247] border border-[rgba(107,92,166,0.10)]',
        variants[variant],
        className,
      )}
      {...props}
    />
  )
}

/**
 * Skeleton Card preset — Blueberry & Maroon
 */
export function CardSkeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`p-6 space-y-4 animate-pulse ${className}`}
      style={{
        background: '#1B1530',
        border: '1px solid rgba(107,92,166,0.15)',
        borderRadius: '12px 12px 0 12px',
      }}
    >
      <div className="flex items-center gap-3">
        <Skeleton variant="circular" className="w-10 h-10 shrink-0 bg-[rgba(107,92,166,0.12)]" />
        <div className="flex-1 space-y-2">
          <Skeleton variant="text" className="h-4 w-2/3 bg-[#2A2247]" />
          <Skeleton variant="text" className="h-3 w-1/3 bg-[#2A2247]" />
        </div>
      </div>
      <Skeleton variant="rectangular" className="h-20 w-full bg-[#2A2247]" />
      <div className="flex items-center justify-between pt-2">
        <Skeleton variant="text" className="h-3 w-1/4 bg-[#2A2247]" />
        <Skeleton variant="rectangular" className="h-6 w-16 bg-[rgba(107,92,166,0.12)]" />
      </div>
    </div>
  )
}

/**
 * Skeleton Table preset — Blueberry & Maroon
 */
export function TableSkeleton({ rows = 4, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div
      className="overflow-hidden divide-y divide-[rgba(107,92,166,0.08)] animate-pulse"
      style={{
        background: '#1B1530',
        border: '1px solid rgba(107,92,166,0.15)',
        borderRadius: '10px 10px 0 10px',
      }}
    >
      {/* Header */}
      <div
        className="p-4 grid gap-4"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, background: '#0B0912' }}
      >
        {Array.from({ length: cols }).map((_, c) => (
          <Skeleton key={c} variant="text" className="h-3 bg-[#2A2247]" />
        ))}
      </div>

      {/* Rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="p-4 grid gap-4 items-center"
          style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
        >
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} variant="text" className="h-4 bg-[#2A2247]" />
          ))}
        </div>
      ))}
    </div>
  )
}
