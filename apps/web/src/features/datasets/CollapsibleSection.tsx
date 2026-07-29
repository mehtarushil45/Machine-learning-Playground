import React, { memo, useState } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card'
import { Icon, type IconName } from '../../components/ui/Icon'

export interface CollapsibleSectionProps {
  id: string
  title: string
  description?: string
  icon: IconName
  badge?: React.ReactNode
  defaultExpanded?: boolean
  children: React.ReactNode
}

export const CollapsibleSection = memo(function CollapsibleSection({
  id,
  title,
  description,
  icon,
  badge,
  defaultExpanded = false,
  children,
}: CollapsibleSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  return (
    <Card id={id} variant="default" className="transition-all duration-200">
      <CardHeader
        onClick={() => setIsExpanded((prev) => !prev)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setIsExpanded((prev) => !prev)
          }
        }}
        tabIndex={0}
        role="button"
        aria-expanded={isExpanded}
        aria-controls={`${id}-content`}
        className="cursor-pointer select-none flex flex-wrap items-center justify-between gap-4 border-b border-border/40 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <Icon name={icon} size={20} />
          </div>
          <div>
            <CardTitle className="flex items-center gap-2">
              {title}
            </CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {badge}
          <div className="p-1 rounded-md text-muted-foreground hover:text-foreground">
            <Icon
              name={isExpanded ? 'chevron-down' : 'chevron-right'}
              size={20}
              className="transition-transform duration-200"
            />
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent id={`${id}-content`} className="pt-5 animate-in fade-in-0 duration-200">
          {children}
        </CardContent>
      )}
    </Card>
  )
})
