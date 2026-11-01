import { CalendarDays, Check } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/FormControls'
import { isValidISODate } from '@/utils/dates'
import {
  PERIOD_OPTIONS,
  formatRangeLabel,
  type DateRange,
  type PeriodPreset,
} from '@/utils/periods'
import { cn } from '@/utils/cn'

interface PeriodPickerProps {
  preset: PeriodPreset
  range: DateRange
  onPresetChange: (preset: PeriodPreset) => void
  onCustomChange: (start: string, end: string) => void
}

export function PeriodPicker({
  preset,
  range,
  onPresetChange,
  onCustomChange,
}: PeriodPickerProps) {
  const [customStart, setCustomStart] = useState(range.start)
  const [customEnd, setCustomEnd] = useState(range.end)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setCustomStart(range.start)
    setCustomEnd(range.end)
    setError(null)
  }, [range.start, range.end, preset])

  const applyCustom = () => {
    if (!isValidISODate(customStart) || !isValidISODate(customEnd)) {
      setError('Choose a valid start and end date.')
      return
    }
    if (customStart > customEnd) {
      setError('The start date must be on or before the end date.')
      return
    }
    setError(null)
    onCustomChange(customStart, customEnd)
  }

  return (
    <section
      className="rounded-[1.25rem] border border-line/90 bg-surface p-4 shadow-soft sm:p-5"
      aria-label="Reporting period"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-3">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-subtle">
          <CalendarDays className="h-3.5 w-3.5 text-primary" aria-hidden />
          Reporting period
        </div>
        <p className="text-xs font-medium text-muted">{formatRangeLabel(range)}</p>
      </div>

      <div className="sm:hidden">
        <Select
          aria-label="Choose reporting period"
          value={preset}
          onChange={(event) => onPresetChange(event.target.value as PeriodPreset)}
        >
          {PERIOD_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="hidden flex-wrap gap-1.5 sm:flex">
        {PERIOD_OPTIONS.map((option) => {
          const selected = preset === option.value
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onPresetChange(option.value)}
              aria-pressed={selected}
              className={cn(
                'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[1rem] px-3 text-[11px] font-medium transition-all',
                selected
                  ? 'bg-primary text-primary-contrast shadow-soft'
                  : 'text-subtle hover:bg-elevated hover:text-ink',
              )}
            >
              {selected ? <Check className="h-3.5 w-3.5" aria-hidden /> : null}
              {option.label}
            </button>
          )
        })}
      </div>

      {preset === 'custom' ? (
        <div className="mt-3 border-t border-line pt-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">Start date</span>
              <Input
                type="date"
                value={customStart}
                onChange={(event) => setCustomStart(event.target.value)}
                aria-invalid={Boolean(error) || undefined}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">End date</span>
              <Input
                type="date"
                value={customEnd}
                onChange={(event) => setCustomEnd(event.target.value)}
                aria-invalid={Boolean(error) || undefined}
              />
            </label>
            <Button variant="secondary" onClick={applyCustom}>
              Apply range
            </Button>
          </div>
          {error ? (
            <p className="mt-2 text-xs font-medium text-danger" role="alert">
              {error}
            </p>
          ) : (
            <p className="mt-2 text-xs text-subtle">
              Both dates are inclusive. Historical entries are always supported.
            </p>
          )}
        </div>
      ) : null}
    </section>
  )
}
