import type { ReactNode } from 'react'

import { cn } from '@/utils/cn'

interface SegmentOption<T extends string> {
  value: T
  label: ReactNode
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  size = 'md',
  className,
}: {
  value: T
  options: Array<SegmentOption<T>>
  onChange: (value: T) => void
  ariaLabel: string
  size?: 'sm' | 'md'
  className?: string
}) {
  return (
    <div
      className={cn(
        'inline-flex w-full rounded-2xl border border-line bg-elevated p-1 sm:w-auto',
        className,
      )}
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={selected}
            className={cn(
              'flex-1 rounded-xl font-semibold transition sm:flex-none',
              size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-3.5 py-2 text-sm',
              selected
                ? 'bg-surface text-ink shadow-soft'
                : 'text-muted hover:text-ink',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
