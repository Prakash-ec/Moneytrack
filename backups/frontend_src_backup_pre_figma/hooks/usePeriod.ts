import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

import { isValidISODate, todayIST } from '@/utils/dates'
import {
  formatRangeLabel,
  getPresetRange,
  isPeriodPreset,
  type DateRange,
  type PeriodPreset,
} from '@/utils/periods'

interface PeriodState {
  preset: PeriodPreset
  range: DateRange
  label: string
  periodSearch: string
  setPreset: (preset: PeriodPreset) => void
  setCustomRange: (start: string, end: string) => void
}

export function usePeriod(): PeriodState {
  const [params, setParams] = useSearchParams()
  const rawPreset = params.get('period')
  const preset: PeriodPreset = isPeriodPreset(rawPreset) ? rawPreset : 'month'

  let range: DateRange
  if (preset === 'custom') {
    const start = params.get('start') ?? ''
    const end = params.get('end') ?? ''
    if (isValidISODate(start) && isValidISODate(end) && start <= end) {
      range = { start, end }
    } else {
      range = getPresetRange('month')
    }
  } else {
    range = getPresetRange(preset)
  }

  const apply = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(params)
      mutate(next)
      next.delete('page')
      setParams(next, { replace: true })
    },
    [params, setParams],
  )

  const setPreset = useCallback(
    (nextPreset: PeriodPreset) => {
      apply((next) => {
        next.set('period', nextPreset)
        if (nextPreset === 'custom') {
          next.set('start', range.start)
          next.set('end', range.end)
        } else {
          next.delete('start')
          next.delete('end')
        }
      })
    },
    [apply, range.start, range.end],
  )

  const setCustomRange = useCallback(
    (start: string, end: string) => {
      if (!isValidISODate(start) || !isValidISODate(end) || start > end) return
      apply((next) => {
        next.set('period', 'custom')
        next.set('start', start)
        next.set('end', end)
      })
    },
    [apply],
  )

  const periodParams = new URLSearchParams()
  periodParams.set('period', preset)
  if (preset === 'custom') {
    periodParams.set('start', range.start)
    periodParams.set('end', range.end)
  }

  return {
    preset,
    range,
    label: formatRangeLabel(range),
    periodSearch: periodParams.toString(),
    setPreset,
    setCustomRange,
  }
}

export function currentToday(): string {
  return todayIST()
}
