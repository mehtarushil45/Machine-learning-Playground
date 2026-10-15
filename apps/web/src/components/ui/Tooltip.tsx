import React, { useState } from 'react'
import { cn } from '../../utils/cn'

export interface TooltipProps {
  content: React.ReactNode
  children: React.ReactElement
  position?: 'top' | 'bottom' | 'left' | 'right'
  align?: 'left' | 'center' | 'right'
  className?: string
}

export function Tooltip({
  content,
  children,
  position = 'top',
  align = 'center',
  className = '',
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false)

  const getPositionStyle = (): React.CSSProperties => {
    const baseStyle: React.CSSProperties = {
      backgroundColor: '#131826',
      color: '#F8FAFC',
      border: '1px solid #334155',
      boxShadow: '0 12px 32px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.08)',
      textTransform: 'none',
      letterSpacing: 'normal',
      whiteSpace: 'normal',
      width: 'max-content',
      maxWidth: '280px',
      zIndex: 99999,
    }

    if (position === 'bottom') {
      baseStyle.top = '100%'
      baseStyle.marginTop = '8px'
      if (align === 'left') {
        baseStyle.left = 0
        baseStyle.transform = 'none'
      } else if (align === 'right') {
        baseStyle.right = 0
        baseStyle.left = 'auto'
        baseStyle.transform = 'none'
      } else {
        baseStyle.left = '50%'
        baseStyle.transform = 'translateX(-50%)'
      }
    } else if (position === 'top') {
      baseStyle.bottom = '100%'
      baseStyle.marginBottom = '8px'
      if (align === 'left') {
        baseStyle.left = 0
        baseStyle.transform = 'none'
      } else if (align === 'right') {
        baseStyle.right = 0
        baseStyle.left = 'auto'
        baseStyle.transform = 'none'
      } else {
        baseStyle.left = '50%'
        baseStyle.transform = 'translateX(-50%)'
      }
    } else if (position === 'left') {
      baseStyle.right = '100%'
      baseStyle.top = '50%'
      baseStyle.transform = 'translateY(-50%)'
      baseStyle.marginRight = '8px'
    } else if (position === 'right') {
      baseStyle.left = '100%'
      baseStyle.top = '50%'
      baseStyle.transform = 'translateY(-50%)'
      baseStyle.marginLeft = '8px'
    }

    return baseStyle
  }

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onFocus={() => setIsVisible(true)}
      onBlur={() => setIsVisible(false)}
    >
      {children}
      {isVisible && (
        <div
          role="tooltip"
          className={cn(
            'absolute z-50 p-2.5 text-xs font-normal rounded-lg pointer-events-none transition-all duration-150',
            className,
          )}
          style={getPositionStyle()}
        >
          {content}
        </div>
      )}
    </div>
  )
}
