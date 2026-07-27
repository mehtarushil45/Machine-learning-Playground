import type { ParseResult } from 'papaparse'

interface ValidationResult {
  valid: boolean
  message?: string
}

export function validateCsvFile(file: File): ValidationResult {
  if (!file.name.toLowerCase().endsWith('.csv')) {
    return {
      valid: false,
      message: 'Please upload a valid CSV file.',
    }
  }

  return { valid: true }
}

export function validateParsedCsv(results: ParseResult<unknown>): ValidationResult {
  if (!results.data.length || !results.meta.fields?.length) {
    return {
      valid: false,
      message: 'The CSV file is empty or invalid.',
    }
  }

  return { valid: true }
}
