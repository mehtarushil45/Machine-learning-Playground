import React from 'react'
import {
  CheckCircle2,
  AlertOctagon,
  Info,
  AlertTriangle,
  X,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '../../utils/cn'

export type ToastVariant = 'success' | 'error' | 'info' | 'warning'

export interface ToastVariantConfig {
  icon: LucideIcon
  iconColor: string
  borderColor: string
  bgColor: string
  glowColor: string
}

/**
 * Configuration Map Pattern for Toast Notifications.
 * Centralizes icon selection, color tokens, border styles, background filters, and glow effects per variant.
 */
export const TOAST_VARIANT_CONFIGS: Record<ToastVariant, ToastVariantConfig> = {
  success: {
    icon: CheckCircle2,
    iconColor: 'text-[#00F5A0]',
    borderColor: 'border-[#00F5A0]/40',
    bgColor: 'bg-[#0C1A30]/95',
    glowColor: 'shadow-[0_0_15px_rgba(0,245,160,0.15)]',
  },
  error: {
    icon: AlertOctagon,
    iconColor: 'text-[#FF4D4D]',
    borderColor: 'border-[#FF4D4D]/40',
    bgColor: 'bg-[#1C0B12]/95',
    glowColor: 'shadow-[0_0_15px_rgba(255,77,77,0.15)]',
  },
  info: {
    icon: Info,
    iconColor: 'text-[#00D4FF]',
    borderColor: 'border-[#00D4FF]/40',
    bgColor: 'bg-[#0A192F]/95',
    glowColor: 'shadow-[0_0_15px_rgba(0,212,255,0.15)]',
  },
  warning: {
    icon: AlertTriangle,
    iconColor: 'text-amber-400',
    borderColor: 'border-amber-400/40',
    bgColor: 'bg-[#1D170B]/95',
    glowColor: 'shadow-[0_0_15px_rgba(251,191,36,0.15)]',
  },
}

export interface ToastProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: ToastVariant
  title?: string
  description?: string
  onClose?: () => void
}

export function Toast({
  className,
  variant = 'info',
  title,
  description,
  onClose,
  children,
  ...props
}: ToastProps) {
  const config = TOAST_VARIANT_CONFIGS[variant] || TOAST_VARIANT_CONFIGS.info
  const IconComponent = config.icon

  return (
    <div
      role="alert"
      className={cn(
        'pointer-events-auto flex items-start gap-3 p-4 rounded-xl border text-white shadow-2xl backdrop-blur-xl transition-all duration-200 animate-in slide-in-from-bottom-5',
        config.borderColor,
        config.bgColor,
        config.glowColor,
        className,
      )}
      {...props}
    >
      <div className={cn('mt-0.5 shrink-0', config.iconColor)}>
        <IconComponent className="w-5 h-5" />
      </div>

      <div className="flex-1 min-w-0 space-y-0.5">
        {title && <h5 className="text-xs font-bold text-slate-100">{title}</h5>}
        {description && (
          <p className="text-[11px] text-[#94A3B8] leading-relaxed">{description}</p>
        )}
        {children}
      </div>

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="text-[#64748B] hover:text-slate-200 transition-colors p-0.5 rounded-md cursor-pointer"
          aria-label="Close notification"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
