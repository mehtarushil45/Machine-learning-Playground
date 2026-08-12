import { Inbox, type LucideIcon } from 'lucide-react'

export interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  actionIcon?: LucideIcon
  secondaryActionLabel?: string
  onSecondaryAction?: () => void
  className?: string
}

/**
 * EmptyState — Blueberry & Maroon brand.
 * Uses a thread-node–style icon container (blueberry border, asymmetric corners).
 * Left maroon border signals "empty" without cyan glows.
 */
export function EmptyState({
  icon: IconComponent = Inbox,
  title,
  description,
  actionLabel,
  onAction,
  actionIcon: ActionIcon,
  secondaryActionLabel,
  onSecondaryAction,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`p-8 md:p-12 text-center flex flex-col items-center justify-center relative overflow-hidden animate-in fade-in zoom-in-95 duration-200 ${className}`}
      style={{
        background: '#1B1530',
        border: '1px solid rgba(107,92,166,0.20)',
        borderLeft: '3px solid rgba(107,92,166,0.40)',
        borderRadius: '12px 12px 0 12px',  // asymmetric
      }}
    >
      {/* Subtle ambient orb — blueberry, very faint */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 rounded-full pointer-events-none"
        style={{ background: 'rgba(107,92,166,0.05)', filter: 'blur(40px)' }}
      />

      {/* Icon container — blueberry node shape */}
      <div
        className="w-14 h-14 flex items-center justify-center mb-5 relative"
        style={{
          background: 'rgba(27,21,48,1)',
          border: '1px solid rgba(107,92,166,0.30)',
          borderRadius: '10px 10px 0 10px',  // asymmetric icon container
          color: '#6C5CA6',
        }}
      >
        <IconComponent className="w-7 h-7" />
        {/* Connection node dot */}
        <span
          className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full"
          style={{ background: '#4B3B7C', boxShadow: '0 0 0 2px #0B0912' }}
        />
      </div>

      {/* Title */}
      <h4
        className="text-sm md:text-base font-semibold text-[#F5F1EC] mb-2 tracking-tight"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        {title}
      </h4>

      {/* Description */}
      {description && (
        <p className="text-xs text-[#9E93B8] max-w-md leading-relaxed mb-6">
          {description}
        </p>
      )}

      {/* Action Buttons */}
      {(actionLabel || secondaryActionLabel) && (
        <div className="flex items-center gap-3">
          {secondaryActionLabel && onSecondaryAction && (
            <button
              onClick={onSecondaryAction}
              className="px-4 py-2 text-xs font-medium text-[#9E93B8] hover:text-[#F5F1EC] transition-colors cursor-pointer"
              style={{
                background: 'transparent',
                border: '1px solid rgba(107,92,166,0.20)',
                borderRadius: '6px 6px 0 6px',
              }}
            >
              {secondaryActionLabel}
            </button>
          )}

          {actionLabel && onAction && (
            <button
              onClick={onAction}
              className="px-4 py-2 text-xs font-semibold text-[#F5F1EC] flex items-center gap-2 cursor-pointer transition-all hover:-translate-y-px"
              style={{
                background: '#6E1423',
                border: 'none',
                borderRadius: '6px 6px 0 6px',
              }}
            >
              {ActionIcon && <ActionIcon className="w-3.5 h-3.5" />}
              <span>{actionLabel}</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
