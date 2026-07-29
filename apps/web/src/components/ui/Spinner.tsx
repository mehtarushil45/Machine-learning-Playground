import { cn } from '../../utils/cn'
import { Icon } from './Icon'

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
  label?: string
}

export function Spinner({
  size = 'md',
  className = '',
  label = 'Loading...',
}: SpinnerProps) {
  const sizes = {
    sm: 14,
    md: 20,
    lg: 28,
  }

  return (
    <div
      role="status"
      aria-label={label}
      className={cn('inline-flex items-center justify-center text-primary', className)}
    >
      <Icon name="loader-2" size={sizes[size]} className="animate-spin" />
      <span className="sr-only">{label}</span>
    </div>
  )
}
