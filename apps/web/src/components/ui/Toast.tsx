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
  accentBorder: string  // left-border color (brand motif)
}

/**
 * Blueberry & Maroon Toast Notifications.
 * Each variant has a colored 3px left border as the visual accent — no neon glows.
 */
export const TOAST_VARIANT_CONFIGS: Record<ToastVariant, ToastVariantConfig> = {
  success: {
    icon: CheckCircle2,
    iconColor: 'text-[#C9A24B]',           // gold
    borderColor: 'border-[rgba(107,92,166,0.25)]',
    bgColor: 'bg-[#1B1530]/95',
    accentBorder: 'border-l-[#C9A24B]',    // gold left accent
  },
  error: {
    icon: AlertOctagon,
    iconColor: 'text-[#B23A4E]',           // error red
    borderColor: 'border-[rgba(110,20,35,0.35)]',
    bgColor: 'bg-[#1B1530]/95',
    accentBorder: 'border-l-[#6E1423]',    // maroon left accent
  },
  info: {
    icon: Info,
    iconColor: 'text-[#6C5CA6]',           // blueberry
    borderColor: 'border-[rgba(107,92,166,0.25)]',
    bgColor: 'bg-[#1B1530]/95',
    accentBorder: 'border-l-[#4B3B7C]',   // blueberry left accent
  },
  warning: {
    icon: AlertTriangle,
    iconColor: 'text-amber-400',
    borderColor: 'border-[rgba(107,92,166,0.20)]',
    bgColor: 'bg-[#1B1530]/95',
    accentBorder: 'border-l-amber-500',
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
        // Base: rounded asymmetric corners, 3px left colored border
        'pointer-events-auto flex items-start gap-3 p-4 text-[#F5F1EC] shadow-2xl backdrop-blur-xl transition-all duration-200 animate-in slide-in-from-bottom-5',
        'rounded-tl-xl rounded-tr-xl rounded-bl-xl rounded-br-none',
        'border border-l-[3px]',
        config.borderColor,
        config.bgColor,
        config.accentBorder,
        className,
      )}
      {...props}
    >
      <div className={cn('mt-0.5 shrink-0', config.iconColor)}>
        <IconComponent className="w-5 h-5" />
      </div>

      <div className="flex-1 min-w-0 space-y-0.5">
        {title && (
          <h5
            className="text-xs font-bold text-[#F5F1EC]"
            style={{ fontFamily: 'var(--font-ui)' }}
          >
            {title}
          </h5>
        )}
        {description && (
          <p className="text-[11px] text-[#9E93B8] leading-relaxed">{description}</p>
        )}
        {children}
      </div>

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="text-[#5E5480] hover:text-[#F5F1EC] transition-colors p-0.5 cursor-pointer"
          aria-label="Close notification"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
