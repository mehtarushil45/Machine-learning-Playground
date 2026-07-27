import { useState } from 'react'
import DataUpload from './components/DataUpload'
import DataPreview from './components/DataPreview'
import ColumnSelector from './components/ColumnSelector'
import type { Dataset } from './types/dataset'

function App() {
  const [dataset, setDataset] = useState<Dataset | null>(null)
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([])
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null)

  const handleDataLoaded = (loadedDataset: Dataset) => {
    setDataset(loadedDataset)
    setSelectedFeatures([])
    setSelectedTarget(null)
  }

  return (
    <main>
      <h1>MLPlayground</h1>

      <DataUpload onDataLoaded={handleDataLoaded} />
      <DataPreview dataset={dataset} />
      {dataset ? (
        <ColumnSelector
          dataset={dataset}
          selectedFeatures={selectedFeatures}
          selectedTarget={selectedTarget}
          onSelectedFeaturesChange={setSelectedFeatures}
          onSelectedTargetChange={setSelectedTarget}
        />
      ) : null}
    </main>
  )
}

export default App
