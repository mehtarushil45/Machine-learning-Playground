import type { ParseResult } from 'papaparse'

export interface ValidationResult {
  valid: boolean
  message?: string
}

export const MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024 // 50 MB

export function validateCsvFile(file: File): ValidationResult {
  if (!file.name.toLowerCase().endsWith('.csv')) {
    return {
      valid: false,
      message: 'Unsupported file format. Please upload a valid CSV (.csv) file.',
    }
  }

  if (file.size === 0) {
    return {
      valid: false,
      message: 'Uploaded file is empty (0 bytes). Please upload a file with tabular data.',
    }
  }

  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return {
      valid: false,
      message: `File size exceeds maximum allowed limit of 50 MB (${formatBytes(file.size)}).`,
    }
  }

  return { valid: true }
}

export function validateParsedCsv(results: ParseResult<unknown>): ValidationResult {
  if (!results.data || !results.data.length || !results.meta.fields?.length) {
    return {
      valid: false,
      message: 'The CSV file is empty, missing a header row, or contains no data rows.',
    }
  }

  return { valid: true }
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}
