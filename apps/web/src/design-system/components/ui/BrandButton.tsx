/**
 * BrandButton — Primary, Secondary, Ghost, Danger variants
 * Signature asymmetric corner: border-radius 8px 8px 0px 8px (three rounded, bottom-right sharp)
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { colors } from '../../tokens'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

interface BrandButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  leftIcon?: ReactNode
  rightIcon?: ReactNode
  isLoading?: boolean
  fullWidth?: boolean
}

const BASE =
  'inline-flex items-center justify-center gap-2 font-medium transition-all duration-200 cursor-pointer select-none focus-visible:outline-none disabled:opacity-50 disabled:cursor-not-allowed'

const RADII = 'rounded-tl-lg rounded-tr-lg rounded-bl-lg rounded-br-none'  /* asymmetric */

const SIZES: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-7 py-3 text-sm',
}

export function BrandButton({
  variant = 'primary',
  size = 'md',
  leftIcon,
  rightIcon,
  isLoading = false,
  fullWidth = false,
  children,
  className = '',
  disabled,
  style,
  ...rest
}: BrandButtonProps) {
  const variantStyles: Record<Variant, React.CSSProperties> = {
    primary: {
      background:  disabled ? colors.maroonFaint : colors.maroon,
      color:       colors.text,
      border:      'none',
    },
    secondary: {
      background:  'transparent',
      color:       colors.light,
      border:      `1px solid ${colors.primary}`,
    },
    ghost: {
      background:  'transparent',
      color:       colors.muted,
      border:      'none',
    },
    danger: {
      background:  'transparent',
      color:       colors.error,
      border:      `1px solid ${colors.maroonBorder}`,
    },
  }

  const hoverClass: Record<Variant, string> = {
    primary:   'hover:brightness-110',
    secondary: 'hover:bg-[rgba(107,92,166,0.12)]',
    ghost:     'hover:text-[#F5F1EC] relative btn-ghost-hover',
    danger:    'hover:bg-[rgba(178,58,78,0.08)]',
  }

  return (
    <button
      disabled={disabled || isLoading}
      style={{ ...variantStyles[variant], fontFamily: "var(--font-ui)", ...style }}
      className={`
        ${BASE} ${RADII} ${SIZES[size]} ${hoverClass[variant]}
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `.trim()}
      {...rest}
    >
      {isLoading && (
        <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
      )}
      {!isLoading && leftIcon}
      {children}
      {!isLoading && rightIcon}
    </button>
  )
}
