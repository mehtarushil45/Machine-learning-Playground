/**
 * BrandInput & BrandSelect & BrandTextarea
 * Asymmetric corner (8px 8px 0px 8px), hairline border, transparent background.
 */
import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { colors } from '../../tokens'

const inputStyle: React.CSSProperties = {
  background:   'transparent',
  border:       `1px solid ${colors.border}`,
  borderRadius: '8px 8px 0px 8px',
  color:        colors.text,
  fontFamily:   'var(--font-ui)',
  fontSize:     '0.875rem',
  padding:      '0.625rem 0.875rem',
  width:        '100%',
  outline:      'none',
  transition:   'border-color 180ms ease',
}

const focusStyle: React.CSSProperties = {
  borderColor: colors.light,
  boxShadow:   `0 0 0 3px ${colors.ring}`,
}

interface LabelProps {
  children: React.ReactNode
  htmlFor?: string
  hint?: string
}

export function FieldLabel({ children, htmlFor, hint }: LabelProps) {
  return (
    <div className="flex flex-col gap-0.5 mb-1.5">
      <label
        htmlFor={htmlFor}
        style={{ fontFamily: 'var(--font-ui)', color: colors.muted, fontSize: '10px', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' }}
      >
        {children}
      </label>
      {hint && (
        <p style={{ color: colors.placeholder, fontSize: '11px', fontFamily: 'var(--font-ui)' }}>{hint}</p>
      )}
    </div>
  )
}

export const BrandInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = '', style: propStyle, ...rest }, ref) => {
    return (
      <input
        ref={ref}
        style={{ ...inputStyle, ...propStyle }}
        className={`placeholder:text-[#5E5480] focus:outline-none ${className}`}
        onFocus={(e) => {
          Object.assign(e.currentTarget.style, focusStyle)
          rest.onFocus?.(e)
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = colors.border
          e.currentTarget.style.boxShadow = 'none'
          rest.onBlur?.(e)
        }}
        {...rest}
      />
    )
  }
)
BrandInput.displayName = 'BrandInput'

export const BrandSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className = '', children, style: propStyle, ...rest }, ref) => {
    return (
      <select
        ref={ref}
        style={{ ...inputStyle, cursor: 'pointer', ...propStyle }}
        className={`focus:outline-none ${className}`}
        onFocus={(e) => { Object.assign(e.currentTarget.style, focusStyle) }}
        onBlur={(e)  => { e.currentTarget.style.borderColor = colors.border; e.currentTarget.style.boxShadow = 'none' }}
        {...rest}
      >
        {children}
      </select>
    )
  }
)
BrandSelect.displayName = 'BrandSelect'

export const BrandTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className = '', style: propStyle, ...rest }, ref) => {
    return (
      <textarea
        ref={ref}
        style={{ ...inputStyle, resize: 'none', lineHeight: '1.6', ...propStyle }}
        className={`placeholder:text-[#5E5480] focus:outline-none ${className}`}
        onFocus={(e) => { Object.assign(e.currentTarget.style, focusStyle) }}
        onBlur={(e)  => { e.currentTarget.style.borderColor = colors.border; e.currentTarget.style.boxShadow = 'none' }}
        {...rest}
      />
    )
  }
)
BrandTextarea.displayName = 'BrandTextarea'

/** Toggle switch — blueberry when active */
interface ToggleProps {
  checked: boolean
  onChange: (v: boolean) => void
  label?: string
}
export function BrandToggle({ checked, onChange, label }: ToggleProps) {
  return (
    <label className="flex items-center gap-3 cursor-pointer select-none">
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        style={{
          width: 36, height: 20,
          borderRadius: 10,
          background: checked ? colors.primary : colors.disabled,
          position: 'relative',
          border: 'none',
          cursor: 'pointer',
          transition: 'background 200ms',
          flexShrink: 0,
        }}
      >
        <span style={{
          position: 'absolute',
          top: 2,
          left: checked ? 18 : 2,
          width: 16, height: 16,
          borderRadius: '50%',
          background: colors.text,
          transition: 'left 200ms',
          display: 'block',
        }} />
      </button>
      {label && (
        <span style={{ color: colors.muted, fontFamily: 'var(--font-ui)', fontSize: '0.8125rem' }}>
          {label}
        </span>
      )}
    </label>
  )
}
