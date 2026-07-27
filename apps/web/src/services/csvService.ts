import Papa from 'papaparse'
import type { ParseResult } from 'papaparse'
import type { Dataset, Row } from '../types/dataset'
import { validateParsedCsv } from '../utils/validation'

export function createDatasetFromParseResults(
  results: ParseResult<Row>,
  fileName: string,
): Dataset {
  return {
    rows: results.data,
    columns: results.meta.fields ?? [],
    fileName,
  }
}

export function parseCsvFile(file: File): Promise<Dataset> {
  return new Promise((resolve, reject) => {
    Papa.parse<Row>(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
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
