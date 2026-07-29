import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Icon } from '../../components/ui/Icon'

export interface SectionErrorCardProps {
  title: string
  errorMessage: string
  onRetry?: () => void
}

export function SectionErrorCard({ title, errorMessage, onRetry }: SectionErrorCardProps) {
  return (
    <Card variant="default" className="border-amber-500/30 bg-amber-500/5 shadow-xs">
      <CardHeader>
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
            <Icon name="alert-circle" size={20} />
          </div>
          <div>
            <CardTitle>{title} Unavailable</CardTitle>
            <CardDescription className="text-amber-600 dark:text-amber-400">
              Module operating in degraded fallback mode.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground leading-relaxed">{errorMessage}</p>

        {onRetry && (
          <Button variant="outline" size="sm" leftIcon="refresh-cw" onClick={onRetry}>
            Retry Module Analysis
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
