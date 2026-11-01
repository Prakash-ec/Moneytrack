import { Minus, Sparkles, TrendingDown, TrendingUp } from 'lucide-react'

import { formatINR, formatPercent } from '@/utils/currency'
import { cn } from '@/utils/cn'
import type { Direction } from '@/types/api'

export function ComparisonBadge({
  direction,
  changePercent,
  changePaise,
  showAmount = false,
  withContext = false,
  onDark = false,
  className,
}: {
  direction: Direction
  changePercent: number | null
  changePaise: number
  showAmount?: boolean
  withContext?: boolean
  onDark?: boolean
  className?: string
}) {
  const Icon =
    direction === 'up'
      ? TrendingUp
      : direction === 'down'
        ? TrendingDown
        : direction === 'new'
          ? Sparkles
          : Minus

  let label: string
  if (direction === 'new') label = 'New spending'
  else if (direction === 'none') label = 'No prior spending'
  else if (direction === 'flat') label = 'No change'
  else if (changePercent !== null) label = `${formatPercent(Math.abs(changePercent))}%`
  else label = formatINR(Math.abs(changePaise))

  const tone = onDark
    ? {
        up: 'border-white/15 bg-white/10 text-amber-100',
        down: 'border-white/15 bg-white/10 text-emerald-100',
        flat: 'border-white/15 bg-white/10 text-white/70',
        new: 'border-white/15 bg-white/10 text-white/80',
        none: 'border-white/15 bg-white/10 text-white/60',
      }[direction]
    : {
        up: 'border-warning/25 bg-warning/10 text-warning',
        down: 'border-positive/25 bg-positive/10 text-positive',
        flat: 'border-line bg-elevated text-muted',
        new: 'border-primary/20 bg-primary-soft text-primary',
        none: 'border-line bg-elevated text-subtle',
      }[direction]

  return (
    <span
      className={cn(
        'inline-flex flex-wrap items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold',
        tone,
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      <span>{label}</span>
      {showAmount && changePercent !== null && direction !== 'flat' ? (
        <span className="font-medium opacity-75">
          ({changePaise > 0 ? '+' : ''}
          {formatINR(changePaise)})
        </span>
      ) : null}
      {withContext ? <span className="font-medium opacity-70">vs previous period</span> : null}
    </span>
  )
}
