import { useState } from 'react'
import { ThemeProvider } from './providers/ThemeProvider'
import { AppLayout } from './components/layout/AppLayout'
import { EnterpriseWorkspace } from './features/datasets/EnterpriseWorkspace'
import { ApexPlayground } from './dev/apex/ApexPlayground'
import type { Dataset } from './types/dataset'

function AppContent() {
  const [currentView, setCurrentView] = useState<'app' | 'apex'>('app')

  const [dataset, setDataset] = useState<Dataset | null>(null)

  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([])

  const [selectedTarget, setSelectedTarget] = useState<string | null>(null)

  const handleDataLoaded = (loadedDataset: Dataset) => {
    setDataset(loadedDataset)
    setSelectedFeatures([])
    setSelectedTarget(null)
  }

  return (
    <AppLayout
      currentView={currentView}
      onToggleView={setCurrentView}
    >
      {currentView === 'apex' ? (
        <ApexPlayground />
      ) : (
        <EnterpriseWorkspace
          dataset={dataset}
          selectedFeatures={selectedFeatures}
          selectedTarget={selectedTarget}
          onDataLoaded={handleDataLoaded}
          onSelectedFeaturesChange={setSelectedFeatures}
          onSelectedTargetChange={setSelectedTarget}
        />
      )}
    </AppLayout>
  )
}

export default function App() {
  return (
    <ThemeProvider defaultTheme="system">
      <AppContent />
    </ThemeProvider>
  )
}
