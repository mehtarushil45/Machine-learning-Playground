import Papa from 'papaparse'
import type { ParseResult } from 'papaparse'
import type { Dataset, Row } from '../types/dataset'
import { validateParsedCsv } from '../utils/validation'

/**
 * Post-parse type inference step.
 * Converts only clearly numeric columns to numbers while preserving string-formatted
 * identifiers like ZIP codes ("02134") and phone numbers ("0123456789").
 */
export function inferAndCastColumnTypes(rows: Row[], columns: string[]): Row[] {
  if (!rows || rows.length === 0) return rows

  const numericColumns = new Set<string>()

  for (const col of columns) {
    let hasNonNullValue = false
    let isNumeric = true

    for (const row of rows) {
      const val = row[col]
      if (val === null || val === undefined || val === '') {
        continue
      }

      const strVal = String(val).trim()
      if (strVal === '') continue

      hasNonNullValue = true

      // 1. If value has a leading zero (>1 char, starts with '0', not '0.'),
      // it is a padded identifier/ZIP code/phone number => preserve as string!
      if (strVal.length > 1 && strVal.startsWith('0') && !strVal.startsWith('0.')) {
        isNumeric = false
        break
      }

      // 2. Check if string matches standard numeric integer/float syntax
      if (!/^-?\d+(\.\d+)?$/.test(strVal) && !/^-?\d+(\.\d+)?[eE][+-]?\d+$/.test(strVal)) {
        isNumeric = false
        break
      }

      // 3. Ensure Number(strVal) is a valid finite number
      const num = Number(strVal)
      if (isNaN(num) || !isFinite(num)) {
        isNumeric = false
        break
      }
    }

    if (hasNonNullValue && isNumeric) {
      numericColumns.add(col)
    }
  }

  if (numericColumns.size === 0) return rows

  return rows.map((row) => {
    const newRow: Row = { ...row }
    for (const col of columns) {
      if (numericColumns.has(col)) {
        const val = row[col]
        if (val !== null && val !== undefined && val !== '') {
          const strVal = String(val).trim()
          if (strVal !== '') {
            newRow[col] = Number(strVal)
          }
        }
      }
    }
    return newRow
  })
}

export function createDatasetFromParseResults(
  results: ParseResult<Row>,
  fileName: string,
): Dataset {
  const columns = results.meta.fields ?? []
  const processedRows = inferAndCastColumnTypes(results.data, columns)
  return {
    rows: processedRows,
    columns,
    fileName,
  }
}

export function parseCsvFile(file: File): Promise<Dataset> {
  return new Promise((resolve, reject) => {
    Papa.parse<Row>(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false, // Disabled to preserve leading zeros in ZIP codes & phone numbers
      complete: (results) => {
        const validation = validateParsedCsv(results)
        if (!validation.valid) {
          reject(new Error(validation.message))
          return
        }

        resolve(createDatasetFromParseResults(results, file.name))
      },
      error: () => {
        reject(new Error('Unable to read the CSV file.'))
      },
    })
  })
}
