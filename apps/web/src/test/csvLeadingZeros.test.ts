/**
 * csvLeadingZeros.test.ts
 * Item 45b — Verify that parseCsvFile (and the underlying inferAndCastColumnTypes)
 * preserves leading zeros in ZIP codes, phone numbers, and ID columns after the
 * dynamicTyping: false fix in csvService.ts.
 *
 * Tests use `inferAndCastColumnTypes` directly (pure function, no file I/O)
 * since PapaParse file parsing requires a real File object.
 */

import { describe, it, expect } from 'vitest'
import { inferAndCastColumnTypes, createDatasetFromParseResults } from '../services/csvService'
import type { Row } from '../types/dataset'

// ---------------------------------------------------------------------------
// Helper: build a minimal PapaParse ParseResult-like object for unit testing
// ---------------------------------------------------------------------------
function makeParseMeta(fields: string[]) {
  return {
    delimiter: ',',
    linebreak: '\n',
    aborted: false,
    truncated: false,
    cursor: 0,
    fields,
  }
}

describe('inferAndCastColumnTypes — leading-zero preservation', () => {
  it('preserves ZIP codes with leading zeros as strings', () => {
    const rows: Row[] = [
      { zip: '02134', name: 'Cambridge' },
      { zip: '07001', name: 'Avenel' },
      { zip: '00501', name: 'Holtsville' },
    ]
    const result = inferAndCastColumnTypes(rows, ['zip', 'name'])
    expect(result[0].zip).toBe('02134')
    expect(result[1].zip).toBe('07001')
    expect(result[2].zip).toBe('00501')
  })

  it('preserves phone numbers with leading zeros as strings', () => {
    const rows: Row[] = [
      { phone: '01234567890', city: 'London' },
      { phone: '09876543210', city: 'Tokyo' },
    ]
    const result = inferAndCastColumnTypes(rows, ['phone', 'city'])
    expect(typeof result[0].phone).toBe('string')
    expect(result[0].phone).toBe('01234567890')
  })

  it('preserves employee IDs with leading zeros as strings (column-level inference)', () => {
    const rows: Row[] = [
      { emp_id: '001', dept: 'Engineering' },
      { emp_id: '042', dept: 'Product' },
      { emp_id: '100', dept: 'Design' },
    ]
    const result = inferAndCastColumnTypes(rows, ['emp_id', 'dept'])
    // '001' has a leading zero → the ENTIRE emp_id column stays as strings
    // (inference is column-level: one leading zero blocks the cast for all rows)
    expect(typeof result[0].emp_id).toBe('string')
    expect(result[0].emp_id).toBe('001')
    expect(typeof result[1].emp_id).toBe('string')
    expect(result[1].emp_id).toBe('042')
    // Even '100' stays as a string because the column failed the numeric check
    expect(typeof result[2].emp_id).toBe('string')
    expect(result[2].emp_id).toBe('100')
  })

  it('correctly casts regular numeric columns to numbers', () => {
    const rows: Row[] = [
      { age: '25', score: '95.5' },
      { age: '30', score: '88.0' },
    ]
    const result = inferAndCastColumnTypes(rows, ['age', 'score'])
    expect(typeof result[0].age).toBe('number')
    expect(result[0].age).toBe(25)
    expect(typeof result[0].score).toBe('number')
    expect(result[0].score).toBe(95.5)
  })

  it('handles mixed-type columns: if any row has a leading zero, the whole column stays as strings', () => {
    const rows: Row[] = [
      { code: '12345' },  // no leading zero
      { code: '07890' },  // leading zero → breaks numeric inference
    ]
    const result = inferAndCastColumnTypes(rows, ['code'])
    // Because row 2 has a leading zero, the column stays string for all rows
    expect(typeof result[0].code).toBe('string')
    expect(typeof result[1].code).toBe('string')
    expect(result[1].code).toBe('07890')
  })

  it('handles null/empty values without crashing', () => {
    const rows: Row[] = [
      { val: null },
      { val: null },   // second null — parser handles undefined as null at the CSV layer
      { val: '' },
      { val: '42' },
    ]
    const result = inferAndCastColumnTypes(rows, ['val'])
    // Last row should be cast to 42, others remain as-is
    expect(result[3].val).toBe(42)
    expect(result[0].val).toBeNull()
  })

  it('returns original rows unchanged when there are no numeric columns', () => {
    const rows: Row[] = [
      { city: 'Paris', country: 'France' },
      { city: 'Berlin', country: 'Germany' },
    ]
    const result = inferAndCastColumnTypes(rows, ['city', 'country'])
    expect(result).toEqual(rows)
  })

  it('returns empty array unchanged', () => {
    expect(inferAndCastColumnTypes([], ['zip'])).toEqual([])
  })

  it('createDatasetFromParseResults preserves leading zeros end-to-end', () => {
    const mockParseResult = {
      data: [
        { zip_code: '02134', population: '100000' },
        { zip_code: '07001', population: '85000' },
      ] as Row[],
      errors: [],
      meta: makeParseMeta(['zip_code', 'population']),
    }
    const dataset = createDatasetFromParseResults(mockParseResult as any, 'test.csv')
    // ZIP codes must be preserved as strings
    expect(dataset.rows[0].zip_code).toBe('02134')
    expect(dataset.rows[1].zip_code).toBe('07001')
    // Population should be cast to number
    expect(dataset.rows[0].population).toBe(100000)
    expect(dataset.rows[1].population).toBe(85000)
    expect(dataset.fileName).toBe('test.csv')
    expect(dataset.columns).toEqual(['zip_code', 'population'])
  })
})
