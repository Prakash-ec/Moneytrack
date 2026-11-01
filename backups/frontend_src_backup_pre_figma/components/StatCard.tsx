import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/utils/cn'

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'default',
  className,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon: LucideIcon
  tone?: 'default' | 'primary' | 'warning'
  className?: string
}) {
  const tones = {
    default: 'bg-elevated/70 text-muted',
    primary: 'bg-primary-soft text-primary',
    warning: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400',
  }

  return (
    <div
      className={cn(
        'rounded-2xl border border-line/80 bg-surface p-4 shadow-card sm:p-5 transition hover:shadow-lift',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted">{label}</p>
        <span
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-lg',
            tones[tone],
          )}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </div>
      <p className="tabular mt-2 text-xl font-bold tracking-tight text-ink sm:text-2xl">
        {value}
      </p>
      {hint ? <div className="mt-1.5 text-xs text-muted truncate">{hint}</div> : null}
    </div>
  )
}
