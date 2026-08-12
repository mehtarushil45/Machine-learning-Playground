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
    'inline-flex items-center font-semibold rounded-full transition-colors select-none tracking-wide uppercase'

  const variants = {
    // Muted blueberry pill — default label
    default:
      'bg-[rgba(61,53,88,0.30)] text-[#9E93B8] border border-[rgba(61,53,88,0.40)]',
    // Blueberry — primary/running
    primary:
      'bg-[rgba(107,92,166,0.15)] text-[#6C5CA6] border border-[rgba(107,92,166,0.25)]',
    // Gold — success / complete
    success:
      'bg-[rgba(201,162,75,0.13)] text-[#C9A24B] border border-[rgba(201,162,75,0.25)]',
    // Amber — warning (kept warm)
    warning:
      'bg-amber-500/10 text-amber-400 border border-amber-500/20',
    // Error tint — destructive / failed
    destructive:
      'bg-[rgba(178,58,78,0.12)] text-[#B23A4E] border border-[rgba(110,20,35,0.30)]',
    // Hairline outline
    outline:
      'border border-[rgba(107,92,166,0.20)] text-[#9E93B8]',
  }

  const sizes = {
    sm: 'px-2 py-0.5 text-[9px] gap-1 letter-spacing-wider',
    md: 'px-2.5 py-0.5 text-[10px] gap-1.5',
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
