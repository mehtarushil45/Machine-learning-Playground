import { cn } from '../../utils/cn'
import { Icon, type IconName } from './Icon'

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'destructive' | 'outline'
  size?: 'sm' | 'md'
  icon?: IconName
}

export function Badge({
  className,
  variant = 'default',
  size = 'md',
  icon,
  children,
  ...props
}: BadgeProps) {
  const baseStyles =
    'inline-flex items-center font-medium rounded-full transition-colors select-none'

  const variants = {
    default: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
    primary:
      'bg-primary/15 text-primary border border-primary/20 hover:bg-primary/25',
    success:
      'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20',
    warning:
      'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20',
    destructive:
      'bg-destructive/15 text-destructive border border-destructive/20',
    outline: 'border border-border text-foreground hover:bg-secondary/50',
  }

  const sizes = {
    sm: 'px-2 py-0.5 text-[10px] gap-1',
    md: 'px-2.5 py-0.5 text-xs gap-1.5',
  }

  return (
    <div
      className={cn(baseStyles, variants[variant], sizes[size], className)}
      {...props}
    >
      {icon ? <Icon name={icon} size={size === 'sm' ? 10 : 12} /> : null}
      {children}
    </div>
  )
}
