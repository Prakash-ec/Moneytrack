import { describe, expect, it } from 'vitest'

import {
  formatLineItemsSummary,
  getConfidenceBadge,
  validateReceiptFile,
} from './receipt'

describe('validateReceiptFile', () => {
  it('accepts valid JPEG, PNG, and WebP files under 10MB', () => {
    expect(
      validateReceiptFile({ size: 1024 * 1024, type: 'image/jpeg' }),
    ).toEqual({ valid: true })
    expect(
      validateReceiptFile({ size: 5 * 1024 * 1024, type: 'image/png' }),
    ).toEqual({ valid: true })
    expect(
      validateReceiptFile({ size: 9.9 * 1024 * 1024, type: 'image/webp' }),
    ).toEqual({ valid: true })
  })

  it('rejects files larger than 10MB', () => {
    const res = validateReceiptFile({
      size: 11 * 1024 * 1024,
      type: 'image/jpeg',
    })
    expect(res.valid).toBe(false)
    expect(res.error).toContain('Maximum allowed receipt size is 10MB')
  })

  it('rejects unsupported file mime types', () => {
    const res = validateReceiptFile({
      size: 500 * 1024,
      type: 'application/pdf',
    })
    expect(res.valid).toBe(false)
    expect(res.error).toContain('Please choose a JPEG, PNG, or WebP image')
  })
})

describe('getConfidenceBadge', () => {
  it('categorizes confidence scores correctly', () => {
    expect(getConfidenceBadge(0.95)).toEqual({
      label: 'High confidence',
      tone: 'positive',
    })
    expect(getConfidenceBadge(0.8)).toEqual({
      label: 'High confidence',
      tone: 'positive',
    })
    expect(getConfidenceBadge(0.79)).toEqual({
      label: 'Review recommended',
      tone: 'warning',
    })
    expect(getConfidenceBadge(0.5)).toEqual({
      label: 'Review recommended',
      tone: 'warning',
    })
    expect(getConfidenceBadge(0.49)).toEqual({
      label: 'Low confidence',
      tone: 'neutral',
    })
    expect(getConfidenceBadge(0.1)).toEqual({
      label: 'Low confidence',
      tone: 'neutral',
    })
  })
})

describe('formatLineItemsSummary', () => {
  it('formats empty item lists cleanly', () => {
    expect(formatLineItemsSummary([])).toBe('')
  })

  it('formats item list with quantities and amounts', () => {
    const items = [
      { name: 'Cold Brew', quantity: 2, amount_paise: 50000 },
      { name: 'Croissant', quantity: 1, amount_paise: 25000 },
      { name: 'Cookie' },
    ]
    const summary = formatLineItemsSummary(items)
    expect(summary).toBe('Cold Brew x2 (₹500.00), Croissant (₹250.00), Cookie')
  })
})
