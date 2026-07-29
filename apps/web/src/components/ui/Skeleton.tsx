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
        'animate-pulse bg-muted/70 dark:bg-muted/40',
        variants[variant],
        className,
      )}
      {...props}
    />
  )
}
