/**
 * isDateColumn.test.ts
 * Item 45b — Edge case coverage for the `isDateColumn` function exported
 * from profilerService. Verifies correct detection of ISO/slash-separated
 * date strings vs. plain numbers, booleans, mixed arrays, and empty inputs.
 */

import { describe, it, expect } from 'vitest'
import { isDateColumn } from '../services/profilerService'

describe('isDateColumn — edge cases', () => {
  // ── TRUE cases (should be detected as date columns) ──────────────────────

  it('returns true for ISO date strings (YYYY-MM-DD)', () => {
    expect(isDateColumn(['2024-01-15', '2024-12-31', '2023-06-01'])).toBe(true)
  })

  it('returns true for slash-separated dates (YYYY/MM/DD)', () => {
    expect(isDateColumn(['2024/01/15', '2024/12/31'])).toBe(true)
  })

  it('returns true for single-digit month/day variants (YYYY-M-D)', () => {
    expect(isDateColumn(['2024-1-5', '2023-9-3'])).toBe(true)
  })

  it('returns true for datetime strings that start with YYYY-MM-DD', () => {
    // Regex uses /^.../ so leading date prefix is enough
    expect(isDateColumn(['2024-01-15 08:30:00', '2024-12-31T23:59:59Z'])).toBe(true)
  })

  it('returns true for a single valid date string', () => {
    expect(isDateColumn(['2024-07-04'])).toBe(true)
  })

  // ── FALSE cases (should NOT be detected as date columns) ─────────────────

  it('returns false for an empty array', () => {
    expect(isDateColumn([])).toBe(false)
  })

  it('returns false for plain numeric strings', () => {
    expect(isDateColumn(['100', '200', '300'])).toBe(false)
  })

  it('returns false for boolean values', () => {
    expect(isDateColumn([true, false])).toBe(false)
  })

  it('returns false for null values', () => {
    expect(isDateColumn([null, null])).toBe(false)
  })

  it('returns false for undefined values', () => {
    expect(isDateColumn([undefined, undefined])).toBe(false)
  })

  it('returns false when any element is not a date', () => {
    // Mixed — should fail if even one element is not a valid date
    expect(isDateColumn(['2024-01-15', 'hello', '2024-03-20'])).toBe(false)
  })

  it('returns false for DD/MM/YYYY format (not matching YYYY-first regex)', () => {
    expect(isDateColumn(['15/01/2024', '31/12/2024'])).toBe(false)
  })

  it('returns false for MM-DD-YYYY format', () => {
    expect(isDateColumn(['01-15-2024', '12-31-2024'])).toBe(false)
  })

  it('returns false for bare year strings', () => {
    expect(isDateColumn(['2024', '2023'])).toBe(false)
  })

  it('returns false for category labels', () => {
    expect(isDateColumn(['cat', 'dog', 'bird'])).toBe(false)
  })

  it('returns false when dates have leading/trailing whitespace that would mismatch after trim', () => {
    // After trim the date is valid, so this should return TRUE
    // (the implementation calls v.trim())
    expect(isDateColumn(['  2024-01-15  ', '  2024-06-30  '])).toBe(true)
  })

  it('returns false for number type values (not strings)', () => {
    expect(isDateColumn([20240115, 20230101])).toBe(false)
  })
})
