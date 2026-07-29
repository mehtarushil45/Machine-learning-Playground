import { cn } from '../../utils/cn'
import { Icon, type IconName } from './Icon'

export interface ToastProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'info' | 'success' | 'warning' | 'error'
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
  const icons: Record<NonNullable<ToastProps['variant']>, IconName> = {
    info: 'info',
    success: 'check',
    warning: 'alert-circle',
    error: 'x',
  }

  const borderVariants = {
    info: 'border-blue-500/30 bg-blue-500/5 text-foreground',
    success: 'border-emerald-500/30 bg-emerald-500/5 text-foreground',
    warning: 'border-amber-500/30 bg-amber-500/5 text-foreground',
    error: 'border-destructive/30 bg-destructive/5 text-foreground',
  }

  const iconColors = {
    info: 'text-blue-500',
    success: 'text-emerald-500',
    warning: 'text-amber-500',
    error: 'text-destructive',
  }

  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-3 p-4 rounded-xl border shadow-md backdrop-blur-md transition-all duration-200',
        borderVariants[variant],
        className,
      )}
      {...props}
    >
      <div className={cn('mt-0.5 shrink-0', iconColors[variant])}>
        <Icon name={icons[variant]} size={18} />
      </div>

      <div className="flex-1 space-y-0.5">
        {title && <h5 className="text-sm font-semibold leading-none">{title}</h5>}
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
        {children}
      </div>

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md cursor-pointer"
          aria-label="Close notification"
        >
          <Icon name="x" size={14} />
        </button>
      )}
    </div>
  )
}
