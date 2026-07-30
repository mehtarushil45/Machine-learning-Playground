import { memo, useState } from 'react'
import type { Dataset, DatasetRecommendations } from '../../types/dataset'
import type { TrainingRequestPayload } from '../../types/job'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Badge } from '../../components/ui/Badge'
import { Icon } from '../../components/ui/Icon'

export interface TrainingConfigurationPanelProps {
  dataset: Dataset | null
  selectedFeatures: string[]
  selectedTarget: string | null
  recommendations: DatasetRecommendations | null
  onLaunchJob: (payload: TrainingRequestPayload) => Promise<void>
  isLaunching?: boolean
}

export const TrainingConfigurationPanel = memo(function TrainingConfigurationPanel({
  dataset,
  selectedFeatures,
  selectedTarget,
  recommendations,
  onLaunchJob,
  isLaunching = false,
}: TrainingConfigurationPanelProps) {
  const defaultAlgorithm =
    recommendations?.recommended_models[0] || 'Random Forest Classifier'

  const [algorithm, setAlgorithm] = useState<string>(defaultAlgorithm)
  const [trainTestSplit, setTrainTestSplit] = useState<number>(0.8)
  const [randomSeed, setRandomSeed] = useState<number>(42)
  const [crossValidation, setCrossValidation] = useState<number>(5)
  const [normalization, setNormalization] = useState<boolean>(true)
  const [featureSelection, setFeatureSelection] = useState<string>('all')
  const [notes, setNotes] = useState<string>('')
  const [validationError, setValidationError] = useState<string | null>(null)

  const availableAlgorithms = recommendations?.recommended_models.length
    ? recommendations.recommended_models
    : [
        'Random Forest Classifier',
        'XGBoost Classifier',
        'Logistic Regression',
        'Gradient Boosting Classifier',
        'Random Forest Regressor',
        'XGBoost Regressor',
        'Ridge / Lasso Regression',
      ]

  const handleLaunch = async () => {
    setValidationError(null)

    if (!dataset) {
      setValidationError('No active dataset loaded.')
      return
    }

    if (!selectedTarget) {
      setValidationError('Please select a target variable column in the Column Selector panel.')
      return
    }

    if (selectedFeatures.length === 0) {
      setValidationError('Please select at least one input feature column.')
      return
    }

    if (selectedFeatures.includes(selectedTarget)) {
      setValidationError(`Target column '${selectedTarget}' cannot be included in input feature columns.`)
      return
    }

    if (trainTestSplit < 0.5 || trainTestSplit > 0.95) {
      setValidationError('Train/Test split ratio must be between 0.50 and 0.95.')
      return
    }

    const payload: TrainingRequestPayload = {
      dataset_id: dataset.datasetId || `ds-${dataset.fileName}`,
      target_column: selectedTarget,
      feature_columns: selectedFeatures,
      algorithm,
      train_test_split: Number(trainTestSplit),
      random_seed: Number(randomSeed),
      cross_validation: Number(crossValidation),
      normalization,
      feature_selection: featureSelection,
      notes,
    }

    try {
      await onLaunchJob(payload)
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : 'Failed to launch training job.')
    }
  }

  return (
    <Card variant="default" className="border-indigo-500/30 shadow-md">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500">
              <Icon name="cpu" size={20} />
            </div>
            <div>
              <CardTitle>ML Model Training Setup</CardTitle>
              <CardDescription>
                Configure hyperparameters, algorithm choice, train/test split, and validation strategy.
              </CardDescription>
            </div>
          </div>

          <Badge variant="primary" icon="layers">
            {selectedFeatures.length} Features $\rightarrow$ 1 Target ({selectedTarget || 'None'})
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Inline Validation Error Banner */}
        {validationError && (
          <div className="p-3.5 rounded-xl border border-destructive/40 bg-destructive/10 text-xs text-destructive flex items-center gap-2">
            <Icon name="alert-circle" size={16} className="shrink-0" />
            <span className="font-semibold">{validationError}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Column: Algorithm Choice & Split */}
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">
                Algorithm Architecture
              </label>
              <select
                value={algorithm}
                onChange={(e) => setAlgorithm(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-border bg-card text-foreground text-xs font-medium focus:ring-2 focus:ring-primary focus:outline-none"
              >
                {availableAlgorithms.map((algo) => (
                  <option key={algo} value={algo}>
                    {algo}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Train / Test Split Ratio
                </label>
                <span className="text-xs font-mono font-bold text-primary">
                  {Math.round(trainTestSplit * 100)}% Train / {Math.round((1 - trainTestSplit) * 100)}% Test
                </span>
              </div>
              <input
                type="range"
                min="0.50"
                max="0.95"
                step="0.05"
                value={trainTestSplit}
                onChange={(e) => setTrainTestSplit(parseFloat(e.target.value))}
                className="w-full h-2 rounded-lg bg-muted accent-primary cursor-pointer"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">
                  Random Seed
                </label>
                <Input
                  type="number"
                  value={randomSeed}
                  onChange={(e) => setRandomSeed(parseInt(e.target.value) || 42)}
                />
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">
                  CV Folds
                </label>
                <Input
                  type="number"
                  value={crossValidation}
                  onChange={(e) => setCrossValidation(parseInt(e.target.value) || 5)}
                />
              </div>
            </div>
          </div>

          {/* Right Column: Preprocessing & Notes */}
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">
                Feature Selection Strategy
              </label>
              <select
                value={featureSelection}
                onChange={(e) => setFeatureSelection(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-border bg-card text-foreground text-xs font-medium focus:ring-2 focus:ring-primary focus:outline-none"
              >
                <option value="all">Use All Selected Features (Default)</option>
                <option value="select_k_best">SelectKBest (Mutual Info / ANOVA)</option>
                <option value="pca">PCA Dimensionality Reduction</option>
              </select>
            </div>

            <div className="pt-1">
              <label className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card cursor-pointer">
                <input
                  type="checkbox"
                  checked={normalization}
                  onChange={(e) => setNormalization(e.target.checked)}
                  className="h-4 w-4 rounded-md border-input accent-primary cursor-pointer"
                />
                <div>
                  <span className="text-xs font-semibold text-foreground block">
                    StandardScaler Feature Normalization
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Scale continuous numeric features to zero mean and unit variance.
                  </span>
                </div>
              </label>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">
                Experiment Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add optional notes for this experiment run..."
                rows={2}
                className="w-full p-2.5 rounded-lg border border-border bg-card text-foreground text-xs focus:ring-2 focus:ring-primary focus:outline-none resize-none"
              />
            </div>
          </div>
        </div>

        {/* Action Trigger Button */}
        <div className="pt-4 border-t border-border/60 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-xs text-muted-foreground">
            Target: <strong className="text-foreground">{selectedTarget || 'None'}</strong> | Input Matrix:{' '}
            <strong className="text-foreground">{selectedFeatures.length} columns</strong>
          </div>

          <Button
            variant="primary"
            size="lg"
            leftIcon="cpu"
            isLoading={isLaunching}
            onClick={handleLaunch}
            className="w-full sm:w-auto shadow-md"
          >
            Launch ML Model Training Job
          </Button>
        </div>
      </CardContent>
    </Card>
  )
})
