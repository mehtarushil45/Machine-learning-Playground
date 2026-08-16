import { memo, useState, useEffect, useMemo } from 'react'
import type { Dataset, DatasetRecommendations } from '../../types/dataset'
import {
  CANONICAL_TRAINING_OPTIONS,
  type TrainingOptions,
  type TrainingRequestPayload,
} from '../../types/job'
import { fetchTrainingOptions } from '../../services/jobService'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Badge } from '../../components/ui/Badge'
import { Icon } from '../../components/ui/Icon'
import { Select } from '../../components/ui/Select'

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
  const [algorithm, setAlgorithm] = useState<string>('random_forest_classifier')
  const [scaler, setScaler] = useState<string>('standard_scaler')
  const [imputer, setImputer] = useState<string>('median')
  const [trainTestSplit, setTrainTestSplit] = useState<number>(0.8)
  const [randomSeed, setRandomSeed] = useState<number>(42)
  const [crossValidation, setCrossValidation] = useState<number>(5)
  const [featureSelection, setFeatureSelection] = useState<string>('all')
  const [notes, setNotes] = useState<string>('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [trainingOptions, setTrainingOptions] = useState<TrainingOptions>(CANONICAL_TRAINING_OPTIONS)

  useEffect(() => {
    const controller = new AbortController()

    fetchTrainingOptions(controller.signal)
      .then((data) => {
        if (data && data.algorithms?.length > 0) {
          setTrainingOptions(data)
          if (data.default_cv_folds) setCrossValidation(data.default_cv_folds)
          if (data.default_train_test_split) setTrainTestSplit(data.default_train_test_split)
          setScaler((current) => data.scalers.some((option) => option.key === current) ? current : data.scalers[0]?.key || 'standard_scaler')
          setImputer((current) => data.imputers.some((option) => option.key === current) ? current : data.imputers[0]?.key || 'median')
        }
      })
      .catch((err) => {
        if (err instanceof Error && (err.name === 'AbortError' || err.name === 'CanceledError')) {
          return
        }
        console.warn('Failed to load training options:', err)
      })

    return () => {
      controller.abort()
    }
  }, [])

  const taskType = recommendations?.recommended_problem_type === 'Regression' ? 'regression' : 'classification'
  const taskAlgorithms = useMemo(
    () => trainingOptions.algorithms.filter((option) => option.task_type === taskType),
    [taskType, trainingOptions.algorithms],
  )
  const effectiveAlgorithm = trainingOptions.algorithms.some((option) => option.key === algorithm)
    ? algorithm
    : taskAlgorithms[0]?.key || (taskType === 'classification' ? 'random_forest_classifier' : 'random_forest_regressor')

  const effectiveScaler = trainingOptions.scalers.some((option) => option.key === scaler)
    ? scaler
    : trainingOptions.scalers[0]?.key || 'standard_scaler'

  const effectiveImputer = trainingOptions.imputers.some((option) => option.key === imputer)
    ? imputer
    : trainingOptions.imputers[0]?.key || 'median'

  const algorithmOptions = useMemo(() => {
    const classificationOptions = trainingOptions.algorithms
      .filter((option) => option.task_type === 'classification')
      .map((option) => ({ value: option.key, label: option.display_name }))

    const regressionOptions = trainingOptions.algorithms
      .filter((option) => option.task_type === 'regression')
      .map((option) => ({ value: option.key, label: option.display_name }))

    const groups: { label: string; options: { value: string; label: string }[] }[] = []
    if (classificationOptions.length > 0) {
      groups.push({
        label: 'Classification',
        options: classificationOptions,
      })
    }
    if (regressionOptions.length > 0) {
      groups.push({
        label: 'Regression',
        options: regressionOptions,
      })
    }
    return groups
  }, [trainingOptions.algorithms])
  const scalerOptions = useMemo(
    () => trainingOptions.scalers.map((option) => ({ value: option.key, label: option.display_name })),
    [trainingOptions.scalers],
  )
  const imputerOptions = useMemo(
    () => trainingOptions.imputers.map((option) => ({ value: option.key, label: option.display_name })),
    [trainingOptions.imputers],
  )

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

    const launchAlgo = effectiveAlgorithm
    const launchScaler = effectiveScaler
    const launchImputer = effectiveImputer

    if (!launchAlgo || !launchScaler || !launchImputer) {
      setValidationError('Choose an algorithm, scaler, and imputer before launching.')
      return
    }

    const payload: TrainingRequestPayload = {
      dataset_id: dataset.datasetId || `ds-${dataset.fileName}`,
      target_column: selectedTarget,
      feature_columns: selectedFeatures,
      algorithm: launchAlgo,
      scaler: launchScaler,
      imputer: launchImputer,
      train_test_split: Number(trainTestSplit),
      random_seed: Number(randomSeed),
      cross_validation: Number(crossValidation),
      normalization: true,
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
              <Select
                value={effectiveAlgorithm}
                onChange={setAlgorithm}
                options={algorithmOptions}
                placeholder="Select algorithm..."
              />
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

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">
                  Feature Scaler
                </label>
                <Select value={effectiveScaler} onChange={setScaler} options={scalerOptions} placeholder="Select scaler..." />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">
                  Missing-value Imputer
                </label>
                <Select value={effectiveImputer} onChange={setImputer} options={imputerOptions} placeholder="Select imputer..." />
              </div>
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
