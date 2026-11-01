import { describe, expect, it } from 'vitest'

import {
  formatINR,
  formatINRCompact,
  formatPercent,
  formatSignedINR,
  paiseToAmountInput,
  parseRupeesToPaise,
} from './currency'

describe('parseRupeesToPaise', () => {
  it('parses whole rupees, decimals, and grouped input', () => {
    expect(parseRupeesToPaise('250')).toBe(25_000)
    expect(parseRupeesToPaise('250.5')).toBe(25_050)
    expect(parseRupeesToPaise('250.05')).toBe(25_005)
    expect(parseRupeesToPaise('1,25,000.99')).toBe(12_500_099)
    expect(parseRupeesToPaise(' 12.3 ')).toBe(1_230)
  })

  it('rejects invalid, zero, negative, and over-precise amounts', () => {
    for (const input of ['', '0', '0.00', '-5', 'abc', '12.345', '.5', '12..3']) {
      expect(parseRupeesToPaise(input)).toBeNull()
    }
  })
})

describe('formatINR', () => {
  it('uses Indian digit grouping and always shows paise', () => {
    expect(formatINR(0)).toBe('₹0.00')
    expect(formatINR(25_000)).toBe('₹250.00')
    expect(formatINR(25_005)).toBe('₹250.05')
    expect(formatINR(12_500_099)).toBe('₹1,25,000.99')
    expect(formatINR(1_000_000_000)).toBe('₹1,00,00,000.00')
    expect(formatINR(-25_050)).toBe('-₹250.50')
  })

  it('formats signed and compact amounts', () => {
    expect(formatSignedINR(25_000)).toBe('+₹250.00')
    expect(formatSignedINR(-25_000)).toBe('-₹250.00')
    expect(formatINRCompact(15_000_000)).toBe('₹1.5L')
    expect(formatINRCompact(2_500_000)).toBe('₹25k')
  })

  it('formats percentages without trailing zeroes', () => {
    expect(formatPercent(25)).toBe('25')
    expect(formatPercent(25.55)).toBe('25.6')
  })
})

describe('paiseToAmountInput', () => {
  it('round-trips amounts for the edit form', () => {
    expect(paiseToAmountInput(25_000)).toBe('250')
    expect(paiseToAmountInput(25_005)).toBe('250.05')
    expect(parseRupeesToPaise(paiseToAmountInput(123_456))).toBe(123_456)
  })
})
