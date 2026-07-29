import React from 'react'
import { cn } from '../../utils/cn'
import { Icon, type IconName } from './Icon'

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'link'
  size?: 'sm' | 'md' | 'lg' | 'icon'
  isLoading?: boolean
  leftIcon?: IconName
  rightIcon?: IconName
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      disabled,
      children,
      leftIcon,
      rightIcon,
      type = 'button',
      ...props
    },
    ref,
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center font-medium rounded-md transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] select-none cursor-pointer'

    const variants = {
      primary:
        'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:shadow-indigo-500/25',
      secondary:
        'bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border/50',
      outline:
        'border border-border bg-transparent hover:bg-secondary/60 hover:text-foreground text-foreground',
      ghost:
        'bg-transparent hover:bg-secondary/80 hover:text-foreground text-muted-foreground',
      destructive:
        'bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm',
      link: 'text-primary underline-offset-4 hover:underline p-0 h-auto font-normal',
    }

    const sizes = {
      sm: 'h-8 px-3 text-xs gap-1.5',
      md: 'h-9 px-4 text-sm gap-2',
      lg: 'h-11 px-6 text-base gap-2.5',
      icon: 'h-9 w-9 p-0 text-sm justify-center',
    }

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || isLoading}
        className={cn(
          baseStyles,
          variants[variant],
          variant !== 'link' && sizes[size],
          className,
        )}
        {...props}
      >
        {isLoading ? (
          <Icon name="loader-2" className="animate-spin text-current" size={16} />
        ) : leftIcon ? (
          <Icon name={leftIcon} size={size === 'sm' ? 14 : 16} />
        ) : null}

        {children}

        {!isLoading && rightIcon ? (
          <Icon name={rightIcon} size={size === 'sm' ? 14 : 16} />
        ) : null}
      </button>
    )
  },
)

Button.displayName = 'Button'
