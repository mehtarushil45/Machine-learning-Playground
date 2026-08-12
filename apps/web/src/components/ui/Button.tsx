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
    // Asymmetric brand corner: 3 rounded, bottom-right sharp
    const baseStyles =
      'inline-flex items-center justify-center font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(107,92,166,0.5)] focus-visible:ring-offset-1 focus-visible:ring-offset-[#0B0912] disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97] select-none cursor-pointer rounded-tl-lg rounded-tr-lg rounded-bl-lg rounded-br-none'

    const variants = {
      // Maroon CTA — primary action
      primary:
        'bg-[#6E1423] text-[#F5F1EC] hover:bg-[#8E2A3C] shadow-sm hover:shadow-[0_4px_16px_rgba(110,20,35,0.35)]',
      // Blueberry outline — secondary action
      secondary:
        'bg-transparent text-[#6C5CA6] border border-[rgba(107,92,166,0.25)] hover:bg-[rgba(107,92,166,0.10)] hover:border-[#4B3B7C]',
      // Hairline outline — neutral
      outline:
        'border border-[rgba(107,92,166,0.20)] bg-transparent hover:bg-[rgba(107,92,166,0.08)] text-[#9E93B8] hover:text-[#F5F1EC]',
      // Transparent ghost
      ghost:
        'bg-transparent hover:bg-[rgba(107,92,166,0.10)] text-[#9E93B8] hover:text-[#F5F1EC]',
      // Danger — maroon error tint
      destructive:
        'bg-[rgba(178,58,78,0.12)] text-[#B23A4E] border border-[rgba(110,20,35,0.35)] hover:bg-[rgba(178,58,78,0.20)]',
      // Link — no box
      link: 'text-[#6C5CA6] underline-offset-4 hover:underline p-0 h-auto font-normal rounded-none',
    }

    const sizes = {
      sm:   'h-7 px-3 text-xs gap-1.5',
      md:   'h-9 px-4 text-sm gap-2',
      lg:   'h-11 px-6 text-sm gap-2.5',
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
