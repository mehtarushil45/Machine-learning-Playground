import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Check } from 'lucide-react'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectGroup {
  label: string
  options: SelectOption[]
}

export interface SelectProps {
  value: string
  onChange: (value: string) => void
  options?: (SelectOption | SelectGroup)[]
  placeholder?: string
  disabled?: boolean
  className?: string
  id?: string
  name?: string
  style?: React.CSSProperties
}

const BB = {
  surface: '#1B1530',
  elevated: '#2A2247',
  border: 'rgba(107,92,166,0.22)',
  borderHover: 'rgba(107,92,166,0.40)',
  primary: '#4B3B7C',
  primaryLight: '#6C5CA6',
  text: '#F5F1EC',
  muted: '#9E93B8',
  disabled: '#3D3558',
  gold: '#C9A24B',
} as const

export function Select({
  value,
  onChange,
  options = [],
  placeholder = 'Select an option...',
  disabled = false,
  className = '',
  id,
  name,
  style,
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [dropdownPosition, setDropdownPosition] = useState<{
    top: number
    left: number
    width: number
    openUpward: boolean
  }>({
    top: 0,
    left: 0,
    width: 0,
    openUpward: false,
  })

  // Flatten options for label lookup
  const flatOptions: SelectOption[] = React.useMemo(() => {
    const list: SelectOption[] = []
    for (const item of options) {
      if ('options' in item) {
        list.push(...item.options)
      } else {
        list.push(item)
      }
    }
    return list
  }, [options])

  const selectedOption = flatOptions.find((o) => o.value === value)

  // Calculate coordinates & collision with viewport
  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const dropdownHeight = 220 // max-height estimation
    const openUpward = spaceBelow < dropdownHeight && rect.top > dropdownHeight

    setDropdownPosition({
      top: openUpward ? rect.top - 6 : rect.bottom + 6,
      left: rect.left,
      width: Math.max(rect.width, 200),
      openUpward,
    })
  }, [])

  useLayoutEffect(() => {
    if (isOpen) {
      updatePosition()
    }
  }, [isOpen, updatePosition])

  // Reposition on scroll or resize
  useEffect(() => {
    if (!isOpen) return
    const handleScrollOrResize = () => {
      updatePosition()
    }
    window.addEventListener('scroll', handleScrollOrResize, true)
    window.addEventListener('resize', handleScrollOrResize)
    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true)
      window.removeEventListener('resize', handleScrollOrResize)
    }
  }, [isOpen, updatePosition])

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        popoverRef.current &&
        !popoverRef.current.contains(target)
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault()
      if (!isOpen) setIsOpen(true)
    } else if (e.key === 'Escape') {
      setIsOpen(false)
    }
  }

  const handleSelect = (val: string, isDisabled?: boolean) => {
    if (isDisabled) return
    onChange(val)
    setIsOpen(false)
  }

  return (
    <div className={`relative inline-block w-full ${className}`} style={style}>
      <button
        ref={triggerRef}
        id={id}
        name={name}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        onKeyDown={handleKeyDown}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-medium rounded-lg transition-all select-none cursor-pointer focus:outline-none focus:ring-1"
        style={{
          background: BB.elevated,
          border: `1px solid ${isOpen ? BB.primaryLight : BB.border}`,
          color: selectedOption ? BB.text : BB.muted,
          fontFamily: 'var(--font-ui)',
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        <span className="truncate text-left flex-1">
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 transition-transform duration-150 ${
            isOpen ? 'rotate-180' : ''
          }`}
          style={{ color: BB.muted }}
        />
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={popoverRef}
            className="animate-in fade-in-0 duration-100"
            style={{
              position: 'fixed',
              top: dropdownPosition.openUpward ? undefined : dropdownPosition.top,
              bottom: dropdownPosition.openUpward
                ? window.innerHeight - dropdownPosition.top
                : undefined,
              left: dropdownPosition.left,
              width: dropdownPosition.width,
              maxHeight: 220,
              overflowY: 'auto',
              zIndex: 9999, // Render via body portal above all cards and modals
              background: 'rgba(27,21,48,0.98)',
              border: `1px solid ${BB.border}`,
              borderRadius: '8px',
              boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
              backdropFilter: 'blur(16px)',
              padding: '4px',
              fontFamily: 'var(--font-ui)',
            }}
          >
            {options.map((item, idx) => {
              if ('options' in item) {
                // Render Group
                return (
                  <div key={item.label || idx} className="py-1">
                    <div
                      className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
                      style={{ color: BB.gold }}
                    >
                      {item.label}
                    </div>
                    {item.options.map((opt) => {
                      const isSelected = opt.value === value
                      return (
                        <div
                          key={opt.value}
                          onClick={() => handleSelect(opt.value, opt.disabled)}
                          className="flex items-center justify-between px-2.5 py-1.5 text-xs rounded-md cursor-pointer transition-colors"
                          style={{
                            background: isSelected ? 'rgba(107,92,166,0.18)' : 'transparent',
                            color: opt.disabled ? BB.disabled : isSelected ? BB.text : BB.muted,
                            cursor: opt.disabled ? 'not-allowed' : 'pointer',
                          }}
                          onMouseEnter={(e) => {
                            if (!opt.disabled) {
                              e.currentTarget.style.background = 'rgba(107,92,166,0.14)'
                              e.currentTarget.style.color = BB.text
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!opt.disabled) {
                              e.currentTarget.style.background = isSelected
                                ? 'rgba(107,92,166,0.18)'
                                : 'transparent'
                              e.currentTarget.style.color = isSelected ? BB.text : BB.muted
                            }
                          }}
                        >
                          <span className="truncate">{opt.label}</span>
                          {isSelected && (
                            <Check className="w-3.5 h-3.5 shrink-0" style={{ color: BB.primaryLight }} />
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              }

              // Render Flat Option
              const isSelected = item.value === value
              return (
                <div
                  key={item.value}
                  onClick={() => handleSelect(item.value, item.disabled)}
                  className="flex items-center justify-between px-2.5 py-1.5 text-xs rounded-md cursor-pointer transition-colors"
                  style={{
                    background: isSelected ? 'rgba(107,92,166,0.18)' : 'transparent',
                    color: item.disabled ? BB.disabled : isSelected ? BB.text : BB.muted,
                    cursor: item.disabled ? 'not-allowed' : 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    if (!item.disabled) {
                      e.currentTarget.style.background = 'rgba(107,92,166,0.14)'
                      e.currentTarget.style.color = BB.text
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!item.disabled) {
                      e.currentTarget.style.background = isSelected
                        ? 'rgba(107,92,166,0.18)'
                        : 'transparent'
                      e.currentTarget.style.color = isSelected ? BB.text : BB.muted
                    }
                  }}
                >
                  <span className="truncate">{item.label}</span>
                  {isSelected && (
                    <Check className="w-3.5 h-3.5 shrink-0" style={{ color: BB.primaryLight }} />
                  )}
                </div>
              )
            })}
          </div>,
          document.body,
        )}
    </div>
  )
}
