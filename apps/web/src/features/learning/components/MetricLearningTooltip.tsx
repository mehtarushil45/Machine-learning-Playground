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
    summary: 'Harmonic mean of precision and recall, balancing false positives and false negatives.',
    formula: '2 * (Precision * Recall) / (Precision + Recall)',
    whenToUse: 'Balances precision and recall tradeoffs on imbalanced targets.',
  },
  f1_score: {
    summary: 'Harmonic mean of precision and recall, balancing false positives and false negatives.',
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

function resolveMetricDefinition(rawKey: string) {
  const normalized = rawKey.toLowerCase().trim()
  if (METRIC_DEFINITIONS[normalized]) {
    return METRIC_DEFINITIONS[normalized]
  }
  const clean = normalized.replace(/[-_\s]/g, '')
  if (clean.includes('f1')) return METRIC_DEFINITIONS['f1']
  if (clean.includes('roc') || clean.includes('auc')) return METRIC_DEFINITIONS['roc_auc']
  if (clean.includes('accuracy') || clean === 'acc') return METRIC_DEFINITIONS['accuracy']
  if (clean.includes('precision') || clean === 'prec') return METRIC_DEFINITIONS['precision']
  if (clean.includes('recall') || clean === 'rec') return METRIC_DEFINITIONS['recall']
  if (clean.includes('r2')) return METRIC_DEFINITIONS['r2']
  if (clean.includes('rmse')) return METRIC_DEFINITIONS['rmse']
  if (clean.includes('mae')) return METRIC_DEFINITIONS['mae']
  if (clean.includes('psi')) return METRIC_DEFINITIONS['psi']
  if (clean.includes('ks')) return METRIC_DEFINITIONS['ks']
  return undefined
}

interface MetricLearningTooltipProps {
  metricKey?: string
  metricName?: string
  label?: string
  position?: 'top' | 'bottom' | 'left' | 'right'
  align?: 'left' | 'center' | 'right'
  children: React.ReactNode
}

export function MetricLearningTooltip({
  metricKey,
  metricName,
  label,
  position = 'bottom',
  align,
  children,
}: MetricLearningTooltipProps) {
  const { learningMode } = useLearning()
  const rawKey = metricKey || metricName || ''
  const def = resolveMetricDefinition(rawKey)

  // If learning mode is off or metric has no educational definition, render children as-is
  if (!learningMode || !def) {
    return <>{children}</>
  }

  // Automatic align heuristic if not explicitly passed:
  // accuracy is usually leftmost -> align="left", roc_auc is usually rightmost -> align="right"
  const resolvedAlign = align || (() => {
    const k = rawKey.toLowerCase()
    if (k.includes('acc')) return 'left'
    if (k.includes('roc') || k.includes('auc')) return 'right'
    return 'center'
  })()

  const tooltipContent = (
    <div
      style={{
        textTransform: 'none',
        letterSpacing: 'normal',
        textAlign: 'left',
      }}
      className="space-y-1.5"
    >
      <div className="font-semibold text-slate-100 text-xs pb-1 border-b border-slate-700/80">
        {label || rawKey.replace(/_/g, ' ').toUpperCase()}
      </div>
      <div className="text-slate-300 text-xs leading-relaxed">
        {def.summary}
      </div>
      {def.formula && (
        <div className="font-mono text-[10px] text-slate-300 bg-slate-900/90 px-1.5 py-0.5 rounded border border-slate-700 inline-block">
          {def.formula}
        </div>
      )}
      <div className="text-slate-400 text-[11px] italic leading-tight">
        {def.whenToUse}
      </div>
    </div>
  )

  return (
    <Tooltip content={tooltipContent} position={position} align={resolvedAlign}>
      <span
        style={{ textDecoration: 'underline dotted rgba(148, 163, 184, 0.6)', textUnderlineOffset: '3px' }}
        className="inline-flex items-center cursor-help"
      >
        {children}
      </span>
    </Tooltip>
  )
}
