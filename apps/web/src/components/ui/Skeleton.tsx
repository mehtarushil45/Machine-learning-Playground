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
    text: 'h-4 w-full rounded-md',
    circular: 'rounded-full',
    rectangular: 'rounded-lg',
  }

  return (
    <div
      className={cn(
        'animate-pulse bg-[#101E36]/80 border border-[rgba(0,212,255,0.08)]',
        variants[variant],
        className,
      )}
      {...props}
    />
  )
}

/**
 * Skeleton Loader Card Preset for ML Dashboard Cards.
 */
export function CardSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`p-6 rounded-2xl border border-[rgba(0,212,255,0.1)] bg-[#0C1A30]/60 space-y-4 animate-pulse ${className}`}>
      <div className="flex items-center gap-3">
        <Skeleton variant="circular" className="w-10 h-10 shrink-0 bg-[#00D4FF]/10" />
        <div className="flex-1 space-y-2">
          <Skeleton variant="text" className="h-4 w-2/3 bg-[#101E36]" />
          <Skeleton variant="text" className="h-3 w-1/3 bg-[#101E36]" />
        </div>
      </div>
      <Skeleton variant="rectangular" className="h-20 w-full bg-[#101E36]" />
      <div className="flex items-center justify-between pt-2">
        <Skeleton variant="text" className="h-3 w-1/4 bg-[#101E36]" />
        <Skeleton variant="rectangular" className="h-6 w-16 bg-[#00D4FF]/10" />
      </div>
    </div>
  )
}

/**
 * Skeleton Loader Table Preset for ML Data Tables.
 */
export function TableSkeleton({ rows = 4, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="rounded-xl border border-[rgba(0,212,255,0.1)] bg-[#0C1A30]/60 overflow-hidden divide-y divide-white/5 animate-pulse">
      {/* Header */}
      <div className="p-4 bg-[#081224] grid grid-cols-4 gap-4">
        {Array.from({ length: cols }).map((_, c) => (
          <Skeleton key={c} variant="text" className="h-3 bg-[#101E36]" />
        ))}
      </div>

      {/* Rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="p-4 grid grid-cols-4 gap-4 items-center">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} variant="text" className="h-4 bg-[#101E36]" />
          ))}
        </div>
      ))}
    </div>
  )
}
