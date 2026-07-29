import { cn } from '../../utils/cn'

export interface DividerProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: 'horizontal' | 'vertical'
  label?: string
}

export function Divider({
  className,
  orientation = 'horizontal',
  label,
  ...props
}: DividerProps) {
  if (orientation === 'vertical') {
    return (
      <div
        role="separator"
        aria-orientation="vertical"
        className={cn('h-full w-px bg-border/60 shrink-0 mx-2', className)}
        {...props}
      />
    )
  }

  if (label) {
    return (
      <div
        role="separator"
        className={cn('flex items-center w-full my-4 text-xs text-muted-foreground', className)}
        {...props}
      >
        <div className="flex-grow border-t border-border/60" />
        <span className="px-3 font-medium uppercase tracking-wider text-[10px]">{label}</span>
        <div className="flex-grow border-t border-border/60" />
      </div>
    )
  }

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      className={cn('h-px w-full bg-border/60 shrink-0 my-3', className)}
      {...props}
    />
  )
}
