import React from 'react'
import { Tooltip } from '../../../components/ui/Tooltip'
import { useLearning } from '../context/LearningContext'

const METRIC_DEFINITIONS: Record<string, { summary: string; formula?: string; whenToUse: string }> = {
  accuracy: {
    summary: 'Proportion of correct predictions across all classes.',
    formula: '(TP + TN) / (Total Samples)',
    whenToUse: 'Useful on balanced classes; misleading on severely imbalanced data.',
  },
  precision: {
    summary: 'Proportion of positive identifications that were actually correct.',
    formula: 'TP / (TP + FP)',
    whenToUse: 'Prioritize when false positives are costly (e.g. spam filtering).',
  },
  recall: {
    summary: 'Proportion of actual positive cases successfully identified.',
    formula: 'TP / (TP + FN)',
    whenToUse: 'Prioritize when false negatives are critical (e.g. cancer diagnosis, fraud).',
  },
  f1: {
    summary: 'Harmonic mean of precision and recall.',
    formula: '2 * (Precision * Recall) / (Precision + Recall)',
    whenToUse: 'Balances precision and recall tradeoffs on imbalanced targets.',
  },
  roc_auc: {
    summary: 'Area under the Receiver Operating Characteristic curve (ranking quality).',
    whenToUse: 'Evaluates model ability to rank positives higher than negatives across all thresholds.',
  },
  pr_auc: {
    summary: 'Area under the Precision-Recall curve.',
    whenToUse: 'Recommended over ROC-AUC when detecting rare minority events (<10%).',
  },
  r2: {
    summary: 'Coefficient of determination: variance explained relative to sample mean.',
    formula: '1 - (SS_res / SS_tot)',
    whenToUse: 'Standard regression benchmark; R² = 0 is equivalent to predicting the mean.',
  },
  rmse: {
    summary: 'Root Mean Squared Error (penalizes large outlier errors more heavily).',
    whenToUse: 'Evaluates continuous prediction error in target units.',
  },
  mae: {
    summary: 'Mean Absolute Error (linear penalty for deviation from truth).',
    whenToUse: 'Robust regression error metric less sensitive to extreme outliers than RMSE.',
  },
  psi: {
    summary: 'Population Stability Index measuring feature distribution shift.',
    whenToUse: 'PSI > 0.25 indicates significant data drift requiring retraining.',
  },
  ks: {
    summary: 'Kolmogorov-Smirnov test p-value comparing cumulative distributions.',
    whenToUse: 'p < 0.01 suggests production inputs diverge from training baseline.',
  },
  ks_test: {
    summary: 'Kolmogorov-Smirnov test comparing production feature distribution against training baseline.',
    whenToUse: 'p-value < 0.05 indicates significant distribution drift between training and inference.',
  },
}

interface MetricLearningTooltipProps {
  metricKey?: string
  metricName?: string
  label?: string
  children: React.ReactNode
}

export function MetricLearningTooltip({
  metricKey,
  metricName,
  label,
  children,
}: MetricLearningTooltipProps) {
  const { learningMode } = useLearning()
  const key = (metricKey || metricName || '').toLowerCase()
  const def = METRIC_DEFINITIONS[key]

  // If learning mode is off or metric has no custom educational def, render children as-is
  if (!learningMode || !def) {
    return <>{children}</>
  }

  const tooltipContent = (
    <div className="max-w-xs p-1 text-[11px] leading-tight space-y-1">
      <div className="font-semibold text-amber-300">
        💡 {label || (metricKey || metricName || key).toUpperCase()}
      </div>
      <div className="text-foreground/90">{def.summary}</div>
      {def.formula && (
        <div className="font-mono text-[10px] text-muted-foreground bg-black/40 px-1 py-0.5 rounded">
          {def.formula}
        </div>
      )}
      <div className="text-muted-foreground italic">{def.whenToUse}</div>
    </div>
  )

  return (
    <Tooltip content={tooltipContent} position="top">
      <span className="inline-flex items-center cursor-help underline decoration-dotted decoration-amber-400/60 underline-offset-2">
        {children}
      </span>
    </Tooltip>
  )
}
