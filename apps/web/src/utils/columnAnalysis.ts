import type { Row, CellValue } from '../types/dataset'

function isMissing(value: CellValue): boolean {
  return value === null || value === undefined || value === ''
}

export function isNumericColumn(column: string, rows: Row[]): boolean {
  let hasNonMissingValue = false

  for (const row of rows) {
    const value = row[column]

    if (isMissing(value)) {
      continue
    }

    hasNonMissingValue = true

    if (typeof value !== 'number' || Number.isNaN(value)) {
      return false
    }
  }

  return hasNonMissingValue
}

export function getNumericColumns(columns: string[], rows: Row[]): string[] {
  return columns.filter((column) => isNumericColumn(column, rows))
}
