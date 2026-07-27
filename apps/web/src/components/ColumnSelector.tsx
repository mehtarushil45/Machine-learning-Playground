import { useMemo } from 'react'
import { getNumericColumns } from '../utils/columnAnalysis'
import { selectTargetColumn, toggleFeatureColumn } from '../utils/columnSelection'
import type { Dataset } from '../types/dataset'

interface ColumnSelectorProps {
  dataset: Dataset
  selectedFeatures: string[]
  selectedTarget: string | null
  onSelectedFeaturesChange: (features: string[]) => void
  onSelectedTargetChange: (target: string) => void
}

function ColumnSelector({
  dataset,
  selectedFeatures,
  selectedTarget,
  onSelectedFeaturesChange,
  onSelectedTargetChange,
}: ColumnSelectorProps) {
  const numericColumns = useMemo(
    () => getNumericColumns(dataset.columns, dataset.rows),
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

  if (numericColumns.length === 0) {
    return (
      <section>
        <h2>Column Selection</h2>
        <p>No numeric columns are available in this dataset.</p>
      </section>
    )
  }

  const featuresSummary =
    selectedFeatures.length > 0 ? selectedFeatures.join(', ') : 'None selected'

  const targetSummary = selectedTarget ?? 'None selected'

  return (
    <section>
      <h2>Column Selection</h2>

      <fieldset>
        <legend>Feature columns (select one or more)</legend>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {numericColumns.map((column) => (
            <li key={`feature-${column}`}>
              <label>
                <input
                  type="checkbox"
                  checked={selectedFeatures.includes(column)}
                  disabled={column === selectedTarget}
                  onChange={() => handleFeatureToggle(column)}
                />
                {column}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <fieldset>
        <legend>Target column (select exactly one)</legend>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {numericColumns.map((column) => (
            <li key={`target-${column}`}>
              <label>
                <input
                  type="radio"
                  name="target-column"
                  checked={selectedTarget === column}
                  onChange={() => handleTargetChange(column)}
                />
                {column}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <div>
        <p>
          <strong>Selected features:</strong> {featuresSummary}
        </p>
        <p>
          <strong>Selected target:</strong> {targetSummary}
        </p>
      </div>
    </section>
  )
}

export default ColumnSelector
