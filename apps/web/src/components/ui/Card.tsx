import React from 'react'
import { cn } from '../../utils/cn'

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'glass' | 'outline' | 'interactive'
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'default', ...props }, ref) => {
    // Asymmetric brand corner: top-left, top-right, bottom-left rounded — bottom-right sharp
    const variants = {
      default:
        'bg-[#1B1530] text-[#F5F1EC] border border-[rgba(107,92,166,0.18)] rounded-tl-xl rounded-tr-xl rounded-bl-xl rounded-br-none',
      glass:
        'bg-[rgba(27,21,48,0.75)] backdrop-blur-md text-[#F5F1EC] border border-[rgba(107,92,166,0.18)] rounded-tl-xl rounded-tr-xl rounded-bl-xl rounded-br-none',
      outline:
        'bg-transparent text-[#F5F1EC] border border-[rgba(107,92,166,0.20)] rounded-tl-xl rounded-tr-xl rounded-bl-xl rounded-br-none',
      interactive:
        'bg-[#1B1530] text-[#F5F1EC] border border-[rgba(107,92,166,0.18)] rounded-tl-xl rounded-tr-xl rounded-bl-xl rounded-br-none hover:border-[rgba(107,92,166,0.40)] hover:bg-[#2A2247] transition-all duration-200 cursor-pointer',
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
      'text-base font-semibold leading-none tracking-tight text-[#F5F1EC]',
      className,
    )}
    style={{ fontFamily: 'var(--font-display)' }}
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
    className={cn('text-xs text-[#9E93B8]', className)}
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
    className={cn('flex items-center p-5 pt-3 mt-3 border-t border-[rgba(107,92,166,0.15)]', className)}
    {...props}
  />
))
CardFooter.displayName = 'CardFooter'
