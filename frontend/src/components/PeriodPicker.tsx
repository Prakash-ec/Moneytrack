import { Calendar, Check, ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/FormControls'
import { isValidISODate } from '@/utils/dates'
import {
  PERIOD_OPTIONS,
  formatRangeLabel,
  type DateRange,
  type PeriodPreset,
} from '@/utils/periods'
import { cn } from '@/utils/cn'

export interface PeriodPickerProps {
  preset: PeriodPreset
  range: DateRange
  onPresetChange: (preset: PeriodPreset) => void
  onCustomChange: (start: string, end: string) => void
  className?: string
}

export function PeriodPicker({
  preset,
  range,
  onPresetChange,
  onCustomChange,
  className,
}: PeriodPickerProps) {
  const [open, setOpen] = useState(false)
  const [customStart, setCustomStart] = useState(range.start)
  const [customEnd, setCustomEnd] = useState(range.end)
  const [error, setError] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setCustomStart(range.start)
    setCustomEnd(range.end)
    setError(null)
  }, [range.start, range.end, preset])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const currentOption = PERIOD_OPTIONS.find((opt) => opt.value === preset)
  const label = preset === 'custom' ? formatRangeLabel(range) : (currentOption?.label ?? 'This month')

  const applyCustom = () => {
    if (!isValidISODate(customStart) || !isValidISODate(customEnd)) {
      setError('Choose valid dates.')
      return
    }
    if (customStart > customEnd) {
      setError('Start date must be before end date.')
      return
    }
    setError(null)
    onCustomChange(customStart, customEnd)
    setOpen(false)
  }

  return (
    <div className={cn('relative inline-block max-w-full', className)} ref={menuRef}>
      <button
        type="button"
        className="period-picker max-w-full"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <Calendar className="h-4 w-4 text-primary flex-shrink-0" aria-hidden="true" />
        <span className="truncate max-w-[150px] sm:max-w-none text-xs font-semibold">{label}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-muted transition-transform flex-shrink-0', open && 'rotate-180')} aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-32px)] rounded-lg border border-border bg-surface-raised p-1.5 shadow-lg animate-fade-in">
          <div className="grid gap-1">
            {PERIOD_OPTIONS.map((option) => {
              const selected = preset === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onPresetChange(option.value)
                    if (option.value !== 'custom') {
                      setOpen(false)
                    }
                  }}
                  className={cn(
                    'flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-colors text-left',
                    selected
                      ? 'bg-primary-soft text-primary font-semibold'
                      : 'text-muted hover:bg-surface-raised hover:text-text'
                  )}
                >
                  <span>{option.label}</span>
                  {selected && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                </button>
              )
            })}
          </div>

          {preset === 'custom' && (
            <div className="mt-2 border-t border-border pt-3 px-1 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-semibold text-muted mb-1">Start</label>
                  <Input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="w-full text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-muted mb-1">End</label>
                  <Input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="w-full text-xs"
                  />
                </div>
              </div>
              {error && <p className="text-[10px] text-danger">{error}</p>}
              <Button size="sm" variant="primary" className="w-full mt-2" onClick={applyCustom}>
                Apply Range
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
