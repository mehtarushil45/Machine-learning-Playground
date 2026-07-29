import { lazy, Suspense, useCallback, useState } from 'react'
import { ThemeProvider } from './providers/ThemeProvider'
import { AppLayout } from './components/layout/AppLayout'
import { EnterpriseWorkspace } from './features/datasets/EnterpriseWorkspace'
import { Spinner } from './components/ui/Spinner'
import type { Dataset } from './types/dataset'

// Lazy-load developer-only ApexPlayground component for production bundle splitting
const ApexPlayground = lazy(() =>
  import('./dev/apex/ApexPlayground').then((m) => ({ default: m.ApexPlayground })),
)

function AppContent() {
  const [currentView, setCurrentView] = useState<'app' | 'apex'>('app')
  const [dataset, setDataset] = useState<Dataset | null>(null)
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([])
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null)

  const handleDataLoaded = useCallback((loadedDataset: Dataset) => {
    setDataset(loadedDataset)
    setSelectedFeatures([])
    setSelectedTarget(null)
  }, [])

  const handleSelectedFeaturesChange = useCallback((features: string[]) => {
    setSelectedFeatures(features)
  }, [])

  const handleSelectedTargetChange = useCallback((target: string) => {
    setSelectedTarget(target)
  }, [])

  const handleToggleView = useCallback((view: 'app' | 'apex') => {
    setCurrentView(view)
  }, [])

  return (
    <AppLayout currentView={currentView} onToggleView={handleToggleView}>
      {currentView === 'apex' ? (
        <Suspense
          fallback={
            <div className="flex items-center justify-center min-h-[400px]">
              <Spinner size="lg" label="Loading Component Playground..." />
            </div>
          }
        >
          <ApexPlayground />
        </Suspense>
      ) : (
        <EnterpriseWorkspace
          dataset={dataset}
          selectedFeatures={selectedFeatures}
          selectedTarget={selectedTarget}
          onDataLoaded={handleDataLoaded}
          onSelectedFeaturesChange={handleSelectedFeaturesChange}
          onSelectedTargetChange={handleSelectedTargetChange}
        />
      )}
    </AppLayout>
  )
}

function App() {
  return (
    <ThemeProvider defaultTheme="system">
      <AppContent />
    </ThemeProvider>
  )
}

export default App
