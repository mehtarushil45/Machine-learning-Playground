import React from 'react'
import { cn } from '../../utils/cn'

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'glass' | 'outline' | 'interactive'
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'default', ...props }, ref) => {
    const variants = {
      default:
        'bg-card text-card-foreground border border-border shadow-xs rounded-xl',
      glass:
        'bg-card/80 backdrop-blur-md text-card-foreground border border-border/60 shadow-md rounded-xl',
      outline:
        'bg-transparent text-card-foreground border border-border rounded-xl',
      interactive:
        'bg-card text-card-foreground border border-border/80 shadow-xs rounded-xl hover:border-primary/50 hover:shadow-md transition-all duration-200 cursor-pointer',
    }

    return (
      <div
        ref={ref}
        className={cn('overflow-hidden', variants[variant], className)}
        {...props}
      />
    )
  },
)
Card.displayName = 'Card'

export const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex flex-col space-y-1.5 p-5 pb-3', className)}
    {...props}
  />
))
CardHeader.displayName = 'CardHeader'

export const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      'text-base font-semibold leading-none tracking-tight text-foreground',
      className,
    )}
    {...props}
  />
))
CardTitle.displayName = 'CardTitle'

export const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn('text-xs text-muted-foreground', className)}
    {...props}
  />
))
CardDescription.displayName = 'CardDescription'

export const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('p-5 pt-0', className)} {...props} />
))
CardContent.displayName = 'CardContent'

export const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex items-center p-5 pt-0 border-t border-border/40 mt-3 pt-3', className)}
    {...props}
  />
))
CardFooter.displayName = 'CardFooter'
