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
 * EmptyState Component for ML Dashboard features.
 * Displays a styled empty state illustration matching the dark cyberpunk theme when list/table results are empty.
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
      className={`p-8 md:p-12 rounded-2xl border border-[rgba(0,212,255,0.15)] bg-[#0C1A30]/80 backdrop-blur-xl text-center flex flex-col items-center justify-center relative overflow-hidden animate-in fade-in zoom-in-95 duration-200 ${className}`}
    >
      {/* Background Ambient Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 rounded-full bg-[#00D4FF]/5 blur-3xl pointer-events-none" />

      {/* Cyberpunk Icon Badge Container */}
      <div className="w-14 h-14 rounded-2xl bg-[#081224] border border-[#00D4FF]/30 flex items-center justify-center text-[#00D4FF] mb-4 shadow-[0_0_20px_rgba(0,212,255,0.15)] relative">
        <IconComponent className="w-7 h-7" />
        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#00F5A0] shadow-[0_0_8px_#00F5A0]" />
      </div>

      {/* Title & Description */}
      <h4 className="text-sm md:text-base font-bold text-slate-100 mb-1 tracking-tight">{title}</h4>
      {description && (
        <p className="text-xs text-[#94A3B8] max-w-md leading-relaxed mb-6">{description}</p>
      )}

      {/* Action Buttons */}
      {(actionLabel || secondaryActionLabel) && (
        <div className="flex items-center gap-3">
          {secondaryActionLabel && onSecondaryAction && (
            <button
              onClick={onSecondaryAction}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-[#94A3B8] hover:text-slate-100 hover:bg-white/5 border border-transparent transition-all cursor-pointer"
            >
              {secondaryActionLabel}
            </button>
          )}

          {actionLabel && onAction && (
            <button
              onClick={onAction}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-[#070E1C] bg-[#00D4FF] hover:bg-[#38E0FF] shadow-[0_0_15px_rgba(0,212,255,0.3)] transition-all cursor-pointer flex items-center gap-2"
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
