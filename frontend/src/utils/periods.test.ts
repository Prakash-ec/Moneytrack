import { describe, expect, it } from 'vitest'

import {
  formatRangeLabel,
  getPresetRange,
  isPeriodPreset,
  rangeLength,
  suggestedGranularity,
} from './periods'

const today = '2026-10-22'

describe('getPresetRange', () => {
  it('builds today, yesterday, and week ranges', () => {
    expect(getPresetRange('today', today)).toEqual({ start: today, end: today })
    expect(getPresetRange('yesterday', today)).toEqual({
      start: '2026-10-21',
      end: '2026-10-21',
    })
    expect(getPresetRange('week', today)).toEqual({ start: '2026-10-19', end: today })
  })

  it('builds month, previous month, rolling, and year ranges', () => {
    expect(getPresetRange('month', today)).toEqual({ start: '2026-10-01', end: today })
    expect(getPresetRange('last_month', today)).toEqual({
      start: '2026-09-01',
      end: '2026-09-30',
    })
    expect(getPresetRange('last_30', today)).toEqual({ start: '2026-09-23', end: today })
    expect(getPresetRange('year', today)).toEqual({ start: '2026-01-01', end: today })
  })

  it('starts weeks on Monday and handles Sunday', () => {
    expect(getPresetRange('week', '2026-10-25')).toEqual({
      start: '2026-10-19',
      end: '2026-10-25',
    })
  })

  it('handles February in a non-leap year', () => {
    expect(getPresetRange('last_month', '2026-03-15')).toEqual({
      start: '2026-02-01',
      end: '2026-02-28',
    })
  })
})

describe('period metadata', () => {
  it('validates presets', () => {
    expect(isPeriodPreset('month')).toBe(true)
    expect(isPeriodPreset('custom')).toBe(true)
    expect(isPeriodPreset('forever')).toBe(false)
    expect(isPeriodPreset(null)).toBe(false)
  })

  it('counts inclusive days and formats ranges', () => {
    expect(rangeLength({ start: '2026-10-01', end: '2026-10-01' })).toBe(1)
    expect(formatRangeLabel({ start: '2026-10-22', end: '2026-10-22' })).toBe('22 Oct 2026')
    expect(formatRangeLabel({ start: '2026-10-01', end: '2026-10-22' })).toContain('–')
  })

  it('suggests a readable granularity for the range length', () => {
    expect(suggestedGranularity({ start: today, end: today })).toBe('daily')
    expect(suggestedGranularity({ start: '2026-01-01', end: '2026-05-31' })).toBe('weekly')
    expect(suggestedGranularity({ start: '2025-01-01', end: '2026-01-01' })).toBe('monthly')
  })
})
