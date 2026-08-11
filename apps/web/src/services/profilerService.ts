import type { Dataset, DatasetProfile, ColumnProfile } from '../types/dataset'

import { apiClient } from './apiClient'

export async function fetchDatasetProfile(datasetId: string, signal?: AbortSignal): Promise<DatasetProfile | null> {
  try {
    return await apiClient.get<DatasetProfile>(`/datasets/${datasetId}/profile`, { signal })
  } catch {
    return null
  }
}

/**
 * Computes a client-side dataset profile matching the backend profiler schema.
 * Guarantees zero latency and offline capability.
 */
export function computeClientProfile(dataset: Dataset): DatasetProfile {
  const rowCount = dataset.rows.length
  const colCount = dataset.columns.length

  let totalMissing = 0
  let emptyColumns = 0

  // 1. Calculate Duplicate Rows
  const rowStrings = dataset.rows.map((r) =>
    dataset.columns.map((c) => String(r[c] ?? '')).join('\x1f'),
  )
  const uniqueRowStrings = new Set(rowStrings)
  const duplicateRows = rowCount > 0 ? rowCount - uniqueRowStrings.size : 0

  // 2. Calculate Duplicate Columns using Fingerprint Hash Map & Sampling
  const duplicateColumns = detectDuplicateColumns(dataset)

  // 3. Column Analysis
  const columnsProfile: ColumnProfile[] = dataset.columns.map((colName) => {
    const rawVals = dataset.rows.map((r) => r[colName])
    const missingCnt = rawVals.filter(
      (v) => v === null || v === undefined || v === '' || v === 'N/A' || v === 'NaN',
    ).length

    totalMissing += missingCnt
    if (missingCnt === rowCount) {
      emptyColumns++
    }

    const nonMissing = rawVals.filter(
      (v) => v !== null && v !== undefined && v !== '' && v !== 'N/A' && v !== 'NaN',
    )
    const uniqueValues = Array.from(new Set(nonMissing.map((v) => String(v))))

    // Type Inference
    const numVals: number[] = []
    let isAllBool = true
    const isAllDate = isDateColumn(nonMissing)

    for (const v of nonMissing) {
      if (typeof v === 'number') {
        numVals.push(v)
      } else if (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) {
        numVals.push(Number(v))
      }

      if (typeof v !== 'boolean' && !['true', 'false', '0', '1', 'yes', 'no'].includes(String(v).toLowerCase())) {
        isAllBool = false
      }
    }

    const isNumeric = numVals.length > 0 && numVals.length === nonMissing.length
    const colNameLower = colName.toLowerCase()

    let type: string = 'text'
    if (isNumeric) {
      if (
        (colNameLower.includes('id') || colNameLower.endsWith('_pk')) &&
        uniqueValues.length === nonMissing.length
      ) {
        type = 'identifier'
      } else {
        type = 'numeric'
      }
    } else if (isAllBool && nonMissing.length > 0) {
      type = 'boolean'
    } else if (isAllDate && nonMissing.length > 0) {
      type = 'datetime'
    } else if (
      (colNameLower.includes('id') || colNameLower.includes('uuid')) &&
      uniqueValues.length === nonMissing.length
    ) {
      type = 'identifier'
    } else if (uniqueValues.length <= 50 || uniqueValues.length / (nonMissing.length || 1) <= 0.5) {
      type = 'categorical'
    }

    // Statistics Calculation
    const statistics: ColumnProfile['statistics'] = {}

    if (type === 'numeric' && numVals.length > 0) {
      const min = Math.min(...numVals)
      const max = Math.max(...numVals)
      const mean = numVals.reduce((a, b) => a + b, 0) / numVals.length
      const sorted = [...numVals].sort((a, b) => a - b)
      const median =
        sorted.length % 2 === 1
          ? sorted[Math.floor(sorted.length / 2)]
          : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2

      const variance =
        numVals.length > 1
          ? numVals.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (numVals.length - 1)
          : 0
      const std = Math.sqrt(variance)

      statistics.min = Number(min.toFixed(4))
      statistics.max = Number(max.toFixed(4))
      statistics.mean = Number(mean.toFixed(4))
      statistics.median = Number(median.toFixed(4))
      statistics.variance = Number(variance.toFixed(4))
      statistics.std = Number(std.toFixed(4))
    } else {
      statistics.cardinality = uniqueValues.length
      statistics.sample_values = uniqueValues.slice(0, 5)

      const freqMap: Record<string, number> = {}
      for (const v of nonMissing) {
        const key = String(v)
        freqMap[key] = (freqMap[key] || 0) + 1
      }
      let topKey: string | null = null
      let topCount = 0
      for (const [k, count] of Object.entries(freqMap)) {
        if (count > topCount) {
          topKey = k
          topCount = count
        }
      }
      statistics.most_frequent_value = topKey
      statistics.frequency_count = topCount
    }

    const missingPct = rowCount > 0 ? Number(((missingCnt / rowCount) * 100).toFixed(2)) : 0

    return {
      name: colName,
      type,
      nullable: missingCnt > 0,
      missing: missingCnt,
      missing_percentage: missingPct,
      unique: uniqueValues.length,
      duplicate_count: rowCount - uniqueValues.length,
      statistics,
    }
  })

  // Estimate memory usage
  const approxBytes = dataset.rows.reduce(
    (acc, row) => acc + JSON.stringify(row).length,
    0,
  )

  return {
    dataset_id: dataset.datasetId || `ds-${Date.now().toString(36)}`,
    filename: dataset.fileName,
    row_count: rowCount,
    column_count: colCount,
    memory_usage_bytes: approxBytes,
    duplicate_rows: duplicateRows,
    duplicate_columns: duplicateColumns,
    empty_columns: emptyColumns,
    total_missing_values: totalMissing,
    columns: columnsProfile,
  }
}

function isDateColumn(vals: unknown[]): boolean {
  if (vals.length === 0) return false
  const dateRegex = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}/
  return vals.every((v) => typeof v === 'string' && dateRegex.test(v.trim()))
}

/**
 * Detects duplicate columns in a dataset using column value fingerprints and a hash map.
 * Efficiently handles large datasets by sampling up to `maxSampleRows`.
 * Returns the count of duplicate columns (columns with identical values to an earlier column).
 */
export function detectDuplicateColumns(dataset: Dataset, maxSampleRows: number = 1000): number {
  const rowCount = dataset.rows.length
  const colCount = dataset.columns.length

  if (colCount <= 1 || rowCount === 0) {
    return 0
  }

  // Determine row indices to sample for fingerprint computation
  const sampledIndices: number[] = []
  if (rowCount <= maxSampleRows) {
    for (let i = 0; i < rowCount; i++) {
      sampledIndices.push(i)
    }
  } else {
    // Uniformly sample maxSampleRows across the dataset
    const step = rowCount / maxSampleRows
    for (let i = 0; i < maxSampleRows; i++) {
      sampledIndices.push(Math.floor(i * step))
    }
  }

  // Hash Map: Fingerprint String -> First Column Name encountered with this fingerprint
  const fingerprintMap = new Map<string, string>()
  let duplicateCount = 0

  for (const colName of dataset.columns) {
    // Generate canonical string fingerprint for this column across sampled rows
    const sampledValues: string[] = new Array(sampledIndices.length)
    for (let i = 0; i < sampledIndices.length; i++) {
      const val = dataset.rows[sampledIndices[i]][colName]
      sampledValues[i] = val === null || val === undefined ? '\x00' : String(val)
    }
    const fingerprint = sampledValues.join('\x1f')

    if (fingerprintMap.has(fingerprint)) {
      // If sampling was used, perform full row verification against candidate original column
      const existingCol = fingerprintMap.get(fingerprint)!
      let isExactDuplicate = true

      if (rowCount > maxSampleRows) {
        for (let r = 0; r < rowCount; r++) {
          const v1 = dataset.rows[r][colName]
          const v2 = dataset.rows[r][existingCol]
          if (v1 !== v2 && String(v1 ?? '') !== String(v2 ?? '')) {
            isExactDuplicate = false
            break
          }
        }
      }

      if (isExactDuplicate) {
        duplicateCount++
      } else {
        // Sample collision, store under composite key
        fingerprintMap.set(`${fingerprint}_${colName}`, colName)
      }
    } else {
      fingerprintMap.set(fingerprint, colName)
    }
  }

  return duplicateCount
}
