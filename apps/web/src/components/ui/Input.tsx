import React from 'react'
import { cn } from '../../utils/cn'
import { Icon, type IconName } from './Icon'

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  helperText?: string
  startIcon?: IconName
  endIcon?: IconName
  fullWidth?: boolean
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      type = 'text',
      label,
      error,
      helperText,
      startIcon,
      endIcon,
      fullWidth = false,
      disabled,
      id,
      ...props
    },
    ref,
  ) => {
    const generatedId = React.useId()
    const inputId = id || generatedId

    return (
      <div className={cn('flex flex-col gap-1.5', fullWidth && 'w-full')}>
        {label ? (
          <label
            htmlFor={inputId}
            className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9E93B8] select-none"
            style={{ fontFamily: 'var(--font-ui)' }}
          >
            {label}
          </label>
        ) : null}

        <div className="relative flex items-center">
          {startIcon ? (
            <div className="absolute left-3 text-[#9E93B8] pointer-events-none">
              <Icon name={startIcon} size={16} />
            </div>
          ) : null}

          <input
            ref={ref}
            id={inputId}
            type={type}
            disabled={disabled}
            className={cn(
              // Asymmetric corners: 8px 8px 0 8px
              'flex h-9 w-full rounded-tl-lg rounded-tr-lg rounded-bl-lg rounded-br-none',
              'border border-[rgba(107,92,166,0.20)] bg-transparent px-3 py-1 text-sm',
              'text-[#F5F1EC] placeholder:text-[#5E5480]',
              'transition-colors duration-150',
              'focus-visible:outline-none focus-visible:border-[#6C5CA6] focus-visible:ring-2 focus-visible:ring-[rgba(107,92,166,0.30)] focus-visible:ring-offset-1 focus-visible:ring-offset-[#0B0912]',
              'disabled:cursor-not-allowed disabled:opacity-50',
              startIcon && 'pl-9',
              endIcon && 'pr-9',
              error && 'border-[rgba(178,58,78,0.50)] focus-visible:ring-[rgba(178,58,78,0.30)]',
              className,
            )}
            style={{ fontFamily: 'var(--font-ui)' }}
            {...props}
          />

          {endIcon ? (
            <div className="absolute right-3 text-[#9E93B8] pointer-events-none">
              <Icon name={endIcon} size={16} />
            </div>
          ) : null}
        </div>

        {error ? (
          <p className="text-xs text-[#B23A4E] flex items-center gap-1 font-medium">
            <Icon name="alert-circle" size={12} />
            {error}
          </p>
        ) : helperText ? (
          <p className="text-xs text-[#9E93B8]">{helperText}</p>
        ) : null}
      </div>
    )
  },
)

Input.displayName = 'Input'
