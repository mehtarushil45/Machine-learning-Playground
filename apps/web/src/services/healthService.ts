import type { DatasetProfile, DatasetHealthReport, HealthIssue } from '../types/dataset'

import { apiClient } from './apiClient'

export async function fetchDatasetHealth(
  datasetId: string,
  signal?: AbortSignal,
): Promise<DatasetHealthReport | null> {
  try {
    return await apiClient.get<DatasetHealthReport>(`/datasets/${datasetId}/health`, { signal })
  } catch {
    return null
  }
}

/**
 * Computes a client-side dataset health report from DatasetProfile (single source of truth).
 */
export function computeClientHealth(profile: DatasetProfile): DatasetHealthReport {
  let deductions = 0.0
  const warnings: string[] = []
  const recommendations: string[] = []
  const issues: HealthIssue[] = []

  const totalCells = profile.row_count * profile.column_count
  const rowCount = profile.row_count

  // 1. Missing Values
  if (totalCells > 0 && profile.total_missing_values > 0) {
    const missingPct = (profile.total_missing_values / totalCells) * 100
    deductions += Math.min(30, missingPct * 1.0)
    warnings.push(`${profile.total_missing_values} missing cells detected across dataset (${missingPct.toFixed(1)}%).`)
  }

  const highMissingCols: string[] = []
  profile.columns.forEach((col) => {
    if (col.missing_percentage >= 100) {
      issues.push({
        severity: 'critical',
        message: `Column '${col.name}' is 100% empty.`,
        column_name: col.name,
      })
    } else if (col.missing_percentage > 50) {
      highMissingCols.push(col.name)
      deductions += 10.0
      issues.push({
        severity: 'high',
        message: `Column '${col.name}' has very high missingness (${col.missing_percentage.toFixed(1)}%).`,
        column_name: col.name,
      })
    }
  })

  if (highMissingCols.length > 0) {
    recommendations.push(`Consider dropping or imputing columns with >50% missingness: ${highMissingCols.join(', ')}.`)
  }

  // 2. Duplicate Rows
  if (profile.duplicate_rows > 0) {
    const dupPct = rowCount > 0 ? (profile.duplicate_rows / rowCount) * 100 : 0
    deductions += Math.min(20, 2.0 + dupPct * 0.5)
    issues.push({
      severity: dupPct < 5 ? 'warning' : 'high',
      message: `Duplicate rows detected: ${profile.duplicate_rows} rows (${dupPct.toFixed(1)}%) are identical.`,
    })
    warnings.push(`${profile.duplicate_rows} duplicate rows detected.`)
    recommendations.push('Deduplicate dataset rows before splitting train/test sets to prevent data leakage.')
  }

  // 3. Duplicate Columns
  if (profile.duplicate_columns > 0) {
    deductions += profile.duplicate_columns * 5.0
    issues.push({
      severity: 'high',
      message: `${profile.duplicate_columns} duplicate column names or identical series detected.`,
    })
    recommendations.push('Rename or remove redundant duplicate columns.')
  }

  // 4. Empty Columns
  if (profile.empty_columns > 0) {
    deductions += profile.empty_columns * 15.0
    warnings.push(`${profile.empty_columns} column(s) contain 100% missing values.`)
    recommendations.push('Remove completely empty columns from the feature matrix.')
  }

  // 5. Constant Columns
  const constantCols: string[] = []
  profile.columns.forEach((col) => {
    if (col.unique === 1 && col.missing < rowCount) {
      constantCols.push(col.name)
      deductions += 5.0
      issues.push({
        severity: 'warning',
        message: `Column '${col.name}' is constant (zero variance, 1 unique value).`,
        column_name: col.name,
      })
    }
  })

  if (constantCols.length > 0) {
    recommendations.push(`Remove zero-variance constant columns: ${constantCols.join(', ')}.`)
  }

  // 6. Identifier Columns
  const idCols = profile.columns.filter((c) => c.type === 'identifier').map((c) => c.name)
  if (idCols.length > 0) {
    issues.push({
      severity: 'info',
      message: `Identifier columns detected: ${idCols.join(', ')}.`,
    })
    recommendations.push(`Exclude primary key/identifier columns from model features: ${idCols.join(', ')}.`)
  }

  // Final score clamping
  const finalScore = Math.max(0, Math.min(100, Math.round(100 - deductions)))

  let grade: DatasetHealthReport['grade']
  let summary: string

  if (finalScore >= 95) {
    grade = 'Excellent'
    summary = 'Dataset is in excellent condition and ready for machine learning model training.'
  } else if (finalScore >= 85) {
    grade = 'Good'
    summary = 'Dataset is suitable for machine learning with minor data quality considerations.'
  } else if (finalScore >= 70) {
    grade = 'Fair'
    summary = 'Dataset has moderate quality issues that may require cleaning prior to modeling.'
  } else if (finalScore >= 50) {
    grade = 'Poor'
    summary = 'Dataset contains significant missingness or duplication that impacts model quality.'
  } else {
    grade = 'Critical'
    summary = 'Dataset has critical quality defects and is not recommended for training without remediation.'
  }

  if (warnings.length === 0) {
    warnings.push('No major quality warnings detected.')
  }
  if (recommendations.length === 0) {
    recommendations.push('Dataset features are well-formatted for ML experimentation.')
  }

  return {
    dataset_id: profile.dataset_id,
    filename: profile.filename,
    health_score: finalScore,
    grade,
    summary,
    warnings,
    recommendations,
    issues,
  }
}
