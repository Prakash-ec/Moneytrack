import type { ReactNode } from 'react'

import { cn } from '@/utils/cn'

type BadgeTone = 'neutral' | 'primary' | 'positive' | 'warning' | 'danger' | 'archive'

const tones: Record<BadgeTone, string> = {
  neutral: 'border-line/60 bg-elevated text-muted',
  primary: 'border-primary/25 bg-primary-soft text-primary',
  positive: 'border-positive/25 bg-positive/10 text-positive',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  danger: 'border-danger/30 bg-danger/10 text-danger',
  archive: 'border-line/60 bg-elevated text-subtle',
}

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode
  tone?: BadgeTone
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-solid px-2.5 py-0.5 text-[11px] font-semibold leading-5',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
