/**
 * A single row from a parsed CSV file.
 * PapaParse with dynamicTyping:true can produce numbers, booleans, strings,
 * or null for each cell, so we reflect that here.
 */
export type CellValue = string | number | boolean | null

export interface Row {
  [column: string]: CellValue
}

export interface Dataset {
  /** All rows parsed from the CSV file. */
  rows: Row[]
  /** Ordered list of column names (from the CSV header). */
  columns: string[]
  /** Original filename supplied by the browser. */
  fileName: string
}
