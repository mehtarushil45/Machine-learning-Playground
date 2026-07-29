import React from 'react'
import { cn } from '../../utils/cn'
import { Icon } from './Icon'

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string
  alt?: string
  fallback?: string
  size?: 'sm' | 'md' | 'lg'
}

export function Avatar({
  className,
  src,
  alt = 'Avatar',
  fallback,
  size = 'md',
  ...props
}: AvatarProps) {
  const [imageError, setImageError] = React.useState(false)

  const sizes = {
    sm: 'h-7 w-7 text-xs',
    md: 'h-9 w-9 text-sm',
    lg: 'h-11 w-11 text-base',
  }

  return (
    <div
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-secondary font-medium text-secondary-foreground shadow-xs select-none',
        sizes[size],
        className,
      )}
      {...props}
    >
      {src && !imageError ? (
        <img
          src={src}
          alt={alt}
          onError={() => setImageError(true)}
          className="h-full w-full object-cover"
        />
      ) : fallback ? (
        <span>{fallback.slice(0, 2).toUpperCase()}</span>
      ) : (
        <Icon name="user" size={size === 'sm' ? 14 : size === 'md' ? 16 : 20} className="text-muted-foreground" />
      )}
    </div>
  )
}
