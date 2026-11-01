import { addDays, daysBetween, formatDate, startOfWeek, todayIST } from '@/utils/dates'

export type PeriodPreset =
  | 'today'
  | 'yesterday'
  | 'week'
  | 'month'
  | 'last_month'
  | 'last_30'
  | 'year'
  | 'custom'

export interface DateRange {
  start: string
  end: string
}

export const PERIOD_OPTIONS: Array<{ value: PeriodPreset; label: string; shortLabel: string }> = [
  { value: 'today', label: 'Today', shortLabel: 'Today' },
  { value: 'yesterday', label: 'Yesterday', shortLabel: 'Yesterday' },
  { value: 'week', label: 'This week', shortLabel: 'Week' },
  { value: 'month', label: 'This month', shortLabel: 'Month' },
  { value: 'last_month', label: 'Last month', shortLabel: 'Last month' },
  { value: 'last_30', label: 'Last 30 days', shortLabel: '30 days' },
  { value: 'year', label: 'This year', shortLabel: 'Year' },
  { value: 'custom', label: 'Custom range', shortLabel: 'Custom' },
]

export function isPeriodPreset(value: string | null): value is PeriodPreset {
  return PERIOD_OPTIONS.some((option) => option.value === value)
}

export function getPresetRange(preset: Exclude<PeriodPreset, 'custom'>, today = todayIST()): DateRange {
  switch (preset) {
    case 'today':
      return { start: today, end: today }
    case 'yesterday': {
      const yesterday = addDays(today, -1)
      return { start: yesterday, end: yesterday }
    }
    case 'week':
      return { start: startOfWeek(today), end: today }
    case 'month':
      return { start: `${today.slice(0, 7)}-01`, end: today }
    case 'last_month': {
      const firstOfThisMonth = parseISODateUTC(`${today.slice(0, 7)}-01`)
      const lastOfPrevious = new Date(firstOfThisMonth.getTime() - 86_400_000)
      const start = `${lastOfPrevious.getUTCFullYear()}-${String(
        lastOfPrevious.getUTCMonth() + 1,
      ).padStart(2, '0')}-01`
      const end = new Date(Date.UTC(lastOfPrevious.getUTCFullYear(), lastOfPrevious.getUTCMonth() + 1, 0))
      const endISO = `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(
        2,
        '0',
      )}-${String(end.getUTCDate()).padStart(2, '0')}`
      return { start, end: endISO }
    }
    case 'last_30':
      return { start: addDays(today, -29), end: today }
    case 'year':
      return { start: `${today.slice(0, 4)}-01-01`, end: today }
  }
}

function parseISODateUTC(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

export function formatRangeLabel(range: DateRange): string {
  if (range.start === range.end) return formatDate(range.start)
  return `${formatDate(range.start)} – ${formatDate(range.end)}`
}

export function rangeLength(range: DateRange): number {
  return daysBetween(range.start, range.end)
}

export function suggestedGranularity(range: DateRange): 'daily' | 'weekly' | 'monthly' {
  const length = rangeLength(range)
  if (length <= 45) return 'daily'
  if (length <= 180) return 'weekly'
  return 'monthly'
}
