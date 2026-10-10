import { calculateMajorityBaseline, calculateWilsonInterval } from '../rules/registry'
import { useLearning } from '../context/LearningContext'

interface BaselineDisplayProps {
  taskType?: 'classification' | 'regression'
  modelMetricValue?: number
  modelScore?: number
  baselineScore?: number
  metricName?: string
  classCounts?: Record<string, number>
  totalTestSamples?: number
  testSampleSize?: number
  wilsonInterval?: [number, number]
  className?: string
}

export function BaselineDisplay({
  taskType = 'classification',
  modelMetricValue,
  modelScore,
  baselineScore,
  metricName = 'Accuracy',
  classCounts,
  totalTestSamples,
  testSampleSize,
  wilsonInterval: customWilsonInterval,
  className = '',
}: BaselineDisplayProps) {
  const { learningMode } = useLearning()

  if (!learningMode) return null

  const effectiveScore = modelScore ?? modelMetricValue ?? 0
  const effectiveSamples = testSampleSize ?? totalTestSamples
  const isRegression = taskType === 'regression'

  // Baseline computation (B4)
  const baselineInfo = isRegression
    ? {
        name: 'Mean Predictor (R² = 0.0)',
        val: baselineScore ?? 0.0,
        pct: 0.0,
        explanation: 'A model predicting the average target value achieves R² = 0.0 by definition.',
      }
    : (() => {
        if (baselineScore !== undefined && baselineScore !== null) {
          const pct = Number((baselineScore * 100).toFixed(1))
          return {
            name: `Baseline Predictor (${pct}%)`,
            val: baselineScore,
            pct,
            explanation: `A baseline model achieves ${pct}% ${metricName.toLowerCase()} on this distribution.`,
          }
        }
        const maj = calculateMajorityBaseline(classCounts)
        return {
          name: `Majority Class Baseline (${maj.percentage}%)`,
          val: maj.baselineValue,
          pct: maj.percentage,
          explanation: `A dummy model predicting '${maj.majorityClass || 'majority'}' for every row achieves ${maj.percentage}% ${metricName.toLowerCase()}.`,
        }
      })()

  // Small test set Wilson interval computation (B5)
  const isSmallTestSet = !isRegression && effectiveSamples !== undefined && effectiveSamples > 0 && effectiveSamples < 100
  const wilsonInterval = customWilsonInterval ?? (isSmallTestSet
    ? calculateWilsonInterval(effectiveScore, effectiveSamples)
    : null)

  const barelyBeatsBaseline = !isRegression && effectiveScore <= baselineInfo.val + 0.02

  return (
    <div
      data-testid="baseline-metric-display"
      className={`p-3 rounded-lg border text-xs bg-black/20 ${
        barelyBeatsBaseline && !isRegression
          ? 'border-amber-500/30 bg-amber-950/20 text-amber-200'
          : 'border-white/10 text-foreground/80'
      } ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-muted-foreground">Baseline Reference:</span>
          <span className="font-mono font-medium text-foreground">
            {baselineInfo.name}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">{metricName} Score:</span>
          <span className="font-mono font-bold text-foreground">
            {isRegression ? effectiveScore.toFixed(4) : `${(effectiveScore * 100).toFixed(1)}%`}
          </span>
        </div>
      </div>

      <p className="mt-1 text-[11px] text-muted-foreground leading-tight">
        {baselineInfo.explanation}
      </p>

      {/* Wilson Confidence Interval for small test set (B5) */}
      {wilsonInterval && (
        <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between text-[11px]">
          <span className="text-sky-300">
            📊 95% Wilson Score CI (N={effectiveSamples}):
          </span>
          <span className="font-mono text-sky-200 font-semibold">
            [{(wilsonInterval[0] * 100).toFixed(1)}%, {(wilsonInterval[1] * 100).toFixed(1)}%]
          </span>
        </div>
      )}

      {barelyBeatsBaseline && !isRegression && (
        <p className="mt-1.5 text-[11px] font-medium text-amber-300 bg-amber-500/10 p-1.5 rounded">
          ⚠️ Warning: Model accuracy barely beats the majority-class baseline. Evaluate using Precision, Recall, or Balanced Accuracy.
        </p>
      )}
    </div>
  )
}
