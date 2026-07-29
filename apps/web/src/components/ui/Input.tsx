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
            className="text-xs font-medium text-foreground/90 select-none"
          >
            {label}
          </label>
        ) : null}

        <div className="relative flex items-center">
          {startIcon ? (
            <div className="absolute left-3 text-muted-foreground pointer-events-none">
              <Icon name={startIcon} size={16} />
            </div>
          ) : null}

          <input
            ref={ref}
            id={inputId}
            type={type}
            disabled={disabled}
            className={cn(
              'flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50',
              startIcon && 'pl-9',
              endIcon && 'pr-9',
              error && 'border-destructive focus-visible:ring-destructive',
              className,
            )}
            {...props}
          />

          {endIcon ? (
            <div className="absolute right-3 text-muted-foreground pointer-events-none">
              <Icon name={endIcon} size={16} />
            </div>
          ) : null}
        </div>

        {error ? (
          <p className="text-xs text-destructive flex items-center gap-1 font-medium">
            <Icon name="alert-circle" size={12} />
            {error}
          </p>
        ) : helperText ? (
          <p className="text-xs text-muted-foreground">{helperText}</p>
        ) : null}
      </div>
    )
  },
)

Input.displayName = 'Input'
