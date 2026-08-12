import { memo, useMemo } from 'react'
import { getNumericColumns } from '../../utils/columnAnalysis'
import { selectTargetColumn, toggleFeatureColumn } from '../../utils/columnSelection'
import type { Dataset } from '../../types/dataset'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Icon } from '../../components/ui/Icon'

export interface ColumnSelectorProps {
  dataset: Dataset
  selectedFeatures: string[]
  selectedTarget: string | null
  onSelectedFeaturesChange: (features: string[]) => void
  onSelectedTargetChange: (target: string) => void
}

export const ColumnSelector = memo(function ColumnSelector({
  dataset,
  selectedFeatures,
  selectedTarget,
  onSelectedFeaturesChange,
  onSelectedTargetChange,
}: ColumnSelectorProps) {
  const allColumns = useMemo(() => dataset.columns || [], [dataset.columns])
  const numericSet = useMemo(
    () => new Set(getNumericColumns(dataset.columns, dataset.rows)),
    [dataset.columns, dataset.rows],
  )

  const handleFeatureToggle = (column: string) => {
    onSelectedFeaturesChange(
      toggleFeatureColumn(selectedFeatures, column, selectedTarget),
    )
  }

  const handleTargetChange = (column: string) => {
    const next = selectTargetColumn(column, selectedFeatures)
    onSelectedTargetChange(next.selectedTarget)
    onSelectedFeaturesChange(next.selectedFeatures)
  }

  if (allColumns.length === 0) {
    return (
      <Card variant="outline" className="p-6">
        <div className="flex items-center gap-3 text-amber-500">
          <Icon name="alert-circle" size={20} />
          <div>
            <h4 className="text-sm font-semibold">No Columns Detected</h4>
            <p className="text-xs text-muted-foreground">
              No header columns were found in this dataset for feature and target modeling.
            </p>
          </div>
        </div>
      </Card>
    )
  }

  const featuresSummary =
    selectedFeatures.length > 0 ? selectedFeatures.join(', ') : 'None selected'

  const targetSummary = selectedTarget ?? 'None selected'

  return (
    <Card variant="default" className="border-purple-500/20 shadow-md">
      <CardHeader>
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-purple-500/10 text-purple-500">
            <Icon name="grid" size={20} />
          </div>
          <div>
            <CardTitle>Feature & Target Column Selection</CardTitle>
            <CardDescription>
              Select one or more numeric features for training input, and choose exactly one target variable.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Feature Columns Selection */}
        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
            <Icon name="check-square" size={14} className="text-primary" />
            Input Features (Select one or more)
          </legend>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
            {allColumns.map((column) => {
              const isChecked = selectedFeatures.includes(column)
              const isDisabled = column === selectedTarget

              return (
                <label
                  key={`feature-${column}`}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-all duration-150 cursor-pointer select-none ${
                    isChecked
                      ? 'bg-primary/10 border-primary/50 text-foreground font-medium shadow-xs'
                      : isDisabled
                      ? 'opacity-40 border-border bg-muted/20 cursor-not-allowed'
                      : 'border-border bg-card hover:bg-muted/40 text-muted-foreground'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    disabled={isDisabled}
                    onChange={() => handleFeatureToggle(column)}
                    className="h-4 w-4 rounded-md border-input accent-primary text-primary focus:ring-primary cursor-pointer disabled:cursor-not-allowed"
                  />
                  <span className="text-sm font-mono truncate">{column}</span>
                  {isDisabled && (
                    <Badge variant="outline" size="sm" className="ml-auto text-[10px]">
                      Target
                    </Badge>
                  )}
                </label>
              )
            })}
          </div>
        </fieldset>

        {/* Target Column Selection */}
        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
            <Icon name="circle-dot" size={14} className="text-purple-400" />
            Target Variable (Select exactly one)
          </legend>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
            {allColumns.map((column) => {
              const isSelected = selectedTarget === column

              return (
                <label
                  key={`target-${column}`}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-all duration-150 cursor-pointer select-none ${
                    isSelected
                      ? 'bg-purple-500/15 border-purple-500/60 text-foreground font-medium shadow-xs ring-1 ring-purple-500/30'
                      : 'border-border bg-card hover:bg-muted/40 text-muted-foreground'
                  }`}
                >
                  <input
                    type="radio"
                    name="target-column"
                    checked={isSelected}
                    onChange={() => handleTargetChange(column)}
                    className="h-4 w-4 border-input accent-purple-500 text-purple-500 focus:ring-purple-500 cursor-pointer"
                  />
                  <span className="text-sm font-mono truncate">{column}</span>
                </label>
              )
            })}
          </div>
        </fieldset>

        {/* Selection Summary Footer */}
        <div className="p-4 rounded-xl border border-border/60 bg-muted/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-medium text-muted-foreground">Selected Features:</span>
            <Badge variant={selectedFeatures.length > 0 ? 'primary' : 'outline'}>
              {featuresSummary}
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-medium text-muted-foreground">Selected Target:</span>
            <Badge variant={selectedTarget ? 'success' : 'outline'}>
              {targetSummary}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  )
})
